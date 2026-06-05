import { useState, useEffect } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { Settings, User, Bell, Shield, CreditCard, LogOut, Mail, Loader2, CheckCircle, AlertCircle, Share2, Copy, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

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
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const email = user?.email || ''
  const plan = user?.plan || 'Pro'

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
            <p className="text-cyan-400 text-xs">{plan} Plan</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
            Active
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
              <p className="text-sm text-white font-medium">{plan} Plan</p>
              <p className="text-xs text-slate-500 mt-0.5">Manage your subscription and billing details</p>
            </div>
            <button className="text-xs font-semibold px-3 py-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/20 transition-colors">
              Manage
            </button>
          </div>
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