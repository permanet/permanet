import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { query } from '../config/database.js';

export const adminRouter = Router();

adminRouter.use(requireAdmin);

// Dashboard overview with revenue metrics
adminRouter.get('/dashboard', async (req, res) => {
  try {
    const submissions = await query('SELECT COUNT(*) FROM submissions');
    const users = await query('SELECT COUNT(*) FROM users');

    // Storage tiers breakdown
    const tiersResult = await query(
      `SELECT storage_tier, COUNT(*) as count FROM submissions GROUP BY storage_tier`,
    );
    const tiers = {};
    for (const row of tiersResult.rows) {
      tiers[row.storage_tier] = parseInt(row.count);
    }

    // Revenue from payments
    const revenueResult = await query(
      `SELECT type, SUM(amount_cents) as total, COUNT(*) as count FROM payments WHERE status = 'completed' GROUP BY type`,
    );
    const revenue = {};
    let totalRevenue = 0;
    for (const row of revenueResult.rows) {
      revenue[row.type] = {
        total: parseInt(row.total) / 100,
        count: parseInt(row.count),
      };
      totalRevenue += parseInt(row.total);
    }

    // Pro vs free users
    const proUsers = await query(
      `SELECT COUNT(*) FROM users WHERE tier = 'pro'`,
    );

    // Reported count
    const reported = await query(
      `SELECT COUNT(*) FROM submissions WHERE reported = TRUE`,
    );

    // Expiring soon (next 30 days)
    const expiringSoon = await query(
      `SELECT COUNT(*) FROM submissions WHERE storage_tier = 'free' AND expires_at IS NOT NULL AND expires_at < NOW() + INTERVAL '30 days' AND expires_at > NOW()`,
    );

    // Recent submissions (last 24h)
    const recent24h = await query(
      `SELECT COUNT(*) FROM submissions WHERE created_at > NOW() - INTERVAL '24 hours'`,
    );

    res.json({
      totalSubmissions: parseInt(submissions.rows[0].count),
      totalUsers: parseInt(users.rows[0].count),
      proUsers: parseInt(proUsers.rows[0].count),
      storageTiers: tiers,
      revenue,
      totalRevenueDollars: totalRevenue / 100,
      reportedCount: parseInt(reported.rows[0].count),
      expiringSoonCount: parseInt(expiringSoon.rows[0].count),
      recentSubmissions24h: parseInt(recent24h.rows[0].count),
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// Get flagged submissions
adminRouter.get('/flagged', async (req, res) => {
  try {
    const result = await query(
      `SELECT s.id, s.original_url, s.page_title, s.report_reason,
              s.capture_timestamp, s.created_at, s.updated_at,
              s.storage_tier, s.user_id, u.email as user_email
       FROM submissions s
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.reported = TRUE
       ORDER BY s.updated_at DESC`,
    );

    res.json({ flagged: result.rows });
  } catch (err) {
    console.error('Admin flagged error:', err);
    res.status(500).json({ error: 'Failed to fetch flagged submissions' });
  }
});

// Unflag a submission
adminRouter.post('/unflag/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await query(
      `UPDATE submissions SET reported = FALSE, report_reason = NULL, updated_at = NOW()
       WHERE id = $1`,
      [id],
    );
    res.json({ message: 'Submission unflagged' });
  } catch (err) {
    console.error('Admin unflag error:', err);
    res.status(500).json({ error: 'Failed to unflag submission' });
  }
});

// Hide a submission (soft delete — keeps data but marks hidden)
adminRouter.post('/hide/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await query(
      `UPDATE submissions SET status = 'hidden', reported = FALSE, updated_at = NOW()
       WHERE id = $1`,
      [id],
    );
    res.json({ message: 'Submission hidden' });
  } catch (err) {
    console.error('Admin hide error:', err);
    res.status(500).json({ error: 'Failed to hide submission' });
  }
});

// Unhide a submission
adminRouter.post('/unhide/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await query(
      `UPDATE submissions SET status = 'complete', updated_at = NOW()
       WHERE id = $1`,
      [id],
    );
    res.json({ message: 'Submission restored' });
  } catch (err) {
    console.error('Admin unhide error:', err);
    res.status(500).json({ error: 'Failed to unhide submission' });
  }
});

// Get all submissions (with user info and payment info)
adminRouter.get('/submissions', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const filter = req.query.filter; // 'reported', 'expiring', 'hidden', 'free', 'sealed', 'pro'

  try {
    let where = 'WHERE 1=1';
    if (filter === 'reported') where += ' AND s.reported = TRUE';
    if (filter === 'expiring') where += " AND s.storage_tier = 'free' AND s.expires_at IS NOT NULL AND s.expires_at < NOW() + INTERVAL '30 days' AND s.expires_at > NOW()";
    if (filter === 'hidden') where += " AND s.status = 'hidden'";
    if (filter === 'free') where += " AND s.storage_tier = 'free'";
    if (filter === 'sealed') where += " AND s.storage_tier = 'sealed'";
    if (filter === 'pro') where += " AND s.storage_tier = 'pro'";

    const result = await query(
      `SELECT s.id, s.original_url, s.page_title, s.status, s.ots_status, s.arweave_id,
              s.storage_tier, s.reported, s.report_reason, s.capture_timestamp,
              s.expires_at, s.created_at, s.capture_source, s.capture_warning,
              s.user_id, u.email as user_email, u.tier as user_tier
       FROM submissions s
       LEFT JOIN users u ON s.user_id = u.id
       ${where}
       ORDER BY s.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    const countResult = await query(`SELECT COUNT(*) FROM submissions s ${where}`);

    res.json({
      submissions: result.rows,
      total: parseInt(countResult.rows[0].count),
    });
  } catch (err) {
    console.error('Admin submissions error:', err);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// Get all users (with submission count and payment totals)
adminRouter.get('/users', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  try {
    const result = await query(
      `SELECT u.id, u.email, u.tier, u.stripe_customer_id, u.stripe_subscription_id,
              u.submissions_today, u.created_at,
              COUNT(DISTINCT s.id) as submission_count,
              COALESCE(SUM(p.amount_cents), 0) as total_paid_cents
       FROM users u
       LEFT JOIN submissions s ON s.user_id = u.id
       LEFT JOIN payments p ON p.user_id = u.id AND p.status = 'completed'
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    const countResult = await query('SELECT COUNT(*) FROM users');

    res.json({
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
    });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get single user detail with all their submissions and payments
adminRouter.get('/users/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const userResult = await query(
      `SELECT id, email, tier, stripe_customer_id, stripe_subscription_id,
              submissions_today, created_at, updated_at
       FROM users WHERE id = $1`,
      [id],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const submissions = await query(
      `SELECT id, original_url, page_title, status, storage_tier, ots_status,
              expires_at, capture_timestamp, capture_source
       FROM submissions WHERE user_id = $1 ORDER BY created_at DESC`,
      [id],
    );

    const payments = await query(
      `SELECT id, submission_id, stripe_payment_id, type, amount_cents, status, created_at
       FROM payments WHERE user_id = $1 ORDER BY created_at DESC`,
      [id],
    );

    res.json({
      user: userResult.rows[0],
      submissions: submissions.rows,
      payments: payments.rows,
    });
  } catch (err) {
    console.error('Admin user detail error:', err);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// Get all payments
adminRouter.get('/payments', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  try {
    const result = await query(
      `SELECT p.id, p.user_id, p.submission_id, p.stripe_payment_id,
              p.type, p.amount_cents, p.status, p.created_at,
              u.email as user_email
       FROM payments p
       LEFT JOIN users u ON p.user_id = u.id
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    const countResult = await query('SELECT COUNT(*) FROM payments');
    const totalResult = await query(
      `SELECT COALESCE(SUM(amount_cents), 0) as total FROM payments WHERE status = 'completed'`,
    );

    res.json({
      payments: result.rows,
      total: parseInt(countResult.rows[0].count),
      totalRevenueCents: parseInt(totalResult.rows[0].total),
    });
  } catch (err) {
    console.error('Admin payments error:', err);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});
