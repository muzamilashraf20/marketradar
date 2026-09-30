import { ArrowRight } from 'lucide-react'
import { Section, Lede } from './Section'
import Button from '../../ui/Button'
import { PRICING_HREF, toPricing } from './toPricing'

/* The closing ask. The file keeps its old name; it was the signal-vs-compass
   comparison, which the Workflow section now makes without naming signals.

   No checkout here. Card and crypto payment live only in the pricing section,
   with their links unchanged; this sends people to that section. */
export default function CompassVsSignal() {
  return (
    <Section id="get-started" eyebrow="Get started" headline="Start with today's thesis.">
      <Lede>Direction, evidence and invalidation for seven major pairs and gold, on one screen.</Lede>

      <div className="mt-8 flex flex-wrap items-center gap-3" data-reveal>
        <Button href={PRICING_HREF} onClick={toPricing} size="lg" iconRight={<ArrowRight size={16} aria-hidden="true" />}>
          Get BiasForge Pro
        </Button>
        <Button href="#pricing" variant="secondary" size="lg">
          View pricing
        </Button>
      </div>
    </Section>
  )
}
