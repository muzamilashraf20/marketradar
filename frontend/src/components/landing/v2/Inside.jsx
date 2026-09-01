import { Compass, CalendarDays, Newspaper, PieChart, BarChart2, NotebookPen } from 'lucide-react'
import { Section, Lede, Ref, Screenshot } from './Section'

/* Each line is framed as what the trader gets out of it, not what the feature is. */
const CARDS = [
  { icon: Compass,     name: 'Macro compass',     line: 'A directional bias and invalidation level for every major pair.' },
  { icon: CalendarDays, name: 'Economic calendar', line: 'High-impact events with what they mean for direction — not just when they land.' },
  { icon: Newspaper,   name: 'Live news',         line: 'Headlines scored by market impact, with the forex read attached.' },
  { icon: PieChart,    name: 'COT report',        line: 'Where institutional positioning actually sits, updated every week.' },
  { icon: BarChart2,   name: 'Currency strength', line: 'Which currency is leading and which is lagging, across the majors.' },
  { icon: NotebookPen, name: 'Trade journal',     line: 'Your trades against the bias that was live when you took them.' },
]

/* Section 6 — what's inside.

   The cards carried thumbnails and they did not work. At a third of the grid
   they were far too small for any interface to be legible, so they read as
   decoration — and there was no capture for the trade journal, leaving one card
   visibly short of the other five.

   Both problems have the same fix. The grid is text only, which makes all six
   cards identical in weight and removes the empty slot by construction, and the
   product is shown once underneath at a size where it can actually be read. One
   legible surface beats six illegible ones. */
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
        {CARDS.map(card => (
          <li key={card.name} className="bf-card p-5" data-reveal>
            <card.icon size={17} className="text-cyan-400 shrink-0" aria-hidden="true" strokeWidth={1.75} />
            <h3 className="mt-3.5 text-[15px] font-medium text-slate-100">{card.name}</h3>
            <p className="mt-2 text-[14px] leading-[1.65] text-slate-400">{card.line}</p>
          </li>
        ))}
      </ul>

      {/* Cropped to the interface column. The full capture is a whole-page
          screenshot whose left 29.7% is the app sidebar — and whose first line
          is "Good afternoon, Muzamil Ashraf.", the personal identity this page
          deliberately does not carry. The crop starts below both. */}
      <div className="mt-16 sm:mt-20">
        <Screenshot
          src="/screens/01-overview.png"
          srcW={5120} srcH={2856}
          crop={{ x: 29.7, y: 10, w: 50, h: 88 }}
          bleed
          alt="BiasForge macro bias dashboard showing directional bias and conviction for the major forex pairs, the overview a funded trader opens each session"
        />
      </div>
    </Section>
  )
}
