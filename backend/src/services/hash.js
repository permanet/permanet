import { createHash } from 'crypto';
import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';

/**
 * Compute SHA-256 hash of a buffer or string
 */
export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Build a Merkle tree from an array of data buffers.
 * Returns { root, leaves, tree }
 */
export function buildMerkleTree(dataItems) {
  if (dataItems.length === 0) {
    throw new Error('Cannot build Merkle tree from empty data');
  }

  // Hash each leaf
  const leaves = dataItems.map((item) => ({
    hash: sha256(item.data),
    label: item.label,
  }));

  // Build tree levels bottom-up
  const tree = [leaves.map((l) => l.hash)];

  let currentLevel = tree[0];
  while (currentLevel.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = currentLevel[i + 1] || left; // duplicate last if odd
      const combined = sha256(Buffer.from(left + right));
      nextLevel.push(combined);
    }
    tree.push(nextLevel);
    currentLevel = nextLevel;
  }

  return {
    root: currentLevel[0],
    leaves,
    tree,
  };
}

/**
 * Hash all files in a capture directory and build a Merkle tree
 */
export async function hashCaptureDirectory(captureDir) {
  const files = await readdir(captureDir);
  const dataItems = [];

  for (const file of files.sort()) {
    const filePath = join(captureDir, file);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) continue;

    const data = await readFile(filePath);
    dataItems.push({ data, label: file });
  }

  if (dataItems.length === 0) {
    throw new Error(`No files found in capture directory: ${captureDir}`);
  }

  const merkle = buildMerkleTree(dataItems);

  // Create a manifest of all file hashes
  const manifest = merkle.leaves.map((leaf) => ({
    file: leaf.label,
    hash: leaf.hash,
  }));

  return {
    rootHash: merkle.root,
    manifest,
    tree: merkle.tree,
    fileCount: dataItems.length,
  };
}
