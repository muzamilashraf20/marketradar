import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

function useInView(threshold = 0.15) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true) },
      { threshold }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, inView]
}

function AnimatedSection({ children, delay = 0 }) {
  const [ref, inView] = useInView()
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'translateY(0)' : 'translateY(40px)',
      transition: `opacity 0.8s ease ${delay}s, transform 0.8s ease ${delay}s`,
    }}>
      {children}
    </div>
  )
}

const FEATURES = [
  { icon: '◈', title: 'Bias Matrix', desc: 'AI-powered directional bias for 12+ currency pairs, indices, and crypto — updated in real time.', color: '#00D4AA' },
  { icon: '📰', title: 'Live News Feed', desc: 'High-impact headlines with instant market bias interpretation. Know what it means before price moves.', color: '#4DA6FF' },
  { icon: '⚑', title: 'Trump Tracker', desc: 'Real-time monitoring of political statements with instant market impact analysis and trade direction.', color: '#FF4D6A' },
  { icon: '◷', title: 'Session Tracker', desc: 'Live global session monitor with real-time progress, best pairs, and overlap alerts.', color: '#8B7CF6' },
  { icon: '◻', title: 'Economic Calendar', desc: 'All high-impact events with forecast vs actual comparison and AI bias interpretation.', color: '#F5A623' },
  { icon: '◉', title: 'COT Report', desc: 'CFTC institutional positioning data with net position charts and smart money bias signals.', color: '#00D4AA' },
]

const STATS = [
  { value: '10,000+', label: 'Active Traders' },
  { value: '12+',     label: 'Markets Covered' },
  { value: '24/7',    label: 'Live Monitoring' },
  { value: '< 1min',  label: 'Signal Delay' },
]

const TICKER_ITEMS = [
  'EUR/USD  ▲ Bullish', 'GBP/USD  ▲ Bullish', 'USD/JPY  ▼ Bearish',
  'XAU/USD  — Neutral', 'BTC/USD  ▲ Bullish', 'NAS100  ▲ Bullish',
  'DXY  ▼ Bearish', 'AUD/USD  ▼ Bearish', 'USD/CAD  — Neutral',
]

export default function LandingPage() {
  const navigate = useNavigate()
  const [scrollY, setScrollY] = useState(0)
  const [tickerPos, setTickerPos] = useState(0)

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setTickerPos(p => p - 1)
    }, 20)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{ background: '#080B10', color: '#F0F4F8', fontFamily: "'Syne', sans-serif", overflowX: 'hidden' }}>

      {/* Navbar */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        padding: '0 2rem',
        height: '60px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: scrollY > 50 ? 'rgba(8,11,16,0.95)' : 'transparent',
        backdropFilter: scrollY > 50 ? 'blur(20px)' : 'none',
        borderBottom: scrollY > 50 ? '1px solid rgba(255,255,255,0.06)' : 'none',
        transition: 'all 0.3s ease',
      }}>
        <div style={{ fontWeight: 700, fontSize: '18px', letterSpacing: '0.08em', color: '#00D4AA' }}>
          Market<span style={{ color: '#8A9BB0' }}>Radar</span>
        </div>

        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          {[
            { label: 'Features', id: 'features' },
            { label: 'Pricing', id: 'pricing' },
            { label: 'About', id: 'about' },
          ].map(item => (
            <span key={item.label}
              style={{ fontSize: '13px', color: '#8A9BB0', cursor: 'pointer', transition: 'color 0.2s' }}
              onMouseEnter={e => e.target.style.color = '#F0F4F8'}
              onMouseLeave={e => e.target.style.color = '#8A9BB0'}
              onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' })}
            >{item.label}</span>
          ))}
          <button onClick={() => navigate('/login')} style={{
            padding: '8px 20px', borderRadius: '8px',
            border: '1px solid #00D4AA',
            background: 'rgba(0,212,170,0.1)',
            color: '#00D4AA', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}>Sign In</button>
          <button onClick={() => navigate('/login')} style={{
            padding: '8px 20px', borderRadius: '8px',
            border: 'none', background: '#00D4AA',
            color: '#000', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
          }}>Get Access →</button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '0 2rem',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: '20%', left: '50%',
          transform: `translateX(-50%) translateY(${scrollY * 0.3}px)`,
          width: '600px', height: '600px',
          background: 'radial-gradient(circle, rgba(0,212,170,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          padding: '6px 16px', borderRadius: '20px',
          border: '1px solid rgba(0,212,170,0.3)',
          background: 'rgba(0,212,170,0.08)',
          marginBottom: '2rem',
          fontSize: '12px', color: '#00D4AA', fontWeight: 600, letterSpacing: '0.06em',
        }}>
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: '#00D4AA', boxShadow: '0 0 8px #00D4AA',
            animation: 'pulse 2s infinite', display: 'inline-block',
          }} />
          LIVE — Real-time market intelligence
        </div>

        <h1 style={{
          fontSize: 'clamp(2.5rem, 6vw, 5rem)',
          fontWeight: 700, lineHeight: 1.1,
          marginBottom: '1.5rem', maxWidth: '900px',
          transform: `translateY(${scrollY * 0.1}px)`,
        }}>
          See What The Market Is{' '}
          <span style={{
            background: 'linear-gradient(135deg, #00D4AA, #4DA6FF)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>About To Do</span>
          {' '}Before Most Traders Even React
        </h1>

        <p style={{
          fontSize: '18px', color: '#8A9BB0', maxWidth: '600px',
          lineHeight: 1.7, marginBottom: '2.5rem',
          transform: `translateY(${scrollY * 0.08}px)`,
        }}>
          MarketRadar turns macro news, COT data, and market signals into clear trade direction instantly. No economics background needed.
        </p>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '4rem' }}>
          <button onClick={() => navigate('/login')} style={{
            padding: '14px 32px', borderRadius: '10px',
            border: 'none', background: '#00D4AA',
            color: '#000', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 0 30px rgba(0,212,170,0.3)', transition: 'all 0.2s',
          }}
            onMouseEnter={e => e.target.style.transform = 'scale(1.05)'}
            onMouseLeave={e => e.target.style.transform = 'scale(1)'}
          >Get Access Now →</button>
          <button
            onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            style={{
              padding: '14px 32px', borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent',
              color: '#F0F4F8', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
            }}>View Demo</button>
        </div>

        <div style={{ display: 'flex', gap: '3rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {STATS.map(stat => (
            <div key={stat.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#00D4AA', fontFamily: "'JetBrains Mono', monospace" }}>
                {stat.value}
              </div>
              <div style={{ fontSize: '12px', color: '#4A5568', marginTop: '4px', letterSpacing: '0.06em' }}>
                {stat.label.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Ticker */}
      <div style={{
        overflow: 'hidden',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '12px 0', background: 'rgba(255,255,255,0.02)',
      }}>
        <div style={{
          display: 'flex', gap: '3rem',
          transform: `translateX(${tickerPos % 800}px)`,
          whiteSpace: 'nowrap', transition: 'none',
        }}>
          {[...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} style={{
              fontSize: '12px', fontFamily: "'JetBrains Mono', monospace",
              color: item.includes('▲') ? '#00D4AA' : item.includes('▼') ? '#FF4D6A' : '#8A9BB0',
              letterSpacing: '0.04em',
            }}>{item}</span>
          ))}
        </div>
      </div>

      {/* Problem Section */}
      <section style={{ padding: '8rem 2rem', maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
        <AnimatedSection>
          <div style={{ fontSize: '13px', color: '#00D4AA', letterSpacing: '0.1em', marginBottom: '1rem', fontWeight: 600 }}>
            THE PROBLEM
          </div>
          <h2 style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)', fontWeight: 700, lineHeight: 1.2, marginBottom: '1.5rem' }}>
            The Market Doesn't Lack{' '}
            <span style={{ color: '#FF4D6A' }}>Information.</span>
            {' '}It Lacks Clarity.
          </h2>
          <p style={{ fontSize: '17px', color: '#8A9BB0', lineHeight: 1.8 }}>
            Every trader sees the same news. Charts react. Indicators move. But knowing what it means and how to act is where most traders lose their edge.
          </p>
        </AnimatedSection>
      </section>

      {/* Features Grid */}
      <section id="features" style={{ padding: '4rem 2rem 8rem', maxWidth: '1100px', margin: '0 auto' }}>
        <AnimatedSection>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <div style={{ fontSize: '13px', color: '#00D4AA', letterSpacing: '0.1em', marginBottom: '1rem', fontWeight: 600 }}>
              FEATURES
            </div>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.8rem)', fontWeight: 700 }}>
              Everything You Need To Trade With{' '}
              <span style={{ background: 'linear-gradient(135deg, #00D4AA, #4DA6FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Confidence
              </span>
            </h2>
          </div>
        </AnimatedSection>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '16px' }}>
          {FEATURES.map((feature, i) => (
            <AnimatedSection key={feature.title} delay={i * 0.1}>
              <div style={{
                padding: '1.75rem', background: '#0E1218',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '14px', height: '100%',
                transition: 'all 0.3s', cursor: 'default',
              }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = feature.color + '40'
                  e.currentTarget.style.transform = 'translateY(-4px)'
                  e.currentTarget.style.boxShadow = `0 20px 40px ${feature.color}10`
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{
                  width: '44px', height: '44px', borderRadius: '10px',
                  background: `${feature.color}15`, border: `1px solid ${feature.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px', marginBottom: '1rem',
                }}>{feature.icon}</div>
                <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '8px', color: '#F0F4F8' }}>
                  {feature.title}
                </div>
                <div style={{ fontSize: '13px', color: '#8A9BB0', lineHeight: 1.7 }}>
                  {feature.desc}
                </div>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ padding: '4rem 2rem 8rem', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <AnimatedSection>
          <div style={{ fontSize: '13px', color: '#00D4AA', letterSpacing: '0.1em', marginBottom: '1rem', fontWeight: 600 }}>
            PRICING
          </div>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.8rem)', fontWeight: 700, marginBottom: '3rem' }}>
            Start Trading With Market Clarity Today
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {[
              {
                name: 'Basic', price: '$29', period: '/month', color: '#4DA6FF',
                features: ['Bias Matrix', 'Economic Calendar', 'Session Tracker', 'News Feed'],
              },
              {
                name: 'PRO', price: '$49', period: '/month',
                color: '#00D4AA', popular: true,
                features: ['Everything in Basic', 'COT Report', 'Trump Tracker', 'Priority Updates', 'AI Bias Alerts'],
              },
            ].map(plan => (
              <div key={plan.name} style={{
                padding: '2rem',
                background: plan.popular ? 'rgba(0,212,170,0.06)' : '#0E1218',
                border: `1px solid ${plan.popular ? 'rgba(0,212,170,0.3)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: '16px', position: 'relative',
              }}>
                {plan.popular && (
                  <div style={{
                    position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
                    padding: '4px 16px', borderRadius: '20px',
                    background: '#00D4AA', color: '#000',
                    fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
                  }}>MOST POPULAR</div>
                )}
                <div style={{ fontSize: '14px', color: '#8A9BB0', marginBottom: '8px' }}>{plan.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '4px', marginBottom: '1.5rem' }}>
                  <span style={{ fontSize: '40px', fontWeight: 700, color: plan.color, fontFamily: "'JetBrains Mono', monospace" }}>
                    {plan.price}
                  </span>
                  <span style={{ fontSize: '14px', color: '#4A5568' }}>{plan.period}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.5rem' }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#8A9BB0' }}>
                      <span style={{ color: plan.color }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                <button onClick={() => navigate('/login')} style={{
                  width: '100%', padding: '12px',
                  borderRadius: '8px', border: 'none',
                  background: plan.popular ? '#00D4AA' : 'rgba(255,255,255,0.08)',
                  color: plan.popular ? '#000' : '#F0F4F8',
                  fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                }}>
                  Get Started →
                </button>
              </div>
            ))}
          </div>
        </AnimatedSection>
      </section>

      {/* About / CTA Final */}
      <section id="about" style={{
        padding: '6rem 2rem', textAlign: 'center',
        background: 'linear-gradient(180deg, transparent, rgba(0,212,170,0.04))',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <AnimatedSection>
          <h2 style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)', fontWeight: 700, marginBottom: '1rem' }}>
            Ready To Trade With{' '}
            <span style={{ background: 'linear-gradient(135deg, #00D4AA, #4DA6FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Real Edge?
            </span>
          </h2>
          <p style={{ fontSize: '17px', color: '#8A9BB0', marginBottom: '2rem' }}>
            Join thousands of traders who see the market clearly.
          </p>
          <button onClick={() => navigate('/login')} style={{
            padding: '16px 40px', borderRadius: '10px',
            border: 'none', background: '#00D4AA',
            color: '#000', fontSize: '16px', fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 0 40px rgba(0,212,170,0.25)',
          }}>
            Start Now — Free Trial →
          </button>
        </AnimatedSection>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '2rem',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: '1rem',
      }}>
        <div style={{ fontWeight: 700, fontSize: '15px', color: '#00D4AA' }}>
          Market<span style={{ color: '#4A5568' }}>Radar</span>
        </div>
        <div style={{ fontSize: '12px', color: '#4A5568' }}>
          © 2025 MarketRadar. Not financial advice.
        </div>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          {['Privacy', 'Terms', 'Contact'].map(item => (
            <span key={item} style={{ fontSize: '12px', color: '#4A5568', cursor: 'pointer' }}>{item}</span>
          ))}
        </div>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #080B10; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
    </div>
  )
}