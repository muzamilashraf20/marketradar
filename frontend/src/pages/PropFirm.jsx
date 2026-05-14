import DashboardLayout from '../components/layout/DashboardLayout'
import { ShieldCheck, Lock, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react'

const RULES = [
  { label: 'Max Daily Loss', value: '5%', status: 'safe', detail: 'You are within limit' },
  { label: 'Max Total Drawdown', value: '10%', status: 'safe', detail: 'You are within limit' },
  { label: 'Profit Target', value: '8%', status: 'pending', detail: 'Not yet reached' },
  { label: 'Min Trading Days', value: '5 days', status: 'pending', detail: '2 of 5 completed' },
]

const STATUS_STYLES = {
  safe: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  pending: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  breach: 'text-red-400 bg-red-500/10 border-red-500/20',
}

export default function PropFirm() {
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <ShieldCheck size={18} className="text-cyan-400" />
            </div>
            <h1 className="text-xl font-bold text-white">Prop Firm Mode</h1>
          </div>
          <p className="text-slate-400 text-sm ml-12">
            Track your challenge rules, drawdown limits, and trade safely within firm constraints.
          </p>
        </div>

        {/* Coming Soon Banner */}
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-6 py-5 flex items-start gap-4">
          <Lock size={20} className="text-cyan-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-white font-semibold text-sm">Full feature launching soon</p>
            <p className="text-slate-400 text-xs mt-1">
              Connect your prop firm account to get real-time rule monitoring, breach alerts, and AI-powered trade filtering based on your challenge limits.
            </p>
          </div>
        </div>

        {/* Rule Cards */}
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
            Sample Challenge Rules
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {RULES.map((rule) => (
              <div
                key={rule.label}
                className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 flex items-start justify-between gap-4"
              >
                <div>
                  <p className="text-xs text-slate-500 mb-1">{rule.label}</p>
                  <p className="text-2xl font-bold text-white">{rule.value}</p>
                  <p className="text-xs text-slate-500 mt-1">{rule.detail}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_STYLES[rule.status]}`}>
                  {rule.status === 'safe' ? '✓ Safe' : rule.status === 'breach' ? '✗ Breach' : '— Pending'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Placeholder Features */}
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
            What's Coming
          </h2>
          <div className="space-y-3">
            {[
              { icon: TrendingUp, text: 'Real-time drawdown tracking synced to your broker' },
              { icon: AlertTriangle, text: 'Breach alerts before you hit the limit' },
              { icon: CheckCircle, text: 'AI trade filter — flags trades that risk failing your challenge' },
              { icon: ShieldCheck, text: 'Multi-firm support: FTMO, MyForexFunds, The5ers, and more' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-white/10 bg-white/5">
                <Icon size={15} className="text-cyan-400 shrink-0" />
                <p className="text-sm text-slate-300">{text}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </DashboardLayout>
  )
}