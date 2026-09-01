import { Section, Lede, Ref } from './Section'

/* Section between Pricing and FAQ. Company voice throughout — no name, no
   personal handle. The longer version of this lives at /about. */
export default function About() {
  return (
    <Section eyebrow="About BiasForge" headline="Built for traders who want a reason, not a signal.">
      <Lede>
        BiasForge is an independent macro research tool for forex traders. We read the same
        inputs a macro desk reads — the calendar, the newsflow, institutional positioning, rate
        differentials and cross-asset flows — and turn them into one directional read per pair,
        with the level where that read stops being valid. No entries to copy. No performance
        claims. Just the direction and the line under it.
      </Lede>

      <p className="mt-6 text-[14.5px]" data-reveal>
        <Ref href="/about">More about how we work</Ref>
      </p>
    </Section>
  )
}
