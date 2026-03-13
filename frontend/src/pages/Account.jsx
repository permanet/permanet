import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';

export default function Account() {
  const { user, token, authHeaders, loading } = useAuth();
  const [archives, setArchives] = useState([]);
  const [stripeStatus, setStripeStatus] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!token) return;

    fetch('/api/archive?limit=50', { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => setArchives(data.archives || []))
      .catch(() => {});

    fetch('/api/stripe/status', { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setStripeStatus(data); })
      .catch(() => {});
  }, [token]);

  if (loading || !user) return <div className="container loading"><div className="spinner" />Loading...</div>;

  async function handleManageBilling() {
    const res = await fetch('/api/stripe/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
    const data = await res.json();
    if (data.portalUrl) window.location.href = data.portalUrl;
  }

  const tierLabels = { free: 'Free', pro: 'Pro', sealed: 'Sealed' };

  return (
    <div className="container" style={{ paddingTop: '40px', paddingBottom: '60px' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Account</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>{user.email}</p>

      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h3>Subscription</h3>
          <span className={`badge ${user.tier === 'pro' ? 'badge-confirmed' : 'badge-pending'}`}>
            {tierLabels[user.tier] || user.tier} tier
          </span>
        </div>
        {user.tier === 'free' && (
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
              {user.submissionsToday}/10 submissions used today. Archives expire after 2 years.
            </p>
            <Link to="/pricing" className="btn btn-primary" style={{ textDecoration: 'none' }}>
              Upgrade to Pro
            </Link>
          </div>
        )}
        {user.tier === 'pro' && (
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
              Unlimited submissions. Permanent storage. Full API access.
              {stripeStatus?.currentPeriodEnd && (
                <> Next billing: {new Date(stripeStatus.currentPeriodEnd).toLocaleDateString()}</>
              )}
            </p>
            <button className="btn btn-secondary" onClick={handleManageBilling}>
              Manage billing
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '16px' }}>Your Archives</h3>
        {archives.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)' }}>No archives yet.</p>
        ) : (
          <div>
            {archives.map((a) => (
              <Link
                key={a.id}
                to={`/archive/${a.id}`}
                className="feed-item"
              >
                <div className="feed-info">
                  <h4>{a.title || a.url}</h4>
                  <p>{new Date(a.createdAt).toLocaleDateString()}</p>
                </div>
                <span className={`badge badge-${a.otsStatus === 'confirmed' ? 'confirmed' : 'pending'}`}>
                  {a.otsStatus === 'confirmed' ? 'Confirmed' : 'Pending'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
