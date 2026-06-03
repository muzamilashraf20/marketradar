import { useEffect, useState } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'
import {
  RefreshCw, ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  Minus, Info, Loader2, AlertTriangle, BarChart3, BookOpen,
  Target, Zap, AlertCircle, Lightbulb, GraduationCap
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

/* ───────── MiniBar ───────── */
function MiniBar({ longPct, shortPct }) {
  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[10px] text-emerald-400 font-mono w-8 text-right">{longPct}%</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden flex">
        <div className="h-full bg-emerald-400 rounded-l-full" style={{ width: `${longPct}%` }} />
        <div className="h-full bg-red-400 rounded-r-full" style={{ width: `${shortPct}%` }} />
      </div>
      <span className="text-[10px] text-red-400 font-mono w-8">{shortPct}%</span>
    </div>
  )
}

/* ───────── Generate trade insight per currency ───────── */
function getTradeInsight(item, allData) {
  const { currency, bias, netPosition } = item

  if (bias === 'Neutral') {
    return {
      headline: 'No clear bias',
      detail: `Institutional positioning is balanced. Wait for stronger signal before taking ${currency}-based trades.`,
      color: 'text-slate-400',
    }
  }

  // Find strongest opposite bias for pair suggestion
  const opposite = bias === 'Bullish'
    ? allData.filter(d => d.bias === 'Bearish').sort((a, b) => a.netPosition - b.netPosition)[0]
    : allData.filter(d => d.bias === 'Bullish').sort((a, b) => b.netPosition - a.netPosition)[0]

  if (bias === 'Bullish' && opposite) {
    return {
      headline: `Favor ${currency} longs`,
      detail: `Smart money is net long ${currency} (+${netPosition.toLocaleString()} contracts). Best pair: BUY ${currency}/${opposite.currency} — strongest bull vs strongest bear setup.`,
      color: 'text-emerald-400',
    }
  }

  if (bias === 'Bearish' && opposite) {
    return {
      headline: `Favor ${currency} shorts`,
      detail: `Smart money is net short ${currency} (${netPosition.toLocaleString()} contracts). Best pair: SELL ${currency}/${opposite.currency} — strongest bear vs strongest bull setup.`,
      color: 'text-red-400',
    }
  }

  return {
    headline: bias === 'Bullish' ? 'Bullish bias' : 'Bearish bias',
    detail: `${bias === 'Bullish' ? 'Long' : 'Short'} ${currency} aligns with institutional positioning.`,
    color: bias === 'Bullish' ? 'text-emerald-400' : 'text-red-400',
  }
}

/* ═══════════════════════════════════════════ */
export default function COTReport() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reportDate, setReportDate] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    fetchCOT()
  }, [])

  const fetchCOT = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await fetch(`${API_BASE}/api/cot`)
      const json = await res.json()
      if (json.success) {
        setData(json.data || [])
        setReportDate(json.reportDate || '')
      } else {
        setError(json.error || 'Failed to fetch COT data')
      }
    } catch (e) {
      console.error('COT fetch error:', e)
      setError('Failed to connect to COT API')
    } finally {
      setLoading(false)
    }
  }

  const bullish = data.filter(d => d.bias === 'Bullish').length
  const bearish = data.filter(d => d.bias === 'Bearish').length
  const neutral = data.filter(d => d.bias === 'Neutral').length

  /* ── Best trade setup (strongest bull vs strongest bear) ── */
  const strongestBull = data.filter(d => d.bias === 'Bullish').sort((a, b) => b.netPosition - a.netPosition)[0]
  const strongestBear = data.filter(d => d.bias === 'Bearish').sort((a, b) => a.netPosition - b.netPosition)[0]
  const bestSetup = strongestBull && strongestBear
    ? `BUY ${strongestBull.currency}/${strongestBear.currency}`
    : null

  return (
    <DashboardLayout title="COT Report" subtitle="CFTC Commitment of Traders — Institutional positioning">
      <div className="space-y-5">

        {/* ── Info Banner ── */}
        <div className="bg-blue-500/[0.06] border border-blue-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
          <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-400">
            COT data is released every <span className="text-blue-400 font-semibold">Friday at 3:30 PM EST</span> by the CFTC, reflecting positions from the previous Tuesday. This shows how <span className="text-white font-medium">Asset Managers</span> and <span className="text-white font-medium">Leveraged Funds</span> (smart money) are positioned.
          </p>
        </div>

        {/* ── Best Trade Setup (Auto-suggested) ── */}
        {!loading && bestSetup && (
          <div className="bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 border border-cyan-500/20 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center shrink-0">
              <Target size={16} className="text-cyan-400" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Strongest Setup This Week</div>
              <div className="text-sm font-bold text-white">
                {bestSetup} <span className="text-slate-500 font-normal">— {strongestBull.currency} strongest bull vs {strongestBear.currency} strongest bear</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <span className="text-emerald-400 font-mono">+{strongestBull.netPosition.toLocaleString()}</span>
              <span>vs</span>
              <span className="text-red-400 font-mono">{strongestBear.netPosition.toLocaleString()}</span>
            </div>
          </div>
        )}
{/* ── Net Positioning Chart ── */}
        {!loading && data.length > 0 && (
          <div className="bg-[#020617] border border-white/10 rounded-2xl p-6">
            <h2 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
              <BarChart3 size={18} className="text-cyan-400" />
              Net Positioning Overview
            </h2>
            <div className="space-y-3">
              {[...data].sort((a, b) => b.netPosition - a.netPosition).map(item => {
                const maxAbs = Math.max(...data.map(d => Math.abs(d.netPosition)), 1)
                const widthPct = Math.abs(item.netPosition) / maxAbs * 100
                const isLong = item.netPosition > 0
                return (
                  <div key={item.currency} className="flex items-center gap-3">
                    <span className="text-sm font-bold text-white w-10">{item.currency}</span>
                    <div className="flex-1 flex items-center">
                      {/* Negative bar (left) */}
                      <div className="w-1/2 flex justify-end">
                        {!isLong && (
                          <div className="h-6 bg-red-500/30 border border-red-500/40 rounded-l-lg flex items-center justify-end px-2 transition-all duration-700"
                            style={{ width: `${widthPct}%`, minWidth: '20px' }}>
                            <span className="text-[10px] font-bold text-red-400">{item.netPosition.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                      {/* Center line */}
                      <div className="w-px h-8 bg-white/20 shrink-0" />
                      {/* Positive bar (right) */}
                      <div className="w-1/2">
                        {isLong && (
                          <div className="h-6 bg-emerald-500/30 border border-emerald-500/40 rounded-r-lg flex items-center px-2 transition-all duration-700"
                            style={{ width: `${widthPct}%`, minWidth: '20px' }}>
                            <span className="text-[10px] font-bold text-emerald-400">+{item.netPosition.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                      item.bias === 'Bullish' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                      item.bias === 'Bearish' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                      'bg-slate-500/10 border-slate-500/30 text-slate-400'
                    }`}>{item.bias}</span>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5 text-[10px] text-slate-600">
              <span>← Short (bearish)</span>
              <span>0</span>
              <span>Long (bullish) →</span>
            </div>
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
                <div className="text-sm font-bold text-white">How to Trade COT Data</div>
                <div className="text-[10px] text-slate-500">4 strategies + pro tips · Click to {guideOpen ? 'collapse' : 'expand'}</div>
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
                    <h4 className="text-sm font-bold text-white">Trend Confirmation</h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-2">
                    Before entering a trade, check if COT aligns with your technical setup.
                  </p>
                  <div className="bg-black/30 border border-white/5 rounded p-2.5 text-[11px] text-slate-300 font-mono">
                    <span className="text-emerald-400">EUR/USD BUY</span> + EUR Bullish + USD Neutral = <span className="text-emerald-400">HIGH CONFIDENCE ✓</span>
                  </div>
                </div>

                {/* Strategy 2 */}
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded">STRATEGY 2</span>
                    <h4 className="text-sm font-bold text-white">Best Pair Combinations</h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-2">
                    Pair the strongest bullish currency with the strongest bearish currency for max momentum.
                  </p>
                  <div className="bg-black/30 border border-white/5 rounded p-2.5 text-[11px] text-slate-300 font-mono">
                    Strongest Bull ({strongestBull?.currency || 'EUR'}) <span className="text-slate-600">+</span> Strongest Bear ({strongestBear?.currency || 'JPY'}) = <span className="text-emerald-400">BUY {strongestBull?.currency || 'EUR'}/{strongestBear?.currency || 'JPY'}</span>
                  </div>
                </div>

                {/* Strategy 3 */}
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">STRATEGY 3</span>
                    <h4 className="text-sm font-bold text-white">Extreme = Reversal Warning</h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-2">
                    When positioning hits historical extremes, smart contrarians prepare for a reversal (short squeeze).
                  </p>
                  <div className="bg-black/30 border border-white/5 rounded p-2.5 text-[11px] text-slate-300 font-mono">
                    Extreme short JPY <span className="text-slate-600">→</span> Watch for sudden <span className="text-emerald-400">JPY rally</span> (squeeze)
                  </div>
                </div>

                {/* Strategy 4 */}
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded">STRATEGY 4</span>
                    <h4 className="text-sm font-bold text-white">Pre-Event Risk Check</h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-2">
                    Before NFP, FOMC, or CPI, check which currencies have extreme positioning — they're most vulnerable to news shocks.
                  </p>
                  <div className="bg-black/30 border border-white/5 rounded p-2.5 text-[11px] text-slate-300 font-mono">
                    NFP coming + Big EUR longs <span className="text-slate-600">→</span> <span className="text-amber-400">Reduce EUR exposure</span>
                  </div>
                </div>

              </div>

              {/* ── Pro Tips Box ── */}
              <div className="mt-4 bg-cyan-500/[0.04] border border-cyan-500/15 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb size={14} className="text-cyan-400" />
                  <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Pro Tips — Smart Money Breakdown</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span>🏦</span>
                      <span className="font-semibold text-white">Asset Managers</span>
                    </div>
                    <p className="text-slate-500 text-[11px] leading-relaxed">Long-term institutional capital (pension funds, mutual funds). Follow their bias for swing trades.</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span>💰</span>
                      <span className="font-semibold text-white">Leveraged Funds</span>
                    </div>
                    <p className="text-slate-500 text-[11px] leading-relaxed">Hedge funds & CTAs. Momentum-driven. When they pile in heavy, watch for trend continuation.</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span>🏛️</span>
                      <span className="font-semibold text-white">Dealers (Banks)</span>
                    </div>
                    <p className="text-slate-500 text-[11px] leading-relaxed">Often hedging, not directional. Usually opposite to smart money — don't follow blindly.</p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-cyan-500/10 flex items-start gap-2">
                  <AlertCircle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    <span className="text-amber-400 font-semibold">Remember:</span> COT is a lagging indicator (released Friday for Tuesday's data). Best for swing/position trading confirmation, not for day trading entries.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Stats Row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl p-4 border bg-white/[0.03] border-white/10 text-center">
            <div className="text-xl font-bold font-mono text-white">{data.length}</div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Contracts Tracked</div>
          </div>
          <div className="rounded-xl p-4 border bg-emerald-500/10 border-emerald-500/20 text-center">
            <div className="text-xl font-bold font-mono text-emerald-400">{bullish}</div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Net Bullish</div>
          </div>
          <div className="rounded-xl p-4 border bg-red-500/10 border-red-500/20 text-center">
            <div className="text-xl font-bold font-mono text-red-400">{bearish}</div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Net Bearish</div>
          </div>
          <div className="rounded-xl p-4 border bg-amber-500/10 border-amber-500/20 text-center">
            <div className="text-sm font-bold font-mono text-amber-400">{reportDate || '—'}</div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Report Date</div>
          </div>
        </div>

        {/* ── Refresh ── */}
        <div className="flex items-center justify-end">
          <button
            onClick={fetchCOT}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-12 text-center">
            <Loader2 size={24} className="text-cyan-400 animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-400">Fetching latest CFTC data...</p>
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
            <AlertTriangle size={20} className="text-red-400 mx-auto mb-2" />
            <p className="text-xs text-red-400 mb-1">{error}</p>
            <p className="text-[10px] text-slate-600 mb-3">CFTC server may be temporarily unavailable</p>
            <button onClick={fetchCOT} className="text-xs text-slate-400 hover:text-white transition-colors">
              Try again
            </button>
          </div>
        )}

        {/* ── No Data ── */}
        {!loading && !error && data.length === 0 && (
          <div className="bg-white/[0.03] border border-dashed border-white/10 rounded-xl p-10 text-center">
            <BarChart3 size={24} className="text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400 font-medium">No COT data available</p>
            <p className="text-xs text-slate-600 mt-1">Data is published weekly on Fridays</p>
          </div>
        )}

        {/* ── COT Cards ── */}
        {!loading && !error && data.length > 0 && (
          <div className="space-y-3">
            {data.map((item) => {
              const totalContracts = item.longContracts + item.shortContracts
              const longPct = totalContracts > 0 ? Math.round((item.longContracts / totalContracts) * 100) : 50
              const shortPct = 100 - longPct
              const isExpanded = expanded === item.currency

              const biasColor = item.bias === 'Bullish'
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : item.bias === 'Bearish'
                ? 'text-red-400 bg-red-500/10 border-red-500/20'
                : 'text-slate-400 bg-white/5 border-white/10'

              const netColor = item.netPosition > 0 ? 'text-emerald-400' : item.netPosition < 0 ? 'text-red-400' : 'text-slate-400'
              const BiasIcon = item.bias === 'Bullish' ? TrendingUp : item.bias === 'Bearish' ? TrendingDown : Minus

              const insight = getTradeInsight(item, data)

              return (
                <div
                  key={item.currency}
                  className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden hover:border-white/15 transition-all"
                >
                  {/* Main Row */}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : item.currency)}
                    className="w-full flex items-center gap-4 p-4 text-left"
                  >
                    {/* Currency */}
                    <div className="flex items-center gap-2.5 min-w-[70px]">
                      <span className="text-xl">{item.flag}</span>
                      <div>
                        <div className="text-sm font-bold font-mono text-white">{item.currency}</div>
                        <div className="text-[10px] text-slate-600">Futures</div>
                      </div>
                    </div>

                    {/* Long/Short Bar */}
                    <div className="flex-1 hidden sm:block">
                      <MiniBar longPct={longPct} shortPct={shortPct} />
                    </div>

                    {/* Net Position */}
                    <div className="text-center min-w-[90px]">
                      <div className="text-[10px] text-slate-600 mb-0.5">NET</div>
                      <div className={`text-sm font-bold font-mono ${netColor}`}>
                        {item.netPosition > 0 ? '+' : ''}{item.netPosition.toLocaleString()}
                      </div>
                    </div>

                    {/* Bias Badge */}
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold min-w-[90px] justify-center ${biasColor}`}>
                      <BiasIcon size={12} />
                      {item.bias}
                    </div>

                    {/* Expand Arrow */}
                    <div className="text-slate-600 shrink-0">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </button>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-white/5">
                      {/* Long/Short Bar on mobile */}
                      <div className="sm:hidden mb-4 mt-3">
                        <MiniBar longPct={longPct} shortPct={shortPct} />
                      </div>

                      {/* ── Trade Insight (NEW) ── */}
                      <div className="mt-4 bg-gradient-to-r from-cyan-500/[0.05] to-transparent border border-cyan-500/15 rounded-lg p-3 flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
                          <Zap size={13} className="text-cyan-400" />
                        </div>
                        <div className="flex-1">
                          <div className={`text-xs font-bold ${insight.color} mb-1`}>{insight.headline}</div>
                          <p className="text-[11px] text-slate-400 leading-relaxed">{insight.detail}</p>
                        </div>
                      </div>

                      {/* Contract totals */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 mt-3">
                        <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 text-center">
                          <div className="text-[10px] text-slate-600 mb-1 uppercase tracking-wider">Total Long</div>
                          <div className="text-base font-bold font-mono text-emerald-400">
                            {item.longContracts.toLocaleString()}
                          </div>
                        </div>
                        <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3 text-center">
                          <div className="text-[10px] text-slate-600 mb-1 uppercase tracking-wider">Total Short</div>
                          <div className="text-base font-bold font-mono text-red-400">
                            {item.shortContracts.toLocaleString()}
                          </div>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-center col-span-2 sm:col-span-1">
                          <div className="text-[10px] text-slate-600 mb-1 uppercase tracking-wider">Net Position</div>
                          <div className={`text-base font-bold font-mono ${netColor}`}>
                            {item.netPosition > 0 ? '+' : ''}{item.netPosition.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {/* Institutional Breakdown */}
                      {item.breakdown && (
                        <div>
                          <h4 className="text-[10px] text-slate-600 uppercase tracking-wider mb-2 font-semibold">Institutional Breakdown</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {[
                              { label: 'Asset Managers', data: item.breakdown.assetManagers, emoji: '🏦', desc: 'Long-term institutional' },
                              { label: 'Leveraged Funds', data: item.breakdown.leveragedFunds, emoji: '💰', desc: 'Hedge funds, CTAs' },
                              { label: 'Dealers', data: item.breakdown.dealers, emoji: '🏛️', desc: 'Banks, hedging' },
                            ].map(({ label, data: bd, emoji, desc }) => {
                              const bdNetColor = bd.net > 0 ? 'text-emerald-400' : bd.net < 0 ? 'text-red-400' : 'text-slate-400'
                              return (
                                <div key={label} className="bg-white/[0.02] border border-white/5 rounded-lg p-3" title={desc}>
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <span className="text-xs">{emoji}</span>
                                    <span className="text-[10px] text-slate-500 font-medium">{label}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-[10px] font-mono">
                                    <span className="text-emerald-400">L: {bd.long.toLocaleString()}</span>
                                    <span className="text-red-400">S: {bd.short.toLocaleString()}</span>
                                  </div>
                                  <div className={`text-xs font-bold font-mono mt-1 ${bdNetColor}`}>
                                    Net: {bd.net > 0 ? '+' : ''}{bd.net.toLocaleString()}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}