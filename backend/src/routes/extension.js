import { Router } from 'express';
import { createExtensionArchive } from '../services/archive.js';
import { optionalAuth } from '../middleware/auth.js';
import { query } from '../config/database.js';

export const extensionRouter = Router();

extensionRouter.post('/', optionalAuth, async (req, res) => {
  const { url, screenshot, dom, metadata } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  if (!screenshot) {
    return res.status(400).json({ error: 'Screenshot is required' });
  }
  if (!dom) {
    return res.status(400).json({ error: 'DOM content is required' });
  }

  // Basic URL validation
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid protocol');
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL. Must be http or https.' });
  }

  // Check daily submission limit for authenticated users
  const user = req.user;
  let storageTier = 'free';

  if (user) {
    const today = new Date().toISOString().slice(0, 10);
    if (user.submissions_reset_date !== today) {
      await query(
        `UPDATE users SET submissions_today = 0, submissions_reset_date = CURRENT_DATE, updated_at = NOW() WHERE id = $1`,
        [user.id],
      );
      user.submissions_today = 0;
    }

    if (user.tier === 'free') {
      const dailyLimit = 10;
      if (user.submissions_today >= dailyLimit) {
        return res.status(429).json({
          error: 'Daily submission limit reached',
          message: `Free tier allows ${dailyLimit} submissions per day. Upgrade to Pro for unlimited.`,
          limit: dailyLimit,
          used: user.submissions_today,
        });
      }
    }

    if (user.tier === 'pro') {
      storageTier = 'pro';
    }

    // Increment daily counter
    await query(
      `UPDATE users SET submissions_today = submissions_today + 1, updated_at = NOW() WHERE id = $1`,
      [user.id],
    );
  }

  try {
    // Return 202 immediately, process in background
    const { submissionId } = await createExtensionArchive(
      parsedUrl.href,
      screenshot,
      dom,
      metadata || {},
      user?.id,
      storageTier,
    );

    res.status(202).json({
      submissionId,
      archiveUrl: `/archive/${submissionId}`,
      status: 'processing',
      message: 'Archive is being created from your browser capture.',
    });
  } catch (err) {
    console.error('Extension submit error:', err);
    res.status(500).json({
      error: 'Archive creation failed',
      message: err.message,
    });
  }
});
