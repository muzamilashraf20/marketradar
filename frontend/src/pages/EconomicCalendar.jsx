import { useEffect, useState, useMemo } from 'react';
import { Calendar, RefreshCw, AlertTriangle, Search, Zap, X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const CALENDAR_URL = `${API_BASE}/api/calendar`;

// ─── Analyze Modal ────────────────────────────────────────────────────────────
function AnalyzeModal({ event, onClose }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAnalysis();
  }, []);

  const fetchAnalysis = async () => {
    try {
      setLoading(true);
      setError('');

      const prompt = `You are a professional macro trading analyst for BiasForge.ai.

Analyze this economic event and provide a complete pre-release trading brief:

Event: ${event.title}
Currency: ${event.currency}
Impact: ${event.impact}
Forecast: ${event.forecast}
Previous: ${event.previous}
Actual: ${event.actual !== '-' ? event.actual : 'Not yet released'}
Release Time: ${new Date(event.date).toLocaleString()}

Return ONLY a valid JSON object like this (no markdown, no explanation):
{
  "overallBias": "BEARISH USD",
  "biasDirection": "bearish",
  "probability": 68,
  "summary": "2-3 sentence summary of what this event means for markets",
  "forex": [
    {"pair": "EUR/USD", "bias": "bullish", "reason": "short reason"},
    {"pair": "GBP/USD", "bias": "bullish", "reason": "short reason"},
    {"pair": "USD/JPY", "bias": "bearish", "reason": "short reason"},
    {"pair": "USD/CHF", "bias": "bearish", "reason": "short reason"},
    {"pair": "AUD/USD", "bias": "neutral", "reason": "short reason"},
    {"pair": "XAU/USD", "bias": "bullish", "reason": "short reason"}
  ],
  "indices": [
    {"name": "S&P 500", "bias": "bearish", "reason": "short reason"},
    {"name": "NASDAQ", "bias": "bearish", "reason": "short reason"},
    {"name": "DOW", "bias": "neutral", "reason": "short reason"}
  ],
  "crypto": [
    {"name": "BTC/USD", "bias": "bullish", "reason": "short reason"},
    {"name": "ETH/USD", "bias": "bullish", "reason": "short reason"}
  ],
  "commodities": [
    {"name": "Gold (XAU)", "bias": "bullish", "reason": "short reason"},
    {"name": "Oil (WTI)", "bias": "neutral", "reason": "short reason"}
  ],
  "preEventPlan": [
    "Avoid entering trades 15 minutes before release",
    "Wait for candle close after news spike",
    "Reduce position size by 50%"
  ],
  "postEventStrategy": "If actual > forecast: Sell USD pairs. If actual < forecast: Buy USD pairs.",
  "propFirmAdvice": "Do not hold positions into high-impact news. Max 0.5% risk per trade during news."
}`

      const res = await fetch(`${API_BASE}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'AI failed')

      const clean = data.response.trim().replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      setAnalysis(parsed)

    } catch (err) {
      console.error('Analysis error:', err)
      setError('Failed to generate analysis. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const biasColor = (bias) => {
    if (!bias) return 'text-slate-400'
    const b = bias.toLowerCase()
    if (b === 'bullish') return 'text-emerald-400'
    if (b === 'bearish') return 'text-red-400'
    return 'text-slate-400'
  }

  const biasIcon = (bias) => {
    if (!bias) return <Minus className="w-3 h-3" />
    const b = bias.toLowerCase()
    if (b === 'bullish') return <TrendingUp className="w-3 h-3" />
    if (b === 'bearish') return <TrendingDown className="w-3 h-3" />
    return <Minus className="w-3 h-3" />
  }

  const biasBg = (bias) => {
    if (!bias) return 'bg-slate-500/10 border-slate-500/20'
    const b = bias.toLowerCase()
    if (b === 'bullish') return 'bg-emerald-500/10 border-emerald-500/20'
    if (b === 'bearish') return 'bg-red-500/10 border-red-500/20'
    return 'bg-slate-500/10 border-slate-500/20'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#020617] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">

        {/* Modal Header */}
        <div className="flex items-start justify-between p-6 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold mb-1">
              <Zap className="w-3 h-3" />
              AI TRADING BRIEF — PRO
            </div>
            <h2 className="text-lg font-bold text-white">{event.title}</h2>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
              <span className="text-cyan-300 font-medium">{event.currency}</span>
              <span className={`font-semibold ${event.impact === 'High' ? 'text-red-400' : event.impact === 'Medium' ? 'text-amber-400' : 'text-slate-400'}`}>
                {event.impact} Impact
              </span>
              <span>Forecast: {event.forecast}</span>
              <span>Previous: {event.previous}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="p-8 text-center">
            <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400 text-sm">Claude is analyzing market impact...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-6">
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">{error}</div>
          </div>
        )}

        {/* Analysis */}
        {!loading && analysis && (
          <div className="p-6 space-y-6">

            {/* Overall Bias */}
            <div className={`rounded-xl p-5 border ${analysis.biasDirection === 'bullish' ? 'bg-emerald-500/10 border-emerald-500/30' : analysis.biasDirection === 'bearish' ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-500/10 border-slate-500/30'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 mb-1">OVERALL BIAS</p>
                  <p className={`text-2xl font-black ${analysis.biasDirection === 'bullish' ? 'text-emerald-400' : analysis.biasDirection === 'bearish' ? 'text-red-400' : 'text-slate-300'}`}>
                    {analysis.overallBias}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400 mb-1">PROBABILITY</p>
                  <p className="text-3xl font-black text-white">{analysis.probability}%</p>
                </div>
              </div>
              <p className="text-sm text-slate-300 mt-3">{analysis.summary}</p>
            </div>

            {/* Forex */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">💱 Forex Impact</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {analysis.forex?.map((f, i) => (
                  <div key={i} className={`rounded-xl p-3 border ${biasBg(f.bias)}`}>
                    <div className={`flex items-center gap-1 font-bold text-sm ${biasColor(f.bias)}`}>
                      {biasIcon(f.bias)}
                      {f.pair}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{f.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Indices */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">📈 Indices Impact</p>
              <div className="grid grid-cols-3 gap-2">
                {analysis.indices?.map((idx, i) => (
                  <div key={i} className={`rounded-xl p-3 border ${biasBg(idx.bias)}`}>
                    <div className={`flex items-center gap-1 font-bold text-sm ${biasColor(idx.bias)}`}>
                      {biasIcon(idx.bias)}
                      {idx.name}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{idx.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Crypto */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">🪙 Crypto Impact</p>
              <div className="grid grid-cols-2 gap-2">
                {analysis.crypto?.map((c, i) => (
                  <div key={i} className={`rounded-xl p-3 border ${biasBg(c.bias)}`}>
                    <div className={`flex items-center gap-1 font-bold text-sm ${biasColor(c.bias)}`}>
                      {biasIcon(c.bias)}
                      {c.name}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{c.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Commodities */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">🥇 Commodities</p>
              <div className="grid grid-cols-2 gap-2">
                {analysis.commodities?.map((c, i) => (
                  <div key={i} className={`rounded-xl p-3 border ${biasBg(c.bias)}`}>
                    <div className={`flex items-center gap-1 font-bold text-sm ${biasColor(c.bias)}`}>
                      {biasIcon(c.bias)}
                      {c.name}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{c.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Pre Event Plan */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">⚡ Pre-Release Plan</p>
              <ul className="space-y-2">
                {analysis.preEventPlan?.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-amber-400 mt-0.5">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            {/* Post Event Strategy */}
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4">
              <p className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2">✅ Post-Release Strategy</p>
              <p className="text-sm text-slate-300">{analysis.postEventStrategy}</p>
            </div>

            {/* Prop Firm Advice */}
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
              <p className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2">🎯 Prop Firm Advice</p>
              <p className="text-sm text-slate-300">{analysis.propFirmAdvice}</p>
            </div>

            {/* Disclaimer */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-xs text-slate-500">
                ⚠️ <strong className="text-slate-400">Disclaimer:</strong> This analysis is NOT financial advice. Trading news events carries significant risk of loss, including loss of your entire capital. Past performance does not guarantee future results. Always use proper risk management. BiasForge.ai is an educational tool only.
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function EconomicCalendar() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);

  const [dayFilter, setDayFilter] = useState('Today');
  const [currencyFilter, setCurrencyFilter] = useState('All');
  const [impactFilter, setImpactFilter] = useState('All');
  const [search, setSearch] = useState('');

  const fetchCalendar = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(CALENDAR_URL);
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      const data = await res.json();
      const normalized = data.map((item, index) => ({
        id: `${item.date || ''}-${item.country || ''}-${item.title || ''}-${index}`,
        title: item.title || 'Event',
        currency: item.country || 'N/A',
        date: item.date,
        impact: item.impact || 'Low',
        forecast: item.forecast || '-',
        previous: item.previous || '-',
        actual: item.actual || '-',
      }));
      setEvents(normalized);
    } catch (err) {
      console.error('Calendar fetch error:', err);
      setError('Failed to load economic calendar. Please refresh or try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCalendar(); }, []);

  const filteredEvents = useMemo(() => {
    return events
      .filter(e => dayFilter === 'Today' ? isToday(e.date) : true)
      .filter(e => currencyFilter !== 'All' ? e.currency === currencyFilter : true)
      .filter(e => impactFilter !== 'All' ? e.impact.toLowerCase() === impactFilter.toLowerCase() : true)
      .filter(e => search.trim() ? e.title.toLowerCase().includes(search.toLowerCase()) : true)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [events, dayFilter, currencyFilter, impactFilter, search]);

  function isToday(dateString) {
    if (!dateString) return false;
    const d = new Date(dateString), t = new Date();
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  }

  function getCountdown(dateString) {
    if (!dateString) return 'N/A';
    const diff = new Date(dateString) - new Date();
    if (diff < 0) return 'Released';
    const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m`;
  }

  const highImpactToday = events.filter(e => isToday(e.date) && e.impact?.toLowerCase() === 'high').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Analyze Modal */}
        {selectedEvent && (
          <AnalyzeModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
        )}

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-sm font-semibold mb-2">
              <Calendar className="w-4 h-4" />
              LIVE ECONOMIC CALENDAR
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">Economic Calendar</h1>
            <p className="text-slate-400 mt-1">Track high-impact events and market movers.</p>
          </div>
          <button onClick={fetchCalendar} disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-300 hover:text-white hover:border-cyan-500/30 transition-all disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <p className="text-sm text-slate-400">Total Events</p>
            <p className="text-3xl font-bold text-white mt-1">{events.length}</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5">
            <p className="text-sm text-red-300">High Impact Today</p>
            <p className="text-3xl font-bold text-white mt-1">{highImpactToday}</p>
          </div>
          <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-5">
            <p className="text-sm text-cyan-300">Showing</p>
            <p className="text-3xl font-bold text-white mt-1">{filteredEvents.length}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-[#020617] border border-white/10 rounded-2xl p-5">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-3.5 text-slate-500" size={18} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search events..."
                className="w-full bg-[#030712] border border-white/10 rounded-xl pl-10 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500" />
            </div>
            <select value={dayFilter} onChange={e => setDayFilter(e.target.value)}
              className="bg-[#030712] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500">
              <option value="Today">Today</option>
              <option value="This Week">This Week</option>
            </select>
            <select value={currencyFilter} onChange={e => setCurrencyFilter(e.target.value)}
              className="bg-[#030712] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500">
              <option value="All">All Currencies</option>
              {['USD','EUR','GBP','JPY','AUD','CAD','CHF','NZD','CNY'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={impactFilter} onChange={e => setImpactFilter(e.target.value)}
              className="bg-[#030712] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500">
              <option value="All">All Impact</option>
              <option value="High">High Impact</option>
              <option value="Medium">Medium Impact</option>
              <option value="Low">Low Impact</option>
            </select>
          </div>
        </div>

        {/* Error */}
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-300 text-sm">{error}</div>}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="h-24 bg-white/5 border border-white/10 rounded-2xl animate-pulse" />)}
          </div>
        )}

        {/* Events List */}
        {!loading && filteredEvents.length > 0 && (
          <div className="space-y-3">
            {filteredEvents.map(event => (
              <div key={event.id}
                className={`bg-[#020617] border rounded-2xl p-5 transition-all ${
                  event.impact === 'High' ? 'border-red-500/30 hover:border-red-500/50' : 'border-white/10 hover:border-cyan-500/30'
                }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-white">{event.title}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(event.date).toLocaleString('en-US', { weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    event.impact === 'High' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                    event.impact === 'Medium' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                    'bg-slate-500/10 border-slate-500/30 text-slate-400'}`}>
                    {event.impact}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
                  <div><p className="text-slate-500 text-xs">Currency</p><p className="text-cyan-300 font-medium">{event.currency}</p></div>
                  <div><p className="text-slate-500 text-xs">Forecast</p><p className="text-white">{event.forecast}</p></div>
                  <div><p className="text-slate-500 text-xs">Previous</p><p className="text-white">{event.previous}</p></div>
                  <div><p className="text-slate-500 text-xs">Countdown</p><p className="text-emerald-400 font-medium">{getCountdown(event.date)}</p></div>
                </div>

                {/* Analyze Button */}
                <div className="mt-4">
                  <button
                    onClick={() => setSelectedEvent(event)}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 rounded-xl text-sm font-semibold hover:bg-cyan-500/20 transition-all"
                  >
                    <Zap className="w-4 h-4" />
                    AI Analyze — PRO
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filteredEvents.length === 0 && !error && (
          <div className="text-center py-16">
            <AlertTriangle className="mx-auto w-10 h-10 text-slate-500 mb-4" />
            <p className="text-white font-semibold">No events match your filters</p>
            <p className="text-slate-500 mt-1">Try changing the filters above</p>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}