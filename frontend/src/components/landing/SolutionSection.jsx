import { Newspaper, Calendar, Mic, Activity, TrendingUp, Shield, GraduationCap, ShieldCheck, Eye, ArrowRight, LineChart, BarChart3, Globe } from 'lucide-react'

const benefits = [
  {
    icon: <GraduationCap size={22} className="text-cyan-400" />,
    title: 'No Economics Degree Needed',
    text: 'BiasForge translates complex macro data into plain English bias calls anyone can act on.',
  },
  {
    icon: <ShieldCheck size={22} className="text-cyan-400" />,
    title: 'Prop Firm Compatible',
    text: 'Built around prop firm rules. Risk sizing, drawdown alerts, and session filters included.',
  },
  {
    icon: <Eye size={22} className="text-cyan-400" />,
    title: 'Full Transparency',
    text: 'See the full AI reasoning behind every bias call. Know the why, not just the direction.',
  },
]

const dataSources = [
  { icon: <LineChart size={18} className="text-cyan-400" />, label: 'Live Price Action' },
  { icon: <Calendar size={18} className="text-cyan-400" />, label: 'Economic Calendar' },
  { icon: <Newspaper size={18} className="text-cyan-400" />, label: 'Breaking News' },
  { icon: <BarChart3 size={18} className="text-cyan-400" />, label: 'COT Positioning' },
  { icon: <Globe size={18} className="text-cyan-400" />, label: 'Cross-Asset Flows' },
]

export default function SolutionSection() {
  return (
    <section className="relative bg-[#030712] py-24 px-6 overflow-hidden">

      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-emerald-500/5 pointer-events-none" />

      <div className="relative max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold mb-3">
            The Solution
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-6 leading-tight">
            BiasForge Changes Everything
          </h2>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            We fuse 5 live data sources — price, central bank signals, economic events, breaking news, and institutional positioning — then forge a clear trading bias with full reasoning.
          </p>
        </div>

        {/* Flow Diagram */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-12">

          {/* Block 1 — Raw Chaos */}
          <div className="bg-slate-900/50 border border-slate-700/50 rounded-2xl p-6 w-full md:w-64 hover:border-slate-600/70 transition-colors duration-300">
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-4">Raw Chaos</p>
            <div className="flex gap-3 mb-4">
              <Newspaper size={20} className="text-slate-400" />
              <Calendar size={20} className="text-slate-400" />
              <Mic size={20} className="text-slate-400" />
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              100s of headlines, mixed signals, economic data
            </p>
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center text-cyan-400 rotate-90 md:rotate-0">
            <ArrowRight size={28} className="drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
          </div>

          {/* Block 2 — BiasForge AI */}
          <div className="bg-gradient-to-br from-cyan-500 to-emerald-500 rounded-2xl p-6 w-full md:w-64 shadow-2xl shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-shadow duration-300">
            <p className="text-xs uppercase tracking-widest text-black/60 font-semibold mb-4">BiasForge AI</p>
            <Activity size={32} className="text-black mb-4" strokeWidth={2} />
            <p className="text-black/80 text-sm font-medium leading-relaxed">
              Real-time analysis + reasoning engine
            </p>
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center text-cyan-400 rotate-90 md:rotate-0">
            <ArrowRight size={28} className="drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
          </div>

          {/* Block 3 — Clear Bias */}
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 w-full md:w-64 hover:border-emerald-500/50 transition-colors duration-300">
            <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold mb-4">Clear Actionable Bias</p>
            <div className="flex gap-3 mb-4">
              <TrendingUp size={20} className="text-emerald-400" />
              <Shield size={20} className="text-emerald-400" />
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">
              Bullish/Bearish + Confidence + Scenarios + Prop Risk
            </p>
          </div>

        </div>

        {/* 5 Live Data Sources strip */}
        <div className="mb-20">
          <p className="text-center text-xs uppercase tracking-widest text-cyan-400 font-semibold mb-6">
            Every bias is forged from 5 live data sources
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {dataSources.map((source) => (
              <div
                key={source.label}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900/40 border border-cyan-500/15 hover:border-cyan-500/40 transition-colors duration-300"
              >
                {source.icon}
                <span className="text-sm font-medium text-slate-300">{source.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {benefits.map((b) => (
            <div key={b.title} className="flex flex-col items-start gap-3 p-6 rounded-2xl bg-slate-900/30 border border-slate-800/50 hover:border-cyan-500/20 transition-colors duration-300">
              <div className="p-2 rounded-lg bg-cyan-500/10">
                {b.icon}
              </div>
              <h3 className="text-white font-bold text-base">{b.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{b.text}</p>
            </div>
          ))}
        </div>

        {/* Bottom CTA teaser */}
        <p className="text-center text-sm text-slate-400 mt-12 italic">
          Ready to trade with clarity?
        </p>

      </div>
    </section>
  )
}