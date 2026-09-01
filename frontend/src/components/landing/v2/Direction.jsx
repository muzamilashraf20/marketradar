import { Section, Lede, Ref, Shot } from './Section'

/* Native size of 02-bias-card.png as it sits on disk.

   The card is rendered at or below this and never stretched: upscaling the one
   image the page leans hardest on only makes it soft. Everything that depends on
   the width — the grid track, the figure's cap, the img attributes — reads this,
   so a higher-resolution recapture is a two-number change here.

   When those numbers change the overlay below must be rescanned: a different
   crop has a different aspect, so the block does not land at the same percentage. */
const CARD = { w: 317, h: 437 }

const COLUMNS = [
  {
    title: 'Direction',
    body: 'Which way the macro evidence leans on this pair, and the reasoning behind it in plain English.',
  },
  {
    title: 'Conviction',
    body: "How much of the evidence lines up behind that direction, and how much of the day's range is still unspent. Not a probability of profit.",
  },
  {
    title: 'Invalidation',
    body: 'The price level at which this bias is no longer valid. Cross it and the bias is closed, not defended.',
  },
]

/* Section 3 — the differentiating section, and the one given the most space. */
export default function Direction() {
  return (
    <Section id="features" eyebrow="A compass, not a signal button" headline="Every bias comes with the level where it's wrong." wide>
      <Lede>
        A signal tells you where to buy and where to stop, and leaves you nothing to think
        about. A <Ref href="/blog/what-is-market-bias">macro bias</Ref> tells you which way the
        fundamentals lean and exactly where that reasoning breaks. You still take your own entries
        — with a reason behind the direction and a hard line under it.
      </Lede>

      {/* The single most important image on the page — the one asset showing what
          nobody else publishes. The capture is 601px wide natively. Rendering it at 896px cost real
          sharpness on the one image the page leans hardest on, so it is capped at
          its native width and the three columns move alongside it instead of
          below. A portrait card beside its own explanation reads better than a
          soft one stretched across the column anyway. */}
      <div
        className="mt-16 sm:mt-20 grid gap-10 lg:gap-14 items-start lg:grid-cols-[var(--bf-card-w)_1fr]"
        style={{ '--bf-card-w': `${CARD.w}px` }}
      >
        <figure className="relative w-full" style={{ maxWidth: CARD.w }} data-reveal>
        <Shot
          src="/screens/02-bias-card.png"
          alt="BiasForge bias card for a forex pair, expanded to show the directional macro read, the conviction score and the invalidation level where the bias is closed"
          width={CARD.w}
          height={CARD.h}
          reveal={false}
        />

        {/* Calls out the invalidation block on the card itself.

            Measured by scanning the capture for the block's rose border, not
            guessed. On the first crop (317x437) it ran y 329-389 / x 18-298 =
            75.3% down, 14.0% tall, 5.7% inset. The placeholder values had it at
            62% — a third of the card too high — with the label at 76%, sitting
            directly on the box it labels.

            Percentages, so it tracks the image at every width. */}
        <div
          className="absolute pointer-events-none"
          style={{ left: '5.5%', right: '5.5%', top: '75.3%', height: '14%' }}
          aria-hidden="true"
        >
          <div className="rounded-md border border-cyan-400/70 bg-cyan-400/[0.07] w-full h-full" />
        </div>
          <figcaption
            className="absolute right-[5.5%] top-[90.8%] bf-pill bg-[#030712] bf-hairline px-2.5 py-1 text-[10.5px] font-medium text-cyan-400 whitespace-nowrap"
            style={{ borderColor: 'rgba(6,182,212,0.4)' }}
          >
            The invalidation level
          </figcaption>
        </figure>

        <div className="grid gap-8 sm:grid-cols-3 lg:grid-cols-1">
          {COLUMNS.map(c => (
            <div key={c.title}>
              <h3 className="text-[15px] font-medium text-slate-100">{c.title}</h3>
              <p className="mt-2.5 text-[14.5px] leading-[1.7] text-slate-400">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}
