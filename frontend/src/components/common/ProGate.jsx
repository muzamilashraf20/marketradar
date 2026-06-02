import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Lock, ArrowRight, Zap, ShieldCheck, BookOpen, BarChart2, PieChart, Flag, Calendar } from 'lucide-react'
import DashboardLayout from '../layout/DashboardLayout'

const PRO_FEATURES = [
  { icon: ShieldCheck, text: 'Prop Firm Mode with drawdown tracking' },
  { icon: BookOpen, text: 'Event Playbooks (FOMC, NFP, CPI, ECB, BOE)' },
  { icon: PieChart, text: 'COT Reports with institutional positioning' },
  { icon: BarChart2, text: 'Currency Strength meter' },
  { icon: Calendar, text: 'Earnings Calendar' },
  { icon: Flag, text: 'MarketMovers Radar' },
  { icon: Zap, text: 'Trade Journal with cloud sync' },
]

export default function ProGate({ title, subtitle, children }) {
  const { isPro } = useAuth()
  const navigate = useNavigate()

  if (isPro) return children

  return (
    <DashboardLayout title={title} subtitle={subtitle}>
      <div className="flex items-center justify-center py-10">
        <div className="max-w-lg w-full text-center">
          {/* Lock icon */}
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-6">
            <Lock size={28} className="text-amber-400" />
          </div>

          <h2 className="text-2xl font-black text-white mb-2">
            Pro Feature
          </h2>
          <p className="text-slate-400 text-sm mb-8 max-w-md mx-auto">
            Upgrade to BiasForge Pro to unlock {title?.toLowerCase() || 'this feature'} and all premium trading tools.
          </p>

          {/* Features list */}
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 mb-8 text-left">
            <p className="text-[10px] text-cyan-400 uppercase tracking-wider font-bold mb-4">Everything in Pro includes:</p>
            <div className="space-y-3">
              {PRO_FEATURES.map((f, i) => {
                const Icon = f.icon
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
                      <Icon size={13} className="text-cyan-400" />
                    </div>
                    <span className="text-xs text-slate-300">{f.text}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => window.open('https://biasforge.gumroad.com/l/ntjpje', '_blank')}
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 text-black text-sm font-bold rounded-xl hover:opacity-90 transition-all flex items-center gap-2 shadow-lg shadow-cyan-500/20"
            >
              Start 7-Day Free Trial
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-3 border border-white/10 text-slate-400 text-sm font-medium rounded-xl hover:bg-white/5 transition-all"
            >
              Back to Dashboard
            </button>
          </div>

          <p className="text-[11px] text-slate-600 mt-4">
            7-day free trial · Cancel anytime · $40/month after trial
          </p>
        </div>
      </div>
    </DashboardLayout>
  )
}