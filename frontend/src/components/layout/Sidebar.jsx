import { useLocation, useNavigate } from 'react-router-dom'

const NAV_ITEMS = [
  { id: 'dashboard',  label: 'Dashboard',    icon: '⬡', path: '/' },
  { id: 'bias',       label: 'Bias Matrix',  icon: '◈', path: '/bias' },
  { id: 'sessions',   label: 'Sessions',     icon: '◷', path: '/sessions' },
  { id: 'calendar',   label: 'Econ Calendar',icon: '◻', path: '/calendar' },
  { id: 'cot',        label: 'COT Report',   icon: '◉', path: '/cot' },
  { id: 'headlines',  label: 'News Feed',    icon: '◈', path: '/news' },
  { id: 'trump',      label: 'Trump Tracker',icon: '⚑', path: '/trump' },
  { id: 'pricing',    label: 'Pricing',      icon: '💎', path: '/pricing' },
]

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <aside style={{
      width: '220px',
      minHeight: '100vh',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      left: 0, top: 0, bottom: 0,
      zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{
        padding: '1.5rem 1.25rem 1rem',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '16px',
          letterSpacing: '0.08em',
          color: 'var(--accent-green)',
        }}>
          Market<span style={{ color: 'var(--accent-green)' }}>Radar</span>
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', letterSpacing: '0.1em' }}>
          PRO TERMINAL
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0.75rem' }}>
        {NAV_ITEMS.map(item => {
          const isActive = location.pathname === item.path
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 12px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: isActive ? 'rgba(0, 212, 170, 0.08)' : 'transparent',
                color: isActive ? 'var(--accent-green)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-display)',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                marginBottom: '2px',
                textAlign: 'left',
                borderLeft: isActive ? '2px solid var(--accent-green)' : '2px solid transparent',
              }}
            >
              <span style={{ fontSize: '16px' }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* User */}
      <div style={{
        padding: '1rem',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        <div style={{
          width: '32px', height: '32px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent-green), var(--accent-blue))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: 700, color: '#000',
        }}>M</div>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Muzamil</div>
          <div style={{ fontSize: '10px', color: 'var(--accent-green)' }}>PRO</div>
        </div>
      </div>
    </aside>
  )
}