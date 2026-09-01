import { Section, Lede, Ref, Shot } from './Section'

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

      <div className="mt-16 sm:mt-20">
        <Shot
          src="/screens/03-propfirm.png"
          alt="BiasForge Prop Firm Mode showing a prop firm trader's live daily and total drawdown bars against their funded account limits, with the room remaining before a breach"
          width={1600}
          height={1000}
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
