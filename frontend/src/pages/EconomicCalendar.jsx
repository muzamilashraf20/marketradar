import { useState } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'

const EVENTS = [
  {
    id: 1, time: '08:30 EST', currency: 'USD', impact: 'HIGH',
    event: 'Non-Farm Payrolls', forecast: '180K', previous: '156K', actual: '203K',
    bias: 'Bullish', biasColor: '#00D4AA',
    summary: 'Actual beat forecast significantly — USD bullish, risk-on sentiment expected.',
  },
  {
    id: 2, time: '08:30 EST', currency: 'USD', impact: 'HIGH',
    event: 'Unemployment Rate', forecast: '3.9%', previous: '4.0%', actual: '3.8%',
    bias: 'Bullish', biasColor: '#00D4AA',
    summary: 'Unemployment dropped below forecast — supports Fed hawkish stance.',
  },
  {
    id: 3, time: '10:00 EST', currency: 'USD', impact: 'MEDIUM',
    event: 'ISM Manufacturing PMI', forecast: '48.5', previous: '47.8', actual: '48.2',
    bias: 'Neutral', biasColor: '#8A9BB0',
    summary: 'Slight miss on forecast — manufacturing still in contraction territory.',
  },
  {
    id: 4, time: '11:00 EST', currency: 'EUR', impact: 'HIGH',
    event: 'ECB Interest Rate Decision', forecast: '3.40%', previous: '3.65%', actual: '3.40%',
    bias: 'Bearish', biasColor: '#FF4D6A',
    summary: 'ECB cut rates as expected — EUR bearish, more cuts priced in for 2025.',
  },
  {
    id: 5, time: '11:30 EST', currency: 'EUR', impact: 'HIGH',
    event: 'ECB Press Conference', forecast: '—', previous: '—', actual: 'Pending',
    bias: 'Bearish', biasColor: '#FF4D6A',
    summary: 'Lagarde expected to signal further easing — watch for EUR volatility.',
  },
  {
    id: 6, time: '12:00 EST', currency: 'GBP', impact: 'HIGH',
    event: 'BoE Rate Decision', forecast: '4.25%', previous: '4.50%', actual: 'Pending',
    bias: 'Neutral', biasColor: '#8A9BB0',
    summary: 'Market split on BoE cut — GBP volatility expected at release.',
  },
  {
    id: 7, time: '13:30 EST', currency: 'CAD', impact: 'MEDIUM',
    event: 'Canada Employment Change', forecast: '22K', previous: '18K', actual: 'Pending',
    bias: 'Neutral', biasColor: '#8A9BB0',
    summary: 'Canadian jobs data — watch for CAD reaction if actual deviates from forecast.',
  },
  {
    id: 8, time: '19:30 EST', currency: 'AUD', impact: 'MEDIUM',
    event: 'RBA Meeting Minutes', forecast: '—', previous: '—', actual: 'Pending',
    bias: 'Bearish', biasColor: '#FF4D6A',
    summary: 'RBA minutes expected to confirm dovish tilt — AUD under pressure.',
  },
  {
    id: 9, time: '20:00 EST', currency: 'JPY', impact: 'HIGH',
    event: 'BoJ Policy Rate', forecast: '0.50%', previous: '0.50%', actual: 'Pending',
    bias: 'Neutral', biasColor: '#8A9BB0',
    summary: 'BoJ expected to hold — any hawkish surprise could cause JPY spike.',
  },
]

const IMPACT_COLORS = {
  HIGH:   { bg: 'rgba(255,77,106,0.15)', color: '#FF4D6A', border: 'rgba(255,77,106,0.3)' },
  MEDIUM: { bg: 'rgba(245,166,35,0.15)', color: '#F5A623', border: 'rgba(245,166,35,0.3)' },
  LOW:    { bg: 'rgba(138,155,176,0.1)', color: '#8A9BB0', border: 'rgba(138,155,176,0.2)' },
}

const CURRENCY_FLAGS = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧',
  JPY: '🇯🇵', AUD: '🇦🇺', CAD: '🇨🇦',
  CHF: '🇨🇭', NZD: '🇳🇿',
}

const FILTERS = ['All', 'HIGH', 'MEDIUM', 'LOW']
const CURRENCIES = ['All', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD']

export default function EconomicCalendar() {
  const [impactFilter, setImpactFilter] = useState('All')
  const [currencyFilter, setCurrencyFilter] = useState('All')

  const filtered = EVENTS.filter(e => {
    const impactOk = impactFilter === 'All' || e.impact === impactFilter
    const currencyOk = currencyFilter === 'All' || e.currency === currencyFilter
    return impactOk && currencyOk
  })

  return (
    <DashboardLayout title="Economic Calendar" subtitle="High impact events with AI bias interpretation">

      {/* Stats Row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))',
        gap: '10px', marginBottom: '1.5rem',
      }}>
        {[
          { label: 'Events Today',   value: '9',  color: 'var(--text-primary)' },
          { label: 'High Impact',    value: '5',  color: '#FF4D6A' },
          { label: 'Released',       value: '4',  color: '#00D4AA' },
          { label: 'Pending',        value: '5',  color: '#F5A623' },
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

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Impact Filter */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>IMPACT:</span>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setImpactFilter(f)} style={{
              padding: '4px 12px', borderRadius: '20px',
              border: '1px solid var(--border)',
              background: impactFilter === f ? 'var(--accent-green)' : 'var(--bg-card)',
              color: impactFilter === f ? '#000' : 'var(--text-secondary)',
              fontSize: '11px', fontWeight: 600, cursor: 'pointer',
            }}>{f}</button>
          ))}
        </div>

        {/* Currency Filter */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>CURRENCY:</span>
          {CURRENCIES.map(c => (
            <button key={c} onClick={() => setCurrencyFilter(c)} style={{
              padding: '4px 12px', borderRadius: '20px',
              border: '1px solid var(--border)',
              background: currencyFilter === c ? 'var(--accent-blue)' : 'var(--bg-card)',
              color: currencyFilter === c ? '#fff' : 'var(--text-secondary)',
              fontSize: '11px', fontWeight: 600, cursor: 'pointer',
            }}>{c}</button>
          ))}
        </div>
      </div>

      {/* Events Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Table Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '90px 70px 110px 1fr 90px 90px 90px 100px',
          padding: '10px 16px',
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border)',
          gap: '8px',
        }}>
          {['TIME', 'CCY', 'IMPACT', 'EVENT', 'FORECAST', 'PREVIOUS', 'ACTUAL', 'BIAS'].map(h => (
            <div key={h} style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em' }}>
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        {filtered.map((event, i) => {
          const impact = IMPACT_COLORS[event.impact]
          const isPending = event.actual === 'Pending'
          const isReleased = !isPending

          return (
            <div key={event.id}>
              {/* Main Row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '90px 70px 110px 1fr 90px 90px 90px 100px',
                padding: '14px 16px',
                gap: '8px',
                alignItems: 'center',
                borderBottom: '1px solid var(--border)',
                background: isPending ? 'transparent' : 'rgba(0,212,170,0.02)',
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = isPending ? 'transparent' : 'rgba(0,212,170,0.02)'}
              >
                {/* Time */}
                <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  {event.time}
                </div>

                {/* Currency */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>{CURRENCY_FLAGS[event.currency]}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {event.currency}
                  </span>
                </div>

                {/* Impact */}
                <span style={{
                  padding: '2px 8px', borderRadius: '4px',
                  background: impact.bg, color: impact.color,
                  border: `1px solid ${impact.border}`,
                  fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em',
                  display: 'inline-block',
                }}>{event.impact}</span>

                {/* Event Name */}
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {event.event}
                </div>

                {/* Forecast */}
                <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  {event.forecast}
                </div>

                {/* Previous */}
                <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {event.previous}
                </div>

                {/* Actual */}
                <div style={{
                  fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 700,
                  color: isPending ? '#F5A623' : event.biasColor,
                }}>
                  {isPending ? 'Pending...' : event.actual}
                </div>

                {/* Bias */}
                <span style={{
                  padding: '3px 10px', borderRadius: '4px',
                  background: event.biasColor === '#00D4AA' ? 'rgba(0,212,170,0.1)' : event.biasColor === '#FF4D6A' ? 'rgba(255,77,106,0.1)' : 'rgba(138,155,176,0.1)',
                  color: event.biasColor,
                  border: `1px solid ${event.biasColor}40`,
                  fontSize: '10px', fontWeight: 700,
                  display: 'inline-block',
                }}>
                  {event.bias === 'Bullish' ? '▲' : event.bias === 'Bearish' ? '▼' : '—'} {event.bias}
                </span>
              </div>

              {/* Summary Row */}
              <div style={{
                padding: '8px 16px 10px',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                background: 'var(--bg-surface)',
              }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  💡 {event.summary}
                </span>
              </div>
            </div>
          )
        })}
      </div>

    </DashboardLayout>
  )
}