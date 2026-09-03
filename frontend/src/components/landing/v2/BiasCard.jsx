import { useEffect, useRef, useState } from 'react'
import { Lock } from 'lucide-react'

/* One bias, rendered the way the dashboard's Macro Compass renders it.

   The style maps and geometry below are lifted from
   components/dashboard/MacroCompass.jsx deliberately — the landing page and the
   product have to read as one surface, so the ring colours, the grade chips and
   the timing chips are the same values, not an approximation of them. */

// Grade drives the accent colour, not direction — direction is already obvious
// from BUY/SELL. A weak BUY and a weak SELL then read as equally weak.
const GRADE_STYLE = {
  'A':  { ring: '#10b981', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  'A-': { ring: '#10b981', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  'B':  { ring: '#06b6d4', chip: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25' },
  'C':  { ring: '#eab308', chip: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25' },
  'D':  { ring: '#64748b', chip: 'bg-slate-500/15 text-slate-400 border-slate-500/25' },
}
const gradeStyle = g => GRADE_STYLE[g] || GRADE_STYLE.D

const TIMING_STYLE = {
  FRESH:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  EXTENDED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  LATE:     'bg-red-500/10 text-red-400 border-red-500/20',
}

// Levels arrive as raw floats from the ATR maths (0.7028257142857143). Round to
// the pair's real quoting precision — the same convention the backend logs use.
const fmtLevel = (pair, v) => {
  if (v == null) return null
  const dp = pair.includes('JPY') ? 3 : pair === 'XAUUSD' ? 2 : 5
  return Number(v).toFixed(dp)
}

const fmtPair = p => (p && p.length === 6 ? `${p.slice(0, 3)}/${p.slice(3)}` : p || '')

const isServer = typeof window === 'undefined'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* The hero entrance holds these cards at opacity 0 for their first second. A
   client rendering inside that window animates as part of the reveal; one
   arriving later would be resetting numbers already painted on screen, which
   reads as a glitch rather than as data landing. The rows are the same on the
   server and in the browser now, so the only question left is timing. */
const ENTRANCE_MS = 1100
const shouldAnimate = () => {
  if (typeof document === 'undefined') return false
  if (prefersReducedMotion()) return false
  // requestAnimationFrame does not fire in a background tab, so starting the
  // count-up there leaves it on its first frame — a conviction of 0 painted
  // beside a grade of A-. The showcase card had the same fault; anything
  // rendering the page headless saw it.
  if (document.visibilityState !== 'visible') return false
  return typeof performance === 'undefined' || performance.now() < ENTRANCE_MS
}

/* Conviction count-up: 0 → value over ~900ms, ease-out cubic. */
function useCountUp(target, animate) {
  const [value, setValue] = useState(0)
  const raf = useRef(0)

  useEffect(() => {
    if (target == null || !animate) return
    const start = performance.now()
    const tick = now => {
      const t = Math.min(1, (now - start) / 900)
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, animate])

  if (target == null) return null
  if (isServer) return target
  return animate ? value : target
}

/* Radial conviction gauge. The arc is the score; the number is the score.
   Ported from the dashboard's Gauge, with the arc sweeping in on mount. */
function Ring({ value, color, shown, filled, size = 54, stroke = 5 }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value ?? 0)) / 100

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ}
          // Sweeps from empty to the value. stroke-dashoffset only — no
          // geometry attribute is animated, so this costs no layout.
          strokeDashoffset={filled ? circ * (1 - pct) : circ}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="bf-mono text-[14px] font-bold text-white">{shown ?? '–'}</span>
      </div>
    </div>
  )
}

export default function BiasCard({ row, justChanged }) {
  const gs = gradeStyle(row.grade)
  const isBuy = row.direction === 'BUY'
  const level = fmtLevel(row.pair, row.invalidationLevel)

  const [animate] = useState(shouldAnimate)
  const shown = useCountUp(row.confidence, animate)
  const [filled, setFilled] = useState(() => isServer || !animate)

  useEffect(() => {
    if (row.confidence == null) return
    const id = requestAnimationFrame(() => setFilled(true))
    return () => cancelAnimationFrame(id)
  }, [row.confidence])

  // 300ms tint when this pair's conviction actually moved on a live fetch.
  // Driven on the node: a one-shot visual with no bearing on what renders.
  const card = useRef(null)
  useEffect(() => {
    if (!justChanged || !card.current) return
    const el = card.current
    el.classList.add('is-fresh')
    const t = setTimeout(() => el.classList.remove('is-fresh'), 400)
    return () => { clearTimeout(t); el.classList.remove('is-fresh') }
  }, [justChanged])

  return (
    <li
      ref={card}
      className="bf-row rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 flex flex-col"
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="bf-mono text-[13px] font-bold text-white tracking-tight">
          {fmtPair(row.pair)}
        </span>
        {row.isHeadline && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            Today
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Ring value={row.confidence} color={gs.ring} shown={shown} filled={filled} />
        <div className="min-w-0">
          <p className={`text-[15px] font-bold leading-none ${isBuy ? 'text-emerald-400' : 'text-rose-400'}`}>
            {row.direction}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {row.grade && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${gs.chip}`}>
                {row.grade}
              </span>
            )}
            {row.entryTiming && (
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${TIMING_STYLE[row.entryTiming] || TIMING_STYLE.FRESH}`}>
                {row.entryTiming}
              </span>
            )}
          </div>
        </div>
      </div>

      {row.thesis && (
        <p className="text-[11px] leading-snug text-slate-400 mt-3 line-clamp-2">
          {row.thesis}
        </p>
      )}

      {/* The invalidation level, shown in full. It is the single most important
          element on the page — the thing no signal service publishes — and on
          sample data there is nothing to withhold: nobody can trade a level off
          a pair that is not being quoted right now. Withholding it here only
          hid the feature. */}
      {level && (
        <div className="mt-auto pt-3">
          <div className="p-2 rounded-lg bg-rose-500/[0.06] border border-rose-500/20">
            <p className="text-[10.5px] font-semibold text-rose-300 bf-mono tabular-nums">
              Invalidates at {level}
            </p>
            <p className="text-[9.5px] text-slate-400 leading-snug mt-0.5">
              Cross it and the bias is closed.
            </p>
          </div>
        </div>
      )}

    </li>
  )
}
