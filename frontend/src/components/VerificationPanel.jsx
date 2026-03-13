export default function VerificationPanel({ verification }) {
  if (!verification) return null;

  return (
    <div className="card">
      <h3>Verify Yourself</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
        You don't need to trust us. Follow these steps to independently verify this archive.
      </p>
      <div className="verify-steps">
        {verification.verificationSteps?.map((step) => (
          <div className="verify-step" key={step.step}>
            <h4>{step.title}</h4>
            <p>{step.description}</p>
            {step.command && <code>{step.command}</code>}
          </div>
        ))}
      </div>
    </div>
  );
}
