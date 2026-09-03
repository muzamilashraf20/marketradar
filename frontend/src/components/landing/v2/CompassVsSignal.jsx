import { Section } from './Section'
import { GUMROAD_URL } from './Plan'

/* Phase 3 — the comparison. Typography only.

   The left column is the only place on this page the word "signal" is used in
   its own right, and it is used to describe what the product is not. No label
   says which column is better: the muted grey on the left against the page's
   normal text colour on the right does that on its own. */
const LEFT = {
  title: 'A signal button',
  lines: ['Buy here.', 'Stop here.', 'Target here.', 'Copy it or don’t.'],
  close: 'You learn nothing, and you’re out on the first bad one.',
}

const RIGHT = {
  title: 'A macro compass',
  lines: [
    'The dollar has the rate edge.',
    'Sterling is fading on data.',
    'Direction: sell GBPUSD.',
    'Wrong if price crosses 1.35686.',
  ],
  close: 'You take your own entry, with a reason under the direction and a hard line under the trade.',
}

function Column({ col, muted }) {
  const tone = muted ? 'bf-t3' : 'text-slate-200'
  return (
    <div data-reveal>
      <h3 className={`text-[15px] font-medium ${muted ? 'bf-t3' : 'text-slate-100'}`}>{col.title}</h3>
      <div className={`mt-3 h-px ${muted ? 'bg-slate-700/60' : 'bg-cyan-500/40'}`} aria-hidden="true" />
      <ul className={`mt-5 space-y-2 text-[15px] leading-[1.7] ${tone}`}>
        {col.lines.map(l => <li key={l}>{l}</li>)}
      </ul>
      <p className={`mt-6 text-[15px] leading-[1.7] ${tone}`}>{col.close}</p>
    </div>
  )
}

/* The comparison and the ask, in one section.

   They were two, stacked, with the page's full 128px between them — so the
   argument finished, the page went quiet, and then a separate block asked for
   the money. Read as one, the columns are the reason and the line under them is
   the ask, which is the order this has to be in.

   The CTA keeps its own headline because it is doing a different job from the
   comparison above it, but it sits inside the same section and behind a rule,
   so it reads as the conclusion rather than as the next topic. */
export default function CompassVsSignal() {
  return (
    <Section eyebrow="A compass, not a signal button" headline={<>Signals make you dependent.<br className="bf-br" /> A compass makes you sharp.</>}>
      <div className="mt-12 grid sm:grid-cols-2 gap-10 sm:gap-14 max-w-[52rem]">
        <Column col={LEFT} muted />
        <Column col={RIGHT} />
      </div>

      <div className="mt-14 sm:mt-16 pt-10 bf-hairline-t" data-reveal>
        <h2 className="bf-h2 max-w-[20ch]">Trade with a direction, or trade without one.</h2>

        <p className="bf-body mt-5 max-w-[40rem]">
          Direction and invalidation for every major pair, on one screen.
        </p>

        {/* One CTA. The free Telegram offer is gone from the page; the channel
            survives in the footer as a contact route, not as an offer. */}
        <div className="mt-8">
          <a
            href={GUMROAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="bf-pill bf-lift inline-block px-6 py-3 text-[15px] font-medium bg-cyan-500 text-[#030712] hover:bg-cyan-400"
          >
            Get access
          </a>
        </div>
      </div>
    </Section>
  )
}
