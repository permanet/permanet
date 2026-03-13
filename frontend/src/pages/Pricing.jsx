import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';

export default function Pricing() {
  const { user, token, authHeaders } = useAuth();

  async function handleSubscribe() {
    if (!token) {
      window.location.href = '/register';
      return;
    }

    const res = await fetch('/api/stripe/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
    const data = await res.json();
    if (data.checkoutUrl) window.location.href = data.checkoutUrl;
  }

  return (
    <div className="container content-page">
      <h1>Pricing</h1>
      <p style={{ fontSize: '1.1rem', marginBottom: '40px' }}>
        Cryptographic web archiving for everyone. Choose your plan.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        {/* Free */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>Free</h3>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>$0</div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>forever</div>
          </div>
          <ul style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', listStyle: 'none', padding: 0, flex: 1 }}>
            <li style={{ marginBottom: '8px' }}>10 credits per day</li>
            <li style={{ marginBottom: '8px' }}>Archives retained for 2 years</li>
            <li style={{ marginBottom: '8px' }}>Full cryptographic verification</li>
            <li style={{ marginBottom: '8px' }}>Blockchain timestamping</li>
            <li style={{ marginBottom: '8px' }}>Permanent Arweave storage</li>
          </ul>
          {user ? (
            user.tier === 'free' ? (
              <div className="badge badge-confirmed" style={{ alignSelf: 'flex-start' }}>Current plan</div>
            ) : null
          ) : (
            <Link to="/register" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
              Get started
            </Link>
          )}
        </div>

        {/* Permanent Seal */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', borderColor: 'var(--accent-dim)' }}>
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>Permanent Seal</h3>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>$1</div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>per archive</div>
          </div>
          <ul style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', listStyle: 'none', padding: 0, flex: 1 }}>
            <li style={{ marginBottom: '8px' }}>One-time payment per archive</li>
            <li style={{ marginBottom: '8px' }}>Guaranteed permanent storage</li>
            <li style={{ marginBottom: '8px' }}>Archive never expires</li>
            <li style={{ marginBottom: '8px' }}>Available on any free-tier archive</li>
            <li style={{ marginBottom: '8px' }}>No subscription required</li>
          </ul>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
            Seal individual archives from any archive page
          </p>
        </div>

        {/* Pro */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', borderColor: 'var(--accent)', position: 'relative' }}>
          <div style={{
            position: 'absolute', top: '-12px', right: '16px',
            background: 'var(--accent)', color: '#fff',
            padding: '4px 12px', borderRadius: '100px',
            fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            Recommended
          </div>
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>Pro</h3>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>$24<span style={{ fontSize: '1rem', fontWeight: 400 }}>/mo</span></div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>200 credits/month</div>
          </div>
          <ul style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', listStyle: 'none', padding: 0, flex: 1 }}>
            <li style={{ marginBottom: '8px' }}>200 credits per month</li>
            <li style={{ marginBottom: '8px' }}>Permanent storage — archives never expire</li>
            <li style={{ marginBottom: '8px' }}>Full API access</li>
            <li style={{ marginBottom: '8px' }}>Bulk submission support</li>
            <li style={{ marginBottom: '8px' }}>Priority capture queue</li>
          </ul>
          {user?.tier === 'pro' ? (
            <div className="badge badge-confirmed" style={{ alignSelf: 'flex-start' }}>Current plan</div>
          ) : (
            <button onClick={handleSubscribe} className="btn btn-primary" style={{ width: '100%' }}>
              {user ? 'Upgrade to Pro' : 'Get started'}
            </button>
          )}
        </div>
      </div>

      <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '60px' }}>
        1 credit = up to 10MB. Most pages use 1 credit. Large pages (homepages, dashboards) use 2-5 credits based on size.
      </p>
    </div>
  );
}
