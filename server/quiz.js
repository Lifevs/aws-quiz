const express = require('express');
const Groq = require('groq-sdk'); // Switched to Groq
const crypto = require('crypto');
const { pool } = require('./db');
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
    const progressResult = await pool.query(
      'SELECT service_id, service_name, questions_attempted, questions_correct, current_difficulty, total_score, best_streak, current_streak, is_completed, last_played FROM service_progress WHERE user_id = $1',
      [req.user.id]
    );
    
    log('GET', '/services', `Found ${progressResult.rows.length} progress records.`);

    const progressMap = {};
    progressResult.rows.forEach(row => { progressMap[row.service_id] = row; });

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
    const result = await pool.query(
      'SELECT * FROM service_progress WHERE user_id = $1 AND service_id = $2',
      [req.user.id, serviceId]
    );
    const history = await pool.query(
      'SELECT difficulty, was_correct, asked_at FROM question_history WHERE user_id = $1 AND service_id = $2 ORDER BY asked_at DESC LIMIT 20',
      [req.user.id, serviceId]
    );
    
    log('GET', `/services/${serviceId}/progress`, `Returning ${history.rows.length} history items.`);
    res.json({ progress: result.rows[0] || null, history: history.rows });
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
    let progressResult = await pool.query(
      'SELECT * FROM service_progress WHERE user_id = $1 AND service_id = $2',
      [req.user.id, serviceId]
    );

    let progress = progressResult.rows[0];
    if (!progress) {
      log('INFO', `/services/${serviceId}/question`, 'First time playing. Creating progress record.');
      const insertResult = await pool.query(
        `INSERT INTO service_progress (user_id, service_id, service_name, current_difficulty)
         VALUES ($1, $2, $3, 'foundation') RETURNING *`,
        [req.user.id, serviceId, AWS_SERVICES[serviceId].name]
      );
      progress = insertResult.rows[0];
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
          // Further decrease if needed, but since we already decreased, maybe skip or adjust
          current_difficulty = DIFFICULTY_LEVELS[Math.max(0, diffIdx - 1)];
          consecutive_wrong = 0;
          log('DEBUG', `/services/${serviceId}/question`, `FURTHER DIFFICULTY DECREASED to ${current_difficulty}`);
        }
      }

      await pool.query(
        `UPDATE service_progress SET consecutive_correct=$1, consecutive_wrong=$2, current_difficulty=$3
         WHERE user_id=$4 AND service_id=$5`,
        [consecutive_correct, consecutive_wrong, current_difficulty, req.user.id, serviceId]
      );
      progress.current_difficulty = current_difficulty;
    }

    const isRemedial = previousResult === false;

    const recentHashes = await pool.query(
      'SELECT question_hash FROM question_history WHERE user_id=$1 AND service_id=$2 ORDER BY asked_at DESC LIMIT 30',
      [req.user.id, serviceId]
    );
    const usedHashes = recentHashes.rows.map(r => r.question_hash);

    const serviceName = AWS_SERVICES[serviceId].name;
    const difficulty = progress.current_difficulty;
    const difficultyGuide = getDifficultyPrompt(difficulty, serviceName);

    log('AI_START', `/services/${serviceId}/question`, `Requesting Groq for ${serviceName} (${difficulty})`);

    const systemPrompt = `You are an expert AWS certification exam question generator. Generate questions in the authentic style of official AWS certification exams, using clear and direct exam wording. Avoid misleading or false phrasing, and do not use vague or trick wording. Each question must be immediately related to the AWS concept and practical scenario. Use scenario-based questions, multiple-choice with one correct answer, realistic distractors, and detailed explanations. Ensure each question is unique and does not repeat similar patterns or content from previous generations. Focus on practical AWS knowledge and best practices. For remedial questions, emphasize building understanding step by step, starting from basics and reinforcing key concepts. The explanation should clearly state the correct answer and why it's correct, and also explain why each incorrect option is wrong compared to the correct choice. Return ONLY JSON. Format: { "question": "", "options": {"A":"", "B":"", "C":"", "D":""}, "correct": "A", "explanation": "", "difficulty": "${difficulty}", "topic": "" }`;
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
    await pool.query(
      `INSERT INTO question_history (user_id, service_id, question_hash, was_correct, difficulty)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, service_id, question_hash) DO UPDATE SET was_correct=$4, asked_at=NOW()`,
      [req.user.id, serviceId, questionHash, isCorrect, difficulty]
    );

    const scoreGain = isCorrect ? (difficulty === 'foundation' ? 10 : difficulty === 'associate' ? 20 : difficulty === 'advanced' ? 35 : 50) : 0;

    const progressResult = await pool.query(
      `UPDATE service_progress SET
        questions_attempted = questions_attempted + 1,
        questions_correct = questions_correct + $1,
        total_score = total_score + $2,
        current_streak = CASE WHEN $3 THEN current_streak + 1 ELSE 0 END,
        best_streak = CASE WHEN $3 AND current_streak + 1 > best_streak THEN current_streak + 1 ELSE best_streak END,
        last_played = NOW()
       WHERE user_id=$4 AND service_id=$5
       RETURNING *`,
      [isCorrect ? 1 : 0, scoreGain, isCorrect, req.user.id, serviceId]
    );

    log('SUCCESS', `/services/${serviceId}/answer`, `Score updated. Gain: ${scoreGain}`);
    res.json({
      correct: isCorrect,
      scoreGain,
      progress: progressResult.rows[0],
    });
  } catch (err) {
    log('ERROR', `/services/${serviceId}/answer`, err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/leaderboard', authenticateToken, async (req, res) => {
  log('GET', '/leaderboard', 'Fetching top 20');
  try {
    const result = await pool.query('SELECT u.name, SUM(sp.total_score) as total_score FROM users u LEFT JOIN service_progress sp ON u.id = sp.user_id GROUP BY u.id, u.name ORDER BY total_score DESC LIMIT 20');
    res.json({ leaderboard: result.rows });
  } catch (err) {
    log('ERROR', '/leaderboard', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/dashboard', authenticateToken, async (req, res) => {
  log('GET', '/dashboard', `User: ${req.user.id}`);
  try {
    // Aggregate stats from service_progress
    const statsResult = await pool.query(`
      SELECT 
        SUM(questions_attempted) as total_attempted,
        SUM(questions_correct) as total_correct,
        SUM(total_score) as total_score,
        MAX(best_streak) as best_streak,
        COUNT(*) as services_started,
        COUNT(CASE WHEN is_completed THEN 1 END) as services_completed
      FROM service_progress WHERE user_id = $1
    `, [req.user.id]);

    // Recent services (last played, limit 5)
    const recentServicesResult = await pool.query(`
      SELECT service_id, service_name, questions_attempted, questions_correct, current_difficulty, total_score
      FROM service_progress 
      WHERE user_id = $1 AND last_played IS NOT NULL
      ORDER BY last_played DESC LIMIT 5
    `, [req.user.id]);

    // Recent activity (last 10 questions)
    const recentActivityResult = await pool.query(`
      SELECT qh.difficulty, qh.was_correct, qh.asked_at, sp.service_name
      FROM question_history qh
      JOIN service_progress sp ON qh.service_id = sp.service_id AND qh.user_id = sp.user_id
      WHERE qh.user_id = $1
      ORDER BY qh.asked_at DESC LIMIT 10
    `, [req.user.id]);

    res.json({ 
      stats: statsResult.rows[0], 
      recentServices: recentServicesResult.rows,
      recentActivity: recentActivityResult.rows
    });
  } catch (err) {
    log('ERROR', '/dashboard', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;   