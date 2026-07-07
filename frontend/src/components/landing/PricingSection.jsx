import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Lock, RefreshCw, CreditCard, Shield, Zap, ArrowRight, Bitcoin, Loader2 } from 'lucide-react'
import RevealSection from './RevealSection'
import { useAuth } from '../../context/AuthContext'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const proFeatures = [
  { text: 'Unlimited AI bias (all major pairs)' },
  { text: 'Full AI reasoning with scenarios' },
  { text: 'Prop Firm Mode (drawdown tracker)' },
  { text: 'Event Playbooks (FOMC, NFP, CPI)' },
  { text: 'Intraday + Swing Bias' },
  { text: 'COT Reports + Earnings Calendar' },
  { text: 'Unlimited news with AI scoring' },
  { text: 'Currency Strength meter' },
  { text: 'Trade Journal with cloud sync' },
  { text: 'Email + Discord support' },
]

const eliteFeatures = [
  { text: 'Everything in Pro' },
  { text: '2 months off vs monthly (17% savings)' },
  { text: 'Priority support' },
  { text: 'Early access to new features' },
  { text: 'Annual strategy review call' },
  { text: 'Discord VIP role' },
]

const trustItems = [
  { icon: <Lock size={14} />, text: 'Card & crypto accepted' },
  { icon: <CreditCard size={14} />, text: 'Cancel anytime' },
  { icon: <RefreshCw size={14} />, text: '30-day money back guarantee' },
  { icon: <Shield size={14} />, text: 'GDPR Compliant' },
]

// Premium crypto CTA — same depth/hover styling as the Pricing page (ui-ux-pro-max guided)
function CryptoPayButton({ plan, loading, error, onClick }) {
  return (
    <div>
      <button
        onClick={() => onClick(plan)}
        disabled={loading}
        aria-busy={loading}
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
        {loading ? (
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
      {error && (
        <p className="text-center text-xs text-red-400 mt-2" role="alert">{error}</p>
      )}
    </div>
  )
}

export default function PricingSection() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [cryptoLoadingPlan, setCryptoLoadingPlan] = useState(null)
  const [cryptoErrorPlan, setCryptoErrorPlan] = useState(null)

  // Card checkout via Gumroad — require an account first (matches the Gumroad flow expectation)
  const handleCheckout = () => {
    if (!user?.email) { navigate('/login'); return }
    window.open('https://biasforge.gumroad.com/l/ntjpje', '_blank')
  }

  // Crypto checkout — needs an email to attribute the payment, so require login first
  const handleCryptoCheckout = async (plan) => {
    if (!user?.email) { navigate('/login'); return }
    setCryptoErrorPlan(null)
    setCryptoLoadingPlan(plan)
    try {
      const res = await fetch(`${API_URL}/api/crypto/create-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, plan }),
      })
      const data = await res.json()
      if (!res.ok || !data.success || !data.invoice_url) {
        throw new Error(data.error || 'Could not start crypto checkout')
      }
      window.location.href = data.invoice_url // redirect to NOWPayments hosted invoice
    } catch (e) {
      setCryptoErrorPlan(plan)
      setCryptoLoadingPlan(null)
    }
  }

  const cryptoError = 'Crypto checkout failed. Please try again or use card payment.'

  return (
    <section id="pricing" className="bg-[#030712] py-24 px-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-widest text-cyan-400 font-bold mb-3">
            Simple, Transparent Pricing
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4 leading-tight">
            Simple Pricing. Pay How You Want.
          </h2>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto">
            Card or crypto. Instant access. Cancel anytime.
          </p>
        </div>

        {/* Cards */}
        <RevealSection delay={100}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">

          {/* Pro Monthly */}
          <div className="relative bg-gradient-to-b from-cyan-500/5 to-emerald-500/5 border-2 border-cyan-500/40 hover:border-cyan-500/60 transition-all duration-300 rounded-2xl p-8 flex flex-col gap-6 shadow-2xl shadow-cyan-500/10">
            <span className="absolute -top-3 right-6 text-[10px] uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-emerald-500 text-black px-3 py-1 rounded-full font-black">
              Most Popular
            </span>
            <div>
              <p className="text-cyan-400 text-sm font-semibold uppercase tracking-wider mb-2">Pro Monthly</p>
              <div className="flex items-end gap-1">
                <span className="text-5xl font-black text-white">$40</span>
                <span className="text-slate-500 text-sm mb-1">/month</span>
              </div>
              <p className="text-slate-400 text-sm mt-2">For serious traders</p>
            </div>
            <ul className="flex flex-col gap-3 flex-1">
              {proFeatures.map(f => (
                <li key={f.text} className="flex items-start gap-3">
                  <Check size={14} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-slate-300">{f.text}</span>
                </li>
              ))}
            </ul>

            {/* CTAs */}
            <div>
              {/* Primary — card via Gumroad */}
              <button
                onClick={handleCheckout}
                className="w-full px-6 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-black text-sm font-bold hover:opacity-90 transition-opacity shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              >
                <Zap size={16} />
                GET PRO
                <ArrowRight size={16} />
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 my-3">
                <div className="h-px flex-1 bg-slate-700/50" />
                <span className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold">or</span>
                <div className="h-px flex-1 bg-slate-700/50" />
              </div>

              {/* Secondary — crypto */}
              <CryptoPayButton
                plan="monthly"
                loading={cryptoLoadingPlan === 'monthly'}
                error={cryptoErrorPlan === 'monthly' ? cryptoError : ''}
                onClick={handleCryptoCheckout}
              />
            </div>
          </div>

          {/* Elite Annual */}
          <div className="relative bg-emerald-500/5 border border-emerald-500/20 hover:border-emerald-500/40 transition-all duration-300 rounded-2xl p-8 flex flex-col gap-6">
            <span className="absolute -top-3 right-6 text-[10px] uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full font-bold">
              Save 17%
            </span>
            <div>
              <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider mb-2">Pro Annual</p>
              <div className="flex items-end gap-1">
                <span className="text-5xl font-black text-white">$399</span>
                <span className="text-slate-500 text-sm mb-1">/year</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">= $33/month — save $81/year</p>
              <p className="text-slate-400 text-sm mt-2">Maximum savings, full access</p>
            </div>
            <ul className="flex flex-col gap-3 flex-1">
              {eliteFeatures.map(f => (
                <li key={f.text} className="flex items-start gap-3">
                  <Check size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-slate-300">{f.text}</span>
                </li>
              ))}
            </ul>

            {/* CTAs */}
            <div>
              {/* Primary — card via Gumroad */}
              <button
                onClick={handleCheckout}
                className="w-full px-6 py-4 rounded-xl border border-emerald-500/40 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/10 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              >
                GET ANNUAL
                <ArrowRight size={16} />
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 my-3">
                <div className="h-px flex-1 bg-slate-700/50" />
                <span className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold">or</span>
                <div className="h-px flex-1 bg-slate-700/50" />
              </div>

              {/* Secondary — crypto */}
              <CryptoPayButton
                plan="annual"
                loading={cryptoLoadingPlan === 'annual'}
                error={cryptoErrorPlan === 'annual' ? cryptoError : ''}
                onClick={handleCryptoCheckout}
              />
            </div>
          </div>

        </div>

        </RevealSection>

        {/* Trust Signals */}
        <div className="flex flex-wrap justify-center gap-6 mt-12">
          {trustItems.map(item => (
            <div key={item.text} className="flex items-center gap-2 text-slate-500 text-sm">
              {item.icon}
              <span>{item.text}</span>
            </div>
          ))}
        </div>

        {/* FAQ teaser */}
        <p className="text-center text-sm text-slate-400 hover:text-cyan-400 cursor-pointer transition-colors mt-8">
          Have questions? Check our FAQ below ↓
        </p>

      </div>
    </section>
  )
}
