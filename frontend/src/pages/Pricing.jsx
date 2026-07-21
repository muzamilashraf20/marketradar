import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Sparkles, Zap, Crown, ArrowRight, Bitcoin, Loader2, CreditCard } from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useAuth } from '../context/AuthContext'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export default function Pricing() {
  const navigate = useNavigate()
  const [isAnnual, setIsAnnual] = useState(false)
  const [cryptoLoading, setCryptoLoading] = useState(false)
  const [cryptoError, setCryptoError] = useState('')
  // Whether the payment-method choice is expanded under the primary CTA. Presentation only.
  const [showPayChoice, setShowPayChoice] = useState(false)
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

          {/* CTAs — the primary button reveals the payment methods rather than picking one */}
          <div className="mb-6">
            <button
              onClick={() => setShowPayChoice(v => !v)}
              aria-expanded={showPayChoice}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-black font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-cyan-500/20 cursor-pointer"
            >
              Upgrade to Pro <ArrowRight className="w-4 h-4" />
            </button>

            {showPayChoice && (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={handleCheckout}
                    className="flex items-center justify-center gap-2 py-3 px-3 rounded-lg border border-white/15 bg-white/5
                               text-slate-200 font-semibold text-xs cursor-pointer
                               hover:bg-white/10 hover:border-white/25 transition-colors duration-200
                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                  >
                    <CreditCard className="w-4 h-4 text-slate-300" />
                    Pay with card
                  </button>
                  <button
                    onClick={handleCryptoCheckout}
                    disabled={cryptoLoading}
                    aria-busy={cryptoLoading}
                    className="group flex items-center justify-center gap-2 py-3 px-3 rounded-lg
                               border border-cyan-500/30 bg-gradient-to-b from-slate-800/90 to-slate-900/95
                               text-cyan-300 font-semibold text-xs cursor-pointer
                               hover:border-cyan-400/50 hover:text-cyan-200 transition-colors duration-200
                               disabled:opacity-60 disabled:cursor-not-allowed
                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                  >
                    {cryptoLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Redirecting...
                      </>
                    ) : (
                      <>
                        <Bitcoin className="w-4 h-4 text-cyan-400" />
                        Pay with crypto
                      </>
                    )}
                  </button>
                </div>
                <p className="text-center text-[11px] text-slate-500 mt-2">BTC · USDT · USDC accepted</p>
                {cryptoError && (
                  <p className="text-center text-xs text-red-400 mt-2" role="alert">{cryptoError}</p>
                )}
              </div>
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