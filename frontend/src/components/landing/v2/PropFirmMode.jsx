import { Section, Lede, Ref, Screenshot } from './Section'

const STATS = [
  'Daily drawdown tracking',
  'Total drawdown tracking',
  'Max risk per trade',
  'Pre-trade check',
]

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

      {/* The daily and total drawdown pair, cropped from the full-page capture.
          Deliberately NOT the challenge-progress card that sits above it: that
          one shows a running P&L against a target, and a profit figure on this
          page would read as a claim about results whatever the caption said. */}
      <div className="mt-14 sm:mt-16 max-w-[640px]">
        <Screenshot
          src="/screens/03-propfirm.png"
          srcW={5120} srcH={3598}
          crop={{ x: 29.7, y: 52.4, w: 50, h: 10.2 }}
          alt="BiasForge Prop Firm Mode showing a prop firm trader's daily and total drawdown against their funded account limits, with the room remaining before a breach"
        />
      </div>

      <ul className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STATS.map(s => (
          <li key={s} className="bf-card px-4 py-4 text-[13.5px] leading-snug text-slate-300">
            {s}
          </li>
        ))}
      </ul>

      <p className="mt-8 text-[14px] bf-t3">
        Preset rule sets for the major prop firms, or enter your own.
      </p>
    </Section>
  )
}
