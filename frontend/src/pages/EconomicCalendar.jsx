import { useState, useEffect } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { Calendar, AlertTriangle, Minus, ChevronDown, RefreshCw } from 'lucide-react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

const IMPACT_CONFIG = {
  High:   { color: 'text-red-400',   bg: 'bg-red-500/10',   border: 'border-red-500/20',   icon: AlertTriangle, dot: 'bg-red-400' },
  Medium: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: ChevronDown,   dot: 'bg-amber-400' },
  Low:    { color: 'text-slate-400', bg: 'bg-white/5',      border: 'border-white/10',     icon: Minus,         dot: 'bg-slate-500' },
}

function isSameDay(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
}

function formatDate(dateStr) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(dateStr) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function SkeletonRow() {
  return (
    <tr className="border-b border-white/5">
      {[...Array(7)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-white/5 rounded animate-pulse" style={{ width: `${60 + i * 10}%` }} />
        </td>
      ))}
    </tr>
  )
}

function ValueCell({ value }) {
  if (!value) return <span className="text-slate-600">—</span>
  return <span className="text-white font-medium">{value}</span>
}

export default function EconomicCalendar() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [highOnly, setHighOnly] = useState(false)
  const [view, setView] = useState('today') // 'today' | 'week'
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchCalendar = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/api/calendar`)
      if (!res.ok) throw new Error('Failed to fetch calendar')
      const data = await res.json()
      setEvents(Array.isArray(data) ? data : [])
      setLastUpdated(new Date())
    } catch (err) {
      setError('Could not load calendar data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCalendar() }, [])

  // Filter by view
  let filtered = view === 'today'
    ? events.filter(e => isSameDay(e.date))
    : events

  // Filter by impact
  if (highOnly) filtered = filtered.filter(e => e.impact === 'High')

  // Group by date (only for week view)
  const grouped = filtered.reduce((acc, event) => {
    const day = formatDate(event.date)
    if (!acc[day]) acc[day] = []
    acc[day].push(event)
    return acc
  }, {})

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  })

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <Calendar size={18} className="text-cyan-400" />
              </div>
              <h1 className="text-xl font-bold text-white">Economic Calendar</h1>
            </div>
            <p className="text-slate-400 text-sm ml-12">
              {view === 'today' ? todayLabel : 'This week — all macro events'}
              {lastUpdated && (
                <span className="text-slate-600 ml-2">· Updated {lastUpdated.toLocaleTimeString()}</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">

            {/* Today / Week Toggle */}
            <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-1">
              <button
                onClick={() => setView('today')}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  view === 'today'
                    ? 'bg-cyan-500 text-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setView('week')}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  view === 'week'
                    ? 'bg-cyan-500 text-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                This Week
              </button>
            </div>

            {/* High Impact Toggle */}
            <button
              onClick={() => setHighOnly(!highOnly)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${
                highOnly
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              <AlertTriangle size={13} />
              High Impact Only
            </button>

            {/* Refresh */}
            <button
              onClick={fetchCalendar}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs font-semibold text-slate-400 hover:text-white transition-all disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Impact Legend */}
        <div className="flex items-center gap-5 text-xs text-slate-500">
          <span className="font-medium text-slate-400">Impact:</span>
          {Object.entries(IMPACT_CONFIG).map(([label, cfg]) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              <span className={cfg.color}>{label}</span>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Table */}
        {!error && (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Currency</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Impact</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Event</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actual</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Forecast</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Previous</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(8)].map((_, i) => <SkeletonRow key={i} />)
                  ) : view === 'today' ? (
                    // TODAY VIEW — flat list, no grouping
                    filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-16 text-center text-slate-500">
                          <Calendar size={28} className="mx-auto mb-3 opacity-30" />
                          <p>No events scheduled for today.</p>
                        </td>
                      </tr>
                    ) : (
                      filtered.map((event, idx) => {
                        const impact = IMPACT_CONFIG[event.impact] || IMPACT_CONFIG.Low
                        const Icon = impact.icon
                        return (
                          <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors duration-100">
                            <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatTime(event.date)}</td>
                            <td className="px-4 py-3">
                              <span className="text-xs font-bold px-2 py-1 rounded-md bg-white/10 text-slate-300">
                                {event.country}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-md border ${impact.bg} ${impact.border} ${impact.color}`}>
                                <Icon size={11} />
                                {event.impact}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-white font-medium max-w-[260px]">{event.title}</td>
                            <td className="px-4 py-3 text-right"><ValueCell value={event.actual} /></td>
                            <td className="px-4 py-3 text-right text-slate-400"><ValueCell value={event.forecast} /></td>
                            <td className="px-4 py-3 text-right text-slate-500"><ValueCell value={event.previous} /></td>
                          </tr>
                        )
                      })
                    )
                  ) : (
                    // WEEK VIEW — grouped by day
                    Object.entries(grouped).map(([day, dayEvents]) => (
                      <>
                        <tr key={`day-${day}`} className="border-b border-white/5 bg-white/[0.02]">
                          <td colSpan={7} className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
                            {day}
                          </td>
                        </tr>
                        {dayEvents.map((event, idx) => {
                          const impact = IMPACT_CONFIG[event.impact] || IMPACT_CONFIG.Low
                          const Icon = impact.icon
                          return (
                            <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors duration-100">
                              <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatTime(event.date)}</td>
                              <td className="px-4 py-3">
                                <span className="text-xs font-bold px-2 py-1 rounded-md bg-white/10 text-slate-300">
                                  {event.country}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-md border ${impact.bg} ${impact.border} ${impact.color}`}>
                                  <Icon size={11} />
                                  {event.impact}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-white font-medium max-w-[260px]">{event.title}</td>
                              <td className="px-4 py-3 text-right"><ValueCell value={event.actual} /></td>
                              <td className="px-4 py-3 text-right text-slate-400"><ValueCell value={event.forecast} /></td>
                              <td className="px-4 py-3 text-right text-slate-500"><ValueCell value={event.previous} /></td>
                            </tr>
                          )
                        })}
                      </>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}