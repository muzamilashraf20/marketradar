import { ArrowRight, ArrowDown } from 'lucide-react'
import { Section, Lede } from './Section'
import Card from '../../ui/Card'
import DirectionBadge from '../../ui/DirectionBadge'
import StatusBadge from '../../ui/StatusBadge'
import LevelRow from '../../ui/LevelRow'
import { fmtPair, fmtLevel } from '../../ui/format'
import DemoTag from './DemoTag'
import { DEMO_BIASES } from './demoData'

/* Every thesis needs a point of failure.

   The same demo bias twice: live, then after price crosses its level. The
   second card is the part no signal service shows — the call closing against
   itself, recorded rather than removed. Both cards are demo data and say so. */
const BIAS = DEMO_BIASES.find(r => r.direction === 'SELL' || r.direction === 'BUY')

function StateCard({ status, children }) {
  return (
    <Card as="article" tone="default" padding="md" className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge status={status} />
        <DemoTag />
      </div>
      {children}
    </Card>
  )
}

export default function Invalidation() {
  const level = fmtLevel(BIAS.pair, BIAS.invalidationLevel)
  const side = BIAS.direction === 'SELL' ? 'above' : 'below'

  return (
    <Section id="invalidation" eyebrow="Invalidation" headline="Every thesis needs a point of failure." wide>
      <Lede>
        A direction without a failure point can&rsquo;t be tested. Each bias is published with the
        level that proves it wrong, set from the pair&rsquo;s recent volatility when the bias opens.
      </Lede>

      <div className="mt-10 sm:mt-12 flex flex-col md:flex-row md:items-stretch gap-3 md:gap-4" data-reveal>
        <StateCard status="active">
          <div className="mt-4 flex items-center gap-2">
            <DirectionBadge direction={BIAS.direction} />
            <span className="text-sm font-semibold text-bf-text tabular-nums">{fmtPair(BIAS.pair)}</span>
          </div>
          <p className="mt-3 text-2xs uppercase tracking-wider text-bf-muted">Thesis</p>
          <p className="mt-1 text-sm leading-relaxed text-bf-text-2">
            The dollar&rsquo;s rate and positioning edge over sterling holds.
          </p>
          <Card tone="invalidation" padding="sm" className="mt-4">
            <LevelRow pair={BIAS.pair} value={BIAS.invalidationLevel} note={`Wrong ${side} this level.`} />
          </Card>
        </StateCard>

        {/* The move that ends it. Down on a phone, across from md up. */}
        <div className="flex md:flex-col items-center justify-center gap-2 py-1 md:px-1 text-center">
          <ArrowDown size={16} className="text-bf-bear-soft md:hidden" aria-hidden="true" />
          <ArrowRight size={16} className="text-bf-bear-soft hidden md:block" aria-hidden="true" />
          <p className="text-2xs font-medium text-bf-text-2 md:max-w-[9rem]">
            Price trades {side} <span className="tabular-nums text-bf-bear-soft">{level}</span>
          </p>
        </div>

        <StateCard status="invalidated">
          <div className="mt-4 flex items-center gap-2">
            <DirectionBadge direction={BIAS.direction} />
            <span className="text-sm font-semibold text-bf-text tabular-nums">{fmtPair(BIAS.pair)}</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-bf-text-2">
            Bias closed at <span className="tabular-nums text-bf-bear-soft">{level}</span>.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-bf-text">Recorded, not deleted.</p>
        </StateCard>
      </div>

      <p className="mt-8 max-w-[46rem] text-[14.5px] leading-[1.7] text-bf-text-2" data-reveal>
        When price crosses the level, the bias closes and the closure goes on the public record with
        its reason. Nothing is quietly moved.
      </p>
    </Section>
  )
}
