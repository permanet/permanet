export default function Privacy() {
  return (
    <div className="container content-page">
      <h1>Privacy Policy</h1>
      <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginBottom: '32px' }}>
        Last updated: March 12, 2026
      </p>

      <h2>What We Collect</h2>
      <p>
        When you submit a URL for archiving, we capture and store the publicly
        visible content of that page: HTML, images, metadata, and a screenshot.
        If you use the Chrome Extension, we additionally receive the page DOM and
        a screenshot as rendered in your browser.
      </p>
      <p>
        If you create an account, we store your email address and a hashed
        password. We do not store plaintext passwords.
      </p>

      <h2>What We Don't Collect</h2>
      <p>
        We do not collect browsing history, cookies, authentication tokens,
        personal files, or any data from pages you do not explicitly submit. The
        Chrome Extension only activates when you click "Archive This Page" — it
        does not run in the background or monitor your browsing.
      </p>

      <h2>How Data Is Used</h2>
      <p>
        Submitted content is used solely to create a cryptographically verified
        archive. Archives are public by default. Content is hashed, timestamped
        on the blockchain, and permanently stored on Arweave.
      </p>

      <h2>Third-Party Services</h2>
      <ul>
        <li>
          <strong>Arweave</strong> — Archives are permanently stored on Arweave,
          a decentralized storage network with a one-time payment endowment model.
        </li>
        <li>
          <strong>OpenTimestamps</strong> — Cryptographic hashes are submitted
          for blockchain timestamping.
        </li>
        <li>
          <strong>Stripe</strong> — Payment processing for paid tiers. We do not
          store credit card numbers.
        </li>
      </ul>

      <h2>Data Retention</h2>
      <p>
        Free-tier archives are retained for 2 years. Sealed and Pro-tier
        archives are stored indefinitely. Account data is retained as long as
        your account is active.
      </p>

      <h2>Chrome Extension</h2>
      <p>
        The Permanet Chrome Extension requests the following permissions:
      </p>
      <ul>
        <li>
          <strong>activeTab</strong> — To capture the content of the page you
          are currently viewing, only when you click the extension button.
        </li>
        <li>
          <strong>scripting</strong> — To extract the page DOM and metadata for
          archiving.
        </li>
        <li>
          <strong>host_permissions (thepermanet.com)</strong> — To send captured
          data to the Permanet backend for processing.
        </li>
      </ul>
      <p>
        The extension does not collect data in the background, does not access
        browsing history, and does not transmit any data until you explicitly
        click "Archive This Page."
      </p>

      <h2>Contact</h2>
      <p>
        For privacy concerns or data removal requests, use the Report button on
        any archive page or email privacy@thepermanet.com.
      </p>
    </div>
  );
}
