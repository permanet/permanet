import pg from 'pg';

const { Pool } = pg;

let pool;
let useMemoryDb = false;
let memoryUsers = [];
let memorySubmissions = [];
let memorySessions = [];
let memoryPayments = [];

function getPool() {
  if (!pool && !useMemoryDb) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn('No DATABASE_URL set — using in-memory store (dev mode only)');
    useMemoryDb = true;
    return;
  }

  try {
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          tier TEXT DEFAULT 'free',
          stripe_customer_id TEXT,
          stripe_subscription_id TEXT,
          submissions_today INTEGER DEFAULT 0,
          submissions_reset_date DATE DEFAULT CURRENT_DATE,
          credits_remaining INTEGER DEFAULT 10,
          credits_reset_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id UUID PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token TEXT UNIQUE NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS submissions (
          id UUID PRIMARY KEY,
          user_id UUID REFERENCES users(id),
          original_url TEXT NOT NULL,
          capture_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          root_hash TEXT,
          ipfs_cid TEXT,
          arweave_id TEXT,
          arweave_url TEXT,
          ots_proof BYTEA,
          ots_status TEXT DEFAULT 'pending',
          ots_bitcoin_block TEXT,
          ots_block_time TIMESTAMPTZ,
          status TEXT DEFAULT 'processing',
          storage_tier TEXT DEFAULT 'free',
          expires_at TIMESTAMPTZ,
          error_message TEXT,
          page_title TEXT,
          page_description TEXT,
          og_image TEXT,
          screenshot_path TEXT,
          dom_path TEXT,
          assets_manifest JSONB,
          video_timestamp_offset REAL DEFAULT 0,
          reported BOOLEAN DEFAULT FALSE,
          report_reason TEXT,
          capture_warning TEXT,
          capture_source TEXT DEFAULT 'server',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Migrations for existing installs
        ALTER TABLE submissions ADD COLUMN IF NOT EXISTS capture_warning TEXT;
        ALTER TABLE submissions ADD COLUMN IF NOT EXISTS capture_source TEXT DEFAULT 'server';
        ALTER TABLE submissions ADD COLUMN IF NOT EXISTS arweave_id TEXT;
        ALTER TABLE submissions ADD COLUMN IF NOT EXISTS arweave_url TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_remaining INTEGER DEFAULT 10;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_reset_at TIMESTAMPTZ;

        CREATE TABLE IF NOT EXISTS payments (
          id UUID PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id),
          submission_id UUID REFERENCES submissions(id),
          stripe_payment_id TEXT,
          type TEXT NOT NULL,
          amount_cents INTEGER NOT NULL,
          currency TEXT DEFAULT 'usd',
          status TEXT DEFAULT 'pending',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
        CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);
        CREATE INDEX IF NOT EXISTS idx_submissions_reported ON submissions(reported) WHERE reported = TRUE;
        CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_submissions_expires ON submissions(expires_at) WHERE storage_tier = 'free';
        CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
      `);
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('PostgreSQL unavailable, falling back to in-memory store:', err.message);
    useMemoryDb = true;
  }
}

export async function query(text, params) {
  if (useMemoryDb) {
    return memoryQuery(text, params);
  }
  return getPool().query(text, params);
}

// Minimal in-memory SQL emulator for dev/demo
function memoryQuery(text, params) {
  const cmd = text.trim();
  const upper = cmd.toUpperCase();

  // Determine which store
  const table = detectTable(cmd);
  const getArr = () => {
    switch (table) {
      case 'users': return memoryUsers;
      case 'sessions': return memorySessions;
      case 'payments': return memoryPayments;
      default: return memorySubmissions;
    }
  };

  if (upper.startsWith('INSERT')) {
    const row = {};
    const colMatch = cmd.match(/\(([^)]+)\)\s*VALUES/i);
    if (colMatch) {
      const cols = colMatch[1].split(',').map((c) => c.trim());
      cols.forEach((col, i) => { row[col] = params?.[i] ?? null; });
    }
    row.created_at = row.created_at || new Date().toISOString();
    row.updated_at = row.updated_at || new Date().toISOString();

    if (table === 'submissions') {
      row.capture_timestamp = row.capture_timestamp || new Date().toISOString();
      row.ots_status = row.ots_status || 'pending';
      row.status = row.status || 'processing';
      row.storage_tier = row.storage_tier || 'free';
      row.reported = row.reported || false;
      row.video_timestamp_offset = row.video_timestamp_offset || 0;
      if (!row.expires_at && row.storage_tier === 'free') {
        const exp = new Date();
        exp.setFullYear(exp.getFullYear() + 2);
        row.expires_at = exp.toISOString();
      }
    } else if (table === 'users') {
      row.tier = row.tier || 'free';
      row.submissions_today = row.submissions_today || 0;
      row.submissions_reset_date = row.submissions_reset_date || new Date().toISOString().slice(0, 10);
      if (memoryUsers.find((u) => u.email === row.email)) {
        const err = new Error('duplicate key value violates unique constraint');
        err.code = '23505';
        throw err;
      }
    }

    getArr().push(row);
    return { rows: [row], rowCount: 1 };
  }

  if (upper.startsWith('UPDATE')) {
    const arr = getArr();
    let row;

    // Find the row by different WHERE conditions
    if (/WHERE\s+token\s*=\s*\$/i.test(cmd)) {
      const m = cmd.match(/token\s*=\s*\$(\d+)/i);
      row = arr.find((r) => r.token === params?.[parseInt(m[1]) - 1]);
    } else if (/WHERE\s+email\s*=\s*\$/i.test(cmd)) {
      const m = cmd.match(/email\s*=\s*\$(\d+)/i);
      row = arr.find((r) => r.email === params?.[parseInt(m[1]) - 1]);
    } else if (/WHERE\s+stripe_customer_id\s*=\s*\$/i.test(cmd)) {
      const m = cmd.match(/stripe_customer_id\s*=\s*\$(\d+)/i);
      row = arr.find((r) => r.stripe_customer_id === params?.[parseInt(m[1]) - 1]);
    } else {
      row = arr.find((r) => r.id === params?.[0]);
    }

    if (!row) return { rows: [], rowCount: 0 };

    const setMatch = cmd.match(/SET\s+([\s\S]+?)(?:WHERE|$)/i);
    if (setMatch) {
      for (const part of setMatch[1].split(',')) {
        const eqMatch = part.trim().match(/(\w+)\s*=\s*\$(\d+)/);
        if (eqMatch) { row[eqMatch[1]] = params?.[parseInt(eqMatch[2]) - 1] ?? null; continue; }
        const nowMatch = part.trim().match(/(\w+)\s*=\s*NOW\(\)/);
        if (nowMatch) { row[nowMatch[1]] = new Date().toISOString(); continue; }
        const incrMatch = part.trim().match(/(\w+)\s*=\s*\1\s*\+\s*1/);
        if (incrMatch) { row[incrMatch[1]] = (parseInt(row[incrMatch[1]]) || 0) + 1; continue; }
        const dateMatch = part.trim().match(/(\w+)\s*=\s*CURRENT_DATE/);
        if (dateMatch) { row[dateMatch[1]] = new Date().toISOString().slice(0, 10); continue; }
        const litMatch = part.trim().match(/(\w+)\s*=\s*'([^']*)'/);
        if (litMatch) { row[litMatch[1]] = litMatch[2]; continue; }
      }
    }
    row.updated_at = new Date().toISOString();
    return { rows: [row], rowCount: 1 };
  }

  if (upper.startsWith('DELETE')) {
    const arr = getArr();
    if (/WHERE\s+token\s*=\s*\$/i.test(cmd)) {
      const m = cmd.match(/token\s*=\s*\$(\d+)/i);
      const idx = arr.findIndex((r) => r.token === params?.[parseInt(m[1]) - 1]);
      if (idx >= 0) arr.splice(idx, 1);
    }
    return { rows: [], rowCount: 0 };
  }

  if (upper.startsWith('SELECT COUNT')) {
    return { rows: [{ count: getArr().length }], rowCount: 1 };
  }

  if (upper.startsWith('SELECT')) {
    const arr = getArr();

    // WHERE id = $1
    if (/WHERE\s+id\s*=\s*\$1/i.test(cmd) && params?.[0]) {
      const row = arr.find((r) => r.id === params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    // WHERE token = $1
    if (/WHERE\s+token\s*=\s*\$1/i.test(cmd) && params?.[0]) {
      const row = arr.find((r) => r.token === params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    // WHERE email = $1
    if (/WHERE\s+email\s*=\s*\$1/i.test(cmd) && params?.[0]) {
      const row = arr.find((r) => r.email === params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    // WHERE user_id = $1
    if (/WHERE\s+user_id\s*=\s*\$1/i.test(cmd) && params?.[0]) {
      let rows = arr.filter((r) => r.user_id === params[0]);
      rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return applyPagination(cmd, params, rows);
    }

    // WHERE stripe_customer_id = $1
    if (/WHERE\s+stripe_customer_id\s*=\s*\$1/i.test(cmd) && params?.[0]) {
      const row = arr.find((r) => r.stripe_customer_id === params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    // WHERE reported = TRUE
    if (/reported\s*=\s*TRUE/i.test(cmd)) {
      const rows = arr.filter((r) => r.reported);
      return { rows, rowCount: rows.length };
    }

    // Default: recent complete, non-reported
    let rows = arr.filter((r) => (r.status === 'complete' || !r.status) && !r.reported);
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return applyPagination(cmd, params, rows);
  }

  return { rows: [], rowCount: 0 };
}

function detectTable(cmd) {
  if (/\busers\b/i.test(cmd) && !/\bsubmissions\b/i.test(cmd) && !/\bsessions\b/i.test(cmd)) return 'users';
  if (/\bsessions\b/i.test(cmd)) return 'sessions';
  if (/\bpayments\b/i.test(cmd)) return 'payments';
  return 'submissions';
}

function applyPagination(cmd, params, rows) {
  const limitMatch = cmd.match(/LIMIT\s+\$(\d+)/i);
  const offsetMatch = cmd.match(/OFFSET\s+\$(\d+)/i);
  const limit = limitMatch ? params?.[parseInt(limitMatch[1]) - 1] : 50;
  const offset = offsetMatch ? params?.[parseInt(offsetMatch[1]) - 1] : 0;
  rows = rows.slice(offset, offset + limit);
  return { rows, rowCount: rows.length };
}
