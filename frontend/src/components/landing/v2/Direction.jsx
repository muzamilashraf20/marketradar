import { Section, Lede, Ref } from './Section'
import BiasShowcase from './BiasShowcase'

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
    <Section id="features" eyebrow="Direction and invalidation" headline="Every bias comes with the level where it's wrong." wide>
      <Lede>
        Being handed a buy price and a stop leaves you nothing to think
        about. A <Ref href="/blog/what-is-market-bias">macro bias</Ref> tells you which way the
        fundamentals lean and exactly where that reasoning breaks. You still take your own entries
        — with a reason behind the direction and a hard line under it.
      </Lede>

      {/* The live card, beside its own explanation.

          This was a screenshot until it wasn't. The capture had to be cropped in
          two bands to fit the section, which left the card looking cut in half,
          and the cyan box marking the invalidation level was positioned by
          measuring percentages off the image — so it drifted every time the
          screenshot was retaken. Rendering the real card removed both problems
          at once: nothing is cropped, and the marker is a class on the element
          it marks. */}
      <div className="mt-12 sm:mt-14 grid gap-10 lg:gap-14 items-start lg:grid-cols-[minmax(0,32rem)_1fr]">
        <div data-reveal>
          <BiasShowcase />
        </div>

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
