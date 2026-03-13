import { Router } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';

export const authRouter = Router();

// Hash password with SHA-256 + salt (simple, no bcrypt dependency needed)
function hashPassword(password, salt) {
  if (!salt) salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(salt + password).digest('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const attempt = createHash('sha256').update(salt + password).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(hash), Buffer.from(attempt));
  } catch {
    return false;
  }
}

function generateToken() {
  return randomBytes(32).toString('hex');
}

// Register
authRouter.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const userId = uuidv4();
    const passwordHash = hashPassword(password);

    await query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)`,
      [userId, email.toLowerCase(), passwordHash],
    );

    // Create session
    const token = generateToken();
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await query(
      `INSERT INTO sessions (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)`,
      [sessionId, userId, token, expiresAt.toISOString()],
    );

    res.status(201).json({
      token,
      user: { id: userId, email: email.toLowerCase(), tier: 'free' },
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await query(
      `SELECT id, email, password_hash, tier, stripe_customer_id, stripe_subscription_id
       FROM users WHERE email = $1`,
      [email.toLowerCase()],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Create session
    const token = generateToken();
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await query(
      `INSERT INTO sessions (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)`,
      [sessionId, user.id, token, expiresAt.toISOString()],
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        tier: user.tier,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
authRouter.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    await query(`DELETE FROM sessions WHERE token = $1`, [token]).catch(() => {});
  }
  res.json({ message: 'Logged out' });
});

// Get current user
authRouter.get('/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const sessionResult = await query(
      `SELECT user_id, expires_at FROM sessions WHERE token = $1`,
      [token],
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const session = sessionResult.rows[0];
    if (new Date(session.expires_at) < new Date()) {
      await query(`DELETE FROM sessions WHERE token = $1`, [token]);
      return res.status(401).json({ error: 'Session expired' });
    }

    const userResult = await query(
      `SELECT id, email, tier, stripe_customer_id, submissions_today, submissions_reset_date, created_at
       FROM users WHERE id = $1`,
      [session.user_id],
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      tier: user.tier,
      submissionsToday: user.submissions_today,
      hasStripe: !!user.stripe_customer_id,
      createdAt: user.created_at,
    });
  } catch (err) {
    console.error('Auth me error:', err);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});
