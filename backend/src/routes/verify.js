import { Router } from 'express';
import { query } from '../config/database.js';
import { checkOtsStatus } from '../services/timestamp.js';

export const verifyRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

verifyRouter.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid archive ID' });

  try {
    const result = await query(
      `SELECT id, original_url, root_hash, arweave_id, arweave_url,
              ots_proof, ots_status, status, capture_timestamp, assets_manifest
       FROM submissions WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Archive not found' });
    }

    const row = result.rows[0];

    // If proof exists and status is pending, check for upgrade
    let otsVerification = { status: row.ots_status };
    if (row.ots_proof && row.ots_status === 'pending') {
      try {
        otsVerification = await checkOtsStatus(row.ots_proof);

        // Update status if confirmed
        if (otsVerification.status === 'confirmed') {
          await query(
            `UPDATE submissions SET ots_status = 'confirmed', updated_at = NOW() WHERE id = $1`,
            [id],
          );
        }
      } catch {
        otsVerification = { status: 'pending', message: 'Unable to check status' };
      }
    }

    res.json({
      id: row.id,
      url: row.original_url,
      rootHash: row.root_hash,
      arweaveId: row.arweave_id,
      arweaveUrl: row.arweave_url,
      captureTimestamp: row.capture_timestamp,
      status: row.status,
      otsVerification,
      assets: row.assets_manifest,
      verificationSteps: [
        {
          step: 1,
          title: 'Download the archive from Arweave',
          description: row.arweave_id
            ? `Retrieve the full archive bundle from Arweave: ${row.arweave_url}`
            : 'Arweave transaction not yet available',
          command: row.arweave_id
            ? `curl -o archive.json ${row.arweave_url}`
            : null,
        },
        {
          step: 2,
          title: 'Verify the file hashes',
          description:
            'Hash each file with SHA-256 and compare against the manifest',
          command: 'sha256sum *',
        },
        {
          step: 3,
          title: 'Rebuild the Merkle tree',
          description: `Rebuild the Merkle tree from the individual file hashes and verify the root hash matches: ${row.root_hash}`,
        },
        {
          step: 4,
          title: 'Verify the OpenTimestamps proof',
          description:
            'Use the OpenTimestamps client to verify the root hash was timestamped on Bitcoin',
          command: row.root_hash
            ? `ots verify -d ${row.root_hash} proof.ots`
            : null,
        },
      ],
    });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: 'Verification check failed' });
  }
});
