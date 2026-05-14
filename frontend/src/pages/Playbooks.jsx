import DashboardLayout from '../components/layout/DashboardLayout'
import { BookOpen, Zap, TrendingUp, AlertCircle, Clock } from 'lucide-react'

const PLAYBOOKS = [
  {
    tag: 'CPI Release',
    bias: 'Bearish USD',
    condition: 'CPI > Forecast',
    action: 'Sell USD pairs on retest of key resistance',
    risk: 'High',
    icon: TrendingUp,
  },
  {
    tag: 'NFP Friday',
    bias: 'Bullish USD',
    condition: 'NFP > Forecast by 50k+',
    action: 'Buy USD strength into London close',
    risk: 'High',
    icon: Zap,
  },
  {
    tag: 'FOMC Decision',
    bias: 'Neutral → Reactive',
    condition: 'Rate hold with hawkish tone',
    action: 'Wait for 15min candle close, then trade direction',
    risk: 'Extreme',
    icon: AlertCircle,
  },
  {
    tag: 'Asian Session Breakout',
    bias: 'Range Break',
    condition: 'Price breaks Asian high/low in London open',
    action: 'Enter on break + retest with tight SL',
    risk: 'Medium',
    icon: Clock,
  },
]

const RISK_STYLES = {
  High: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  Extreme: 'text-red-400 bg-red-500/10 border-red-500/20',
  Medium: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
}

export default function Playbooks() {
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <BookOpen size={18} className="text-cyan-400" />
            </div>
            <h1 className="text-xl font-bold text-white">Event Playbooks</h1>
          </div>
          <p className="text-slate-400 text-sm ml-12">
            Pre-built trading plans for high-impact macro events. Know your bias before the candle opens.
          </p>
        </div>

        {/* Coming Soon Banner */}
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-6 py-5 flex items-start gap-4">
          <BookOpen size={20} className="text-cyan-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-white font-semibold text-sm">AI-generated playbooks launching soon</p>
            <p className="text-slate-400 text-xs mt-1">
              BiasForge will auto-generate event playbooks based on upcoming calendar events, historical reactions, and current macro bias — tailored for prop firm traders.
            </p>
          </div>
        </div>

        {/* Playbook Cards */}
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
            Sample Playbooks
          </h2>
          <div className="space-y-4">
            {PLAYBOOKS.map((pb) => {
              const Icon = pb.icon
              return (
                <div
                  key={pb.tag}
                  className="rounded-xl border border-white/10 bg-white/5 px-5 py-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                        <Icon size={14} className="text-cyan-400" />
                      </div>
                      <span className="text-white font-semibold text-sm">{pb.tag}</span>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${RISK_STYLES[pb.risk]}`}>
                      {pb.risk} Risk
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-white/5 rounded-lg px-3 py-2.5">
                      <p className="text-slate-500 mb-1">Bias</p>
                      <p className="text-slate-200 font-medium">{pb.bias}</p>
                    </div>
                    <div className="bg-white/5 rounded-lg px-3 py-2.5">
                      <p className="text-slate-500 mb-1">Condition</p>
                      <p className="text-slate-200 font-medium">{pb.condition}</p>
                    </div>
                    <div className="bg-white/5 rounded-lg px-3 py-2.5">
                      <p className="text-slate-500 mb-1">Action</p>
                      <p className="text-slate-200 font-medium">{pb.action}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </DashboardLayout>
  )
}