import { Newspaper, Calendar, Mic, Activity, TrendingUp, Shield, GraduationCap, ShieldCheck, Eye, ArrowRight, LineChart, BarChart3, Globe, DollarSign } from 'lucide-react'

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
  {
    num: '01',
    icon: <LineChart size={20} className="text-cyan-400" />,
    label: 'Live Price Action',
    desc: 'Real-time price structure & momentum',
  },
  {
    num: '02',
    icon: <DollarSign size={20} className="text-cyan-400" />,
    label: 'Currency Strength',
    desc: 'Cross-pair relative strength index',
  },
  {
    num: '03',
    icon: <Calendar size={20} className="text-cyan-400" />,
    label: 'Economic Calendar',
    desc: 'High-impact event pre-analysis',
  },
  {
    num: '04',
    icon: <Newspaper size={20} className="text-cyan-400" />,
    label: 'Breaking News Scoring',
    desc: 'AI-scored market-moving headlines',
  },
  {
    num: '05',
    icon: <BarChart3 size={20} className="text-cyan-400" />,
    label: 'CFTC/COT Positioning',
    desc: 'Institutional net-long/short positioning',
  },
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
            We fuse <span className="text-cyan-400 font-bold">5 live data sources</span> — price, currency strength, economic events, breaking news, and institutional positioning — then forge a clear trading bias with full reasoning.
          </p>
        </div>

        {/* Flow Diagram */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-16">

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

        {/* 5 Live Data Sources — prominent card grid */}
        <div className="mb-20">
          <div className="text-center mb-8">
            <p className="text-xs uppercase tracking-widest text-cyan-400 font-semibold mb-2">
              Built From 5 Data Sources
            </p>
            <h3 className="text-2xl font-black text-white">
              One Bias. Five Inputs. Zero Guesswork.
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {dataSources.map((source) => (
              <div
                key={source.label}
                className="group flex flex-col gap-3 p-4 rounded-2xl bg-slate-900/40 border border-cyan-500/15 hover:border-cyan-500/40 hover:bg-slate-900/70 transition-all duration-300 cursor-default"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-cyan-500/50 tabular-nums">{source.num}</span>
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 group-hover:bg-cyan-500/15 transition-colors">
                    {source.icon}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-snug mb-1">{source.label}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{source.desc}</p>
                </div>
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
