import { Section, Lede, Ref } from './Section'
import DataFlow from './DataFlow'

/* Section 6 — what's inside.

   The cards carried thumbnails and they did not work. At a third of the grid
   they were far too small for any interface to be legible, so they read as
   decoration — and there was no capture for the trade journal, leaving one card
   visibly short of the other five.

   The text-only grid that replaced them has now gone too. It named the same six
   inputs the diagram below already labels, one section after the other, which is
   the duplication this pass exists to remove. The sentence above still names
   every one of them, so nothing is lost but the second telling. */
export default function Inside() {
  return (
    <Section eyebrow="The full picture" headline="Every input that moves a currency, in one place." wide>
      <Lede>
        Every input behind a bias is also a page you can open and read for yourself — the economic
        calendar, COT positioning, currency strength, and a trade journal that ties it all back to
        what you actually did, with the{' '}
        <Ref href="/blog">macro journal</Ref> covering how they fit together.
      </Lede>

      {/* 01-overview.png is gone. The hero already shows the dashboard live; a
          static copy of the same view three sections later was the redundancy
          the review flagged, and it rendered 1110x1090 to say nothing new. The
          data-flow diagram moves here from Section 3, where it was competing
          with a screenshot for the same job. */}
      <div className="mt-12 sm:mt-14">
        <DataFlow />
      </div>
    </Section>
  )
}
