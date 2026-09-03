import { useLandingNews, timeAgo, stamp } from './useLandingNews'

const isServer = typeof window === 'undefined'

/* Seconds of travel per headline. Slow on purpose: the wire is there to show
   the feed is alive, not to be chased across the panel. At 22s a card takes
   most of half a minute to cross, which is readable at a glance and calm in
   peripheral vision while the rest of the section is being read. */
const SECONDS_PER_CARD = 22

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

function Slide({ a, clone }) {
  const tone = impactTone(a.impact)
  // Absolute in the prerendered HTML, relative once the browser is running.
  const age = isServer ? stamp(a.publishedAt) : timeAgo(a.publishedAt)

  return (
    /* Off-screen slides leave the accessibility tree — otherwise a screen reader
       walks through headlines nobody can see. */
    <li className="w-[300px] sm:w-[360px] shrink-0 px-1.5" aria-hidden={clone ? 'true' : undefined}>
      <article className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5 h-full flex flex-col">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded border ${tone.chip}`}>
            {tone.label}
          </span>
          <ImpactMeter score={a.impact} tone={tone} />
        </div>

        <h3 className="mt-3.5 text-[15px] sm:text-[16px] leading-[1.45] font-medium text-slate-100">
          {a.title}
        </h3>

        {a.oneliner && (
          <p className="mt-2.5 text-[13px] leading-[1.6] text-cyan-300/80">{a.oneliner}</p>
        )}

        <div className="mt-auto pt-4 flex items-center gap-2 flex-wrap text-[11px] bf-t3">
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

/* The news feed, live, moving.

   This was a crop of a screenshot — a card captured at 5120px came back at a
   fifth of native size, putting 14px interface text under 4px. Rendering it
   fixed the legibility and introduced a second problem: a two-column grid on a
   quiet day is one card beside an empty half.

   A slide-and-hold carousel fixed that and introduced a third. It sat still for
   six seconds, jumped, then sat still again, so most of the time a panel headed
   "Live news" was completely motionless — which reads as stalled, not live.

   So the track moves continuously instead, slowly, and never lands on a frame.
   The headlines are rendered twice; half the track is one full set, so the CSS
   loops at -50% and the seam is invisible. Hover or focus pauses it.

   Every headline is in the DOM once as real content and once as an aria-hidden
   clone, so all of them are in the static HTML and a screen reader hears each
   one exactly once. A visitor with no JavaScript gets the full set, still. */
export default function NewsLive() {
  const { articles, ready } = useLandingNews()

  /* Nothing publishable and nothing baked: render no panel rather than a header
     over an empty frame. Only reachable when the feed, the build-time bake and
     the cache are all empty at once. */
  if (ready && articles.length === 0) return null

  // Two copies make the loop seamless; the duration scales with the set so the
  // cards travel at the same speed whether the feed returned two or four.
  const track = ready ? [...articles, ...articles] : []
  const duration = `${Math.max(2, articles.length) * SECONDS_PER_CARD}s`

  return (
    <div className="bf-card overflow-hidden">
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

      <div className="bf-wire-mask overflow-hidden py-3">
        {ready ? (
          /* No padding on the track. translateX(-50%) is half the element's own
             border-box width, so any padding here makes the halfway point miss
             the start of the second copy — 6px of horizontal padding put a 6px
             jump in the loop every cycle. The gutters live inside the cards. */
          <ul className="bf-wire flex items-stretch w-max" style={{ '--dur': duration }}>
            {track.map((a, i) => (
              <Slide key={`${a.title}-${i}`} a={a} clone={i >= articles.length} />
            ))}
          </ul>
        ) : (
          <ul className="flex items-stretch px-1.5">
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="w-[300px] sm:w-[360px] shrink-0 px-1.5">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
                  <div className="bf-skeleton h-4 w-24" style={{ animationDelay: `${i * 90}ms` }} />
                  <div className="bf-skeleton h-4 w-full mt-4" style={{ animationDelay: `${i * 90}ms` }} />
                  <div className="bf-skeleton h-4 w-3/4 mt-2" style={{ animationDelay: `${i * 90}ms` }} />
                  <div className="bf-skeleton h-3 w-1/2 mt-5" style={{ animationDelay: `${i * 90}ms` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="bf-hairline-t px-4 sm:px-5 py-3 text-[10.5px] leading-relaxed bf-t3">
        Impact scoring is a read on how much a headline matters to a forex trader on the
        majors — it is not a forecast.
      </p>
    </div>
  )
}
