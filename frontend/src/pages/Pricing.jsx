import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Sparkles, Zap, Crown, ArrowRight } from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Get started with the basics',
    icon: Sparkles,
    color: 'slate',
    cta: 'Current Plan',
    disabled: true,
    features: [
      '1 AI Bias per day',
      'Basic Economic Calendar',
      '5 News articles per day',
      'Currency Strength Meter',
      'Community Discord access',
    ],
    notIncluded: [
      'AI Pre-Trade Guardian',
      'Event Playbooks',
      'COT Report',
      'Trump Tracker',
      'Priority support',
    ],
  },
  {
    key: 'pro_monthly',
    annualKey: 'pro_annual',
    name: 'Pro',
    price: '$40',
    annualPrice: '$399',
    period: '/month',
    annualPeriod: '/year',
    description: 'Everything a funded trader needs',
    icon: Zap,
    color: 'cyan',
    popular: true,
    cta: 'Get Pro',
    features: [
      'Unlimited AI Bias generation',
      'Full Economic Calendar with countdowns',
      'Unlimited Live News with AI scoring',
      'AI Pre-Trade Guardian (World\'s First)',
      'All 5 Event Playbooks (FOMC, NFP, CPI, ECB, BOE)',
      'COT Report — Institutional positioning',
      'Trump Tracker — Real-time political alerts',
      'Currency Strength Meter (advanced)',
      'Session Tracker',
      'Email support',
    ],
  },
]

export default function Pricing() {
  const navigate = useNavigate()
  const [isAnnual, setIsAnnual] = useState(false)
  const [loading, setLoading] = useState(null)

  const handleCheckout = (planKey) => {
    if (!planKey || planKey === 'free') return
    window.open('https://biasforge.gumroad.com/l/ntjpje', '_blank')
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-full mb-4">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">Pricing</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-3">
            Choose your edge
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Start free. Upgrade when you're ready to dominate the markets.
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

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {PLANS.map((plan) => {
            const Icon = plan.icon
            const planKey = isAnnual && plan.annualKey ? plan.annualKey : plan.key
            const price = isAnnual && plan.annualPrice ? plan.annualPrice : plan.price
            const period = isAnnual && plan.annualPeriod ? plan.annualPeriod : plan.period
            const isLoading = loading === planKey

            return (
              <div
                key={plan.key}
                className={`relative bg-[#020617] border ${
                  plan.popular ? 'border-cyan-500/40' : 'border-white/10'
                } rounded-2xl p-8 transition-all hover:border-cyan-500/30`}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <div className="flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full">
                      <Sparkles className="w-3 h-3 text-black" />
                      <span className="text-xs font-bold text-black uppercase tracking-wider">Most Popular</span>
                    </div>
                  </div>
                )}

                {/* Plan Icon + Name */}
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-10 h-10 rounded-xl ${
                    plan.popular
                      ? 'bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30'
                      : 'bg-white/5 border border-white/10'
                  } flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${plan.popular ? 'text-cyan-400' : 'text-slate-400'}`} />
                  </div>
                  <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                </div>

                <p className="text-sm text-slate-400 mb-6">{plan.description}</p>

                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-5xl font-black tracking-tight ${
                      plan.popular ? 'text-white' : 'text-slate-300'
                    }`}>
                      {price}
                    </span>
                    <span className="text-slate-500 text-sm">{period}</span>
                  </div>
                  {isAnnual && plan.annualPrice && plan.popular && (
                    <p className="text-xs text-emerald-400 mt-1">
                      Save $81/year — $33/month effectively
                    </p>
                  )}
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => handleCheckout(planKey)}
                  disabled={plan.disabled || isLoading}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all mb-6 ${
                    plan.disabled
                      ? 'bg-white/5 border border-white/10 text-slate-500 cursor-not-allowed'
                      : plan.popular
                      ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-black hover:from-cyan-400 hover:to-emerald-400 shadow-lg shadow-cyan-500/20'
                      : 'bg-white/10 border border-white/10 text-white hover:bg-white/15'
                  } ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      {plan.cta}
                      {!plan.disabled && <ArrowRight className="w-4 h-4" />}
                    </>
                  )}
                </button>

                {/* Features */}
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                    What's included
                  </p>
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2.5">
                      <Check className={`w-4 h-4 mt-0.5 shrink-0 ${
                        plan.popular ? 'text-emerald-400' : 'text-slate-400'
                      }`} />
                      <span className="text-sm text-slate-300">{feature}</span>
                    </div>
                  ))}

                  {plan.notIncluded && (
                    <>
                      <div className="pt-3 border-t border-white/5" />
                      {plan.notIncluded.map((feature) => (
                        <div key={feature} className="flex items-start gap-2.5 opacity-50">
                          <Check className="w-4 h-4 mt-0.5 shrink-0 text-slate-600" />
                          <span className="text-sm text-slate-500 line-through">{feature}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Trust badges */}
        <div className="text-center pt-4">
          <p className="text-xs text-slate-500 mb-3">🔒 Secure payment via Lemon Squeezy · Cancel anytime · 14-day money-back guarantee</p>
          <div className="flex items-center justify-center gap-6 text-xs text-slate-600">
            <span>💳 All major cards accepted</span>
            <span>•</span>
            <span>🌍 Works worldwide</span>
            <span>•</span>
            <span>⚡ Instant access</span>
          </div>
        </div>

        {/* FAQ Mini */}
        <div className="bg-[#020617] border border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">Common Questions</h3>
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-white font-semibold mb-1">Can I cancel anytime?</p>
              <p className="text-slate-400">Yes. Cancel from your account settings — no questions asked.</p>
            </div>
            <div>
              <p className="text-white font-semibold mb-1">What payment methods are accepted?</p>
              <p className="text-slate-400">All major credit/debit cards (Visa, Mastercard, Amex) through Lemon Squeezy. Works globally.</p>
            </div>
            <div>
              <p className="text-white font-semibold mb-1">Is there a refund policy?</p>
              <p className="text-slate-400">Yes — 14 days, no questions asked. We're confident you'll love BiasForge.</p>
            </div>
          </div>
        </div>

      </div>
    </DashboardLayout>
  )
}