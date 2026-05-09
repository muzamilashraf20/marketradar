import DashboardLayout from '../components/layout/DashboardLayout'

const TRUMP_POSTS = [
  {
    id: 1,
    time: 'Just now',
    platform: 'Truth Social',
    impact: 'HIGH',
    content: 'We are going to put a 50% tariff on all Chinese goods starting next week. America First!',
    marketImpact: 'Risk-Off — USD Bullish, CNH Bearish',
    affected: ['USD', 'CNH', 'Gold', 'Oil'],
    sentiment: 'Hawkish',
    sentimentColor: '#FF4D6A',
    tags: ['Tariffs', 'China', 'Trade War'],
  },
  {
    id: 2,
    time: '23m ago',
    platform: 'Truth Social',
    impact: 'HIGH',
    content: 'Just spoke with the Fed Chairman. Interest rates should be MUCH lower. They are killing our economy!',
    marketImpact: 'USD Bearish — Rate Cut Expectations Rise',
    affected: ['USD', 'Gold', 'S&P500'],
    sentiment: 'Dovish',
    sentimentColor: '#00D4AA',
    tags: ['Fed', 'Rates', 'USD'],
  },
  {
    id: 3,
    time: '1h ago',
    platform: 'Twitter/X',
    impact: 'MEDIUM',
    content: 'Saudi Arabia has agreed to increase oil production by 1 million barrels per day. Great deal!',
    marketImpact: 'Oil Bearish — CAD slightly Bearish',
    affected: ['Oil', 'CAD', 'USD'],
    sentiment: 'Bearish Oil',
    sentimentColor: '#F5A623',
    tags: ['Oil', 'Saudi', 'Energy'],
  },
  {
    id: 4,
    time: '2h ago',
    platform: 'Truth Social',
    impact: 'HIGH',
    content: 'We will be announcing a new trade deal with the European Union very soon. Biggest deal ever made!',
    marketImpact: 'EUR Bullish — Risk-On sentiment',
    affected: ['EUR', 'USD', 'Stocks'],
    sentiment: 'Risk-On',
    sentimentColor: '#00D4AA',
    tags: ['EU', 'Trade Deal', 'EUR'],
  },
  {
    id: 5,
    time: '4h ago',
    platform: 'Truth Social',
    impact: 'LOW',
    content: 'The fake news media is lying about our economy. Stock market is at all time highs!',
    marketImpact: 'Minimal market impact',
    affected: [],
    sentiment: 'Neutral',
    sentimentColor: '#8A9BB0',
    tags: ['Media', 'Economy'],
  },
]

const IMPACT_COLORS = {
  HIGH:   { bg: 'rgba(255,77,106,0.15)', color: '#FF4D6A', border: 'rgba(255,77,106,0.3)' },
  MEDIUM: { bg: 'rgba(245,166,35,0.15)', color: '#F5A623', border: 'rgba(245,166,35,0.3)' },
  LOW:    { bg: 'rgba(138,155,176,0.1)', color: '#8A9BB0', border: 'rgba(138,155,176,0.2)' },
}

export default function TrumpTracker() {
  return (
    <DashboardLayout title="Trump Tracker" subtitle="Real-time political statements & market impact">

      {/* Live Alert Banner */}
      <div style={{
        background: 'rgba(255,77,106,0.08)',
        border: '1px solid rgba(255,77,106,0.25)',
        borderRadius: 'var(--radius-lg)',
        padding: '12px 16px',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        <span style={{
          width: '8px', height: '8px',
          borderRadius: '50%',
          background: '#FF4D6A',
          boxShadow: '0 0 10px #FF4D6A',
          animation: 'pulse 1.5s infinite',
          display: 'inline-block',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: '12px', color: '#FF4D6A', fontWeight: 600 }}>
          LIVE MONITORING
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          — Tracking Truth Social & Twitter/X for market-moving statements
        </span>
      </div>

      {/* Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0,1fr))',
        gap: '10px',
        marginBottom: '1.5rem',
      }}>
        {[
          { label: 'Posts Today',     value: '5',      color: 'var(--text-primary)' },
          { label: 'High Impact',     value: '3',      color: '#FF4D6A' },
          { label: 'Risk-On Signals', value: '2',      color: '#00D4AA' },
          { label: 'Avg Response',    value: '4 min',  color: '#F5A623' },
        ].map(stat => (
          <div key={stat.label} className="card" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: stat.color }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', letterSpacing: '0.06em' }}>
              {stat.label.toUpperCase()}
            </div>
          </div>
        ))}
      </div>

      {/* Posts */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {TRUMP_POSTS.map(post => {
          const impact = IMPACT_COLORS[post.impact]
          return (
            <div key={post.id} className="card">

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Avatar */}
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: 'linear-gradient(135deg, #E24B4A, #BA7517)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>T</div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Donald Trump
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {post.platform} · {post.time}
                    </div>
                  </div>
                </div>

                <span style={{
                  padding: '3px 10px',
                  borderRadius: '4px',
                  background: impact.bg,
                  color: impact.color,
                  border: `1px solid ${impact.border}`,
                  fontSize: '9px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                }}>{post.impact} IMPACT</span>
              </div>

              {/* Post content */}
              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                fontSize: '13px',
                color: 'var(--text-primary)',
                lineHeight: 1.6,
                marginBottom: '10px',
                fontStyle: 'italic',
              }}>
                "{post.content}"
              </div>

              {/* Market Impact */}
              <div style={{
                background: `${post.sentimentColor}10`,
                border: `1px solid ${post.sentimentColor}30`,
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>📊 MARKET IMPACT:</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: post.sentimentColor }}>
                  {post.marketImpact}
                </span>
              </div>

              {/* Affected + Tags */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {post.tags.map(tag => (
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

                {post.affected.length > 0 && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {post.affected.map(a => (
                      <span key={a} style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: 'rgba(0,212,170,0.08)',
                        border: '1px solid rgba(0,212,170,0.2)',
                        fontSize: '10px',
                        color: 'var(--accent-green)',
                        fontWeight: 600,
                        fontFamily: 'var(--font-mono)',
                      }}>{a}</span>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )
        })}
      </div>

    </DashboardLayout>
  )
}