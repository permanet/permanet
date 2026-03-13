export default function Extension() {
  return (
    <div className="container content-page">
      <h1>Chrome Extension</h1>
      <p style={{ fontSize: '1.1rem' }}>
        Archive any page directly from your browser — including paywalled,
        authenticated, and bot-protected sites.
      </p>

      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--accent-dim)',
          borderRadius: 'var(--radius-lg)',
          padding: '32px',
          margin: '32px 0',
          textAlign: 'center',
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: '8px', fontSize: '1.3rem' }}>
          Permanet for Chrome
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', maxWidth: '100%' }}>
          One click to capture, hash, and timestamp any webpage.
        </p>
        <div
          style={{
            display: 'inline-block',
            padding: '14px 28px',
            fontSize: '0.95rem',
            fontWeight: 600,
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text-secondary)',
          }}
        >
          Coming Soon — Expected March 15, 2026
        </div>
        <p
          style={{
            color: 'var(--text-tertiary)',
            fontSize: '0.85rem',
            marginTop: '16px',
            marginBottom: 0,
            maxWidth: '420px',
            marginLeft: 'auto',
            marginRight: 'auto',
            lineHeight: 1.5,
          }}
        >
          The extension is currently under review by the Chrome Web Store.
          It will be available for Chrome, Brave, Edge, and all Chromium browsers.
        </p>
      </div>

      <h2>Why Use the Extension?</h2>
      <p>
        The Permanet website can archive most public pages by rendering them
        server-side. But some sites — news paywalls, social media behind login
        walls, corporate dashboards — block automated access.
      </p>
      <p>
        The extension captures exactly what you see in your browser, including
        pages that require authentication. It sends the page content and a
        screenshot to Permanet, where the same cryptographic pipeline processes
        it: SHA-256 hashing, Merkle tree, blockchain timestamping, and permanent
        Arweave storage.
      </p>

      <h2>What It Captures</h2>
      <ul>
        <li>Full page DOM (HTML as rendered in your browser)</li>
        <li>Visible viewport screenshot</li>
        <li>Page metadata (title, description, timestamps, author info)</li>
        <li>Platform-specific data (tweet author, YouTube channel, Reddit post info)</li>
      </ul>

      <h2>What It Doesn't Do</h2>
      <ul>
        <li>Does not run in the background</li>
        <li>Does not monitor your browsing</li>
        <li>Does not access cookies, passwords, or other browser data</li>
        <li>Only activates when you click the extension button</li>
      </ul>

      <h2>Permissions Explained</h2>
      <ul>
        <li>
          <strong>activeTab</strong> — Accesses the current tab only when you
          click the extension. No persistent access.
        </li>
        <li>
          <strong>scripting</strong> — Extracts the page DOM for archiving.
        </li>
      </ul>

      <p>
        The extension is open source. Review the code, audit it, or fork it.
      </p>
    </div>
  );
}
