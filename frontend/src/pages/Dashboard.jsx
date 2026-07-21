import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import {
  TrendingUp, TrendingDown, AlertCircle, ShieldCheck,
  Newspaper, Calendar, ArrowUpRight,
  BarChart2, RefreshCw, Zap, Loader2, History, X,
  Compass, Bot, Target, Clock, Check, Circle
} from 'lucide-react'
import { useEffect } from 'react'
import { SkeletonRow, SkeletonLine } from '../components/common/Skeleton'
import { useAuth } from '../context/AuthContext'
import { Lock } from 'lucide-react'
import MacroCompass from '../components/dashboard/MacroCompass'
import ArcGauge from '../components/dashboard/ArcGauge'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

// ── Surface tokens ──────────────────────────────────────────────────────────
// Three elevation levels, matching MacroCompass so the page reads as one system.
// PANEL = section container · CARD = a stat inside a section · ROW = a list item.
// Written as full static strings — never interpolate Tailwind class fragments.
const PANEL = 'rounded-2xl border border-white/5 bg-white/[0.02] shadow-lg shadow-black/20'
const CARD = 'rounded-xl border border-white/5 bg-white/[0.03]'
const ROW = 'rounded-lg border border-white/5 bg-white/[0.02]'

// ── Conviction accent ───────────────────────────────────────────────────────
// Colour carries CONVICTION, never direction. Direction is already stated twice — in the word
// BUY/SELL and in the arrow icon — so spending colour on it too would waste the only channel
// left for "how much do we believe this", and make a weak SELL shout louder than a strong BUY.
// Mirrors MacroCompass GRADE_STYLE. Duplicated rather than imported because that file does not
// export it and is intentionally frozen; worth de-duplicating after launch.
const GRADE_ACCENT = {
  'A':  { hex: '#10b981', text: 'text-emerald-400', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  'A-': { hex: '#10b981', text: 'text-emerald-400', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  'B':  { hex: '#06b6d4', text: 'text-cyan-400',    chip: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25' },
  'C':  { hex: '#eab308', text: 'text-yellow-400',  chip: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25' },
  'D':  { hex: '#64748b', text: 'text-slate-400',   chip: 'bg-slate-500/15 text-slate-400 border-slate-500/25' },
}
const gradeAccent = g => GRADE_ACCENT[g] || GRADE_ACCENT.D

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
  const { isPro, user } = useAuth()

  const [news, setNews] = useState([])
  const [newsLoading, setNewsLoading] = useState(true)

  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [highImpactToday, setHighImpactToday] = useState(0)
  const [showBiasHistory, setShowBiasHistory] = useState(false)
  const [biasHistory, setBiasHistory] = useState([])
  const [biasSummary, setBiasSummary] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const openBiasHistory = async () => {
    setShowBiasHistory(true)
    setHistoryLoading(true)
    try {
      // Performance endpoint returns the same history PLUS a real-market score per bias + summary stats
      const res = await fetch(`${API_BASE}/api/bias-performance?days=14`)
      const data = await res.json()
      setBiasHistory(Array.isArray(data.history) ? data.history : [])
      setBiasSummary(data.summary || null)
    } catch (e) { setBiasHistory([]); setBiasSummary(null) }
    setHistoryLoading(false)
  }

  const [strength, setStrength] = useState(null)
  const [strengthLoading, setStrengthLoading] = useState(true)

  // AI-powered Today's Bias (from /api/today-bias)
  const [aiBias, setAiBias] = useState(null)
  const [aiBiasLoading, setAiBiasLoading] = useState(true)

  const [propRisk, setPropRisk] = useState({
    status: 'SAFE', color: 'text-emerald-400',
    bg: 'bg-emerald-500/10', border: 'border-emerald-500/20',
    drawdown: '0.0', pct: 0, hex: '#10b981', configured: false
  })

  useEffect(() => {
    fetchNews()
    fetchCalendar()
    fetchStrength()
    fetchTodayBias()
    loadPropRisk()
  }, [])

  // Escape closes the history modal — a dialog you can only dismiss with the mouse traps
  // keyboard users, since there is nothing else focusable behind the overlay.
  useEffect(() => {
    if (!showBiasHistory) return
    const onKey = (e) => { if (e.key === 'Escape') setShowBiasHistory(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showBiasHistory])

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
          movePotential: data.movePotential || null,
          entryQuality: data.bias?.entryQuality || null,
          generatedAt: data.generatedAt || data.updatedAt || data.bias?.generatedAt || null,
          stale: !!data.stale,
          selectionMethod: data.selectionMethod || 'formula',
          selectionReasoning: data.selectionReasoning || null,
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
          setPropRisk({ status: 'DANGER', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', drawdown: dailyUsed.toFixed(1), pct, hex: '#f87171', configured: true })
        } else if (pct >= 50) {
          setPropRisk({ status: 'CAUTION', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', drawdown: dailyUsed.toFixed(1), pct, hex: '#fbbf24', configured: true })
        } else {
          setPropRisk({ status: 'SAFE', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', drawdown: dailyUsed.toFixed(1), pct, hex: '#10b981', configured: true })
        }
      }
    } catch (e) {
      console.error('Prop risk load error:', e)
    }
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
        movePotential: aiBias.movePotential,
        entryQuality: aiBias.entryQuality,
        generatedAt: aiBias.generatedAt,
        stale: aiBias.stale,
        selectionMethod: aiBias.selectionMethod,
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

  const topEvent = events[0]

  // Weekend feeds return every currency at 0. Rendering that as a live grid of empty bars looks
  // broken rather than closed, so swap in an explicit state. Deliberately strict: both conditions
  // must hold, otherwise a genuine flat-but-open market would be hidden.
  const strengthAllZero = !!strength?.currencies?.length
    && strength.currencies.every(c => !Number(c.strength))
  const strengthOffline = strengthAllZero && !!strength?.marketClosed

  return (
    <DashboardLayout title="Overview" subtitle="Your macro intelligence hub">
      <div className="space-y-5">
        {/* ── Greeting ── */}
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}
          {user?.name ? `, ${user.name}` : ''}.
        </h1>

        {/* ── Morning Summary Widget ── */}
        <div className="bg-gradient-to-r from-cyan-500/5 via-[#020617] to-emerald-500/5 border border-white/5 rounded-2xl shadow-lg shadow-black/20 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-cyan-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Quick Glance</h2>
            <span className="text-[10px] text-slate-600 ml-auto">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* High Impact Events */}
            <div className={`flex items-center gap-3 p-3 ${CARD}`}>
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <Calendar size={16} className="text-amber-400" />
              </div>
              <div className="min-w-0">
                {eventsLoading
                  ? <SkeletonLine width="w-6" height="h-[18px]" />
                  : <p className="text-lg font-black text-white leading-none">{highImpactToday}</p>}
                <p className="text-[10px] text-slate-500 truncate">High-Impact Events Today</p>
              </div>
            </div>
            {/* Next Event */}
            <div className={`flex items-center gap-3 p-3 ${CARD}`}>
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
                <AlertCircle size={16} className="text-cyan-400" />
              </div>
              <div className="min-w-0">
                {eventsLoading
                  ? <SkeletonLine width="w-28" height="h-[14px]" />
                  : <p className="text-sm font-bold text-white leading-tight truncate">
                      {topEvent ? topEvent.title || topEvent.event || 'No events' : 'No events'}
                    </p>}
                <p className="text-[10px] text-slate-500 truncate">
                  {topEvent?.time ? `at ${topEvent.time}` : 'Next event'}
                </p>
              </div>
            </div>
            {/* Top Bias */}
            <div className={`flex items-center gap-3 p-3 ${CARD}`}>
              <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                {todaysBias?.action === 'SELL'
                  ? <TrendingDown size={16} className={gradeAccent(todaysBias?.grade).text} />
                  : <TrendingUp size={16} className={gradeAccent(todaysBias?.grade).text} />}
              </div>
              <div className="min-w-0">
                {strengthLoading
                  ? <SkeletonLine width="w-24" height="h-[14px]" />
                  : <p className="text-sm font-bold leading-tight text-white">
                      {todaysBias ? `${todaysBias.action} ${todaysBias.pair}` : 'No signal'}
                    </p>}
                <p className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                  {todaysBias?.selectionMethod === 'v2' ? (
                    <><Compass size={10} className="shrink-0 text-cyan-400" />Macro Compass</>
                  ) : todaysBias?.selectionMethod === 'ai' ? (
                    <><Bot size={10} className="shrink-0 text-cyan-400" />AI Selected Pair</>
                  ) : 'Top Bias from Strength'}
                </p>
              </div>
            </div>
            {/* Prop Firm Status */}
            <div className={`flex items-center gap-3 p-3 ${CARD}`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${propRisk.bg}`}>
                <ShieldCheck size={16} className={propRisk.color} />
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-bold leading-tight ${propRisk.configured ? propRisk.color : 'text-slate-400'}`}>
                  {propRisk.configured ? propRisk.status : 'Not set up'}
                </p>
                <p className="text-[10px] text-slate-500">
                  {propRisk.configured ? `Drawdown: ${propRisk.drawdown}% used` : 'No limits configured'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 1: Stat Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

          {/* Today's Bias */}
          <div className={`${CARD} p-3 sm:p-4`}>
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Today's Bias</span>
              {todaysBias?.selectionMethod === 'ai' && (
                <span className="text-[10px] font-bold text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                  <Bot size={9} />AI PICKED
                </span>
              )}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={openBiasHistory}
                  title="Bias history"
                  aria-label="Open bias history"
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                >
                  <History size={13} className="text-slate-400" />
                </button>
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
            </div>
            {strengthLoading ? (
              <div className="space-y-1.5">
                <SkeletonLine width="w-3/4" height="h-4" />
                <SkeletonLine width="w-1/2" height="h-3" />
              </div>
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
                {todaysBias.movePotential?.note ? (
                  <p className="text-[10px] text-amber-400/90 font-medium mb-0.5 line-clamp-1 flex items-center gap-1">
                    <Zap size={10} className="shrink-0" />{todaysBias.movePotential.note}
                  </p>
                ) : null}
                {todaysBias.entryQuality && todaysBias.entryQuality !== 'N/A' ? (
                  <span className={`inline-block text-[10px] font-bold mb-0.5 px-1.5 py-0.5 rounded border ${
                    todaysBias.entryQuality === 'FRESH' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : todaysBias.entryQuality === 'EXTENDED' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      : 'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>
                    {todaysBias.entryQuality === 'FRESH' ? 'FRESH entry' : todaysBias.entryQuality === 'EXTENDED' ? 'EXTENDED' : 'LATE — wait pullback'}
                  </span>
                ) : null}
                <p className="text-[10px] text-slate-500 line-clamp-1">{todaysBias.reason}</p>
                {todaysBias.selectionReasoning && (
                  <p className="text-[10px] text-cyan-400/70 line-clamp-2 mt-0.5 flex items-start gap-1">
                    <Target size={10} className="shrink-0 mt-0.5" />{todaysBias.selectionReasoning}
                  </p>
                )}
                {todaysBias.ai && biasGeneratedLabel ? (
                  biasIsStale ? (
                    <button
                      onClick={fetchTodayBias}
                      className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-400 hover:text-amber-300 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
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
          <div className={`${CARD} p-3 sm:p-4`}>
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Next Event</span>
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <AlertCircle size={13} className="text-amber-400" />
              </div>
            </div>
            {eventsLoading ? (
              <div className="space-y-1.5">
                <SkeletonLine width="w-full" height="h-4" />
                <SkeletonLine width="w-2/3" height="h-3" />
              </div>
            ) : topEvent ? (
              <>
                <p className="text-xs sm:text-sm font-bold text-amber-400 leading-none mb-1 truncate">{topEvent.title}</p>
                <p className="text-[10px] text-slate-500 truncate">{topEvent.country} · {topEvent.impact} Impact</p>
              </>
            ) : (
              <p className="text-xs sm:text-sm font-bold text-amber-400">{strength?.marketClosed ? 'Opens Monday' : 'No events today'}</p>
            )}
          </div>

          {/* Top News */}
          <div className={`${CARD} p-3 sm:p-4`}>
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Top News</span>
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <ArrowUpRight size={13} className="text-cyan-400" />
              </div>
            </div>
            {newsLoading ? (
              <div className="space-y-1.5">
                <SkeletonLine width="w-full" height="h-4" />
                <SkeletonLine width="w-1/2" height="h-3" />
              </div>
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
          <div className={`${CARD} p-3 sm:p-4`}>
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Prop Risk</span>
              <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg ${propRisk.bg} flex items-center justify-center`}>
                <ShieldCheck size={13} className={propRisk.color} />
              </div>
            </div>
            {propRisk.configured ? (
              <ArcGauge
                value={propRisk.pct}
                label={propRisk.status}
                sub={`${propRisk.drawdown}% drawdown used`}
                stroke={propRisk.hex}
              />
            ) : (
              <div className="flex flex-col items-center py-2">
                <p className="text-sm font-bold text-slate-400 leading-none">Not set up</p>
                <button
                  onClick={() => navigate('/prop-firm')}
                  className="mt-2 text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                >
                  Set your limits →
                </button>
              </div>
            )}
          </div>
        </div>

        <MacroCompass />

        {/* ── Row 2: Live News + Upcoming Events ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Live News */}
          <div className={`${PANEL} p-4 sm:p-5`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Newspaper size={15} className="text-cyan-400" />
                <h2 className="text-sm font-bold text-white">Live News</h2>
              </div>
              <button onClick={() => navigate('/news')} className="text-xs text-slate-500 hover:text-cyan-400 cursor-pointer transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70">
                View all →
              </button>
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
                      role="button" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/news') } }}
                      className={`flex items-start gap-3 p-3 ${ROW} hover:border-white/15 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70`}>
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
          <div className={`${PANEL} p-4 sm:p-5`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar size={15} className="text-cyan-400" />
                <h2 className="text-sm font-bold text-white">Upcoming Events</h2>
              </div>
              <button onClick={() => navigate('/calendar')} className="text-xs text-slate-500 hover:text-cyan-400 cursor-pointer transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70">
                View all →
              </button>
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
                      role="button" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/calendar') } }}
                      className={`flex items-center gap-3 p-3 ${ROW} hover:border-white/15 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70`}>
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
              strength?.marketClosed ? (
                <div className="text-center py-6">
                  <Calendar size={22} className="mx-auto text-slate-600 mb-2" />
                  <p className="text-xs text-slate-400 font-medium">Markets closed for the weekend</p>
                  <p className="text-[10px] text-slate-500 mt-1">Fresh events load when markets reopen Monday</p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 text-center py-4">No upcoming events right now</p>
              )
            )}
          </div>
        </div>

        {/* ── Row 3: Currency Strength ── */}
        <div className={`${PANEL} p-4 sm:p-5`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 size={15} className="text-cyan-400" />
              <h2 className="text-sm font-bold text-white">Currency Strength</h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchStrength}
                aria-label="Refresh currency strength"
                className="text-slate-500 hover:text-white transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
              >
                <RefreshCw size={13} className={strengthLoading ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => navigate('/strength')} className="text-xs text-slate-500 hover:text-cyan-400 cursor-pointer transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70">
                View all →
              </button>
            </div>
          </div>

          {strengthLoading && (
            <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {!strengthLoading && strength && !isPro && (
            <div className="relative">
              <div className="absolute inset-0 z-10 bg-[#030712]/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-2">
                <Lock size={20} className="text-cyan-400" />
                <p className="text-sm font-bold text-white">Pro Feature</p>
                <p className="text-xs text-slate-400">Currency strength analysis</p>
                <button onClick={() => navigate('/pricing')} className="mt-1 px-4 py-2 bg-cyan-500 text-black text-xs font-bold rounded-lg hover:bg-cyan-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030712]">
                  Upgrade to Pro
                </button>
              </div>
              <div className="filter blur-sm pointer-events-none">
              {/* Blurred preview for free users */}
              <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {strength.currencies.map(c => (
                  <div key={c.currency} className="rounded-lg p-2 sm:p-3 border bg-white/5 border-white/10 text-center">
                    <div className="text-xs sm:text-sm font-black text-white tracking-wide">{c.currency}</div>
                    <div className="text-[10px] sm:text-xs font-bold mt-1 text-slate-400">--</div>
                  </div>
                ))}
              </div>
              </div>
            </div>
          )}

          {!strengthLoading && strength && isPro && strengthOffline && (
            <div className="py-8 text-center">
              <BarChart2 size={22} className="mx-auto text-slate-600 mb-2" />
              <p className="text-xs text-slate-400 font-medium">Markets closed — no strength to read</p>
              <p className="text-[11px] text-slate-500 mt-1">Live currency strength resumes when forex reopens Monday</p>
            </div>
          )}

          {!strengthLoading && strength && isPro && !strengthOffline && (
            <>
              {/* 4 cols mobile → 8 cols desktop, smaller padding on mobile */}
              <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-8 gap-2">
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
                      <div className="text-xs sm:text-sm font-black text-white tracking-wide">{c.currency}</div>
                      <div className={`text-[10px] sm:text-xs font-bold mt-0.5 sm:mt-1 ${
                        isStrong ? 'text-emerald-400' :
                        isWeak ? 'text-red-400' : 'text-amber-400'
                      }`}>{c.strength}</div>
                      <div className="w-full bg-white/10 rounded-full h-1 mt-1">
                        {/* minWidth keeps a small non-zero reading visible; a true 0 stays empty
                            so "no data" and "very weak" don't render identically. */}
                        <div className={`h-1 rounded-full transition-[width] duration-300 ${
                          isStrong ? 'bg-emerald-500' :
                          isWeak ? 'bg-red-500' : 'bg-amber-500'
                        }`} style={{ width: `${c.strength}%`, minWidth: Number(c.strength) > 0 ? '3px' : '0px' }} />
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
                  <p className="text-xs text-slate-500 text-center flex items-center justify-center gap-1.5">
                    <Circle size={9} className="fill-red-400 text-red-400 shrink-0" />
                    Forex market closed (Weekend) — Data will update Monday
                  </p>
                </div>
              )}
            </>
          )}
        </div>

      </div>

      {/* ── Bias History Modal ── */}
      {showBiasHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowBiasHistory(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bias-history-title"
            className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-[#030712] border border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <History size={16} className="text-cyan-400" />
                <h3 id="bias-history-title" className="text-sm font-bold text-white">Bias History</h3>
                <span className="text-[10px] text-slate-500">Last 14 days</span>
              </div>
              <button onClick={() => setShowBiasHistory(false)} aria-label="Close bias history" className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70">
                <X size={14} className="text-slate-400" />
              </button>
            </div>
            {/* ── Accuracy Summary Banner ── */}
            {biasSummary && (biasSummary.scored > 0 || biasSummary.live > 0) && (
              <div className="border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-stretch divide-x divide-white/5">
                  <div className="flex-1 px-3 py-2.5 text-center">
                    <div className={`text-base font-bold ${biasSummary.winRate == null ? 'text-slate-500' : biasSummary.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {biasSummary.winRate != null ? `${biasSummary.winRate}%` : '—'}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Win Rate</div>
                  </div>
                  <div className="flex-1 px-3 py-2.5 text-center">
                    <div className={`text-base font-bold ${biasSummary.avgPips == null ? 'text-slate-500' : biasSummary.avgPips >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {biasSummary.avgPips != null ? `${biasSummary.avgPips > 0 ? '+' : ''}${biasSummary.avgPips}` : '—'}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg Pips</div>
                  </div>
                  <div className="flex-1 px-3 py-2.5 text-center">
                    <div className="text-base font-bold text-cyan-400">{biasSummary.wins}/{biasSummary.scored}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Correct</div>
                  </div>
                </div>
                {biasSummary.live > 0 ? (
                  <p className="text-[10px] text-amber-400/70 text-center pb-2 -mt-1">
                    {biasSummary.live} bias{biasSummary.live > 1 ? 'es' : ''} still inside 24h window — not yet counted
                  </p>
                ) : null}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="text-cyan-400 animate-spin" />
                </div>
              ) : biasHistory.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">No bias history yet — entries appear as the bias updates.</p>
              ) : (
                biasHistory.map((h) => {
                  const isSell = /bear/i.test(h.direction || '')
                  return (
                    <div key={h.id} className={`p-3 ${CARD}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            isSell ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                          }`}>
                            {isSell ? 'SELL' : 'BUY'} {h.pair}
                          </span>
                          {h.confidence ? (
                            <span className="text-[10px] text-cyan-400 font-semibold">
                              {h.confidence}%{h.trade_grade && h.trade_grade !== '-' ? ` · ${h.trade_grade}` : ''}
                            </span>
                          ) : null}
                        </div>
                        <span className="text-[10px] text-slate-500 shrink-0">
                          {h.generated_at ? new Date(h.generated_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      {h.previous_bias ? (
                        <p className="text-[10px] text-amber-400/80 mb-0.5">Changed from: {h.previous_bias}</p>
                      ) : (
                        <p className="text-[10px] text-slate-500 mb-0.5">First bias of the day</p>
                      )}
                      {h.reasoning ? <p className="text-[10px] text-slate-500 line-clamp-2">{h.reasoning}</p> : null}
                      {/* ── Performance vs real market ── */}
                      {h.performance && (h.performance.status === 'final' || h.performance.status === 'live') && typeof h.performance.pips === 'number' ? (
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 pt-2 border-t border-white/5">
                          {h.performance.status === 'final' ? (
                            <span className={`text-[10px] font-bold flex items-center gap-1 ${h.performance.correct ? 'text-emerald-400' : 'text-red-400'}`}>
                              {h.performance.correct ? <Check size={11} /> : <X size={11} />}
                              {h.performance.correct ? 'Correct' : 'Wrong'}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                              <Clock size={10} />Running
                            </span>
                          )}
                          <span className={`text-[10px] font-semibold ${h.performance.pips >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {h.performance.pips > 0 ? '+' : ''}{h.performance.pips} pips
                          </span>
                          <span className="text-[10px] text-slate-500">MFE +{h.performance.mfePips}</span>
                          <span className="text-[10px] text-slate-500">MAE -{h.performance.maePips}</span>
                          {h.performance.status === 'live' ? <span className="text-[10px] text-amber-400/70">24h window open</span> : null}
                        </div>
                      ) : h.performance && h.performance.status === 'live' ? (
                        <p className="text-[10px] text-amber-400/70 mt-2 pt-2 border-t border-white/5 flex items-center gap-1">
                          <Clock size={9} className="shrink-0" />Awaiting candles — scores once 24h window closes
                        </p>
                      ) : h.performance && h.performance.status === 'pending' ? (
                        <p className="text-[10px] text-slate-600 mt-2 pt-2 border-t border-white/5">Score pending — refresh shortly</p>
                      ) : h.performance && h.performance.status === 'error' ? (
                        <p className="text-[10px] text-slate-600 mt-2 pt-2 border-t border-white/5">Score unavailable (market closed / no data)</p>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}