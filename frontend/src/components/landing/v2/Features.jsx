import { Sun, TrendingUp, CalendarDays, PieChart, ShieldCheck, NotebookPen } from 'lucide-react'
import { Section, Lede } from './Section'
import Card from '../../ui/Card'
import { useMotion } from './useMotion'

/* Inside the dashboard, grouped by the decision each area serves rather than
   listed flat. Only modules that exist, under their app names.

   Two corrections from the old grid: Currency Strength is described as the
   viewer it is (not an engine input), and the Trade Journal no longer claims
   to log trades against the live bias — it does not. */
const AREAS = [
  {
    icon: Sun,
    name: 'Today',
    items: [['Overview', 'The headline bias, the calendar ahead and the news that moved.']],
  },
  {
    icon: TrendingUp,
    name: 'Bias',
    items: [
      ['AI Bias', 'Direction, conviction and invalidation for every covered pair.'],
      ['Bias History', 'Every closed call and why it closed.'],
      ['Currency Strength', 'A relative-strength viewer. Not an engine input.'],
    ],
  },
  {
    icon: CalendarDays,
    name: 'Events',
    items: [
      ['Economic Calendar', 'High-impact releases and what they mean for direction.'],
      ['Live News', 'Headlines scored for macro impact.'],
      ['Event Playbooks', 'FOMC, NFP, CPI, ECB and BOE days, and what to watch on each.'],
      ['Earnings', 'The reports large enough to move risk sentiment.'],
    ],
  },
  {
    icon: PieChart,
    name: 'Markets',
    items: [
      ['COT Report', 'Weekly CFTC positioning.'],
      ['MarketMovers Radar', 'Policy and political events tracked for currency impact.'],
    ],
  },
  {
    icon: ShieldCheck,
    name: 'Account',
    items: [['Prop Firm Mode', 'Drawdown against your firm’s limits, and a check before a trade.']],
  },
  {
    icon: NotebookPen,
    name: 'Journal',
    items: [['Trade Journal', 'Your trades, P&L and analytics.']],
  },
]

export default function Features() {
  const motion = useMotion()
  return (
    <Section id="features" eyebrow="Inside the dashboard" headline="Organised around the decision, not the data." wide>
      <Lede>Six areas, in the order you use them.</Lede>

      {/* Motion: cards land in turn, each icon draws its strokes in, and a card
          lifts with a faint cyan glow on hover (landing.css, bf-feat / bf-draw). */}
      <ul ref={motion} className="mt-8 sm:mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AREAS.map((a, i) => (
          <Card as="li" key={a.name} tone="subtle" padding="md" className="bf-feat relative" style={{ '--i': i }}>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-bf-text">
              <a.icon size={16} className="bf-draw text-bf-accent shrink-0" aria-hidden="true" strokeWidth={1.75} />
              {a.name}
            </h3>
            <dl className="mt-3 space-y-2.5">
              {a.items.map(([name, line]) => (
                <div key={name}>
                  <dt className="text-[13.5px] font-medium text-slate-200">{name}</dt>
                  <dd className="mt-0.5 text-[12.5px] leading-[1.55] text-bf-text-2">{line}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </ul>
    </Section>
  )
}
