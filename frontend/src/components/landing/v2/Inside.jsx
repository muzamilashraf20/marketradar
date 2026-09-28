import { Section, Lede } from './Section'
import Card from '../../ui/Card'
import DataFlow from './DataFlow'

/* How it works — the five real inputs and the three steps between them and a
   published bias.

   Every claim here is the engine's actual behaviour (biasEngineV2): each pair's
   bias is the score difference between its two currencies, a bias opens only
   past a threshold and not once the day's range is spent, the level comes from
   volatility, and a model writes the thesis text only.

   No update interval is stated. The cycle length is an environment setting in
   production and can change without a deploy, so the copy describes it rather
   than quoting a number that could quietly become false. */
const STEPS = [
  {
    n: 1,
    title: 'Score',
    body: "Each currency is scored on macro, order flow and sentiment. A pair's bias is the difference between the two sides of the pair.",
  },
  {
    n: 2,
    title: 'Qualify',
    body: "A bias opens only when that difference clears the engine's threshold. Below it, or when most of the day's range is already spent, the pair stays flat.",
  },
  {
    n: 3,
    title: 'Publish',
    body: 'The invalidation level is set from recent volatility, and an AI model writes the thesis in plain English. The engine updates through the trading session, and re-reads sooner when a major headline lands.',
  },
]

export default function Inside() {
  return (
    <Section id="how-it-works" eyebrow="How it works" headline="Five inputs. One thesis per pair." wide>
      <Lede>
        Live price, the economic calendar, scored newsflow, CFTC positioning, and cross-asset flows
        including yields are read together for seven major pairs and gold.
      </Lede>

      <div className="mt-12 sm:mt-14">
        <DataFlow />
      </div>

      <ol className="mt-12 grid gap-3 md:grid-cols-3">
        {STEPS.map(s => (
          <Card as="li" key={s.title} tone="subtle" padding="md" data-reveal>
            <h3 className="flex items-center gap-2.5 text-[15px] font-semibold text-bf-text">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-bf-accent/40 text-2xs text-bf-accent tabular-nums" aria-hidden="true">
                {s.n}
              </span>
              {s.title}
            </h3>
            <p className="mt-2.5 text-[14px] leading-[1.7] text-bf-text-2">{s.body}</p>
          </Card>
        ))}
      </ol>

      <p className="mt-8 max-w-[46rem] text-[13.5px] leading-[1.7] text-bf-muted" data-reveal>
        Currency Strength is in the dashboard as a viewer. It is not an engine input: it lags price,
        so it would only repeat what the chart already shows.
      </p>
    </Section>
  )
}
