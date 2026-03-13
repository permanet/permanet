export default function About() {
  return (
    <div className="container content-page">
      <h1>About</h1>
      <p style={{ fontSize: '1.1rem' }}>
        The internet is permanent — until it isn't.
      </p>

      <p>
        Pages get edited. Posts get deleted. Evidence disappears. Permanet
        exists to stop that from mattering.
      </p>
      <p>
        We create cryptographically verified, independently auditable records of
        web content at a specific moment in time. The record is anchored to the
        blockchain and permanently stored on Arweave. No single
        party — including us — can alter or erase it. The proof is mathematical,
        not institutional.
      </p>
      <p>
        Permanet is built for anyone who needs to establish what something said
        before it changed: journalists, lawyers, researchers, activists,
        compliance teams, regulators, historians, and private citizens holding
        the powerful accountable.
      </p>

      <h2>Principles</h2>
      <p>
        <strong>Trustless by design.</strong> You should never have to trust us.
        Every archive can be independently verified by anyone, anywhere, using
        open tools. The math is the proof.
      </p>
      <p>
        <strong>Open infrastructure.</strong> We build on blockchain, Arweave, and
        SHA-256 — open, decentralized systems that no single entity controls or
        can shut down.
      </p>
      <p>
        <strong>Full transparency.</strong> Our code is open source and AGPL-3.0
        licensed. The verification process is completely documented. Audit
        everything.
      </p>

      <h2>FAQ</h2>

      <h3>Is this free?</h3>
      <p>
        The free tier allows 10 credits per day per account. All archives are
        publicly accessible. A Pro tier ($24/month, 200 credits) and one-time
        Permanent Seal option ($1 per archive) are available for higher-volume
        use and guaranteed long-term storage.
      </p>

      <h3>What is a credit?</h3>
      <p>
        1 credit covers up to 10MB of captured page data. Most pages use 1
        credit. Large pages (homepages, dashboards) may use 2-5 credits
        based on size.
      </p>

      <h3>Can an archive be deleted?</h3>
      <p>
        Not meaningfully. Archives can be flagged and hidden from our platform
        following review, but the content is simultaneously written to
        Arweave — a permanent, decentralized storage network we do not control.
        Removal from Permanet does not remove it from Arweave.
      </p>

      <h3>Why Arweave?</h3>
      <p>
        Most decentralized storage requires ongoing fees to keep files available —
        stop paying, and your files disappear. Arweave uses a one-time payment
        endowment model: pay once, stored by the network indefinitely. No
        ongoing subscription. No institution required to keep paying.
      </p>

      <h3>How long until blockchain confirmation?</h3>
      <p>
        Typically 1-3 hours. OpenTimestamps batches hashes and anchors them to
        the blockchain periodically. Your archive is complete and usable the moment
        it's captured — blockchain confirmation is an additional layer of proof,
        not a prerequisite.
      </p>

      <h3>Can I use this as legal evidence?</h3>
      <p>
        We are not lawyers and cannot advise on admissibility. Cryptographic
        timestamps have been accepted as evidence in multiple jurisdictions. Our{' '}
        <a href="/how-it-works">How It Works</a> page provides a full technical
        description suitable for expert witness testimony. Consult your legal
        counsel.
      </p>

      <h3>Is the code auditable?</h3>
      <p>
        Yes. Permanet's capture, hashing, and verification pipeline is fully
        open source under AGPL-3.0. You can verify exactly how captures are
        created and confirmed — no black boxes.{' '}
        <a href="https://github.com/permanet/permanet" target="_blank" rel="noopener noreferrer">
          View on GitHub
        </a>
      </p>

      <h3>Who can see my archives?</h3>
      <p>
        All submissions are public by default. Do not submit content you intend
        to keep private.
      </p>

      <h2>Moderation</h2>
      <p>
        All submissions are public. We do not pre-screen content. Every archive
        page includes a report button. Flagged content is reviewed manually by a
        human — we do not auto-delete.
      </p>
      <p>
        We will comply with valid legal orders requiring removal from our
        platform. Removal from our platform does not affect the Arweave copy,
        which exists on a permanent, decentralized network outside our control.
      </p>
      <p>
        To request removal: Use the Report button on the archive page. Provide a
        clear reason. Our team will review and respond.
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
