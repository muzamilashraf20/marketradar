import { CheckCircle, ShieldCheck, AlertTriangle, TrendingUp } from 'lucide-react'

const benefits = [
  {
    title: 'Real-time Daily Drawdown Tracker',
    text: 'See exactly how much room you have left before hitting your daily loss limit.',
  },
  {
    title: 'AI-Adjusted Position Sizing',
    text: 'BiasForge calculates your max risk per trade based on your current drawdown status.',
  },
  {
    title: 'SAFE / CAUTION / DANGER Live Status',
    text: 'Color-coded account health so you never accidentally over-risk on a news day.',
  },
  {
    title: 'Bias That Respects Your Rules',
    text: 'Bias signals are filtered through your prop firm parameters — no reckless calls.',
  },
]

export default function PropFirmSection() {
  return (
    <section id="propfirm" className="bg-gradient-to-b from-[#020617] to-[#030712] py-24 px-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-[3px] text-emerald-400 font-bold mb-3">
            Built For Funded Traders
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-6 leading-tight">
            The Only Platform Designed For<br />Prop Firm Survival
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Stop blowing accounts on news days. Get real-time risk awareness that respects your drawdown rules.
          </p>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-16">

          {/* Left — Benefits */}
          <div className="flex flex-col gap-6">
            {benefits.map((b) => (
              <div key={b.title} className="flex gap-4 items-start">
                <div className="mt-1 w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <CheckCircle size={14} className="text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base mb-1">{b.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{b.text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Right — Mock Dashboard */}
          <div className="bg-slate-900/80 border border-emerald-500/20 rounded-2xl p-6 shadow-2xl shadow-emerald-500/5">

            {/* Dashboard Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-400" />
                <span className="text-white font-bold text-sm">Prop Firm Dashboard</span>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                SAFE
              </span>
            </div>

            {/* Account Size */}
            <div className="mb-4 p-3 rounded-xl bg-slate-800/50 border border-white/5">
              <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Account Size</p>
              <p className="text-white font-black text-2xl">$50,000</p>
            </div>

            {/* Daily Drawdown */}
            <div className="mb-4 p-3 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Daily Drawdown</p>
                <p className="text-xs font-bold text-amber-400">48.7%</p>
              </div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-white font-bold text-sm">$487</p>
                <p className="text-slate-500 text-sm">/ $1,000</p>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full w-[48.7%] bg-gradient-to-r from-emerald-500 to-amber-500 rounded-full" />
              </div>
            </div>

            {/* Total Drawdown */}
            <div className="mb-4 p-3 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Total Drawdown</p>
                <p className="text-xs font-bold text-emerald-400">41.3%</p>
              </div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-white font-bold text-sm">$1,240</p>
                <p className="text-slate-500 text-sm">/ $3,000</p>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full w-[41.3%] bg-emerald-500 rounded-full" />
              </div>
            </div>

            {/* Bias Integration */}
            <div className="mb-4 p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={14} className="text-cyan-400" />
                <p className="text-xs text-cyan-400 font-semibold uppercase tracking-wider">Today's Bias</p>
              </div>
              <p className="text-white text-sm font-bold">EURUSD Bullish 76% — Max Risk: 0.4%</p>
            </div>

            {/* Recommended Risk */}
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={14} className="text-emerald-400" />
                <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Recommended Risk</p>
              </div>
              <p className="text-emerald-300 font-black text-lg">$185 <span className="text-emerald-500 text-sm font-medium">(0.37%)</span></p>
            </div>

          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center flex flex-col items-center gap-4">
          <h3 className="text-2xl font-black text-white">Protect Your Funded Account</h3>
          
           <a href="#pricing" className="px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-black font-bold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-emerald-500/20">
            Try Prop Firm Mode — 7-Day Free Trial
          </a>
          <p className="text-xs text-slate-500">
            Works with FTMO, MyFundedFX, The5ers, TFT and more
          </p>
        </div>

      </div>
    </section>
  )
}