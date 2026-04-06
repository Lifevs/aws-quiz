// server/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const initDB = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS service_progress (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        service_id VARCHAR(50) NOT NULL,
        service_name VARCHAR(100) NOT NULL,
        questions_attempted INTEGER DEFAULT 0,
        questions_correct INTEGER DEFAULT 0,
        current_difficulty VARCHAR(20) DEFAULT 'foundation',
        consecutive_correct INTEGER DEFAULT 0,
        consecutive_wrong INTEGER DEFAULT 0,
        best_streak INTEGER DEFAULT 0,
        current_streak INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        last_played TIMESTAMP,
        is_completed BOOLEAN DEFAULT FALSE,
        UNIQUE(user_id, service_id)
      );

      CREATE TABLE IF NOT EXISTS quiz_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        service_id VARCHAR(50) NOT NULL,
        started_at TIMESTAMP DEFAULT NOW(),
        ended_at TIMESTAMP,
        questions_answered INTEGER DEFAULT 0,
        questions_correct INTEGER DEFAULT 0,
        difficulty_start VARCHAR(20) DEFAULT 'foundation',
        difficulty_end VARCHAR(20) DEFAULT 'foundation',
        session_score INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS question_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        service_id VARCHAR(50) NOT NULL,
        question_hash VARCHAR(64) NOT NULL,
        was_correct BOOLEAN,
        difficulty VARCHAR(20),
        asked_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, service_id, question_hash)
      );
    `);
    console.log('✅ Database initialized successfully');
  } catch (err) {
    console.error('❌ Database initialization error:', err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, initDB };
