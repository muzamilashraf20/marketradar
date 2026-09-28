import { Section, Lede, Ref } from './Section'

/* Why BiasForge exists. Company voice — no name, no personal handle. The longer
   version lives at /about. */
export default function About() {
  return (
    <Section id="about" eyebrow="Why BiasForge exists" headline="Built for traders who want a thesis, not a signal.">
      <Lede>
        BiasForge is an independent macro research tool, built by a trader. It reads what a macro
        desk reads and turns it into one directional thesis per pair, with the level where that
        thesis stops being valid. No entries to copy. No performance claims.
      </Lede>

      <p className="mt-6 text-[14.5px]" data-reveal>
        <Ref href="/about">More about how we work</Ref>
      </p>
    </Section>
  )
}
