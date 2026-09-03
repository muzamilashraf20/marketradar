import { useEffect, useRef, useState } from 'react'
import { useLandingNews, timeAgo, stamp } from './useLandingNews'

const isServer = typeof window === 'undefined'

const canAnimate = () =>
  !isServer &&
  !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches &&
  document.visibilityState === 'visible'

/* How long each headline holds before the next slides in. Long enough to read a
   headline and the one-line read under it without being rushed. */
const DWELL_MS = 6000

/* Impact is scored 1-10 by the engine. Only the top of that range gets the red
   treatment, so "high impact" keeps meaning something on a page where every
   card is trying to look important. */
const impactTone = n =>
  n >= 8
    ? { label: 'High impact', chip: 'bg-rose-500/10 text-rose-300 border-rose-500/25', bar: 'bg-rose-400' }
    : n >= 6
      ? { label: 'Medium impact', chip: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/25', bar: 'bg-yellow-400' }
      : { label: 'Low impact', chip: 'bg-slate-500/10 bf-t3 border-slate-500/25', bar: 'bg-slate-500' }

/* The 1-10 score as ten segments rather than a number in a box. It is the one
   quantity on the card, and a filled bar reads at a glance where "8/10" needs
   parsing. */
function ImpactMeter({ score, tone }) {
  const n = Math.max(0, Math.min(10, score ?? 0))
  return (
    <div className="flex items-center gap-2.5" aria-label={`Impact ${n} out of 10`}>
      <div className="flex gap-[3px]" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={`bf-seg w-[9px] h-[3px] rounded-full origin-left ${i < n ? tone.bar : 'bg-slate-700/70'}`}
            style={{ '--d': `${i * 45}ms` }}
          />
        ))}
      </div>
      <span className="bf-mono text-[11px] bf-t3 tabular-nums">{n}/10</span>
    </div>
  )
}

function Slide({ a, active }) {
  const tone = impactTone(a.impact)
  // Absolute in the prerendered HTML, relative once the browser is running.
  const age = isServer ? stamp(a.publishedAt) : timeAgo(a.publishedAt)

  return (
    /* Off-screen slides leave the accessibility tree — otherwise a screen reader
       walks through headlines nobody can see. */
    <li className="w-full shrink-0 px-3" aria-hidden={active ? undefined : 'true'}>
      <article className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 sm:p-6 h-full flex flex-col">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded border ${tone.chip}`}>
            {tone.label}
          </span>
          <ImpactMeter score={a.impact} tone={tone} />
        </div>

        <h3 className="mt-4 text-[19px] sm:text-[22px] leading-[1.35] font-medium text-slate-100 max-w-[40ch]">
          {a.title}
        </h3>

        {a.oneliner && (
          <p className="mt-3 text-[14.5px] leading-[1.65] text-cyan-300/80 max-w-[64ch]">{a.oneliner}</p>
        )}

        <div className="mt-auto pt-5 flex items-center gap-2 flex-wrap text-[11px] bf-t3">
          {a.source && <span className="bf-pill bf-hairline px-2.5 py-1">{a.source}</span>}
          {a.category && <span className="bf-pill bf-hairline px-2.5 py-1">{a.category}</span>}
          {(a.marketTags || []).map(t => (
            <span key={t} className="bf-mono bf-pill bf-hairline px-2.5 py-1 text-emerald-300/70">{t}</span>
          ))}
          {age && <span className="ml-auto tabular-nums">{age}</span>}
        </div>
      </article>
    </li>
  )
}

/* The news feed, live, one headline at a time.

   This was a crop of a screenshot — a card captured at 5120px came back at a
   fifth of native size, putting 14px interface text under 4px. Rendering it
   fixed the legibility and introduced a second problem: a two-column grid on a
   quiet day is one card beside an empty half.

   A carousel answers both. One headline gets the full width at a size worth
   reading, and the panel is the same height whether the feed returns one article
   or four. It also does what the copy above it describes — headlines arriving
   one after another through the session — rather than asserting it.

   Every slide stays in the DOM, so all of them are in the static HTML. A visitor
   with no JavaScript gets the first one and no motion. */
export default function NewsLive() {
  const { articles, ready } = useLandingNews()
  const [index, setIndex] = useState(0)
  const [animated] = useState(canAnimate)
  const paused = useRef(false)

  const count = ready ? articles.length : 0

  useEffect(() => {
    if (!animated || count < 2) return
    const id = setInterval(() => {
      if (!paused.current) setIndex(i => (i + 1) % count)
    }, DWELL_MS)
    return () => clearInterval(id)
  }, [animated, count])

  /* Nothing publishable and nothing baked: render no panel rather than a header
     over an empty frame. Only reachable when the feed, the build-time bake and
     the cache are all empty at once. */
  if (ready && articles.length === 0) return null

  const at = count ? index % count : 0

  return (
    <div
      className="bf-card overflow-hidden"
      onMouseEnter={() => { paused.current = true }}
      onMouseLeave={() => { paused.current = false }}
      onFocusCapture={() => { paused.current = true }}
      onBlurCapture={() => { paused.current = false }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap px-4 sm:px-5 pt-4 pb-3.5 bf-hairline-b">
        <div>
          <h3 className="text-[13.5px] font-medium text-slate-100 tracking-tight">Live news</h3>
          <p className="text-[11px] bf-t3 mt-0.5">Headlines scored for impact on the major forex pairs</p>
        </div>
        <p className="text-[11px] bf-t3 flex items-center gap-2 shrink-0">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${ready ? 'bf-ping text-emerald-400 bg-emerald-400' : 'bg-slate-600'}`}
            aria-hidden="true"
          />
          {ready ? 'Reading the wires' : 'Loading…'}
        </p>
      </div>

      {/* The track holds every slide side by side and moves by whole widths.
          Transform only, so it costs no layout, and the slides stretch to the
          tallest — the panel cannot change height as it advances. */}
      <div className="overflow-hidden py-3">
        {ready ? (
          <ul
            className="flex items-stretch"
            style={{
              transform: `translateX(-${at * 100}%)`,
              transition: animated ? 'transform 600ms cubic-bezier(0.16,1,0.3,1)' : 'none',
            }}
          >
            {articles.map((a, i) => <Slide key={a.title} a={a} active={i === at} />)}
          </ul>
        ) : (
          <div className="px-3">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 sm:p-6">
              <div className="bf-skeleton h-4 w-28" />
              <div className="bf-skeleton h-5 w-full mt-5" />
              <div className="bf-skeleton h-5 w-3/4 mt-2.5" />
              <div className="bf-skeleton h-3 w-1/2 mt-6" />
            </div>
          </div>
        )}
      </div>

      <div className="bf-hairline-t px-4 sm:px-5 py-3 flex items-center justify-between gap-4">
        <p className="text-[10.5px] leading-relaxed bf-t3">
          Impact scoring is a read on how much a headline matters to a forex trader on the
          majors — it is not a forecast.
        </p>

        {count > 1 && (
          <div className="flex items-center gap-1.5 shrink-0">
            {articles.map((a, i) => (
              <button
                key={a.title}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show headline ${i + 1} of ${count}`}
                aria-current={i === at ? 'true' : undefined}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === at ? 'w-5 bg-cyan-400' : 'w-1.5 bg-slate-600 hover:bg-slate-500'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
