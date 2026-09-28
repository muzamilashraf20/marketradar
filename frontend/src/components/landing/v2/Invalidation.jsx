import { useSyncExternalStore } from 'react'
import { Section, Lede } from './Section'
import Card from '../../ui/Card'
import DirectionBadge from '../../ui/DirectionBadge'
import StatusBadge from '../../ui/StatusBadge'
import LevelRow from '../../ui/LevelRow'
import { fmtPair, fmtLevel } from '../../ui/format'
import DemoTag from './DemoTag'
import { DEMO_INVALIDATION } from './demoData'
import { useMotion } from './useMotion'

/* Every thesis needs a point of failure.

   The same demo bias (USD/CAD BUY) twice — live, then after price crosses its level — with a
   price chart between them. Static (no JavaScript, reduced motion, or before
   the section is scrolled to) the chart is fully drawn with the crossing
   marked, and both cards read as they always have.

   With motion, the loop tells it in order: price moves toward the dashed
   level, crosses it, the level flashes and the live card's status flips from
   ACTIVE to INVALIDATED while the recorded card lights up; then it resets and
   runs again, slowly, for as long as the section is on screen. Timing lives in
   landing.css (bf-inv-*). The crossing is at exactly 46% of the loop because
   the line is drawn linearly and the path meets the level 80% of the way along
   it — change the path and that number has to be recomputed.

   Both cards and the chart are demo data. */
const BIAS = DEMO_INVALIDATION

/* The price path, drawn for a SELL: price rises into a level near the top.
   A BUY is wrong BELOW its level, so for a BUY the same path is mirrored
   top-to-bottom and price falls through a level near the bottom. Mirroring
   keeps every segment the same length, so the crossing is still 80% of the way
   along the path and the 46% timing in landing.css still holds. */
const SELL_POINTS = [[8, 104], [28, 96], [44, 100], [62, 84], [78, 88], [98, 70], [114, 74], [134, 56], [148, 60], [166, 34], [182, 28], [200, 22], [212, 18]]
const H = 120
const IS_BUY = BIAS.direction === 'BUY'
const POINTS = IS_BUY ? SELL_POINTS.map(([x, y]) => [x, H - y]) : SELL_POINTS
const PRICE_PATH = 'M' + POINTS.map(p => p.join(' ')).join(' L')
const LEVEL_Y = IS_BUY ? H - 34 : 34
const CROSS = { x: 166, y: LEVEL_Y }
// The level's label sits at the LEFT end of its line, just above it. Price
// crosses and finishes on the right, and starts far from the level on the
// left — so for either direction the label never collides with the line.
const LABEL_Y = LEVEL_Y - 6

// true in the browser, false in the prerender. The flipped badge only exists
// once the page is running, so the static HTML never carries hidden text.
const noopSubscribe = () => () => {}
const useIsClient = () => useSyncExternalStore(noopSubscribe, () => true, () => false)

function PriceChart({ level, side }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-1 md:px-1 text-center">
      <svg
        viewBox="0 0 220 120"
        className="w-full max-w-[240px] md:w-[180px] overflow-visible"
        role="img"
        aria-label={`Illustration: price moving ${side} the invalidation level at ${level}`}
      >
        <line
          className="bf-inv-line"
          x1="0" x2="220" y1={LEVEL_Y} y2={LEVEL_Y}
          stroke="#fb7185" strokeWidth="1.25" strokeDasharray="4 4"
        />
        <text x="2" y={LABEL_Y} textAnchor="start" fill="#fb7185" fontSize="10" className="tabular-nums">
          {level}
        </text>
        <path
          className="bf-inv-path"
          d={PRICE_PATH}
          pathLength="100"
          fill="none"
          stroke="#cbd5e1"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray="100"
        />
        <g className="bf-inv-hit">
          <circle cx={CROSS.x} cy={CROSS.y} r="9" fill="none" stroke="#fb7185" strokeWidth="1.25" opacity="0.6" />
          <circle cx={CROSS.x} cy={CROSS.y} r="3.5" fill="#fb7185" />
        </g>
      </svg>
      <p className="text-2xs font-medium text-bf-text-2 md:max-w-[11rem]">
        Price trades {side} <span className="tabular-nums text-bf-bear-soft">{level}</span>
      </p>
    </div>
  )
}

export default function Invalidation() {
  const level = fmtLevel(BIAS.pair, BIAS.invalidationLevel)
  const side = BIAS.direction === 'SELL' ? 'above' : 'below'
  const isClient = useIsClient()
  const motion = useMotion({ loop: true })

  return (
    <Section id="invalidation" eyebrow="Invalidation" headline="Every thesis needs a point of failure." wide>
      <Lede>
        A direction without a failure point can&rsquo;t be tested. Each bias is published with the
        level that proves it wrong, set from the pair&rsquo;s recent volatility when the bias opens.
      </Lede>

      <div ref={motion} className="mt-10 sm:mt-12 flex flex-col md:flex-row md:items-stretch gap-3 md:gap-4" data-reveal>
        <Card as="article" tone="default" padding="md" className="bf-inv-live flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            {/* The flip: ACTIVE, then INVALIDATED once price crosses. The second
                badge sits on top of the first and is decorative — the real
                INVALIDATED state is the card on the right. */}
            <span className="relative inline-flex">
              <span className="bf-inv-chip-a inline-flex"><StatusBadge status="active" /></span>
              {isClient && (
                <span className="bf-inv-chip-b absolute left-0 top-0 inline-flex" aria-hidden="true">
                  <StatusBadge status="invalidated" />
                </span>
              )}
            </span>
            <DemoTag />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <DirectionBadge direction={BIAS.direction} />
            <span className="text-sm font-semibold text-bf-text tabular-nums">{fmtPair(BIAS.pair)}</span>
          </div>
          <p className="mt-3 text-2xs uppercase tracking-wider text-bf-muted">Thesis</p>
          <p className="mt-1 text-sm leading-relaxed text-bf-text-2">{BIAS.thesis}</p>
          <Card tone="invalidation" padding="sm" className="mt-4">
            <LevelRow pair={BIAS.pair} value={BIAS.invalidationLevel} note={`Wrong ${side} this level.`} />
          </Card>
        </Card>

        <PriceChart level={level} side={side} />

        <Card as="article" tone="default" padding="md" className="bf-inv-record relative flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <StatusBadge status="invalidated" />
            <DemoTag />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <DirectionBadge direction={BIAS.direction} />
            <span className="text-sm font-semibold text-bf-text tabular-nums">{fmtPair(BIAS.pair)}</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-bf-text-2">
            Bias closed at <span className="tabular-nums text-bf-bear-soft">{level}</span>.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-bf-text">Recorded, not deleted.</p>
        </Card>
      </div>

      <p className="mt-8 max-w-[46rem] text-[14.5px] leading-[1.7] text-bf-text-2" data-reveal>
        When price crosses the level, the bias closes and the closure goes on the public record with
        its reason. Nothing is quietly moved.
      </p>
    </Section>
  )
}
