import { Lock } from 'lucide-react'
import { LEVEL_TONE, LEVEL_SIZE } from './styles'
import { fmtLevel } from './format'

/* One labelled price level — an invalidation level, usually.

   The value is rounded to the pair's quoting precision (see ./format) and set
   in tabular figures so levels line up down a list.

   LOCKED. With `locked`, the row says "Level shown when closed" and the value
   is never read, formatted or written anywhere — not into the text, not into
   an attribute, not into a title. Whether a level is locked is decided by the
   server, which should not send it at all; this prop only draws that state.
   Passing a real level with locked set is still a mistake, but it does not
   leak into the page. */
export default function LevelRow({
  label = 'Invalidation',
  pair,
  value,
  locked = false,
  note,
  tone = 'invalidation',
  size = 'md',
  className = '',
}) {
  const s = LEVEL_SIZE[size] || LEVEL_SIZE.md

  let shown = null
  if (locked) {
    shown = (
      <span className={`inline-flex items-center gap-1.5 font-medium text-bf-muted ${s.label}`}>
        <Lock size={12} aria-hidden="true" />
        Level shown when closed
      </span>
    )
  } else {
    const level = fmtLevel(pair, value)
    shown = level
      ? <span className={`font-semibold tabular-nums ${s.value} ${LEVEL_TONE[tone] || LEVEL_TONE.neutral}`}>{level}</span>
      : <span className={`font-medium text-bf-muted ${s.label}`}>Not set</span>
  }

  return (
    <div className={className}>
      <dl className="flex items-baseline justify-between gap-3">
        <dt className={`font-semibold uppercase tracking-wider text-bf-muted ${s.label}`}>{label}</dt>
        <dd className="text-right">{shown}</dd>
      </dl>
      {note && !locked && (
        <p className="mt-1 text-2xs leading-snug text-bf-text-2">{note}</p>
      )}
    </div>
  )
}
