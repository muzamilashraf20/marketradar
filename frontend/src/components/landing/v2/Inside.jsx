import { Compass, CalendarDays, Newspaper, PieChart, BarChart2, NotebookPen } from 'lucide-react'
import { Section, Lede, Ref } from './Section'

/* Each line is framed as what the trader gets out of it, not what the feature is. */
const CARDS = [
  {
    icon: Compass,
    name: 'Macro compass',
    line: 'A directional bias and invalidation level for every major pair.',
    shot: { src: '/screens/01-overview.png', w: 5120, h: 2856,
      alt: 'BiasForge macro bias dashboard showing directional bias and conviction for the major forex pairs, the overview a funded trader opens each session' },
  },
  {
    icon: CalendarDays,
    name: 'Economic calendar',
    line: 'High-impact events with what they mean for direction — not just when they land.',
    shot: { src: '/screens/04-calendar.png', w: 5120, h: 2546,
      alt: 'BiasForge economic calendar listing high-impact forex events with forecast and previous figures, the week a funded trader plans around' },
  },
  {
    icon: Newspaper,
    name: 'Live news',
    line: 'Headlines scored by market impact, with the forex read attached.',
    shot: { src: '/screens/05-news.png', w: 5120, h: 2768,
      alt: 'BiasForge live news feed for forex traders, each headline scored by market impact with the macro read attached' },
  },
  {
    icon: PieChart,
    name: 'COT report',
    line: 'Where institutional positioning actually sits, updated every week.',
    shot: { src: '/screens/07-cot.png', w: 5120, h: 3766,
      alt: 'BiasForge COT report showing net institutional positioning per currency from the weekly CFTC release' },
  },
  {
    icon: BarChart2,
    name: 'Currency strength',
    line: 'Which currency is leading and which is lagging, across the majors.',
    shot: { src: '/screens/06-strength.png', w: 5120, h: 3736,
      alt: 'BiasForge currency strength page ranking the major currencies from strongest to weakest, so a trader can see which is leading the session' },
  },
  {
    icon: NotebookPen,
    name: 'Trade journal',
    line: 'Your trades against the bias that was live when you took them.',
  },
]

/* Section 6 — what's inside. */
export default function Inside() {
  return (
    <Section eyebrow="The full picture" headline="Every input that moves a currency, in one place." wide>
      <Lede>
        Every input behind a bias is also a page you can open and read for yourself — the economic
        calendar, COT positioning, currency strength, and a trade journal that ties it all back to
        what you actually did, with the{' '}
        <Ref href="/blog">macro journal</Ref> covering how they fit together.
      </Lede>

      <ul className="mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Rendered as a member expression, not a destructured binding: the base
            no-unused-vars rule does not track JSX usage and flags the binding. */}
        {CARDS.map(card => (
          <li key={card.name} className="bf-card bf-card-lift p-5 flex flex-col">
            <card.icon size={17} className="text-cyan-400 shrink-0" aria-hidden="true" strokeWidth={1.75} />
            <h3 className="mt-3.5 text-[15px] font-medium text-slate-100">{card.name}</h3>
            <p className="mt-2 text-[14px] leading-[1.65] text-slate-400">{card.line}</p>

            {card.shot && (
              <img
                src={card.shot.src}
                alt={card.shot.alt}
                width={card.shot.w}
                height={card.shot.h}
                loading="lazy"
                decoding="async"
                className="mt-5 w-full h-auto rounded-lg bf-hairline"
              />
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}
