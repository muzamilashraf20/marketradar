import { Section, Lede } from './Section'
import Card from '../../ui/Card'
import DirectionBadge from '../../ui/DirectionBadge'
import StatusBadge from '../../ui/StatusBadge'
import LevelRow from '../../ui/LevelRow'
import EmptyState from '../../ui/EmptyState'
import { statusFromOutcome, statusStyle, FOCUS_RING } from '../../ui/styles'
import { fmtPair } from '../../ui/format'
import { useBiasCalls, fmtDate } from './useBiasCalls'
import { useMotion } from './useMotion'

/* The record — real closed calls, invalidations included.

   WHAT IS SHOWN. The six most recent closed calls exactly as /api/bias-calls
   returns them (newest first). No filter, no re-sort, no selection by outcome:
   whatever the engine closed last is what appears, invalidated or not.

   WHERE IT COMES FROM. Only that endpoint — live on load, or the same
   endpoint's response baked in at build time so the prerendered HTML carries
   it. Both are the engine's real record, and both hold CLOSED calls only (the
   endpoint emits nothing else), so no active level is ever baked. If the live
   fetch fails, the baked set stays with a note saying it may not be the newest;
   if nothing exists at all, an empty state. Never demo numbers.

   NO AGGREGATE. Outcome recording began in late August 2026, too short a window
   for a rate to mean anything, so none is computed or shown. The engine closes
   a bias for three reasons and each is labelled as itself — there is no "won"
   or "held" state, because the engine never records one. */
const SHOWN = 6

/* Each card is focusable. Hovering it, or focusing it (Tab, or a tap on touch),
   slides its close reason up over the foot of the card — an overlay, so nothing
   around it moves. The reason is the same sentence the status legend uses, and
   it is also the card's accessible description, so a screen reader hears it on
   focus. The data on the card is untouched. */
function Call({ c, i }) {
  const status = statusFromOutcome(c.outcome)
  const s = statusStyle(status)
  const reasonId = `bf-rec-reason-${i}`
  return (
    <Card
      as="li"
      tone="subtle"
      padding="md"
      tabIndex={0}
      aria-label={`${c.direction} ${fmtPair(c.pair)}, ${s.label}, closed ${fmtDate(c.closedAt)}`}
      aria-describedby={reasonId}
      className={`bf-rec-card group relative flex flex-col gap-3 min-w-0 overflow-hidden outline-none ${FOCUS_RING}`}
      style={{ '--i': i }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <DirectionBadge direction={c.direction} size="sm" />
          <span className="text-sm font-semibold text-bf-text tabular-nums">{fmtPair(c.pair)}</span>
        </span>
        {/* One-time "stamp" as the card lands (landing.css, bf-stamp). */}
        <span className="bf-stamp inline-flex shrink-0"><StatusBadge status={status} size="sm" /></span>
      </div>
      <LevelRow pair={c.pair} value={c.invalidationLevel} size="sm" />
      <p className="text-2xs text-bf-muted tabular-nums">
        {c.openedAt ? `Opened ${fmtDate(c.openedAt)} · ` : ''}Closed {fmtDate(c.closedAt)}
      </p>
      <p
        id={reasonId}
        className="bf-rec-reason pointer-events-none absolute inset-x-0 bottom-0 border-t border-white/10 bg-bf-raised px-4 py-2.5 text-2xs leading-relaxed text-bf-text-2 opacity-0 translate-y-2 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none group-hover:opacity-100 group-hover:translate-y-0 group-focus:opacity-100 group-focus:translate-y-0"
      >
        <span className="font-semibold text-bf-text">Why it closed: </span>{s.note}
      </p>
    </Card>
  )
}

export default function TrackRecord() {
  const { calls, ready, source } = useBiasCalls()
  const motion = useMotion()
  const shown = calls.slice(0, SHOWN)
  // The live endpoint could not be reached, so these are the calls saved at the
  // last site build (or on an earlier visit). Still real and still closed, but
  // possibly not the newest — and the section says exactly that.
  const fallback = source === 'fallback' && shown.length > 0

  return (
    <Section id="record" eyebrow="The record" headline="Every closed call stays on the record. The invalidated ones too." wide>
      <Lede>
        Each entry is a real bias the engine closed: pair, direction, invalidation level, close date,
        and why it closed. Nothing is removed.
      </Lede>

      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2" data-reveal>
        {/* Deliberately not "live": these are closed, historical calls, and on a
            fallback they are the set saved at build time. The dates on each card
            carry the timing. */}
        <span className="inline-flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wider text-bf-muted">
          <span className="bf-pulse-slow w-1.5 h-1.5 rounded-full bg-slate-500" aria-hidden="true" />
          Closed calls · engine record
        </span>
        <span className="flex flex-wrap items-center gap-2 text-2xs text-bf-text-2">
          <StatusBadge status="invalidated" size="sm" /> price crossed the level
        </span>
        <span className="flex flex-wrap items-center gap-2 text-2xs text-bf-text-2">
          <StatusBadge status="closed" size="sm" /> withdrawn below the conviction floor
        </span>
        <span className="flex flex-wrap items-center gap-2 text-2xs text-bf-text-2">
          <StatusBadge status="regime_flip" size="sm" /> the macro regime changed
        </span>
      </div>

      {/* Motion: the cards land in turn (landing.css, bf-rec-card). The list itself
          is exactly what the endpoint returned — same calls, same order. */}
      <div ref={motion} className="mt-6" data-reveal>
        {!ready ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading the record">
            {Array.from({ length: SHOWN }, (_, i) => (
              <li key={i} className="h-[132px] rounded-card border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="bf-skeleton h-4 w-32" />
                <div className="bf-skeleton h-3 w-full mt-5" />
                <div className="bf-skeleton h-3 w-24 mt-5" />
              </li>
            ))}
          </ul>
        ) : shown.length === 0 ? (
          source === 'live' ? (
            <EmptyState
              title="No closed calls on record yet."
              message="Calls appear here as the engine closes them — invalidated, withdrawn or reversed."
            />
          ) : (
            <EmptyState
              title="The record could not be loaded right now."
              message="Closed calls are published from the engine's record. Nothing is shown in their place — try again shortly."
            />
          )
        ) : (
          <>
            {fallback && (
              <p className="mb-3 text-2xs leading-relaxed text-bf-warn-soft" role="status">
                The live record couldn&rsquo;t be reached. These are the most recent closed calls
                saved when this page was last updated, so newer ones may be missing.
              </p>
            )}
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((c, i) => <Call key={`${c.pair}-${c.closedAt}`} c={c} i={i} />)}
            </ul>
          </>
        )}
      </div>

      <Card tone="subtle" padding="md" className="mt-6 max-w-[46rem]" data-reveal>
        <p className="text-sm font-semibold text-bf-text">Validation dataset still being built.</p>
        <p className="mt-1.5 text-[13.5px] leading-[1.7] text-bf-text-2">
          Outcome recording began in late August 2026. That is too short a window for a win rate to
          mean anything, so none is published.
        </p>
      </Card>
    </Section>
  )
}
