import { Section, Lede, Ref } from './Section'
import DrawdownLive from './DrawdownLive'

/* Prop Firm Mode. No firm is named in the copy, and the panel is a worked
   example on stated rules — a drawdown figure for an account nobody connected
   would be a number with no source behind it. */
export default function PropFirmMode() {
  return (
    <Section id="prop-firm" eyebrow="Prop Firm Mode" headline="Bias is only useful if your account can survive the trade." wide>
      <Lede>
        One overlooked <Ref href="/blog/prop-firm-risk-management">risk rule</Ref> can end a funded
        account. Prop Firm Mode tracks{' '}
        <Ref href="/blog/trailing-vs-static-drawdown">daily and total drawdown</Ref> against your
        firm&rsquo;s limits, shows what&rsquo;s left, and checks a planned trade against your
        remaining room before you take it.
      </Lede>

      <div className="mt-10 sm:mt-12" data-reveal>
        <DrawdownLive />
      </div>

      <p className="mt-8 text-[14px] text-bf-muted" data-reveal>
        Preset rule sets for the major prop firms, or enter your own.
      </p>
    </Section>
  )
}
