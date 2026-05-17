import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import {
  TrendingUp, TrendingDown, AlertCircle, ShieldCheck,
  Newspaper, Calendar, ArrowUpRight, ArrowDownRight, Minus,
  BarChart2, RefreshCw
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const FLAG = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  AUD: '🇦🇺', NZD: '🇳🇿', CAD: '🇨🇦', CHF: '🇨🇭'
}

const BIAS_CARDS = [
  { asset: 'EUR/USD', direction: 'Bullish', icon: ArrowUpRight, confidence: 78, reason: 'ECB hawkish tone + weak USD data', color: 'text-emerald-400', bar: 'bg-emerald-400' },
  { asset: 'GBP/USD', direction: 'Neutral', icon: Minus, confidence: 52, reason: 'Mixed UK data, range-bound near 1.2700', color: 'text-slate-400', bar: 'bg-slate-400' },
  { asset: 'XAU/USD', direction: 'Bullish', icon: ArrowUpRight, confidence: 82, reason: 'Safe haven demand + DXY weakness', color: 'text-cyan-400', bar: 'bg-cyan-400' },
  { asset: 'NAS100', direction: 'Bearish', icon: ArrowDownRight, confidence: 65, reason: 'Rate fears + tech sector rotation out', color: 'text-red-400', bar: 'bg-red-400' },
]

function timeAgo(dateString) {
  const diff = new Date() - new Date(dateString)
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  if (m > 0) return `${m}m ago`
  return 'Just now'
}

export default function Dashboard() {
  const navigate = useNavigate()

  // News state
  const [news, setNews] = useState([])
  const [newsLoading, setNewsLoading] = useState(true)

  // Calendar state
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)

  // Currency strength state
  const [strength, setStrength] = useState(null)
  const [strengthLoading, setStrengthLoading] = useState(true)

  useEffect(() => {
    fetchNews()
    fetchCalendar()
    fetchStrength()
  }, [])

  const fetchNews = async () => {
    try {
      setNewsLoading(true)
      const res = await fetch(`${API_BASE}/api/news`)
      const data = await res.json()
      if (data.success) {
        // Sort by impact, take top 3
        const sorted = (data.articles || [])
          .sort((a, b) => (b.impact || 0) - (a.impact || 0))
          .slice(0, 3)
        setNews(sorted)
      }
    } catch (e) {
      console.error('News fetch error:', e)
    } finally {
      setNewsLoading(false)
    }
  }

  const fetchCalendar = async () => {
    try {
      setEventsLoading(true)
      const res = await fetch(`${API_BASE}/api/calendar`)
      const data = await res.json()
      if (Array.isArray(data)) {
        // Filter today + upcoming, take top 3 high impact
        const now = new Date()
        const upcoming = data
          .filter(e => new Date(e.date) >= now)
          .sort((a, b) => {
            const impactOrder = { High: 0, Medium: 1, Low: 2 }
            if (impactOrder[a.impact] !== impactOrder[b.impact]) {
              return impactOrder[a.impact] - impactOrder[b.impact]
            }
            return new Date(a.date) - new Date(b.date)
          })
          .slice(0, 3)
        setEvents(upcoming)
      }
    } catch (e) {
      console.error('Calendar fetch error:', e)
    } finally {
      setEventsLoading(false)
    }
  }

  const fetchStrength = async () => {
    try {
      setStrengthLoading(true)
      const res = await fetch(`${API_BASE}/api/strength`)
      const data = await res.json()
      if (data.success) setStrength(data)
    } catch (e) {
      console.error('Strength fetch error:', e)
    } finally {
      setStrengthLoading(false)
    }
  }

  // Top event for stat card
  const topEvent = events[0]

  return (
    <DashboardLayout title="Overview" subtitle="Your macro intelligence hub">
      <div className="space-y-6">

        {/* Row 1 — Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl p-4 border bg-emerald-500/10 border-emerald-500/20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 font-medium">Today's Bias</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp size={14} className="text-emerald-400" />
              </div>
            </div>
            <p className="text-lg font-bold text-emerald-400 leading-none mb-1">EURUSD Bullish</p>
            <p className="text-xs text-slate-500">78% confidence</p>
          </div>

          <div className="rounded-xl p-4 border bg-amber-500/10 border-amber-500/20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 font-medium">Next Event</span>
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <AlertCircle size={14} className="text-amber-400" />
              </div>
            </div>
            {eventsLoading ? (
              <div className="h-4 bg-white/10 rounded animate-pulse mb-1" />
            ) : topEvent ? (
              <>
                <p className="text-sm font-bold text-amber-400 leading-none mb-1 truncate">{topEvent.title}</p>
                <p className="text-xs text-slate-500">{topEvent.currency} · {topEvent.impact} Impact</p>
              </>
            ) : (
              <p className="text-sm font-bold text-amber-400">No events today</p>
            )}
          </div>

          <div className="rounded-xl p-4 border bg-cyan-500/10 border-cyan-500/20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 font-medium">Top News</span>
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <ArrowUpRight size={14} className="text-cyan-400" />
              </div>
            </div>
            {newsLoading ? (
              <div className="h-4 bg-white/10 rounded animate-pulse mb-1" />
            ) : news[0] ? (
              <>
                <p className="text-xs font-bold text-cyan-400 leading-snug line-clamp-2">{news[0].title}</p>
                <p className="text-[10px] text-slate-500 mt-1">{news[0].source}</p>
              </>
            ) : (
              <p className="text-sm text-cyan-400">Loading...</p>
            )}
          </div>

          <div className="rounded-xl p-4 border bg-emerald-500/10 border-emerald-500/20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 font-medium">Prop Risk</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <ShieldCheck size={14} className="text-emerald-400" />
              </div>
            </div>
            <p className="text-lg font-bold text-emerald-400 leading-none mb-1">SAFE</p>
            <p className="text-xs text-slate-500">0.3% drawdown used</p>
          </div>
        </div>

        {/* Row 2 — Live News + Upcoming Events */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Live News */}
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Newspaper size={15} className="text-cyan-400" />
                <h2 className="text-sm font-bold text-white">Live News</h2>
              </div>
              <span onClick={() => navigate('/news')} className="text-xs text-slate-500 hover:text-cyan-400 cursor-pointer transition-colors">View all →</span>
            </div>

            {newsLoading && (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />)}
              </div>
            )}

            {!newsLoading && news.length > 0 && (
              <div className="space-y-3">
                {news.map((item, i) => {
                  const score = item.impact || 5
                  const impactLabel = score >= 8 ? 'HIGH' : score >= 5 ? 'MED' : 'LOW'
                  const impactColor = score >= 8
                    ? 'text-red-400 bg-red-500/10 border-red-500/20'
                    : score >= 5
                    ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                    : 'text-slate-400 bg-white/5 border-white/10'
                  return (
                    <div key={i} onClick={() => navigate('/news')}
                      className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/5 hover:border-white/10 transition-colors cursor-pointer">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${impactColor}`}>
                        {impactLabel}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">{item.title}</p>
                        <p className="text-[10px] text-slate-600 mt-1">{item.source} · {timeAgo(item.publishedAt)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {!newsLoading && news.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-4">No news available</p>
            )}
          </div>

          {/* Upcoming Events */}
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar size={15} className="text-cyan-400" />
                <h2 className="text-sm font-bold text-white">Upcoming Events</h2>
              </div>
              <span onClick={() => navigate('/calendar')} className="text-xs text-slate-500 hover:text-cyan-400 cursor-pointer transition-colors">View all →</span>
            </div>

            {eventsLoading && (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />)}
              </div>
            )}

            {!eventsLoading && events.length > 0 && (
              <div className="space-y-3">
                {events.map((item, i) => {
                  const impactColor = item.impact === 'High' ? 'bg-red-400'
                    : item.impact === 'Medium' ? 'bg-amber-400'
                    : 'bg-slate-400'
                  const impactLabel = item.impact === 'High' ? 'HIGH'
                    : item.impact === 'Medium' ? 'MED' : 'LOW'
                  const eventTime = new Date(item.date).toLocaleString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })
                  return (
                    <div key={i} onClick={() => navigate('/calendar')}
                      className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/5 hover:border-white/10 transition-colors cursor-pointer">
                      <div className={`w-1.5 h-8 rounded-full ${impactColor} shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white font-semibold truncate">{item.title}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {item.currency} · {eventTime} · Forecast: {item.forecast}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 shrink-0">{impactLabel}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {!eventsLoading && events.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-4">No upcoming events</p>
            )}
          </div>
        </div>

        {/* Row 3 — Currency Strength */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 size={15} className="text-cyan-400" />
              <h2 className="text-sm font-bold text-white">Currency Strength</h2>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={fetchStrength} className="text-slate-500 hover:text-white transition-colors">
                <RefreshCw size={13} className={strengthLoading ? 'animate-spin' : ''} />
              </button>
              <span onClick={() => navigate('/strength')} className="text-xs text-slate-500 hover:text-cyan-400 cursor-pointer transition-colors">View all →</span>
            </div>
          </div>

          {strengthLoading && (
            <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
              {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />)}
            </div>
          )}

          {!strengthLoading && strength && (
            <>
              <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
                {strength.currencies.map(c => {
                  const isStrong = c.label === 'Strong'
                  const isWeak = c.label === 'Weak'
                  return (
                    <div key={c.currency}
                      className={`rounded-lg p-3 border text-center ${
                        isStrong ? 'bg-emerald-500/10 border-emerald-500/20' :
                        isWeak ? 'bg-red-500/10 border-red-500/20' :
                        'bg-white/5 border-white/10'
                      }`}>
                      <div className="text-lg mb-1">{FLAG[c.currency] || '🏳️'}</div>
                      <div className="text-xs font-black text-white">{c.currency}</div>
                      <div className={`text-xs font-bold mt-1 ${
                        isStrong ? 'text-emerald-400' :
                        isWeak ? 'text-red-400' :
                        'text-amber-400'
                      }`}>{c.strength}</div>
                      <div className="w-full bg-white/10 rounded-full h-1 mt-1.5">
                        <div className={`h-1 rounded-full ${
                          isStrong ? 'bg-emerald-500' :
                          isWeak ? 'bg-red-500' :
                          'bg-amber-500'
                        }`} style={{ width: `${c.strength}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              {!strength.marketClosed && strength.bestPairs?.[0] && (
                <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2">
                  <span className="text-xs text-slate-500">Best trade:</span>
                  <span className="text-xs font-bold text-emerald-400">{strength.bestPairs[0].action} {strength.bestPairs[0].pair}</span>
                  <span className="text-xs text-slate-500">— {strength.bestPairs[0].reason}</span>
                </div>
              )}

              {strength.marketClosed && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-xs text-slate-500 text-center">🔴 Forex market closed (Weekend) — Data will update Monday</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Row 4 — AI Bias Snapshot */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={15} className="text-cyan-400" />
              <h2 className="text-sm font-bold text-white">AI Bias Snapshot</h2>
            </div>
            <span onClick={() => navigate('/bias')} className="text-xs text-slate-500 hover:text-cyan-400 cursor-pointer transition-colors">View all →</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {BIAS_CARDS.map((card) => {
              const Icon = card.icon
              return (
                <div key={card.asset} onClick={() => navigate('/bias')}
                  className="bg-white/[0.03] border border-white/10 rounded-xl p-4 hover:border-white/20 transition-all cursor-pointer">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-white">{card.asset}</span>
                    <div className="flex items-center gap-1.5">
                      <Icon size={14} className={card.color} />
                      <span className={`text-xs font-semibold ${card.color}`}>{card.direction}</span>
                    </div>
                  </div>
                  <div className="mb-3">
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-slate-500">Confidence</span>
                      <span className={`text-[10px] font-bold ${card.color}`}>{card.confidence}%</span>
                    </div>
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${card.bar}`} style={{ width: `${card.confidence}%` }} />
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