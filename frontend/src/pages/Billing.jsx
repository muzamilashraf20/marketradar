import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreditCard, Loader2, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import Button from '../components/ui/Button'
import { useAuth } from '../context/AuthContext'
import { getFreshToken } from '../lib/authFetch'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const SUPPORT_EMAIL = 'support@biasforge.co'

/* Billing: plan, receipt and cancellation. Split out of Settings, with the same
   three calls (/api/billing/status, /resend-receipt, /cancel-request).

   Open to a signed-in account without Pro as well (RequirePro allowUnpaid): a
   lapsed subscriber still needs their receipt, and anyone who paid with a
   different email needs to see what we can and cannot find.

   Gumroad exposes no billing portal we can mint a session for, so this does the
   two things we CAN do: re-send the receipt that carries Gumroad's own "Manage
   membership" link, and file a cancellation request that lands in a human
   inbox. Neither is ever a silent no-op. */
export default function Billing() {
  const { user, isPro, planLoaded } = useAuth()
  const navigate = useNavigate()
  const email = user?.email || ''

  const [billing, setBilling] = useState(null)
  const [billingLoading, setBillingLoading] = useState(true)
  const [billingError, setBillingError] = useState('')
  const [receiptState, setReceiptState] = useState({ status: 'idle', text: '' })
  const [cancelState, setCancelState] = useState({ status: 'idle', text: '' })
  const [cancelNote, setCancelNote] = useState('')

  // Look the subscription up on arrival. State is set only in the promise callbacks.
  useEffect(() => {
    let alive = true
    getFreshToken(user?.token)
      .then(token => fetch(`${API_BASE}/api/billing/status`, { headers: { Authorization: `Bearer ${token}` } }))
      .then(async res => {
        const data = await res.json()
        if (!res.ok || !data.success) throw new Error(data.message || 'Could not load your billing details.')
        if (alive) setBilling(data)
      })
      .catch(e => {
        // The page still renders the manual instructions and the support address below,
        // so a failed lookup degrades instead of dead-ending. A network failure (TypeError,
        // "Failed to fetch") is not a message to show anyone.
        if (!alive) return
        setBillingError(e instanceof TypeError || !e.message
          ? 'We couldn’t load your billing details just now.'
          : e.message)
      })
      .finally(() => { if (alive) setBillingLoading(false) })
    return () => { alive = false }
  }, [user?.token])

  const resendReceipt = async () => {
    setReceiptState({ status: 'loading', text: '' })
    try {
      const token = await getFreshToken(user?.token)
      const res = await fetch(`${API_BASE}/api/billing/resend-receipt`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'We could not re-send your receipt.')
      setReceiptState({ status: 'success', text: `Receipt sent to ${data.sentTo}. Open it and click "Manage membership".` })
    } catch (e) {
      setReceiptState({ status: 'error', text: e.message || 'We could not re-send your receipt.' })
    }
  }

  const requestCancellation = async () => {
    setCancelState({ status: 'loading', text: '' })
    try {
      const token = await getFreshToken(user?.token)
      const res = await fetch(`${API_BASE}/api/billing/cancel-request`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: cancelNote }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'We could not submit your request.')
      setCancelState({ status: 'success', text: 'Request received. We’ll confirm your cancellation by email within 24 hours.' })
      setCancelNote('')
    } catch (e) {
      setCancelState({ status: 'error', text: e.message || 'We could not submit your request.' })
    }
  }

  const planLabel = !planLoaded ? '—' : isPro ? 'Pro Plan' : 'No active plan'

  return (
    <DashboardLayout title="Billing" subtitle="Plan, receipts and cancellation">
      <div className="max-w-2xl space-y-5">

        {/* Plan */}
        <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <CreditCard size={16} className="text-cyan-400 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm text-white font-medium">{planLabel}</p>
              <p className="text-xs text-slate-500 mt-0.5 break-all">{email}</p>
            </div>
          </div>
          {planLoaded && !isPro && (
            <Button size="sm" onClick={() => navigate('/subscribe')}>Get BiasForge Pro</Button>
          )}
        </div>

        {/* Subscription */}
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10">
            <h2 className="text-sm font-semibold text-white">Subscription</h2>
            <p className="text-xs text-slate-500 mt-0.5">Your Gumroad membership, receipt and cancellation</p>
          </div>

          <div className="px-5 pb-5 pt-1 space-y-4">
            {billingLoading && (
              <p className="text-xs text-slate-400 flex items-center gap-2 pt-3" role="status">
                <Loader2 size={13} className="animate-spin text-cyan-400" aria-hidden="true" />
                Looking up your subscription…
              </p>
            )}

            {!billingLoading && (
              <>
                {/* What we found (or honestly, didn't) */}
                {billing?.subscription ? (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 mt-3">
                    <p className="text-xs text-white font-semibold">{billing.subscription.productName || 'BiasForge Pro'}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {billing.subscription.price || '—'}
                      {billing.subscription.recurrence ? ` · ${billing.subscription.recurrence}` : ''}
                      {' · '}
                      <span className={billing.subscription.active ? 'text-emerald-400' : 'text-amber-400'}>
                        {billing.subscription.active ? 'Active' : 'Cancelled / ended'}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">Billed to {billing.email}</p>
                  </div>
                ) : (
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3.5 mt-3">
                    <p className="text-[11px] text-amber-300/90 leading-relaxed">
                      {billingError
                        ? billingError
                        : billing?.lookup && billing.lookup !== 'ok'
                          ? 'We couldn’t reach Gumroad to look up your subscription just now.'
                          : `We couldn’t find a Gumroad subscription under ${email || 'your account email'}.`}
                      {' '}You can still cancel using the steps below, or email{' '}
                      <a href={`mailto:${SUPPORT_EMAIL}`} className="text-cyan-400 hover:underline">{SUPPORT_EMAIL}</a>
                      {' '}and we’ll handle it for you.
                    </p>
                  </div>
                )}

                {/* The honest instructions — Gumroad owns the cancel button */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-white">To cancel or update your card:</p>
                  <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>Open your Gumroad receipt email and click <span className="text-white font-medium">“Manage membership”</span> (or “Subscription settings”).</li>
                    <li>Click <span className="text-white font-medium">“Cancel membership”</span> on the next screen.</li>
                  </ol>
                  <a
                    href="https://app.gumroad.com/library"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] text-cyan-400 hover:underline pt-0.5"
                  >
                    Or open your Gumroad Library <ExternalLink size={11} aria-hidden="true" />
                  </a>
                </div>

                {/* Real action #1 — put that receipt back in their inbox */}
                {billing?.canResendReceipt && (
                  <div className="space-y-2">
                    <button
                      onClick={resendReceipt}
                      disabled={receiptState.status === 'loading'}
                      className="w-full py-2.5 rounded-lg bg-white/5 border border-white/10 text-slate-200 text-xs font-semibold hover:text-white hover:border-white/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {receiptState.status === 'loading' && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
                      {receiptState.status === 'loading' ? 'Sending…' : 'Email me my receipt again'}
                    </button>
                    {receiptState.status === 'success' && (
                      <p className="text-[11px] text-emerald-400 flex items-start gap-1.5">
                        <CheckCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />{receiptState.text}
                      </p>
                    )}
                    {receiptState.status === 'error' && (
                      <p className="text-[11px] text-red-400 flex items-start gap-1.5">
                        <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                        <span>{receiptState.text} Email <a href={`mailto:${SUPPORT_EMAIL}`} className="text-cyan-400 hover:underline">{SUPPORT_EMAIL}</a> and we’ll sort it.</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Real action #2 — the request that can't disappear */}
                <div className="border-t border-white/10 pt-4 space-y-2">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Rather we did it for you? Send us a cancellation request and we’ll action it manually.
                  </p>
                  {cancelState.status !== 'success' && (
                    <>
                      <textarea
                        value={cancelNote}
                        onChange={e => setCancelNote(e.target.value)}
                        rows={2}
                        maxLength={2000}
                        aria-label="Note for the cancellation request (optional)"
                        placeholder="Anything we should know? (optional)"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors resize-none"
                      />
                      <button
                        onClick={requestCancellation}
                        disabled={cancelState.status === 'loading'}
                        className="w-full py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {cancelState.status === 'loading' && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
                        {cancelState.status === 'loading' ? 'Sending request…' : 'Request cancellation'}
                      </button>
                    </>
                  )}
                  {cancelState.status === 'success' && (
                    <p className="text-[11px] text-emerald-400 flex items-start gap-1.5">
                      <CheckCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />{cancelState.text}
                    </p>
                  )}
                  {cancelState.status === 'error' && (
                    <p className="text-[11px] text-red-400 flex items-start gap-1.5">
                      <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <span>{cancelState.text} Please email <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Cancellation request')}&body=${encodeURIComponent(`Please cancel my BiasForge subscription.\n\nAccount email: ${email}`)}`} className="text-cyan-400 hover:underline">{SUPPORT_EMAIL}</a> directly — we’ll confirm within 24 hours.</span>
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
