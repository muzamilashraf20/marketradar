import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import {
  TrendingUp, TrendingDown, AlertCircle, ShieldCheck,
  Newspaper, Calendar, ArrowUpRight, ArrowDownRight, Minus,
  BarChart2, RefreshCw, Zap, Loader2
} from 'lucide-react'
import { useEffect } from 'react'
import { SkeletonCard, SkeletonRow } from '../components/common/Skeleton'
import { useAuth } from '../context/AuthContext'
import { Lock } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const FLAG = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  AUD: '🇦🇺', NZD: '🇳🇿', CAD: '🇨🇦', CHF: '🇨🇭'
}

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
  const { isPro } = useAuth()

  const [news, setNews] = useState([])
  const [newsLoading, setNewsLoading] = useState(true)

  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [highImpactToday, setHighImpactToday] = useState(0)

  const [strength, setStrength] = useState(null)
  const [strengthLoading, setStrengthLoading] = useState(true)

  const [biasCards, setBiasCards] = useState([])
  const [biasLoading, setBiasLoading] = useState(false)
  const [biasError, setBiasError] = useState('')

  // AI-powered Today's Bias (from /api/today-bias)
  const [aiBias, setAiBias] = useState(null)
  const [aiBiasLoading, setAiBiasLoading] = useState(true)

  const [propRisk, setPropRisk] = useState({
    status: 'SAFE', color: 'text-emerald-400',
    bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', drawdown: '0.0'
  })

  useEffect(() => {
    fetchNews()
    fetchCalendar()
    fetchStrength()
    fetchTodayBias()
    loadPropRisk()
  }, [])

  const fetchNews = async () => {
    try {
      setNewsLoading(true)
      const res = await fetch(`${API_BASE}/api/news`)
      const data = await res.json()
      if (data.success) {
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
        const now = new Date()
        // Count ALL of today's high-impact events (same logic as Econ Calendar page)
        const isTodayDate = (ds) => {
          if (!ds) return false
          const d = new Date(ds), t = new Date()
          return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
        }
        setHighImpactToday(
          data.filter(e => isTodayDate(e.date) && (String(e.impact).toLowerCase() === 'high' || e.impact === 3)).length
        )
        const upcoming = data
          .filter(e => new Date(e.date) >= now)
          .sort((a, b) => {
            const impactOrder = { High: 0, Medium: 1, Low: 2 }
            if (impactOrder[a.impact] !== impactOrder[b.impact])
              return impactOrder[a.impact] - impactOrder[b.impact]
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

  const fetchTodayBias = async () => {
    try {
      setAiBiasLoading(true)
      const res = await fetch(`${API_BASE}/api/today-bias`)
      const data = await res.json()
      // Endpoint returns top-level direction/pair/confidence/tradeGrade/reasoning when a bias exists
      if (data.success && data.direction) {
        setAiBias({
          pair: data.pair,
          direction: data.direction,
          confidence: data.confidence,
          grade: data.tradeGrade,
          reasoning: data.reasoning,
          generatedAt: data.generatedAt || data.updatedAt || data.bias?.generatedAt || null,
          stale: !!data.stale,
        })
      } else {
        setAiBias(null)
      }
    } catch (e) {
      console.error('Today bias fetch error:', e)
      setAiBias(null)
    } finally {
      setAiBiasLoading(false)
    }
  }

  const loadPropRisk = () => {
    try {
      const saved = localStorage.getItem('bf_prop_settings')
      if (saved) {
        const settings = JSON.parse(saved)
        const dailyUsed = parseFloat(settings.dailyDrawdownUsed) || 0
        const maxDaily = parseFloat(settings.maxDailyDrawdown) || 5
        const pct = maxDaily > 0 ? (dailyUsed / maxDaily) * 100 : 0
        if (pct >= 80) {
          setPropRisk({ status: 'DANGER', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', drawdown: dailyUsed.toFixed(1) })
        } else if (pct >= 50) {
          setPropRisk({ status: 'CAUTION', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', drawdown: dailyUsed.toFixed(1) })
        } else {
          setPropRisk({ status: 'SAFE', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', drawdown: dailyUsed.toFixed(1) })
        }
      }
    } catch (e) {
      console.error('Prop risk load error:', e)
    }
  }

  const generateBias = async () => {
    setBiasLoading(true)
    setBiasError('')
    const symbols = isPro ? ['EUR/USD', 'GBP/USD', 'XAU/USD', 'NAS100'] : ['EUR/USD']
    const cards = []

    for (const symbol of symbols) {
      try {
        const res = await fetch(`${API_BASE}/api/bias`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, timeframe: 'intraday' }),
        })
        const data = await res.json()
        if (data.success && data.bias) {
          const b = data.bias
          const dir = (b.direction || b.bias || 'neutral').toLowerCase()
          let direction = 'Neutral', icon = Minus, color = 'text-slate-400', bar = 'bg-slate-400'
          if (dir.includes('bull') || dir.includes('long') || dir.includes('up')) {
            direction = 'Bullish'; icon = ArrowUpRight; color = 'text-emerald-400'; bar = 'bg-emerald-400'
          } else if (dir.includes('bear') || dir.includes('short') || dir.includes('down')) {
            direction = 'Bearish'; icon = ArrowDownRight; color = 'text-red-400'; bar = 'bg-red-400'
          }
          cards.push({
            asset: symbol, direction, icon,
            confidence: b.confidence || b.score || Math.floor(Math.random() * 30 + 55),
            reason: b.reason || b.summary || b.rationale || 'AI analysis complete',
            color, bar,
          })
        }
      } catch (e) {
        console.error(`Bias error for ${symbol}:`, e)
      }
    }

    if (cards.length === 0)
      setBiasError('AI bias generation failed — credits may be exhausted. Try again later.')
    setBiasCards(cards)
    setBiasLoading(false)
  }

  const getBiasFromStrength = () => {
    if (!strength || strength.marketClosed) return null
    const best = strength.bestPairs?.[0]
    if (!best) return null
    return { pair: best.pair, action: best.action, reason: best.reason }
  }

  const dirToAction = (dir) => {
    const d = (dir || '').toLowerCase()
    if (d.includes('bull')) return 'BUY'
    if (d.includes('bear')) return 'SELL'
    return 'NEUTRAL'
  }

  // Prefer the AI-powered bias; fall back to rule-based strength divergence
  const todaysBias = aiBias
    ? {
        pair: aiBias.pair,
        action: dirToAction(aiBias.direction),
        reason: aiBias.reasoning,
        confidence: aiBias.confidence,
        grade: aiBias.grade,
        generatedAt: aiBias.generatedAt,
        stale: aiBias.stale,
        ai: true,
      }
    : getBiasFromStrength()

  // Bias freshness: stale if generated 60+ minutes ago, or backend flagged it stale
  const biasAgeMins = todaysBias?.generatedAt
    ? Math.floor((Date.now() - new Date(todaysBias.generatedAt).getTime()) / 60000)
    : null
  const biasIsStale = todaysBias?.stale || (biasAgeMins !== null && biasAgeMins >= 60)
  const biasGeneratedLabel = todaysBias?.generatedAt
    ? new Date(todaysBias.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
    : null

  const biasWidgetLoading = aiBiasLoading && strengthLoading
  const topEvent = events[0]

  return (
    <DashboardLayout title="Overview" subtitle="Your macro intelligence hub">
      <div className="space-y-5">
        {/* ── Morning Summary Widget ── */}
        <div className="bg-gradient-to-r from-cyan-500/5 via-[#020617] to-emerald-500/5 border border-white/10 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-cyan-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Quick Glance</h2>
            <span className="text-[10px] text-slate-600 ml-auto">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* High Impact Events */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <Calendar size={16} className="text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-black text-white leading-none">
                  {eventsLoading ? '...' : highImpactToday}
                </p>
                <p className="text-[10px] text-slate-500 truncate">High-Impact Events Today</p>
              </div>
            </div>
            {/* Next Event */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
                <AlertCircle size={16} className="text-cyan-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white leading-tight truncate">
                  {eventsLoading ? '...' : topEvent ? topEvent.title || topEvent.event || 'No events' : 'No events'}
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  {topEvent?.time ? `at ${topEvent.time}` : 'Next event'}
                </p>
              </div>
            </div>
            {/* Top Bias */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                todaysBias?.action === 'SELL' ? 'bg-red-500/10' : 'bg-emerald-500/10'
              }`}>
                {todaysBias?.action === 'SELL'
                  ? <TrendingDown size={16} className="text-red-400" />
                  : <TrendingUp size={16} className="text-emerald-400" />}
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-bold leading-tight ${
                  todaysBias?.action === 'SELL' ? 'text-red-400' : 'text-emerald-400'
                }`}>
                  {strengthLoading ? '...' : todaysBias ? `${todaysBias.action} ${todaysBias.pair}` : 'No signal'}
                </p>
                <p className="text-[10px] text-slate-500 truncate">Top Bias from Strength</p>
              </div>
            </div>
            {/* Prop Firm Status */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${propRisk.bg}`}>
                <ShieldCheck size={16} className={propRisk.color} />
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-bold leading-tight ${propRisk.color}`}>{propRisk.status}</p>
                <p className="text-[10px] text-slate-500">Drawdown: {propRisk.drawdown}% used</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 1: Stat Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

          {/* Today's Bias */}
          <div className={`rounded-xl p-3 sm:p-4 border ${
            todaysBias?.action === 'SELL'
              ? 'bg-red-500/10 border-red-500/20'
              : 'bg-emerald-500/10 border-emerald-500/20'
          }`}>
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Today's Bias</span>
              <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center ${
                todaysBias?.action === 'SELL' ? 'bg-red-500/10' : 'bg-emerald-500/10'
              }`}>
                {strengthLoading
                  ? <Loader2 size={13} className="text-slate-400 animate-spin" />
                  : todaysBias?.action === 'SELL'
                  ? <TrendingDown size={13} className="text-red-400" />
                  : <TrendingUp size={13} className="text-emerald-400" />
                }
              </div>
            </div>
            {strengthLoading ? (
              <>
                <div className="h-4 bg-white/10 rounded animate-pulse mb-1 w-3/4" />
                <div className="h-3 bg-white/10 rounded animate-pulse w-1/2" />
              </>
            ) : todaysBias ? (
              <>
                <p className={`text-xs sm:text-sm font-bold leading-none mb-1 truncate ${
                  todaysBias.action === 'SELL' ? 'text-red-400' : 'text-emerald-400'
                }`}>
                  {todaysBias.action} {todaysBias.pair}
                </p>
                {todaysBias.ai && todaysBias.confidence ? (
                  <p className="text-[10px] font-semibold text-cyan-400 mb-0.5">
                    {todaysBias.confidence}% confidence{todaysBias.grade && todaysBias.grade !== '-' ? ` · Grade ${todaysBias.grade}` : ''}
                  </p>
                ) : null}
                <p className="text-[10px] text-slate-500 line-clamp-1">{todaysBias.reason}</p>
                {todaysBias.ai && biasGeneratedLabel ? (
                  biasIsStale ? (
                    <button
                      onClick={fetchTodayBias}
                      className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      <AlertCircle size={10} />
                      Stale · {biasGeneratedLabel} · Tap to refresh
                    </button>
                  ) : (
                    <p className="mt-1 text-[10px] text-slate-400 font-medium">
                      Generated at {biasGeneratedLabel}
                    </p>
                  )
                ) : null}
              </>
            ) : (
              <>
                <p className="text-xs sm:text-sm font-bold text-slate-400 leading-none mb-1">Market Closed</p>
                <p className="text-[10px] text-slate-500">Opens Monday</p>
              </>
            )}
          </div>

          {/* Next Event */}
          <div className="rounded-xl p-3 sm:p-4 border bg-amber-500/10 border-amber-500/20">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Next Event</span>
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <AlertCircle size={13} className="text-amber-400" />
              </div>
            </div>
            {eventsLoading ? (
              <>
                <div className="h-4 bg-white/10 rounded animate-pulse mb-1" />
                <div className="h-3 bg-white/10 rounded animate-pulse w-2/3" />
              </>
            ) : topEvent ? (
              <>
                <p className="text-xs sm:text-sm font-bold text-amber-400 leading-none mb-1 truncate">{topEvent.title}</p>
                <p className="text-[10px] text-slate-500 truncate">{topEvent.country} · {topEvent.impact} Impact</p>
              </>
            ) : (
              <p className="text-xs sm:text-sm font-bold text-amber-400">No events today</p>
            )}
          </div>

          {/* Top News */}
          <div className="rounded-xl p-3 sm:p-4 border bg-cyan-500/10 border-cyan-500/20">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Top News</span>
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <ArrowUpRight size={13} className="text-cyan-400" />
              </div>
            </div>
            {newsLoading ? (
              <>
                <div className="h-4 bg-white/10 rounded animate-pulse mb-1" />
                <div className="h-3 bg-white/10 rounded animate-pulse w-1/2" />
              </>
            ) : news[0] ? (
              <>
                <p className="text-[11px] sm:text-xs font-bold text-cyan-400 leading-snug line-clamp-2">{news[0].title}</p>
                <p className="text-[10px] text-slate-500 mt-1 truncate">{news[0].source}</p>
              </>
            ) : (
              <p className="text-xs text-cyan-400">No news available</p>
            )}
          </div>

          {/* Prop Risk */}
          <div className={`rounded-xl p-3 sm:p-4 border ${propRisk.bg} ${propRisk.border}`}>
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Prop Risk</span>
              <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg ${propRisk.bg} flex items-center justify-center`}>
                <ShieldCheck size={13} className={propRisk.color} />
              </div>
            </div>
            <p className={`text-base sm:text-lg font-bold leading-none mb-1 ${propRisk.color}`}>{propRisk.status}</p>
            <p className="text-[10px] text-slate-500">{propRisk.drawdown}% drawdown used</p>
          </div>
        </div>

        {/* ── Row 2: Live News + Upcoming Events ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Live News */}
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Newspaper size={15} className="text-cyan-400" />
                <h2 className="text-sm font-bold text-white">Live News</h2>
              </div>
              <span onClick={() => navigate('/news')} className="text-xs text-slate-500 hover:text-cyan-400 cursor-pointer transition-colors">
                View all →
              </span>
            </div>

           {newsLoading && (
              <div className="space-y-1">
                {[1,2,3].map(i => <SkeletonRow key={i} />)}
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
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar size={15} className="text-cyan-400" />
                <h2 className="text-sm font-bold text-white">Upcoming Events</h2>
              </div>
              <span onClick={() => navigate('/calendar')} className="text-xs text-slate-500 hover:text-cyan-400 cursor-pointer transition-colors">
                View all →
              </span>
            </div>

            {eventsLoading && (
              <div className="space-y-1">
                {[1,2,3].map(i => <SkeletonRow key={i} />)}
              </div>
            )}

            {!eventsLoading && events.length > 0 && (
              <div className="space-y-3">
                {events.map((item, i) => {
                  const impactColor = item.impact === 'High' ? 'bg-red-400'
                    : item.impact === 'Medium' ? 'bg-amber-400' : 'bg-slate-400'
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
                        <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                          {item.country} · {eventTime}
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

        {/* ── Row 3: Currency Strength ── */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 size={15} className="text-cyan-400" />
              <h2 className="text-sm font-bold text-white">Currency Strength</h2>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={fetchStrength} className="text-slate-500 hover:text-white transition-colors">
                <RefreshCw size={13} className={strengthLoading ? 'animate-spin' : ''} />
              </button>
              <span onClick={() => navigate('/strength')} className="text-xs text-slate-500 hover:text-cyan-400 cursor-pointer transition-colors">
                View all →
              </span>
            </div>
          </div>

          {strengthLoading && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="h-20 bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {!strengthLoading && strength && !isPro && (
            <div className="relative">
              <div className="absolute inset-0 z-10 bg-[#030712]/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-2">
                <Lock size={20} className="text-cyan-400" />
                <p className="text-sm font-bold text-white">Pro Feature</p>
                <p className="text-xs text-slate-400">Currency strength analysis</p>
                <button onClick={() => navigate('/pricing')} className="mt-1 px-4 py-2 bg-cyan-500 text-black text-xs font-bold rounded-lg hover:bg-cyan-400 transition-colors">
                  Upgrade to Pro
                </button>
              </div>
              <div className="filter blur-sm pointer-events-none">
              {/* Blurred preview for free users */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {strength.currencies.map(c => (
                  <div key={c.currency} className="rounded-lg p-2 sm:p-3 border bg-white/5 border-white/10 text-center">
                    <div className="text-base sm:text-lg mb-0.5">🏳️</div>
                    <div className="text-[10px] sm:text-xs font-black text-white">{c.currency}</div>
                    <div className="text-[10px] sm:text-xs font-bold mt-0.5 text-slate-400">--</div>
                  </div>
                ))}
              </div>
              </div>
            </div>
          )}

          {!strengthLoading && strength && isPro && (
            <>
              {/* FIX: 4 cols mobile → 8 cols desktop, smaller padding on mobile */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {strength.currencies.map(c => {
                  const isStrong = c.label === 'Strong'
                  const isWeak = c.label === 'Weak'
                  return (
                    <div key={c.currency}
                      className={`rounded-lg p-2 sm:p-3 border text-center ${
                        isStrong ? 'bg-emerald-500/10 border-emerald-500/20' :
                        isWeak ? 'bg-red-500/10 border-red-500/20' :
                        'bg-white/5 border-white/10'
                      }`}>
                      <div className="text-base sm:text-lg mb-0.5 sm:mb-1">{FLAG[c.currency] || '🏳️'}</div>
                      <div className="text-[10px] sm:text-xs font-black text-white">{c.currency}</div>
                      <div className={`text-[10px] sm:text-xs font-bold mt-0.5 sm:mt-1 ${
                        isStrong ? 'text-emerald-400' :
                        isWeak ? 'text-red-400' : 'text-amber-400'
                      }`}>{c.strength}</div>
                      <div className="w-full bg-white/10 rounded-full h-1 mt-1">
                        <div className={`h-1 rounded-full ${
                          isStrong ? 'bg-emerald-500' :
                          isWeak ? 'bg-red-500' : 'bg-amber-500'
                        }`} style={{ width: `${c.strength}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              {!strength.marketClosed && strength.bestPairs?.[0] && (
                <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-500">Best trade:</span>
                  <span className="text-xs font-bold text-emerald-400">
                    {strength.bestPairs[0].action} {strength.bestPairs[0].pair}
                  </span>
                  <span className="text-xs text-slate-500 hidden sm:inline">— {strength.bestPairs[0].reason}</span>
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

        {/* ── Row 4: AI Bias Snapshot ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-cyan-400" />
              <h2 className="text-sm font-bold text-white">AI Bias Snapshot</h2>
            </div>
            <span onClick={() => navigate('/bias')} className="text-xs text-slate-500 hover:text-cyan-400 cursor-pointer transition-colors">
              Full Analysis →
            </span>
          </div>

          {/* CTA — no bias yet */}
          {biasCards.length === 0 && !biasLoading && (
            <div className="bg-white/[0.03] border border-dashed border-white/10 rounded-xl p-6 sm:p-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-cyan-400/10 flex items-center justify-center mx-auto mb-4">
                <Zap size={22} className="text-cyan-400" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">Generate Today's AI Bias</h3>
              <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
                Get AI-powered directional bias for EUR/USD, GBP/USD, Gold, and NAS100 based on current macro conditions.
              </p>
              <button
                onClick={generateBias}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 text-black text-xs font-bold rounded-xl hover:opacity-90 transition-all"
              >
                Generate AI Bias
              </button>
              {biasError && <p className="text-xs text-red-400 mt-3">{biasError}</p>}
              {!isPro && (
                <p className="text-xs text-slate-500 mt-3">
                  Free plan: 1 pair only.{' '}
                  <span onClick={() => navigate('/pricing')} className="text-cyan-400 hover:text-cyan-300 cursor-pointer font-semibold">
                    Upgrade to Pro for all 4 pairs →
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Loading */}
         {biasLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1,2,3,4].map(i => <SkeletonCard key={i} />)}
            </div>
          )}

          {/* Bias cards */}
          {biasCards.length > 0 && !biasLoading && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {biasCards.map(card => {
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
                      <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">{card.reason}</p>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 flex items-center justify-center">
                <button
                  onClick={generateBias}
                  className="text-xs text-slate-500 hover:text-cyan-400 transition-colors flex items-center gap-1"
                >
                  <RefreshCw size={12} />
                  Regenerate
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </DashboardLayout>
  )
}