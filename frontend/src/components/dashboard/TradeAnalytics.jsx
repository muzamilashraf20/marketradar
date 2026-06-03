import { useMemo } from 'react'
import { TrendingUp, Calendar, Trophy, Target, Flame } from 'lucide-react'

// ─── Equity Curve (SVG) ─────────────────────────────────────────────────
function EquityCurve({ trades }) {
  const data = useMemo(() => {
    if (!trades || trades.length === 0) return []
    const sorted = [...trades]
      .filter(t => t.pnl !== undefined && t.pnl !== null)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
    
    let cumulative = 0
    return sorted.map(t => {
      cumulative += Number(t.pnl) || 0
      return { date: t.date, pnl: cumulative }
    })
  }, [trades])

  if (data.length < 2) return (
    <div className="text-center py-8 text-slate-600 text-sm">
      Need at least 2 trades with P&L to show equity curve
    </div>
  )

  const maxPnl = Math.max(...data.map(d => d.pnl), 0)
  const minPnl = Math.min(...data.map(d => d.pnl), 0)
  const range = maxPnl - minPnl || 1
  const w = 600, h = 200, pad = 30

  const points = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2)
    const y = pad + (1 - (d.pnl - minPnl) / range) * (h - pad * 2)
    return `${x},${y}`
  }).join(' ')

  const zeroY = pad + (1 - (0 - minPnl) / range) * (h - pad * 2)
  const lastPnl = data[data.length - 1]?.pnl || 0
  const color = lastPnl >= 0 ? '#10b981' : '#ef4444'
  const gradId = 'eqGrad'

  const areaPoints = `${pad},${zeroY} ${points} ${pad + ((data.length - 1) / (data.length - 1)) * (w - pad * 2)},${zeroY}`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Zero line */}
      <line x1={pad} y1={zeroY} x2={w - pad} y2={zeroY} stroke="rgba(255,255,255,0.1)" strokeDasharray="4" />
      {/* Area */}
      <polygon points={areaPoints} fill={`url(#${gradId})`} />
      {/* Line */}
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots */}
      {data.map((d, i) => {
        const x = pad + (i / (data.length - 1)) * (w - pad * 2)
        const y = pad + (1 - (d.pnl - minPnl) / range) * (h - pad * 2)
        return <circle key={i} cx={x} cy={y} r="3" fill={d.pnl >= 0 ? '#10b981' : '#ef4444'} />
      })}
      {/* Labels */}
      <text x={pad} y={h - 5} fill="#64748b" fontSize="10">{data[0]?.date?.slice(5, 10)}</text>
      <text x={w - pad} y={h - 5} fill="#64748b" fontSize="10" textAnchor="end">{data[data.length-1]?.date?.slice(5, 10)}</text>
      <text x={pad - 5} y={pad + 4} fill="#64748b" fontSize="10" textAnchor="end">${maxPnl.toFixed(0)}</text>
      <text x={pad - 5} y={h - pad} fill="#64748b" fontSize="10" textAnchor="end">${minPnl.toFixed(0)}</text>
    </svg>
  )
}

// ─── Calendar Heatmap ───────────────────────────────────────────────────
function CalendarHeatmap({ trades }) {
  const dayMap = useMemo(() => {
    const map = {}
    trades?.forEach(t => {
      if (!t.date || t.pnl === undefined) return
      const day = t.date.slice(0, 10)
      map[day] = (map[day] || 0) + Number(t.pnl || 0)
    })
    return map
  }, [trades])

  // Generate last 35 days
  const days = useMemo(() => {
    const result = []
    const today = new Date()
    for (let i = 34; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const dayName = d.toLocaleDateString('en', { weekday: 'short' })
      result.push({ key, dayName, dayNum: d.getDate(), pnl: dayMap[key] || null })
    }
    return result
  }, [dayMap])

  return (
    <div className="flex flex-wrap gap-1.5">
      {days.map(d => (
        <div
          key={d.key}
          title={`${d.key}: ${d.pnl !== null ? '$' + d.pnl.toFixed(0) : 'No trades'}`}
          className={`w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold border transition-all ${
            d.pnl === null
              ? 'bg-white/[0.03] border-white/5 text-slate-700'
              : d.pnl > 0
              ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
              : d.pnl < 0
              ? 'bg-red-500/20 border-red-500/30 text-red-400'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
          }`}
        >
          {d.dayNum}
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────
export default function TradeAnalytics({ trades }) {
  const stats = useMemo(() => {
    if (!trades || trades.length === 0) return null
    const withPnl = trades.filter(t => t.pnl !== undefined && t.pnl !== null)
    const wins = withPnl.filter(t => Number(t.pnl) > 0)
    const losses = withPnl.filter(t => Number(t.pnl) < 0)
    const totalPnl = withPnl.reduce((s, t) => s + Number(t.pnl || 0), 0)
    const bestDay = withPnl.length > 0 ? Math.max(...withPnl.map(t => Number(t.pnl))) : 0
    const worstDay = withPnl.length > 0 ? Math.min(...withPnl.map(t => Number(t.pnl))) : 0
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + Number(t.pnl), 0) / wins.length : 0
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + Number(t.pnl), 0) / losses.length) : 0
    const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : wins.length > 0 ? 999 : 0

    // Current streak
    const sorted = [...withPnl].sort((a, b) => new Date(b.date) - new Date(a.date))
    let streak = 0, streakType = null
    for (const t of sorted) {
      const isWin = Number(t.pnl) > 0
      if (streakType === null) streakType = isWin
      if (isWin === streakType) streak++
      else break
    }

    return {
      total: withPnl.length,
      winRate: withPnl.length > 0 ? ((wins.length / withPnl.length) * 100).toFixed(1) : 0,
      totalPnl,
      bestDay,
      worstDay,
      avgWin: avgWin.toFixed(0),
      avgLoss: avgLoss.toFixed(0),
      profitFactor: profitFactor.toFixed(2),
      streak,
      streakType,
    }
  }, [trades])

  if (!stats) return null

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase">Win Rate</p>
          <p className={`text-xl font-black ${Number(stats.winRate) >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{stats.winRate}%</p>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase">Profit Factor</p>
          <p className={`text-xl font-black ${Number(stats.profitFactor) >= 1.5 ? 'text-emerald-400' : Number(stats.profitFactor) >= 1 ? 'text-amber-400' : 'text-red-400'}`}>{stats.profitFactor}</p>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase">Total P&L</p>
          <p className={`text-xl font-black ${stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${stats.totalPnl.toFixed(0)}</p>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase">Streak</p>
          <p className={`text-xl font-black flex items-center justify-center gap-1 ${stats.streakType ? 'text-emerald-400' : 'text-red-400'}`}>
            <Flame size={16} />{stats.streak} {stats.streakType ? 'W' : 'L'}
          </p>
        </div>
      </div>

      {/* Equity Curve + Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <TrendingUp size={14} className="text-cyan-400" />
            Equity Curve
          </h3>
          <EquityCurve trades={trades} />
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <Calendar size={14} className="text-emerald-400" />
            Last 35 Days
          </h3>
          <CalendarHeatmap trades={trades} />
          <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/30" /> Profit</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/20 border border-red-500/30" /> Loss</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-white/[0.03] border border-white/5" /> No trades</span>
          </div>
        </div>
      </div>

      {/* Extra Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase">Best Trade</p>
          <p className="text-sm font-bold text-emerald-400">${stats.bestDay.toFixed(0)}</p>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase">Worst Trade</p>
          <p className="text-sm font-bold text-red-400">${stats.worstDay.toFixed(0)}</p>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase">Avg Win</p>
          <p className="text-sm font-bold text-emerald-400">${stats.avgWin}</p>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase">Avg Loss</p>
          <p className="text-sm font-bold text-red-400">-${stats.avgLoss}</p>
        </div>
      </div>
    </div>
  )
}