import { useLandingNews, NEWS_CARDS, timeAgo, stamp } from './useLandingNews'

const isServer = typeof window === 'undefined'

/* Impact is scored 1-10 by the engine. Only the top of that range gets the red
   treatment, so "high impact" keeps meaning something on a page where every
   card is trying to look important. */
const impactTone = n =>
  n >= 8
    ? { label: 'High impact', chip: 'bg-rose-500/10 text-rose-300 border-rose-500/25', bar: 'bg-rose-400', dot: 'bg-rose-400' }
    : n >= 6
      ? { label: 'Medium impact', chip: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/25', bar: 'bg-yellow-400', dot: 'bg-yellow-400' }
      : { label: 'Low impact', chip: 'bg-slate-500/10 bf-t3 border-slate-500/25', bar: 'bg-slate-500', dot: 'bg-slate-500' }

/* The 1-10 score as ten segments rather than a number in a box. It is the one
   quantity on the card, and a filled bar reads at a glance where "8/10" needs
   parsing. The segments fill left to right when the card arrives. */
function ImpactMeter({ score, tone, delay }) {
  const n = Math.max(0, Math.min(10, score ?? 0))
  return (
    <div className="flex items-center gap-2" aria-label={`Impact ${n} out of 10`}>
      <div className="flex gap-[3px]" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={`bf-seg w-[7px] h-[3px] rounded-full origin-left ${i < n ? tone.bar : 'bg-slate-700/70'}`}
            style={{ '--d': `${delay + i * 45}ms` }}
          />
        ))}
      </div>
      <span className="bf-mono text-[10.5px] bf-t3 tabular-nums">{n}/10</span>
    </div>
  )
}

function Card({ a, index }) {
  const tone = impactTone(a.impact)
  const delay = index * 90
  // Absolute in the prerendered HTML, relative once the browser is running.
  const age = isServer ? stamp(a.publishedAt) : timeAgo(a.publishedAt)

  return (
    <li className="bf-row rounded-xl border border-white/[0.06] bg-white/[0.02] p-4" data-reveal>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className={`text-[9.5px] font-bold uppercase tracking-wider px-2 py-[3px] rounded border ${tone.chip}`}>
          {tone.label}
        </span>
        <ImpactMeter score={a.impact} tone={tone} delay={delay + 160} />
      </div>

      <h3 className="mt-3 text-[15px] leading-[1.45] font-medium text-slate-100">
        {a.title}
      </h3>

      {a.oneliner && (
        <p className="mt-2 text-[13px] leading-[1.6] text-cyan-300/80">{a.oneliner}</p>
      )}

      <div className="mt-3.5 flex items-center gap-2 flex-wrap text-[10.5px] bf-t3">
        {a.source && <span className="bf-pill bf-hairline px-2 py-[3px]">{a.source}</span>}
        {a.category && <span className="bf-pill bf-hairline px-2 py-[3px]">{a.category}</span>}
        {(a.marketTags || []).map(t => (
          <span key={t} className="bf-mono bf-pill bf-hairline px-2 py-[3px] text-emerald-300/70">{t}</span>
        ))}
        {age && <span className="ml-auto tabular-nums">{age}</span>}
      </div>
    </li>
  )
}

/* The news feed, rendered live rather than photographed.

   This section used to be a crop of a screenshot. At the width the layout gives
   it, a card captured at 5120px wide came back at roughly a fifth of native
   size, which put 14px interface text under 4px — a picture of a feature rather
   than the feature. Rendering the real cards from the real feed costs nothing in
   layout, reads at any width, and is true at the moment it is read.

   The cards carry data-reveal, so they rise in one after another under the
   page's own entrance system rather than a second one written for this section.
   That stagger is the point the trader is meant to feel: headlines land through
   the session one at a time, which is the noise this section is about. */
export default function NewsLive() {
  const { articles, ready } = useLandingNews()

  /* Nothing publishable and nothing baked: render no section at all rather than
     a headline over an empty grid. Only reachable when the feed, the build-time
     bake and the cache are all empty at once. */
  if (ready && articles.length === 0) return null

  const rows = ready ? articles : Array.from({ length: NEWS_CARDS }, () => null)

  return (
    <div className="bf-card overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-3.5 bf-hairline-b">
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

      <ul className="grid sm:grid-cols-2 gap-2.5 p-3">
        {rows.map((a, i) =>
          a ? (
            <Card key={a.title} a={a} index={i} />
          ) : (
            <li key={i} className="h-[168px] rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="bf-skeleton h-3.5 w-24" style={{ animationDelay: `${i * 90}ms` }} />
              <div className="bf-skeleton h-3 w-full mt-4" style={{ animationDelay: `${i * 90}ms` }} />
              <div className="bf-skeleton h-3 w-4/5 mt-2" style={{ animationDelay: `${i * 90}ms` }} />
              <div className="bf-skeleton h-3 w-1/2 mt-5" style={{ animationDelay: `${i * 90}ms` }} />
            </li>
          )
        )}
      </ul>

      <p className="bf-hairline-t px-4 py-3 text-[10.5px] leading-relaxed bf-t3">
        Impact scoring is a read on how much a headline matters to a forex trader on the
        majors — it is not a forecast.
      </p>
    </div>
  )
}
