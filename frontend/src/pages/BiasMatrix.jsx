import { useState } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'
import {
  TrendingUp, TrendingDown, Minus, ShieldCheck,
  ShieldAlert, ShieldX, RefreshCw, ChevronRight,
  Target, AlertTriangle, BookOpen
} from 'lucide-react'

const ASSETS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'NAS100', 'BTC']
const TIMEFRAMES = ['intraday', 'swing']

const MOCK_BIAS = {
  symbol: 'EURUSD',
  direction: 'Bullish',
  confidence: 78,
  timeframe: 'intraday',
  reasoning: 'ECB maintained hawkish tone in recent minutes while US CPI came in softer than expected at 3.2%. DXY weakness is supporting EUR strength with risk-on flows dominating.',
  keyDrivers: [
    'ECB hawkish stance — no rate cuts signaled',
    'US CPI missed expectations (3.2% vs 3.4%)',
    'Risk-on flows supporting EUR demand',
  ],
  scenarios: [
    { condition: 'If price holds above 1.0850', outcome: 'Bullish continuation toward 1.0920-1.0950', probability: 'High' },
    { condition: 'If US Retail Sales surprises positive', outcome: 'Reversal risk toward 1.0800 support', probability: 'Medium' },
  ],
  levels: {
    entry: '1.0855 - 1.0870',
    target1: '1.0920',
    target2: '1.0950',
    invalidation: '1.0820',
  },
  propFirmRisk: {
    recommendedRisk: '0.5%',
    maxLots: '0.25',
    remainingDailyBudget: '$800',
    status: 'SAFE',
    warning: null,
  },
  generatedAt: new Date().toISOString(),
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

function RiskBadge({ status }) {
  if (status === 'SAFE') return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
      <ShieldCheck size={12} /> SAFE
    </div>
  )
  if (status === 'CAUTION') return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold">
      <ShieldAlert size={12} /> CAUTION
    </div>
  )
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold">
      <ShieldX size={12} /> DANGER
    </div>
  )
}

function ProbabilityBadge({ probability }) {
  const styles = {
    High: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    Medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    Low: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${styles[probability] || styles.Low}`}>
      {probability}
    </span>
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
  const [selectedTf, setSelectedTf] = useState('intraday')
  const [loading, setLoading] = useState(false)
  const [bias, setBias] = useState(null)
  const [error, setError] = useState('')

  const generateBias = async () => {
    setLoading(true)
    setError('')
    setBias(null)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/bias`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: selectedAsset,
            timeframe: selectedTf,
            propFirm: { accountSize: 50000, maxDailyDrawdown: 1000, currentDailyPnl: 0 },
          }),
        }
      )
      const data = await res.json()
      if (data.success) {
        setBias(data.bias)
      } else {
        setError(data.error || 'AI analysis failed')
        setBias(MOCK_BIAS) // fallback to mock
      }
    } catch {
      setError('Cannot connect to server — showing demo data')
      setBias(MOCK_BIAS) // fallback to mock
    }
    setLoading(false)
  }

  const directionColor = bias?.direction === 'Bullish'
    ? 'text-emerald-400' : bias?.direction === 'Bearish'
    ? 'text-red-400' : 'text-slate-400'

  return (
    <DashboardLayout title="AI Bias Engine" subtitle="AI-powered macro trading bias">
      <div className="space-y-6 max-w-5xl">

        {/* Controls */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <TrendingUp size={15} className="text-cyan-400" />
            Generate AI Bias
          </h2>

          {/* Asset selector */}
          <div className="mb-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Select Asset</p>
            <div className="flex flex-wrap gap-2">
              {ASSETS.map(asset => (
                <button
                  key={asset}
                  onClick={() => setSelectedAsset(asset)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
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

          {/* Timeframe */}
          <div className="mb-5">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Timeframe</p>
            <div className="flex gap-2">
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf}
                  onClick={() => setSelectedTf(tf)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all capitalize ${
                    selectedTf === tf
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={generateBias}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold text-sm transition-all shadow-lg shadow-cyan-500/20"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Analyzing markets...' : 'Generate AI Bias'}
          </button>

          {error && (
            <p className="mt-3 text-xs text-amber-400 flex items-center gap-1.5">
              <AlertTriangle size={12} /> {error}
            </p>
          )}
        </div>

        {/* Loading skeletons */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Results */}
        {bias && !loading && (
          <div className="space-y-4">

            {/* Direction Card */}
            <div className={`bg-white/[0.03] border rounded-2xl p-6 ${
              bias.direction === 'Bullish' ? 'border-emerald-500/20' :
              bias.direction === 'Bearish' ? 'border-red-500/20' : 'border-white/10'
            }`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                    {bias.symbol} · {bias.timeframe}
                  </p>
                  <DirectionBadge direction={bias.direction} />
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 mb-1">Confidence</p>
                  <p className={`text-4xl font-black ${directionColor}`}>
                    {bias.confidence}%
                  </p>
                </div>
              </div>

              {/* Confidence bar */}
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    bias.direction === 'Bullish' ? 'bg-emerald-400' :
                    bias.direction === 'Bearish' ? 'bg-red-400' : 'bg-slate-400'
                  }`}
                  style={{ width: `${bias.confidence}%` }}
                />
              </div>
            </div>

            {/* Reasoning + Key Drivers */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <BookOpen size={14} className="text-cyan-400" />
                AI Reasoning
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed mb-4">{bias.reasoning}</p>
              <div className="space-y-2">
                {bias.keyDrivers.map((driver, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-sm text-slate-400">
                    <ChevronRight size={14} className="text-cyan-400 shrink-0" />
                    {driver}
                  </div>
                ))}
              </div>
            </div>

            {/* Scenarios + Levels */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Scenarios */}
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-400" />
                  Scenarios
                </h3>
                <div className="space-y-3">
                  {bias.scenarios.map((s, i) => (
                    <div key={i} className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold text-slate-300">{s.condition}</p>
                        <ProbabilityBadge probability={s.probability} />
                      </div>
                      <p className="text-xs text-slate-500">{s.outcome}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Levels */}
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <Target size={14} className="text-cyan-400" />
                  Key Levels
                </h3>
                <div className="space-y-2.5">
                  {[
                    { label: 'Entry Zone', value: bias.levels.entry, color: 'text-cyan-400' },
                    { label: 'Target 1', value: bias.levels.target1, color: 'text-emerald-400' },
                    { label: 'Target 2', value: bias.levels.target2, color: 'text-emerald-300' },
                    { label: 'Invalidation', value: bias.levels.invalidation, color: 'text-red-400' },
                  ].map(level => (
                    <div key={level.label} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <span className="text-xs text-slate-500">{level.label}</span>
                      <span className={`text-sm font-bold font-mono ${level.color}`}>{level.value}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Prop Firm Risk */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck size={14} className="text-emerald-400" />
                  Prop Firm Risk Assessment
                </h3>
                <RiskBadge status={bias.propFirmRisk.status} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Recommended Risk', value: bias.propFirmRisk.recommendedRisk },
                  { label: 'Max Lots', value: bias.propFirmRisk.maxLots },
                  { label: 'Daily Budget Left', value: bias.propFirmRisk.remainingDailyBudget },
                  { label: 'Status', value: bias.propFirmRisk.status },
                ].map(item => (
                  <div key={item.label} className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                    <p className="text-[10px] text-slate-500 mb-1">{item.label}</p>
                    <p className="text-sm font-bold text-white">{item.value}</p>
                  </div>
                ))}
              </div>
              {bias.propFirmRisk.warning && (
                <div className="mt-3 flex items-center gap-2 text-amber-400 text-xs">
                  <AlertTriangle size={12} />
                  {bias.propFirmRisk.warning}
                </div>
              )}
            </div>

            {/* Generated at */}
            <p className="text-xs text-slate-600 text-center">
              Generated at {new Date(bias.generatedAt).toLocaleString()} · BiasForge AI
            </p>

          </div>
        )}

        {/* Empty state */}
        {!bias && !loading && (
          <div className="text-center py-16 bg-white/[0.02] border border-white/10 rounded-2xl">
            <TrendingUp size={32} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 font-semibold mb-1">No bias generated yet</p>
            <p className="text-slate-600 text-sm">Select an asset and click "Generate AI Bias"</p>
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}