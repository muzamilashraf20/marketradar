import BiasCard from './BiasCard'
import { CARDS } from './useCompassData'

const isServer = typeof window === 'undefined'

const fmtPair = p => (p && p.length === 6 ? `${p.slice(0, 3)}/${p.slice(3)}` : p || '')

/* The prerendered document is frozen at build time, so a relative age baked into
   it ("17m ago") keeps claiming that days later to anyone without JavaScript.
   The static render states the absolute time instead; the browser swaps in the
   relative form on mount, where it is recomputed and stays true. */
const stamp = iso =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }).replace(',', '') + ' UTC'

/* "engine last ran Xh ago" — driven by the real row timestamp, never a constant. */
function timeAgo(iso) {
  if (!iso) return null
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(mins) || mins < 0) return null
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

/* Presentational. The hero owns the data, because it has to know what state the
   panel is in before it lays the section out. */
export default function LiveCompass({ rows, lastRun, ready, alsoScoring = [], changedPairs = [] }) {
  // Absolute in the prerendered HTML, relative once the browser is running.
  const ranAgo = lastRun ? (isServer ? stamp(lastRun) : timeAgo(lastRun)) : null
  const shown = rows.slice(0, CARDS)
  const n = rows.length
  const empty = ready && n === 0
  const changed = new Set(changedPairs)
  // Count the chips themselves. Deriving this from (scanned - live biases)
  // counted a different set to the one being listed: with 6 live biases and 8
  // pairs it said "2 more" above a row of 6 chips.
  const alsoCount = alsoScoring.length

  return (
    <div className="bf-card overflow-hidden min-w-0 shadow-[0_24px_70px_-30px_rgba(0,0,0,0.95)]">
      {/* Panel header. Stacks below 420px, where side by side wrapped the
          heading and truncated the live line mid-word. */}
      <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-baseline min-[420px]:justify-between gap-1 min-[420px]:gap-3 px-4 pt-4 pb-3.5 bf-hairline-b">
        <div>
          <h2 className="text-[13.5px] font-medium text-slate-100 tracking-tight whitespace-nowrap">
            Macro compass
          </h2>
          <p className="text-[11px] bf-t3 mt-0.5">Live from the app</p>
        </div>

        <p className="text-[11px] bf-t3 flex items-center gap-2 min-w-0">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
              ready ? 'bf-ping text-emerald-400 bg-emerald-400' : 'bg-slate-600'
            }`}
            aria-hidden="true"
          />
          {ready ? (
            <span className="truncate">
              {n > 0 ? `${n} live ${n === 1 ? 'bias' : 'biases'}` : 'Engine live'}
              {ranAgo ? ` · engine last ran ${ranAgo}` : ''}
            </span>
          ) : (
            <span>Loading live bias data…</span>
          )}
        </p>
      </div>

      {empty ? (
        /* Nothing publishable at all — rare now the floor is Grade C, but it
           still has to render as a decision rather than as a gap. */
        <div className="px-5 py-9 text-center min-h-[190px] flex flex-col justify-center">
          <p className="text-[14.5px] text-slate-200 font-medium">
            No pair clears the bar right now.
          </p>
          <p className="mt-2.5 text-[12.5px] bf-t3 leading-relaxed max-w-[30ch] mx-auto">
            The engine is running and scoring every major pair. When the macro evidence
            is not strong enough, it holds — rather than publishing a read it does
            not have.
          </p>
          <a
            href="/login"
            className="bf-pill bf-lift bf-hairline mt-5 inline-block self-center px-4 py-2 text-[12.5px] text-slate-200 hover:border-slate-600"
          >
            See every pair being scored
          </a>
        </div>
      ) : ready ? (
        /* Stacked below xl, two up above it. The two-up only engages at xl
           because at the lg breakpoint the panel column is 429px, which would
           put cards at 197px — back under the dashboard width this rebuild
           exists to match. Stacked cards are full width and always legible. */
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 p-3">
          {shown.map(row => (
            <BiasCard key={row.pair} row={row} justChanged={changed.has(row.pair)} />
          ))}
        </ul>
      ) : (
        /* Skeleton at the card footprint, so the swap to real data cannot shift
           anything below it. */
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 p-3">
          {Array.from({ length: CARDS }, (_, i) => (
            <li
              key={i}
              className="h-[236px] rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5"
            >
              <div className="bf-skeleton h-3.5 w-16" style={{ animationDelay: `${i * 90}ms` }} />
              <div className="bf-skeleton h-[54px] w-[54px] rounded-full mt-3" style={{ animationDelay: `${i * 90}ms` }} />
              <div className="bf-skeleton h-3 w-full mt-4" style={{ animationDelay: `${i * 90}ms` }} />
              <div className="bf-skeleton h-3 w-2/3 mt-2" style={{ animationDelay: `${i * 90}ms` }} />
            </li>
          ))}
        </ul>
      )}

      {ready && alsoCount > 0 && (
        <div className="bf-hairline-t px-4 py-3.5">
          <p className="text-[11px] bf-t3">
            Also scoring {alsoCount} more major {alsoCount === 1 ? 'pair' : 'pairs'}.
          </p>
          {alsoScoring.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {alsoScoring.map(pair => (
                <li
                  key={pair}
                  className="bf-mono bf-pill bf-hairline px-2 py-[3px] text-[10.5px] bf-t3"
                >
                  {fmtPair(pair)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="bf-hairline-t px-4 py-3 text-[10.5px] leading-relaxed bf-t3">
        Conviction is how much of the macro evidence agrees on the direction — it is not a
        probability of profit.
      </p>
    </div>
  )
}
