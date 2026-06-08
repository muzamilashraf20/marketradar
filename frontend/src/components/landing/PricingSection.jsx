import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Lock, RefreshCw, CreditCard, Shield, Loader2, Zap } from 'lucide-react'

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
  { text: '2 months FREE (17% savings)' },
  { text: 'Priority support' },
  { text: 'Early access to new features' },
  { text: 'Annual strategy review call' },
  { text: 'Discord VIP role' },
]

const trustItems = [
  { icon: <Lock size={14} />, text: 'Secure payments via Gumroad' },
  { icon: <CreditCard size={14} />, text: 'Cancel anytime' },
  { icon: <RefreshCw size={14} />, text: '30-day money back guarantee' },
  { icon: <Shield size={14} />, text: 'GDPR Compliant' },
]

export default function PricingSection() {
  const navigate = useNavigate()

  return (
    <section id="pricing" className="bg-[#030712] py-24 px-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-widest text-cyan-400 font-bold mb-3">
            Simple, Transparent Pricing
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4 leading-tight">
            Try 7 Days Free. Then Choose.
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Full access for 7 days. No credit card required. Cancel anytime.
          </p>
        </div>

        {/* Cards */}
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
            <button
              onClick={() => navigate('/login')}
              className="block text-center px-6 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-black text-sm font-bold hover:opacity-90 transition-opacity shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2"
            >
              <Zap size={16} />
              Start 7-Day Free Trial
            </button>
            <p className="text-[11px] text-slate-600 text-center">No credit card required to start</p>
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
            <button
              onClick={() => navigate('/login')}
              className="block text-center px-6 py-4 rounded-xl border border-emerald-500/40 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/10 transition-all duration-200 flex items-center justify-center gap-2"
            >
              Start 7-Day Free Trial
            </button>
            <p className="text-[11px] text-slate-600 text-center">No credit card required to start</p>
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