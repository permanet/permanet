import dotenv from 'dotenv';
import { existsSync as envExists } from 'fs';

// Load .env from backend dir or parent dir
if (envExists('.env')) {
  dotenv.config();
} else if (envExists('../.env')) {
  dotenv.config({ path: '../.env' });
}
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { existsSync } from 'fs';
import { submitRouter } from './routes/submit.js';
import { archiveRouter } from './routes/archive.js';
import { verifyRouter } from './routes/verify.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { stripeRouter } from './routes/stripe.js';
import { extensionRouter } from './routes/extension.js';
import { initDatabase, query } from './config/database.js';
import { startOtsUpgrader } from './services/otsUpgrader.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust Cloudflare Tunnel proxy (fixes X-Forwarded-For for rate limiting)
app.set('trust proxy', 1);

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: (origin, callback) => {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      // Allow: frontend, chrome extensions, no-origin (server-to-server)
      if (!origin || origin === frontendUrl || origin.startsWith('chrome-extension://')) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive for now — tighten in production
      }
    },
  }),
);
// Stripe webhook needs raw body for signature verification — mount BEFORE json parser
app.use('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(morgan('combined'));

// Serve archived screenshots (immutable captures — cache aggressively)
app.use('/captures', express.static('captures', { maxAge: '7d' }));

// Serve built frontend in production
if (existsSync('public')) {
  app.use(express.static('public'));
}

// API Routes — all under /api prefix
app.use('/api/auth', authRouter);
app.use('/api/submit', submitRouter);
app.use('/api/archive', archiveRouter);
app.use('/api/verify', verifyRouter);
app.use('/api/admin', adminRouter);
app.use('/api/stripe', stripeRouter);
app.use('/api/extension', extensionRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// JSON 404 for unknown API routes (before SPA fallback)
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// SPA fallback — serve index.html for unmatched routes (production)
// Set Cache-Control: no-store so CDNs never cache the HTML fallback for non-HTML URLs
if (existsSync('public/index.html')) {
  const { readFileSync } = await import('fs');
  const indexHtml = readFileSync('public/index.html', 'utf-8');
  app.get('*', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('html').send(indexHtml);
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

/**
 * Monthly credit reset for Pro subscribers.
 * Runs every hour, resets credits for Pro users whose credits_reset_at has passed.
 * Also resets free-tier daily credits at midnight.
 */
function startCreditResetChecker() {
  const INTERVAL = 60 * 60 * 1000; // 1 hour

  async function checkResets() {
    try {
      // Reset Pro users whose billing period has elapsed
      const proResult = await query(
        `UPDATE users SET
           credits_remaining = 200,
           credits_reset_at = credits_reset_at + INTERVAL '1 month'
         WHERE tier = 'pro'
           AND credits_reset_at IS NOT NULL
           AND credits_reset_at <= NOW()
         RETURNING id`,
      );
      if (proResult.rows?.length > 0) {
        console.log(`[Credit Reset] Reset credits for ${proResult.rows.length} Pro user(s)`);
      }

      // Reset free-tier users daily (if submissions_reset_date is not today)
      const freeResult = await query(
        `UPDATE users SET
           credits_remaining = 10,
           submissions_today = 0,
           submissions_reset_date = CURRENT_DATE
         WHERE (tier = 'free' OR tier IS NULL)
           AND (submissions_reset_date IS NULL OR submissions_reset_date < CURRENT_DATE)
         RETURNING id`,
      );
      if (freeResult.rows?.length > 0) {
        console.log(`[Credit Reset] Reset daily credits for ${freeResult.rows.length} free user(s)`);
      }
    } catch (err) {
      console.error('[Credit Reset] Error:', err.message);
    }
  }

  // Run immediately on startup, then every hour
  checkResets();
  setInterval(checkResets, INTERVAL);
  console.log('[Credit Reset] Started — checking every hour');
}

async function start() {
  try {
    await initDatabase();
    console.log('Database initialized');

    // Start background OTS upgrade checker
    startOtsUpgrader();

    // Start credit reset checker
    startCreditResetChecker();

    app.listen(PORT, () => {
      console.log(`Permanet backend running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
