import { v4 as uuidv4 } from 'uuid';
import { captureUrl } from './capture.js';
import { hashCaptureDirectory } from './hash.js';
import { uploadToArweave } from './arweave.js';
import { submitToOpenTimestamps } from './timestamp.js';
import { query } from '../config/database.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const CAPTURES_DIR = 'captures';

/**
 * Format a Date object into a short, human-readable timestamp for titles.
 * e.g. "Mar 10, 2026, 4:32 PM"
 */
function formatTimestamp(d) {
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Generate a smart, descriptive title from URL + captured metadata.
 * Platform-specific titles for X.com, YouTube, Reddit, etc.
 * Falls back to document title or URL.
 */
function generateTitle(url, metadata) {
  const parsed = new URL(url);
  const host = parsed.hostname.replace('www.', '');
  const platform = metadata.platform || {};

  // X.com / Twitter
  if (host === 'x.com' || host === 'twitter.com') {
    // Extract handle from URL as fallback: x.com/{handle}/status/...
    const urlMatch = parsed.pathname.match(/^\/([^/]+)\/status\//);
    const handle = platform.handle || (urlMatch ? `@${urlMatch[1]}` : null);
    let ts = '';
    if (platform.postTimestamp) {
      const d = new Date(platform.postTimestamp);
      ts = ` — ${formatTimestamp(d)}`;
    }
    if (handle) {
      return `X.com — ${handle}${ts}`;
    }
    return `X.com post${ts}`;
  }

  // YouTube
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const videoTitle = metadata.ogTitle || metadata.title;
    const channel = platform.channelName;
    let ts = '';
    if (platform.publishDate) {
      const d = new Date(platform.publishDate);
      ts = ` — ${formatTimestamp(d)}`;
    }
    if (videoTitle && channel) {
      return `YouTube — ${channel} — ${videoTitle}${ts}`;
    }
    if (videoTitle) return `YouTube — ${videoTitle}${ts}`;
    return `YouTube video${ts}`;
  }

  // Reddit
  if (host === 'reddit.com' || host === 'old.reddit.com') {
    const sub = platform.subreddit;
    const author = platform.author;
    const postTitle = metadata.ogTitle || metadata.title?.replace(/ : .*$/, '');
    let ts = '';
    if (platform.postTimestamp) {
      const d = new Date(platform.postTimestamp);
      ts = ` — ${formatTimestamp(d)}`;
    }
    if (sub && postTitle) return `Reddit — ${sub} — ${postTitle}${ts}`;
    if (postTitle) return `Reddit — ${postTitle}${ts}`;
    return `Reddit post${ts}`;
  }

  // Instagram
  if (host === 'instagram.com') {
    const urlMatch = parsed.pathname.match(/^\/([^/]+)\//);
    const handle = platform.handle || (urlMatch ? `@${urlMatch[1]}` : null);
    let ts = '';
    if (platform.postTimestamp) {
      const d = new Date(platform.postTimestamp);
      ts = ` — ${formatTimestamp(d)}`;
    }
    if (handle && handle !== '@p' && handle !== '@reel') {
      return `Instagram — ${handle}${ts}`;
    }
    return `Instagram post${ts}`;
  }

  // TikTok
  if (host === 'tiktok.com') {
    const urlMatch = parsed.pathname.match(/^\/@([^/]+)/);
    const handle = urlMatch ? `@${urlMatch[1]}` : null;
    let ts = '';
    if (platform.postTimestamp) {
      const d = new Date(platform.postTimestamp);
      ts = ` — ${formatTimestamp(d)}`;
    }
    if (handle) return `TikTok — ${handle}${ts}`;
    return `${metadata.ogTitle || 'TikTok video'}${ts}`;
  }

  // LinkedIn
  if (host === 'linkedin.com') {
    let ts = '';
    if (platform.postTimestamp) {
      const d = new Date(platform.postTimestamp);
      ts = ` — ${formatTimestamp(d)}`;
    }
    if (parsed.pathname.includes('/posts/')) return `LinkedIn post${ts}`;
    return `${metadata.ogTitle || metadata.title || 'LinkedIn'}${ts}`;
  }

  // Facebook
  if (host === 'facebook.com' || host === 'fb.com') {
    let ts = '';
    if (platform.postTimestamp) {
      const d = new Date(platform.postTimestamp);
      ts = ` — ${formatTimestamp(d)}`;
    }
    return `Facebook post${ts}`;
  }

  // Threads
  if (host === 'threads.net') {
    const handle = platform.handle;
    let ts = '';
    if (platform.postTimestamp) {
      const d = new Date(platform.postTimestamp);
      ts = ` — ${formatTimestamp(d)}`;
    }
    if (handle) return `Threads — ${handle}${ts}`;
    return `Threads post${ts}`;
  }

  // Wikipedia
  if (host.endsWith('wikipedia.org')) {
    const article = parsed.pathname.replace('/wiki/', '').replace(/_/g, ' ');
    if (article) return `Wikipedia — ${decodeURIComponent(article)}`;
  }

  // GitHub
  if (host === 'github.com') {
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return `GitHub — ${parts[0]}/${parts[1]}`;
    return metadata.title || 'GitHub';
  }

  // News sites — use og:title which is usually cleaner
  if (metadata.ogTitle && metadata.ogTitle.length > 5) {
    return metadata.ogTitle;
  }

  // Default: use document title, or fallback to hostname + path
  if (metadata.title && metadata.title.length > 3) {
    return metadata.title;
  }

  return `${host}${parsed.pathname}`;
}

/**
 * Orchestrate the full archive pipeline:
 * 1. Capture page with Playwright
 * 2. Hash all assets + build Merkle tree
 * 3. Submit root hash to OpenTimestamps
 * 4. Upload to Arweave for permanent storage
 * 5. Store everything in PostgreSQL
 */
export async function createArchive(url, videoTimestampOffset = 0, userId = null, storageTier = 'free', options = {}) {
  const { useCompression = false, confirmed = false } = options;
  const submissionId = uuidv4();

  // Compute expiry for free tier (2 years)
  let expiresAt = null;
  if (storageTier === 'free') {
    const exp = new Date();
    exp.setFullYear(exp.getFullYear() + 2);
    expiresAt = exp.toISOString();
  }

  // Insert initial record
  await query(
    `INSERT INTO submissions (id, user_id, original_url, video_timestamp_offset, status, storage_tier, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [submissionId, userId, url, videoTimestampOffset, 'capturing', storageTier, expiresAt],
  );

  // Process in background — return submission ID immediately so the user
  // sees the "Finalizing your archive" page instead of waiting for capture
  processArchive(submissionId, url, videoTimestampOffset, { useCompression }).catch((err) => {
    console.error(`[${submissionId}] Archive background processing failed:`, err);
  });

  return { submissionId };
}

async function processArchive(submissionId, url, videoTimestampOffset, options = {}) {
  try {
    // Step 1: Capture
    console.log(`[${submissionId}] Capturing: ${url}${options.useCompression ? ' (compressed)' : ''}`);
    await updateStatus(submissionId, 'capturing');
    const capture = await captureUrl(submissionId, url, videoTimestampOffset, options);

    // Log capture size
    const captureSizeMB = (capture.totalSizeBytes / (1024 * 1024)).toFixed(2);
    const creditsUsed = Math.max(1, Math.ceil(capture.totalSizeBytes / (10 * 1024 * 1024)));
    console.log(`[${submissionId}] Capture size: ${captureSizeMB}MB, credits: ${creditsUsed}`);

    // Generate smart title from URL + captured metadata
    const smartTitle = generateTitle(url, capture.metadata);
    console.log(`[${submissionId}] Title: ${smartTitle}`);

    // Update with metadata
    await query(
      `UPDATE submissions SET
        page_title = $2,
        page_description = $3,
        og_image = $4,
        screenshot_path = $5,
        dom_path = $6,
        capture_warning = $7
       WHERE id = $1`,
      [
        submissionId,
        smartTitle,
        capture.metadata.description,
        capture.metadata.ogImage,
        capture.screenshotPath,
        capture.domPath,
        capture.metadata.captureWarning || null,
      ],
    );

    // Step 2: Hash
    console.log(`[${submissionId}] Hashing assets...`);
    await updateStatus(submissionId, 'hashing');
    const hashResult = await hashCaptureDirectory(capture.captureDir);

    // Save manifest
    const manifestPath = join(capture.captureDir, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(hashResult, null, 2));

    await query(
      `UPDATE submissions SET
        root_hash = $2,
        assets_manifest = $3
       WHERE id = $1`,
      [submissionId, hashResult.rootHash, JSON.stringify(hashResult.manifest)],
    );

    // Step 3: OpenTimestamps
    console.log(`[${submissionId}] Submitting to OpenTimestamps...`);
    await updateStatus(submissionId, 'timestamping');
    try {
      const otsResult = await submitToOpenTimestamps(hashResult.rootHash);
      await query(
        `UPDATE submissions SET ots_proof = $2, ots_status = $3 WHERE id = $1`,
        [submissionId, otsResult.proof, otsResult.status],
      );
    } catch (otsErr) {
      console.error(`[${submissionId}] OTS failed:`, otsErr.message);
      await query(
        `UPDATE submissions SET ots_status = 'failed' WHERE id = $1`,
        [submissionId],
      );
      // Non-fatal — continue without timestamp
    }

    // Step 4: Arweave
    console.log(`[${submissionId}] Uploading to Arweave...`);
    await updateStatus(submissionId, 'storing');
    try {
      const arweaveResult = await uploadToArweave(capture.captureDir, submissionId);
      await query(
        `UPDATE submissions SET arweave_id = $2, arweave_url = $3 WHERE id = $1`,
        [submissionId, arweaveResult.id, arweaveResult.url],
      );
    } catch (arweaveErr) {
      console.error(`[${submissionId}] Arweave failed:`, arweaveErr.message);
      // Non-fatal — continue without Arweave
    }

    // Step 5: Mark complete
    await query(
      `UPDATE submissions SET
        status = 'complete',
        capture_timestamp = NOW(),
        updated_at = NOW()
       WHERE id = $1`,
      [submissionId],
    );

    console.log(`[${submissionId}] Archive complete`);
  } catch (err) {
    console.error(`[${submissionId}] Archive failed:`, err);
    await query(
      `UPDATE submissions SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1`,
      [submissionId, err.message],
    );
  }
}

/**
 * Create an archive from a browser extension capture.
 * Receives pre-captured screenshot + DOM + metadata from the user's browser.
 * Skips Playwright — runs hash → OTS → IPFS → DB.
 */
export async function createExtensionArchive(url, screenshotDataUrl, domContent, metadata, userId = null, storageTier = 'free') {
  const submissionId = uuidv4();

  // Compute expiry for free tier (2 years)
  let expiresAt = null;
  if (storageTier === 'free') {
    const exp = new Date();
    exp.setFullYear(exp.getFullYear() + 2);
    expiresAt = exp.toISOString();
  }

  // Insert initial record
  await query(
    `INSERT INTO submissions (id, user_id, original_url, status, storage_tier, expires_at, capture_source)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [submissionId, userId, url, 'capturing', storageTier, expiresAt, 'extension'],
  );

  // Process in background (don't await — return immediately)
  processExtensionCapture(submissionId, url, screenshotDataUrl, domContent, metadata).catch((err) => {
    console.error(`[${submissionId}] Extension archive failed:`, err);
  });

  return { submissionId };
}

async function processExtensionCapture(submissionId, url, screenshotDataUrl, domContent, metadata) {
  try {
    const captureDir = join(CAPTURES_DIR, submissionId);
    await mkdir(captureDir, { recursive: true });

    // Save screenshot (strip data URL prefix)
    const base64Data = screenshotDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const screenshotPath = join(captureDir, 'screenshot.png');
    await writeFile(screenshotPath, Buffer.from(base64Data, 'base64'));

    // Save DOM
    const domPath = join(captureDir, 'dom.html');
    await writeFile(domPath, domContent, 'utf-8');

    // Save metadata
    const fullMetadata = {
      url,
      capturedAt: new Date().toISOString(),
      captureSource: 'extension',
      ...metadata,
    };
    const metadataPath = join(captureDir, 'metadata.json');
    await writeFile(metadataPath, JSON.stringify(fullMetadata, null, 2));

    // Generate smart title
    const smartTitle = generateTitle(url, fullMetadata);
    console.log(`[${submissionId}] Extension capture — Title: ${smartTitle}`);

    // Update with metadata
    await query(
      `UPDATE submissions SET
        page_title = $2,
        page_description = $3,
        og_image = $4,
        screenshot_path = $5,
        dom_path = $6,
        status = 'hashing'
       WHERE id = $1`,
      [
        submissionId,
        smartTitle,
        metadata.description,
        metadata.ogImage,
        screenshotPath,
        domPath,
      ],
    );

    // Hash
    console.log(`[${submissionId}] Hashing assets...`);
    const hashResult = await hashCaptureDirectory(captureDir);
    const manifestPath = join(captureDir, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(hashResult, null, 2));

    await query(
      `UPDATE submissions SET
        root_hash = $2,
        assets_manifest = $3,
        status = 'timestamping'
       WHERE id = $1`,
      [submissionId, hashResult.rootHash, JSON.stringify(hashResult.manifest)],
    );

    // OpenTimestamps
    console.log(`[${submissionId}] Submitting to OpenTimestamps...`);
    try {
      const otsResult = await submitToOpenTimestamps(hashResult.rootHash);
      await query(
        `UPDATE submissions SET ots_proof = $2, ots_status = $3 WHERE id = $1`,
        [submissionId, otsResult.proof, otsResult.status],
      );
    } catch (otsErr) {
      console.error(`[${submissionId}] OTS failed:`, otsErr.message);
      await query(
        `UPDATE submissions SET ots_status = 'failed' WHERE id = $1`,
        [submissionId],
      );
    }

    // Arweave
    console.log(`[${submissionId}] Uploading to Arweave...`);
    await query(`UPDATE submissions SET status = 'storing' WHERE id = $1`, [submissionId]);
    try {
      const arweaveResult = await uploadToArweave(captureDir, submissionId);
      await query(
        `UPDATE submissions SET arweave_id = $2, arweave_url = $3 WHERE id = $1`,
        [submissionId, arweaveResult.id, arweaveResult.url],
      );
    } catch (arweaveErr) {
      console.error(`[${submissionId}] Arweave failed:`, arweaveErr.message);
    }

    // Mark complete
    await query(
      `UPDATE submissions SET
        status = 'complete',
        capture_timestamp = NOW(),
        updated_at = NOW()
       WHERE id = $1`,
      [submissionId],
    );

    console.log(`[${submissionId}] Extension archive complete`);
  } catch (err) {
    console.error(`[${submissionId}] Extension archive failed:`, err);
    await query(
      `UPDATE submissions SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1`,
      [submissionId, err.message],
    );
  }
}

async function updateStatus(id, status) {
  await query(
    `UPDATE submissions SET status = $2, updated_at = NOW() WHERE id = $1`,
    [id, status],
  );
}
