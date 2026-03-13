/**
 * OpenTimestamps integration
 *
 * Submits a SHA-256 hash to OpenTimestamps calendar servers
 * and retrieves/upgrades the proof when Bitcoin confirmation is available.
 *
 * We use the OpenTimestamps HTTP calendar API directly since the
 * JavaScript library ecosystem is limited.
 */

import { createHash } from 'crypto';

const OTS_CALENDARS = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://a.pool.eternitywall.com',
];

/**
 * Submit a hash to OpenTimestamps calendar servers.
 * Returns the raw OTS proof bytes.
 */
export async function submitToOpenTimestamps(hashHex) {
  const hashBytes = Buffer.from(hashHex, 'hex');

  // Try each calendar until one succeeds
  const errors = [];
  for (const calendar of OTS_CALENDARS) {
    try {
      const response = await fetch(`${calendar}/digest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: hashBytes,
      });

      if (response.ok) {
        const proofBytes = Buffer.from(await response.arrayBuffer());

        // Build a minimal OTS file structure
        const otsProof = buildOtsFile(hashBytes, proofBytes, calendar);

        return {
          proof: otsProof,
          calendar,
          status: 'pending',
          submittedAt: new Date().toISOString(),
        };
      }

      errors.push(`${calendar}: HTTP ${response.status}`);
    } catch (err) {
      errors.push(`${calendar}: ${err.message}`);
    }
  }

  throw new Error(
    `All OTS calendars failed: ${errors.join('; ')}`,
  );
}

/**
 * Build a minimal OTS file containing the hash and calendar proof
 */
function buildOtsFile(hashBytes, calendarResponse, calendarUrl) {
  // Store the full proof data as a JSON envelope for easy verification
  const envelope = JSON.stringify({
    version: 1,
    hashAlgorithm: 'sha256',
    hash: hashBytes.toString('hex'),
    calendarUrl,
    calendarResponse: calendarResponse.toString('base64'),
    createdAt: new Date().toISOString(),
  });

  return Buffer.from(envelope);
}

/**
 * Parse OTS attestation binary and replay the operations on the original hash
 * to compute the commitment hash that the calendar server knows about.
 * Also extracts the calendar URL from the pending attestation.
 *
 * OTS binary opcodes:
 *   0xf0 LEN DATA  = append DATA to current value
 *   0xf1 LEN DATA  = prepend DATA to current value
 *   0x08           = SHA-256 of current value
 *   0x67           = RIPEMD-160 of current value
 *   0x00 TAG[8] LEN DATA = attestation (pending or bitcoin)
 *
 * Pending attestation tag: 0x83dfe30d2ef90c8e
 * Bitcoin attestation tag: 0x0588960d73d71901
 */
function parseAttestationChain(originalHashHex, calendarResponseBase64) {
  const buf = Buffer.from(calendarResponseBase64, 'base64');
  let currentHash = Buffer.from(originalHashHex, 'hex');
  let calendarUrl = null;
  let i = 0;

  while (i < buf.length) {
    const op = buf[i];

    if (op === 0xf0) {
      // Append: next byte is length, then data
      i++;
      const len = buf[i]; i++;
      const data = buf.subarray(i, i + len); i += len;
      currentHash = Buffer.concat([currentHash, data]);
    } else if (op === 0xf1) {
      // Prepend: next byte is length, then data
      i++;
      const len = buf[i]; i++;
      const data = buf.subarray(i, i + len); i += len;
      currentHash = Buffer.concat([data, currentHash]);
    } else if (op === 0x08) {
      // SHA-256
      currentHash = createHash('sha256').update(currentHash).digest();
      i++;
    } else if (op === 0x67) {
      // RIPEMD-160
      currentHash = createHash('ripemd160').update(currentHash).digest();
      i++;
    } else if (op === 0x00) {
      // Attestation marker
      i++;
      // Read 8-byte attestation tag
      const tag = buf.subarray(i, i + 8); i += 8;
      // Read varint length for attestation data
      const dataLen = readVarInt(buf, i);
      const varIntSize = varIntByteSize(buf[i]);
      i += varIntSize;
      const attData = buf.subarray(i, i + dataLen); i += dataLen;

      // Check if this is a pending attestation
      const pendingTag = Buffer.from([0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e]);
      if (tag.equals(pendingTag)) {
        // Attestation data is the calendar URL (UTF-8)
        calendarUrl = attData.toString('utf-8');
      }
    } else {
      // Unknown opcode — skip and hope for the best
      i++;
    }
  }

  return {
    commitmentHash: currentHash.toString('hex'),
    calendarUrl,
  };
}

/**
 * Read a variable-length integer from a buffer at the given offset.
 * OTS uses Bitcoin's varint encoding.
 */
function readVarInt(buf, offset) {
  const first = buf[offset];
  if (first < 0xfd) return first;
  if (first === 0xfd) return buf.readUInt16LE(offset + 1);
  if (first === 0xfe) return buf.readUInt32LE(offset + 1);
  return Number(buf.readBigUInt64LE(offset + 1));
}

/**
 * Get byte size of a varint based on its first byte.
 */
function varIntByteSize(first) {
  if (first < 0xfd) return 1;
  if (first === 0xfd) return 3;
  if (first === 0xfe) return 5;
  return 9;
}

/**
 * Check if an OTS proof has been upgraded (confirmed on Bitcoin).
 *
 * Properly replays the attestation chain to compute the commitment hash,
 * then queries the calendar server embedded in the attestation.
 */
export async function checkOtsStatus(proofBuffer) {
  try {
    const envelope = JSON.parse(proofBuffer.toString());
    const { hash, calendarResponse } = envelope;

    if (!calendarResponse) {
      return { status: 'error', message: 'No calendar response in proof' };
    }

    // Parse the attestation to get the commitment hash and calendar URL
    const { commitmentHash, calendarUrl } = parseAttestationChain(hash, calendarResponse);

    if (!commitmentHash) {
      return { status: 'error', message: 'Failed to compute commitment hash' };
    }

    // Build list of calendar URLs to try
    // The URL from the attestation is the primary one
    const calendarsToTry = [];

    if (calendarUrl) {
      // Clean up URL (may have leading dash or other artifacts)
      const cleanUrl = calendarUrl.replace(/^-/, '').trim();
      if (cleanUrl.startsWith('https://')) {
        calendarsToTry.push(cleanUrl);
      }
    }

    // Also try well-known calendar servers as fallback
    calendarsToTry.push(
      'https://alice.btc.calendar.opentimestamps.org',
      'https://bob.btc.calendar.opentimestamps.org',
      'https://finney.calendar.eternitywall.com',
    );

    // Deduplicate
    const uniqueCalendars = [...new Set(calendarsToTry)];

    for (const calendar of uniqueCalendars) {
      try {
        const response = await fetch(`${calendar}/timestamp/${commitmentHash}`, {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const attestationBytes = Buffer.from(await response.arrayBuffer());

          // Try to extract Bitcoin block height from the attestation
          const blockHeight = parseBitcoinBlockHeight(attestationBytes);

          // Store the upgraded attestation in the envelope
          const upgradedEnvelope = {
            ...envelope,
            upgraded: true,
            upgradedAt: new Date().toISOString(),
            upgradedCalendar: calendar,
            commitmentHash,
            attestation: attestationBytes.toString('base64'),
          };

          return {
            status: 'confirmed',
            hash,
            calendar,
            blockHeight,
            upgradedProof: Buffer.from(JSON.stringify(upgradedEnvelope)),
          };
        }

        // 404 = not yet confirmed on this calendar, try next
        if (response.status === 404) continue;
      } catch (err) {
        // Timeout or network error on this calendar, try next
        continue;
      }
    }

    // None confirmed yet
    return {
      status: 'pending',
      hash,
      commitmentHash,
      message: 'Waiting for Bitcoin confirmation',
    };
  } catch (err) {
    return { status: 'error', message: `Invalid proof format: ${err.message}` };
  }
}

/**
 * Try to extract Bitcoin block height from OTS attestation binary.
 * The attestation format uses tag 0x0588960d73d71901 for Bitcoin block header attestation
 * followed by the block height as a variable-length integer.
 * Returns null if parsing fails — confirmation is still valid without block number.
 */
function parseBitcoinBlockHeight(attestationBytes) {
  try {
    // Look for the Bitcoin attestation tag (0x00 + 0x0588960d73d71901)
    const btcTag = Buffer.from([0x00, 0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01]);

    for (let i = 0; i < attestationBytes.length - btcTag.length - 4; i++) {
      if (attestationBytes.subarray(i, i + btcTag.length).equals(btcTag)) {
        // Block height follows as a variable-length integer
        const heightStart = i + btcTag.length;
        return readVarInt(attestationBytes, heightStart);
      }
    }

    // Alternative: look for just the 8-byte tag without the 0x00 prefix
    const btcTagAlt = Buffer.from([0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01]);
    for (let i = 0; i < attestationBytes.length - btcTagAlt.length - 4; i++) {
      if (attestationBytes.subarray(i, i + btcTagAlt.length).equals(btcTagAlt)) {
        const heightStart = i + btcTagAlt.length;
        return readVarInt(attestationBytes, heightStart);
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch the latest Bitcoin block height from mempool.space.
 * Used as a reference when we confirm an OTS but can't parse the exact block from attestation.
 */
export async function getLatestBitcoinBlock() {
  try {
    const response = await fetch('https://mempool.space/api/blocks/tip/height', {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const height = parseInt(await response.text());
      return { height, fetchedAt: new Date().toISOString() };
    }
  } catch {
    // Non-critical
  }
  return null;
}
