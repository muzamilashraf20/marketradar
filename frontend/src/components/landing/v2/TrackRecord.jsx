import { Section, Lede } from './Section'
import { useBiasCalls, fmtLevel, fmtPair, fmtDate } from './useBiasCalls'

/* Phase 2 — the record.

   Individual past calls, never an aggregate. There is not enough recorded data
   to publish a statistic and this section does not attempt one: no rate, no
   count of correct calls, no summary line. Listing what happened makes no
   statistical claim, which is exactly why it can go on the page today.

   OUTCOME LABELS. The engine records three reasons for closing a bias and only
   one of them is price crossing the line. "Held" is not a state it has, so it is
   not a label used here — see useBiasCalls for the full note. */
const OUTCOME = {
  level_break: {
    tone: 'text-rose-300',
    dot: 'bg-rose-400',
    label: level => `Invalidated at ${level} — bias closed`,
  },
  conviction_floor: {
    tone: 'bf-t3',
    dot: 'bg-slate-500',
    label: () => 'Closed — conviction fell below the floor',
  },
  regime_reversal: {
    tone: 'bf-t3',
    dot: 'bg-slate-500',
    label: () => 'Closed — the regime flipped',
  },
}
const outcomeFor = o => OUTCOME[o] || { tone: 'bf-t3', dot: 'bg-slate-500', label: () => 'Closed' }

export default function TrackRecord() {
  const { calls, ready } = useBiasCalls()

  /* Nothing to show means nothing is rendered. A headline promising past calls
     above an empty grid is worse than no section, and this only happens when the
     baked set, the cache and the live fetch are all empty at once — the baked
     set survives an API blip on its own. */
  if (ready && calls.length === 0) return null

  return (
    <Section eyebrow="The record, misses included" headline={<>Every past call is on the page.<br className="bf-br" /> So are the ones that got invalidated.</>} wide>
      <Lede>
        Signal groups delete screenshots. Below are recent bias calls — direction, invalidation
        level, and how each one ended.
      </Lede>

      {(
        <ul className="mt-10 sm:mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {(ready ? calls : Array.from({ length: 6 }, () => null)).map((c, i) => {
            if (!c) {
              return (
                <li key={`s-${i}`} className="bf-card p-4 h-[132px]">
                  <div className="bf-skeleton h-3.5 w-24" style={{ animationDelay: `${i * 80}ms` }} />
                  <div className="bf-skeleton h-3 w-32 mt-4" style={{ animationDelay: `${i * 80}ms` }} />
                  <div className="bf-skeleton h-3 w-full mt-5" style={{ animationDelay: `${i * 80}ms` }} />
                </li>
              )
            }
            const o = outcomeFor(c.outcome)
            const level = fmtLevel(c.pair, c.invalidationLevel)
            const isSell = c.direction === 'SELL'
            return (
              <li key={`${c.pair}-${c.closedAt}`} className="bf-card p-4 flex flex-col" data-reveal>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="bf-mono text-[14px] font-bold tracking-tight">
                    <span className={isSell ? 'text-rose-400' : 'text-emerald-400'}>{c.direction}</span>{' '}
                    <span className="text-slate-100">{fmtPair(c.pair)}</span>
                  </span>
                  <span className="bf-mono text-[11px] bf-t3 shrink-0">{fmtDate(c.closedAt)}</span>
                </div>

                <p className="mt-3 text-[12px] bf-t3">
                  Invalidation level{' '}
                  <span className="bf-mono text-slate-300">{level || '—'}</span>
                </p>

                <p className={`mt-auto pt-3 flex items-start gap-2 text-[12px] leading-snug ${o.tone}`}>
                  <span className={`mt-[5px] w-1.5 h-1.5 rounded-full shrink-0 ${o.dot}`} aria-hidden="true" />
                  {o.label(level)}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}
