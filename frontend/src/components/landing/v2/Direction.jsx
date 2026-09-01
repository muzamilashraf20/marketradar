import { Section, Lede, Ref, Shot } from './Section'

/* Native size of 02-bias-card.png as it sits on disk.

   The card is rendered at or below this and never stretched: upscaling the one
   image the page leans hardest on only makes it soft. Everything that depends on
   the width — the grid track, the figure's cap, the img attributes — reads this,
   so a higher-resolution recapture is a two-number change here.

   When those numbers change the overlay below must be rescanned: a different
   crop has a different aspect, so the block does not land at the same percentage. */
const CARD = { w: 600, h: 792 }

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
      {/* minmax(0, CARD.w) rather than a fixed track: at the lg breakpoint a rigid
          600px column left the text 304px and could not give way. The card scales
          down instead, and the overlay is in percent so it follows without any
          further arithmetic. */}
      <div
        className="mt-16 sm:mt-20 grid gap-10 lg:gap-14 items-start lg:grid-cols-[minmax(0,var(--bf-card-w))_1fr]"
        style={{ '--bf-card-w': `${CARD.w}px` }}
      >
        <figure className="relative w-full max-w-full" style={{ maxWidth: CARD.w }} data-reveal>
        <Shot
          src="/screens/02-bias-card.png"
          alt="BiasForge bias card for a forex pair, expanded to show the directional macro read, the conviction score and the invalidation level where the bias is closed"
          width={CARD.w}
          height={CARD.h}
          reveal={false}
          className="bf-screen"
        />

        {/* Calls out the invalidation block on the card itself.

            Measured by scanning the capture for the block's rose border, not
            guessed — and rescanned on every recapture, because each crop has had
            a different aspect and the block has not landed twice in the same
            place. On this one (600x792) it runs y 658-780 / x 20-580: 83.1%
            down, 15.5% tall, ~3.3% inset. That bottom edge is 98.6% of the
            image, so the label sits ABOVE the block rather than under it.

            Percentages, so it tracks the image at every width. */}
        <div
          className="absolute pointer-events-none"
          style={{ left: '3.3%', right: '3.2%', top: '83.1%', height: '15.5%' }}
          aria-hidden="true"
        >
          <div className="rounded-md border border-cyan-400/70 bg-cyan-400/[0.07] w-full h-full" />
        </div>
          <figcaption className="mt-3 flex items-center gap-2 text-[12.5px] text-cyan-400">
            <span className="inline-block w-6 h-px bg-cyan-400/70 shrink-0" aria-hidden="true" />
            The invalidation level — the price that closes this bias
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
