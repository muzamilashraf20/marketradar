import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Sparkles, Zap, Crown, ArrowRight } from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useAuth } from '../context/AuthContext'

export default function Pricing() {
  const navigate = useNavigate()
  const [isAnnual, setIsAnnual] = useState(false)
  const { isTrialActive, trialDaysLeft } = useAuth()

  const handleCheckout = () => {
    window.open('https://biasforge.gumroad.com/l/ntjpje', '_blank')
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
    'Email + Discord support',
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

          {/* CTA */}
          <button
            onClick={handleCheckout}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-black font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-cyan-500/20 mb-6"
          >
            Upgrade to Pro <ArrowRight className="w-4 h-4" />
          </button>

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
          <p className="text-xs text-slate-500 mb-3">Secure payment via Gumroad · Cancel anytime · 30-day money-back guarantee</p>
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