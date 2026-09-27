import { CHIP_BASE, CHIP_SIZE, statusStyle } from './styles'

/* Where a bias, or the data behind it, stands: active, invalidated, closed,
   regime flip, no call — or stale, market closed, still scoring.

   For a closed record, pass statusFromOutcome(closed_reason) from ./styles
   rather than choosing a status by hand; that mapping is the one place the
   engine's reasons are translated. `describe` adds the plain-English meaning
   as a visually hidden sentence, for lists where the chip stands alone. */
export default function StatusBadge({ status, size = 'md', dot = true, describe = false, className = '' }) {
  const s = statusStyle(status)
  const chipSize = size === 'sm' ? 'sm' : 'md'

  return (
    <span className={`${CHIP_BASE} ${CHIP_SIZE[chipSize]} ${s.chip} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} aria-hidden="true" />}
      {s.label}
      {describe && <span className="sr-only">: {s.note}</span>}
    </span>
  )
}
