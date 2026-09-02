import { Section, Lede, Ref } from './Section'
import DrawdownLive from './DrawdownLive'

/* Section 5 — Prop Firm Mode, its own full section. No firm is named in the copy:
   the screenshot showing one in a dropdown is fine, a written endorsement is not. */
export default function PropFirmMode() {
  return (
    <Section eyebrow="Built for funded accounts" headline="Your drawdown rules, on the same screen as your bias." wide>
      <Lede>
        Prop firm traders don't fail on direction. They fail on{' '}
        <Ref href="/blog/prop-firm-risk-management">a rule they forgot was there</Ref>. Prop Firm
        Mode tracks your{' '}
        <Ref href="/blog/trailing-vs-static-drawdown">daily and total drawdown</Ref> against your
        firm's limits in real time, shows what's left before you're out, and checks a trade against
        your remaining room before you take it.
      </Lede>

      {/* Rendered, not photographed. Still no profit figure anywhere in it: the
          bars measure loss used against the limit, which is the thing that ends
          a funded account. A running P&L on this page would read as a claim
          about results whatever the caption said. */}
      <div className="mt-10 sm:mt-12" data-reveal>
        <DrawdownLive />
      </div>

      {/* The chip row that used to sit here read "Daily drawdown tracking" and
          "Total drawdown tracking" immediately above a panel that now shows
          both of them, tracked, with the numbers on them. */}
      <p className="mt-8 text-[14px] bf-t3" data-reveal>
        Preset rule sets for the major prop firms, or enter your own.
      </p>
    </Section>
  )
}
