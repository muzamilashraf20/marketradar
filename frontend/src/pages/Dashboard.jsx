import DashboardLayout from '../components/layout/DashboardLayout'
import {
  TrendingUp, TrendingDown, AlertCircle, ShieldCheck,
  Newspaper, Calendar, ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react'

// --- Stat Cards Data ---
const STAT_CARDS = [
  {
    label: "Today's Bias",
    value: 'EURUSD Bullish',
    sub: '78% confidence',
    icon: TrendingUp,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    dot: 'bg-emerald-400',
  },
  {
    label: 'Key Event',
    value: 'US CPI',
    sub: 'Today @ 8:30 AM ET',
    icon: AlertCircle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    dot: 'bg-amber-400',
  },
  {
    label: 'Top Mover',
    value: 'Gold +1.2%',
    sub: 'XAU/USD leading',
    icon: ArrowUpRight,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    dot: 'bg-cyan-400',
  },
  {
    label: 'Prop Risk',
    value: 'SAFE',
    sub: '0.3% drawdown used',
    icon: ShieldCheck,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    dot: 'bg-emerald-400',
  },
]

// --- News Data ---
const NEWS = [
  {
    headline: 'Fed signals no rate cuts until inflation cools further',
    impact: 'HIGH',
    impactColor: 'text-red-400 bg-red-500/10 border-red-500/20',
    time: '2m ago',
  },
  {
    headline: 'ECB holds rates steady, euro rebounds vs dollar',
    impact: 'MED',
    impactColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    time: '18m ago',
  },
  {
    headline: 'Gold hits 3-week high on safe-haven demand',
    impact: 'LOW',
    impactColor: 'text-slate-400 bg-white/5 border-white/10',
    time: '45m ago',
  },
]

// --- Events Data ---
const EVENTS = [
  {
    time: '08:30 ET',
    event: 'US CPI m/m',
    forecast: '0.3%',
    prev: '0.4%',
    impact: 'HIGH',
    impactColor: 'bg-red-400',
  },
  {
    time: '10:00 ET',
    event: 'US Core Retail Sales',
    forecast: '0.2%',
    prev: '-0.1%',
    impact: 'MED',
    impactColor: 'bg-amber-400',
  },
  {
    time: '14:00 ET',
    event: 'FOMC Meeting Minutes',
    forecast: '—',
    prev: '—',
    impact: 'HIGH',
    impactColor: 'bg-red-400',
  },
]

// --- Bias Cards Data ---
const BIAS_CARDS = [
  {
    asset: 'EUR/USD',
    direction: 'Bullish',
    icon: ArrowUpRight,
    confidence: 78,
    reason: 'ECB hawkish tone + weak USD data',
    color: 'text-emerald-400',
    bar: 'bg-emerald-400',
  },
  {
    asset: 'GBP/USD',
    direction: 'Neutral',
    icon: Minus,
    confidence: 52,
    reason: 'Mixed UK data, range-bound near 1.2700',
    color: 'text-slate-400',
    bar: 'bg-slate-400',
  },
  {
    asset: 'XAU/USD',
    direction: 'Bullish',
    icon: ArrowUpRight,
    confidence: 82,
    reason: 'Safe haven demand + DXY weakness',
    color: 'text-cyan-400',
    bar: 'bg-cyan-400',
  },
  {
    asset: 'NAS100',
    direction: 'Bearish',
    icon: ArrowDownRight,
    confidence: 65,
    reason: 'Rate fears + tech sector rotation out',
    color: 'text-red-400',
    bar: 'bg-red-400',
  },
]

export default function Dashboard() {
  return (
    <DashboardLayout
      title="Overview"
      subtitle="Your macro intelligence hub"
    >
      <div className="space-y-6">

        {/* Row 1 — Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STAT_CARDS.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.label}
                className={`rounded-xl p-4 border ${card.bg} ${card.border} backdrop-blur-sm`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-400 font-medium">{card.label}</span>
                  <div className={`w-7 h-7 rounded-lg ${card.bg} flex items-center justify-center`}>
                    <Icon size={14} className={card.color} />
                  </div>
                </div>
                <p className={`text-lg font-bold ${card.color} leading-none mb-1`}>
                  {card.value}
                </p>
                <p className="text-xs text-slate-500">{card.sub}</p>
              </div>
            )
          })}
        </div>

        {/* Row 2 — News + Events */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Recent News */}
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Newspaper size={15} className="text-cyan-400" />
                <h2 className="text-sm font-bold text-white">Live News</h2>
              </div>
              <span className="text-xs text-slate-500 hover:text-cyan-400 cursor-pointer transition-colors">
                View all →
              </span>
            </div>
            <div className="space-y-3">
              {NEWS.map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/5 hover:border-white/10 transition-colors cursor-pointer">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${item.impactColor}`}>
                    {item.impact}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300 leading-relaxed">{item.headline}</p>
                    <p className="text-[10px] text-slate-600 mt-1">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Events */}
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar size={15} className="text-cyan-400" />
                <h2 className="text-sm font-bold text-white">Upcoming Events</h2>
              </div>
              <span className="text-xs text-slate-500 hover:text-cyan-400 cursor-pointer transition-colors">
                View all →
              </span>
            </div>
            <div className="space-y-3">
              {EVENTS.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/5 hover:border-white/10 transition-colors">
                  <div className={`w-1.5 h-8 rounded-full ${item.impactColor} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white font-semibold">{item.event}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {item.time} · Forecast: {item.forecast} · Prev: {item.prev}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500">{item.impact}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Row 3 — Bias Cards */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={15} className="text-cyan-400" />
              <h2 className="text-sm font-bold text-white">AI Bias Snapshot</h2>
            </div>
            <span className="text-xs text-slate-500">Placeholder — AI powered soon</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {BIAS_CARDS.map((card) => {
              const Icon = card.icon
              return (
                <div
                  key={card.asset}
                  className="bg-white/[0.03] border border-white/10 rounded-xl p-4 hover:border-white/20 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-white">{card.asset}</span>
                    <div className="flex items-center gap-1.5">
                      <Icon size={14} className={card.color} />
                      <span className={`text-xs font-semibold ${card.color}`}>
                        {card.direction}
                      </span>
                    </div>
                  </div>

                  {/* Confidence bar */}
                  <div className="mb-3">
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-slate-500">Confidence</span>
                      <span className={`text-[10px] font-bold ${card.color}`}>
                        {card.confidence}%
                      </span>
                    </div>
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${card.bar}`}
                        style={{ width: `${card.confidence}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed">{card.reason}</p>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </DashboardLayout>
  )
}