import { useEffect, useState, useMemo } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'
import {
  RefreshCw, Search, Calendar, TrendingUp, TrendingDown,
  Minus, Loader2, AlertTriangle, Sun, Moon, Filter,
  GraduationCap, ChevronDown, ChevronUp, Lightbulb,
  AlertCircle, Zap, Crown, Target
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

/* ───────── Mega Cap / Market Movers List ───────── */
const MEGA_CAPS = {
  // Magnificent 7 (NAS100 heavyweights)
  AAPL:  { name: 'Apple',         weight: 'NAS100 ~11%', tier: 'mag7' },
  MSFT:  { name: 'Microsoft',     weight: 'NAS100 ~10%', tier: 'mag7' },
  NVDA:  { name: 'NVIDIA',        weight: 'NAS100 ~8%',  tier: 'mag7' },
  AMZN:  { name: 'Amazon',        weight: 'NAS100 ~6%',  tier: 'mag7' },
  GOOG:  { name: 'Alphabet',      weight: 'NAS100 ~4%',  tier: 'mag7' },
  GOOGL: { name: 'Alphabet',      weight: 'NAS100 ~4%',  tier: 'mag7' },
  META:  { name: 'Meta',          weight: 'NAS100 ~5%',  tier: 'mag7' },
  TSLA:  { name: 'Tesla',         weight: 'NAS100 ~4%',  tier: 'mag7' },

  // Major Index Movers
  JPM:   { name: 'JPMorgan',      weight: 'DJIA + S&P500', tier: 'major' },
  V:     { name: 'Visa',          weight: 'DJIA + S&P500', tier: 'major' },
  JNJ:   { name: 'Johnson & Johnson', weight: 'DJIA', tier: 'major' },
  WMT:   { name: 'Walmart',       weight: 'DJIA + S&P500', tier: 'major' },
  UNH:   { name: 'UnitedHealth',  weight: 'DJIA ~10%',  tier: 'major' },
  GS:    { name: 'Goldman Sachs', weight: 'DJIA',        tier: 'major' },
  HD:    { name: 'Home Depot',    weight: 'DJIA',        tier: 'major' },
  CAT:   { name: 'Caterpillar',   weight: 'DJIA',        tier: 'major' },
  BA:    { name: 'Boeing',        weight: 'DJIA',        tier: 'major' },
  DIS:   { name: 'Disney',        weight: 'DJIA',        tier: 'major' },
  NFLX:  { name: 'Netflix',       weight: 'NAS100 ~3%',  tier: 'major' },
  AMD:   { name: 'AMD',           weight: 'NAS100 ~2%',  tier: 'major' },
  AVGO:  { name: 'Broadcom',      weight: 'NAS100 ~4%',  tier: 'major' },
  CRM:   { name: 'Salesforce',    weight: 'DJIA + NAS100', tier: 'major' },
  COST:  { name: 'Costco',        weight: 'NAS100 ~3%',  tier: 'major' },
  ADBE:  { name: 'Adobe',         weight: 'NAS100 ~2%',  tier: 'major' },
  INTC:  { name: 'Intel',         weight: 'NAS100',      tier: 'major' },
  PYPL:  { name: 'PayPal',        weight: 'NAS100',      tier: 'major' },
  QCOM:  { name: 'Qualcomm',      weight: 'NAS100',      tier: 'major' },
  IBM:   { name: 'IBM',           weight: 'DJIA',        tier: 'major' },
  MCD:   { name: "McDonald's",    weight: 'DJIA',        tier: 'major' },
  NKE:   { name: 'Nike',          weight: 'DJIA',        tier: 'major' },
  KO:    { name: 'Coca-Cola',     weight: 'DJIA',        tier: 'major' },
  PEP:   { name: 'PepsiCo',       weight: 'NAS100',      tier: 'major' },

  // Forex / Macro Impact
  XOM:   { name: 'ExxonMobil',    weight: 'Oil → CAD/USD', tier: 'macro' },
  CVX:   { name: 'Chevron',       weight: 'Oil → CAD/USD', tier: 'macro' },
  GLD:   { name: 'Gold ETF',      weight: 'Gold → XAU/USD', tier: 'macro' },
  FDX:   { name: 'FedEx',         weight: 'Economic bellwether', tier: 'macro' },
  UPS:   { name: 'UPS',           weight: 'Economic bellwether', tier: 'macro' },
  BHP:   { name: 'BHP Group',     weight: 'Commodities → AUD', tier: 'macro' },
  RIO:   { name: 'Rio Tinto',     weight: 'Commodities → AUD', tier: 'macro' },
}

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

/* ═══════════════════════════════════════════ */
export default function EarningsCalendar() {
  const [earnings, setEarnings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTime, setFilterTime] = useState('All')
  const [filterTier, setFilterTier] = useState('All') // All, Market Movers
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
  const [guideOpen, setGuideOpen] = useState(false)

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
      const matchTier = filterTier === 'All' || MEGA_CAPS[e.symbol.toUpperCase()]
      return matchSearch && matchTime && matchTier
    })
  }, [earnings, searchQuery, filterTime, filterTier])

  // Group by date
  const grouped = useMemo(() => {
    const map = {}
    filtered.forEach(e => {
      if (!map[e.date]) map[e.date] = []
      map[e.date].push(e)
    })
    // Sort by date, put mega caps first within each date
    return Object.entries(map).sort((a, b) => new Date(a[0]) - new Date(b[0])).map(([date, items]) => {
      items.sort((a, b) => {
        const aM = MEGA_CAPS[a.symbol.toUpperCase()]
        const bM = MEGA_CAPS[b.symbol.toUpperCase()]
        if (aM && !bM) return -1
        if (!aM && bM) return 1
        if (aM && bM) {
          const tierOrder = { mag7: 0, major: 1, macro: 2 }
          return (tierOrder[aM.tier] || 3) - (tierOrder[bM.tier] || 3)
        }
        return a.symbol.localeCompare(b.symbol)
      })
      return [date, items]
    })
  }, [filtered])

  // Stats
  const totalEarnings = earnings.length
  const todayCount = earnings.filter(e => isToday(e.date)).length
  const reported = earnings.filter(e => e.epsActual != null).length
  const beats = earnings.filter(e => e.epsActual != null && e.epsEstimate != null && e.epsActual > e.epsEstimate).length
  const megaCapCount = earnings.filter(e => MEGA_CAPS[e.symbol.toUpperCase()]).length
  const megaCapThisWeek = filtered.filter(e => MEGA_CAPS[e.symbol.toUpperCase()]).length

  return (
    <DashboardLayout title="Earnings Calendar" subtitle="Upcoming earnings releases & results">
      <div className="space-y-5">

        {/* ── Mega Cap Alert (if any big names reporting soon) ── */}
        {!loading && megaCapCount > 0 && filterTier === 'All' && (
          <div className="bg-gradient-to-r from-amber-500/10 to-red-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
              <Crown size={16} className="text-amber-400" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Market Movers Detected</div>
              <div className="text-sm font-bold text-white">
                {megaCapCount} major stocks reporting
                <span className="text-slate-500 font-normal"> — these can move indices & forex</span>
              </div>
            </div>
            <button
              onClick={() => setFilterTier('Movers')}
              className="text-xs font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1.5 rounded-lg hover:bg-amber-400/20 transition-all"
            >
              Show Only Movers →
            </button>
          </div>
        )}

        {/* ── Trading Guide (Collapsible) ── */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
          <button
            onClick={() => setGuideOpen(!guideOpen)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <GraduationCap size={16} className="text-cyan-400" />
              </div>
              <div className="text-left">
                <div className="text-sm font-bold text-white">How to Trade Earnings</div>
                <div className="text-[10px] text-slate-500">4 strategies for index & forex traders · Click to {guideOpen ? 'collapse' : 'expand'}</div>
              </div>
            </div>
            {guideOpen ? <ChevronUp size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-500" />}
          </button>

          {guideOpen && (
            <div className="px-4 pb-4 border-t border-white/5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">

                {/* Strategy 1 */}
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded">STRATEGY 1</span>
                    <h4 className="text-sm font-bold text-white">Index Volatility Play</h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-2">
                    When Magnificent 7 stocks report (AAPL, NVDA, MSFT, AMZN, GOOG, META, TSLA), NAS100 can gap 1-3%. Widen your stop loss or avoid index trades that day.
                  </p>
                  <div className="bg-black/30 border border-white/5 rounded p-2.5 text-[11px] text-slate-300 font-mono">
                    NVDA reports AMC → <span className="text-amber-400">Next day NAS100 gap ±2%</span> → Widen SL or sit out
                  </div>
                </div>

                {/* Strategy 2 */}
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded">STRATEGY 2</span>
                    <h4 className="text-sm font-bold text-white">BMO vs AMC Timing</h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-2">
                    BMO (Before Market Open) → gap at open, trade the reaction after 15min. AMC (After Market Close) → affects next day's open, risky to hold overnight.
                  </p>
                  <div className="bg-black/30 border border-white/5 rounded p-2.5 text-[11px] text-slate-300 font-mono">
                    AAPL reports BMO → <span className="text-emerald-400">Wait 15min after open</span> → Trade the direction
                  </div>
                </div>

                {/* Strategy 3 */}
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">STRATEGY 3</span>
                    <h4 className="text-sm font-bold text-white">Beat Rate = Sentiment</h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-2">
                    If overall beat rate is 70%+ → bullish sentiment, buy index dips. Below 50% → risk-off mood, favor safe havens (JPY, CHF, Gold).
                  </p>
                  <div className="bg-black/30 border border-white/5 rounded p-2.5 text-[11px] text-slate-300 font-mono">
                    Beat rate 75% → <span className="text-emerald-400">BUY NAS100 dips</span> · Beat rate 40% → <span className="text-red-400">BUY JPY/Gold</span>
                  </div>
                </div>

                {/* Strategy 4 */}
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded">STRATEGY 4</span>
                    <h4 className="text-sm font-bold text-white">Forex ↔ Earnings Link</h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-2">
                    Strong US earnings → USD strength (capital inflow). Oil companies (XOM, CVX) → CAD impact. Mining companies (BHP, RIO) → AUD impact.
                  </p>
                  <div className="bg-black/30 border border-white/5 rounded p-2.5 text-[11px] text-slate-300 font-mono">
                    XOM beats big → <span className="text-emerald-400">Oil UP → USD/CAD DOWN</span> (CAD strengthens)
                  </div>
                </div>

              </div>

              {/* Pro Tips */}
              <div className="mt-4 bg-cyan-500/[0.04] border border-cyan-500/15 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb size={14} className="text-cyan-400" />
                  <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Pro Tips — Market Impact Tiers</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="font-semibold text-white">Magnificent 7</span>
                    </div>
                    <p className="text-slate-500 text-[11px] leading-relaxed">AAPL, MSFT, NVDA, AMZN, GOOG, META, TSLA — these 7 stocks are ~50% of NAS100. One bad report can crash the index.</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      <span className="font-semibold text-white">Index Movers</span>
                    </div>
                    <p className="text-slate-500 text-[11px] leading-relaxed">JPM, UNH, GS, HD, NFLX, AMD — heavy DJIA/S&P500 weights. Banks reporting = financial sector sentiment.</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="font-semibold text-white">Macro / Forex Impact</span>
                    </div>
                    <p className="text-slate-500 text-[11px] leading-relaxed">XOM/CVX → Oil/CAD. BHP/RIO → Commodities/AUD. FedEx/UPS → economic health bellwethers.</p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-cyan-500/10 flex items-start gap-2">
                  <AlertCircle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    <span className="text-amber-400 font-semibold">Prop Firm Rule:</span> If your drawdown is above 60% and a Magnificent 7 stock is reporting today, consider sitting out. One volatility spike can blow your account.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Stats Row ── */}
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

        {/* ── Filter Bar ── */}
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

          <div className="flex items-center gap-2 flex-wrap">
            {/* Time filters */}
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

            {/* Tier separator */}
            <div className="w-px h-5 bg-white/10 hidden sm:block" />

            {/* Market Movers filter */}
            <button
              onClick={() => setFilterTier(filterTier === 'Movers' ? 'All' : 'Movers')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                filterTier === 'Movers'
                  ? 'bg-amber-400/10 text-amber-400 border-amber-400/20'
                  : 'bg-white/5 text-slate-500 border-white/10 hover:border-white/20'
              }`}
            >
              <Crown size={12} />
              Market Movers
              {megaCapCount > 0 && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  filterTier === 'Movers' ? 'bg-amber-400/20 text-amber-400' : 'bg-white/10 text-slate-500'
                }`}>{megaCapCount}</span>
              )}
            </button>
          </div>

          <button
            onClick={fetchEarnings}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors ml-auto"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-12 text-center">
            <Loader2 size={24} className="text-cyan-400 animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-400">Fetching earnings calendar...</p>
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
            <AlertTriangle size={20} className="text-red-400 mx-auto mb-2" />
            <p className="text-xs text-red-400">{error}</p>
            <button onClick={fetchEarnings} className="mt-3 text-xs text-slate-400 hover:text-white transition-colors">
              Try again
            </button>
          </div>
        )}

        {/* ── No Results ── */}
        {!loading && !error && filtered.length === 0 && (
          <div className="bg-white/[0.03] border border-dashed border-white/10 rounded-xl p-10 text-center">
            <Calendar size={24} className="text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400 font-medium">No earnings found</p>
            <p className="text-xs text-slate-600 mt-1">
              {filterTier === 'Movers'
                ? 'No major market movers reporting in this period'
                : searchQuery ? `No results for "${searchQuery}"` : 'No upcoming earnings in this period'}
            </p>
            {filterTier === 'Movers' && (
              <button
                onClick={() => setFilterTier('All')}
                className="mt-3 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                Show all earnings →
              </button>
            )}
          </div>
        )}

        {/* ── Earnings grouped by date ── */}
        {!loading && !error && grouped.length > 0 && (
          <div className="space-y-4">
            {grouped.map(([date, items]) => {
              const today = isToday(date)
              const past = isPast(date)
              const megaCapsToday = items.filter(e => MEGA_CAPS[e.symbol.toUpperCase()]?.tier === 'mag7')

              return (
                <div key={date}>
                  {/* Date Header */}
                  <div className={`flex items-center gap-2 mb-2 px-1 flex-wrap ${past ? 'opacity-60' : ''}`}>
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
                    {megaCapsToday.length > 0 && (
                      <span className="text-[9px] font-bold bg-amber-400/10 text-amber-400 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        <Crown size={9} /> {megaCapsToday.map(e => e.symbol).join(', ')} reporting
                      </span>
                    )}
                  </div>

                  {/* Earnings Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {items.map((item, i) => {
                      const hasActual = item.epsActual != null
                      const beat = hasActual && item.epsEstimate != null && item.epsActual > item.epsEstimate
                      const miss = hasActual && item.epsEstimate != null && item.epsActual < item.epsEstimate
                      const met = hasActual && item.epsEstimate != null && item.epsActual === item.epsEstimate
                      const mega = MEGA_CAPS[item.symbol.toUpperCase()]

                      const cardBorder = beat
                        ? 'border-l-emerald-400'
                        : miss
                        ? 'border-l-red-400'
                        : hasActual
                        ? 'border-l-slate-400'
                        : mega?.tier === 'mag7'
                        ? 'border-l-amber-400'
                        : mega
                        ? 'border-l-cyan-400'
                        : 'border-l-transparent'

                      return (
                        <div
                          key={`${item.symbol}-${i}`}
                          className={`bg-white/[0.03] border border-white/10 border-l-2 ${cardBorder} rounded-xl p-3 hover:border-white/15 transition-all ${past && !hasActual ? 'opacity-50' : ''} ${mega ? 'ring-1 ring-white/5' : ''}`}
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

                          {/* Mega Cap Badge */}
                          {mega && (
                            <div className={`mb-2 flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md ${
                              mega.tier === 'mag7'
                                ? 'bg-amber-400/10 text-amber-400 border border-amber-400/15'
                                : mega.tier === 'macro'
                                ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/15'
                                : 'bg-cyan-400/10 text-cyan-400 border border-cyan-400/15'
                            }`}>
                              {mega.tier === 'mag7' && <Crown size={10} />}
                              {mega.tier === 'major' && <Target size={10} />}
                              {mega.tier === 'macro' && <Zap size={10} />}
                              <span className="font-semibold">{mega.name}</span>
                              <span className="text-slate-500">·</span>
                              <span className="text-slate-400">{mega.weight}</span>
                            </div>
                          )}

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