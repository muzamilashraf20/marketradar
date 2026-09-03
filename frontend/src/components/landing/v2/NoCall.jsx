import { Section, Lede } from './Section'
import EventBrief from './EventBrief'

/* Section 7.

   This replaced the track-record shell. That section was built to hold
   performance stats and hidden behind a flag, because real outcome recording
   only started on 28 Aug 2026 and there was not enough of it to publish. The
   stats can come back here once there is — but this makes the same argument
   now, with something already true.

   Every tool in this category manufactures a call on everything. Showing the
   engine declining to lean, on a real high-impact print, is the most credible
   output the product has. */
export default function NoCall() {
  return (
    <Section eyebrow="Honest output" headline="Sometimes the answer is no call." wide>
      <Lede>
        When the evidence genuinely splits, BiasForge says so instead of manufacturing a
        direction. A bias you can&rsquo;t trust is worse than no bias.
      </Lede>

      {/* The brief itself, rendered. It was the page's last screenshot: a
          952px modal shown at 460px wide, which put the reasoning at half
          size — and the reasoning is what the section rests on. */}
      <div className="mt-8 sm:mt-10 max-w-[46rem]" data-reveal>
        <EventBrief />
      </div>
    </Section>
  )
}
