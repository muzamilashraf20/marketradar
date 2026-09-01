import { Section, Lede, Ref, Shot } from './Section'

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

      {/* The single most important image on the page, so it runs larger than
          every other screenshot and sits alone rather than in a grid. */}
      <figure className="mt-16 sm:mt-20 relative max-w-4xl">
        <Shot
          src="/screens/02-bias-card.png"
          alt="BiasForge bias card for a forex pair, expanded to show the directional macro read, the conviction score and the invalidation level where the bias is closed"
          width={1600}
          height={1000}
        />

        {/* Calls out the invalidation line on the card itself. Positioned in
            percentages so it tracks the image at every width. Nudge these two
            numbers when the real capture replaces the placeholder. */}
        <div
          className="absolute pointer-events-none"
          style={{ left: '6%', right: '6%', top: '62%' }}
          aria-hidden="true"
        >
          <div className="rounded-md border border-cyan-400/70 bg-cyan-400/[0.07] h-[13%] min-h-[26px]" />
        </div>
        <figcaption
          className="absolute right-[4%] top-[76%] bf-pill bg-[#030712] bf-hairline px-2.5 py-1 text-[10.5px] font-medium text-cyan-400 whitespace-nowrap"
          style={{ borderColor: 'rgba(6,182,212,0.4)' }}
        >
          The invalidation level
        </figcaption>
      </figure>

      <div className="mt-16 grid sm:grid-cols-3 gap-x-10 gap-y-10">
        {COLUMNS.map(c => (
          <div key={c.title}>
            <h3 className="text-[15px] font-medium text-slate-100">{c.title}</h3>
            <p className="mt-2.5 text-[14.5px] leading-[1.7] text-slate-400">{c.body}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}
