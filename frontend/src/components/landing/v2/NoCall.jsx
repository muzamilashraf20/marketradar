import { Section, Lede, Screenshot } from './Section'

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

      {/* max-w-4xl, not the full bleed the app captures get: this one is a 952px
          modal, so 896px renders it at 0.94x — still sharp. Bleeding it to 1280
          would upscale it 1.35x and undo the point. */}
      <div className="mt-16 sm:mt-20 max-w-4xl">
        <Screenshot
          src="/screens/08-no-call.png"
          srcW={952} srcH={821}
          crop={{ x: 0, y: 0, w: 98.3, h: 100 }}
          alt="BiasForge event brief for a high-impact US economic calendar print, reporting that the macro evidence is split and declining to publish a directional bias"
        />
      </div>
    </Section>
  )
}
