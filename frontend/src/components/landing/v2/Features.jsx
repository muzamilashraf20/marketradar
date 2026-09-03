import {
  LayoutDashboard, TrendingUp, Newspaper, Calendar, BarChart2,
  ShieldCheck, BookOpen, PieChart, Flag, NotebookPen, History,
} from 'lucide-react'
import { Section, Lede } from './Section'

/* What the Features link actually lands on.

   It used to point at the bias-card section, so a visitor who clicked Features
   got one feature and had to scroll for the rest. This is the whole dashboard,
   in the order the app's own sidebar lists it, using the app's own names — the
   point is that the page and the product agree on what is in there.

   Kept to what each page gives the trader, not to what it is built from. The
   line under each name is the reason to open it. */
const PAGES = [
  {
    icon: LayoutDashboard,
    name: 'Overview',
    line: "Today's bias, the calendar ahead and the news that moved, on one screen.",
  },
  {
    icon: TrendingUp,
    name: 'AI Bias',
    line: 'A directional read on every major pair, with the reasoning and the level that closes it.',
  },
  {
    icon: Newspaper,
    name: 'Live News',
    line: 'Headlines scored for macro impact, each with the read for the majors attached.',
  },
  {
    icon: Calendar,
    name: 'Econ Calendar',
    line: 'High-impact releases with what they mean for direction, not just when they land.',
  },
  {
    icon: BarChart2,
    name: 'Currency Strength',
    line: 'Which currency is leading and which is lagging across the majors.',
  },
  {
    icon: ShieldCheck,
    name: 'Prop Firm Mode',
    line: 'Daily and total drawdown against your firm’s limits, and a check before you take a trade.',
  },
  {
    icon: BookOpen,
    name: 'Event Playbooks',
    line: 'How FOMC, NFP, CPI, ECB and BOE days tend to behave, and what to watch on each.',
  },
  {
    icon: PieChart,
    name: 'COT Report',
    line: 'Where institutional positioning actually sits, updated every week.',
  },
  {
    icon: Calendar,
    name: 'Earnings',
    line: 'The reports big enough to move risk sentiment and the dollar with it.',
  },
  {
    icon: Flag,
    name: 'MarketMovers Radar',
    line: 'Political and policy events tracked for the ones that reach currencies.',
  },
  {
    icon: NotebookPen,
    name: 'Trade Journal',
    line: 'Your trades logged against the bias that was live when you took them.',
  },
  {
    icon: History,
    name: 'Bias History',
    line: 'Every call the engine has closed, with the level it was closed on.',
  },
]

/* The Features section. Twelve panels is a lot of names, so they get a compact
   grid rather than the page's usual one-idea-per-section rhythm — this is the
   contents page of the product, and a visitor arriving from the nav link is
   asking exactly one question: what do I get. */
export default function Features() {
  return (
    <Section
      id="features"
      eyebrow="Everything in the dashboard"
      headline="Twelve screens. One question each."
      wide
    >
      <Lede>
        Every panel below is a page you can open, not a feature list — each one readable on its
        own, all of them feeding the same directional read.
      </Lede>

      {/* Four across, so twelve panels land in three rows rather than four.
          They are short entries in a contents page, not sections of their own. */}
      <ul className="mt-8 sm:mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {PAGES.map(p => (
          <li key={p.name} className="bf-card p-3.5" data-reveal>
            <p.icon size={16} className="text-cyan-400 shrink-0" aria-hidden="true" strokeWidth={1.75} />
            <h3 className="mt-2.5 text-[14px] font-medium text-slate-100">{p.name}</h3>
            <p className="mt-1.5 text-[12.5px] leading-[1.55] text-slate-400">{p.line}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}
