import { useEffect, useId, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { FOCUS_RING } from './styles'

const SIDE = {
  top:    'bottom-full mb-2',
  bottom: 'top-full mt-2',
}
const ALIGN = {
  center: 'left-1/2 -translate-x-1/2',
  start:  'left-0',
  end:    'right-0',
}

// Browsers without :focus-visible throw on the selector; treat any focus as
// keyboard focus there, which errs towards showing the tip.
const isKeyboardFocus = el => {
  try { return el.matches(':focus-visible') } catch { return true }
}

/* A short explanation attached to a small trigger — an info icon by default.

   One control for every input:
   - mouse: shows on hover
   - keyboard: shows on focus, Escape dismisses
   - touch: tap toggles, tapping anywhere else closes

   The text stays in the DOM and is always wired to the trigger with
   aria-describedby, so a screen reader announces it whether or not it is
   visible. Only opacity is animated, and not at all under reduced motion.

   `align` keeps the bubble on screen when the trigger sits near an edge. */
export default function Tooltip({
  content,
  children,
  label = 'More information',
  side = 'top',
  align = 'center',
  className = '',
}) {
  const id = useId()
  const wrap = useRef(null)
  const pointer = useRef(null)
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const open = !dismissed && (hover || focus || pinned)

  useEffect(() => {
    if (!open) return
    const onKey = e => {
      if (e.key === 'Escape') { setPinned(false); setDismissed(true) }
    }
    const onDown = e => {
      if (wrap.current && !wrap.current.contains(e.target)) setPinned(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  return (
    <span ref={wrap} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-label={children ? undefined : label}
        aria-describedby={id}
        className={`relative inline-flex items-center justify-center rounded text-bf-muted hover:text-bf-text transition-colors before:absolute before:-inset-[14px] before:content-[''] ${FOCUS_RING}`}
        onPointerDown={e => { pointer.current = e.pointerType }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => { setHover(false); setDismissed(false) }}
        onFocus={e => { if (isKeyboardFocus(e.currentTarget)) setFocus(true) }}
        onBlur={() => { setFocus(false); setDismissed(false) }}
        onClick={() => {
          // Mouse users already have hover; pinning on click as well would
          // leave the tip stuck open after the pointer moves away.
          if (pointer.current === 'mouse') return
          setPinned(p => !p)
          setDismissed(false)
        }}
      >
        {children || <Info size={13} aria-hidden="true" />}
      </button>

      <span
        id={id}
        role="tooltip"
        className={`absolute z-50 ${SIDE[side] || SIDE.top} ${ALIGN[align] || ALIGN.center} w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-bf-border bg-bf-raised px-3 py-2 text-left text-2xs font-normal normal-case tracking-normal text-slate-300 shadow-card motion-safe:transition-opacity motion-safe:duration-150 ${
          open ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
        }`}
      >
        {content}
      </span>
    </span>
  )
}
