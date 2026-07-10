const express = require('express');
const Groq = require('groq-sdk');
const crypto = require('crypto');
const { databases, DB_ID, sdk } = require('./db');
const { authenticateToken } = require('./auth');

const router = express.Router();

// Initialize Groq
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Helper for standardized logging
const log = (method, path, message, data = '') => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${method}] ${path} | ${message}`, data);
};

const DVA_DOMAINS = [
  {
    name: 'Domain 1 — Development with AWS Services',
    weight: 32,
    focus: 'Lambda (cold starts, concurrency, layers, event source mappings), API Gateway (proxy vs. custom integration, stage variables, usage plans), DynamoDB (partition key design, GSI/LSI, streams, DynamoDB Accelerator), SNS/SQS (fan-out patterns, FIFO vs. standard, dead-letter queues), Kinesis (shards, KCL, enhanced fan-out), Step Functions (Standard vs. Express), event-driven architecture, idempotency, stateless design, caching strategies.'
  },
  {
    name: 'Domain 2 — Security',
    weight: 26,
    focus: 'IAM (roles vs. access keys, least privilege, resource-based policies vs. identity-based policies, instance profiles), Amazon Cognito (User Pools vs. Identity Pools, hosted UI, JWT validation), AWS KMS (symmetric vs. asymmetric CMKs, envelope encryption, GenerateDataKey), AWS Secrets Manager (automatic rotation via Lambda, secret lifecycle), AWS STS (AssumeRole, temporary credentials, cross-account access), execution roles, SSL/TLS certificate management via ACM.'
  },
  {
    name: 'Domain 3 — Deployment',
    weight: 24,
    focus: 'AWS SAM (template structure, sam build/deploy), AWS CDK basics, CI/CD pipelines (CodeCommit, CodeBuild buildspec.yml, CodeDeploy appspec.yml, CodePipeline stages), deployment strategies (blue/green, canary, rolling, in-place), Lambda versions and aliases for traffic shifting, AWS Elastic Beanstalk (environment tiers, .ebextensions, rolling updates), Amazon ECS (task definitions, service auto-scaling, Fargate vs. EC2 launch type), CloudFormation (change sets, stack policies, cross-stack references).'
  },
  {
    name: 'Domain 4 — Troubleshooting and Optimization',
    weight: 18,
    focus: 'AWS X-Ray (segments, subsegments, sampling rules, annotations vs. metadata, service map), Amazon CloudWatch (custom metrics, embedded metric format, log groups, metric filters, CloudWatch Alarms, Container Insights), AWS CloudTrail (event history, data events vs. management events), identifying Lambda execution bottlenecks (duration, memory, timeout errors), resolving API Gateway HTTP 4xx/5xx errors, diagnosing Boto3 / AWS CLI credential errors (.aws/credentials, environment variable precedence), IAM permission debugging (AccessDenied errors).'
  }
];

const selectRandomDomain = () => {
  const rand = Math.floor(Math.random() * 100);
  if (rand < 32) return DVA_DOMAINS[0];
  if (rand < 58) return DVA_DOMAINS[1];
  if (rand < 82) return DVA_DOMAINS[2];
  return DVA_DOMAINS[3];
};

// --- ROUTES ---

// 1. Get dashboard stats
router.get('/dashboard', authenticateToken, async (req, res) => {
  log('GET', '/dashboard', `User: ${req.user.id}`);
  try {
    const examsRes = await databases.listDocuments(DB_ID, 'exams', [
      sdk.Query.equal('user_id', String(req.user.id)),
      sdk.Query.limit(100),
      sdk.Query.orderDesc('created_at')
    ]);

    const completedExams = examsRes.documents.filter(e => e.status !== 'in_progress');
    const totalCompleted = completedExams.length;

    let totalScore = 0;
    let bestScore = 0;
    let passedCount = 0;

    completedExams.forEach(e => {
      totalScore += e.score;
      if (e.score > bestScore) bestScore = e.score;
      if (e.status === 'pass') passedCount++;
    });

    const avgScore = totalCompleted > 0 ? Math.round(totalScore / totalCompleted) : 0;
    const passRate = totalCompleted > 0 ? Math.round((passedCount / totalCompleted) * 100) : 0;

    res.json({
      stats: {
        total_completed: totalCompleted,
        avg_score: avgScore,
        pass_rate: passRate,
        best_score: bestScore
      },
      recentExams: examsRes.documents.slice(0, 10)
    });
  } catch (err) {
    log('ERROR', '/dashboard', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Global locks for question generation to prevent race conditions
const generatingLocks = {};

// Helper to retrieve a question or generate it if it doesn't exist yet (fully locked)
const getOrGenerateQuestion = async (examId, questionIndex, examStatus) => {
  const lockKey = `${examId}_${questionIndex}`;

  // 1. Wait for active generation if there's a lock
  if (generatingLocks[lockKey]) {
    log('LOCK', 'getOrGenerateQuestion', `Waiting for active generation: ${lockKey}`);
    await generatingLocks[lockKey];
  }

  // 2. Check DB
  const existingQRes = await databases.listDocuments(DB_ID, 'exam_questions', [
    sdk.Query.equal('exam_id', examId),
    sdk.Query.equal('question_index', questionIndex)
  ]);

  if (existingQRes.documents.length > 0) {
    const q = existingQRes.documents[0];
    return {
      $id: q.$id,
      question_index: q.question_index,
      domain: q.domain,
      question: q.question_text,
      options: JSON.parse(q.options),
      correct: (examStatus !== 'in_progress' || q.selected_option) ? q.correct_option : undefined,
      selected_option: q.selected_option,
      explanation: (examStatus !== 'in_progress' || q.selected_option) ? q.explanation : undefined,
      user_explanation: q.user_explanation,
      understanding_score: q.understanding_score,
      mentor_feedback: q.mentor_feedback
    };
  }

  // 3. Create lock promise
  let resolveLock;
  generatingLocks[lockKey] = new Promise(resolve => {
    resolveLock = resolve;
  });

  try {
    const targetDomain = selectRandomDomain();
    log('AI_START', `Generate Question`, `Exam: ${examId}, Index: ${questionIndex}, Domain: ${targetDomain.name}`);

    const systemPrompt = `You are an elite AWS Certified Cloud Architect and Expert Certification Instructor specializing exclusively in the AWS Certified Developer - Associate (DVA-C02) examination. Your singular purpose is to generate rigorous, scenario-based, multiple-choice exam questions for a candidate preparing for this certification.

## ROLE AND BEHAVIORAL CONSTRAINTS
- Maintain a strictly professional, academic, and technical tone at all times.
- Do NOT use conversational filler or affirmations.
- NEVER hallucinate AWS services, API endpoints, IAM actions, or CLI commands. Every service and action must exist in current AWS documentation.
- Do NOT reference deprecated services (e.g., EC2-Classic, SimpleDB).
- Base all architectural reasoning strictly on the AWS Well-Architected Framework and current AWS technical documentation.

## QUESTION GENERATION RULES
### Scenario construction
- Frame every question as a real-world enterprise problem involving the specified domain focus areas: ${targetDomain.focus}.
- The scenario MUST require multi-service reasoning or architectural trade-off analysis — not simple factual recall or vocabulary definitions.
- Scenarios must be 3–6 sentences. Include specific technical constraints (e.g., "must minimize operational overhead", "must not require changes to the application code", "must maintain strict FIFO ordering").
- Do NOT use vague company names like "Company X". Use specific fictional names (e.g., "DataSprint Inc.", "NovaPay Solutions").

### Options construction
- Provide exactly 4 options labeled A, B, C, and D.
- **CRITICAL RELEVANCE REQUIREMENT**: Every single option (A, B, C, and D) MUST be customized and directly relevant to the specific technical context, constraints, and resources of the question's scenario. Do NOT generate generic options or options from unrelated AWS services. The options must represent 4 concrete alternative architectural designs or implementation steps to solve the exact problem posed in the scenario.
- Exactly ONE option must be fully correct and aligned with AWS best practices and the Well-Architected Framework.
- The THREE distractor options must be highly plausible and directly related to the scenario. They MUST use real AWS terminology but represent one of the following flaw types:
  - Suboptimal architecture with unnecessary administrative overhead
  - Technically impossible combination
  - Service confusion
  - Fatal IAM or permission logic error
  - Breaks a stated requirement in the scenario
- Options must be roughly equal in length and detail so that option length does not hint at the correct answer.
- If an option contains a JSON policy document, CLI command, or Python Boto3 code snippet, enclose it in a markdown triple-backtick code block with the appropriate language tag.

## OUTPUT FORMAT REQUIREMENT
Return ONLY JSON. Do not include markdown headers (like '---' or '#### Question'), do not include conversational preamble, and do not wrap in markdown json code fences. Output a valid JSON object matching this schema:
{
  "domain": "${targetDomain.name}",
  "question": "[3-6 sentence scenario. End the scenario paragraph with the exact question text: 'Which of the following options BEST satisfies the requirements?']",
  "options": {
    "A": "[Option A text]",
    "B": "[Option B text]",
    "C": "[Option C text]",
    "D": "[Option D text]"
  },
  "correct": "[Correct option letter: A, B, C, or D]",
  "explanation": {
    "overall": "[Detailed explanation stating why the correct option is correct and summarizing the logic]",
    "options": {
      "A": "[Explanation for Option A, starting with 'Incorrect. ' or 'Correct. ' and detailing why it is incorrect or correct, including references if applicable]",
      "B": "[Explanation for Option B, starting with 'Incorrect. ' or 'Correct. ' and detailing why it is incorrect or correct, including references if applicable]",
      "C": "[Explanation for Option C, starting with 'Incorrect. ' or 'Correct. ' and detailing why it is incorrect or correct, including references if applicable]",
      "D": "[Explanation for Option D, starting with 'Incorrect. ' or 'Correct. ' and detailing why it is incorrect or correct, including references if applicable]"
    }
  }
}`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate a unique question for index ${questionIndex} of this DVA-C02 exam session. Seed: ${Date.now()}` }
      ],
      response_format: { type: "json_object" },
      temperature: 0.75,
    });

    const responseText = completion.choices[0]?.message?.content || "";
    log('AI_END', `Generate Question`, 'Response received from Groq.');

    let questionData = JSON.parse(responseText);

    const explanationValue = typeof questionData.explanation === 'object' 
      ? JSON.stringify(questionData.explanation) 
      : JSON.stringify({ overall: questionData.explanation || '', options: null });

    const savedQ = await databases.createDocument(DB_ID, 'exam_questions', sdk.ID.unique(), {
      exam_id: examId,
      question_index: questionIndex,
      domain: questionData.domain || targetDomain.name,
      question_text: questionData.question,
      options: JSON.stringify(questionData.options),
      correct_option: questionData.correct,
      selected_option: '',
      explanation: explanationValue,
      user_explanation: '',
      understanding_score: 0,
      mentor_feedback: ''
    });

    resolveLock();
    delete generatingLocks[lockKey];

    return {
      $id: savedQ.$id,
      question_index: questionIndex,
      domain: savedQ.domain,
      question: savedQ.question_text,
      options: questionData.options,
      correct: (examStatus !== 'in_progress' || savedQ.selected_option) ? savedQ.correct_option : undefined,
      selected_option: savedQ.selected_option,
      explanation: (examStatus !== 'in_progress' || savedQ.selected_option) ? savedQ.explanation : undefined
    };
  } catch (err) {
    resolveLock();
    delete generatingLocks[lockKey];
    throw err;
  }
};

// Pregenerates a window of questions in the background
const triggerBackgroundPregen = (examId, startIndex, totalQuestions, examStatus = 'in_progress') => {
  const windowSize = 5;
  const endIndex = Math.min(startIndex + windowSize, totalQuestions);

  log('PREGEN', `Triggering background pregen for exam ${examId} from index ${startIndex} to ${endIndex - 1}`);

  for (let idx = startIndex; idx < endIndex; idx++) {
    getOrGenerateQuestion(examId, idx, examStatus)
      .then(() => log('PREGEN_SUCCESS', `Background pregen index ${idx} complete for exam ${examId}`))
      .catch(err => console.error(`[Background Pregen Error] Index ${idx} on exam ${examId}:`, err.message));
  }
};

// 2. Start a new exam session
router.post('/exams/start', authenticateToken, async (req, res) => {
  const { totalQuestions = 65 } = req.body;
  const numQuestions = parseInt(totalQuestions, 10);
  log('POST', '/exams/start', `User: ${req.user.id}, Questions: ${numQuestions}`);

  try {
    const exam = await databases.createDocument(DB_ID, 'exams', sdk.ID.unique(), {
      user_id: String(req.user.id),
      score: 0,
      status: 'in_progress',
      time_taken: 0,
      total_questions: numQuestions,
      correct_answers: 0,
      created_at: new Date().toISOString()
    });

    // Pregenerate first batch of questions in background immediately (first 5 questions)
    triggerBackgroundPregen(exam.$id, 0, numQuestions, 'in_progress');

    res.json({ exam });
  } catch (err) {
    log('ERROR', '/exams/start', err.stack);
    res.status(500).json({ error: 'Failed to start exam simulation' });
  }
});

// Custom Quiz Import Parser
const parseQuizText = (text) => {
  const questions = [];
  const regex = /QUESTION\s+(\d+)\s*\|/gi;
  let match;
  const positions = [];
  
  while ((match = regex.exec(text)) !== null) {
    positions.push({
      index: match.index,
      number: match[1]
    });
  }
  
  if (positions.length === 0) {
    return [];
  }
  
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].index;
    const end = (i + 1 < positions.length) ? positions[i + 1].index : text.length;
    const part = text.substring(start, end).trim();
    
    const lines = part.split('\n');
    const headerLine = lines[0];
    
    const headerMatch = headerLine.match(/QUESTION\s+(\d+)\s*\|\s*Difficulty:\s*([^|]+?)(?:\s*\|\s*Domain:\s*([^|]+?))?(?:\s*\|\s*Subdomain:\s*(.+))?$/i);
    
    let qNum = parseInt(positions[i].number) - 1;
    let difficulty = 'Medium';
    let domain = 'General';
    let subdomain = '';
    
    if (headerMatch) {
      qNum = parseInt(headerMatch[1]) - 1;
      difficulty = headerMatch[2].trim();
      domain = headerMatch[3] ? headerMatch[3].trim() : 'General';
      subdomain = headerMatch[4] ? headerMatch[4].trim() : '';
    }
    
    const bodyText = lines.slice(1).join('\n');
    
    let scenario = '';
    let questionPrompt = '';
    
    const scenarioMatch = bodyText.match(/SCENARIO:\s*([\s\S]*?)(?=QUESTION:)/i);
    const questionPromptMatch = bodyText.match(/QUESTION:\s*([\s\S]*?)(?=\b[A-D]\.\s)/i);
    
    if (scenarioMatch && questionPromptMatch) {
      scenario = scenarioMatch[1].trim();
      questionPrompt = questionPromptMatch[1].trim();
    } else {
      const fallbackPromptMatch = bodyText.match(/^([\s\S]*?)(?=\b[A-D]\.\s)/i);
      if (fallbackPromptMatch) {
        questionPrompt = fallbackPromptMatch[1].trim();
      } else {
        questionPrompt = bodyText;
      }
    }
    
    const questionText = scenario 
      ? `SCENARIO:\n${scenario}\n\nQUESTION:\n${questionPrompt}`
      : questionPrompt;
      
    const options = {};
    const optAMatch = bodyText.match(/\bA\.\s+([\s\S]*?)(?=\bB\.\s+)/i);
    const optBMatch = bodyText.match(/\bB\.\s+([\s\S]*?)(?=\bC\.\s+)/i);
    const optCMatch = bodyText.match(/\bC\.\s+([\s\S]*?)(?=\bD\.\s+)/i);
    const optDMatch = bodyText.match(/\bD\.\s+([\s\S]*?)(?=\bCORRECT\b)/i);
    
    if (optAMatch) options['A'] = optAMatch[1].trim();
    if (optBMatch) options['B'] = optBMatch[1].trim();
    if (optCMatch) options['C'] = optCMatch[1].trim();
    if (optDMatch) {
      options['D'] = optDMatch[1].trim();
    } else {
      const optDMatchFallback = bodyText.match(/\bD\.\s+([\s\S]*?)(?=\n\s*\n|\bWHY THIS IS CORRECT\b|$)/i);
      if (optDMatchFallback) options['D'] = optDMatchFallback[1].trim();
    }
    
    // Line-by-line fallback if options are empty
    if (!options['A'] || !options['B']) {
      let currentKey = null;
      for (const line of lines) {
        const trimmed = line.trim();
        const optMatch = trimmed.match(/^([A-D])\.\s+(.+)$/i);
        if (optMatch) {
          currentKey = optMatch[1].toUpperCase();
          options[currentKey] = optMatch[2].trim();
        } else if (currentKey && trimmed && !trimmed.startsWith('QUESTION') && !trimmed.startsWith('CORRECT')) {
          options[currentKey] += '\n' + trimmed;
        } else if (trimmed.startsWith('CORRECT')) {
          currentKey = null;
        }
      }
    }
    
    let correctOption = 'A';
    const correctMatch = bodyText.match(/CORRECT(?: ANSWER)?:\s*([A-D])/i);
    if (correctMatch) {
      correctOption = correctMatch[1].trim().toUpperCase();
    }
    
    let whyCorrect = '';
    const whyCorrectMatch = bodyText.match(/WHY THIS IS CORRECT:\s*([\s\S]*?)(?=WHY THE OTHERS ARE WRONG:|EXAM TRICK:|GOLD JACKET INSIGHT:|MEMORY HOOK:|$)/i);
    if (whyCorrectMatch) {
      whyCorrect = whyCorrectMatch[1].trim();
    }
    
    let whyWrong = '';
    const whyWrongMatch = bodyText.match(/WHY THE OTHERS ARE WRONG:\s*([\s\S]*?)(?=EXAM TRICK:|GOLD JACKET INSIGHT:|MEMORY HOOK:|$)/i);
    if (whyWrongMatch) {
      whyWrong = whyWrongMatch[1].trim();
    }
    
    let examTrick = '';
    const examTrickMatch = bodyText.match(/EXAM TRICK:\s*([\s\S]*?)(?=GOLD JACKET INSIGHT:|MEMORY HOOK:|$)/i);
    if (examTrickMatch) {
      examTrick = examTrickMatch[1].trim();
    }
    
    let goldJacket = '';
    const goldJacketMatch = bodyText.match(/GOLD JACKET INSIGHT:\s*([\s\S]*?)(?=MEMORY HOOK:|$)/i);
    if (goldJacketMatch) {
      goldJacket = goldJacketMatch[1].trim();
    }
    
    let memoryHook = '';
    const memoryHookMatch = bodyText.match(/MEMORY HOOK:\s*([\s\S]*?)$/i);
    if (memoryHookMatch) {
      memoryHook = memoryHookMatch[1].trim();
    }
    
    const optionsExplanations = {};
    if (correctOption && whyCorrect) {
      optionsExplanations[correctOption] = `Correct. ${whyCorrect}`;
    }
    
    if (whyWrong) {
      const wrongKeys = ['A', 'B', 'C', 'D'].filter(k => k !== correctOption);
      for (const k of wrongKeys) {
        const regex = new RegExp(`\\b${k}\\.\\s*([\\s\\S]*?)(?=\\b[A-D]\\.\\s|$)`, 'i');
        const match = whyWrong.match(regex);
        if (match) {
          optionsExplanations[k] = `Incorrect. ${match[1].trim()}`;
        }
      }
    }
    
    let overallExplanation = '';
    if (whyCorrect) {
      overallExplanation += `### WHY THIS IS CORRECT:\n${whyCorrect}\n\n`;
    }
    if (whyWrong) {
      overallExplanation += `### WHY THE OTHERS ARE WRONG:\n${whyWrong}\n\n`;
    }
    if (examTrick) {
      overallExplanation += `### EXAM TRICK:\n${examTrick}\n\n`;
    }
    if (goldJacket) {
      overallExplanation += `### GOLD JACKET INSIGHT:\n${goldJacket}\n\n`;
    }
    if (memoryHook) {
      overallExplanation += `### MEMORY HOOK:\n${memoryHook}\n`;
    }
    overallExplanation = overallExplanation.trim();
    
    if (!overallExplanation) {
      const fallbackExplMatch = bodyText.match(/CORRECT(?: ANSWER)?:\s*[A-D]\s*([\s\S]*)$/i);
      if (fallbackExplMatch) {
        overallExplanation = fallbackExplMatch[1].trim();
      }
    }
    
    const explanationJson = {
      overall: overallExplanation,
      options: optionsExplanations
    };
    
    questions.push({
      question_index: qNum,
      domain: `${domain}${subdomain ? ' — ' + subdomain : ''}`,
      question_text: questionText,
      options: JSON.stringify(options),
      correct_option: correctOption,
      explanation: JSON.stringify(explanationJson),
      difficulty: difficulty
    });
  }
  
  return questions;
};

// --- Import helpers ---

// Appwrite attribute limit for explanation field is 5000 chars.
// We keep a safe buffer of 200 chars and truncate anything beyond 4800.
const EXPLANATION_MAX_CHARS = 4800;
const truncateExplanation = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  if (raw.length <= EXPLANATION_MAX_CHARS) return raw;
  return raw.slice(0, EXPLANATION_MAX_CHARS) + '… [truncated]';
};

// Write questions in parallel batches of BATCH_SIZE while preserving insertion order.
// Throws immediately if any write fails so the caller can rollback.
const IMPORT_BATCH_SIZE = 5;
const writeQuestionBatch = async (examId, batch) => {
  await Promise.all(
    batch.map((q) =>
      databases.createDocument(DB_ID, 'exam_questions', sdk.ID.unique(), {
        exam_id: examId,
        question_index: q.question_index,
        domain: q.domain,
        question_text: q.question_text,
        options: q.options,
        correct_option: q.correct_option,
        selected_option: '',
        explanation: truncateExplanation(q.explanation),
        user_explanation: '',
        understanding_score: 0,
        mentor_feedback: ''
      })
    )
  );
};

// 3. Import a custom quiz from text pad
router.post('/exams/import', authenticateToken, async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text content is required' });
  }

  log('POST', '/exams/import', `User: ${req.user.id}, Text length: ${text.length}`);

  let exam = null; // hold reference for rollback

  try {
    const parsedQuestions = parseQuizText(text);
    if (parsedQuestions.length === 0) {
      return res.status(400).json({ error: 'Could not parse any valid questions from the provided text. Make sure it contains "QUESTION X" headers.' });
    }

    // ── 1. Sort and normalise indices so order is always guaranteed ──────────
    parsedQuestions.sort((a, b) => a.question_index - b.question_index);
    parsedQuestions.forEach((q, i) => { q.question_index = i; });

    // ── 2. Create the exam document (anchor for consistency) ─────────────────
    exam = await databases.createDocument(DB_ID, 'exams', sdk.ID.unique(), {
      user_id: String(req.user.id),
      score: 0,
      status: 'in_progress',
      time_taken: 0,
      total_questions: parsedQuestions.length,
      correct_answers: 0,
      created_at: new Date().toISOString()
    });

    log('POST', '/exams/import', `Exam created: ${exam.$id}. Writing ${parsedQuestions.length} questions in batches of ${IMPORT_BATCH_SIZE}...`);

    // ── 3. Batch-write all questions — parallel within batch, sequential across
    //       batches so order is preserved and Appwrite rate-limits are respected.
    //       Tight coupling: any failure aborts and triggers full rollback. ─────
    for (let i = 0; i < parsedQuestions.length; i += IMPORT_BATCH_SIZE) {
      const batch = parsedQuestions.slice(i, i + IMPORT_BATCH_SIZE);
      log('POST', '/exams/import', `Writing batch ${Math.floor(i / IMPORT_BATCH_SIZE) + 1}/${Math.ceil(parsedQuestions.length / IMPORT_BATCH_SIZE)} (indices ${i}–${i + batch.length - 1})`);
      await writeQuestionBatch(exam.$id, batch);
    }

    log('POST', '/exams/import', `All ${parsedQuestions.length} questions saved for exam ${exam.$id}`);
    res.json({ success: true, examId: exam.$id, totalQuestions: parsedQuestions.length });

  } catch (err) {
    log('ERROR', '/exams/import', err.stack);

    // ── Rollback: delete the exam document so the DB stays consistent ────────
    if (exam?.$id) {
      try {
        await databases.deleteDocument(DB_ID, 'exams', exam.$id);
        log('ROLLBACK', '/exams/import', `Rolled back exam ${exam.$id} after write failure`);
      } catch (rollbackErr) {
        log('ROLLBACK_ERR', '/exams/import', `Failed to rollback exam ${exam.$id}: ${rollbackErr.message}`);
      }
    }

    res.status(500).json({ error: 'Failed to import quiz — all changes have been rolled back. Please try again.' });
  }
});

// 4. Get list of user exams
router.get('/exams', authenticateToken, async (req, res) => {
  log('GET', '/exams', `User: ${req.user.id}`);
  try {
    const examsRes = await databases.listDocuments(DB_ID, 'exams', [
      sdk.Query.equal('user_id', String(req.user.id)),
      sdk.Query.limit(100),
      sdk.Query.orderDesc('created_at')
    ]);
    res.json({ exams: examsRes.documents });
  } catch (err) {
    log('ERROR', '/exams', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// 4. Get a specific exam by ID
router.get('/exams/:examId', authenticateToken, async (req, res) => {
  const { examId } = req.params;
  log('GET', `/exams/${examId}`, `User: ${req.user.id}`);
  try {
    const exam = await databases.getDocument(DB_ID, 'exams', examId);
    if (exam.user_id !== String(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized access to this exam.' });
    }
    
    // Fetch all answered questions for this exam
    const questionsRes = await databases.listDocuments(DB_ID, 'exam_questions', [
      sdk.Query.equal('exam_id', examId),
      sdk.Query.limit(100),
      sdk.Query.orderAsc('question_index')
    ]);

    res.json({ exam, questions: questionsRes.documents });
  } catch (err) {
    log('ERROR', `/exams/${examId}`, err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// 5. Get or generate question X of an exam
router.get('/exams/:examId/questions/:index', authenticateToken, async (req, res) => {
  const { examId, index } = req.params;
  const questionIndex = parseInt(index, 10);
  log('GET', `/exams/${examId}/questions/${index}`, `User: ${req.user.id}`);

  try {
    const exam = await databases.getDocument(DB_ID, 'exams', examId);
    if (exam.user_id !== String(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    if (questionIndex < 0 || questionIndex >= exam.total_questions) {
      return res.status(400).json({ error: 'Invalid question index' });
    }

    // Get or generate this question
    const question = await getOrGenerateQuestion(examId, questionIndex, exam.status);

    // Trigger pregeneration for the next 5 questions in the background
    if (exam.status === 'in_progress') {
      triggerBackgroundPregen(examId, questionIndex + 1, exam.total_questions, exam.status);
    }

    res.json({
      question,
      examStatus: exam.status
    });

  } catch (err) {
    log('ERROR', `/exams/${examId}/questions/${index}`, err.stack);
    res.status(500).json({ error: 'Failed to load question' });
  }
});

// 6. Save answer for a question
router.post('/exams/:examId/questions/:index/answer', authenticateToken, async (req, res) => {
  const { examId, index } = req.params;
  const { selectedOption } = req.body;
  const questionIndex = parseInt(index, 10);
  log('POST', `/exams/${examId}/questions/${index}/answer`, `User: ${req.user.id}, Selected: ${selectedOption}`);

  try {
    const exam = await databases.getDocument(DB_ID, 'exams', examId);
    if (exam.user_id !== String(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (exam.status !== 'in_progress') {
      return res.status(400).json({ error: 'Exam is already submitted and locked.' });
    }

    // Find question
    const qRes = await databases.listDocuments(DB_ID, 'exam_questions', [
      sdk.Query.equal('exam_id', examId),
      sdk.Query.equal('question_index', questionIndex)
    ]);

    if (qRes.documents.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const updatedQ = await databases.updateDocument(DB_ID, 'exam_questions', qRes.documents[0].$id, {
      selected_option: selectedOption
    });

    res.json({ 
      success: true, 
      selected_option: updatedQ.selected_option,
      correct: updatedQ.correct_option,
      explanation: updatedQ.explanation
    });
  } catch (err) {
    log('ERROR', `/exams/${examId}/questions/${index}/answer`, err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// 7. Submit exam session
router.post('/exams/:examId/submit', authenticateToken, async (req, res) => {
  const { examId } = req.params;
  const { timeTaken } = req.body;
  log('POST', `/exams/${examId}/submit`, `User: ${req.user.id}, TimeTaken: ${timeTaken}`);

  try {
    const exam = await databases.getDocument(DB_ID, 'exams', examId);
    if (exam.user_id !== String(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (exam.status !== 'in_progress') {
      return res.json({ exam });
    }

    // Fetch all generated questions for this exam
    const questionsRes = await databases.listDocuments(DB_ID, 'exam_questions', [
      sdk.Query.equal('exam_id', examId),
      sdk.Query.limit(100)
    ]);

    const questions = questionsRes.documents;
    let correctAnswers = 0;

    questions.forEach(q => {
      if (q.selected_option === q.correct_option) {
        correctAnswers++;
      }
    });

    const score = Math.round((correctAnswers / exam.total_questions) * 100);
    const status = score >= 72 ? 'pass' : 'fail'; // 72% passing threshold (720/1000)

    const updatedExam = await databases.updateDocument(DB_ID, 'exams', examId, {
      status,
      score,
      correct_answers: correctAnswers,
      time_taken: parseInt(timeTaken, 10)
    });

    res.json({ exam: updatedExam });
  } catch (err) {
    log('ERROR', `/exams/${examId}/submit`, err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// 8. Stream AI Mentor evaluation during review
router.post('/exams/:examId/questions/:index/evaluate', authenticateToken, async (req, res) => {
  const { examId, index } = req.params;
  const { userExplanation } = req.body;
  const questionIndex = parseInt(index, 10);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  log('POST', `/exams/${examId}/questions/${index}/evaluate`, `User: ${req.user.id}`);

  try {
    const exam = await databases.getDocument(DB_ID, 'exams', examId);
    if (exam.user_id !== String(req.user.id)) {
      return res.end("Unauthorized");
    }

    const qRes = await databases.listDocuments(DB_ID, 'exam_questions', [
      sdk.Query.equal('exam_id', examId),
      sdk.Query.equal('question_index', questionIndex)
    ]);

    if (qRes.documents.length === 0) {
      return res.end("Question not found");
    }

    const question = qRes.documents[0];

    const systemPrompt = `You are an AWS Certified Developer Associate (DVA-C02) exam mentor. The candidate has answered a question and provided their explanation/reasoning.
Evaluate their thought process based on their explanation and provide a detailed analysis in the style of an official AWS Skill Builder practice set explanation.

Question: ${question.question_text}
Options: ${question.options}
Correct Answer: ${question.correct_option}
User's Choice: ${question.selected_option || 'None'}
User's Explanation: "${userExplanation}"

Your response must be structured exactly as follows:
- **Candidate Explanation Evaluation**: Analyze the user's explanation directly. Tell them why their thought process is on the right track or where they misunderstood concepts. Be encouraging but technically precise.
- **AWS Skill Builder Explanation (Option Analysis)**:
  - **Option A is [Correct/Incorrect]** because... [Provide technical details based on AWS documentation]
  - **Option B is [Correct/Incorrect]** because...
  - **Option C is [Correct/Incorrect]** because...
  - **Option D is [Correct/Incorrect]** because...

At the very end of your response, on a new line, output EXACTLY this format:
[[SCORE: X]]
where X is an integer from 0 to 100 representing their understanding score based on their explanation (give partial credit for good reasoning even if the final choice was wrong, and deduct if they guessed the right answer for the wrong reason).
Do not include JSON or markdown code blocks for the score, just plain text.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: systemPrompt }],
      stream: true,
      temperature: 0.5,
    });

    let fullResponse = "";

    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content || '';
      fullResponse += content;
      res.write(content);
    }

    // Extract score
    const scoreMatch = fullResponse.match(/\[\[SCORE:\s*(\d+)\]\]/);
    let understandingScore = 0;
    if (scoreMatch) {
      understandingScore = parseInt(scoreMatch[1], 10);
    }
    const cleanFeedback = fullResponse.replace(/\[\[SCORE:\s*\d+\]\]/, '').trim();

    // Async DB update
    (async () => {
      try {
        await databases.updateDocument(DB_ID, 'exam_questions', question.$id, {
          user_explanation: userExplanation,
          understanding_score: understandingScore,
          mentor_feedback: cleanFeedback
        });
      } catch (dbErr) {
        log('ERROR', `/exams/${examId}/questions/${index}/evaluate (DB Async)`, dbErr.message);
      }
    })();

    res.end();
  } catch (err) {
    log('ERROR', `/exams/${examId}/questions/${index}/evaluate`, err.message);
    res.end("\nError generating evaluation.");
  }
});

// 9. Leaderboard ranked by passed exams
router.get('/leaderboard', authenticateToken, async (req, res) => {
  log('GET', '/leaderboard', 'Fetching top 20 players by exams passed');
  try {
    const usersRes = await databases.listDocuments(DB_ID, 'users', [sdk.Query.limit(100)]);
    const examsRes = await databases.listDocuments(DB_ID, 'exams', [
      sdk.Query.limit(1000)
    ]);

    const userScores = {};
    usersRes.documents.forEach(u => {
      userScores[u.$id] = { name: u.name, exams_passed: 0, total_completed: 0, total_score: 0 };
    });

    examsRes.documents.forEach(e => {
      if (e.status !== 'in_progress' && userScores[e.user_id]) {
        userScores[e.user_id].total_completed++;
        userScores[e.user_id].total_score += e.score;
        if (e.status === 'pass') {
          userScores[e.user_id].exams_passed++;
        }
      }
    });

    const leaderboard = Object.values(userScores)
      .map(u => ({
        name: u.name,
        exams_passed: u.exams_passed,
        total_completed: u.total_completed,
        avg_score: u.total_completed > 0 ? Math.round(u.total_score / u.total_completed) : 0
      }))
      .sort((a, b) => {
        if (b.exams_passed !== a.exams_passed) {
          return b.exams_passed - a.exams_passed;
        }
        return b.avg_score - a.avg_score;
      })
      .slice(0, 20);

    res.json({ leaderboard });
  } catch (err) {
    log('ERROR', '/leaderboard', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;