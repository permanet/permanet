import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function SubmitForm() {
  const { authHeaders, user } = useAuth();
  const [url, setUrl] = useState('');
  const [videoOffset, setVideoOffset] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Confirmation modal state
  const [confirmation, setConfirmation] = useState(null);
  const [useCompression, setUseCompression] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setConfirmation(null);
    setSubmitting(true);

    try {
      const body = { url };
      if (videoOffset) {
        body.videoTimestampOffset = parseFloat(videoOffset);
      }

      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      // Handle confirmation required for large pages
      if (data.status === 'requires_confirmation') {
        setConfirmation(data);
        setSubmitting(false);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Submission failed');
      }

      navigate(`/archive/${data.submissionId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmedSubmit() {
    setError(null);
    setSubmitting(true);

    try {
      const body = {
        url,
        confirmed: true,
        useCompression,
        creditsRequired: useCompression ? 1 : confirmation.creditsRequired,
      };
      if (videoOffset) {
        body.videoTimestampOffset = parseFloat(videoOffset);
      }

      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Submission failed');
      }

      setConfirmation(null);
      navigate(`/archive/${data.submissionId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form className="submit-form-wrapper" onSubmit={handleSubmit}>
        {error && <div className="error-message">{error}</div>}
        <div className="submit-form">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/page-to-archive"
            required
            disabled={submitting}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !url}
          >
            {submitting ? 'Archiving...' : 'Archive Now'}
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: '12px' }}>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-tertiary)',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            {showAdvanced ? 'Hide' : 'Show'} advanced options
          </button>
        </div>
        {showAdvanced && (
          <div style={{ maxWidth: '640px', margin: '12px auto 0' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                color: 'var(--text-tertiary)',
                marginBottom: '6px',
              }}
            >
              Video frame capture offset (seconds)
            </label>
            <input
              type="number"
              value={videoOffset}
              onChange={(e) => setVideoOffset(e.target.value)}
              placeholder="0"
              min="0"
              max="3600"
              step="0.1"
              style={{
                width: '120px',
                padding: '8px 12px',
                fontFamily: 'var(--mono)',
                fontSize: '0.85rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        )}
      </form>

      {/* Large page confirmation modal */}
      {confirmation && (
        <div className="modal-overlay" onClick={() => setConfirmation(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>This page is {confirmation.captureSizeMB}MB</h3>

            <div className="modal-options">
              <label
                className={`modal-option ${!useCompression ? 'selected' : ''}`}
                onClick={() => setUseCompression(false)}
              >
                <input
                  type="radio"
                  name="captureMode"
                  checked={!useCompression}
                  onChange={() => setUseCompression(false)}
                />
                <div>
                  <strong>Full capture — use {confirmation.creditsRequired} credit{confirmation.creditsRequired > 1 ? 's' : ''}</strong>
                  <span>Complete fidelity, all assets preserved</span>
                </div>
              </label>

              <label
                className={`modal-option ${useCompression ? 'selected' : ''}`}
                onClick={() => setUseCompression(true)}
              >
                <input
                  type="radio"
                  name="captureMode"
                  checked={useCompression}
                  onChange={() => setUseCompression(true)}
                />
                <div>
                  <strong>Compressed capture — use 1 credit</strong>
                  <span>Strips ad/tracker domains, screenshot at JPEG 85% quality. Text and layout preserved.</span>
                </div>
              </label>
            </div>

            <p className="modal-credits">
              You have {confirmation.creditsRemaining} credit{confirmation.creditsRemaining !== 1 ? 's' : ''} remaining.
            </p>

            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmation(null)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleConfirmedSubmit}
                disabled={submitting || (!useCompression && confirmation.creditsRemaining < confirmation.creditsRequired)}
              >
                {submitting ? 'Archiving...' : 'Proceed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
