import { useEffect, useState } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'
import {
  RefreshCw, ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  Minus, Info, Loader2, AlertTriangle, BarChart3
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

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

export default function COTReport() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reportDate, setReportDate] = useState('')
  const [expanded, setExpanded] = useState(null)

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

  return (
    <DashboardLayout title="COT Report" subtitle="CFTC Commitment of Traders — Institutional positioning">
      <div className="space-y-5">

        {/* Info Banner */}
        <div className="bg-blue-500/[0.06] border border-blue-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
          <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-400">
            COT data is released every <span className="text-blue-400 font-semibold">Friday at 3:30 PM EST</span> by the CFTC, reflecting positions from the previous Tuesday. This shows how <span className="text-white font-medium">Asset Managers</span> and <span className="text-white font-medium">Leveraged Funds</span> (smart money) are positioned.
          </p>
        </div>

        {/* Stats Row */}
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

        {/* Refresh */}
        <div className="flex items-center justify-end">
          <button
            onClick={fetchCOT}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-12 text-center">
            <Loader2 size={24} className="text-cyan-400 animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-400">Fetching latest CFTC data...</p>
          </div>
        )}

        {/* Error */}
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

        {/* No Data */}
        {!loading && !error && data.length === 0 && (
          <div className="bg-white/[0.03] border border-dashed border-white/10 rounded-xl p-10 text-center">
            <BarChart3 size={24} className="text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400 font-medium">No COT data available</p>
            <p className="text-xs text-slate-600 mt-1">Data is published weekly on Fridays</p>
          </div>
        )}

        {/* COT Cards */}
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
                              { label: 'Asset Managers', data: item.breakdown.assetManagers, emoji: '🏦' },
                              { label: 'Leveraged Funds', data: item.breakdown.leveragedFunds, emoji: '💰' },
                              { label: 'Dealers', data: item.breakdown.dealers, emoji: '🏛️' },
                            ].map(({ label, data: bd, emoji }) => {
                              const bdNetColor = bd.net > 0 ? 'text-emerald-400' : bd.net < 0 ? 'text-red-400' : 'text-slate-400'
                              return (
                                <div key={label} className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
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