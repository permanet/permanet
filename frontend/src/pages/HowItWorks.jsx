export default function HowItWorks() {
  return (
    <div className="container content-page">
      <h1>How It Works</h1>
      <p style={{ fontSize: '1.1rem' }}>
        Permanet creates permanent, independently verifiable records of web
        content. No trust required.
      </p>

      <p>
        When a page is deleted, edited, or scrubbed, the original content is
        gone — unless it was captured before. Permanet exists for that moment.
      </p>
      <p>
        Submit any URL and Permanet immediately captures the full page, creates
        a cryptographic fingerprint of everything it captured, and anchors that
        fingerprint to the blockchain. The result is a timestamped,
        tamper-evident record that anyone in the world can verify independently
        — without relying on us, or anyone else.
      </p>
      <p>
        This is useful for journalists, researchers, lawyers, activists,
        compliance teams, historians, and anyone who needs to prove what
        something said before it changed.
      </p>

      <h2>The Process</h2>
      <ol>
        <li>
          <strong>Capture</strong>
          <p>
            A headless browser renders the full page exactly as a visitor would
            see it — HTML, images, metadata, and a pixel-perfect full-page
            screenshot. What you see is what we archived.
          </p>
        </li>
        <li>
          <strong>Fingerprint</strong>
          <p>
            Every captured file is hashed with SHA-256. Those hashes are combined
            into a Merkle tree, producing a single root hash that represents the
            entire archive. Change one pixel anywhere and the root hash changes
            entirely.
          </p>
        </li>
        <li>
          <strong>Timestamp</strong>
          <p>
            The root hash is submitted to OpenTimestamps, which anchors it to
            the blockchain — the most durable public timestamp mechanism in
            existence. This creates permanent, decentralized proof that this exact
            content existed at this exact moment. No single party controls it. No
            single party can alter it.
          </p>
        </li>
        <li>
          <strong>Store</strong>
          <p>
            The archive is permanently written to Arweave, a decentralized
            storage network with an endowment-based economic model. You pay once
            and the network stores it indefinitely — no ongoing subscription, no
            institution required to keep paying. That is what "permanent" actually
            means.
          </p>
        </li>
        <li>
          <strong>Publish</strong>
          <p>
            Every archive gets a permanent public URL with the screenshot,
            timestamp, hash, and full verification instructions. Share it. Cite
            it. Submit it.
          </p>
        </li>
      </ol>

      <h2>Why Arweave?</h2>
      <p>
        Most decentralized storage systems require ongoing fees —
        stop paying, and your files disappear. Arweave uses a
        one-time payment endowment model: pay once, stored by the network
        indefinitely. No ongoing subscription. No institution required to keep
        paying.
      </p>

      <h2>Verify It Yourself</h2>
      <p>
        You don't have to take our word for it. Every Permanet archive can be
        independently verified by anyone with an internet connection and basic
        command-line tools:
      </p>
      <pre>{`# 1. Download the archive from Arweave
curl -o archive.json https://arweave.net/<transaction_id>

# 2. Hash each file
sha256sum *

# 3. Rebuild the Merkle tree and compare the root hash

# 4. Verify the blockchain timestamp
ots verify -d <root_hash> proof.ots`}</pre>
      <p>
        The entire methodology is open source. Audit it, fork it, run your own
        instance.
      </p>

      <h2>Is the code auditable?</h2>
      <p>
        Yes. Permanet's capture, hashing, and verification pipeline is fully
        open source under AGPL-3.0. You can verify exactly how captures are
        created and confirmed — no black boxes.{' '}
        <a href="https://github.com/permanet/permanet" target="_blank" rel="noopener noreferrer">
          View on GitHub
        </a>
      </p>

      <h2>On Legal Admissibility</h2>
      <p>
        Permanet does not provide legal advice. What we can tell you is this:
        cryptographically timestamped records have been admitted as evidence in
        legal proceedings across multiple jurisdictions. The properties that
        matter are tamper-evidence, independent verifiability, decentralized
        anchoring, and fully documented open methodology. Permanet satisfies all
        four.
      </p>
      <p>
        If you are preparing an archive for legal use, document your submission
        process at the time of capture and retain the OTS proof file.
      </p>

      <p
        style={{
          marginTop: '48px',
          paddingTop: '24px',
          borderTop: '1px solid var(--border)',
          color: 'var(--text-tertiary)',
          fontSize: '0.85rem',
        }}
      >
        Open source. AGPL-3.0 licensed. Built for the public record.{' '}
        <a href="https://github.com/permanet/permanet" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          View on GitHub
        </a>
      </p>
    </div>
  );
}
