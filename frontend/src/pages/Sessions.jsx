import { useState, useEffect } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'

const SESSIONS = [
  {
    id: 'sydney',
    name: 'Sydney',
    flag: '🇦🇺',
    open: 21, // UTC
    close: 6,
    color: '#8B7CF6',
    pairs: ['AUD/USD', 'NZD/USD', 'AUD/NZD'],
    description: 'Low volatility session. AUD and NZD most active. Thin liquidity.',
    characteristics: ['Low Volume', 'AUD/NZD Focus', 'Thin Liquidity'],
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    flag: '🇯🇵',
    open: 0,
    close: 9,
    color: '#4DA6FF',
    pairs: ['USD/JPY', 'EUR/JPY', 'AUD/JPY'],
    description: 'Asian session. JPY pairs most active. BoJ interventions possible.',
    characteristics: ['JPY Focus', 'BoJ Watch', 'Medium Volume'],
  },
  {
    id: 'london',
    name: 'London',
    flag: '🇬🇧',
    open: 7,
    close: 16,
    color: '#00D4AA',
    pairs: ['EUR/USD', 'GBP/USD', 'EUR/GBP'],
    description: 'Highest volume session. Major moves happen here. Best for breakout trading.',
    characteristics: ['Highest Volume', 'Major Breakouts', 'EUR/GBP Focus'],
  },
  {
    id: 'newyork',
    name: 'New York',
    flag: '🇺🇸',
    open: 13,
    close: 22,
    color: '#F5A623',
    pairs: ['EUR/USD', 'USD/CAD', 'USD/CHF'],
    description: 'Second highest volume. USD pairs dominate. Overlaps with London 13:00-16:00 UTC.',
    characteristics: ['USD Focus', 'High Volume', 'News Driven'],
  },
]

function getSessionStatus(open, close, currentHour) {
  if (open > close) {
    return currentHour >= open || currentHour < close
  }
  return currentHour >= open && currentHour < close
}

function getSessionProgress(open, close, currentHour, currentMin) {
  const totalMins = open > close
    ? (24 - open + close) * 60
    : (close - open) * 60

  let elapsed
  if (open > close) {
    elapsed = currentHour >= open
      ? (currentHour - open) * 60 + currentMin
      : (24 - open + currentHour) * 60 + currentMin
  } else {
    elapsed = (currentHour - open) * 60 + currentMin
  }

  return Math.min(100, Math.max(0, (elapsed / totalMins) * 100))
}

export default function Sessions() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const utcHour = time.getUTCHours()
  const utcMin = time.getUTCMinutes()
  const utcSec = time.getUTCSeconds()

  const activeSessions = SESSIONS.filter(s => getSessionStatus(s.open, s.close, utcHour))

  return (
    <DashboardLayout title="Market Sessions" subtitle="Real-time global trading session tracker">

      {/* Live Clock */}
      <div style={{
        textAlign: 'center',
        marginBottom: '2rem',
        padding: '2rem',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>
          CURRENT UTC TIME
        </div>
        <div style={{
          fontSize: '52px',
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          color: 'var(--accent-green)',
          letterSpacing: '0.05em',
          lineHeight: 1,
        }}>
          {String(utcHour).padStart(2,'0')}:
          {String(utcMin).padStart(2,'0')}:
          {String(utcSec).padStart(2,'0')}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '10px' }}>
          {activeSessions.length === 0
            ? 'No major session active'
            : `${activeSessions.map(s => s.name).join(' + ')} Session${activeSessions.length > 1 ? 's' : ''} Active`}
        </div>
      </div>

      {/* Session Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
        gap: '12px',
        marginBottom: '1.5rem',
      }}>
        {SESSIONS.map(session => {
          const isActive = getSessionStatus(session.open, session.close, utcHour)
          const progress = isActive ? getSessionProgress(session.open, session.close, utcHour, utcMin) : 0

          return (
            <div key={session.id} className="card" style={{
              borderLeft: `3px solid ${isActive ? session.color : 'var(--border)'}`,
              opacity: isActive ? 1 : 0.6,
              transition: 'all 0.3s',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '24px' }}>{session.flag}</span>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {session.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {String(session.open).padStart(2,'0')}:00 — {String(session.close).padStart(2,'0')}:00 UTC
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  background: isActive ? `${session.color}20` : 'var(--bg-elevated)',
                  border: `1px solid ${isActive ? session.color + '40' : 'var(--border)'}`,
                }}>
                  <span style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: isActive ? session.color : 'var(--text-muted)',
                    boxShadow: isActive ? `0 0 8px ${session.color}` : 'none',
                    animation: isActive ? 'pulse 2s infinite' : 'none',
                    display: 'inline-block',
                  }} />
                  <span style={{
                    fontSize: '11px', fontWeight: 700,
                    color: isActive ? session.color : 'var(--text-muted)',
                    letterSpacing: '0.06em',
                  }}>
                    {isActive ? 'OPEN' : 'CLOSED'}
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              {isActive && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Session Progress</span>
                    <span style={{ fontSize: '10px', color: session.color, fontFamily: 'var(--font-mono)' }}>
                      {Math.round(progress)}%
                    </span>
                  </div>
                  <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px' }}>
                    <div style={{
                      height: '100%', width: `${progress}%`,
                      background: session.color,
                      borderRadius: '2px',
                      boxShadow: `0 0 8px ${session.color}60`,
                      transition: 'width 1s linear',
                    }} />
                  </div>
                </div>
              )}

              {/* Description */}
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '12px' }}>
                {session.description}
              </div>

              {/* Active Pairs */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.06em' }}>
                  BEST PAIRS
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {session.pairs.map(pair => (
                    <span key={pair} style={{
                      padding: '3px 10px', borderRadius: '4px',
                      background: isActive ? `${session.color}15` : 'var(--bg-elevated)',
                      border: `1px solid ${isActive ? session.color + '30' : 'var(--border)'}`,
                      fontSize: '11px', fontWeight: 600,
                      color: isActive ? session.color : 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}>{pair}</span>
                  ))}
                </div>
              </div>

              {/* Characteristics */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {session.characteristics.map(c => (
                  <span key={c} style={{
                    padding: '2px 8px', borderRadius: '4px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    fontSize: '10px', color: 'var(--text-muted)',
                  }}>{c}</span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Overlap Info */}
      <div className="card" style={{
        background: 'rgba(0,212,170,0.05)',
        border: '1px solid rgba(0,212,170,0.15)',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-green)', marginBottom: '10px' }}>
          ⚡ Key Session Overlaps
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '10px' }}>
          {[
            { name: 'London + New York', time: '13:00 — 16:00 UTC', desc: 'Highest volatility of the day. Best for breakouts.', color: '#00D4AA' },
            { name: 'Tokyo + London', time: '07:00 — 09:00 UTC', desc: 'EUR/JPY most active. Watch for momentum shifts.', color: '#4DA6FF' },
          ].map(overlap => (
            <div key={overlap.name} style={{
              padding: '12px',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: overlap.color, marginBottom: '4px' }}>
                {overlap.name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                {overlap.time}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {overlap.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

    </DashboardLayout>
  )
}