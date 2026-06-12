const express = require('express');
const Groq = require('groq-sdk'); // Switched to Groq
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

const AWS_SERVICES = {
  ec2: { name: 'Amazon EC2', category: 'Compute', color: '#FF9900' },
  ecr: { name: 'Amazon ECR', category: 'Containers', color: '#FF9900' },
  ecs: { name: 'Amazon ECS', category: 'Containers', color: '#FF9900' },
  beanstalk: { name: 'AWS Elastic Beanstalk', category: 'Compute', color: '#FF9900' },
  lambda: { name: 'AWS Lambda', category: 'Serverless', color: '#FF9900' },
  elb: { name: 'Elastic Load Balancing', category: 'Networking', color: '#8C4FFF' },
  cloudfront: { name: 'Amazon CloudFront', category: 'Networking', color: '#8C4FFF' },
  kinesis: { name: 'Amazon Kinesis', category: 'Analytics', color: '#8C4FFF' },
  route53: { name: 'Amazon Route 53', category: 'Networking', color: '#8C4FFF' },
  s3: { name: 'Amazon S3', category: 'Storage', color: '#3F8624' },
  rds: { name: 'Amazon RDS', category: 'Database', color: '#3F51B5' },
  aurora: { name: 'Amazon Aurora', category: 'Database', color: '#3F51B5' },
  dynamodb: { name: 'Amazon DynamoDB', category: 'Database', color: '#E91E63' },
  elasticache: { name: 'Amazon ElastiCache', category: 'Database', color: '#E91E63' },
  sqs: { name: 'Amazon SQS', category: 'Messaging', color: '#E91E63' },
  sns: { name: 'Amazon SNS', category: 'Messaging', color: '#E91E63' },
  stepfunctions: { name: 'AWS Step Functions', category: 'Integration', color: '#FF9900' },
  autoscaling: { name: 'Auto Scaling', category: 'Compute', color: '#FF9900' },
  apigateway: { name: 'Amazon API Gateway', category: 'Networking', color: '#3F51B5' },
  ses: { name: 'Amazon SES', category: 'Messaging', color: '#3F51B5' },
  cognito: { name: 'Amazon Cognito', category: 'Security', color: '#E91E63' },
  iam: { name: 'IAM', category: 'Security', color: '#E91E63' },
  cloudwatch: { name: 'Amazon CloudWatch', category: 'Management', color: '#E91E63' },
  systemsmanager: { name: 'AWS Systems Manager', category: 'Management', color: '#E91E63' },
  cloudformation: { name: 'AWS CloudFormation', category: 'Management', color: '#E91E63' },
  cloudtrail: { name: 'AWS CloudTrail', category: 'Management', color: '#E91E63' },
  codecommit: { name: 'AWS CodeCommit', category: 'DevOps', color: '#3F51B5' },
  codebuild: { name: 'AWS CodeBuild', category: 'DevOps', color: '#3F51B5' },
  codedeploy: { name: 'AWS CodeDeploy', category: 'DevOps', color: '#3F51B5' },
  codepipeline: { name: 'AWS CodePipeline', category: 'DevOps', color: '#3F51B5' },
  xray: { name: 'AWS X-Ray', category: 'Developer Tools', color: '#3F51B5' },
  kms: { name: 'AWS KMS', category: 'Security', color: '#E91E63' },
};

const DIFFICULTY_LEVELS = ['foundation', 'associate', 'advanced', 'expert'];

const getDifficultyPrompt = (difficulty, service) => {
  const prompts = {
    foundation: `Basic concepts, definitions, and fundamental use cases of ${service}.`,
    associate: `Intermediate scenarios, integration patterns, and practical usage of ${service}.`,
    advanced: `Complex architectural decisions, edge cases, and performance optimization of ${service}.`,
    expert: `Expert-level security hardening and disaster recovery for ${service}.`,
  };
  return prompts[difficulty];
};

// --- ROUTES ---

router.get('/services', authenticateToken, async (req, res) => {
  log('GET', '/services', `Fetching services for user: ${req.user.id}`);
  try {
    const progressResult = await databases.listDocuments(DB_ID, 'service_progress', [
      sdk.Query.equal('user_id', String(req.user.id)),
      sdk.Query.limit(100)
    ]);
    
    log('GET', '/services', `Found ${progressResult.documents.length} progress records.`);

    const progressMap = {};
    progressResult.documents.forEach(row => { progressMap[row.service_id] = row; });

    const services = Object.entries(AWS_SERVICES).map(([id, info]) => ({
      id,
      ...info,
      progress: progressMap[id] || null,
    }));

    res.json({ services });
  } catch (err) {
    log('ERROR', '/services', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/services/:serviceId/progress', authenticateToken, async (req, res) => {
  const { serviceId } = req.params;
  log('GET', `/services/${serviceId}/progress`, `User: ${req.user.id}`);

  if (!AWS_SERVICES[serviceId]) {
    log('WARN', `/services/${serviceId}/progress`, 'Service ID not found in mapping.');
    return res.status(404).json({ error: 'Service not found' });
  }

  try {
    const progRes = await databases.listDocuments(DB_ID, 'service_progress', [
      sdk.Query.equal('user_id', String(req.user.id)),
      sdk.Query.equal('service_id', serviceId)
    ]);

    const histRes = await databases.listDocuments(DB_ID, 'question_history', [
      sdk.Query.equal('user_id', String(req.user.id)),
      sdk.Query.equal('service_id', serviceId),
      sdk.Query.orderDesc('asked_at'),
      sdk.Query.limit(20)
    ]);
    
    log('GET', `/services/${serviceId}/progress`, `Returning ${histRes.documents.length} history items.`);
    res.json({ progress: progRes.documents[0] || null, history: histRes.documents });
  } catch (err) {
    log('ERROR', `/services/${serviceId}/progress`, err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/services/:serviceId/question', authenticateToken, async (req, res) => {
  const { serviceId } = req.params;
  const { previousResult } = req.body;
  log('POST', `/services/${serviceId}/question`, `User: ${req.user.id}, PrevResult: ${previousResult}`);

  if (!AWS_SERVICES[serviceId]) return res.status(404).json({ error: 'Service not found' });

  try {
    let progRes = await databases.listDocuments(DB_ID, 'service_progress', [
      sdk.Query.equal('user_id', String(req.user.id)),
      sdk.Query.equal('service_id', serviceId)
    ]);

    let progress = progRes.documents[0];
    if (!progress) {
      log('INFO', `/services/${serviceId}/question`, 'First time playing. Creating progress record.');
      progress = await databases.createDocument(DB_ID, 'service_progress', sdk.ID.unique(), {
        user_id: String(req.user.id),
        service_id: serviceId,
        service_name: AWS_SERVICES[serviceId].name,
        current_difficulty: 'foundation',
        questions_attempted: 0,
        questions_correct: 0,
        consecutive_correct: 0,
        consecutive_wrong: 0,
        best_streak: 0,
        current_streak: 0,
        total_score: 0,
        is_completed: false
      });
    }

    if (previousResult !== undefined) {
      let { consecutive_correct, consecutive_wrong, current_difficulty } = progress;
      const diffIdx = DIFFICULTY_LEVELS.indexOf(current_difficulty);

      if (previousResult === true) {
        consecutive_correct = (consecutive_correct || 0) + 1;
        consecutive_wrong = 0;
        if (consecutive_correct >= 8 && diffIdx < DIFFICULTY_LEVELS.length - 1) {
          current_difficulty = DIFFICULTY_LEVELS[diffIdx + 1];
          consecutive_correct = 0;
          log('DEBUG', `/services/${serviceId}/question`, `DIFFICULTY INCREASED to ${current_difficulty}`);
        }
      } else {
        consecutive_wrong = (consecutive_wrong || 0) + 1;
        consecutive_correct = 0;
        // Immediate difficulty decrease for remedial learning
        if (diffIdx > 0) {
          current_difficulty = DIFFICULTY_LEVELS[diffIdx - 1];
          log('DEBUG', `/services/${serviceId}/question`, `IMMEDIATE DIFFICULTY DECREASE to ${current_difficulty} for remedial`);
        }
        if (consecutive_wrong >= 2 && diffIdx > 0) {
          // Further decrease if needed
          current_difficulty = DIFFICULTY_LEVELS[Math.max(0, diffIdx - 1)];
          consecutive_wrong = 0;
          log('DEBUG', `/services/${serviceId}/question`, `FURTHER DIFFICULTY DECREASED to ${current_difficulty}`);
        }
      }

      progress = await databases.updateDocument(DB_ID, 'service_progress', progress.$id, {
        consecutive_correct,
        consecutive_wrong,
        current_difficulty
      });
    }

    const isRemedial = previousResult === false;

    const recentHashesRes = await databases.listDocuments(DB_ID, 'question_history', [
      sdk.Query.equal('user_id', String(req.user.id)),
      sdk.Query.equal('service_id', serviceId),
      sdk.Query.orderDesc('asked_at'),
      sdk.Query.limit(30)
    ]);
    const usedHashes = recentHashesRes.documents.map(r => r.question_hash);

    const serviceName = AWS_SERVICES[serviceId].name;
    const difficulty = progress.current_difficulty;
    const difficultyGuide = getDifficultyPrompt(difficulty, serviceName);

    log('AI_START', `/services/${serviceId}/question`, `Requesting Groq for ${serviceName} (${difficulty})`);

    const systemPrompt = `You are an elite AWS Certified Cloud Architect and Expert Certification Instructor specializing exclusively in the AWS Certified Developer - Associate (DVA-C02) examination. Your singular purpose is to generate rigorous, scenario-based, multiple-choice exam questions for a candidate preparing for this certification.

## ROLE AND BEHAVIORAL CONSTRAINTS
- Maintain a strictly professional, academic, and technical tone at all times.
- Do NOT use conversational filler or affirmations.
- NEVER hallucinate AWS services, API endpoints, IAM actions, or CLI commands. Every service and action must exist in current AWS documentation.
- Do NOT reference deprecated services (e.g., EC2-Classic, SimpleDB).
- Base all architectural reasoning strictly on the AWS Well-Architected Framework and current AWS technical documentation.

## DVA-C02 DOMAIN WEIGHTING (adapted for target service: ${serviceName})
Focus on the target service "${serviceName}" at a difficulty level of "${difficulty}". Choose/target a DVA-C02 domain relevant to ${serviceName} from the following weighted domains:
- Domain 1 — Development with AWS Services: 32% (Lambda, API Gateway, DynamoDB, SNS/SQS, Kinesis, Step Functions, event-driven, idempotency, caching)
- Domain 2 — Security: 26% (IAM, Cognito, KMS, Secrets Manager, STS, execution roles, ACM)
- Domain 3 — Deployment: 24% (SAM, CDK, CI/CD, deployment strategies, traffic shifting, Beanstalk, ECS, CloudFormation)
- Domain 4 — Troubleshooting and Optimization: 18% (X-Ray, CloudWatch, CloudTrail, bottlenecks, 4xx/5xx errors, CLI/Boto3 credential errors, permission debugging)

## QUESTION GENERATION RULES
### Scenario construction
- Frame every question as a real-world enterprise problem involving ${serviceName}: a developer encountering an error, an architect designing a new service, or a company migrating a workload.
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
  "question": "[3-6 sentence scenario. End the scenario paragraph with the exact question text: 'Which of the following options BEST satisfies the requirements?']",
  "options": {
    "A": "[Option A text]",
    "B": "[Option B text]",
    "C": "[Option C text]",
    "D": "[Option D text]"
  },
  "correct": "[Correct option letter: A, B, C, or D]",
  "explanation": "[Detailed explanation stating the correct answer and why it's correct, and also explaining why each incorrect option is wrong compared to the correct choice. For remedial questions, emphasize building understanding step by step, starting from basics and reinforcing key concepts.]",
  "difficulty": "${difficulty}",
  "topic": "[Domain name, e.g. Domain 1 — Development with AWS Services]"
}`;
    let userPrompt = `Generate a unique ${difficulty}-level AWS certification-style question about ${serviceName}. Make it realistic to AWS exams with scenario-based content and one clearly correct answer. Avoid false phrasing or ambiguous wording, and keep the wording direct and exam-ready. Unique ID: ${Date.now()}`;
    if (isRemedial) {
      userPrompt += ` This is a remedial question because the user just got a previous question wrong. Focus on reinforcing the fundamental concepts, provide clear explanations, and help build step-by-step understanding.`;
    }

    // GROQ API CALL
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }, // Ensures valid JSON
      temperature: 0.7,
    });

    const responseText = completion.choices[0]?.message?.content || "";
    log('AI_END', `/services/${serviceId}/question`, 'Response received from Groq.');

    let questionData;
    try {
      questionData = JSON.parse(responseText);
    } catch (e) {
      log('PARSE_ERROR', `/services/${serviceId}/question`, 'AI response was not valid JSON', responseText);
      return res.status(500).json({ error: 'Failed to parse question from AI' });
    }

    const questionHash = crypto.createHash('sha256').update(questionData.question).digest('hex').substring(0, 16);
    questionData.hash = questionHash;
    questionData.currentDifficulty = difficulty;
    questionData.serviceId = serviceId;
    
    log('SUCCESS', `/services/${serviceId}/question`, `Question generated: ${questionHash}`);
    res.json({ question: questionData, difficulty, progress });
  } catch (err) {
    log('ERROR', `/services/${serviceId}/question`, err.stack);
    res.status(500).json({ error: 'Failed to generate question' });
  }
});

router.post('/services/:serviceId/answer', authenticateToken, async (req, res) => {
  const { serviceId } = req.params;
  const { questionHash, selectedOption, correctOption, difficulty } = req.body;
  const isCorrect = selectedOption === correctOption;

  log('POST', `/services/${serviceId}/answer`, `User: ${req.user.id} | Correct: ${isCorrect} | Hash: ${questionHash}`);

  try {
    const existingHist = await databases.listDocuments(DB_ID, 'question_history', [
      sdk.Query.equal('user_id', String(req.user.id)),
      sdk.Query.equal('service_id', serviceId),
      sdk.Query.equal('question_hash', questionHash)
    ]);
    if (existingHist.documents.length > 0) {
      await databases.updateDocument(DB_ID, 'question_history', existingHist.documents[0].$id, {
        was_correct: isCorrect,
        asked_at: new Date().toISOString()
      });
    } else {
      await databases.createDocument(DB_ID, 'question_history', sdk.ID.unique(), {
        user_id: String(req.user.id),
        service_id: serviceId,
        question_hash: questionHash,
        was_correct: isCorrect,
        difficulty,
        asked_at: new Date().toISOString()
      });
    }

    const scoreGain = isCorrect ? (difficulty === 'foundation' ? 10 : difficulty === 'associate' ? 20 : difficulty === 'advanced' ? 35 : 50) : 0;

    const progRes = await databases.listDocuments(DB_ID, 'service_progress', [
      sdk.Query.equal('user_id', String(req.user.id)),
      sdk.Query.equal('service_id', serviceId)
    ]);
    let progressResult = null;
    if (progRes.documents.length > 0) {
      const p = progRes.documents[0];
      const newStreak = isCorrect ? (p.current_streak || 0) + 1 : 0;
      progressResult = await databases.updateDocument(DB_ID, 'service_progress', p.$id, {
        questions_attempted: (p.questions_attempted || 0) + 1,
        questions_correct: (p.questions_correct || 0) + (isCorrect ? 1 : 0),
        total_score: (p.total_score || 0) + scoreGain,
        current_streak: newStreak,
        best_streak: Math.max(p.best_streak || 0, newStreak),
        last_played: new Date().toISOString()
      });
    }

    log('SUCCESS', `/services/${serviceId}/answer`, `Score updated. Gain: ${scoreGain}`);
    res.json({
      correct: isCorrect,
      scoreGain,
      progress: progressResult,
    });
  } catch (err) {
    log('ERROR', `/services/${serviceId}/answer`, err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/services/:serviceId/evaluate-answer', authenticateToken, async (req, res) => {
  const { serviceId } = req.params;
  const { questionHash, selectedOption, correctOption, difficulty, userExplanation, questionText, optionsText } = req.body;
  const isCorrectChoice = selectedOption === correctOption;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  log('POST', `/services/${serviceId}/evaluate-answer`, `User: ${req.user.id} | Hash: ${questionHash}`);

  try {
    const systemPrompt = `You are an AWS certification expert and a perceptive mentor. The user has answered a question about AWS.
Evaluate their thought process based on their explanation.
Question: ${questionText}
Options: ${JSON.stringify(optionsText)}
Correct Answer: ${correctOption}
User's Choice: ${selectedOption}
User's Explanation: "${userExplanation}"

Provide a detailed analysis directly addressing the user. Tell them why their thought process is on the right track or where they misunderstood concepts. Be encouraging but precise.
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
    let understandingScore = isCorrectChoice ? 50 : 0; // fallback
    if (scoreMatch) {
        understandingScore = parseInt(scoreMatch[1], 10);
    }

    // Now update database asynchronously without blocking the client response end
    (async () => {
        try {
            const existingHist = await databases.listDocuments(DB_ID, 'question_history', [
              sdk.Query.equal('user_id', String(req.user.id)),
              sdk.Query.equal('service_id', serviceId),
              sdk.Query.equal('question_hash', questionHash)
            ]);
            if (existingHist.documents.length > 0) {
              await databases.updateDocument(DB_ID, 'question_history', existingHist.documents[0].$id, {
                was_correct: isCorrectChoice,
                asked_at: new Date().toISOString()
              });
            } else {
              await databases.createDocument(DB_ID, 'question_history', sdk.ID.unique(), {
                user_id: String(req.user.id),
                service_id: serviceId,
                question_hash: questionHash,
                was_correct: isCorrectChoice,
                difficulty,
                asked_at: new Date().toISOString()
              });
            }

            // Scale scoreGain based on understandingScore (0-100) and difficulty
            const maxGain = difficulty === 'foundation' ? 10 : difficulty === 'associate' ? 20 : difficulty === 'advanced' ? 35 : 50;
            const scoreGain = Math.round((understandingScore / 100) * maxGain);

            const progRes = await databases.listDocuments(DB_ID, 'service_progress', [
              sdk.Query.equal('user_id', String(req.user.id)),
              sdk.Query.equal('service_id', serviceId)
            ]);
            if (progRes.documents.length > 0) {
              const p = progRes.documents[0];
              const newStreak = isCorrectChoice ? (p.current_streak || 0) + 1 : 0;
              await databases.updateDocument(DB_ID, 'service_progress', p.$id, {
                questions_attempted: (p.questions_attempted || 0) + 1,
                questions_correct: (p.questions_correct || 0) + (isCorrectChoice ? 1 : 0),
                total_score: (p.total_score || 0) + scoreGain,
                current_streak: newStreak,
                best_streak: Math.max(p.best_streak || 0, newStreak),
                last_played: new Date().toISOString()
              });
            }
        } catch (dbErr) {
            log('ERROR', `/services/${serviceId}/evaluate-answer (DB Async)`, dbErr.message);
        }
    })();

    res.end();
  } catch (err) {
    log('ERROR', `/services/${serviceId}/evaluate-answer`, err.message);
    res.end("\nError generating evaluation.");
  }
});

router.get('/leaderboard', authenticateToken, async (req, res) => {
  log('GET', '/leaderboard', 'Fetching top 20');
  try {
    const usersRes = await databases.listDocuments(DB_ID, 'users', [sdk.Query.limit(100)]);
    const progressRes = await databases.listDocuments(DB_ID, 'service_progress', [sdk.Query.limit(1000)]);
    
    const userScores = {};
    usersRes.documents.forEach(u => {
      userScores[u.$id] = { name: u.name, total_score: 0 };
    });
    
    progressRes.documents.forEach(p => {
      if (userScores[p.user_id]) {
        userScores[p.user_id].total_score += (p.total_score || 0);
      }
    });
    
    const leaderboard = Object.values(userScores)
      .sort((a, b) => b.total_score - a.total_score)
      .slice(0, 20);
      
    res.json({ leaderboard });
  } catch (err) {
    log('ERROR', '/leaderboard', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/dashboard', authenticateToken, async (req, res) => {
  log('GET', '/dashboard', `User: ${req.user.id}`);
  try {
    const progressRes = await databases.listDocuments(DB_ID, 'service_progress', [
      sdk.Query.equal('user_id', String(req.user.id)),
      sdk.Query.limit(100)
    ]);
    
    const stats = {
      total_attempted: 0,
      total_correct: 0,
      total_score: 0,
      best_streak: 0,
      services_started: progressRes.documents.length,
      services_completed: 0
    };
    
    progressRes.documents.forEach(p => {
      stats.total_attempted += (p.questions_attempted || 0);
      stats.total_correct += (p.questions_correct || 0);
      stats.total_score += (p.total_score || 0);
      stats.best_streak = Math.max(stats.best_streak, (p.best_streak || 0));
      if (p.is_completed) stats.services_completed++;
    });
    
    const recentServices = progressRes.documents
      .filter(p => p.last_played)
      .sort((a, b) => new Date(b.last_played) - new Date(a.last_played))
      .slice(0, 5);

    const histRes = await databases.listDocuments(DB_ID, 'question_history', [
      sdk.Query.equal('user_id', String(req.user.id)),
      sdk.Query.orderDesc('asked_at'),
      sdk.Query.limit(10)
    ]);
    
    const serviceNameMap = {};
    progressRes.documents.forEach(p => serviceNameMap[p.service_id] = p.service_name);
    
    const recentActivity = histRes.documents.map(h => ({
      difficulty: h.difficulty,
      was_correct: h.was_correct,
      asked_at: h.asked_at,
      service_name: serviceNameMap[h.service_id] || h.service_id
    }));

    res.json({ 
      stats, 
      recentServices,
      recentActivity
    });
  } catch (err) {
    log('ERROR', '/dashboard', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;   