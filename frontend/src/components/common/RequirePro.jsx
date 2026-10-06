import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import Button from '../ui/Button'
import { fullPath } from '../../lib/nextPath'

/* The one gate in front of the app. BiasForge has no free tier, so a page is
   either for a Pro subscriber or it is one of the few an unpaid account may
   reach (/subscribe, /settings, /billing — pass `allowUnpaid`).

     signed out                         → /login?next=<this path>
     plan not known yet                 → a holding screen (never a guess)
     Pro                                → the page
     plan could not be confirmed        → "Couldn't confirm your plan · Retry"
     confirmed not Pro                  → /subscribe?next=<this path>

   Deciding here, before the page mounts, means a non-Pro account never loads a
   dashboard page at all — no half-locked screens, and none of the 403s the old
   lock wall caused by mounting the page behind it. The server enforces the same
   rule on every Pro route; this only decides what to show. */
export default function RequirePro({ children, allowUnpaid = false }) {
  const { user, loading, planLoaded, isPro, planError, fetchPlan } = useAuth()
  const location = useLocation()
  // A failed Google sign-in arrives with #error=… — hand that to the sign-in page (which shows
  // it) rather than burying it inside `next`.
  const signInError = /error_description|[#&]error=/.test(location.hash) ? location.hash : ''
  const next = encodeURIComponent(signInError
    ? `${location.pathname}${location.search}`
    : fullPath(location))

  if (loading) return <Holding label="Loading…" />
  if (!user) return <Navigate to={`/login?next=${next}${signInError}`} replace />
  if (allowUnpaid || isPro) return children
  if (!planLoaded) return <Holding label="Checking your plan…" />
  if (planError) return <PlanError retry={() => fetchPlan(undefined, { force: true })} />
  return <Navigate to={`/subscribe?next=${next}`} replace />
}

export function Holding({ label }) {
  return (
    <div className="min-h-screen bg-bf-bg flex items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-bf-accent border-t-transparent rounded-full animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <span className="text-bf-text-2 text-sm">{label}</span>
      </div>
    </div>
  )
}

export function PlanError({ retry }) {
  const [busy, setBusy] = useState(false)
  const onRetry = async () => {
    setBusy(true)
    try { await retry() } finally { setBusy(false) }
  }
  return (
    <div className="min-h-screen bg-bf-bg flex items-center justify-center px-4">
      <div className="max-w-sm text-center" role="alert">
        <h1 className="text-lg font-semibold text-bf-text">Couldn&rsquo;t confirm your plan</h1>
        <p className="mt-2 text-sm leading-relaxed text-bf-text-2">
          We couldn&rsquo;t reach the server to check your subscription. Nothing has changed on your
          account. Try again in a moment.
        </p>
        <Button
          className="mt-6"
          onClick={onRetry}
          loading={busy}
          iconLeft={<RefreshCw size={15} aria-hidden="true" />}
        >
          Retry
        </Button>
      </div>
    </div>
  )
}
