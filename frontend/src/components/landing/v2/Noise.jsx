import { Section, Lede, Ref } from './Section'
import NewsLive from './NewsLive'

/* Section 4 — from chaos to direction. */
export default function Noise() {
  return (
    <Section eyebrow="What it reads" headline="The market gives you noise. You need a direction." wide>
      <Lede>
        Central bank speeches, <Ref href="/blog/how-to-trade-nfp-prop-firm">data prints</Ref>,
        positioning shifts, headlines landing at every hour of the session. BiasForge reads all of
        it continuously and resolves it into one directional read per pair, with the reasoning
        attached so you can disagree with it.
      </Lede>

      {/* The real feed, four cards deep, landing in sequence. The crop this
          replaces showed a single card at about a fifth of native size. */}
      <div className="mt-10 sm:mt-12" data-reveal>
        <NewsLive />
      </div>
    </Section>
  )
}
