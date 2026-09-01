import { Section, Lede, Screenshot } from './Section'

/* Section 6b — the three input surfaces, large enough to actually read.

   These were Section 6 thumbnails and were illegible there. Here each is
   cropped to a band of its interface rather than the whole page, which does two
   things: it keeps the tiles a sane height (a full-page crop of the strength
   page is 3418px tall and would drop a 1280x1700 slab into the middle of the
   page) and it raises the render scale to roughly 1:1 with the original CSS
   pixels, which is the point at which the interface stops being a texture and
   starts being readable.

   Layout: the calendar and strength crops share a 1.25 aspect and pair cleanly
   side by side. COT goes full width beneath because its net-positioning chart is
   a row of horizontal bars — the one surface here that genuinely reads better
   wide than tall. A three-row stack was the alternative and looked repetitive:
   three near-identical slabs with nothing to break the rhythm. */
export default function Inputs() {
  return (
    <Section eyebrow="The inputs" headline="The reads behind the bias." wide>
      <Lede>
        The calendar, institutional positioning and currency strength that feed every
        directional call — each one readable on its own, not buried in a summary.
      </Lede>

      {/* The whole block bleeds, not each frame: inside the 1152px text column the
          pair rendered at 568px each, 0.89x of the app's own CSS pixels — under
          1:1, which is exactly where an interface stops being readable. Bled to
          1280 they land at 632px, essentially 1:1. */}
      <div className="mt-16 sm:mt-20 w-[min(100vw-2.5rem,80rem)] ml-[calc(50%-min(50vw-1.25rem,40rem))]">
        <div className="grid md:grid-cols-2 gap-4">
          <Screenshot
            src="/screens/04-calendar.png"
            srcW={5120} srcH={2546}
            crop={{ x: 29.7, y: 6.5, w: 50, h: 80.5 }}
            alt="BiasForge economic calendar listing high-impact forex events for funded traders, with forecast and previous figures and a countdown to each release"
          />
          <Screenshot
            src="/screens/06-strength.png"
            srcW={5120} srcH={3736}
            crop={{ x: 29.7, y: 6.5, w: 50, h: 54.9 }}
            alt="BiasForge currency strength page ranking the major currencies from strongest to weakest, so a trader can see which is leading the session"
          />
        </div>

        <div className="mt-4">
          <Screenshot
            src="/screens/07-cot.png"
            srcW={5120} srcH={3766}
            crop={{ x: 29.7, y: 6.5, w: 50, h: 42.5 }}
            alt="BiasForge COT report showing net institutional positioning per currency from the weekly CFTC release, with the widest positioning gap called out"
          />
        </div>
      </div>
    </Section>
  )
}
