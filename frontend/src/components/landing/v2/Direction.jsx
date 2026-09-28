import { Section, Lede } from './Section'
import BiasShowcase from './BiasShowcase'

/* The framework — Direction, Evidence, Invalidation.

   The product's identity in one section: the three questions every published
   bias answers, numbered to match the markers on the card beside them. The
   file keeps its old name; it was the Direction section and grew into this. */
const COLUMNS = [
  {
    n: 1,
    title: 'Direction',
    body: 'Which way the macro evidence leans on this pair: buy, sell, or no call.',
  },
  {
    n: 2,
    title: 'Evidence',
    body: 'Why. A written thesis, a conviction score, and which components agree — macro, order flow, sentiment.',
  },
  {
    n: 3,
    title: 'Invalidation',
    body: 'The price where the thesis is wrong. Cross it and the bias closes. It is not moved or defended.',
  },
]

export default function Direction() {
  return (
    <Section id="framework" eyebrow="The framework" headline="Direction. Evidence. Invalidation." wide>
      <Lede>Every bias BiasForge publishes answers three questions, in this order.</Lede>

      <div className="mt-12 sm:mt-14 grid gap-10 lg:gap-14 items-start lg:grid-cols-[minmax(0,32rem)_1fr]">
        <div data-reveal>
          <BiasShowcase />
          <p className="mt-3 text-2xs leading-relaxed text-bf-muted">
            Demo data. Conviction measures agreement among the evidence, not a probability of profit.
          </p>
        </div>

        <ol className="grid gap-8 sm:grid-cols-3 lg:grid-cols-1">
          {COLUMNS.map(c => (
            <li key={c.title} data-reveal>
              <h3 className="flex items-center gap-2.5 text-[15px] font-semibold text-bf-text">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-bf-accent/40 text-2xs text-bf-accent tabular-nums" aria-hidden="true">
                  {c.n}
                </span>
                {c.title}
              </h3>
              <p className="mt-2.5 text-[14.5px] leading-[1.7] text-bf-text-2">{c.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  )
}
