import { useState, useEffect } from 'react';
import SubmitForm from '../components/SubmitForm';
import ArchiveCard from '../components/ArchiveCard';

export default function Home() {
  const [archives, setArchives] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/archive?limit=10')
      .then((r) => r.json())
      .then((data) => setArchives(data.archives || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container">
      <section className="hero">
        <h1>Archive the web. Prove it existed.</h1>
        <p>
          Capture any webpage with cryptographic proof. Hashed, timestamped on
          the blockchain, permanently stored on Arweave. Tamper-proof and independently verifiable.
        </p>
        <SubmitForm />
      </section>

      <section className="feed">
        <h2>Recent Archives</h2>
        {loading ? (
          <div className="loading">
            <div className="spinner" />
            Loading...
          </div>
        ) : archives.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)' }}>
            No archives yet. Submit a URL above to create the first one.
          </p>
        ) : (
          <div className="feed-list">
            {archives.map((a) => <ArchiveCard key={a.id} archive={a} />)}
          </div>
        )}
      </section>
    </div>
  );
}
