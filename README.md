# Permanet

Cryptographically verifiable web archiving. Submit a URL, get a rendered capture with a SHA-256 Merkle hash anchored to Bitcoin via OpenTimestamps and permanently stored on Arweave.

Anyone can verify a capture independently using only the hash and the Bitcoin blockchain. No trust in Permanet required.

## How it works

1. Submit a URL
2. Playwright captures the fully rendered page (HTML, images, screenshot)
3. All assets are hashed into a SHA-256 Merkle tree
4. The root hash is timestamped via OpenTimestamps (anchored to Bitcoin)
5. The capture is written permanently to Arweave
6. A public verification page is generated

## Tech stack

- **Capture:** Playwright (headless Chromium)
- **Hashing:** SHA-256 + Merkle tree
- **Timestamping:** OpenTimestamps (Bitcoin OP_RETURN)
- **Storage:** Arweave (permanent, protocol-level endowment)
- **Frontend:** React + Vite
- **Backend:** Node.js + Express + PostgreSQL

## Running locally

```bash
# Clone
git clone https://github.com/permanet/permanet.git
cd permanet

# Backend
cd backend
cp ../.env.example .env  # Edit with your values
npm install
npm start

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

You'll need:
- PostgreSQL database
- Arweave wallet (JWK keyfile) with AR tokens
- Playwright browsers (`npx playwright install chromium`)

## Verification

To verify a capture without trusting Permanet:

1. Download the capture bundle from `arweave.net/<transaction_id>`
2. Decode the base64-encoded files from the JSON bundle
3. Hash each file with SHA-256 and rebuild the Merkle tree
4. Verify the root hash matches the published hash
5. Verify the OpenTimestamps proof against the Bitcoin blockchain:
   ```
   ots verify -d <root_hash> proof.ots
   ```

## Why Arweave?

IPFS requires active pinning. If the pinner stops paying, your files disappear. Arweave uses a one-time payment endowment model: pay once, stored by the network indefinitely. No ongoing subscription. No institution required to keep paying.

## License

AGPL-3.0 -- anyone running a modified version as a service must open source their changes.
