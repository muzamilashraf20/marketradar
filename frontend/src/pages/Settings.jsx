import { useState, useEffect } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { Settings, User, Bell, Shield, CreditCard, LogOut, Mail, Loader2, CheckCircle, AlertCircle, Share2, Copy, Check, ExternalLink } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const SUPPORT_EMAIL = 'support@biasforge.co'

const getFreshToken = async (fallback) => {
  try {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token || fallback
  } catch { return fallback }
}

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <label className={`relative inline-flex items-center ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only peer"
      />
      <div className="w-10 h-5 bg-white/10 peer-checked:bg-cyan-500 rounded-full transition-colors duration-200 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
    </label>
  )
}

export default function SettingsPage() {
  const { user, plan: planRow, planLoaded, logout } = useAuth()
  const navigate = useNavigate()

  const email = user?.email || ''
  // `user` is the Supabase auth user — it has no .plan. The tier lives on the
  // separate `plan` value from AuthContext; reading user?.plan meant this card
  // showed "Pro Plan" to everyone, free accounts included.
  const tier = planRow?.tier || null
  const planLabel = !planLoaded ? '—' : tier === 'pro' ? 'Pro' : 'Free'

  // Email notification state
  const [emailSub, setEmailSub] = useState({
    subscribed: false,
    preferences: { calendar: true, news: true },
  })
  const [emailLoading, setEmailLoading] = useState(true)
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailMessage, setEmailMessage] = useState({ type: '', text: '' })
const [copied, setCopied] = useState(false)

  const referralLink = `https://biasforge.co/login?ref=${user?.id || 'invite'}`

  const copyReferral = () => {
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareTwitter = () => {
    const text = encodeURIComponent('I use BiasForge for AI-powered macro trading bias, prop firm risk tools & more. Check it out:')
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(referralLink)}`, '_blank')
  }

  const shareWhatsApp = () => {
    const text = encodeURIComponent(`Check out BiasForge — AI macro trading tools for funded traders: ${referralLink}`)
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }
  // Load email subscription status on mount
  useEffect(() => {
    if (!email) return
    fetchEmailStatus()
  }, [email])

  const fetchEmailStatus = async () => {
    try {
      setEmailLoading(true)
      const res = await fetch(`${API_BASE}/api/email/status?email=${encodeURIComponent(email)}`)
      const data = await res.json()
      setEmailSub({
        subscribed: data.subscribed || false,
        preferences: data.preferences || { calendar: true, news: true },
      })
    } catch (e) {
      console.error('Email status fetch error:', e)
    } finally {
      setEmailLoading(false)
    }
  }

  const handleSubscribe = async () => {
    setEmailSaving(true)
    setEmailMessage({ type: '', text: '' })
    try {
      const res = await fetch(`${API_BASE}/api/email/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, preferences: emailSub.preferences }),
      })
      const data = await res.json()
      if (data.success) {
        setEmailSub(prev => ({ ...prev, subscribed: true }))
        setEmailMessage({ type: 'success', text: 'Subscribed! Welcome email sent to your inbox.' })
      } else {
        setEmailMessage({ type: 'error', text: data.error || 'Subscription failed' })
      }
    } catch (e) {
      setEmailMessage({ type: 'error', text: 'Network error. Try again.' })
    } finally {
      setEmailSaving(false)
      setTimeout(() => setEmailMessage({ type: '', text: '' }), 5000)
    }
  }

  const handleUnsubscribe = async () => {
    setEmailSaving(true)
    setEmailMessage({ type: '', text: '' })
    try {
      const res = await fetch(`${API_BASE}/api/email/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, preferences: emailSub.preferences }),
      })
      // Use the unsubscribe by setting active false via preferences route
      await fetch(`${API_BASE}/api/email/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, preferences: { calendar: false, news: false } }),
      })
      setEmailSub(prev => ({ ...prev, subscribed: false }))
      setEmailMessage({ type: 'success', text: 'Unsubscribed from all email alerts.' })
    } catch (e) {
      setEmailMessage({ type: 'error', text: 'Network error. Try again.' })
    } finally {
      setEmailSaving(false)
      setTimeout(() => setEmailMessage({ type: '', text: '' }), 5000)
    }
  }

  const handlePreferenceChange = async (key) => {
    const updated = { ...emailSub.preferences, [key]: !emailSub.preferences[key] }
    setEmailSub(prev => ({ ...prev, preferences: updated }))

    try {
      await fetch(`${API_BASE}/api/email/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, preferences: updated }),
      })
    } catch (e) {
      console.error('Preference update error:', e)
    }
  }

  // ── Billing ──────────────────────────────────────────────────────────────
  // Gumroad exposes no billing portal we can mint a session for, so "Manage"
  // opens a panel that does the two things we CAN do: re-send the receipt that
  // carries Gumroad's own "Manage membership" link, and file a cancellation
  // request that lands in a human inbox. Neither is ever a silent no-op.
  const [billingOpen, setBillingOpen] = useState(false)
  const [billing, setBilling] = useState(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingError, setBillingError] = useState('')
  const [receiptState, setReceiptState] = useState({ status: 'idle', text: '' })
  const [cancelState, setCancelState] = useState({ status: 'idle', text: '' })
  const [cancelNote, setCancelNote] = useState('')

  const openBilling = async () => {
    const next = !billingOpen
    setBillingOpen(next)
    if (!next) return
    setBillingLoading(true)
    setBillingError('')
    setReceiptState({ status: 'idle', text: '' })
    setCancelState({ status: 'idle', text: '' })
    try {
      const token = await getFreshToken(user?.token)
      const res = await fetch(`${API_BASE}/api/billing/status`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'Could not load your billing details.')
      setBilling(data)
    } catch (e) {
      // Panel still renders the manual instructions + support address below,
      // so a failed lookup degrades instead of dead-ending.
      setBillingError(e.message || 'Could not load your billing details.')
    } finally {
      setBillingLoading(false)
    }
  }

  const resendReceipt = async () => {
    setReceiptState({ status: 'loading', text: '' })
    try {
      const token = await getFreshToken(user?.token)
      const res = await fetch(`${API_BASE}/api/billing/resend-receipt`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'We could not re-send your receipt.')
      }
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
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
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

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Settings size={18} className="text-cyan-400" />
            </div>
            <h1 className="text-xl font-bold text-white">Settings</h1>
          </div>
          <p className="text-slate-400 text-sm ml-12">
            Manage your account, preferences, and notifications.
          </p>
        </div>

        {/* Account Badge */}
        <div className="flex items-center gap-4 px-5 py-4 rounded-xl border border-white/10 bg-white/5">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center text-black font-bold text-sm shrink-0">
            {email.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate">{email}</p>
            <p className="text-cyan-400 text-xs">{planLabel} Plan</p>
          </div>
          {/* Was hardcoded "Active" — read the resolved tier like the label does. */}
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
            tier === 'pro'
              ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'
              : 'border-white/10 bg-white/5 text-slate-400'
          }`}>
            {!planLoaded ? '…' : tier === 'pro' ? 'Active' : 'Inactive'}
          </span>
        </div>

        {/* Profile */}
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10">
            <User size={15} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-white">Profile</h2>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-slate-400 shrink-0">Full Name</label>
              <input
                type="text"
                placeholder="Your name"
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 w-56 transition-colors"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-slate-400 shrink-0">Email</label>
              <input
                type="email"
                value={email}
                readOnly
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-500 w-56 cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* ─── EMAIL NOTIFICATIONS ─── */}
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-cyan-500/10">
            <Mail size={15} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-white">Email Alerts</h2>
            {emailLoading && <Loader2 size={13} className="text-cyan-400 animate-spin ml-auto" />}
            {!emailLoading && emailSub.subscribed && (
              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                ACTIVE
              </span>
            )}
          </div>

          <div className="px-5 py-4 space-y-4">
            <p className="text-xs text-slate-500">
              Get email alerts for high impact economic events (1hr & 30min reminders) and breaking market news (impact 8+).
            </p>

            {!emailLoading && !emailSub.subscribed && (
              <div className="bg-white/[0.03] border border-dashed border-white/10 rounded-xl p-5 text-center">
                <Mail size={24} className="text-cyan-400 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-white mb-1">Enable Email Alerts</h3>
                <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
                  Never miss a high impact event. Get alerts for FOMC, NFP, CPI and breaking news directly in your inbox.
                </p>
                <button
                  onClick={handleSubscribe}
                  disabled={emailSaving}
                  className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 text-black text-xs font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2 mx-auto"
                >
                  {emailSaving ? (
                    <><Loader2 size={13} className="animate-spin" /> Subscribing...</>
                  ) : (
                    <><Bell size={13} /> Subscribe to Alerts</>
                  )}
                </button>
              </div>
            )}

            {!emailLoading && emailSub.subscribed && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm text-white font-medium">📅 Calendar Event Alerts</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">High impact events — 1hr & 30min reminders</p>
                    </div>
                    <ToggleSwitch
                      checked={emailSub.preferences.calendar}
                      onChange={() => handlePreferenceChange('calendar')}
                    />
                  </div>

                  <div className="border-t border-white/5" />

                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm text-white font-medium">📰 Breaking News Alerts</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Market-moving news with impact score 8+</p>
                    </div>
                    <ToggleSwitch
                      checked={emailSub.preferences.news}
                      onChange={() => handlePreferenceChange('news')}
                    />
                  </div>
                </div>

                <div className="border-t border-white/5 pt-3">
                  <button
                    onClick={handleUnsubscribe}
                    disabled={emailSaving}
                    className="text-xs text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1"
                  >
                    {emailSaving ? (
                      <><Loader2 size={11} className="animate-spin" /> Processing...</>
                    ) : (
                      'Unsubscribe from all alerts'
                    )}
                  </button>
                </div>
              </>
            )}

            {/* Status message */}
            {emailMessage.text && (
              <div className={`flex items-center gap-2 p-3 rounded-lg text-xs ${
                emailMessage.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}>
                {emailMessage.type === 'success' ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
                {emailMessage.text}
              </div>
            )}
          </div>
        </div>

        {/* General Notifications */}
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10">
            <Bell size={15} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-white">In-App Notifications</h2>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-slate-400">Bias Change Alerts</label>
              <ToggleSwitch checked={true} onChange={() => {}} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-slate-400">Event Reminders</label>
              <ToggleSwitch checked={false} onChange={() => {}} />
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10">
            <Shield size={15} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-white">Security</h2>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-slate-400 shrink-0">Current Password</label>
              <input
                type="password"
                placeholder="••••••••"
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 w-56 transition-colors"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-slate-400 shrink-0">New Password</label>
              <input
                type="password"
                placeholder="••••••••"
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 w-56 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Billing */}
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10">
            <CreditCard size={15} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-white">Billing</h2>
          </div>
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-white font-medium">{planLabel} Plan</p>
              <p className="text-xs text-slate-500 mt-0.5">Manage your subscription and billing details</p>
            </div>
            <button
              onClick={openBilling}
              disabled={billingLoading}
              className="text-xs font-semibold px-3 py-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {billingLoading && <Loader2 size={12} className="animate-spin" />}
              {billingOpen ? 'Close' : 'Manage'}
            </button>
          </div>

          {billingOpen && (
            <div className="px-5 pb-5 pt-1 border-t border-white/10 space-y-4">

              {billingLoading && (
                <p className="text-xs text-slate-400 flex items-center gap-2 pt-3">
                  <Loader2 size={13} className="animate-spin text-cyan-400" />
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
                      Or open your Gumroad Library <ExternalLink size={11} />
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
                        {receiptState.status === 'loading' && <Loader2 size={13} className="animate-spin" />}
                        {receiptState.status === 'loading' ? 'Sending…' : 'Email me my receipt again'}
                      </button>
                      {receiptState.status === 'success' && (
                        <p className="text-[11px] text-emerald-400 flex items-start gap-1.5">
                          <CheckCircle size={12} className="mt-0.5 shrink-0" />{receiptState.text}
                        </p>
                      )}
                      {receiptState.status === 'error' && (
                        <p className="text-[11px] text-red-400 flex items-start gap-1.5">
                          <AlertCircle size={12} className="mt-0.5 shrink-0" />
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
                          placeholder="Anything we should know? (optional)"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors resize-none"
                        />
                        <button
                          onClick={requestCancellation}
                          disabled={cancelState.status === 'loading'}
                          className="w-full py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {cancelState.status === 'loading' && <Loader2 size={13} className="animate-spin" />}
                          {cancelState.status === 'loading' ? 'Sending request…' : 'Request cancellation'}
                        </button>
                      </>
                    )}
                    {cancelState.status === 'success' && (
                      <p className="text-[11px] text-emerald-400 flex items-start gap-1.5">
                        <CheckCircle size={12} className="mt-0.5 shrink-0" />{cancelState.text}
                      </p>
                    )}
                    {cancelState.status === 'error' && (
                      <p className="text-[11px] text-red-400 flex items-start gap-1.5">
                        <AlertCircle size={12} className="mt-0.5 shrink-0" />
                        <span>{cancelState.text} Please email <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Cancellation request')}&body=${encodeURIComponent(`Please cancel my BiasForge subscription.\n\nAccount email: ${email}`)}`} className="text-cyan-400 hover:underline">{SUPPORT_EMAIL}</a> directly — we’ll confirm within 24 hours.</span>
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {/* Telegram Notifications */}
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10">
            <Share2 size={15} className="text-[#26A5E4]" />
            <h2 className="text-sm font-semibold text-white">Telegram Alerts</h2>
          </div>
          <div className="px-5 py-4 space-y-4">
            <p className="text-xs text-slate-400">
              Get real-time trading alerts (bias updates, calendar events, high-impact news) directly on Telegram.
            </p>
            <div className="bg-[#26A5E4]/5 border border-[#26A5E4]/20 rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold text-white">How to connect:</p>
              <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside">
                <li>Open Telegram app</li>
                <li>Search for <span className="text-[#26A5E4] font-semibold">@BiasForgeAlertsBot</span></li>
                <li>Send <span className="text-cyan-400 font-mono bg-white/5 px-1.5 py-0.5 rounded">/start</span> to activate</li>
              </ol>
            </div>
            
             <a href="https://t.me/BiasForgeAlertsBot" target="_blank" rel="noopener noreferrer" className="block text-center py-2.5 rounded-lg bg-[#26A5E4]/10 border border-[#26A5E4]/20 text-[#26A5E4] text-xs font-semibold hover:bg-[#26A5E4]/20 transition-colors">
              Open @BiasForgeAlertsBot on Telegram
            </a>
            <p className="text-[10px] text-slate-600">
              Commands: /start (subscribe) · /stop (unsubscribe) · /calendar on/off · /news on/off
            </p>
          </div>
        </div>
{/* Referral */}
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10">
            <Share2 size={15} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Refer a Trader</h2>
          </div>
          <div className="px-5 py-4 space-y-4">
            <p className="text-xs text-slate-400">
              Share BiasForge with other traders. More users = better platform for everyone.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={referralLink}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs text-slate-300 font-mono truncate"
              />
              <button
                onClick={copyReferral}
                className={`px-3 py-2.5 rounded-lg border text-xs font-semibold transition-all ${
                  copied
                    ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:border-white/20'
                }`}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={shareTwitter}
                className="flex-1 py-2 rounded-lg bg-[#1DA1F2]/10 border border-[#1DA1F2]/20 text-[#1DA1F2] text-xs font-semibold hover:bg-[#1DA1F2]/20 transition-colors"
              >
                Share on X / Twitter
              </button>
              <button
                onClick={shareWhatsApp}
                className="flex-1 py-2 rounded-lg bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] text-xs font-semibold hover:bg-[#25D366]/20 transition-colors"
              >
                Share on WhatsApp
              </button>
            </div>
          </div>
        </div>
        {/* Save + Logout */}
        <div className="flex items-center justify-between pb-8">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-red-400 transition-colors"
          >
            <LogOut size={15} />
            Sign Out
          </button>
          <button className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-sm transition-colors">
            Save Changes
          </button>
        </div>

      </div>
    </DashboardLayout>
  )
}