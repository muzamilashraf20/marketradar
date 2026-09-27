import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { CHIP_BASE, CHIP_SIZE, DIRECTION_TEXT_SIZE, directionStyle } from './styles'

const ICON = { BUY: ArrowUpRight, SELL: ArrowDownRight, FLAT: Minus }
const ICON_SIZE = { sm: 11, md: 12, lg: 20 }

/* BUY, SELL, or no call.

   Two forms: `chip` for lists and meta rows, `text` for the headline of a bias
   card. Both carry an arrow as well as colour, so direction never depends on
   telling red from green. FLAT reads "No call" — the engine declining to lean
   is an answer, not a blank. */
export default function DirectionBadge({ direction, variant = 'chip', size = 'md', className = '' }) {
  const d = direction === 'BUY' || direction === 'SELL' ? direction : 'FLAT'
  const s = directionStyle(d)
  const Icon = ICON[d]

  if (variant === 'text') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-tight leading-none ${DIRECTION_TEXT_SIZE[size] || DIRECTION_TEXT_SIZE.md} ${s.text} ${className}`}
      >
        <Icon size={ICON_SIZE[size] || ICON_SIZE.md} strokeWidth={2.5} aria-hidden="true" />
        {s.label}
      </span>
    )
  }

  const chipSize = size === 'sm' ? 'sm' : 'md'
  return (
    <span className={`${CHIP_BASE} ${CHIP_SIZE[chipSize]} ${s.chip} ${className}`}>
      <Icon size={ICON_SIZE[chipSize]} strokeWidth={2.5} aria-hidden="true" />
      {s.label}
    </span>
  )
}
