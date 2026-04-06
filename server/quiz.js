const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const crypto = require('crypto');
const { pool } = require('./db');
const { authenticateToken } = require('./auth');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    foundation: `Basic concepts, definitions, and fundamental use cases of ${service}. Questions should cover what the service is, its core purpose, and basic configurations. Think "What is X?" and "What does X do?" type questions.`,
    associate: `Intermediate scenarios, integration patterns, and practical usage of ${service} for the AWS Developer Associate exam. Cover API calls, SDK usage, common architectures, and troubleshooting scenarios.`,
    advanced: `Complex architectural decisions, edge cases, performance optimization, cost optimization, and advanced features of ${service}. Include multi-service integration scenarios and real-world problem solving.`,
    expert: `Expert-level scenarios involving security hardening, disaster recovery, cross-region architectures, compliance requirements, and deep technical implementation details of ${service}. Think of the hardest questions on the actual AWS exam.`,
  };
  return prompts[difficulty];
};

// Get all services with user progress
router.get('/services', authenticateToken, async (req, res) => {
  try {
    const progressResult = await pool.query(
      'SELECT service_id, service_name, questions_attempted, questions_correct, current_difficulty, total_score, best_streak, current_streak, is_completed, last_played FROM service_progress WHERE user_id = $1',
      [req.user.id]
    );
    const progressMap = {};
    progressResult.rows.forEach(row => { progressMap[row.service_id] = row; });

    const services = Object.entries(AWS_SERVICES).map(([id, info]) => ({
      id,
      ...info,
      progress: progressMap[id] || null,
    }));

    res.json({ services });
  } catch (err) {
    console.error('Services error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get service progress detail
router.get('/services/:serviceId/progress', authenticateToken, async (req, res) => {
  const { serviceId } = req.params;
  if (!AWS_SERVICES[serviceId]) return res.status(404).json({ error: 'Service not found' });
  try {
    const result = await pool.query(
      'SELECT * FROM service_progress WHERE user_id = $1 AND service_id = $2',
      [req.user.id, serviceId]
    );
    const history = await pool.query(
      'SELECT difficulty, was_correct, asked_at FROM question_history WHERE user_id = $1 AND service_id = $2 ORDER BY asked_at DESC LIMIT 20',
      [req.user.id, serviceId]
    );
    res.json({ progress: result.rows[0] || null, history: history.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Generate adaptive question
router.post('/services/:serviceId/question', authenticateToken, async (req, res) => {
  const { serviceId } = req.params;
  const { sessionId, previousResult } = req.body;

  if (!AWS_SERVICES[serviceId]) return res.status(404).json({ error: 'Service not found' });

  try {
    // Get or create progress
    let progressResult = await pool.query(
      'SELECT * FROM service_progress WHERE user_id = $1 AND service_id = $2',
      [req.user.id, serviceId]
    );

    let progress = progressResult.rows[0];
    if (!progress) {
      const insertResult = await pool.query(
        `INSERT INTO service_progress (user_id, service_id, service_name, current_difficulty)
         VALUES ($1, $2, $3, 'foundation') RETURNING *`,
        [req.user.id, serviceId, AWS_SERVICES[serviceId].name]
      );
      progress = insertResult.rows[0];
    }

    // Adjust difficulty based on previous result
    if (previousResult !== undefined) {
      let { consecutive_correct, consecutive_wrong, current_difficulty } = progress;
      const diffIdx = DIFFICULTY_LEVELS.indexOf(current_difficulty);

      if (previousResult === true) {
        consecutive_correct = (consecutive_correct || 0) + 1;
        consecutive_wrong = 0;
        // Increase difficulty after 2 consecutive correct
        if (consecutive_correct >= 2 && diffIdx < DIFFICULTY_LEVELS.length - 1) {
          current_difficulty = DIFFICULTY_LEVELS[diffIdx + 1];
          consecutive_correct = 0;
        }
      } else {
        consecutive_wrong = (consecutive_wrong || 0) + 1;
        consecutive_correct = 0;
        // Decrease difficulty after 2 consecutive wrong
        if (consecutive_wrong >= 2 && diffIdx > 0) {
          current_difficulty = DIFFICULTY_LEVELS[diffIdx - 1];
          consecutive_wrong = 0;
        }
      }

      await pool.query(
        `UPDATE service_progress SET consecutive_correct=$1, consecutive_wrong=$2, current_difficulty=$3
         WHERE user_id=$4 AND service_id=$5`,
        [consecutive_correct, consecutive_wrong, current_difficulty, req.user.id, serviceId]
      );
      progress.current_difficulty = current_difficulty;
      progress.consecutive_correct = consecutive_correct;
      progress.consecutive_wrong = consecutive_wrong;
    }

    // Get recently asked question hashes to avoid repeats
    const recentHashes = await pool.query(
      'SELECT question_hash FROM question_history WHERE user_id=$1 AND service_id=$2 ORDER BY asked_at DESC LIMIT 30',
      [req.user.id, serviceId]
    );
    const usedHashes = recentHashes.rows.map(r => r.question_hash);

    const serviceName = AWS_SERVICES[serviceId].name;
    const difficulty = progress.current_difficulty;
    const difficultyGuide = getDifficultyPrompt(difficulty, serviceName);

    const systemPrompt = `You are an expert AWS certification question generator specializing in the AWS Certified Developer - Associate exam.
Generate ONE multiple choice question about ${serviceName}.

Difficulty: ${difficulty.toUpperCase()}
Focus: ${difficultyGuide}

Rules:
- Return ONLY valid JSON, no markdown, no explanation
- Question must be unique and practical
- 4 answer options (A, B, C, D)
- One correct answer
- Detailed explanation for the correct answer
- Explanation should reference AWS documentation concepts

JSON format:
{
  "question": "question text here",
  "options": {
    "A": "option A text",
    "B": "option B text", 
    "C": "option C text",
    "D": "option D text"
  },
  "correct": "A",
  "explanation": "detailed explanation why this is correct and others are wrong",
  "difficulty": "${difficulty}",
  "topic": "specific topic within ${serviceName}"
}`;

    const userPrompt = `Generate a ${difficulty}-level AWS Developer Associate exam question about ${serviceName}.
${usedHashes.length > 0 ? `Make sure this is a NEW question, different from the ${usedHashes.length} questions already asked.` : ''}
Focus on practical developer scenarios and real AWS exam-style questions.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });

    const responseText = message.content[0].text.trim();
    let questionData;
    try {
      const clean = responseText.replace(/```json|```/g, '').trim();
      questionData = JSON.parse(clean);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse question from AI' });
    }

    // Hash the question to track uniqueness
    const questionHash = crypto.createHash('sha256').update(questionData.question).digest('hex').substring(0, 16);
    questionData.hash = questionHash;
    questionData.currentDifficulty = difficulty;
    questionData.serviceId = serviceId;

    res.json({ question: questionData, difficulty, progress });
  } catch (err) {
    console.error('Question generation error:', err);
    res.status(500).json({ error: 'Failed to generate question' });
  }
});

// Submit answer
router.post('/services/:serviceId/answer', authenticateToken, async (req, res) => {
  const { serviceId } = req.params;
  const { questionHash, selectedOption, correctOption, difficulty, sessionId } = req.body;

  if (!AWS_SERVICES[serviceId]) return res.status(404).json({ error: 'Service not found' });

  const isCorrect = selectedOption === correctOption;

  try {
    // Store question history
    await pool.query(
      `INSERT INTO question_history (user_id, service_id, question_hash, was_correct, difficulty)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, service_id, question_hash) DO UPDATE SET was_correct=$4, asked_at=NOW()`,
      [req.user.id, serviceId, questionHash, isCorrect, difficulty]
    );

    // Update progress
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

    res.json({
      correct: isCorrect,
      scoreGain,
      progress: progressResult.rows[0],
    });
  } catch (err) {
    console.error('Answer submit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get leaderboard
router.get('/leaderboard', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.name, 
             COALESCE(SUM(sp.total_score), 0) as total_score,
             COALESCE(SUM(sp.questions_correct), 0) as total_correct,
             COALESCE(SUM(sp.questions_attempted), 0) as total_attempted,
             COUNT(CASE WHEN sp.is_completed THEN 1 END) as services_completed
      FROM users u
      LEFT JOIN service_progress sp ON u.id = sp.user_id
      GROUP BY u.id, u.name
      ORDER BY total_score DESC
      LIMIT 20
    `);
    res.json({ leaderboard: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user dashboard stats
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const statsResult = await pool.query(`
      SELECT 
        COALESCE(SUM(questions_attempted), 0) as total_attempted,
        COALESCE(SUM(questions_correct), 0) as total_correct,
        COALESCE(SUM(total_score), 0) as total_score,
        COALESCE(MAX(best_streak), 0) as best_streak,
        COUNT(CASE WHEN is_completed THEN 1 END) as services_completed,
        COUNT(*) as services_started
      FROM service_progress WHERE user_id = $1
    `, [req.user.id]);

    const servicesResult = await pool.query(
      `SELECT service_id, service_name, questions_attempted, questions_correct, 
              current_difficulty, total_score, best_streak, current_streak, last_played
       FROM service_progress WHERE user_id = $1 ORDER BY last_played DESC LIMIT 5`,
      [req.user.id]
    );

    const recentResult = await pool.query(
      `SELECT qh.service_id, sp.service_name, qh.was_correct, qh.difficulty, qh.asked_at
       FROM question_history qh
       JOIN service_progress sp ON sp.user_id = qh.user_id AND sp.service_id = qh.service_id
       WHERE qh.user_id = $1 ORDER BY qh.asked_at DESC LIMIT 10`,
      [req.user.id]
    );

    res.json({
      stats: statsResult.rows[0],
      recentServices: servicesResult.rows,
      recentActivity: recentResult.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
