import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Activity, ArrowUpRight, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import { GUMROAD_URL, PRICE_MONTHLY, PRICE_ANNUAL } from '../components/landing/v2/Plan'
import { nextFromSearch } from '../lib/nextPath'

/* Where a signed-in account without Pro lands (RequirePro sends it here with
   ?next=<the page it wanted>). BiasForge has no free tier, so this is the only
   thing such an account sees besides Settings and Billing.

   Phase 4A placeholder: the checkout link and a manual re-check. The full
   screen — billing toggle, crypto, the automatic waiting state after payment —
   replaces this in 4B. */
export default function Subscribe() {
  const { user, isPro, fetchPlan, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const next = nextFromSearch(location.search) || '/today'
  const [checking, setChecking] = useState(false)

  if (isPro) return <Navigate to={next} replace />

  const recheck = async () => {
    setChecking(true)
    try { await fetchPlan(undefined, { force: true }) } finally { setChecking(false) }
  }

  return (
    <div className="min-h-screen bg-bf-bg text-bf-text flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 justify-center">
          <span className="w-8 h-8 rounded-[9px] bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center">
            <Activity size={17} className="text-black" strokeWidth={3} aria-hidden="true" />
          </span>
          <span className="text-[17px] font-semibold tracking-tight">
            Bias<span className="text-cyan-400">Forge</span>
          </span>
        </div>

        <Card padding="none" className="mt-8 p-7">
          <h1 className="text-xl font-semibold tracking-tight">Get BiasForge Pro</h1>
          <p className="mt-2 text-sm leading-relaxed text-bf-text-2">
            BiasForge is a paid subscription: ${PRICE_MONTHLY} a month or ${PRICE_ANNUAL} a year.
            Every part of the dashboard is included.
          </p>

          <p className="mt-5 rounded-lg border border-bf-accent/25 bg-bf-accent/10 px-3 py-2.5 text-[13px] leading-relaxed text-bf-text">
            Signed in as <span className="font-semibold break-all">{user?.email}</span>. Use this email at checkout.
          </p>

          <Button
            href={GUMROAD_URL}
            external
            size="lg"
            fullWidth
            className="mt-6"
            iconRight={<ArrowUpRight size={16} aria-hidden="true" />}
          >
            Continue to checkout
          </Button>

          <Button
            variant="secondary"
            size="lg"
            fullWidth
            className="mt-2.5"
            onClick={recheck}
            loading={checking}
            iconLeft={<RefreshCw size={15} aria-hidden="true" />}
          >
            I&rsquo;ve paid: check again
          </Button>
        </Card>

        <div className="mt-6 flex items-center justify-center gap-5 text-[13px] text-bf-text-2">
          <button type="button" onClick={() => navigate('/settings')} className="hover:text-bf-text">Settings</button>
          <button type="button" onClick={() => navigate('/billing')} className="hover:text-bf-text">Billing</button>
          <button
            type="button"
            onClick={async () => { await logout(); navigate('/login') }}
            className="hover:text-bf-text"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
