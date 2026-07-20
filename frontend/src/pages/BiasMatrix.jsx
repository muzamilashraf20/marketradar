import { useState, useEffect } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'
import {
  TrendingUp, TrendingDown, Minus, RefreshCw,
  AlertTriangle, BookOpen, XOctagon, Info,
  Activity, Zap
} from 'lucide-react'

const ASSETS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'GBPJPY',
  'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURJPY',
  'EURGBP', 'NAS100', 'BTC'
]

// Invalidation levels come back as raw floats from the engine's ATR maths — round to the pair's
// real quoting precision, same convention the backend logs and the Macro Compass use.
const fmtLevel = (pair, v) => {
  if (v == null || v === 'N/A') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const dp = String(pair).includes('JPY') ? 3 : pair === 'XAUUSD' ? 2 : 5
  return n.toFixed(dp)
}

function DirectionBadge({ direction }) {
  if (direction === 'Bullish') return (
    <div className="flex items-center gap-2 text-emerald-400">
      <TrendingUp size={20} />
      <span className="text-2xl font-black">BULLISH</span>
    </div>
  )
  if (direction === 'Bearish') return (
    <div className="flex items-center gap-2 text-red-400">
      <TrendingDown size={20} />
      <span className="text-2xl font-black">BEARISH</span>
    </div>
  )
  return (
    <div className="flex items-center gap-2 text-slate-400">
      <Minus size={20} />
      <span className="text-2xl font-black">NEUTRAL</span>
    </div>
  )
}

function TradeGrade({ grade }) {
  const styles = {
    'A+': 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
    'A': 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400',
    'A-': 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400',
    'B': 'bg-cyan-500/10 border-cyan-500/25 text-cyan-400',
    'C': 'bg-amber-500/10 border-amber-500/25 text-amber-400',
    'D': 'bg-red-500/10 border-red-500/25 text-red-400',
  }
  return (
    <div className={`px-4 py-2 rounded-xl border text-center ${styles[grade] || styles['C']}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-70 mb-0.5">Trade Grade</p>
      <p className="text-2xl font-black">{grade || 'N/A'}</p>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 animate-pulse">
      <div className="h-4 bg-white/10 rounded w-1/3 mb-4" />
      <div className="h-8 bg-white/10 rounded w-2/3 mb-3" />
      <div className="h-3 bg-white/10 rounded w-full mb-2" />
      <div className="h-3 bg-white/10 rounded w-4/5" />
    </div>
  )
}

export default function BiasMatrix() {
  const [selectedAsset, setSelectedAsset] = useState('EURUSD')
  const [loading, setLoading] = useState(false)
  const [bias, setBias] = useState(null)
  const [error, setError] = useState('')
  // A pair the engine doesn't cover isn't a failure — it's a coverage gap. Tracked separately so it
  // renders as a plain note instead of a red error the user might read as something being broken.
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setError(''); setNotice('')
    try {
      const saved = localStorage.getItem('bf_bias_' + selectedAsset)
      setBias(saved ? JSON.parse(saved) : null)
    } catch {
      setBias(null)
    }
  }, [selectedAsset])

  const loadBias = async () => {
    setLoading(true)
    setError(''); setNotice('')
    setBias(null)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/bias`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: selectedAsset }),
        }
      )
      const data = await res.json()
      if (data.success) {
        setBias(data.bias)
        localStorage.setItem('bf_bias_' + selectedAsset, JSON.stringify(data.bias))
      } else if (data.unsupported) {
        setNotice(data.error)
        localStorage.removeItem('bf_bias_' + selectedAsset)
      } else {
        setError(data.error || 'Could not load that pair')
      }
    } catch {
      setError('Cannot connect to server. Please try again.')
    }
    setLoading(false)
  }

  const confColor = (bias?.confidence || 0) >= 75
    ? 'text-emerald-400' : (bias?.confidence || 0) >= 60
    ? 'text-cyan-400' : (bias?.confidence || 0) >= 50
    ? 'text-amber-400' : 'text-red-400'

  return (
    <DashboardLayout title="AI Bias Engine" subtitle="AI-powered macro trading bias">
      <div className="space-y-6 max-w-5xl">

        {/* Controls */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <TrendingUp size={15} className="text-cyan-400" />
            Check a Pair
          </h2>

          <div className="mb-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Select Asset</p>
            <div className="flex flex-wrap gap-2">
              {ASSETS.map(asset => (
                <button
                  key={asset}
                  onClick={() => setSelectedAsset(asset)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    selectedAsset === asset
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                  }`}
                >
                  {asset}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={loadBias}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold text-sm transition-all shadow-lg shadow-cyan-500/20"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading…' : 'View Bias'}
          </button>

          {error && (
            <p className="mt-3 text-xs text-red-400 flex items-center gap-1.5">
              <AlertTriangle size={12} /> {error}
            </p>
          )}

          {notice && (
            <p className="mt-3 text-xs text-slate-400 flex items-start gap-1.5">
              <Info size={12} className="shrink-0 mt-0.5" /> {notice}
            </p>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* FLAT — the engine looked and decided there is no edge. That is a real call, so say it
            plainly rather than rendering an empty bias card. */}
        {bias?.flat && !loading && (
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 text-center">
            <Minus size={28} className="text-slate-500 mx-auto mb-3" />
            <p className="text-lg font-bold text-slate-300 mb-1">{bias.symbol} — no directional bias</p>
            <p className="text-sm text-slate-500 max-w-md mx-auto">{bias.reasoning}</p>
            {bias.generatedAt && (
              <p className="text-xs text-slate-600 mt-4">
                Last checked {new Date(bias.generatedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Results */}
        {bias && !bias.flat && !loading && (
          <div className="space-y-4">

            {/* Direction + Confidence + Grade */}
            <div className={`bg-white/[0.03] border rounded-2xl p-6 ${
              bias.direction === 'Bullish' ? 'border-emerald-500/20' :
              bias.direction === 'Bearish' ? 'border-red-500/20' : 'border-white/10'
            }`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                    {bias.symbol}{bias.regime ? ` · ${bias.regime} regime` : ''}
                  </p>
                  <DirectionBadge direction={bias.direction} />
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-slate-500 mb-1">Confidence</p>
                    <p className={`text-4xl font-black ${confColor}`}>
                      {bias.confidence}%
                    </p>
                  </div>
                  <TradeGrade grade={bias.tradeGrade} />
                </div>
              </div>

              {/* Confidence bar */}
              <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    (bias.confidence || 0) >= 75 ? 'bg-emerald-400' :
                    (bias.confidence || 0) >= 60 ? 'bg-cyan-400' :
                    (bias.confidence || 0) >= 50 ? 'bg-amber-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${bias.confidence}%` }}
                />
              </div>
              {bias.confidenceReasoning && (
                <p className="text-xs text-slate-500 italic">{bias.confidenceReasoning}</p>
              )}
            </div>

            {/* ⏱️ ENTRY TIMING (how much of the daily range the move has already spent) */}
            {bias.entryTiming && (() => {
              const eq = String(bias.entryTiming).toUpperCase()
              const cfg = eq === 'FRESH'
                ? { box: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-400', dim: 'text-emerald-400/70', label: '🟢 FRESH', desc: 'Move is early — good time to look for your technical setup.' }
                : eq === 'EXTENDED'
                ? { box: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400', dim: 'text-amber-400/70', label: '🟡 EXTENDED', desc: 'Move is partly done — consider waiting for a pullback before entering.' }
                : { box: 'bg-red-500/10 border-red-500/20', text: 'text-red-400', dim: 'text-red-400/70', label: '🔴 LATE', desc: 'Move is mature — a fresh entry now is a chase. Wait for a pullback or the next session.' }
              return (
                <div className={`${cfg.box} border rounded-2xl p-4 flex items-start gap-3`}>
                  <Activity size={20} className={`${cfg.text} shrink-0 mt-0.5`} />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className={`text-sm font-bold ${cfg.text}`}>{cfg.label} — Entry Timing</p>
                    </div>
                    <p className={`text-xs ${cfg.dim}`}>{cfg.desc}</p>
                  </div>
                </div>
              )
            })()}

            {/* ⚠️ INVALIDATION WARNING BAR */}
            {fmtLevel(bias.symbol, bias.levels?.invalidation) && (
              <div className="bg-red-500/8 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3">
                <XOctagon size={20} className="text-red-400 shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <p className="text-sm font-bold text-red-400">
                      Bias Invalidates at <span className="font-mono text-base">{fmtLevel(bias.symbol, bias.levels.invalidation)}</span>
                    </p>
                  </div>
                  <p className="text-xs text-red-400/70">
                    {bias.invalidationReasoning || `If price breaks ${fmtLevel(bias.symbol, bias.levels.invalidation)}, this bias is no longer valid. Exit or reassess.`}
                  </p>
                </div>
              </div>
            )}

            {/* Reasoning + Key Drivers */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <BookOpen size={14} className="text-cyan-400" />
                AI Reasoning
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">{bias.reasoning}</p>
            </div>

            {/* Timestamp */}
            <div className="flex items-center justify-end px-2">
              <p className="text-xs text-slate-600">
                {bias.generatedAt ? `Engine last updated ${new Date(bias.generatedAt).toLocaleString()}` : ''} · BiasForge
              </p>
            </div>

          </div>
        )}

        {/* Empty state */}
        {!bias && !loading && !notice && (
          <div className="text-center py-16 bg-white/[0.02] border border-white/10 rounded-2xl">
            <Zap size={32} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 font-semibold mb-1">No pair checked yet</p>
            <p className="text-slate-600 text-sm">Select a pair and click "View Bias"</p>
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}