require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { initDB } = require('./db');
const { router: authRouter } = require('./auth');
const quizRouter = require('./quiz');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.CLIENT_URL, /\.onrender\.com$/]
    : 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later.' },
});

const questionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Slow down! Maximum 30 questions per minute.' },
});

app.use('/api/', apiLimiter);
app.use('/api/quiz/services/:serviceId/question', questionLimiter);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/quiz', quizRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// Init DB and start server
initDB()
  .then(() => {
   // server/db.js
require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // required for Render-managed Postgres
  },
});

async function initDB() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ DB connected successfully');
  } catch (err) {
    console.error('❌ Failed to initialize DB:', err);
    throw err;
  }
}

module.exports = { pool, initDB };

  })
  
