import { query } from '../config/database.js';

export function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const [scheme, password] = authHeader.split(' ');
  if (scheme !== 'Bearer' || password !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Invalid credentials' });
  }

  next();
}

export async function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return next();

  try {
    const sessionResult = await query(
      `SELECT user_id, expires_at FROM sessions WHERE token = $1`,
      [token],
    );

    if (sessionResult.rows.length === 0) return next();

    const session = sessionResult.rows[0];
    if (new Date(session.expires_at) < new Date()) return next();

    const userResult = await query(
      `SELECT id, email, tier, submissions_today, submissions_reset_date FROM users WHERE id = $1`,
      [session.user_id],
    );

    if (userResult.rows.length > 0) {
      req.user = userResult.rows[0];
    }
  } catch {
    // Treat as unauthenticated
  }

  next();
}

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
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
      return res.status(401).json({ error: 'Session expired' });
    }

    const userResult = await query(
      `SELECT id, email, tier, submissions_today, submissions_reset_date FROM users WHERE id = $1`,
      [session.user_id],
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = userResult.rows[0];
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
}
