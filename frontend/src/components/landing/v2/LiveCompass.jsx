import BiasCard from './BiasCard'
import { CARDS } from './useCompassData'

const fmtPair = p => (p && p.length === 6 ? `${p.slice(0, 3)}/${p.slice(3)}` : p || '')

/* The header used to carry an absolute-then-relative "engine last ran" stamp,
   because the rows were a real engine run and a frozen relative time in
   prerendered HTML would have kept claiming "17m ago" for days. The rows are a
   sample now, so there is no run to date and nothing to keep honest — the whole
   stamp came out rather than being pointed at a fabricated timestamp. */
/* Presentational. The hero owns the data, because it has to know what state the
   panel is in before it lays the section out. */
export default function LiveCompass({ rows, ready, alsoScoring = [], changedPairs = [] }) {
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
          <p className="text-[11px] bf-t3 mt-0.5">A look at the dashboard</p>
        </div>

        {/* Says sample, not live. These numbers are illustrative and the panel
            has to say so on its face — captioning them as a recent engine run
            would be inventing a claim about what the engine is saying now, and
            a visitor deciding whether to pay would be deciding on it. */}
        <span className="bf-pill bf-hairline text-[9.5px] font-bold uppercase tracking-wider px-2 py-[3px] bf-t3 shrink-0">
          Sample
        </span>
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
        /* Two up when there are two. A single card in a two-column grid left
           the other half of the panel empty, which read as a card that had
           failed to load rather than as the engine publishing one bias — and
           one bias is a normal state: right now four majors sit at Grade D and
           two are flat, so only two clear the floor. On the days it is one,
           that one takes the full width — which is also the width the card was
           designed at, so nothing has to shrink to fill the row. */
        <ul className={`grid gap-2.5 p-3 ${shown.length > 1 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
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
