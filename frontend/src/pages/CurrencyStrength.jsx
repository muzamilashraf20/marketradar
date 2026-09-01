import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, RefreshCw, Zap } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const FLAG = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  AUD: '🇦🇺', NZD: '🇳🇿', CAD: '🇨🇦', CHF: '🇨🇭'
}

const COLORS = {
  Strong:  { bar: 'bg-emerald-500', text: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' },
  Neutral: { bar: 'bg-amber-500',   text: 'text-amber-400',   badge: 'bg-amber-500/10 border-amber-500/30 text-amber-400' },
  Weak:    { bar: 'bg-red-500',     text: 'text-red-400',     badge: 'bg-red-500/10 border-red-500/30 text-red-400' },
}

export default function CurrencyStrength() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchStrength = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${API_BASE}/api/strength`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to fetch');
      setData(json);
      setLastUpdate(new Date());
    } catch (e) {
      setError(e.message || 'Failed to load currency strength.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStrength();
    // Auto refresh every 60 seconds
    const interval = setInterval(fetchStrength, 60000);
    return () => clearInterval(interval);
  }, []);

  const strongest = data?.currencies?.[0];
  const weakest = data?.currencies?.[data.currencies.length - 1];

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-sm font-semibold mb-2">
              <Zap className="w-4 h-4" />
              LIVE CURRENCY STRENGTH
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">Currency Strength Meter</h1>
            <p className="text-slate-400 mt-1">
              Real-time strength of 8 major currencies. Auto-updates every 60s.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdate && (
              <span className="text-xs text-slate-500">
                Updated: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <button onClick={fetchStrength} disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-300 hover:text-white hover:border-cyan-500/30 transition-all disabled:opacity-60">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1,2,3,4,5,6,7,8].map(i => (
              <div key={i} className="h-20 bg-white/5 border border-white/10 rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {!loading && data && (
          <>
            {/* Top Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
                <p className="text-sm text-emerald-300 mb-1">💪 Strongest</p>
                <p className="text-3xl font-black text-white">
                  {FLAG[strongest?.currency]} {strongest?.currency}
                </p>
                <p className="text-sm text-emerald-400 mt-1">{strongest?.strength}% strength</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5">
                <p className="text-sm text-red-300 mb-1">📉 Weakest</p>
                <p className="text-3xl font-black text-white">
                  {FLAG[weakest?.currency]} {weakest?.currency}
                </p>
                <p className="text-sm text-red-400 mt-1">{weakest?.strength}% strength</p>
              </div>
              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-5">
                <p className="text-sm text-cyan-300 mb-1">⚡ Widest divergence</p>
                <p className="text-2xl font-black text-white">
                  {data.bestPairs?.[0]?.pair || 'N/A'}
                </p>
                <p className="text-sm text-cyan-400 mt-1">
                  {data.bestPairs?.[0]?.action} — {data.bestPairs?.[0]?.reason}
                </p>
              </div>
            </div>

            {/* Main Strength Bars */}
            <div className="bg-[#020617] border border-white/10 rounded-2xl p-6 space-y-5">
              <h2 className="text-white font-bold text-lg">Currency Rankings</h2>
              {data.currencies.map((c, i) => {
                const color = COLORS[c.label] || COLORS.Neutral;
                return (
                  <div key={c.currency} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{FLAG[c.currency]}</span>
                        <div>
                          <span className="text-white font-bold text-lg">{c.currency}</span>
                          <span className="ml-2 text-xs text-slate-500">#{i + 1}</span>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${color.badge}`}>
                          {c.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-black ${color.text}`}>
                          {c.strength}
                        </span>
                        <span className="text-slate-500 text-sm">/100</span>
                        {c.label === 'Strong' && <TrendingUp className="w-4 h-4 text-emerald-400" />}
                        {c.label === 'Weak' && <TrendingDown className="w-4 h-4 text-red-400" />}
                        {c.label === 'Neutral' && <Minus className="w-4 h-4 text-amber-400" />}
                      </div>
                    </div>
                    {/* Strength Bar */}
                    <div className="w-full bg-white/5 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all duration-700 ${color.bar}`}
                        style={{ width: `${c.strength}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Widest divergences */}
            {data.bestPairs?.length > 0 && (
              <div className="bg-[#020617] border border-white/10 rounded-2xl p-6">
                <h2 className="text-white font-bold text-lg mb-4">⚡ Widest divergences</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {data.bestPairs.map((p, i) => (
                    <div key={i} className={`rounded-xl p-4 border ${p.action === 'BUY' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xl font-black text-white">{p.pair}</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-black ${p.action === 'BUY' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>
                          {p.action}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400">{p.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* 🔀 Divergence Alerts */}
            {data.currencies && (() => {
              const currencies = data.currencies
              const strong = currencies.filter(c => c.strength >= 65)
              const weak = currencies.filter(c => c.strength <= 35)
              const alerts = []

              strong.forEach(s => {
                weak.forEach(w => {
                  const pair1 = `${s.currency}${w.currency}`
                  const pair2 = `${w.currency}${s.currency}`
                  const knownPairs = ['EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','NZDUSD','USDCAD','GBPJPY','EURJPY','EURGBP','AUDJPY','CADJPY']
                  if (knownPairs.includes(pair1)) {
                    alerts.push({ pair: pair1, action: 'BUY', strong: s.currency, weak: w.currency, gap: s.strength - w.strength })
                  } else if (knownPairs.includes(pair2)) {
                    alerts.push({ pair: pair2, action: 'SELL', strong: s.currency, weak: w.currency, gap: s.strength - w.strength })
                  }
                })
              })

              alerts.sort((a, b) => b.gap - a.gap)

              if (alerts.length === 0) return (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
                  <h2 className="text-white font-bold text-lg mb-2">🔀 Divergence Alerts</h2>
                  <p className="text-sm text-amber-400">No strong divergences detected. Currencies are mostly neutral — consider staying flat.</p>
                </div>
              )

              return (
                <div className="bg-[#020617] border border-white/10 rounded-2xl p-6">
                  <h2 className="text-white font-bold text-lg mb-4">🔀 Divergence Alerts</h2>
                  <div className="space-y-3">
                    {alerts.slice(0, 5).map((a, i) => (
                      <div key={i} className={`flex items-center justify-between p-4 rounded-xl border ${
                        a.action === 'BUY' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
                      }`}>
                        <div className="flex items-center gap-3">
                          <span className={`px-3 py-1.5 rounded-lg text-xs font-black ${
                            a.action === 'BUY' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'
                          }`}>{a.action}</span>
                          <div>
                            <p className="text-white font-bold text-lg">{a.pair}</p>
                            <p className="text-xs text-slate-400">
                              {FLAG[a.strong]} {a.strong} strong vs {FLAG[a.weak]} {a.weak} weak
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-xl font-black ${a.gap >= 50 ? 'text-emerald-400' : 'text-cyan-400'}`}>{a.gap}</p>
                          <p className="text-[10px] text-slate-500">Divergence Gap</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-600 mt-3">Higher gap = stronger divergence</p>
                </div>
              )
            })()}

            {/* Disclaimer */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-xs text-slate-500">
                ⚠️ Currency strength is calculated from live forex price movements. This is for informational purposes only — NOT financial advice. Always use proper risk management.
              </p>
            </div>
          </>
        )}

      </div>
    </DashboardLayout>
  );
}