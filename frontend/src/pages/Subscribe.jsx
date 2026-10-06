import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Activity, ArrowUpRight, Bitcoin, Check, Info, Loader2, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import { FOCUS_RING } from '../components/ui/styles'
import { Holding, PlanError } from '../components/common/RequirePro'
import {
  GUMROAD_URL, PRICE_MONTHLY, PRICE_ANNUAL, ANNUAL_PER_MONTH, ANNUAL_SAVING, INCLUDED,
} from '../components/landing/v2/pricing'
import { nextFromSearch } from '../lib/nextPath'
import { readPayWait, savePayWait, clearPayWait, PAY_WAIT_MS, PAY_POLL_MS } from '../lib/payWait'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

// A query parameter of a same-site path ("/today?crypto=success" → "success"), and the path without it.
const paramOf = (path, key) => new URL(path, 'http://x').searchParams.get(key)
const withoutParam = (path, key) => {
  const u = new URL(path, 'http://x')
  u.searchParams.delete(key)
  return `${u.pathname}${u.search}${u.hash}`
}

/* The checkout screen. BiasForge has no free tier, so a signed-in account
   without Pro sees this (RequirePro sends it here with ?next=<the page it
   wanted>), plus Settings and Billing — nothing else.

   STATES, in the order they are decided
     plan unknown                → holding screen
     plan could not be confirmed → "Couldn't confirm your plan · Retry" (never the pay buttons)
     Pro                         → straight on to `next` (with "Welcome to Pro" after a payment)
     waiting for a payment       → "Waiting for your payment…", re-checking the plan
     waited 15 minutes           → "Still not showing?" — check again, or contact us
     otherwise                   → the plan and the two ways to pay

   PAYING
   · Card: Gumroad. One product link for both billing periods — it is a single
     membership with Monthly ($40, Gumroad's default) and Yearly ($399), chosen
     on Gumroad's own page. The landing's pricing uses the same single link. No
     query parameters are added to it.
   · Crypto: NOWPayments through /api/crypto/create-payment, with the signed-in
     email and the chosen period — the same call the landing makes. Its success
     URL is /dashboard?crypto=success, which arrives back here (via /today and
     RequirePro) as ?next=/today?crypto=success and starts the wait.

   Both webhooks match a payment to an account by email, so the account email is
   shown above the pay buttons, and a buyer who used another address has a way
   to say so. */
export default function Subscribe() {
  const { user, isPro, planLoaded, planError, fetchPlan, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const rawNext = nextFromSearch(location.search) || '/today'
  const crypto = new URLSearchParams(location.search).get('crypto') || paramOf(rawNext, 'crypto')
  const next = withoutParam(rawNext, 'crypto')

  const [annual, setAnnual] = useState(true)
  const [cryptoLoading, setCryptoLoading] = useState(false)
  const [cryptoFailed, setCryptoFailed] = useState(false)
  const [checking, setChecking] = useState(false)
  // When the wait began: a pay click in this tab, a reload during the wait, or a crypto return.
  const [waitStart, setWaitStart] = useState(() => readPayWait() ?? (crypto === 'success' ? Date.now() : null))
  const [now, setNow] = useState(() => Date.now())

  const waiting = waitStart != null
  const expired = waiting && now - waitStart >= PAY_WAIT_MS

  // fetchPlan is a new function on every provider render; the poller reads the latest one.
  const fetchPlanRef = useRef(fetchPlan)
  useEffect(() => { fetchPlanRef.current = fetchPlan })

  useEffect(() => {
    if (waitStart != null) savePayWait(waitStart)
  }, [waitStart])

  // While waiting: ask the server every ~10s, and whenever this tab comes back into view
  // (the buyer returning from the Gumroad tab). Stops at 15 minutes or as soon as Pro shows.
  useEffect(() => {
    if (!waiting || expired || isPro) return
    const check = () => { setNow(Date.now()); fetchPlanRef.current(undefined, { force: true }) }
    const timer = setInterval(check, PAY_POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [waiting, expired, isPro])

  useEffect(() => { if (isPro) clearPayWait() }, [isPro])

  if (isPro) {
    // A paid wait (or a crypto return) ends with the welcome; a Pro member who simply opened
    // this page is just sent on.
    const welcome = waiting || crypto === 'success'
    return <Navigate to={next} replace state={welcome ? { welcomePro: true } : undefined} />
  }
  if (!planLoaded) return <Holding label="Checking your plan…" />
  if (planError) return <PlanError retry={() => fetchPlan(undefined, { force: true })} />

  const email = user?.email || ''

  const startWait = () => {
    const t = Date.now()
    setWaitStart(t)
    setNow(t)
  }
  const stopWait = () => {
    clearPayWait()
    setWaitStart(null)
  }
  const checkNow = async () => {
    setChecking(true)
    setNow(Date.now())
    try { await fetchPlan(undefined, { force: true }) } finally { setChecking(false) }
  }
  const checkAgain = () => { startWait(); checkNow() }

  const contactAboutEmail = () => navigate('/contact', {
    // Router state, not the query string: the address never lands in a URL, history or logs.
    state: {
      email,
      message: `I paid for BiasForge Pro with a different email address.\n\nMy BiasForge account: ${email}\nThe email I paid with: `,
    },
  })
  const contactAboutDelay = () => navigate('/contact', {
    state: {
      email,
      message: `I paid for BiasForge Pro but my account still shows no active plan.\n\nMy BiasForge account: ${email}\nPaid by: card / crypto\n`,
    },
  })

  const payByCrypto = async () => {
    setCryptoFailed(false)
    setCryptoLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/crypto/create-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, plan: annual ? 'annual' : 'monthly' }),
      })
      const data = await res.json()
      if (!res.ok || !data.success || !data.invoice_url) throw new Error(data.error || 'Could not start crypto checkout')
      window.location.href = data.invoice_url // NOWPayments hosted invoice; it returns to /dashboard?crypto=success
    } catch {
      setCryptoFailed(true)
      setCryptoLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bf-bg text-bf-text px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-md">
        <a href="/" className={`flex items-center gap-2 justify-center min-h-10 rounded-md ${FOCUS_RING}`}>
          <span className="w-8 h-8 rounded-[9px] bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center">
            <Activity size={17} className="text-black" strokeWidth={3} aria-hidden="true" />
          </span>
          <span className="text-[17px] font-semibold tracking-tight">
            Bias<span className="text-cyan-400">Forge</span>
          </span>
        </a>

        {crypto === 'cancelled' && !waiting && (
          <p className="mt-8 flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-3 text-[13px] leading-relaxed text-bf-text-2" role="status">
            <Info size={15} className="mt-0.5 shrink-0 text-bf-muted" aria-hidden="true" />
            Crypto payment cancelled. You can try again, or pay by card.
          </p>
        )}

        {waiting && !expired && (
          <Card padding="none" className="mt-8 p-7 text-center" role="status" aria-live="polite">
            <Loader2 size={28} className="mx-auto text-bf-accent motion-safe:animate-spin" aria-hidden="true" />
            <h1 className="mt-4 text-xl font-semibold tracking-tight">Waiting for your payment…</h1>
            <p className="mt-2 text-sm leading-relaxed text-bf-text-2">
              As soon as the payment is confirmed you&rsquo;ll go straight into the dashboard. This page
              checks on its own; you can leave it open.
            </p>
            <p className="mt-4 text-[13px] text-bf-text-2">
              Paying as <span className="font-semibold text-bf-text break-all">{email}</span>
            </p>
            <Button variant="secondary" className="mt-6" onClick={checkNow} loading={checking} iconLeft={<RefreshCw size={15} aria-hidden="true" />}>
              Check now
            </Button>
            <button type="button" onClick={stopWait} className={`mt-4 block mx-auto text-[13px] text-bf-muted hover:text-bf-text rounded ${FOCUS_RING}`}>
              I didn&rsquo;t complete the payment
            </button>
          </Card>
        )}

        {expired && (
          <Card padding="none" className="mt-8 p-7 text-center" role="status">
            <h1 className="text-xl font-semibold tracking-tight">Still not showing?</h1>
            <p className="mt-2 text-sm leading-relaxed text-bf-text-2">
              Your payment hasn&rsquo;t reached your account yet. Check again, or tell us and we&rsquo;ll
              sort it out. Please don&rsquo;t pay a second time.
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <Button onClick={checkAgain} loading={checking} iconLeft={<RefreshCw size={15} aria-hidden="true" />}>
                Check again
              </Button>
              <Button variant="secondary" onClick={contactAboutDelay}>
                Contact us
              </Button>
            </div>
            <button type="button" onClick={stopWait} className={`mt-4 text-[13px] text-bf-muted hover:text-bf-text rounded ${FOCUS_RING}`}>
              I didn&rsquo;t complete the payment
            </button>
          </Card>
        )}

        {!waiting && (
          <Card padding="none" className="mt-8 p-7">
            <h1 className="text-xl font-semibold tracking-tight">Get BiasForge Pro</h1>
            <p className="mt-1.5 text-sm text-bf-text-2">One plan. Every part of the dashboard.</p>

            <div className="mt-6 inline-flex bf-pill bf-hairline p-0.5 text-[13px]" role="group" aria-label="Billing period">
              {[{ label: 'Annual', on: true }, { label: 'Monthly', on: false }].map(o => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => setAnnual(o.on)}
                  aria-pressed={annual === o.on}
                  className={`bf-pill px-4 py-1.5 min-h-10 transition-colors ${FOCUS_RING} ${
                    annual === o.on ? 'bg-bf-text text-bf-bg font-medium' : 'text-bf-text-2 hover:text-bf-text'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <p className="mt-5 flex items-baseline gap-2">
              <span className="bf-mono text-[36px] font-medium tracking-tight leading-none">
                ${annual ? PRICE_ANNUAL : PRICE_MONTHLY}
              </span>
              <span className="text-[14px] text-bf-muted">{annual ? '/ year' : '/ month'}</span>
            </p>
            <p className="mt-2.5 text-[13.5px] text-bf-muted">
              {annual
                ? <>${ANNUAL_PER_MONTH} / month, billed annually · Save ${ANNUAL_SAVING} vs monthly</>
                : <>or ${PRICE_ANNUAL} / year and save ${ANNUAL_SAVING}</>}
            </p>

            <ul className="mt-6 space-y-2.5">
              {INCLUDED.map(item => (
                <li key={item} className="flex gap-2.5 text-[13.5px] leading-[1.55] text-slate-300">
                  <Check size={15} className="text-bf-bull-soft shrink-0 mt-[3px]" aria-hidden="true" strokeWidth={2.25} />
                  {item}
                </li>
              ))}
            </ul>

            {/* Above the pay buttons: both payment webhooks find the account by this address. */}
            <p className="mt-7 rounded-lg border border-bf-accent/30 bg-bf-accent/10 px-3.5 py-3 text-[13.5px] leading-relaxed">
              Signed in as <span className="font-semibold break-all">{email}</span>. Use this email at checkout.
            </p>

            <Button
              href={GUMROAD_URL}
              external
              size="lg"
              fullWidth
              className="mt-4"
              onClick={startWait}
              iconRight={<ArrowUpRight size={16} aria-hidden="true" />}
            >
              Pay by card
            </Button>
            {annual && (
              <p className="mt-2 text-[12px] leading-relaxed text-bf-muted">
                Gumroad opens on Monthly. Choose <span className="text-bf-text-2">Yearly (${PRICE_ANNUAL})</span> there for the annual plan.
              </p>
            )}

            <Button
              variant="secondary"
              size="lg"
              fullWidth
              className="mt-2.5"
              onClick={payByCrypto}
              loading={cryptoLoading}
              iconLeft={<Bitcoin size={15} className="text-bf-accent" aria-hidden="true" />}
            >
              {cryptoLoading ? 'Redirecting…' : 'Pay with crypto'}
            </Button>
            {cryptoFailed && (
              <p className="mt-2 text-center text-[12px] text-rose-400" role="alert">
                Crypto checkout failed. Please try again or pay by card.
              </p>
            )}

            <p className="mt-4 text-center text-[12.5px] text-bf-muted">Card or crypto · Cancel anytime.</p>
          </Card>
        )}

        <div className="mt-6 flex flex-col items-center gap-3 text-[13px] text-bf-text-2">
          <button type="button" onClick={contactAboutEmail} className={`min-h-10 px-1 hover:text-bf-text underline decoration-white/20 underline-offset-[3px] rounded ${FOCUS_RING}`}>
            Paid with a different email?
          </button>
          <div className="flex items-center gap-5">
            <button type="button" onClick={() => navigate('/billing')} className={`min-h-10 px-1 hover:text-bf-text rounded ${FOCUS_RING}`}>Billing</button>
            <button type="button" onClick={() => navigate('/settings')} className={`min-h-10 px-1 hover:text-bf-text rounded ${FOCUS_RING}`}>Settings</button>
            <button
              type="button"
              onClick={async () => { await logout(); navigate('/login') }}
              className={`min-h-10 px-1 hover:text-bf-text rounded ${FOCUS_RING}`}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
