import { Section, Lede, Ref, Screenshot } from './Section'

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

      {/* One high-impact card, cropped out of the full-page capture rather than
          recaptured: impact score, source and category tags, headline, the
          one-line macro read, asset tags and timestamp. The rest of that page —
          header, filters, stat row, four more cards — is cropped away. */}
      <div className="mt-14 sm:mt-16 max-w-[600px]">
        <Screenshot
          src="/screens/05-news.png"
          srcW={5120} srcH={2768}
          crop={{ x: 29.7, y: 54.4, w: 50, h: 19.3 }}
          alt="A BiasForge live news card for forex and funded traders: a high-impact central bank headline with its impact score, source tags and the one-line macro read attached"
        />
      </div>
    </Section>
  )
}
