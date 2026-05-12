import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { LogOut } from 'lucide-react'

export default function Topbar({ title, subtitle }) {
  const [timeStr, setTimeStr] = useState('')
  const [session, setSession] = useState({ name: 'SYDNEY', color: 'var(--text-muted)' })
  const navigate = useNavigate()
  const { logout } = useAuth()

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTimeStr(now.toUTCString().slice(17, 25))
      const hour = now.getUTCHours()
      if (hour >= 0 && hour < 7)   setSession({ name: 'TOKYO',    color: 'var(--accent-purple)' })
      else if (hour >= 7 && hour < 13)  setSession({ name: 'LONDON',   color: '#60a5fa' })
      else if (hour >= 13 && hour < 22) setSession({ name: 'NEW YORK', color: 'var(--accent-amber)' })
      else setSession({ name: 'SYDNEY', color: 'var(--text-muted)' })
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

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

      {/* Left — Title */}
      <div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{subtitle}</div>
        )}
      </div>

      {/* Right — Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>

        {/* UTC Clock */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '6px', height: '6px',
            borderRadius: '50%',
            background: '#22d3ee',
            boxShadow: '0 0 8px #22d3ee',
            display: 'inline-block',
            animation: 'pulse 2s infinite',
          }} />
          <span style={{
            fontSize: '11px',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
          }}>
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
        <button
          onClick={() => navigate('/pricing')}
          style={{
            padding: '6px 14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid #22d3ee',
            background: 'rgba(34, 211, 238, 0.08)',
            color: '#22d3ee',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.05em',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,211,238,0.15)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,211,238,0.08)'}
        >
          UPGRADE
        </button>

        {/* Logout — mobile fallback */}
        <button
          onClick={handleLogout}
          title="Sign Out"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: '11px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
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
          <LogOut size={13} />
          <span style={{ display: 'none' }} className="sm:inline">Sign Out</span>
        </button>

      </div>
    </header>
  )
}