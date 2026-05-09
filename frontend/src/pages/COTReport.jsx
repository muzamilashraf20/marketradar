import { useState } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'

const COT_DATA = [
  {
    currency: 'EUR',
    flag: '🇪🇺',
    longContracts: 187432,
    shortContracts: 134521,
    netPosition: 52911,
    prevNet: 41230,
    bias: 'Bullish',
    biasColor: '#00D4AA',
    change: '+11,681',
    changeType: 'up',
    weeks: [42, 48, 51, 55, 58, 62, 68, 65, 70, 72, 69, 74],
  },
  {
    currency: 'GBP',
    flag: '🇬🇧',
    longContracts: 98234,
    shortContracts: 67891,
    netPosition: 30343,
    prevNet: 24100,
    bias: 'Bullish',
    biasColor: '#00D4AA',
    change: '+6,243',
    changeType: 'up',
    weeks: [30, 35, 38, 40, 42, 45, 48, 44, 50, 52, 49, 55],
  },
  {
    currency: 'JPY',
    flag: '🇯🇵',
    longContracts: 45123,
    shortContracts: 198432,
    netPosition: -153309,
    prevNet: -142100,
    bias: 'Bearish',
    biasColor: '#FF4D6A',
    change: '-11,209',
    changeType: 'down',
    weeks: [25, 20, 18, 15, 12, 10, 8, 6, 8, 5, 7, 4],
  },
  {
    currency: 'CHF',
    flag: '🇨🇭',
    longContracts: 23456,
    shortContracts: 31234,
    netPosition: -7778,
    prevNet: -5200,
    bias: 'Bearish',
    biasColor: '#FF4D6A',
    change: '-2,578',
    changeType: 'down',
    weeks: [48, 45, 42, 40, 38, 35, 38, 36, 34, 32, 35, 33],
  },
  {
    currency: 'AUD',
    flag: '🇦🇺',
    longContracts: 34521,
    shortContracts: 89432,
    netPosition: -54911,
    prevNet: -48300,
    bias: 'Bearish',
    biasColor: '#FF4D6A',
    change: '-6,611',
    changeType: 'down',
    weeks: [35, 30, 28, 25, 22, 20, 18, 15, 18, 14, 16, 12],
  },
  {
    currency: 'NZD',
    flag: '🇳🇿',
    longContracts: 18234,
    shortContracts: 42341,
    netPosition: -24107,
    prevNet: -19800,
    bias: 'Bearish',
    biasColor: '#FF4D6A',
    change: '-4,307',
    changeType: 'down',
    weeks: [40, 35, 32, 28, 25, 22, 20, 18, 20, 16, 18, 14],
  },
  {
    currency: 'CAD',
    flag: '🇨🇦',
    longContracts: 56789,
    shortContracts: 61234,
    netPosition: -4445,
    prevNet: -2100,
    bias: 'Neutral',
    biasColor: '#8A9BB0',
    change: '-2,345',
    changeType: 'down',
    weeks: [50, 48, 52, 49, 51, 48, 50, 47, 49, 51, 48, 50],
  },
]

const BIAS_STYLES = {
  Bullish: { bg: 'rgba(0,212,170,0.1)',   color: '#00D4AA', border: 'rgba(0,212,170,0.25)' },
  Bearish: { bg: 'rgba(255,77,106,0.1)',  color: '#FF4D6A', border: 'rgba(255,77,106,0.25)' },
  Neutral: { bg: 'rgba(138,155,176,0.1)', color: '#8A9BB0', border: 'rgba(138,155,176,0.2)' },
}

function MiniChart({ weeks, color }) {
  const max = Math.max(...weeks)
  const min = Math.min(...weeks)
  const range = max - min || 1
  const w = 120
  const h = 40
  const points = weeks.map((v, i) => {
    const x = (i / (weeks.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.8"
      />
      <polyline
        points={`0,${h} ${points} ${w},${h}`}
        fill={color}
        opacity="0.08"
        stroke="none"
      />
    </svg>
  )
}

export default function COTReport() {
  const [selected, setSelected] = useState(null)

  const bullish = COT_DATA.filter(d => d.bias === 'Bullish').length
  const bearish = COT_DATA.filter(d => d.bias === 'Bearish').length

  return (
    <DashboardLayout title="COT Report" subtitle="CFTC Commitment of Traders — Institutional positioning">

      {/* Info Banner */}
      <div style={{
        background: 'rgba(77,166,255,0.08)',
        border: '1px solid rgba(77,166,255,0.2)',
        borderRadius: 'var(--radius-lg)',
        padding: '12px 16px',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        <span style={{ fontSize: '16px' }}>📊</span>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          COT data is released every <strong style={{ color: 'var(--accent-blue)' }}>Friday at 3:30 PM EST</strong> by the CFTC, reflecting positions from the previous Tuesday. Use this to track institutional (smart money) positioning.
        </span>
      </div>

      {/* Stats Row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))',
        gap: '10px', marginBottom: '1.5rem',
      }}>
        {[
          { label: 'Currencies Tracked', value: '7',          color: 'var(--text-primary)' },
          { label: 'Net Bullish',         value: bullish,       color: '#00D4AA' },
          { label: 'Net Bearish',         value: bearish,       color: '#FF4D6A' },
          { label: 'Data Updated',        value: 'Fri',         color: '#F5A623' },
        ].map(stat => (
          <div key={stat.label} className="card" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: stat.color }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', letterSpacing: '0.06em' }}>
              {stat.label.toUpperCase()}
            </div>
          </div>
        ))}
      </div>

      {/* COT Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {COT_DATA.map(item => {
          const s = BIAS_STYLES[item.bias]
          const totalContracts = item.longContracts + item.shortContracts
          const longPct = Math.round((item.longContracts / totalContracts) * 100)
          const shortPct = 100 - longPct
          const isSelected = selected === item.currency

          return (
            <div
              key={item.currency}
              className="card"
              onClick={() => setSelected(isSelected ? null : item.currency)}
              style={{ cursor: 'pointer', transition: 'all 0.2s' }}
            >
              {/* Main Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>

                {/* Currency */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '80px' }}>
                  <span style={{ fontSize: '20px' }}>{item.flag}</span>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {item.currency}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Futures</div>
                  </div>
                </div>

                {/* Long/Short Bar */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: '#00D4AA' }}>LONG {longPct}%</span>
                    <span style={{ fontSize: '10px', color: '#FF4D6A' }}>SHORT {shortPct}%</span>
                  </div>
                  <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: `${longPct}%`, background: '#00D4AA', borderRadius: '3px 0 0 3px' }} />
                    <div style={{ width: `${shortPct}%`, background: '#FF4D6A', borderRadius: '0 3px 3px 0' }} />
                  </div>
                </div>

                {/* Net Position */}
                <div style={{ textAlign: 'center', minWidth: '100px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>NET POSITION</div>
                  <div style={{
                    fontSize: '14px', fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: item.netPosition > 0 ? '#00D4AA' : item.netPosition < 0 ? '#FF4D6A' : '#8A9BB0',
                  }}>
                    {item.netPosition > 0 ? '+' : ''}{item.netPosition.toLocaleString()}
                  </div>
                </div>

                {/* Weekly Change */}
                <div style={{ textAlign: 'center', minWidth: '80px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>WK CHANGE</div>
                  <div style={{
                    fontSize: '13px', fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    color: item.changeType === 'up' ? '#00D4AA' : '#FF4D6A',
                  }}>
                    {item.change}
                  </div>
                </div>

                {/* Mini Chart */}
                <div style={{ minWidth: '120px' }}>
                  <MiniChart weeks={item.weeks} color={item.biasColor} />
                </div>

                {/* Bias */}
                <span style={{
                  padding: '4px 12px', borderRadius: '6px',
                  background: s.bg, color: s.color,
                  border: `1px solid ${s.border}`,
                  fontSize: '11px', fontWeight: 700,
                  minWidth: '80px', textAlign: 'center',
                }}>
                  {item.bias === 'Bullish' ? '▲' : item.bias === 'Bearish' ? '▼' : '—'} {item.bias}
                </span>
              </div>

              {/* Expanded Detail */}
              {isSelected && (
                <div style={{
                  marginTop: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--border)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
                  gap: '12px',
                }}>
                  {[
                    { label: 'Long Contracts',  value: item.longContracts.toLocaleString(),  color: '#00D4AA' },
                    { label: 'Short Contracts', value: item.shortContracts.toLocaleString(), color: '#FF4D6A' },
                    { label: 'Previous Net',    value: item.prevNet.toLocaleString(),        color: '#8A9BB0' },
                  ].map(detail => (
                    <div key={detail.label} style={{
                      padding: '12px',
                      background: 'var(--bg-elevated)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border)',
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.06em' }}>
                        {detail.label.toUpperCase()}
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: detail.color }}>
                        {detail.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

    </DashboardLayout>
  )
}