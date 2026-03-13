import { Router } from 'express';
import { query } from '../config/database.js';

export const archiveRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Get full submission metadata
archiveRouter.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid archive ID' });

  try {
    const result = await query(
      `SELECT
        id, user_id, original_url, capture_timestamp, root_hash,
        arweave_id, arweave_url,
        ots_status, ots_bitcoin_block, ots_block_time, status,
        storage_tier, expires_at, page_title, page_description, og_image,
        screenshot_path, assets_manifest, video_timestamp_offset,
        reported, created_at, updated_at, capture_warning, capture_source
       FROM submissions WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Archive not found' });
    }

    const row = result.rows[0];

    // Compute days until expiry for free tier
    let expiryInfo = null;
    if (row.storage_tier === 'free' && row.expires_at) {
      const daysLeft = Math.ceil(
        (new Date(row.expires_at) - new Date()) / (1000 * 60 * 60 * 24),
      );
      expiryInfo = {
        expiresAt: row.expires_at,
        daysRemaining: Math.max(0, daysLeft),
      };
    }

    res.json({
      id: row.id,
      userId: row.user_id,
      url: row.original_url,
      captureTimestamp: row.capture_timestamp,
      rootHash: row.root_hash,
      arweaveId: row.arweave_id,
      arweaveUrl: row.arweave_url,
      otsStatus: row.ots_status,
      otsBitcoinBlock: row.ots_bitcoin_block,
      otsBlockTime: row.ots_block_time,
      status: row.status,
      storageTier: row.storage_tier,
      expiryInfo,
      title: row.page_title,
      description: row.page_description,
      ogImage: row.og_image,
      screenshotUrl: row.screenshot_path
        ? `/${row.screenshot_path}?v=${new Date(row.created_at).getTime()}`
        : null,
      assets: row.assets_manifest,
      videoTimestampOffset: row.video_timestamp_offset,
      reported: row.reported,
      captureWarning: row.capture_warning || null,
      captureSource: row.capture_source || 'server',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error('Archive fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch archive' });
  }
});

// Report a submission
archiveRouter.post('/:id/report', async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid archive ID' });
  const { reason } = req.body;

  try {
    const result = await query(
      `UPDATE submissions SET reported = TRUE, report_reason = $2, updated_at = NOW()
       WHERE id = $1 RETURNING id`,
      [id, reason || 'No reason provided'],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Archive not found' });
    }

    res.json({ message: 'Report submitted for review' });
  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// Get recent public archives
archiveRouter.get('/', async (req, res) => {
  const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 20, 100));
  const offset = Math.max(0, parseInt(req.query.offset) || 0);

  try {
    const result = await query(
      `SELECT id, original_url, capture_timestamp, root_hash, arweave_id,
              ots_status, status, page_title, screenshot_path, created_at
       FROM submissions
       WHERE status = 'complete' AND reported = FALSE
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    res.json({
      archives: result.rows.map((row) => ({
        id: row.id,
        url: row.original_url,
        title: row.page_title,
        captureTimestamp: row.capture_timestamp,
        rootHash: row.root_hash,
        arweaveId: row.arweave_id,
        otsStatus: row.ots_status,
        screenshotUrl: row.screenshot_path ? `/${row.screenshot_path}?v=${new Date(row.created_at).getTime()}` : null,
        createdAt: row.created_at,
      })),
      total: result.rowCount,
    });
  } catch (err) {
    console.error('Archive list error:', err);
    res.status(500).json({ error: 'Failed to fetch archives' });
  }
});
