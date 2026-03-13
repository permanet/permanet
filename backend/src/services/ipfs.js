/**
 * IPFS integration via local kubo node
 *
 * Pins archive directories to a self-hosted IPFS node running on localhost.
 * The kubo HTTP API listens on 127.0.0.1:5001.
 *
 * Public gateway: https://ipfs.io/ipfs/{cid}
 * Local gateway:  http://127.0.0.1:8080/ipfs/{cid}
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';

const IPFS_API = process.env.IPFS_API_URL || 'http://127.0.0.1:5001';
const PUBLIC_GATEWAY = 'https://ipfs.io/ipfs';

/**
 * Pin a directory of files to IPFS via the local kubo node.
 * Uses the /api/v0/add endpoint with wrap-with-directory=true.
 */
export async function pinToIPFS(captureDir, submissionId) {
  const files = await readdir(captureDir);
  const boundary = `----PermanetBoundary${Date.now()}`;
  const bodyParts = [];
  let fileCount = 0;

  for (const file of files.sort()) {
    const filePath = join(captureDir, file);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) continue;

    const data = await readFile(filePath);
    bodyParts.push(
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${file}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`,
      ),
    );
    bodyParts.push(data);
    bodyParts.push(Buffer.from('\r\n'));
    fileCount++;
  }

  if (fileCount === 0) {
    throw new Error('No files to pin');
  }

  bodyParts.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(bodyParts);

  const response = await fetch(
    `${IPFS_API}/api/v0/add?wrap-with-directory=true&pin=true&quieter=false`,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
      signal: AbortSignal.timeout(60000),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`IPFS add failed (${response.status}): ${text}`);
  }

  // kubo returns one JSON object per line (ndjson).
  // The last entry is the wrapping directory with the root CID.
  const text = await response.text();
  const lines = text.trim().split('\n');
  const entries = lines.map((l) => JSON.parse(l));

  // The directory entry has an empty Name (or the wrapping dir name)
  const dirEntry = entries.find((e) => e.Name === '') || entries[entries.length - 1];
  const cid = dirEntry.Hash;

  return {
    cid,
    pinSize: parseInt(dirEntry.Size) || 0,
    timestamp: new Date().toISOString(),
    gatewayUrl: `${PUBLIC_GATEWAY}/${cid}`,
  };
}

/**
 * Check if a CID is pinned on the local node.
 */
export async function checkPinStatus(cid) {
  try {
    const response = await fetch(
      `${IPFS_API}/api/v0/pin/ls?arg=${cid}&type=recursive`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) {
      return { pinned: false };
    }

    const result = await response.json();
    return {
      pinned: true,
      type: result.Keys?.[cid]?.Type || 'unknown',
    };
  } catch {
    return { pinned: false };
  }
}
