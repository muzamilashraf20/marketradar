import { Section, Lede, Ref, Screenshot } from './Section'
import DataFlow from './DataFlow'

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

      <div className="mt-16 sm:mt-20">
        <DataFlow />
      </div>

      {/* The diagram says what it reads; this is the same thing concretely —
          headlines already scored, with the macro read attached. */}
      <div className="mt-14 sm:mt-16">
        <Screenshot
          src="/screens/05-news.png"
          srcW={5120} srcH={2768}
          crop={{ x: 29.7, y: 6.5, w: 50, h: 91.5 }}
          bleed
          alt="BiasForge live news feed for forex and funded traders, each headline scored by market impact with the macro read attached"
        />
      </div>
    </Section>
  )
}
