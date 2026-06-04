import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Zap, BarChart2, Newspaper, Calendar, ShieldCheck,
  ArrowRight, X, Sparkles
} from 'lucide-react'

const STEPS = [
  {
    icon: <Sparkles size={32} className="text-cyan-400" />,
    title: 'Welcome to BiasForge',
    description: 'Your AI-powered macro trading intelligence platform. Built for funded & prop firm traders who want clarity before every session.',
    tip: 'Let us show you around — takes 30 seconds.',
  },
  {
    icon: <Zap size={32} className="text-cyan-400" />,
    title: 'AI Bias Engine',
    description: 'Generate institutional-grade directional bias for any major pair. Full reasoning, invalidation levels, and confidence scores — powered by Claude AI.',
    tip: 'Go to Bias Matrix from the sidebar, pick a pair, and hit "Generate AI Bias".',
    path: '/bias',
  },
  {
    icon: <Newspaper size={32} className="text-emerald-400" />,
    title: 'News + Calendar',
    description: 'Live macro news with AI impact scoring, plus economic calendar with countdown timers. Know what matters before the market moves.',
    tip: 'High-impact news is auto-pinned at the top. Check the calendar before every session.',
    path: '/news',
  },
  {
    icon: <ShieldCheck size={32} className="text-amber-400" />,
    title: 'Prop Firm Mode',
    description: 'Real-time drawdown tracker with SAFE / CAUTION / DANGER zones. Calculates your max risk per trade based on your account rules.',
    tip: 'Set your account size and drawdown limits in Prop Firm settings.',
    path: '/prop-firm',
  },
  {
    icon: <BarChart2 size={32} className="text-cyan-400" />,
    title: 'You are all set!',
    description: 'Explore COT Reports, Event Playbooks, Trade Journal, Currency Strength, and more from the sidebar. Everything you need before placing a trade.',
    tip: 'Pro tip: Press Ctrl+K anytime to open the command palette.',
  },
]

export default function OnboardingTour() {
  const [show, setShow] = useState(false)
  const [step, setStep] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    const done = localStorage.getItem('bf_onboarding_done')
    if (!done) {
      const timer = setTimeout(() => setShow(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [])

  const finish = () => {
    localStorage.setItem('bf_onboarding_done', 'true')
    setShow(false)
  }

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    } else {
      finish()
    }
  }

  const skip = () => {
    finish()
  }

  if (!show) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

        {/* Progress bar */}
        <div className="h-1 bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Close / Skip */}
        <button
          onClick={skip}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Content */}
        <div className="p-8 pt-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-5">
            {current.icon}
          </div>

          <h2 className="text-2xl font-black text-white mb-3">
            {current.title}
          </h2>

          <p className="text-slate-400 leading-relaxed mb-4">
            {current.description}
          </p>

          <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl px-4 py-3 text-sm text-cyan-300">
            {current.tip}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 pb-6">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === step ? 'bg-cyan-400' : i < step ? 'bg-cyan-400/30' : 'bg-white/10'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            {!isLast && (
              <button
                onClick={skip}
                className="text-sm text-slate-500 hover:text-white transition-colors"
              >
                Skip tour
              </button>
            )}
            <button
              onClick={next}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 text-black font-bold text-sm hover:opacity-90 transition-opacity"
            >
              {isLast ? 'Start Trading' : 'Next'}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}