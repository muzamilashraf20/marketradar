import {
  TrendingUp, Newspaper, Calendar, ShieldCheck,
  BookOpen, Zap, BarChart3, PieChart, DollarSign
} from 'lucide-react'

const features = [
  {
    icon: <TrendingUp size={22} className="text-cyan-400" />,
    title: 'AI Trading Bias',
    description: 'Session and structural bias with full AI reasoning, confidence score, and invalidation levels.',
    exclusive: false,
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
    icon: <BarChart3 size={22} className="text-cyan-400" />,
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
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            9 powerful tools working together to give you an unfair edge.
          </p>
        </div>

        {/* Grid */}
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
            </div>
          ))}
        </div>

        {/* Bottom text */}
        <p className="text-center text-sm text-slate-500 mt-12">
          More features shipping every week. Built by traders, for traders.
        </p>

      </div>
    </section>
  )
}