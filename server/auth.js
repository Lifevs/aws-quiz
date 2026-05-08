const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { databases, DB_ID, sdk } = require('./db');

const router = express.Router();

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Middleware to verify JWT
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    try {
      const user = await databases.getDocument(DB_ID, 'users', decoded.userId);
      // Map $id to id for backwards compatibility with frontend
      req.user = { id: user.$id, name: user.name, email: user.email, created_at: user.created_at };
      next();
    } catch (dbErr) {
      return res.status(401).json({ error: 'User not found' });
    }
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const existing = await databases.listDocuments(DB_ID, 'users', [
      sdk.Query.equal('email', email.toLowerCase())
    ]);
    if (existing.documents.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    const hash = await bcrypt.hash(password, 12);
    const user = await databases.createDocument(DB_ID, 'users', sdk.ID.unique(), {
      name: name.trim(),
      email: email.toLowerCase(),
      password_hash: hash,
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString()
    });
    
    const token = generateToken(user.$id);
    res.status(201).json({ token, user: { id: user.$id, name: user.name, email: user.email, created_at: user.created_at } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  try {
    const result = await databases.listDocuments(DB_ID, 'users', [
      sdk.Query.equal('email', email.toLowerCase())
    ]);
    if (result.documents.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = result.documents[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    await databases.updateDocument(DB_ID, 'users', user.$id, {
      last_login: new Date().toISOString()
    });
    
    const token = generateToken(user.$id);
    res.json({ token, user: { id: user.$id, name: user.name, email: user.email, created_at: user.created_at } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // Get overall stats manually since NoSQL lacks SUM/COUNT aggregations
    const progressDocs = await databases.listDocuments(DB_ID, 'service_progress', [
      sdk.Query.equal('user_id', String(req.user.id)),
      sdk.Query.limit(100) // Assuming < 100 AWS services
    ]);

    const stats = {
      total_attempted: 0,
      total_correct: 0,
      total_score: 0,
      services_completed: 0,
      services_started: progressDocs.documents.length
    };

    for (const doc of progressDocs.documents) {
      stats.total_attempted += (doc.questions_attempted || 0);
      stats.total_correct += (doc.questions_correct || 0);
      stats.total_score += (doc.total_score || 0);
      if (doc.is_completed) stats.services_completed++;
    }

    res.json({ user: req.user, stats });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { router, authenticateToken };
