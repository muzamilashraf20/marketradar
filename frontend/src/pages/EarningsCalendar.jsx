import { useEffect, useState, useMemo } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'
import {
  RefreshCw, Search, Calendar, TrendingUp, TrendingDown,
  Minus, Loader2, AlertTriangle, Sun, Moon, Filter
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function isToday(dateStr) {
  const today = new Date().toISOString().split('T')[0]
  return dateStr === today
}

function isPast(dateStr) {
  const today = new Date().toISOString().split('T')[0]
  return dateStr < today
}

export default function EarningsCalendar() {
  const [earnings, setEarnings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTime, setFilterTime] = useState('All') // All, BMO, AMC
  const [dateRange, setDateRange] = useState({ from: '', to: '' })

  useEffect(() => {
    fetchEarnings()
  }, [])

  const fetchEarnings = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await fetch(`${API_BASE}/api/earnings`)
      const data = await res.json()
      if (data.success) {
        setEarnings(data.earnings || [])
        setDateRange({ from: data.from, to: data.to })
      } else {
        setError(data.error || 'Failed to fetch earnings')
      }
    } catch (e) {
      console.error('Earnings fetch error:', e)
      setError('Failed to connect to earnings API')
    } finally {
      setLoading(false)
    }
  }

  // Filter
  const filtered = useMemo(() => {
    return earnings.filter(e => {
      const matchSearch = !searchQuery.trim() ||
        e.symbol.toLowerCase().includes(searchQuery.toLowerCase())
      const matchTime = filterTime === 'All' ||
        (filterTime === 'BMO' && e.hour === 'bmo') ||
        (filterTime === 'AMC' && e.hour === 'amc')
      return matchSearch && matchTime
    })
  }, [earnings, searchQuery, filterTime])

  // Group by date
  const grouped = useMemo(() => {
    const map = {}
    filtered.forEach(e => {
      if (!map[e.date]) map[e.date] = []
      map[e.date].push(e)
    })
    return Object.entries(map).sort((a, b) => new Date(a[0]) - new Date(b[0]))
  }, [filtered])

  // Stats
  const totalEarnings = earnings.length
  const todayCount = earnings.filter(e => isToday(e.date)).length
  const reported = earnings.filter(e => e.epsActual != null).length
  const beats = earnings.filter(e => e.epsActual != null && e.epsEstimate != null && e.epsActual > e.epsEstimate).length

  return (
    <DashboardLayout title="Earnings Calendar" subtitle="Upcoming earnings releases & results">
      <div className="space-y-5">

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl p-4 border bg-white/[0.03] border-white/10 text-center">
            <div className="text-xl font-bold font-mono text-white">{totalEarnings}</div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Total Earnings</div>
          </div>
          <div className="rounded-xl p-4 border bg-amber-500/10 border-amber-500/20 text-center">
            <div className="text-xl font-bold font-mono text-amber-400">{todayCount}</div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Reporting Today</div>
          </div>
          <div className="rounded-xl p-4 border bg-cyan-500/10 border-cyan-500/20 text-center">
            <div className="text-xl font-bold font-mono text-cyan-400">{reported}</div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Already Reported</div>
          </div>
          <div className="rounded-xl p-4 border bg-emerald-500/10 border-emerald-500/20 text-center">
            <div className="text-xl font-bold font-mono text-emerald-400">
              {reported > 0 ? `${Math.round((beats / reported) * 100)}%` : '—'}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Beat Rate</div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ticker (AAPL, MSFT...)"
              className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-slate-600 outline-none focus:border-cyan-500/30 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            {['All', 'BMO', 'AMC'].map(f => (
              <button
                key={f}
                onClick={() => setFilterTime(f)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  filterTime === f
                    ? 'bg-cyan-400/10 text-cyan-400 border-cyan-400/20'
                    : 'bg-white/5 text-slate-500 border-white/10 hover:border-white/20'
                }`}
              >
                {f === 'BMO' && <Sun size={12} />}
                {f === 'AMC' && <Moon size={12} />}
                {f === 'All' && <Filter size={12} />}
                {f === 'All' ? 'All' : f === 'BMO' ? 'Pre-Market' : 'After Hours'}
              </button>
            ))}
          </div>

          <button
            onClick={fetchEarnings}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors ml-auto"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-12 text-center">
            <Loader2 size={24} className="text-cyan-400 animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-400">Fetching earnings calendar...</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
            <AlertTriangle size={20} className="text-red-400 mx-auto mb-2" />
            <p className="text-xs text-red-400">{error}</p>
            <button onClick={fetchEarnings} className="mt-3 text-xs text-slate-400 hover:text-white transition-colors">
              Try again
            </button>
          </div>
        )}

        {/* No Results */}
        {!loading && !error && filtered.length === 0 && (
          <div className="bg-white/[0.03] border border-dashed border-white/10 rounded-xl p-10 text-center">
            <Calendar size={24} className="text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400 font-medium">No earnings found</p>
            <p className="text-xs text-slate-600 mt-1">
              {searchQuery ? `No results for "${searchQuery}"` : 'No upcoming earnings in this period'}
            </p>
          </div>
        )}

        {/* Earnings grouped by date */}
        {!loading && !error && grouped.length > 0 && (
          <div className="space-y-4">
            {grouped.map(([date, items]) => {
              const today = isToday(date)
              const past = isPast(date)

              return (
                <div key={date}>
                  {/* Date Header */}
                  <div className={`flex items-center gap-2 mb-2 px-1 ${past ? 'opacity-60' : ''}`}>
                    <div className={`w-2 h-2 rounded-full ${
                      today ? 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.5)] animate-pulse' :
                      past ? 'bg-slate-600' : 'bg-emerald-400'
                    }`} />
                    <span className={`text-xs font-bold ${
                      today ? 'text-cyan-400' : past ? 'text-slate-500' : 'text-white'
                    }`}>
                      {formatDate(date)}
                    </span>
                    {today && (
                      <span className="text-[9px] font-bold bg-cyan-400/10 text-cyan-400 px-1.5 py-0.5 rounded-full">
                        TODAY
                      </span>
                    )}
                    <span className="text-[10px] text-slate-600">{items.length} earnings</span>
                  </div>

                  {/* Earnings Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {items.map((item, i) => {
                      const hasActual = item.epsActual != null
                      const beat = hasActual && item.epsEstimate != null && item.epsActual > item.epsEstimate
                      const miss = hasActual && item.epsEstimate != null && item.epsActual < item.epsEstimate
                      const met = hasActual && item.epsEstimate != null && item.epsActual === item.epsEstimate

                      const cardBorder = beat
                        ? 'border-l-emerald-400'
                        : miss
                        ? 'border-l-red-400'
                        : hasActual
                        ? 'border-l-slate-400'
                        : 'border-l-transparent'

                      return (
                        <div
                          key={`${item.symbol}-${i}`}
                          className={`bg-white/[0.03] border border-white/10 border-l-2 ${cardBorder} rounded-xl p-3 hover:border-white/15 transition-all ${past && !hasActual ? 'opacity-50' : ''}`}
                        >
                          {/* Top: Symbol + Time */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold font-mono text-white">{item.symbol}</span>
                              {item.quarter && (
                                <span className="text-[9px] text-slate-600 font-mono">Q{item.quarter} {item.year}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {item.hour === 'bmo' ? (
                                <span className="flex items-center gap-1 text-[9px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded">
                                  <Sun size={9} /> BMO
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-[9px] text-purple-400 bg-purple-400/10 border border-purple-400/20 px-1.5 py-0.5 rounded">
                                  <Moon size={9} /> AMC
                                </span>
                              )}
                              {beat && (
                                <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded">
                                  <TrendingUp size={9} /> BEAT
                                </span>
                              )}
                              {miss && (
                                <span className="flex items-center gap-0.5 text-[9px] font-bold text-red-400 bg-red-400/10 border border-red-400/20 px-1.5 py-0.5 rounded">
                                  <TrendingDown size={9} /> MISS
                                </span>
                              )}
                              {met && (
                                <span className="flex items-center gap-0.5 text-[9px] font-bold text-slate-400 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
                                  <Minus size={9} /> MET
                                </span>
                              )}
                            </div>
                          </div>

                          {/* EPS Row */}
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <div className="text-[10px] text-slate-600 mb-0.5">EPS Est.</div>
                              <div className="text-xs font-mono text-slate-400">
                                {item.epsEstimate != null ? `$${item.epsEstimate.toFixed(2)}` : '—'}
                              </div>
                            </div>
                            {hasActual && (
                              <div className="flex-1">
                                <div className="text-[10px] text-slate-600 mb-0.5">EPS Actual</div>
                                <div className={`text-xs font-mono font-bold ${
                                  beat ? 'text-emerald-400' : miss ? 'text-red-400' : 'text-white'
                                }`}>
                                  ${item.epsActual.toFixed(2)}
                                </div>
                              </div>
                            )}
                            {item.revenueEstimate != null && (
                              <div className="flex-1">
                                <div className="text-[10px] text-slate-600 mb-0.5">Rev Est.</div>
                                <div className="text-xs font-mono text-slate-400">
                                  {(item.revenueEstimate / 1e9).toFixed(1)}B
                                </div>
                              </div>
                            )}
                            {item.revenueActual != null && (
                              <div className="flex-1">
                                <div className="text-[10px] text-slate-600 mb-0.5">Rev Actual</div>
                                <div className={`text-xs font-mono font-bold ${
                                  item.revenueActual > (item.revenueEstimate || 0) ? 'text-emerald-400' : 'text-red-400'
                                }`}>
                                  {(item.revenueActual / 1e9).toFixed(1)}B
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}