import { useEffect, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import { useCompassData } from './useCompassData'

const isServer = typeof window === 'undefined'

/* Whether the ring can sweep at all, decided once before the first render.

   This has to be read the right way round. When the answer is no — reduced
   motion, a background tab, the static render — the card must show the settled
   number, not start an animation that will never advance. It was wired the other
   way and a hidden document painted a conviction of 0 next to a label reading
   82/100, because requestAnimationFrame does not fire in a background tab and
   the count-up never left its first frame. Anything rendering the page headless
   saw that 0. */
const canSweep = () => {
  if (isServer) return false
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
  return document.visibilityState === 'visible'
}

/* Same values as the dashboard's Macro Compass and the hero card. The landing
   page and the product have to read as one surface, so these are lifted, not
   approximated. */
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

const fmtPair = p => (p && p.length === 6 ? `${p.slice(0, 3)}/${p.slice(3)}` : p || '')

function useCountUp(target, run, duration = 950) {
  const [value, setValue] = useState(0)
  const raf = useRef(0)

  useEffect(() => {
    if (target == null || !run) return
    const start = performance.now()
    const tick = now => {
      const t = Math.min(1, (now - start) / duration)
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, run, duration])

  if (target == null) return null
  return isServer || !run ? target : value
}

/* The conviction gauge at showcase size. Geometry is the dashboard's, scaled up:
   this is the one card on the page rendered large enough to read from across a
   room, because it is the thing the whole section is about. */
function Ring({ value, color, shown, filled, size = 78, stroke = 6 }) {
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
          strokeDashoffset={filled ? circ * (1 - pct) : circ}
          style={{ transition: 'stroke-dashoffset 1100ms cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="bf-mono text-[21px] font-bold text-white tabular-nums">{shown ?? '–'}</span>
      </div>
    </div>
  )
}

/* The bias card at full size, rendered from the live engine.

   This replaces a screenshot, and the screenshot was the problem the whole
   rework was called on. A 601px capture placed in a 600px frame still had to
   crop two bands out of the middle to fit the section, and the callout marking
   the invalidation block was positioned by measuring percentages off the image —
   which meant every recapture silently moved the box off its target.

   Rendered, there is nothing to measure. The callout ring is on the invalidation
   element itself, so it cannot drift, at any width, ever again. */
export default function BiasShowcase() {
  const { rows, ready } = useCompassData()
  const ref = useRef(null)
  // Two separate questions: may we animate at all, and has the card been
  // scrolled to yet. Collapsing them into one flag is what put a 0 on screen.
  const [willAnimate] = useState(canSweep)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || !willAnimate || started) return
    const io = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) { setStarted(true); io.disconnect() } },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.2 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [willAnimate, started])

  /* The pair the engine is leading with, falling back to the highest conviction
     read it has. Never a hand-picked one — whatever is on the dashboard right
     now is what goes here, including on a quiet day. */
  const row = rows.find(r => r.isHeadline) || rows[0] || null

  const counted = useCountUp(row?.confidence, willAnimate && started)
  // Zero only while the card is still below the fold and an animation is
  // genuinely coming. Everywhere else the settled number is what renders.
  const shown = willAnimate && !started ? 0 : counted
  const filled = !willAnimate || started

  if (ready && !row) {
    /* No publishable bias at all. The section keeps its point — a bias always
       carries the level where it is wrong — without inventing a card to prove it. */
    return (
      <div className="bf-card p-6 text-center" ref={ref}>
        <p className="text-[14.5px] text-slate-200 font-medium">No pair clears the bar right now.</p>
        <p className="mt-2.5 text-[12.5px] bf-t3 leading-relaxed max-w-[36ch] mx-auto">
          The engine is scoring every major pair. When the macro evidence is not strong enough it
          holds, rather than publishing a read it does not have.
        </p>
      </div>
    )
  }

  if (!ready || !row) {
    return (
      <div className="bf-card p-5" ref={ref}>
        <div className="bf-skeleton h-4 w-28" />
        <div className="bf-skeleton h-[78px] w-[78px] rounded-full mt-5" />
        <div className="bf-skeleton h-3 w-full mt-6" />
        <div className="bf-skeleton h-3 w-4/5 mt-2" />
        <div className="bf-skeleton h-16 w-full mt-6 rounded-lg" />
      </div>
    )
  }

  const gs = gradeStyle(row.grade)
  const isBuy = row.direction === 'BUY'

  return (
    <div className="bf-card overflow-hidden shadow-[0_24px_70px_-30px_rgba(0,0,0,0.95)]" ref={ref}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3.5 bf-hairline-b">
        <span className="bf-mono text-[17px] font-bold text-white tracking-tight">
          {fmtPair(row.pair)}
        </span>
        <span className="text-[11px] bf-t3 flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bf-ping text-emerald-400 bg-emerald-400" aria-hidden="true" />
          Live forex bias, from the app
        </span>
      </div>

      <div className="p-5">
        <div className="flex items-center gap-5">
          <Ring value={row.confidence} color={gs.ring} shown={shown} filled={filled} />
          <div className="min-w-0">
            <p className={`text-[26px] font-bold leading-none tracking-tight ${isBuy ? 'text-emerald-400' : 'text-rose-400'}`}>
              {row.direction}
            </p>
            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
              {row.grade && (
                <span className={`text-[10px] font-bold px-2 py-[3px] rounded border ${gs.chip}`}>
                  {row.grade}
                </span>
              )}
              {row.entryTiming && (
                <span className={`text-[10px] font-semibold px-2 py-[3px] rounded border ${TIMING_STYLE[row.entryTiming] || TIMING_STYLE.FRESH}`}>
                  {row.entryTiming}
                </span>
              )}
              <span className="text-[10px] bf-t3 px-1">Conviction {row.confidence ?? '–'}/100</span>
            </div>
          </div>
        </div>

        {/* The opening of the reasoning, not all of it. The cut is made in
            useCompassData before the text is ever sent, so the rest is not
            sitting in the page source under a CSS clamp. */}
        {row.thesis && (
          <p className="mt-5 text-[14px] leading-[1.7] text-slate-300">{row.thesis}</p>
        )}

        {/* The invalidation block, and the callout that points at it.

            The ring is a class on this element rather than a box positioned over
            a photograph of it. That is the whole reason this section stopped
            being a screenshot: the marker is attached to the thing it marks.

            The number itself is not printed. This section argues that every bias
            carries the price that closes it, and it can make that argument
            without handing today's level to anyone who loads the page — that
            level is the product. The record further down carries the real levels
            from calls that have already closed, where they prove the point and
            are no longer tradeable. */}
        {row.hasInvalidation && (
          <div className="mt-6 relative rounded-lg bg-rose-500/[0.06] border border-rose-500/20 ring-2 ring-cyan-400/70 ring-offset-2 ring-offset-[#0b1220] p-4">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-rose-300">
              <Lock size={14} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
              This bias has an invalidation level
            </p>
            <p className="text-[12.5px] text-slate-400 leading-snug mt-1.5">
              One price {isBuy ? 'below' : 'above'} the current read closes it. It is not defended
              and it is not moved — and it is on the dashboard, not on this page.
            </p>
            <a
              href="/login"
              className="bf-pill bf-lift bf-hairline mt-3.5 inline-block px-3.5 py-1.5 text-[12.5px] text-slate-200 hover:border-slate-600"
            >
              See the level
            </a>
          </div>
        )}
      </div>

      {row.hasInvalidation && (
        <p className="bf-hairline-t px-5 py-3 flex items-center gap-2 text-[12px] text-cyan-400">
          <span className="inline-block w-6 h-px bg-cyan-400/70 shrink-0" aria-hidden="true" />
          The invalidation level — the price that closes this bias
        </p>
      )}
    </div>
  )
}
