export default function Topbar({ title, subtitle }) {
  const now = new Date()
  const timeStr = now.toUTCString().slice(17, 25)

  const hour = now.getUTCHours()
  let session = { name: 'SYDNEY', color: 'var(--text-muted)' }
  if (hour >= 0 && hour < 9)   session = { name: 'TOKYO',    color: 'var(--accent-purple)' }
  if (hour >= 7 && hour < 16)  session = { name: 'LONDON',   color: 'var(--accent-blue)' }
  if (hour >= 13 && hour < 22) session = { name: 'NEW YORK', color: 'var(--accent-amber)' }

  return (
    <header style={{
      height: '56px',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 1.5rem',
      position: 'sticky',
      top: 0, zIndex: 50,
    }}>
      <div>
        <div style={{ fontSize: '15px', fontWeight: 600 }}>{title}</div>
        {subtitle && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{subtitle}</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>

        {/* UTC Clock */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '6px', height: '6px',
            borderRadius: '50%',
            background: 'var(--accent-green)',
            boxShadow: '0 0 8px var(--accent-green)',
            animation: 'pulse 2s infinite',
            display: 'inline-block',
          }} />
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {timeStr} UTC
          </span>
        </div>

        {/* Session Badge */}
        <div style={{
          padding: '4px 10px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          color: session.color,
          letterSpacing: '0.08em',
        }}>
          {session.name} SESSION
        </div>

        {/* Upgrade Button */}
        <button style={{
          padding: '6px 14px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--accent-green)',
          background: 'rgba(0, 212, 170, 0.1)',
          color: 'var(--accent-green)',
          fontSize: '11px',
          fontWeight: 600,
          cursor: 'pointer',
          letterSpacing: '0.05em',
        }}>
          UPGRADE
        </button>

      </div>
    </header>
  )
}