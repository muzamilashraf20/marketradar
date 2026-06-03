import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X, Lock, RefreshCw, CreditCard, Shield, Loader2 } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const starterFeatures = [
  { text: '1 asset daily bias (EURUSD)', included: true },
  { text: 'Basic economic calendar', included: true },
  { text: '5 news headlines/day', included: true },
  { text: 'Community support', included: true },
  { text: 'Prop Firm Mode', included: false },
  { text: 'Event Playbooks', included: false },
  { text: 'COT Reports', included: false },
  { text: 'Full AI reasoning', included: false },
]

const proFeatures = [
  { text: 'Unlimited assets daily bias', included: true },
  { text: 'Full AI reasoning with scenarios', included: true },
  { text: 'Prop Firm Mode (drawdown tracker)', included: true },
  { text: 'Event Playbooks (FOMC, NFP, CPI)', included: true },
  { text: 'Intraday + Swing Bias', included: true },
  { text: 'COT Reports + Earnings Calendar', included: true },
  { text: 'Unlimited news with AI summaries', included: true },
  { text: 'Priority Discord access', included: true },
  { text: 'Email + Discord support', included: true },
]

const eliteFeatures = [
  { text: 'Everything in Pro', included: true },
  { text: '2 months FREE (17% savings)', included: true },
  { text: 'Priority support', included: true },
  { text: 'Early access to new features', included: true },
  { text: 'Annual strategy review call', included: true },
  { text: 'Discord VIP role', included: true },
]

const trustItems = [
  { icon: <Lock size={14} />, text: 'Secure payments via Gumroad' },
  { icon: <CreditCard size={14} />, text: 'Cancel anytime' },
  { icon: <RefreshCw size={14} />, text: '30-day money back guarantee' },
  { icon: <Shield size={14} />, text: 'GDPR Compliant' },
]

function FeatureItem({ text, included }) {
  return (
    <li className="flex items-start gap-3">
      {included
        ? <Check size={14} className="text-cyan-400 mt-0.5 flex-shrink-0" />
        : <X size={14} className="text-slate-600 mt-0.5 flex-shrink-0" />}
      <span className={`text-sm ${included ? 'text-slate-300' : 'text-slate-600'}`}>
        {text}
      </span>
    </li>
  )
}

export default function PricingSection() {
  const [annual, setAnnual] = useState(false)
  const [loadingPlan, setLoadingPlan] = useState(null)
  const navigate = useNavigate()

  const handleCheckout = (planKey) => {
    window.open('https://biasforge.gumroad.com/l/ntjpje', '_blank')
  }

  return (
    <section id="pricing" className="bg-[#030712] py-24 px-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-xs uppercase tracking-widest text-cyan-400 font-bold mb-3">
            Simple, Transparent Pricing
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4 leading-tight">
            Start Free. Upgrade When Ready.
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            No hidden fees. Cancel anytime. Built for traders, not VCs.
          </p>
        </div>

        {/* Toggle */}
        <div className="flex justify-center mb-12">
          <div className="bg-slate-900/50 p-1 rounded-full inline-flex">
            <button
              onClick={() => setAnnual(false)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${!annual ? 'bg-cyan-500 text-black' : 'text-slate-400 hover:text-white'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${annual ? 'bg-cyan-500 text-black' : 'text-slate-400 hover:text-white'}`}
            >
              Annual <span className="text-xs">(Save 17%)</span>
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">

          {/* Starter */}
          <div className="bg-slate-900/40 border border-white/10 hover:border-white/20 transition-all duration-300 rounded-2xl p-8 flex flex-col gap-6">
            <div>
              <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-2">Starter</p>
              <div className="flex items-end gap-1">
                <span className="text-4xl font-black text-white">$0</span>
                <span className="text-slate-500 text-sm mb-1">/forever</span>
              </div>
              <p className="text-slate-500 text-sm mt-2">Perfect for trying BiasForge</p>
            </div>
            <ul className="flex flex-col gap-3 flex-1">
              {starterFeatures.map(f => <FeatureItem key={f.text} {...f} />)}
            </ul>
            <button
              onClick={() => navigate('/login')}
              className="block text-center px-6 py-3 rounded-xl border border-white/20 text-white text-sm font-semibold hover:bg-white/5 transition-all duration-200"
            >
              Start Free
            </button>
          </div>

          {/* Pro */}
          <div className="relative bg-gradient-to-b from-cyan-500/5 to-emerald-500/5 border-2 border-cyan-500/40 hover:border-cyan-500/60 transition-all duration-300 rounded-2xl p-8 flex flex-col gap-6 md:scale-105 shadow-2xl shadow-cyan-500/10">
            <span className="absolute -top-3 right-6 text-[10px] uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-emerald-500 text-black px-3 py-1 rounded-full font-black">
              Most Popular
            </span>
            <div>
              <p className="text-cyan-400 text-sm font-semibold uppercase tracking-wider mb-2">Pro</p>
              <div className="flex items-end gap-1">
                <span className="text-4xl font-black text-white">{annual ? '$33' : '$40'}</span>
                <span className="text-slate-500 text-sm mb-1">/month</span>
              </div>
              {annual && <p className="text-xs text-slate-500 mt-1">billed annually ($399)</p>}
              <p className="text-slate-400 text-sm mt-2">For serious funded traders</p>
            </div>
            <ul className="flex flex-col gap-3 flex-1">
              {proFeatures.map(f => <FeatureItem key={f.text} {...f} />)}
            </ul>
            <button
              onClick={() => handleCheckout(annual ? 'pro_annual' : 'pro_monthly')}
              disabled={loadingPlan !== null}
              className="block text-center px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-black text-sm font-bold hover:opacity-90 transition-opacity shadow-lg shadow-cyan-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loadingPlan === 'pro_monthly' || loadingPlan === 'pro_annual' ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Loading...
                </>
              ) : annual ? (
                'Get Annual Plan'
              ) : (
                'Get Pro Monthly'
              )}
            </button>
          </div>

          {/* Elite Annual */}
          <div className="relative bg-emerald-500/5 border border-emerald-500/20 hover:border-emerald-500/40 transition-all duration-300 rounded-2xl p-8 flex flex-col gap-6">
            <span className="absolute -top-3 right-6 text-[10px] uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full font-bold">
              Best Value
            </span>
            <div>
              <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider mb-2">Elite Annual</p>
              <div className="flex items-end gap-1">
                <span className="text-4xl font-black text-white">$399</span>
                <span className="text-slate-500 text-sm mb-1">/year</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">= $33/month</p>
              <p className="text-slate-400 text-sm mt-2">Maximum savings, full access</p>
            </div>
            <ul className="flex flex-col gap-3 flex-1">
              {eliteFeatures.map(f => <FeatureItem key={f.text} {...f} />)}
            </ul>
            <button
              onClick={() => handleCheckout('pro_annual')}
              disabled={loadingPlan !== null}
              className="block text-center px-6 py-3 rounded-xl border border-emerald-500/40 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/10 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loadingPlan === 'pro_annual' ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Loading...
                </>
              ) : (
                'Get Annual Plan'
              )}
            </button>
          </div>

        </div>

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