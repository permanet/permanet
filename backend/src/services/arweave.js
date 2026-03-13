/**
 * Arweave integration for permanent storage.
 *
 * Uploads archive bundles to Arweave using a one-time payment endowment model.
 * Once written, data is stored by the network indefinitely — no ongoing fees.
 *
 * Public URL: https://arweave.net/{transactionId}
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import Arweave from 'arweave';

const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
});

let walletKey = null;

/**
 * Load the Arweave wallet JWK from disk (lazy, cached).
 */
async function getWallet() {
  if (walletKey) return walletKey;

  const walletPath = process.env.ARWEAVE_WALLET_PATH || './arweave-wallet.json';
  try {
    const raw = await readFile(walletPath, 'utf-8');
    walletKey = JSON.parse(raw);
    return walletKey;
  } catch (err) {
    throw new Error(`Failed to load Arweave wallet from ${walletPath}: ${err.message}`);
  }
}

/**
 * Upload a capture directory to Arweave as a single bundled JSON transaction.
 *
 * The transaction contains all files in the capture directory, base64-encoded,
 * tagged with Permanet metadata for discoverability.
 *
 * @param {string} captureDir - Path to the capture directory
 * @param {string} submissionId - UUID of the submission
 * @returns {{ id: string, url: string }} - Arweave transaction ID and public URL
 */
export async function uploadToArweave(captureDir, submissionId) {
  const wallet = await getWallet();
  const files = await readdir(captureDir);
  const bundle = {};
  let totalSize = 0;

  for (const file of files.sort()) {
    const filePath = join(captureDir, file);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) continue;

    const data = await readFile(filePath);
    bundle[file] = data.toString('base64');
    totalSize += data.length;
  }

  if (Object.keys(bundle).length === 0) {
    throw new Error('No files to upload');
  }

  const payload = JSON.stringify(bundle);

  const transaction = await arweave.createTransaction({ data: payload }, wallet);

  transaction.addTag('Content-Type', 'application/json');
  transaction.addTag('App-Name', 'Permanet');
  transaction.addTag('App-Version', '2.0');
  transaction.addTag('Submission-Id', submissionId);
  transaction.addTag('Bundle-Format', 'base64-files');

  await arweave.transactions.sign(transaction, wallet);

  const response = await arweave.transactions.post(transaction);

  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`Arweave upload failed: HTTP ${response.status}`);
  }

  console.log(`[${submissionId}] Arweave upload: ${transaction.id} (${(totalSize / 1024).toFixed(1)}KB)`);

  return {
    id: transaction.id,
    url: `https://arweave.net/${transaction.id}`,
  };
}

/**
 * Check the status of an Arweave transaction.
 *
 * @param {string} txId - Arweave transaction ID
 * @returns {{ status: string, confirmations: number }}
 */
export async function checkArweaveStatus(txId) {
  try {
    const status = await arweave.transactions.getStatus(txId);
    return {
      status: status.confirmed ? 'confirmed' : 'pending',
      confirmations: status.confirmed?.number_of_confirmations || 0,
    };
  } catch {
    return { status: 'unknown', confirmations: 0 };
  }
}

/**
 * Get the wallet address and balance.
 */
export async function getWalletInfo() {
  try {
    const wallet = await getWallet();
    const address = await arweave.wallets.jwkToAddress(wallet);
    const balanceWinston = await arweave.wallets.getBalance(address);
    const balanceAR = arweave.ar.winstonToAr(balanceWinston);

    return { address, balanceAR, balanceWinston };
  } catch {
    return { address: null, balanceAR: '0', balanceWinston: '0' };
  }
}
