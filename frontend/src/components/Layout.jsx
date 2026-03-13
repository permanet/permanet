import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function Layout({ children }) {
  const { user, logout } = useAuth();

  return (
    <>
      <header className="header">
        <div className="container-wide header-inner">
          <Link to="/" className="logo">
            <img src="/logo-white.png" alt="" className="logo-icon" />
            Permanet
          </Link>
          <nav className="nav">
            <Link to="/">Archive</Link>
            <Link to="/how-it-works">How It Works</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/about">About</Link>
            {user ? (
              <>
                <Link to="/account">{user.email}</Link>
                <button
                  onClick={logout}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <Link to="/login">Log in</Link>
            )}
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="footer">
        <div className="container">
          Permanet — Open source, AGPL-3.0 licensed. Cryptographic web archiving for the public record.{' '}
          <a href="https://github.com/eshaghoff/permanet" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            View on GitHub
          </a>
        </div>
      </footer>
    </>
  );
}
