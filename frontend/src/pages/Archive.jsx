import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import VerificationPanel from '../components/VerificationPanel';

export default function Archive() {
  const { id } = useParams();
  const { user, token, authHeaders } = useAuth();
  const [archive, setArchive] = useState(null);
  const [verification, setVerification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sealing, setSealing] = useState(false);
  const [showOtsTooltip, setShowOtsTooltip] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [archiveRes, verifyRes] = await Promise.all([
        fetch(`/api/archive/${id}`),
        fetch(`/api/verify/${id}`),
      ]);

      if (!archiveRes.ok) throw new Error('Archive not found');

      setArchive(await archiveRes.json());
      if (verifyRes.ok) setVerification(await verifyRes.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (archive?.status && !['complete', 'failed'].includes(archive.status)) {
        fetchData();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchData, archive?.status]);

  useEffect(() => {
    if (archive?.title) {
      document.title = `${archive.title} — Permanet Archive`;
    }
  }, [archive?.title]);

  async function handleSeal() {
    if (!token) {
      window.location.href = '/login';
      return;
    }
    setSealing(true);
    try {
      const res = await fetch(`/api/stripe/seal/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
      });
      const data = await res.json();
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    } catch {
      // silent
    } finally {
      setSealing(false);
    }
  }

  async function handleReport() {
    if (!reportReason.trim()) return;
    setReporting(true);
    try {
      await fetch(`/api/archive/${id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reportReason }),
      });
      setReportSent(true);
    } catch {
      // silent
    } finally {
      setReporting(false);
    }
  }

  function handleShare() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) {
    return (
      <div className="container loading">
        <div className="spinner" />
        Loading archive...
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ paddingTop: '60px' }}>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  const isProcessing = archive.status && !['complete', 'failed'].includes(archive.status);
  const timestamp = archive.captureTimestamp
    ? new Date(archive.captureTimestamp).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      })
    : 'Pending...';

  const isOwner = user && archive.userId === user.id;
  const showExpiryBanner =
    archive.storageTier === 'free' && archive.expiryInfo;

  return (
    <div className="container" style={{ paddingTop: '40px', paddingBottom: '60px' }}>
      {/* Expiry Banner for free tier */}
      {showExpiryBanner && (
        <div
          style={{
            background: 'var(--warning-dim)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: 'var(--radius)',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <strong style={{ color: 'var(--warning)' }}>
              This archive expires in {archive.expiryInfo.daysRemaining} days
            </strong>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 0' }}>
              Permanently seal it for $1 to ensure it's never deleted.
            </p>
          </div>
          {user ? (
            <button
              className="btn btn-primary"
              onClick={handleSeal}
              disabled={sealing}
              style={{ fontSize: '0.85rem', padding: '10px 20px' }}
            >
              {sealing ? 'Redirecting...' : 'Seal for $1'}
            </button>
          ) : (
            <Link to="/login" className="btn btn-secondary" style={{ textDecoration: 'none', fontSize: '0.85rem' }}>
              Log in to seal
            </Link>
          )}
        </div>
      )}

      {/* Sealed badge */}
      {(archive.storageTier === 'sealed' || archive.storageTier === 'pro') && (
        <div
          style={{
            background: 'var(--success-dim)',
            border: '1px solid rgba(52, 211, 153, 0.3)',
            borderRadius: 'var(--radius)',
            padding: '12px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.9rem' }}>
            Permanently Sealed
          </span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            — This archive will be stored indefinitely.
          </span>
        </div>
      )}

      {isProcessing && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="spinner" />
            <div>
              <strong>Finalizing your archive</strong>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 0' }}>
                Your capture is locked in. We're hashing, writing to Arweave, and submitting to the blockchain.
              </p>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem', margin: '4px 0 0' }}>
                This page will update automatically.
              </p>
            </div>
          </div>
        </div>
      )}

      {archive.status === 'failed' && (
        <div className="error-message" style={{ marginBottom: '24px' }}>
          Archive capture failed. The page may be inaccessible or blocked automated access.
          <p style={{ marginTop: '8px', fontSize: '0.85rem', opacity: 0.9 }}>
            Our{' '}
            <a href="/extension" style={{ color: 'inherit', textDecoration: 'underline' }}>
              Chrome Extension
            </a>{' '}
            (coming March 15) will let you capture these pages directly from your browser.
          </p>
        </div>
      )}

      {/* Blocked content warning — suggest extension */}
      {archive.captureWarning && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.06)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: 'var(--radius)',
            padding: '16px 20px',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>⚠</span>
            <div>
              <strong style={{ color: 'var(--warning)', fontSize: '0.9rem' }}>
                Incomplete capture — authentication required
              </strong>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '6px 0 0', lineHeight: 1.5 }}>
                {archive.captureWarning}
              </p>
              <p style={{ margin: '10px 0 0' }}>
                <a
                  href="https://thepermanet.com/extension"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    padding: '6px 14px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: 'var(--accent)',
                    color: '#0a0a0a',
                    borderRadius: '4px',
                    textDecoration: 'none',
                  }}
                >
                  Chrome Extension — Coming March 15
                </a>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot */}
      {archive.screenshotUrl && (
        <img
          src={archive.screenshotUrl}
          alt={`Screenshot of ${archive.url}`}
          className="archive-screenshot"
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '4px' }}>
            {archive.title || 'Untitled Page'}
            {archive.captureSource === 'extension' && (
              <span
                style={{
                  marginLeft: '10px',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  color: 'var(--accent)',
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: '3px',
                  padding: '2px 6px',
                  verticalAlign: 'middle',
                }}
              >
                BROWSER CAPTURE
              </span>
            )}
          </h1>
          <a
            href={archive.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '0.85rem', fontFamily: 'var(--mono)' }}
          >
            {archive.url}
          </a>
        </div>
        <button className="share-btn" onClick={handleShare}>
          {copied ? 'Copied!' : 'Share Link'}
        </button>
      </div>

      {/* Metadata Grid */}
      <div className="meta-grid">
        <div className="meta-item">
          <div className="meta-label">Captured</div>
          <div className="meta-value">{timestamp}</div>
        </div>

        {/* OTS Status with improved UX */}
        <div className="meta-item" style={{ position: 'relative' }}>
          <div className="meta-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            Blockchain Timestamp
            <span
              style={{
                cursor: 'pointer',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.65rem',
                color: 'var(--text-tertiary)',
                fontWeight: 700,
              }}
              onMouseEnter={() => setShowOtsTooltip(true)}
              onMouseLeave={() => setShowOtsTooltip(false)}
            >
              ?
            </span>
          </div>
          <div className="meta-value">
            {archive.otsStatus === 'confirmed' ? (
              <div>
                <span className="badge badge-confirmed">
                  Anchored to Blockchain
                </span>
                {archive.otsBitcoinBlock && (
                  <div style={{ marginTop: '8px', fontSize: '0.8rem' }}>
                    Block{' '}
                    <a
                      href={`https://mempool.space/block/${archive.otsBitcoinBlock}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      #{archive.otsBitcoinBlock}
                    </a>
                    {archive.otsBlockTime && (
                      <span style={{ color: 'var(--text-tertiary)', marginLeft: '8px' }}>
                        {new Date(archive.otsBlockTime).toLocaleString()}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : archive.otsStatus === 'failed' ? (
              <span className="badge badge-failed">Timestamp unavailable</span>
            ) : (
              <div>
                <span className="badge badge-pending" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <div className="spinner" style={{ width: '10px', height: '10px', borderWidth: '1.5px', margin: 0 }} />
                  Awaiting blockchain confirmation
                </span>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Your archive is already complete and immutable.</strong>{' '}
                  The content, hash, and Arweave storage are permanent — blockchain confirmation adds an independent
                  timestamp proof. This typically takes 1–3 hours.
                </p>
              </div>
            )}
          </div>

          {/* Tooltip */}
          {showOtsTooltip && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 10,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '14px',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                marginTop: '4px',
              }}
            >
              <strong style={{ color: 'var(--text-primary)' }}>How blockchain timestamping works</strong>
              <p style={{ marginTop: '6px', marginBottom: 0 }}>
                Your archive is captured and hashed instantly — the content is permanent from the moment
                you submit it. The hash is then submitted to OpenTimestamps, which anchors it to
                the blockchain. Once confirmed in a block (typically 1–3 hours), the timestamp becomes
                independently verifiable by anyone — mathematical proof this content existed at that moment.
              </p>
            </div>
          )}
        </div>

        <div className="meta-item">
          <div className="meta-label">Root Hash (SHA-256)</div>
          <div className="meta-value">{archive.rootHash || 'Computing...'}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Arweave Storage</div>
          <div className="meta-value">
            {archive.arweaveId ? (
              <a href={archive.arweaveUrl} target="_blank" rel="noopener noreferrer">
                {archive.arweaveId}
              </a>
            ) : (
              'Writing to Arweave...'
            )}
          </div>
        </div>
      </div>

      {/* Verification Panel */}
      <VerificationPanel verification={verification} />

      {/* Report Section */}
      <div className="report-section">
        {reportSent ? (
          <div className="success-message">
            Report submitted. It will be reviewed manually.
          </div>
        ) : (
          <>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
              Report this archive
            </h4>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Reason for reporting (e.g., contains personal information, copyright violation)"
            />
            <button
              className="btn btn-secondary"
              onClick={handleReport}
              disabled={reporting || !reportReason.trim()}
              style={{ fontSize: '0.8rem', padding: '8px 16px' }}
            >
              {reporting ? 'Submitting...' : 'Submit Report'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
