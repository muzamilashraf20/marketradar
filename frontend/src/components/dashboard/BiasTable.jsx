const PAIRS = ['EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD']

const BIAS_DATA = {
  EUR: { bias: 'Bullish', strength: 72 },
  GBP: { bias: 'Bullish', strength: 65 },
  JPY: { bias: 'Bearish', strength: 30 },
  CHF: { bias: 'Neutral',  strength: 50 },
  AUD: { bias: 'Bearish', strength: 25 },
  NZD: { bias: 'Bearish', strength: 35 },
  CAD: { bias: 'Neutral',  strength: 48 },
}

const getBiasStyle = (bias) => {
  const styles = {
    Bullish: { bg: 'rgba(0,212,170,0.1)',   color: 'var(--accent-green)', border: 'rgba(0,212,170,0.25)' },
    Bearish: { bg: 'rgba(255,77,106,0.1)',  color: 'var(--accent-red)',   border: 'rgba(255,77,106,0.25)' },
    Neutral: { bg: 'rgba(138,155,176,0.1)', color: 'var(--text-secondary)', border: 'var(--border)' },
  }
  return styles[bias] || styles.Neutral
}

export default function BiasTable() {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.05em' }}>
          CURRENCY BIAS
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Updated 5m ago
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {PAIRS.map(pair => {
          const { bias, strength } = BIAS_DATA[pair]
          const s = getBiasStyle(bias)
          return (
            <div key={pair} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
            }}>
              {/* Pair name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '70px' }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                }}>{pair}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>/USD</span>
              </div>

              {/* Strength bar */}
              <div style={{ flex: 1, margin: '0 1rem', height: '3px', background: 'var(--border)', borderRadius: '2px' }}>
                <div style={{
                  height: '100%',
                  width: `${strength}%`,
                  background: s.color,
                  borderRadius: '2px',
                  transition: 'width 0.4s ease',
                }} />
              </div>

              {/* Bias badge */}
              <span style={{
                padding: '3px 10px',
                borderRadius: 'var(--radius-sm)',
                background: s.bg,
                color: s.color,
                border: `1px solid ${s.border}`,
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                minWidth: '68px',
                textAlign: 'center',
              }}>
                {bias.toUpperCase()}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}