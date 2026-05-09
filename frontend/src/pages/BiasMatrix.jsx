import { useState } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'

const PAIRS_DATA = [
  { pair: 'EUR/USD', category: 'Forex', bias: 'Bearish', price: '1.1750', support: '1.1600', resistance: '1.1850', summary: 'Fed hawkish stance keeping dollar strong. ECB dovish signals weighing on Euro amid macro uncertainty.', strength: 28 },
  { pair: 'GBP/USD', category: 'Forex', bias: 'Bullish', price: '1.3515', support: '1.3390', resistance: '1.3700', summary: 'GBP strength from positive UK labor data. Sterling up on peace deal hopes and BoE patience.', strength: 72 },
  { pair: 'USD/JPY', category: 'Forex', bias: 'Bullish', price: '158.96', support: '157.30', resistance: '160.45', summary: 'BoJ ultra-loose policy continues. Dollar demand strong on US-Iran tensions and risk-off sentiment.', strength: 75 },
  { pair: 'USD/CHF', category: 'Forex', bias: 'Neutral', price: '0.9124', support: '0.9050', resistance: '0.9200', summary: 'CHF holding as safe haven. Mixed signals from SNB and global risk sentiment.', strength: 50 },
  { pair: 'AUD/USD', category: 'Forex', bias: 'Bearish', price: '0.6412', support: '0.6350', resistance: '0.6500', summary: 'China slowdown weighing on AUD. Commodities under pressure amid global demand concerns.', strength: 30 },
  { pair: 'NZD/USD', category: 'Forex', bias: 'Bearish', price: '0.5891', support: '0.5800', resistance: '0.5980', summary: 'RBNZ dovish. NZD under pressure from weak dairy prices and China exposure.', strength: 32 },
  { pair: 'USD/CAD', category: 'Forex', bias: 'Neutral', price: '1.3845', support: '1.3750', resistance: '1.3950', summary: 'Oil price uncertainty creating mixed CAD signals. BoC on hold watching inflation data.', strength: 48 },
  { pair: 'XAU/USD', category: 'Gold', bias: 'Neutral', price: '4,752', support: '4,710', resistance: '4,880', summary: 'Gold consolidating in $4,750-$4,881 range. Mixed signals from ceasefire uncertainty and inflation.', strength: 50 },
  { pair: 'BTC/USD', category: 'Crypto', bias: 'Bullish', price: '$78,194', support: '$75,000', resistance: '$80,000', summary: 'Bitcoin broke above $78K with strong ETF inflows of $238-663M over consecutive days.', strength: 78 },
  { pair: 'ETH/USD', category: 'Crypto', bias: 'Neutral', price: '$2,403', support: '$2,292', resistance: '$2,450', summary: 'ETH testing critical support with mixed signals. Institutional accumulation vs DeFi security concerns.', strength: 50 },
  { pair: 'US30',   category: 'Index',  bias: 'Bullish', price: '49,466', support: '48,800', resistance: '50,200', summary: 'Dow supported by rate cut hopes and strong earnings season. Risk-on sentiment building.', strength: 68 },
  { pair: 'NAS100', category: 'Index',  bias: 'Bullish', price: '26,479', support: '25,900', resistance: '27,000', summary: 'Nasdaq led higher by mega-cap tech. AI spending boom supporting growth outlook.', strength: 74 },
]

const BIAS_STYLES = {
  Bullish: { bg: 'rgba(0,212,170,0.12)', color: '#00D4AA', border: 'rgba(0,212,170,0.3)' },
  Bearish: { bg: 'rgba(255,77,106,0.12)', color: '#FF4D6A', border: 'rgba(255,77,106,0.3)' },
  Neutral: { bg: 'rgba(138,155,176,0.1)', color: '#8A9BB0', border: 'rgba(138,155,176,0.2)' },
}

const CATEGORIES = ['All', 'Forex', 'Gold', 'Crypto', 'Index']
const TIMEFRAMES = ['Daily', 'Weekly', 'Monthly']

export default function BiasMatrix() {
  const [activeCategory, setActiveCategory] = useState('All')
  const [activeTF, setActiveTF] = useState('Daily')

  const filtered = activeCategory === 'All'
    ? PAIRS_DATA
    : PAIRS_DATA.filter(p => p.category === activeCategory)

  return (
    <DashboardLayout title="Bias Matrix" subtitle="AI-powered directional bias for all markets">

      {/* Timeframe Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>TF:</span>
        {TIMEFRAMES.map(tf => (
          <button key={tf} onClick={() => setActiveTF(tf)} style={{
            padding: '4px 14px',
            borderRadius: '20px',
            border: '1px solid var(--border)',
            background: activeTF === tf ? 'var(--accent-purple)' : 'var(--bg-card)',
            color: activeTF === tf ? '#fff' : 'var(--text-secondary)',
            fontSize: '11px', fontWeight: 600, cursor: 'pointer',
          }}>{tf}</button>
        ))}
      </div>

      {/* Category Filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)} style={{
            padding: '5px 16px',
            borderRadius: '20px',
            border: '1px solid var(--border)',
            background: activeCategory === cat ? 'var(--accent-green)' : 'var(--bg-card)',
            color: activeCategory === cat ? '#000' : 'var(--text-secondary)',
            fontSize: '11px', fontWeight: 600, cursor: 'pointer',
          }}>{cat}</button>
        ))}
      </div>

      {/* Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
        gap: '12px',
      }}>
        {filtered.map(item => {
          const s = BIAS_STYLES[item.bias]
          return (
            <div key={item.pair} className="card" style={{ padding: '1.25rem' }}>

              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {item.pair}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {item.category} · {activeTF}
                  </div>
                </div>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: s.bg,
                  color: s.color,
                  border: `1px solid ${s.border}`,
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
                }}>{item.bias === 'Bullish' ? '▲' : item.bias === 'Bearish' ? '▼' : '—'} {item.bias.toUpperCase()}</span>
              </div>

              {/* Price */}
              <div style={{
                fontSize: '26px', fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-primary)',
                marginBottom: '8px',
              }}>{item.price}</div>

              {/* Strength Bar */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px' }}>
                  <div style={{
                    height: '100%', width: `${item.strength}%`,
                    background: s.color, borderRadius: '2px',
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>

              {/* Summary */}
              <div style={{
                fontSize: '11px', color: 'var(--text-secondary)',
                lineHeight: 1.6, marginBottom: '12px',
              }}>{item.summary}</div>

              {/* Support / Resistance */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{
                  flex: 1, padding: '6px 10px',
                  background: 'rgba(0,212,170,0.06)',
                  border: '1px solid rgba(0,212,170,0.15)',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>SUPPORT</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#00D4AA', fontFamily: 'var(--font-mono)' }}>
                    {item.support}
                  </div>
                </div>
                <div style={{
                  flex: 1, padding: '6px 10px',
                  background: 'rgba(255,77,106,0.06)',
                  border: '1px solid rgba(255,77,106,0.15)',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>RESISTANCE</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#FF4D6A', fontFamily: 'var(--font-mono)' }}>
                    {item.resistance}
                  </div>
                </div>
              </div>

            </div>
          )
        })}
      </div>

    </DashboardLayout>
  )
}