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

// 2. Start a new exam session
router.post('/exams/start', authenticateToken, async (req, res) => {
  const { totalQuestions = 65 } = req.body;
  log('POST', '/exams/start', `User: ${req.user.id}, Questions: ${totalQuestions}`);

  try {
    const exam = await databases.createDocument(DB_ID, 'exams', sdk.ID.unique(), {
      user_id: String(req.user.id),
      score: 0,
      status: 'in_progress',
      time_taken: 0,
      total_questions: parseInt(totalQuestions, 10),
      correct_answers: 0,
      created_at: new Date().toISOString()
    });

    res.json({ exam });
  } catch (err) {
    log('ERROR', '/exams/start', err.stack);
    res.status(500).json({ error: 'Failed to start exam simulation' });
  }
});

// 3. Get list of user exams
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

    // 1. Check if the question already exists in database
    const existingQRes = await databases.listDocuments(DB_ID, 'exam_questions', [
      sdk.Query.equal('exam_id', examId),
      sdk.Query.equal('question_index', questionIndex)
    ]);

    if (existingQRes.documents.length > 0) {
      const q = existingQRes.documents[0];
      return res.json({
        question: {
          $id: q.$id,
          question_index: q.question_index,
          domain: q.domain,
          question: q.question_text,
          options: JSON.parse(q.options),
          correct: (exam.status !== 'in_progress' || q.selected_option) ? q.correct_option : undefined, // Hide correct answer if exam is active and unanswered
          selected_option: q.selected_option,
          explanation: (exam.status !== 'in_progress' || q.selected_option) ? q.explanation : undefined,
          user_explanation: q.user_explanation,
          understanding_score: q.understanding_score,
          mentor_feedback: q.mentor_feedback
        },
        examStatus: exam.status
      });
    }

    // 2. Generate new question using Groq and DVA-C02 constraints
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
- Exactly ONE option must be fully correct and aligned with AWS best practices and the Well-Architected Framework.
- The THREE distractor options must be highly plausible. They MUST use real AWS terminology but represent one of the following flaw types:
  - Suboptimal architecture with unnecessary administrative overhead
  - Technically impossible combination
  - Service confusion
  - Fatal IAM or permission logic error
  - Breaks a stated requirement
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

    let questionData;
    try {
      questionData = JSON.parse(responseText);
    } catch (e) {
      log('PARSE_ERROR', `Generate Question`, 'AI response was not valid JSON', responseText);
      return res.status(500).json({ error: 'Failed to parse question from AI' });
    }

    const explanationValue = typeof questionData.explanation === 'object' 
      ? JSON.stringify(questionData.explanation) 
      : JSON.stringify({ overall: questionData.explanation || '', options: null });

    // Save generated question to DB
    const savedQ = await databases.createDocument(DB_ID, 'exam_questions', sdk.ID.unique(), {
      exam_id: examId,
      question_index: questionIndex,
      domain: questionData.domain || targetDomain.name,
      question_text: questionData.question,
      options: JSON.stringify(questionData.options),
      correct_option: questionData.correct,
      selected_option: '', // unanswered initially
      explanation: explanationValue,
      user_explanation: '',
      understanding_score: 0,
      mentor_feedback: ''
    });

    res.json({
      question: {
        $id: savedQ.$id,
        question_index: questionIndex,
        domain: savedQ.domain,
        question: savedQ.question_text,
        options: questionData.options,
        correct: (exam.status !== 'in_progress' || savedQ.selected_option) ? savedQ.correct_option : undefined,
        selected_option: savedQ.selected_option,
        explanation: (exam.status !== 'in_progress' || savedQ.selected_option) ? savedQ.explanation : undefined
      },
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