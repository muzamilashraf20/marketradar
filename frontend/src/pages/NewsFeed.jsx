import DashboardLayout from '../components/layout/DashboardLayout'

const NEWS_DATA = [
  {
    id: 1,
    time: 'Just now',
    impact: 'HIGH',
    title: 'Fed holds rates steady amid inflation uncertainty',
    summary: 'Federal Reserve keeps benchmark rate unchanged, signals data-dependent approach for future decisions.',
    currencies: ['USD'],
    bias: 'Bearish',
    biasColor: '#FF4D6A',
    tags: ['USD', 'Fed', 'Rates'],
  },
  {
    id: 2,
    time: '14m ago',
    impact: 'HIGH',
    title: 'ECB signals further rate cuts as Eurozone growth slows',
    summary: 'European Central Bank hints at additional easing as manufacturing PMI falls below expectations.',
    currencies: ['EUR'],
    bias: 'Bearish',
    biasColor: '#FF4D6A',
    tags: ['EUR', 'ECB', 'Growth'],
  },
  {
    id: 3,
    time: '32m ago',
    impact: 'MEDIUM',
    title: 'UK CPI comes in hotter than expected at 3.2%',
    summary: 'British inflation surprises to upside, reducing likelihood of near-term Bank of England rate cuts.',
    currencies: ['GBP'],
    bias: 'Bullish',
    biasColor: '#00D4AA',
    tags: ['GBP', 'CPI', 'BoE'],
  },
  {
    id: 4,
    time: '1h ago',
    impact: 'HIGH',
    title: 'Japan intervenes in FX market to support Yen',
    summary: 'Bank of Japan conducts suspected currency intervention as USDJPY approaches 158 level.',
    currencies: ['JPY'],
    bias: 'Bullish',
    biasColor: '#00D4AA',
    tags: ['JPY', 'BoJ', 'Intervention'],
  },
  {
    id: 5,
    time: '2h ago',
    impact: 'LOW',
    title: 'Australian employment data beats forecast',
    summary: 'Australia adds 38k jobs vs 20k expected, unemployment rate holds at 3.8%.',
    currencies: ['AUD'],
    bias: 'Bullish',
    biasColor: '#00D4AA',
    tags: ['AUD', 'Employment'],
  },
  {
    id: 6,
    time: '3h ago',
    impact: 'MEDIUM',
    title: 'Canada GDP growth disappoints in Q1',
    summary: 'Canadian economy grows 1.2% annualized vs 1.8% expected, raising dovish BOC expectations.',
    currencies: ['CAD'],
    bias: 'Bearish',
    biasColor: '#FF4D6A',
    tags: ['CAD', 'GDP', 'BOC'],
  },
]

const IMPACT_COLORS = {
  HIGH:   { bg: 'rgba(255,77,106,0.15)', color: '#FF4D6A', border: 'rgba(255,77,106,0.3)' },
  MEDIUM: { bg: 'rgba(245,166,35,0.15)', color: '#F5A623', border: 'rgba(245,166,35,0.3)' },
  LOW:    { bg: 'rgba(138,155,176,0.1)', color: '#8A9BB0', border: 'rgba(138,155,176,0.2)' },
}

export default function NewsFeed() {
  return (
    <DashboardLayout title="News Feed" subtitle="Live market headlines with bias impact">

      {/* Filter Bar */}
      <div style={{
        display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap'
      }}>
        {['All', 'High Impact', 'EUR', 'GBP', 'USD', 'JPY', 'AUD', 'CAD'].map(filter => (
          <button key={filter} style={{
            padding: '5px 14px',
            borderRadius: '20px',
            border: '1px solid var(--border)',
            background: filter === 'All' ? 'var(--accent-green)' : 'var(--bg-card)',
            color: filter === 'All' ? '#000' : 'var(--text-secondary)',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '0.04em',
          }}>{filter}</button>
        ))}
      </div>

      {/* News Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {NEWS_DATA.map(news => {
          const impact = IMPACT_COLORS[news.impact]
          return (
            <div key={news.id} className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>

                {/* Left */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    {/* Impact badge */}
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: impact.bg,
                      color: impact.color,
                      border: `1px solid ${impact.border}`,
                      fontSize: '9px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                    }}>{news.impact} IMPACT</span>

                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {news.time}
                    </span>
                  </div>

                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px', lineHeight: 1.4 }}>
                    {news.title}
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '10px' }}>
                    {news.summary}
                  </div>

                  {/* Tags */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {news.tags.map(tag => (
                      <span key={tag} style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                      }}>{tag}</span>
                    ))}
                  </div>
                </div>

                {/* Right — Bias */}
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: '4px', minWidth: '80px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>IMPACT</div>
                  <div style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: news.biasColor === '#00D4AA' ? 'rgba(0,212,170,0.1)' : 'rgba(255,77,106,0.1)',
                    border: `1px solid ${news.biasColor}40`,
                    color: news.biasColor,
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                  }}>
                    {news.bias === 'Bullish' ? '▲' : '▼'} {news.bias}
                  </div>
                  <div style={{
                    fontSize: '13px', fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                  }}>
                    {news.currencies.join('/')}
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