import { useState, useEffect, useCallback } from 'react';

const API = '/api/admin';

export default function Admin() {
  const [password, setPassword] = useState(localStorage.getItem('adminPw') || '');
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState('dashboard');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const headers = useCallback(
    () => ({ Authorization: `Bearer ${password}`, 'Content-Type': 'application/json' }),
    [password],
  );

  async function login(e) {
    e.preventDefault();
    try {
      const res = await fetch(`${API}/dashboard`, { headers: { Authorization: `Bearer ${password}` } });
      if (!res.ok) throw new Error('Invalid password');
      localStorage.setItem('adminPw', password);
      setAuthed(true);
      setError(null);
    } catch {
      setError('Invalid admin password');
    }
  }

  const fetchTab = useCallback(
    async (t, extra = '') => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API}/${t}${extra}`, { headers: headers() });
        if (!res.ok) throw new Error('Fetch failed');
        setData(await res.json());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [headers],
  );

  useEffect(() => {
    if (authed) fetchTab(tab);
  }, [authed, tab, fetchTab]);

  async function adminAction(endpoint, method = 'POST') {
    try {
      await fetch(`${API}/${endpoint}`, { method, headers: headers() });
      fetchTab(tab);
    } catch {
      // silent
    }
  }

  if (!authed) {
    return (
      <div className="container" style={{ paddingTop: '80px', maxWidth: '400px' }}>
        <h1 style={{ fontSize: '1.3rem', marginBottom: '24px' }}>Admin Portal</h1>
        {error && <div className="error-message" style={{ marginBottom: '16px' }}>{error}</div>}
        <form onSubmit={login}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '1rem',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-primary)',
              marginBottom: '12px',
            }}
          />
          <button className="btn btn-primary" style={{ width: '100%' }}>
            Log In
          </button>
        </form>
      </div>
    );
  }

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'submissions', label: 'Submissions' },
    { id: 'flagged', label: 'Reported' },
    { id: 'users', label: 'Users' },
    { id: 'payments', label: 'Payments' },
  ];

  return (
    <div className="container" style={{ paddingTop: '32px', paddingBottom: '60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.3rem', margin: 0 }}>Admin Portal</h1>
        <button
          onClick={() => { localStorage.removeItem('adminPw'); setAuthed(false); }}
          style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '0.85rem' }}
        >
          Log out
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '2px' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: tab === t.id ? 'var(--bg-tertiary)' : 'none',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="loading">
          <div className="spinner" />
          Loading...
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {!loading && data && tab === 'dashboard' && <DashboardView data={data} />}
      {!loading && data && tab === 'submissions' && (
        <SubmissionsView data={data} onAction={adminAction} fetchTab={fetchTab} />
      )}
      {!loading && data && tab === 'flagged' && <FlaggedView data={data} onAction={adminAction} />}
      {!loading && data && tab === 'users' && <UsersView data={data} headers={headers} />}
      {!loading && data && tab === 'payments' && <PaymentsView data={data} />}
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)',
        padding: '20px',
        flex: '1 1 180px',
      }}
    >
      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

function DashboardView({ data }) {
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
        <StatCard label="Total Archives" value={data.totalSubmissions} sub={`${data.recentSubmissions24h} in last 24h`} />
        <StatCard label="Total Users" value={data.totalUsers} sub={`${data.proUsers} pro`} />
        <StatCard label="Revenue" value={`$${data.totalRevenueDollars.toFixed(2)}`} />
        <StatCard label="Reported" value={data.reportedCount} />
        <StatCard label="Expiring Soon" value={data.expiringSoonCount} sub="Next 30 days" />
      </div>

      <h3 style={{ fontSize: '0.95rem', marginBottom: '12px' }}>Storage Tiers</h3>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        {Object.entries(data.storageTiers).map(([tier, count]) => (
          <StatCard key={tier} label={tier} value={count} />
        ))}
      </div>

      {Object.keys(data.revenue).length > 0 && (
        <>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '12px' }}>Revenue Breakdown</h3>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {Object.entries(data.revenue).map(([type, info]) => (
              <StatCard key={type} label={type.replace(/_/g, ' ')} value={`$${info.total.toFixed(2)}`} sub={`${info.count} transactions`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SubmissionsView({ data, onAction, fetchTab }) {
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (filter) fetchTab('submissions', `?filter=${filter}`);
    else fetchTab('submissions');
  }, [filter]); // eslint-disable-line

  const filters = ['', 'reported', 'expiring', 'hidden', 'free', 'sealed', 'pro'];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Filter:</span>
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: filter === f ? '#0a0a0a' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '0.78rem',
              cursor: 'pointer',
            }}
          >
            {f || 'All'}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
          {data.total} total
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Title / URL', 'User', 'Tier', 'Status', 'OTS', 'Expires', 'Date', 'Actions'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--text-tertiary)', fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.submissions.map((s) => (
            <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td style={{ padding: '8px 6px', maxWidth: '250px' }}>
                <a href={`/archive/${s.id}`} target="_blank" rel="noreferrer" style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>
                  {s.page_title || s.original_url.slice(0, 50)}
                </a>
                {s.reported && <span style={{ color: '#ef4444', fontSize: '0.7rem', marginLeft: '6px' }}>REPORTED</span>}
              </td>
              <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>{s.user_email || '—'}</td>
              <td style={{ padding: '8px 6px' }}>
                <span className={`badge badge-${s.storage_tier === 'free' ? 'pending' : 'confirmed'}`} style={{ fontSize: '0.7rem' }}>
                  {s.storage_tier}
                </span>
              </td>
              <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>{s.status}</td>
              <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>{s.ots_status}</td>
              <td style={{ padding: '8px 6px', color: s.expires_at ? 'var(--warning)' : 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : '—'}
              </td>
              <td style={{ padding: '8px 6px', fontSize: '0.75rem' }}>
                {new Date(s.created_at).toLocaleDateString()}
              </td>
              <td style={{ padding: '8px 6px' }}>
                {s.status === 'hidden' ? (
                  <button onClick={() => onAction(`unhide/${s.id}`)} style={actionBtn}>Restore</button>
                ) : (
                  <button onClick={() => onAction(`hide/${s.id}`)} style={{ ...actionBtn, color: '#ef4444' }}>Hide</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FlaggedView({ data, onAction }) {
  if (data.flagged.length === 0) {
    return <p style={{ color: 'var(--text-tertiary)' }}>No reported content.</p>;
  }

  return (
    <div>
      {data.flagged.map((s) => (
        <div
          key={s.id}
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 'var(--radius)',
            padding: '16px',
            marginBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <a href={`/archive/${s.id}`} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {s.page_title || 'Untitled'}
              </a>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0', fontFamily: 'var(--mono)' }}>
                {s.original_url}
              </p>
              <p style={{ fontSize: '0.85rem', color: '#ef4444', margin: '8px 0 0' }}>
                Reason: {s.report_reason}
              </p>
              {s.user_email && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
                  Submitted by: {s.user_email}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => onAction(`unflag/${s.id}`)} style={actionBtn}>Dismiss</button>
              <button onClick={() => onAction(`hide/${s.id}`)} style={{ ...actionBtn, color: '#ef4444', borderColor: '#ef4444' }}>Hide</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function UsersView({ data, headers }) {
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function viewUser(userId) {
    setDetailLoading(true);
    try {
      const res = await fetch(`${API}/users/${userId}`, { headers: headers() });
      setDetail(await res.json());
    } catch {
      // silent
    } finally {
      setDetailLoading(false);
    }
  }

  if (detail) {
    return (
      <div>
        <button onClick={() => setDetail(null)} style={{ ...actionBtn, marginBottom: '16px' }}>← Back to Users</button>
        <h3 style={{ fontSize: '1rem', marginBottom: '8px' }}>{detail.user.email}</h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <StatCard label="Tier" value={detail.user.tier} />
          <StatCard label="Submissions" value={detail.submissions.length} />
          <StatCard label="Payments" value={detail.payments.length} />
          <StatCard label="Joined" value={new Date(detail.user.created_at).toLocaleDateString()} />
        </div>

        <h4 style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Submissions</h4>
        {detail.submissions.map((s) => (
          <div key={s.id} style={{ fontSize: '0.8rem', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '12px' }}>
            <a href={`/archive/${s.id}`} target="_blank" rel="noreferrer" style={{ flex: 1, color: 'var(--text-primary)' }}>
              {s.page_title || s.original_url.slice(0, 60)}
            </a>
            <span className={`badge badge-${s.storage_tier === 'free' ? 'pending' : 'confirmed'}`} style={{ fontSize: '0.7rem' }}>{s.storage_tier}</span>
            <span style={{ color: 'var(--text-tertiary)' }}>{new Date(s.capture_timestamp).toLocaleDateString()}</span>
          </div>
        ))}

        {detail.payments.length > 0 && (
          <>
            <h4 style={{ fontSize: '0.9rem', marginTop: '20px', marginBottom: '8px' }}>Payment History</h4>
            {detail.payments.map((p) => (
              <div key={p.id} style={{ fontSize: '0.8rem', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '12px' }}>
                <span style={{ flex: 1 }}>{p.type.replace(/_/g, ' ')}</span>
                <span style={{ fontWeight: 600 }}>${(p.amount_cents / 100).toFixed(2)}</span>
                <span style={{ color: 'var(--text-tertiary)' }}>{new Date(p.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: '16px' }}>{data.total} users</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Email', 'Tier', 'Submissions', 'Paid', 'Joined', ''].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--text-tertiary)', fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.users.map((u) => (
            <tr key={u.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td style={{ padding: '8px 6px', color: 'var(--text-primary)' }}>{u.email}</td>
              <td style={{ padding: '8px 6px' }}>
                <span className={`badge badge-${u.tier === 'free' ? 'pending' : 'confirmed'}`} style={{ fontSize: '0.7rem' }}>{u.tier}</span>
              </td>
              <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>{u.submission_count}</td>
              <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>
                {parseInt(u.total_paid_cents) > 0 ? `$${(parseInt(u.total_paid_cents) / 100).toFixed(2)}` : '—'}
              </td>
              <td style={{ padding: '8px 6px', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                {new Date(u.created_at).toLocaleDateString()}
              </td>
              <td style={{ padding: '8px 6px' }}>
                <button onClick={() => viewUser(u.id)} style={actionBtn}>View</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentsView({ data }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <StatCard label="Total Payments" value={data.total} />
        <StatCard label="Revenue" value={`$${(data.totalRevenueCents / 100).toFixed(2)}`} />
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['User', 'Type', 'Amount', 'Status', 'Date', 'Stripe ID'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--text-tertiary)', fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.payments.map((p) => (
            <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td style={{ padding: '8px 6px', color: 'var(--text-primary)' }}>{p.user_email}</td>
              <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>{p.type.replace(/_/g, ' ')}</td>
              <td style={{ padding: '8px 6px', fontWeight: 600 }}>${(p.amount_cents / 100).toFixed(2)}</td>
              <td style={{ padding: '8px 6px' }}>
                <span className={`badge badge-${p.status === 'completed' ? 'confirmed' : 'pending'}`} style={{ fontSize: '0.7rem' }}>
                  {p.status}
                </span>
              </td>
              <td style={{ padding: '8px 6px', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                {new Date(p.created_at).toLocaleString()}
              </td>
              <td style={{ padding: '8px 6px', color: 'var(--text-tertiary)', fontSize: '0.7rem', fontFamily: 'var(--mono)' }}>
                {p.stripe_payment_id?.slice(0, 20)}...
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const actionBtn = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '4px 10px',
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
};
