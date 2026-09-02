import { Section } from './Section'

/* Phase 4 — the problem, stated before the compass comparison answers it.
   Typography only. No image, no number, no claim about what the product does
   to a result. */
export default function Problem() {
  return (
    <Section eyebrow="The real reason funded accounts blow up" headline={<>It&rsquo;s not bad entries.<br className="bf-br" /> It&rsquo;s trading without a map.</>}>
      <div className="mt-8 max-w-[46rem] space-y-6" data-reveal>
        <p className="bf-body">
          You pass the challenge on discipline. You lose it on a headline you didn&rsquo;t see
          coming. A signal group tells you where to click. A calendar tells you an event is
          coming. Neither tells you which way the fundamentals lean, or where you&rsquo;re wrong
          if price disagrees.
        </p>
        <p className="bf-body text-slate-300">That gap is where the drawdown lives.</p>
      </div>
    </Section>
  )
}
