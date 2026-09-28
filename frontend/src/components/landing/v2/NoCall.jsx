import { Section, Lede } from './Section'
import EventBrief from './EventBrief'

/* No call, shown as a feature.

   Every tool in this category manufactures a call on everything. Showing the
   engine declining to lean on a high-impact print is the most credible output
   the product has. The brief is labelled demo data like every other panel. */
export default function NoCall() {
  return (
    <Section id="no-call" eyebrow="No call" headline="When the evidence is mixed, BiasForge says so." wide>
      <Lede>
        It won&rsquo;t force a direction to fill a screen. A pair stays flat when its components
        disagree, when the edge is below the threshold, or when the day&rsquo;s range is already
        spent. Here is what that looks like when the engine declines to call a high-impact print.
      </Lede>

      <div className="mt-8 sm:mt-10 max-w-[46rem]" data-reveal>
        <EventBrief />
      </div>
    </Section>
  )
}
