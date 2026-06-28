import {
  TrendingUp, Newspaper, Calendar, ShieldCheck,
  BookOpen, Zap, BarChart3, PieChart, DollarSign,
  LineChart, Globe, Activity, TrendingDown
} from 'lucide-react'
import RevealSection from './RevealSection'

// The 5 data sources that power every AI bias — shared across banner + flagship card
const biasSources = [
  { icon: <LineChart size={13} className="text-cyan-400" />, label: 'Live Price' },
  { icon: <Globe size={13} className="text-cyan-400" />, label: 'Currency Strength' },
  { icon: <Calendar size={13} className="text-cyan-400" />, label: 'Economic Calendar' },
  { icon: <Newspaper size={13} className="text-cyan-400" />, label: 'News Scoring' },
  { icon: <BarChart3 size={13} className="text-cyan-400" />, label: 'COT Positioning' },
]

const features = [
  {
    icon: <Activity size={22} className="text-cyan-400" />,
    title: 'AI Trading Bias',
    description: 'Direction forged from 5 live data sources with full AI reasoning, confidence score, and invalidation levels.',
    exclusive: false,
    flagship: true,
  },
  {
    icon: <Newspaper size={22} className="text-cyan-400" />,
    title: 'Live Headlines',
    description: 'Market-moving news with instant AI impact score (1-10) and asset-specific sentiment tagging.',
    exclusive: false,
  },
  {
    icon: <Calendar size={22} className="text-cyan-400" />,
    title: 'Economic Calendar',
    description: 'High-impact events with AI pre-analysis, historical price reactions, and countdown timers.',
    exclusive: false,
  },
  {
    icon: <ShieldCheck size={22} className="text-emerald-400" />,
    title: 'Prop Firm Mode',
    description: 'Real-time drawdown tracking, daily loss limits, position sizing — built specifically for funded traders.',
    exclusive: true,
  },
  {
    icon: <BookOpen size={22} className="text-emerald-400" />,
    title: 'Event Playbooks',
    description: 'Pre-built game plans for FOMC, NFP, CPI, ECB, and BOE. Know exactly what to do before the event hits.',
    exclusive: true,
  },
  {
    icon: <Zap size={22} className="text-cyan-400" />,
    title: 'Intraday Bias',
    description: 'Short-term directional bias updated per session — London, New York, and Asia separately.',
    exclusive: false,
  },
  {
    icon: <TrendingUp size={22} className="text-cyan-400" />,
    title: 'Swing Bias',
    description: 'Multi-day swing structure with central bank cycle context and intermarket analysis.',
    exclusive: false,
  },
  {
    icon: <PieChart size={22} className="text-cyan-400" />,
    title: 'COT Report',
    description: 'CFTC positioning data with visual charts, extreme alerts, and historical comparisons.',
    exclusive: false,
  },
  {
    icon: <DollarSign size={22} className="text-cyan-400" />,
    title: 'Earnings Calendar',
    description: 'AI-powered earnings previews, expected vs actual breakdowns, and sector impact analysis.',
    exclusive: false,
  },
]

export default function FeaturesGrid() {
  return (
    <section id="features" className="bg-[#020617] py-24 px-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-widest text-cyan-400 font-semibold mb-3">
            Powerful Features
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4 leading-tight">
            Everything You Need to Trade Fundamentals
          </h2>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto">
            9 powerful tools working together. Every bias forged from{' '}
            <span className="text-cyan-400 font-bold">5 live data sources</span> — not guesswork.
          </p>
        </div>

        {/* 5-source engine callout banner */}
        <RevealSection delay={80}>
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8 px-4 py-4 rounded-2xl bg-cyan-500/5 border border-cyan-500/15">
          <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest mr-1 shrink-0">
            5-Source Engine:
          </span>
          {biasSources.map((s, i) => (
            <span key={s.label} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/60 border border-cyan-500/20 text-xs font-medium text-slate-300">
              {s.icon}
              {s.label}
              {i < biasSources.length - 1 && (
                <span className="ml-1 text-cyan-500/30 hidden sm:inline">·</span>
              )}
            </span>
          ))}
          <span className="text-xs text-slate-500 ml-1 shrink-0">= One clear bias</span>
        </div>

        </RevealSection>

        {/* Live News AI Analysis — static demo panel */}
        <div className="mb-10 rounded-2xl bg-slate-900/50 border border-white/8 overflow-hidden">
          {/* Panel header bar */}
          <div className="flex items-center gap-2 px-5 py-3 bg-slate-900/60 border-b border-white/5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">
              Live News AI Analysis
            </span>
            <span className="ml-auto text-[10px] text-slate-600 font-mono">Example</span>
          </div>

          {/* Panel body */}
          <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-5">

            {/* Left — headline + badges */}
            <div className="flex-1 min-w-0">
              {/* HIGH IMPACT badge */}
              <span className="inline-block mb-2.5 text-[10px] uppercase tracking-wider font-black px-2 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-red-400">
                High Impact
              </span>

              {/* Headline */}
              <p className="text-sm sm:text-base font-semibold text-white leading-snug mb-4">
                "Fed holds rates, signals fewer cuts in 2026"
              </p>

              {/* Asset reaction chips */}
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs font-bold text-emerald-400">
                  <TrendingUp size={12} />
                  USD ↑
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/25 text-xs font-bold text-red-400">
                  <TrendingDown size={12} />
                  XAUUSD ↓
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/50 text-xs font-medium text-slate-300">
                  Gold bias:&nbsp;<span className="text-red-400 font-bold">bearish</span>
                </span>
              </div>
            </div>

            {/* Divider — vertical on sm+, horizontal on mobile */}
            <div className="hidden sm:block w-px self-stretch bg-white/5" />
            <div className="sm:hidden h-px w-full bg-white/5" />

            {/* Right — AI Impact score */}
            <div className="shrink-0 flex sm:flex-col items-center gap-3 sm:gap-1 sm:px-4 sm:py-3 sm:rounded-xl sm:bg-slate-800/40 sm:border sm:border-white/5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider sm:mb-0.5">AI Impact</span>
              <span className="text-3xl font-black text-red-400 leading-none">8</span>
              <span className="text-xs text-slate-500">/ 10</span>
            </div>

          </div>
        </div>

        {/* Feature grid */}
        <RevealSection delay={160}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className={`relative group rounded-2xl p-6 transition-all duration-300 ${
                feature.exclusive
                  ? 'bg-slate-900/30 border border-emerald-500/20 hover:border-emerald-500/40 hover:bg-slate-900/60'
                  : 'bg-slate-900/30 border border-white/5 hover:border-cyan-500/30 hover:bg-slate-900/60'
              }`}
            >
              {/* Exclusive Badge */}
              {feature.exclusive && (
                <span className="absolute top-4 right-4 text-[10px] uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                  Exclusive
                </span>
              )}

              {/* Icon */}
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                feature.exclusive ? 'bg-emerald-500/10' : 'bg-cyan-500/10'
              }`}>
                {feature.icon}
              </div>

              {/* Title */}
              <h3 className="text-lg font-bold text-white mb-2">
                {feature.title}
              </h3>

              {/* Description */}
              <p className="text-sm text-slate-400 leading-relaxed">
                {feature.description}
              </p>

              {/* Flagship: inline 5-source chips */}
              {feature.flagship && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {biasSources.map((s) => (
                    <span
                      key={s.label}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-[11px] font-medium text-cyan-300"
                    >
                      {s.icon}
                      {s.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        </RevealSection>

        {/* Bottom text */}
        <p className="text-center text-sm text-slate-500 mt-12">
          More features shipping every week. Built by traders, for traders.
        </p>

      </div>
    </section>
  )
}
