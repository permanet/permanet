import { Router } from 'express';
import { createArchive } from '../services/archive.js';
import { captureUrl } from '../services/capture.js';
import { submitLimiter } from '../middleware/rateLimit.js';
import { optionalAuth } from '../middleware/auth.js';
import { query } from '../config/database.js';

export const submitRouter = Router();

submitRouter.post('/', submitLimiter, optionalAuth, async (req, res) => {
  const { url, videoTimestampOffset, confirmed, useCompression } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // URL validation
  if (url.length > 2048) {
    return res.status(400).json({ error: 'URL too long. Maximum 2048 characters.' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid protocol');
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL. Must be http or https.' });
  }

  // SSRF protection — block private/internal IPs
  const hostname = parsedUrl.hostname.toLowerCase();
  const blockedPatterns = [
    /^localhost$/i, /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
    /^0\./, /^169\.254\./, /^::1$/, /^fc00:/, /^fe80:/, /^fd/,
  ];
  if (blockedPatterns.some((p) => p.test(hostname))) {
    return res.status(400).json({ error: 'Cannot archive internal or private network addresses.' });
  }

  const offset = parseFloat(videoTimestampOffset) || 0;
  if (offset < 0 || offset > 3600) {
    return res.status(400).json({
      error: 'Video timestamp offset must be between 0 and 3600 seconds',
    });
  }

  // Check credits and limits for authenticated users
  const user = req.user;
  let storageTier = 'free';

  if (user) {
    // Reset daily counter if it's a new day
    const today = new Date().toISOString().slice(0, 10);
    if (user.submissions_reset_date !== today) {
      await query(
        `UPDATE users SET submissions_today = 0, submissions_reset_date = CURRENT_DATE,
         credits_remaining = CASE WHEN tier = 'free' THEN 10 ELSE credits_remaining END,
         updated_at = NOW() WHERE id = $1`,
        [user.id],
      );
      user.submissions_today = 0;
      if (user.tier === 'free') user.credits_remaining = 10;
    }

    // Check if user has ANY credits before starting
    const creditsRemaining = user.credits_remaining ?? (user.tier === 'pro' ? 200 : 10);
    if (creditsRemaining <= 0) {
      return res.status(429).json({
        error: 'No credits remaining',
        message: user.tier === 'free'
          ? 'Free tier allows 10 credits per day. Upgrade to Pro for 200 credits/month.'
          : 'You have used all 200 credits this month. Credits reset on your billing anniversary.',
        creditsRemaining: 0,
      });
    }

    if (user.tier === 'pro') {
      storageTier = 'pro';
    }
  }

  try {
    // For the confirmation flow: if this is a pre-check (not yet confirmed),
    // do a quick capture to measure size. If >10MB, ask user to confirm.
    // If confirmed or <=10MB, proceed directly.
    if (user && !confirmed) {
      // Do a quick capture to measure page size
      const tempId = `estimate-${Date.now()}`;
      try {
        const estimate = await captureUrl(tempId, parsedUrl.href, offset);
        const captureSizeMB = estimate.totalSizeBytes / (1024 * 1024);
        const creditsRequired = Math.max(1, Math.ceil(captureSizeMB / 10));
        const creditsRemaining = user.credits_remaining ?? (user.tier === 'pro' ? 200 : 10);

        // Check if user has enough credits
        if (creditsRemaining < creditsRequired) {
          // Clean up temp capture
          const { rm } = await import('fs/promises');
          await rm(estimate.captureDir, { recursive: true, force: true });
          return res.status(429).json({
            error: 'insufficient_credits',
            creditsRequired,
            creditsRemaining,
            captureSizeMB: parseFloat(captureSizeMB.toFixed(1)),
            message: `This submission requires ${creditsRequired} credit${creditsRequired > 1 ? 's' : ''} (page size: ${captureSizeMB.toFixed(1)}MB). You have ${creditsRemaining} remaining.`,
          });
        }

        // If page is over 10MB, ask for confirmation before proceeding
        if (captureSizeMB > 10) {
          // Clean up temp capture
          const { rm } = await import('fs/promises');
          await rm(estimate.captureDir, { recursive: true, force: true });
          return res.status(200).json({
            status: 'requires_confirmation',
            captureSizeMB: parseFloat(captureSizeMB.toFixed(1)),
            creditsRequired,
            creditsRemaining,
            message: `This page is ${captureSizeMB.toFixed(1)}MB and will use ${creditsRequired} credits.`,
          });
        }

        // Page is <=10MB, clean up temp and proceed normally with 1 credit
        const { rm } = await import('fs/promises');
        await rm(estimate.captureDir, { recursive: true, force: true });

        // Deduct 1 credit
        await query(
          `UPDATE users SET
             submissions_today = submissions_today + 1,
             credits_remaining = GREATEST(0, credits_remaining - 1),
             updated_at = NOW()
           WHERE id = $1`,
          [user.id],
        );

      } catch (captureErr) {
        // If estimate capture fails, fall through and let the real capture handle it
        console.warn('Size estimate failed, proceeding with 1 credit:', captureErr.message);
        // Deduct 1 credit as fallback
        await query(
          `UPDATE users SET
             submissions_today = submissions_today + 1,
             credits_remaining = GREATEST(0, credits_remaining - 1),
             updated_at = NOW()
           WHERE id = $1`,
          [user.id],
        );
      }
    } else if (user && confirmed) {
      // User confirmed a large page — calculate and deduct correct credits
      // The actual credit amount will be based on the final capture
      // For now, deduct 1 credit if compressed, or estimate based on previous size
      const creditsToDeduct = useCompression ? 1 : (req.body.creditsRequired || 1);
      const creditsRemaining = user.credits_remaining ?? (user.tier === 'pro' ? 200 : 10);

      if (creditsRemaining < creditsToDeduct) {
        return res.status(429).json({
          error: 'insufficient_credits',
          creditsRequired: creditsToDeduct,
          creditsRemaining,
          message: `Not enough credits. Required: ${creditsToDeduct}, remaining: ${creditsRemaining}.`,
        });
      }

      await query(
        `UPDATE users SET
           submissions_today = submissions_today + 1,
           credits_remaining = GREATEST(0, credits_remaining - $2),
           updated_at = NOW()
         WHERE id = $1`,
        [user.id, creditsToDeduct],
      );
    } else if (!user) {
      // Anonymous users — no credit tracking, just proceed
    }

    const { submissionId } = await createArchive(
      parsedUrl.href,
      offset,
      user?.id,
      storageTier,
      { useCompression: useCompression || false, confirmed: confirmed || false },
    );

    res.status(202).json({
      submissionId,
      verificationUrl: `/archive/${submissionId}`,
      status: 'processing',
      message: 'Archive is being created. Check the verification URL for status.',
    });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({
      error: 'Archive creation failed',
      message: err.message,
    });
  }
});
