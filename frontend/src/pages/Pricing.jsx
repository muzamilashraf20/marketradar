import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'

const PLANS = [
  {
    key: 'basic_monthly',
    name: 'Basic',
    price: 'PKR 8,100',
    period: '/month',
    annualKey: 'basic_annual',
    annualPrice: 'PKR 97,200',
    color: '#4DA6FF',
    features: [
      'Bias Matrix — 12+ pairs',
      'Economic Calendar',
      'Session Tracker — Live',
      'News Feed',
    ],
  },
  {
    key: 'pro_monthly',
    name: 'PRO',
    price: 'PKR 13,600',
    period: '/month',
    annualKey: 'pro_annual',
    annualPrice: 'PKR 163,200',
    color: '#00D4AA',
    popular: true,
    features: [
      'Everything in Basic',
      'COT Report — Institutional data',
      'Trump Tracker — Political alerts',
      'AI Bias Alerts',
      'Priority Updates',
    ],
  },
]

export default function Pricing() {
  const navigate = useNavigate()
  const [isAnnual, setIsAnnual] = useState(false)
  const [loading, setLoading] = useState(null)

  const handleCheckout = async (planKey) => {
    setLoading(planKey)
    try {
      const response = await fetch('http://localhost:5000/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey }),
      })
      const data = await response.json()
      if (data.url) {
        window.open(data.url, '_blank')
      } else {
        alert('Checkout error — try again')
      }
    } catch (e) {
      alert('Server error — make sure backend is running')
    }
    setLoading(null)
  }

  return (
    <DashboardLayout title="Pricing" subtitle="Choose your plan and get instant access">

      {/* Toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <span style={{ fontSize: '13px', color: isAnnual ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: 600 }}>
          Monthly
        </span>
        <div
          onClick={() => setIsAnnual(!isAnnual)}
          style={{
            width: '48px', height: '26px',
            borderRadius: '13px',
            background: isAnnual ? 'var(--accent-green)' : 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            position: 'relative',
            transition: 'background 0.3s',
          }}
        >
          <div style={{
            width: '20px', height: '20px',
            borderRadius: '50%',
            background: '#fff',
            position: 'absolute',
            top: '2px',
            left: isAnnual ? '24px' : '2px',
            transition: 'left 0.3s',
          }} />
        </div>
        <span style={{ fontSize: '13px', color: isAnnual ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 600 }}>
          Annual
          <span style={{
            marginLeft: '6px', padding: '2px 8px',
            borderRadius: '10px',
            background: 'rgba(0,212,170,0.15)',
            color: 'var(--accent-green)',
            fontSize: '10px', fontWeight: 700,
          }}>SAVE 17%</span>
        </span>
      </div>

      {/* Plan Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 500px))',
        gap: '16px',
        justifyContent: 'center',
        maxWidth: '900px',
        margin: '0 auto',
      }}>
        {PLANS.map(plan => {
          const planKey = isAnnual ? plan.annualKey : plan.key
          const price = isAnnual ? plan.annualPrice : plan.price
          const period = isAnnual ? '/year' : '/month'

          return (
            <div key={plan.key} className="card" style={{
              borderTop: `3px solid ${plan.color}`,
              position: 'relative',
              padding: '2rem',
            }}>
              {plan.popular && (
                <div style={{
                  position: 'absolute', top: '-12px', left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '3px 16px', borderRadius: '20px',
                  background: 'var(--accent-green)', color: '#000',
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
                }}>MOST POPULAR</div>
              )}

              {/* Plan name */}
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                {plan.name}
              </div>

              {/* Price */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '1.5rem' }}>
                <span style={{
                  fontSize: '36px', fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: plan.color,
                }}>{price}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{period}</span>
              </div>

              {/* Features */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.5rem' }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <span style={{ color: plan.color, fontWeight: 700 }}>✓</span>
                    {f}
                  </div>
                ))}
              </div>

              {/* CTA Button */}
              <button
                onClick={() => handleCheckout(planKey)}
                disabled={loading === planKey}
                style={{
                  width: '100%', padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background: plan.popular ? 'var(--accent-green)' : 'var(--bg-elevated)',
                  color: plan.popular ? '#000' : 'var(--text-primary)',
                  fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                  opacity: loading === planKey ? 0.7 : 1,
                  transition: 'all 0.2s',
                }}
              >
                {loading === planKey ? 'Loading...' : `Get ${plan.name} →`}
              </button>
            </div>
          )
        })}
      </div>

      {/* Note */}
      <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '12px', color: 'var(--text-muted)' }}>
        🔒 Secure checkout via Lemon Squeezy · Cancel anytime
      </div>

    </DashboardLayout>
  )
}