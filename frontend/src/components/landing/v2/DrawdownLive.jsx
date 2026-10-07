import { Check } from 'lucide-react'
import DemoTag from './DemoTag'
import { useMotion } from './useMotion'
import { useCountUp } from './useCountUp'

const money = n =>
  '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct1 = n => `${n.toFixed(1)}%`

/* A worked example, and labelled as one.

   Drawdown is per-account: there is no live figure to show a visitor who has not
   connected an account, and inventing one would be a number with no source
   behind it. So this is stated as an example on a named rule set — $50,000, 5%
   daily, 10% total — which are the limits the preset actually encodes. Every
   figure below is arithmetic on those three numbers, nothing else.

   No profit appears anywhere in it. The gauges measure loss used against the
   limit, which is the thing that ends a funded account.

   Motion (on scroll, via useMotion): each ring fills from empty to its value
   and the figures count up; then the pre-trade check lands. Static, the rings
   sit at their values and every number is final. */
const ACCOUNT = 50000
const RULES = { dailyPct: 5, totalPct: 10 }
const MAX_DAILY = (ACCOUNT * RULES.dailyPct) / 100
const MAX_TOTAL = (ACCOUNT * RULES.totalPct) / 100

const GAUGES = [
  { key: 'daily', label: 'Daily drawdown', used: 890, max: MAX_DAILY, maxLabel: 'Max daily loss', note: 'Resets at the daily cut-off' },
  { key: 'total', label: 'Total drawdown', used: 1640, max: MAX_TOTAL, maxLabel: 'Max total loss', note: 'Runs for the life of the account' },
]

// A planned trade checked against the room left on both limits — the check
// Prop Firm Mode runs (/api/trade-check). Worked on the same example numbers:
// daily $2,500 − $890 − $300 = $1,310, total $5,000 − $1,640 − $300 = $3,060.
const PLANNED_RISK = 300
const DAILY_AFTER = MAX_DAILY - GAUGES[0].used - PLANNED_RISK
const TOTAL_AFTER = MAX_TOTAL - GAUGES[1].used - PLANNED_RISK
const dollars = n => '$' + Math.round(n).toLocaleString('en-US')

/* Zones: under 50% of a limit is room, 50–80% is caution, over 80% is danger.
   Full static class strings and hex strokes — nothing assembled at runtime. */
const toneFor = pct =>
  pct > 80
    ? { stroke: '#fb7185', text: 'text-rose-300' }
    : pct >= 50
      ? { stroke: '#fbbf24', text: 'text-amber-300' }
      : { stroke: '#34d399', text: 'text-emerald-300' }

const R = 44
const ZONES = [
  { from: 0, to: 50, stroke: '#10b981' },
  { from: 50, to: 80, stroke: '#f59e0b' },
  { from: 80, to: 100, stroke: '#f43f5e' },
]
const TICKS = [
  { at: 50, stroke: '#fbbf24' },
  { at: 80, stroke: '#fb7185' },
]
// Point on the ring at a share of the way round, starting at 12 o'clock.
const polar = (at, r) => {
  const a = (at / 100) * 2 * Math.PI - Math.PI / 2
  return [60 + r * Math.cos(a), 60 + r * Math.sin(a)]
}

function Ring({ pct }) {
  const tone = toneFor(pct)
  const shown = useCountUp(pct, pct1)
  return (
    <div className="relative h-[120px] w-[120px] shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
        {/* Zone track: the three bands, faint, so the value arc reads against them.
            An unrotated circle starts at 3 o'clock; offsetting by 25 − from
            (pathLength 100) starts each band at its share from 12 o'clock. */}
        {ZONES.map(z => (
          <circle
            key={z.from}
            cx="60" cy="60" r={R}
            fill="none" stroke={z.stroke} strokeOpacity="0.16" strokeWidth="9"
            pathLength="100"
            strokeDasharray={`${z.to - z.from} ${100 - (z.to - z.from)}`}
            strokeDashoffset={-z.from + 25}
          />
        ))}
        {/* The value arc. Static: drawn to its value. Motion: fills from empty. */}
        <circle
          className="bf-ring-value"
          cx="60" cy="60" r={R}
          fill="none" stroke={tone.stroke} strokeWidth="9" strokeLinecap="round"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 - pct}
          transform="rotate(-90 60 60)"
        />
        {/* Zone boundaries at 50% and 80%. */}
        {TICKS.map(t => {
          const [x1, y1] = polar(t.at, R - 8)
          const [x2, y2] = polar(t.at, R + 8)
          return <line key={t.at} x1={x1} y1={y1} x2={x2} y2={y2} stroke={t.stroke} strokeWidth="2" strokeLinecap="round" />
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* Fixed 5ch box: the count-up runs "0.0%" → "35.6%", and a centred span that grows by a
            character moves — a layout shift. The box stays put; only the glyphs change. */}
        <span ref={shown} className={`inline-block min-w-[5ch] text-center bf-mono text-[19px] font-bold tabular-nums ${tone.text}`}>{pct1(pct)}</span>
        <span className="text-[9.5px] uppercase tracking-wider bf-t3">of limit</span>
      </div>
    </div>
  )
}

function Gauge({ g }) {
  const pct = Math.max(0, Math.min(100, (g.used / g.max) * 100))
  const tone = toneFor(pct)
  const used = useCountUp(g.used, money)
  const left = useCountUp(g.max - g.used, money)

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider bf-t3">{g.label}</p>
      <div className="mt-3 flex items-center gap-4">
        <Ring pct={pct} />
        <dl className="min-w-0 flex-1 space-y-2.5">
          <div>
            <dt className="text-[10.5px] bf-t3">Loss used</dt>
            <dd ref={used} className={`bf-mono text-[15px] font-bold tabular-nums ${tone.text}`}>{money(g.used)}</dd>
          </div>
          <div>
            <dt className="text-[10.5px] bf-t3">Remaining</dt>
            <dd ref={left} className="bf-mono text-[14px] text-emerald-300 tabular-nums">{money(g.max - g.used)}</dd>
          </div>
          <div>
            <dt className="text-[10.5px] bf-t3">{g.maxLabel}</dt>
            <dd className="bf-mono text-[13px] text-slate-300 tabular-nums">{money(g.max)}</dd>
          </div>
        </dl>
      </div>
      <p className="mt-3 text-[10.5px] bf-t3">{g.note}</p>
    </div>
  )
}

export default function DrawdownLive() {
  // The rings fill and the figures count when the panel scrolls into view.
  const motion = useMotion()
  return (
    <div ref={motion} className="bf-motion-host bf-card overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 flex-wrap px-4 pt-4 pb-3.5 bf-hairline-b">
        <div>
          <h3 className="text-[13.5px] font-medium text-slate-100 tracking-tight">Prop Firm Mode</h3>
          <p className="text-[11px] bf-t3 mt-0.5">Daily and total drawdown against your firm&rsquo;s limits</p>
        </div>
        <DemoTag>Demo data · worked example</DemoTag>
      </div>

      <div className="grid sm:grid-cols-2 gap-2.5 p-3">
        {GAUGES.map(g => <Gauge key={g.key} g={g} />)}
      </div>

      {/* Pre-trade check: the planned risk, and what both limits have left once it is taken. */}
      <div className="bf-pretrade mx-3 mb-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider bf-t3">Pre-trade check</p>
          <p className="text-[12.5px] text-slate-300">
            Planned risk <span className="bf-mono tabular-nums text-slate-100">{dollars(PLANNED_RISK)}</span>
          </p>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-slate-400">
          <span className="bf-pretrade-ok inline-flex items-center gap-1.5 rounded-chip border border-bf-bull/25 bg-bf-bull/10 px-2.5 py-1 text-[11px] font-semibold text-bf-bull-soft">
            <Check size={13} strokeWidth={2.5} aria-hidden="true" />
            Within limits
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="bf-mono tabular-nums text-slate-100">{dollars(DAILY_AFTER)}</span> daily
            {' / '}
            <span className="bf-mono tabular-nums text-slate-100">{dollars(TOTAL_AFTER)}</span> total left after this trade
          </span>
        </p>
      </div>

      <p className="bf-hairline-t px-4 py-3 text-[10.5px] leading-relaxed bf-t3">
        Worked on a {money(ACCOUNT).replace('.00', '')} funded account with a {RULES.dailyPct}% daily
        and {RULES.totalPct}% total loss limit. Your own account size and drawdown limits go in the
        settings, or pick your prop firm&rsquo;s preset.
      </p>
    </div>
  )
}
