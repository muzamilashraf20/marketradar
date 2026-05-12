import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { LogOut, Activity } from 'lucide-react'

const NAV_ITEMS = [
  { id: 'dashboard',  label: 'Dashboard',     icon: '⬡', path: '/dashboard' },
  { id: 'bias',       label: 'Bias Matrix',   icon: '◈', path: '/bias' },
  { id: 'sessions',   label: 'Sessions',      icon: '◷', path: '/sessions' },
  { id: 'calendar',   label: 'Econ Calendar', icon: '◻', path: '/calendar' },
  { id: 'cot',        label: 'COT Report',    icon: '◉', path: '/cot' },
  { id: 'headlines',  label: 'News Feed',     icon: '◈', path: '/news' },
  { id: 'trump',      label: 'Trump Tracker', icon: '⚑', path: '/trump' },
  { id: 'pricing',    label: 'Pricing',       icon: '💎', path: '/pricing' },
]

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const initial = user?.email?.charAt(0).toUpperCase() || 'U'
  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'

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
        padding: '1.25rem',
        borderBottom: '1px solid var(--border)',
      }}>
        <div
          onClick={() => navigate('/dashboard')}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <div style={{
            width: '32px', height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #22d3ee, #10b981)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Activity size={16} color="#000" strokeWidth={3} />
          </div>
          <div>
            <div style={{
              fontWeight: 800,
              fontSize: '15px',
              letterSpacing: '-0.02em',
              color: '#f0f4f8',
              lineHeight: 1,
            }}>
              Bias<span style={{ color: '#22d3ee' }}>Forge</span>
              <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 500 }}>.ai</span>
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px', letterSpacing: '0.1em' }}>
              PRO TERMINAL
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0.75rem', overflowY: 'auto' }}>
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
                background: isActive ? 'rgba(34, 211, 238, 0.08)' : 'transparent',
                color: isActive ? '#22d3ee' : 'var(--text-secondary)',
                fontFamily: 'var(--font-display)',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                marginBottom: '2px',
                textAlign: 'left',
                borderLeft: isActive ? '2px solid #22d3ee' : '2px solid transparent',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: '15px' }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* User + Logout */}
      <div style={{
        padding: '0.75rem 1rem',
        borderTop: '1px solid var(--border)',
      }}>
        {/* User info */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '8px',
        }}>
          <div style={{
            width: '32px', height: '32px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #22d3ee, #10b981)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: 700, color: '#000',
            flexShrink: 0,
          }}>
            {initial}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{
              fontSize: '12px', fontWeight: 600,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {displayName}
            </div>
            <div style={{ fontSize: '10px', color: '#22d3ee' }}>PRO</div>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            fontFamily: 'var(--font-display)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,77,106,0.08)'
            e.currentTarget.style.color = '#ff4d6a'
            e.currentTarget.style.borderColor = 'rgba(255,77,106,0.2)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
          }}
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>

    </aside>
  )
}