import DirectionBadge from '../../ui/DirectionBadge'
import StatusBadge from '../../ui/StatusBadge'
import ConvictionMeter from '../../ui/ConvictionMeter'
import LevelRow from '../../ui/LevelRow'
import Card from '../../ui/Card'
import EmptyState from '../../ui/EmptyState'
import { CHIP_BASE, CHIP_SIZE, TIMING_STYLE } from '../../ui/styles'
import { fmtPair, fmtLevel } from '../../ui/format'
import DemoTag from './DemoTag'
import EvidenceList from './EvidenceList'
import { useCompassData } from './useCompassData'

/* A numbered marker tying a block of the card to its explanation beside it.
   The numbers match the three columns in Direction.jsx. */
function Marker({ n, children }) {
  return (
    <p className="flex items-center gap-2 text-3xs font-semibold uppercase tracking-wider text-bf-accent">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-bf-accent/40 tabular-nums" aria-hidden="true">
        {n}
      </span>
      {children}
    </p>
  )
}

/* The bias card at full size, annotated with the framework.

   Rendered from the same demo row as the hero, through the design system's
   components, so it is the product's card rather than a picture of it. The
   conviction is drawn on the engine's 40–92 scale; it used to read "/100",
   which is the scale the engine does not use and the one that gets misread as
   a probability.

   No overflow-hidden on the frame, so the conviction tooltip is never clipped. */
export default function BiasShowcase() {
  const { rows, ready } = useCompassData()
  const row = rows.find(r => r.isHeadline && r.direction !== 'FLAT') || null

  if (!ready || !row) {
    return (
      <EmptyState
        title="No pair clears the bar."
        message="When the macro evidence is not strong enough, the engine holds rather than publishing a read it does not have."
      />
    )
  }

  const level = fmtLevel(row.pair, row.invalidationLevel)
  const side = row.direction === 'SELL' ? 'above' : 'below'

  return (
    <article className="bf-card shadow-[0_24px_70px_-30px_rgba(0,0,0,0.95)]" aria-label={`Example bias: ${row.direction} ${fmtPair(row.pair)}`}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3.5 bf-hairline-b">
        <h3 className="text-[17px] font-bold tracking-tight text-bf-text tabular-nums">{fmtPair(row.pair)}</h3>
        <DemoTag />
      </div>

      <div className="p-5 space-y-6">
        <div>
          <Marker n={1}>Direction</Marker>
          <div className="mt-3 flex items-center gap-2.5 flex-wrap">
            <DirectionBadge direction={row.direction} variant="text" size="lg" />
            <StatusBadge status="active" size="sm" />
            {row.entryTiming && (
              <span className={`${CHIP_BASE} ${CHIP_SIZE.sm} ${TIMING_STYLE[row.entryTiming] || TIMING_STYLE.FRESH}`}>
                {row.entryTiming}
              </span>
            )}
          </div>
        </div>

        <div>
          <Marker n={2}>Evidence</Marker>
          <ConvictionMeter value={row.confidence} grade={row.grade} size="md" scale className="mt-3" />
          {row.thesis && <p className="mt-4 text-sm leading-relaxed text-slate-300">{row.thesis}</p>}
          <EvidenceList components={row.components} size="md" className="mt-4 pt-4 border-t border-white/[0.06]" />
        </div>

        {level && (
          <div>
            <Marker n={3}>Invalidation</Marker>
            <Card
              tone="invalidation"
              padding="md"
              className="mt-3 ring-2 ring-bf-accent/60 ring-offset-2 ring-offset-bf-surface"
            >
              <LevelRow
                pair={row.pair}
                value={row.invalidationLevel}
                size="lg"
                note={`A move ${side} ${level} closes this bias. It is not moved or defended.`}
              />
            </Card>
          </div>
        )}
      </div>
    </article>
  )
}
