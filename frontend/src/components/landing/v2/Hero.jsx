import { ArrowRight } from 'lucide-react'
import Button from '../../ui/Button'
import LiveCompass from './LiveCompass'
import EventTicker from './EventTicker'
import { useCompassData } from './useCompassData'

export default function Hero() {
  const compass = useCompassData()

  return (
    <section className="relative px-5 sm:px-8 pt-24 pb-16 sm:pt-28 sm:pb-16 overflow-hidden">
      {/* Ambient wash — hero only, nothing behind any other section. */}
      <div className="bf-ambient" aria-hidden="true" />

      {/* Two columns from lg up: copy left, the product right, both above the
          fold. Stacks to one column below that, copy first. */}
      <div className="relative z-10 mx-auto max-w-6xl grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-12 items-center">
        <div className="bf-hero-copy">
          <p className="bf-eyebrow bf-rise" style={{ '--d': '0ms' }}>
            Trading decision intelligence
          </p>

          <h1 className="bf-h1 mt-5 bf-rise" style={{ '--d': '80ms' }}>
            Know the direction before you take the trade.
          </h1>

          <p className="bf-body mt-6 max-w-[38rem] bf-rise" style={{ '--d': '160ms' }}>
            BiasForge reads the economic calendar, scored newsflow, CFTC positioning, cross-asset
            flows and yields against live price, and turns them into one thesis per pair — with
            the level that proves it wrong.
          </p>

          <p className="mt-4 text-[14px] text-bf-muted max-w-[38rem] bf-rise" style={{ '--d': '200ms' }}>
            Macro bias for prop firm and funded forex traders. Seven major pairs and gold.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3 bf-rise" style={{ '--d': '240ms' }}>
            <Button href="/login" size="lg" iconRight={<ArrowRight size={16} aria-hidden="true" />}>
              Create free account
            </Button>
            <Button href="#framework" variant="secondary" size="lg">
              How it works
            </Button>
          </div>
        </div>

        {/* min-w-0: a grid item defaults to min-width:auto, which let the card
            row's intrinsic width force this track wider than a phone screen. */}
        <div className="bf-rise lg:pt-2 min-w-0" style={{ '--d': '400ms' }}>
          <LiveCompass {...compass} />
          {/* Real upcoming events, so it is labelled live — never "Demo data". */}
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-0 sm:gap-3 min-w-0">
            <span className="shrink-0 inline-flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wider text-bf-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-bf-accent" aria-hidden="true" />
              Live · economic calendar
            </span>
            <div className="min-w-0 flex-1">
              <EventTicker />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
