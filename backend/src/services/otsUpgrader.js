/**
 * OTS Upgrade Background Job
 *
 * Periodically checks all submissions with ots_status='pending'
 * and attempts to upgrade them by querying the OTS calendar servers.
 *
 * When a timestamp has been confirmed on Bitcoin, updates the DB with:
 * - ots_status = 'confirmed'
 * - ots_bitcoin_block (block height)
 * - ots_block_time (when we confirmed it)
 * - upgraded proof bytes
 *
 * Runs every 5 minutes. Bitcoin blocks are mined ~every 10 min,
 * and OTS calendars batch every few blocks, so 5 min is a good interval.
 */

import { query } from '../config/database.js';
import { checkOtsStatus, getLatestBitcoinBlock } from './timestamp.js';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_AGE_DAYS = 7; // Stop checking after 7 days (something's wrong)

let intervalHandle = null;

/**
 * Start the background OTS upgrade checker.
 */
export function startOtsUpgrader() {
  console.log('[OTS Upgrader] Started — checking every 5 minutes');

  // Run immediately on startup (after a short delay to let DB init)
  setTimeout(() => upgradePendingTimestamps(), 10000);

  // Then run on interval
  intervalHandle = setInterval(() => upgradePendingTimestamps(), CHECK_INTERVAL_MS);
}

/**
 * Stop the background checker.
 */
export function stopOtsUpgrader() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[OTS Upgrader] Stopped');
  }
}

/**
 * Main upgrade loop: find pending timestamps and check each one.
 */
async function upgradePendingTimestamps() {
  try {
    // Find all submissions with pending OTS that were created in the last MAX_AGE_DAYS
    const result = await query(
      `SELECT id, root_hash, ots_proof, ots_status, created_at
       FROM submissions
       WHERE ots_status = 'pending'
         AND ots_proof IS NOT NULL
         AND created_at > NOW() - INTERVAL '${MAX_AGE_DAYS} days'
       ORDER BY created_at ASC
       LIMIT 50`,
      [],
    );

    const pending = result.rows;
    if (pending.length === 0) return;

    console.log(`[OTS Upgrader] Checking ${pending.length} pending timestamp(s)...`);

    let upgraded = 0;
    let failed = 0;

    for (const row of pending) {
      try {
        const proofBuffer = typeof row.ots_proof === 'string'
          ? Buffer.from(row.ots_proof)
          : row.ots_proof;

        const status = await checkOtsStatus(proofBuffer);

        if (status.status === 'confirmed') {
          // Get block height — from attestation parsing or mempool.space
          let blockHeight = status.blockHeight;
          let blockTime = new Date().toISOString();

          if (!blockHeight) {
            // Fallback: get latest block from mempool.space as approximate reference
            const latestBlock = await getLatestBitcoinBlock();
            if (latestBlock) {
              blockHeight = latestBlock.height;
            }
          }

          // Update DB with confirmed status
          await query(
            `UPDATE submissions SET
              ots_status = 'confirmed',
              ots_bitcoin_block = $2,
              ots_block_time = $3,
              ots_proof = $4,
              updated_at = NOW()
             WHERE id = $1`,
            [
              row.id,
              blockHeight ? String(blockHeight) : null,
              blockTime,
              status.upgradedProof || row.ots_proof,
            ],
          );

          upgraded++;
          console.log(
            `[OTS Upgrader] ✓ Confirmed: ${row.id.slice(0, 8)}...` +
            (blockHeight ? ` (block #${blockHeight})` : ''),
          );
        } else if (status.status === 'error') {
          failed++;
          console.warn(`[OTS Upgrader] ✗ Error checking ${row.id.slice(0, 8)}...: ${status.message}`);
        }
        // 'pending' = still waiting, do nothing

        // Small delay between checks to avoid hammering calendars
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        failed++;
        console.error(`[OTS Upgrader] Error processing ${row.id.slice(0, 8)}...:`, err.message);
      }
    }

    if (upgraded > 0 || failed > 0) {
      console.log(
        `[OTS Upgrader] Done — ${upgraded} confirmed, ${failed} errors, ` +
        `${pending.length - upgraded - failed} still pending`,
      );
    }
  } catch (err) {
    console.error('[OTS Upgrader] Fatal error:', err.message);
  }
}

/**
 * Also expire very old pending timestamps (older than MAX_AGE_DAYS).
 * Mark them as 'failed' so we stop trying.
 */
export async function expireStaleTimestamps() {
  try {
    const result = await query(
      `UPDATE submissions SET
        ots_status = 'failed',
        updated_at = NOW()
       WHERE ots_status = 'pending'
         AND created_at < NOW() - INTERVAL '${MAX_AGE_DAYS} days'
       RETURNING id`,
      [],
    );

    if (result.rows.length > 0) {
      console.log(`[OTS Upgrader] Expired ${result.rows.length} stale pending timestamp(s)`);
    }
  } catch (err) {
    console.error('[OTS Upgrader] Error expiring stale timestamps:', err.message);
  }
}
