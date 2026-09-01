import { Section, Lede } from './Section'

/* ═══════════════════════════════════════════════════════════════
   Section 7 — HIDDEN BEHIND THIS FLAG, AND IT DEFAULTS TO OFF.

   Real outcome recording started 28 Aug 2026. There is not yet enough of it
   to publish. The shell is built so it can be switched on without a rebuild:
   flip this to true once the sample is honest.

   The slots below are deliberately empty. A sample or illustrative number on
   a live page is a published claim, whatever the label next to it says.
   ═══════════════════════════════════════════════════════════════ */
export const SHOW_TRACK_RECORD = false

const SLOTS = ['Biases closed', 'Reached invalidation', 'Median hold time']

export default function TrackRecord() {
  if (!SHOW_TRACK_RECORD) return null

  return (
    <Section eyebrow="Honest record" headline="Including the ones that were wrong." wide>
      <Lede>
        Every bias that closes is recorded — the direction, the level, how it ended. Not a curated
        highlight reel.
      </Lede>

      <ul className="mt-16 grid sm:grid-cols-3 gap-4">
        {SLOTS.map(label => (
          <li key={label} className="bf-card px-5 py-6">
            <p className="text-[13px] text-slate-400">{label}</p>
            {/* Placeholder slot — intentionally carries no number. */}
            <p className="mt-3 text-slate-700 text-[26px] font-medium leading-none" aria-label="Not yet published">
              —
            </p>
            <p className="mt-3 text-[11.5px] bf-t3">Not enough recorded data to publish yet.</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}
