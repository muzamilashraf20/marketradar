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

/* Card width, and the travel rate that keeps it moving at the same speed as the
   news wire. 16px a second is the figure both are tuned to — the record and the
   feed drifting at different rates on one page reads as two mistakes. */
const CARD_W = 290
const SECONDS_PER_CARD = Math.round(CARD_W / 16.4)
const MIN_CARDS_PER_COPY = 5

function Call({ c, clone }) {
  const o = outcomeFor(c.outcome)
  const level = fmtLevel(c.pair, c.invalidationLevel)
  const isSell = c.direction === 'SELL'
  return (
    <li
      className="shrink-0 px-1.5"
      style={{ width: CARD_W }}
      aria-hidden={clone ? 'true' : undefined}
    >
      <article className="bf-card p-4 h-full flex flex-col">
        <div className="flex items-baseline justify-between gap-3">
          <span className="bf-mono text-[14px] font-bold tracking-tight">
            <span className={isSell ? 'text-rose-400' : 'text-emerald-400'}>{c.direction}</span>{' '}
            <span className="text-slate-100">{fmtPair(c.pair)}</span>
          </span>
          <span className="bf-mono text-[11px] bf-t3 shrink-0">{fmtDate(c.closedAt)}</span>
        </div>

        <p className="mt-3 text-[12px] bf-t3">
          Invalidation level <span className="bf-mono text-slate-300">{level || '—'}</span>
        </p>

        <p className={`mt-auto pt-3 flex items-start gap-2 text-[12px] leading-snug ${o.tone}`}>
          <span className={`mt-[5px] w-1.5 h-1.5 rounded-full shrink-0 ${o.dot}`} aria-hidden="true" />
          {o.label(level)}
        </p>
      </article>
    </li>
  )
}

/* One flowing row of calls.

   Same mechanism as the news wire: the set is padded until a copy overfills the
   frame, laid down twice, and translated to -50% so the loop seam is invisible.
   Hover or focus pauses it, which is what makes a moving row usable for
   something a visitor is meant to actually read. */
function Row({ calls, offset }) {
  if (!calls.length) return null
  const repeats = Math.max(1, Math.ceil(MIN_CARDS_PER_COPY / calls.length))
  const copy = Array.from({ length: repeats }, () => calls).flat()
  const track = [...copy, ...copy]
  return (
    <div className="bf-wire-mask overflow-hidden">
      <ul
        className="bf-wire flex items-stretch w-max"
        style={{ '--dur': `${copy.length * SECONDS_PER_CARD}s`, animationDelay: `-${offset}s` }}
      >
        {track.map((c, i) => (
          <Call key={`${c.pair}-${c.closedAt}-${i}`} c={c} clone={i >= calls.length} />
        ))}
      </ul>
    </div>
  )
}

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

      {/* Two rows, flowing, rather than a grid.

          The record only grows — 17 closed calls became 24 in a few days — and
          as a grid every new one added a row to the page. Flowing rows are a
          fixed height whatever the engine has closed, and they carry the same
          motion as the news wire so the page reads as one surface.

          Split across two rows rather than one so eight calls are on screen at
          a time instead of four. This section is evidence and a visitor has to
          be able to take it in; the rows pause the moment the pointer lands on
          them. The second row is offset so the two are never in step. */}
      <div className="mt-10 sm:mt-12 space-y-2.5">
        {ready ? (
          <>
            <Row calls={calls.filter((_, i) => i % 2 === 0)} offset={0} />
            <Row calls={calls.filter((_, i) => i % 2 === 1)} offset={37} />
          </>
        ) : (
          <div className="flex gap-2.5">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="bf-card p-4 shrink-0" style={{ width: CARD_W }}>
                <div className="bf-skeleton h-3.5 w-24" style={{ animationDelay: `${i * 80}ms` }} />
                <div className="bf-skeleton h-3 w-32 mt-4" style={{ animationDelay: `${i * 80}ms` }} />
                <div className="bf-skeleton h-3 w-full mt-5" style={{ animationDelay: `${i * 80}ms` }} />
              </div>
            ))}
          </div>
        )}
      </div>

    </Section>
  )
}
