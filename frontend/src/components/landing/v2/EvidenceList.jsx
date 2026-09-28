import { Check, Minus, ArrowUpRight, ArrowDownRight } from 'lucide-react'

/* The engine's three components — macro, order flow, sentiment — shown as
   agreement with the call, not as raw scores.

   On a bias each component either supports the direction or leans against it.
   On a no call there is no direction to support, so each shows which way it
   leans on its own, which is what makes the disagreement visible.

   Deliberately quiet: "against" is muted, not red. Red on this page means an
   invalidation level, and a component leaning the other way is not one. */
export default function EvidenceList({ components = [], size = 'sm', className = '' }) {
  if (!components.length) return null
  const text = size === 'md' ? 'text-sm' : 'text-2xs'
  const icon = size === 'md' ? 14 : 12

  return (
    <ul className={`space-y-1 ${className}`}>
      {components.map((c, i) => {
        let state
        if (c.leans) {
          const Arrow = c.leans === 'BUY' ? ArrowUpRight : ArrowDownRight
          state = (
            <span className="inline-flex items-center gap-1 text-bf-text-2">
              <Arrow size={icon} aria-hidden="true" />
              Leans {c.leans === 'BUY' ? 'buy' : 'sell'}
            </span>
          )
        } else if (c.agrees) {
          state = (
            <span className="inline-flex items-center gap-1 text-bf-text">
              <Check size={icon} className="text-bf-accent" aria-hidden="true" />
              Supports
            </span>
          )
        } else {
          state = (
            <span className="inline-flex items-center gap-1 text-bf-muted">
              <Minus size={icon} aria-hidden="true" />
              Against
            </span>
          )
        }
        // bf-ev-row / bf-ev-verdict / --i are hooks for the landing page's
        // "engine reading the evidence" motion: rows land one by one, each
        // verdict a beat after its label. Static without that motion.
        return (
          <li key={c.label} className={`bf-ev-row flex items-center justify-between gap-3 ${text}`} style={{ '--i': i }}>
            <span className="text-bf-text-2">{c.label}</span>
            <span className="bf-ev-verdict">{state}</span>
          </li>
        )
      })}
    </ul>
  )
}
