import { Section } from './Section'
import Card from '../../ui/Card'

/* Workflow — from information overload to a structured thesis.

   The file keeps its old name; it was the problem statement and became the
   comparison that answers it. The claim is about research friction and order
   of work, never about results: nothing here says the right-hand column trades
   better, only that the thesis is assembled before the chart is opened. */
const WITHOUT = [
  'Economic calendar',
  'News',
  'Rates and yields',
  'COT positioning',
  'Cross-asset flows',
  'Form a thesis',
  'Pick an invalidation',
  'Open the chart',
]

const WITH = [
  'Open BiasForge',
  'Read the direction',
  'Review the evidence',
  'Check the invalidation',
  'Check your account risk',
  'Execute your own plan',
]

function Steps({ items, muted }) {
  return (
    <ol className="mt-5 space-y-2">
      {items.map((s, i) => (
        <li key={s} className="flex items-center gap-3">
          <span
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-3xs tabular-nums ${
              muted ? 'border-white/10 text-bf-muted' : 'border-bf-accent/40 text-bf-accent'
            }`}
            aria-hidden="true"
          >
            {i + 1}
          </span>
          <span className={`text-[14.5px] ${muted ? 'text-bf-muted' : 'text-bf-text'}`}>{s}</span>
        </li>
      ))}
    </ol>
  )
}

export default function Problem() {
  return (
    <Section id="workflow" eyebrow="Workflow" headline="From information overload to a structured thesis." wide>
      <div className="mt-10 sm:mt-12 grid gap-3 md:grid-cols-2 max-w-[56rem]" data-reveal>
        <Card as="section" tone="subtle" padding="lg" aria-labelledby="wf-without">
          <h3 id="wf-without" className="text-3xs font-semibold uppercase tracking-[0.16em] text-bf-muted">
            Without BiasForge
          </h3>
          <Steps items={WITHOUT} muted />
        </Card>

        <Card as="section" tone="default" padding="lg" aria-labelledby="wf-with">
          <h3 id="wf-with" className="text-3xs font-semibold uppercase tracking-[0.16em] text-bf-accent">
            With BiasForge
          </h3>
          <Steps items={WITH} />
        </Card>
      </div>

      <p className="mt-8 max-w-[46rem] text-[14.5px] leading-[1.7] text-bf-text-2" data-reveal>
        The research still happens. It&rsquo;s organised before you open the chart. Entries, sizing
        and execution stay yours.
      </p>
    </Section>
  )
}
