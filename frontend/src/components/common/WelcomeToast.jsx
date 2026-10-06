import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'

/* "Welcome to Pro", once, on the page a new subscriber lands on.

   The subscribe screen navigates with state { welcomePro: true } when a payment
   it was waiting for comes through. This reads it, then replaces the history
   entry without it, so a reload or Back does not welcome them again.

   Motion: opacity and transform only; with reduced motion it simply appears. */
const SHOW_MS = 6000

export default function WelcomeToast() {
  const location = useLocation()
  const navigate = useNavigate()
  // Captured once: the history state is cleared right after, which must not hide the toast.
  const [open, setOpen] = useState(() => !!location.state?.welcomePro)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!location.state?.welcomePro) return
    const { pathname, search, hash } = location
    navigate({ pathname, search, hash }, { replace: true, state: null })
  }, [location, navigate])

  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => setShown(true))
    const timer = setTimeout(() => setOpen(false), SHOW_MS)
    return () => { cancelAnimationFrame(raf); clearTimeout(timer) }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 pointer-events-none">
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto flex items-center gap-3 rounded-xl border border-bf-bull/30 bg-bf-raised px-4 py-3 shadow-card transition-[opacity,transform] duration-300 ease-bf motion-reduce:transition-none ${
          shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        <span className="w-6 h-6 rounded-full bg-bf-bull/15 flex items-center justify-center shrink-0" aria-hidden="true">
          <Check size={14} className="text-bf-bull-soft" strokeWidth={2.5} />
        </span>
        <p className="text-sm text-bf-text">
          <span className="font-semibold">Welcome to Pro.</span>{' '}
          <span className="text-bf-text-2">Everything in the dashboard is open.</span>
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Dismiss"
          className="text-bf-muted hover:text-bf-text rounded"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
