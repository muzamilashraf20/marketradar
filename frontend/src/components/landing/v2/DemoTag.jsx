import { CHIP_BASE, CHIP_SIZE } from '../../ui/styles'

/* The one label every illustrative panel on the landing page carries.

   Same words everywhere, so a visitor learns it once: anything tagged this is
   an example of what the product shows, not what it is saying now. Real data
   on the page — the calendar ticker, the closed-call record — never carries it. */
export default function DemoTag({ children = 'Demo data', className = '' }) {
  return (
    <span className={`${CHIP_BASE} ${CHIP_SIZE.sm} shrink-0 border-white/15 bg-white/[0.04] text-bf-text-2 ${className}`}>
      {children}
    </span>
  )
}
