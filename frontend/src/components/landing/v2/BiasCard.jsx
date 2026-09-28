import Card from '../../ui/Card'
import DirectionBadge from '../../ui/DirectionBadge'
import StatusBadge from '../../ui/StatusBadge'
import ConvictionMeter from '../../ui/ConvictionMeter'
import LevelRow from '../../ui/LevelRow'
import { CHIP_BASE, CHIP_SIZE, TIMING_STYLE } from '../../ui/styles'
import { fmtPair } from '../../ui/format'
import EvidenceList from './EvidenceList'
import { useMotion } from './useMotion'

/* One bias in the hero's compass panel, built from the design system so it
   reads exactly like the product.

   The grade and timing colours, the conviction scale and the level precision
   all come from ui/styles.js and ui/format.js — the single copies — rather than
   the local maps this file used to carry.

   A FLAT row is rendered as a no call, not hidden: the reason and the way each
   component leans are the whole point of showing it. */
export default function BiasCard({ row }) {
  const isFlat = row.direction !== 'BUY' && row.direction !== 'SELL'
  // Conviction fills and the evidence rows are read in, on arrival. See useMotion.
  const motion = useMotion()

  return (
    <Card as="li" ref={motion} tone="subtle" padding="none" className="p-4 flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold tracking-tight text-bf-text tabular-nums">{fmtPair(row.pair)}</h3>
        <StatusBadge status={isFlat ? 'no_call' : 'active'} size="sm" />
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <DirectionBadge direction={row.direction} variant="text" size="md" />
        {!isFlat && row.entryTiming && (
          <span className={`${CHIP_BASE} ${CHIP_SIZE.sm} ${TIMING_STYLE[row.entryTiming] || TIMING_STYLE.FRESH}`}>
            {row.entryTiming}
          </span>
        )}
      </div>

      {isFlat ? (
        <>
          <p className="mt-3 text-2xs leading-relaxed text-bf-text-2">
            {row.noBiasReason || 'Evidence is mixed. No directional thesis is being forced.'}
          </p>
          <EvidenceList components={row.components} className="mt-3 pt-3 border-t border-white/[0.06]" />
        </>
      ) : (
        <>
          <ConvictionMeter value={row.confidence} grade={row.grade} size="sm" className="mt-3" />
          {row.thesis && (
            <p className="mt-3 text-2xs leading-relaxed text-bf-text-2 line-clamp-3">{row.thesis}</p>
          )}
          <EvidenceList components={row.components} className="mt-3 pt-3 border-t border-white/[0.06]" />
          <div className="mt-auto pt-3">
            <Card tone="invalidation" padding="sm">
              <LevelRow
                pair={row.pair}
                value={row.invalidationLevel}
                size="sm"
                note={`Wrong ${row.direction === 'SELL' ? 'above' : 'below'} this level.`}
              />
            </Card>
          </div>
        </>
      )}
    </Card>
  )
}
