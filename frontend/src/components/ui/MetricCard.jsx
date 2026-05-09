export default function MetricCard({ label, value, change, changeType = 'neutral', prefix = '', suffix = '' }) {
  const colors = {
    up:      'var(--accent-green)',
    down:    'var(--accent-red)',
    neutral: 'var(--text-muted)',
  }

  const arrows = {
    up:      '▲',
    down:    '▼',
    neutral: '—',
  }

  return (
    <div className="card">
      <div style={{
        fontSize: '11px',
        color: 'var(--text-muted)',
        letterSpacing: '0.08em',
        marginBottom: '8px',
      }}>
        {label.toUpperCase()}
      </div>

      <div style={{
        fontSize: '24px',
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-primary)',
        lineHeight: 1,
        marginBottom: '8px',
      }}>
        {prefix}{value}{suffix}
      </div>

      {change && (
        <div style={{
          fontSize: '12px',
          color: colors[changeType],
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          <span>{arrows[changeType]}</span>
          {change}
        </div>
      )}
    </div>
  )
}