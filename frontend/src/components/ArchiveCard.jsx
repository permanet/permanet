import { Link } from 'react-router-dom';

export default function ArchiveCard({ archive }) {
  const displayUrl = archive.url.length > 60
    ? archive.url.slice(0, 60) + '...'
    : archive.url;

  const timestamp = new Date(archive.captureTimestamp || archive.createdAt);
  const timeStr = timestamp.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Link to={`/archive/${archive.id}`} className="feed-item">
      {archive.screenshotUrl ? (
        <img
          src={archive.screenshotUrl}
          alt=""
          className="feed-thumb"
          loading="lazy"
        />
      ) : (
        <div className="feed-no-thumb">No preview</div>
      )}
      <div className="feed-info">
        <h4>{archive.title || displayUrl}</h4>
        <p>{timeStr}</p>
      </div>
      <StatusBadge status={archive.otsStatus} />
    </Link>
  );
}

function StatusBadge({ status }) {
  const classes = {
    confirmed: 'badge badge-confirmed',
    pending: 'badge badge-pending',
    failed: 'badge badge-failed',
  };

  const labels = {
    confirmed: 'Confirmed',
    pending: 'Pending',
    failed: 'No Timestamp',
  };

  return (
    <span className={classes[status] || 'badge badge-pending'}>
      {labels[status] || status}
    </span>
  );
}
