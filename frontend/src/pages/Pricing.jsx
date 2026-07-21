import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Sparkles, Zap, Crown, ArrowRight, Bitcoin, Loader2 } from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useAuth } from '../context/AuthContext'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export default function Pricing() {
  const navigate = useNavigate()
  const [isAnnual, setIsAnnual] = useState(false)
  const [cryptoLoading, setCryptoLoading] = useState(false)
  const [cryptoError, setCryptoError] = useState('')
  const { isTrialActive, trialDaysLeft, user } = useAuth()

  const handleCheckout = () => {
    window.open('https://biasforge.gumroad.com/l/ntjpje', '_blank')
  }

  const handleCryptoCheckout = async () => {
    // Crypto needs an email to attribute the payment — require login first (like the Gumroad flow expects an account)
    if (!user?.email) { navigate('/login'); return }
    setCryptoError('')
    setCryptoLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/crypto/create-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, plan: isAnnual ? 'annual' : 'monthly' }),
      })
      const data = await res.json()
      if (!res.ok || !data.success || !data.invoice_url) {
        throw new Error(data.error || 'Could not start crypto checkout')
      }
      window.location.href = data.invoice_url // redirect to NOWPayments hosted invoice
    } catch (e) {
      setCryptoError('Crypto checkout failed. Please try again or use card payment.')
      setCryptoLoading(false)
    }
  }

  const price = isAnnual ? '$399' : '$40'
  const period = isAnnual ? '/year' : '/month'

  const features = [
    'Unlimited AI Bias generation',
    'Full Economic Calendar with countdowns',
    'Unlimited Live News with AI scoring',
    'AI Pre-Trade Guardian',
    'All 5 Event Playbooks (FOMC, NFP, CPI, ECB, BOE)',
    'COT Report — Institutional positioning',
    'MarketMovers Radar — Real-time alerts',
    'Currency Strength Meter (advanced)',
    'Prop Firm Mode (drawdown tracker)',
    'Trade Journal with cloud sync',
    'Email support',
  ]

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-full mb-4">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">Pricing</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-3">
            Upgrade to Pro
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            {isTrialActive
              ? `You have ${trialDaysLeft} days left in your trial. Upgrade now to keep access.`
              : 'Get full access to all BiasForge trading tools.'}
          </p>
        </div>

        {/* Toggle */}
        <div className="flex justify-center items-center gap-4">
          <button
            onClick={() => setIsAnnual(false)}
            className={`text-sm font-semibold transition-all ${
              !isAnnual ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Monthly
          </button>

          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className="relative w-14 h-7 rounded-full bg-cyan-500/20 border border-cyan-500/30 transition-all"
          >
            <div
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 transition-all ${
                isAnnual ? 'left-7' : 'left-0.5'
              }`}
            />
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAnnual(true)}
              className={`text-sm font-semibold transition-all ${
                isAnnual ? 'text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Annual
            </button>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
              Save 17%
            </span>
          </div>
        </div>

        {/* Single Pro Card */}
        <div className="relative bg-gradient-to-b from-cyan-500/5 to-emerald-500/5 border-2 border-cyan-500/40 rounded-2xl p-8 transition-all">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full">
              <Zap className="w-3 h-3 text-black" />
              <span className="text-xs font-bold text-black uppercase tracking-wider">BiasForge Pro</span>
            </div>
          </div>

          {/* Price */}
          <div className="text-center mb-6 mt-2">
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-6xl font-black text-white">{price}</span>
              <span className="text-slate-500 text-lg">{period}</span>
            </div>
            {isAnnual && (
              <p className="text-sm text-emerald-400 mt-2">
                Save $81/year — just $33/month
              </p>
            )}
          </div>

          {/* CTAs */}
          <div className="mb-6">
            {/* Primary — card via Gumroad */}
            <button
              onClick={handleCheckout}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-black font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-cyan-500/20 cursor-pointer"
            >
              Upgrade to Pro <ArrowRight className="w-4 h-4" />
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-3">
              <div className="h-px flex-1 bg-slate-700/50" />
              <span className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold">or</span>
              <div className="h-px flex-1 bg-slate-700/50" />
            </div>

            {/* Secondary — premium crypto button (depth + hover lift, ui-ux-pro-max guided) */}
            <button
              onClick={handleCryptoCheckout}
              disabled={cryptoLoading}
              aria-busy={cryptoLoading}
              className="group relative w-full flex items-center justify-center gap-2 py-4 rounded-xl
                         bg-gradient-to-b from-slate-800/90 to-slate-900/95 border border-cyan-500/30
                         text-cyan-300 font-bold text-sm cursor-pointer overflow-hidden
                         shadow-[0_4px_16px_rgba(6,182,212,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]
                         transition-all duration-200 ease-out
                         hover:-translate-y-0.5 hover:border-cyan-400/50 hover:text-cyan-200
                         hover:shadow-[0_10px_30px_rgba(6,182,212,0.28),inset_0_1px_0_rgba(255,255,255,0.09)]
                         active:translate-y-0 active:shadow-[0_2px_10px_rgba(6,182,212,0.2)]
                         disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0
                         motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              {/* subtle top sheen for depth */}
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
              {cryptoLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Redirecting...
                </>
              ) : (
                <>
                  <Bitcoin className="w-4 h-4 text-cyan-400 transition-transform duration-200 group-hover:scale-110" />
                  Pay with Crypto
                </>
              )}
            </button>
            <p className="text-center text-[11px] text-slate-500 mt-2">BTC · USDT · USDC accepted</p>
            {cryptoError && (
              <p className="text-center text-xs text-red-400 mt-2" role="alert">{cryptoError}</p>
            )}
          </div>

          {/* Features */}
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
              Everything included
            </p>
            {features.map((feature) => (
              <div key={feature} className="flex items-start gap-2.5">
                <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                <span className="text-sm text-slate-300">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trust badges */}
        <div className="text-center pt-4">
          <p className="text-xs text-slate-500 mb-3">Card via Gumroad · Crypto via NOWPayments · Cancel anytime · 30-day money-back guarantee</p>
          <div className="flex items-center justify-center gap-6 text-xs text-slate-600">
            <span>All major cards accepted</span>
            <span>·</span>
            <span>Works worldwide</span>
            <span>·</span>
            <span>Instant access</span>
          </div>
        </div>

      </div>
    </DashboardLayout>
  )
}