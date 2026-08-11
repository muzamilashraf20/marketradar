import { useEffect, useState, useMemo } from 'react';
import { Calendar, RefreshCw, AlertTriangle, Search, Zap, X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const CALENDAR_URL = `${API_BASE}/api/calendar`;

// ─── Analyze Modal ────────────────────────────────────────────────────────────
// The brief fetches live data per request and then runs a model over it, so it legitimately takes
// ~90s. A bare spinner reads as "broken" over that long, so the wait is narrated: an elapsed counter
// plus stages that track what the backend is actually doing.
const BRIEF_TIMEOUT_MS = 150000;
const LOADING_STAGES = [
  { at: 0,  text: 'Fetching live yields, COT positioning and pair prices…' },
  { at: 20, text: 'Pulling policy rates and recent leading indicators…' },
  { at: 45, text: 'Analysing the live data against this event…' },
  { at: 80, text: 'Almost there — writing up the brief…' },
];

function AnalyzeModal({ event, onClose }) {
  const [analysis, setAnalysis] = useState(null);
  const [dataUsed, setDataUsed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAnalysis();
  }, []);

  // Drives the elapsed counter so the user can see the request is alive, not wedged.
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [loading]);

  // The prompt lives in the backend (POST /api/calendar-brief). It used to be built here, which
  // meant it was readable in DevTools and every macro fact in it was hardcoded text. The endpoint
  // now takes only the event identifier and fetches yields / rates / COT / prices / leading
  // indicators live, per request.
  const fetchAnalysis = async () => {
    // fetch() has NO default timeout — without this the modal would spin forever on a stalled
    // request instead of failing cleanly.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), BRIEF_TIMEOUT_MS)
    try {
      setLoading(true);
      setError('');
      setElapsed(0);

      const res = await fetch(`${API_BASE}/api/calendar-brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: event.title,
          currency: event.currency,
          date: event.date,
          impact: event.impact,
          forecast: event.forecast,
          previous: event.previous,
          actual: event.actual,
        }),
        signal: controller.signal
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) throw new Error(data?.detail || data?.error || `Request failed (HTTP ${res.status})`)

      setAnalysis(data.analysis)
      setDataUsed(data.dataUsed || null)

    } catch (err) {
      console.error('Analysis error:', err)
      setError(err.name === 'AbortError'
        ? `The brief took longer than ${Math.round(BRIEF_TIMEOUT_MS / 1000)}s and was stopped. Live market data sources may be slow right now — try again in a moment.`
        : `Failed to generate analysis. ${err.message || 'Please try again.'}`)
    } finally {
      clearTimeout(timer)
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

  // The backend decides this in code, not the model — when the leads genuinely contradict each
  // other it returns tilt "mixed" and a null probability rather than flipping between beat and miss
  // across identical runs. The UI has to make that legible as a finding rather than a fault.
  const isMixed = analysis?.leadingIndicators?.tilt === 'mixed'

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

        {loading && (
          <div className="p-8 text-center">
            <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-300 text-sm font-medium">
              {[...LOADING_STAGES].reverse().find((s) => elapsed >= s.at)?.text || LOADING_STAGES[0].text}
            </p>
            <p className="text-slate-500 text-xs mt-2">
              Fetching live market data — this usually takes about 90 seconds · {elapsed}s
            </p>
          </div>
        )}

        {error && (
          <div className="p-6">
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">{error}</div>
            <button
              onClick={fetchAnalysis}
              className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-sm font-medium hover:bg-cyan-500/20 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Try again
            </button>
          </div>
        )}

        {!loading && analysis && (
          <div className="p-6 space-y-6">

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
                  {/* null = either no usable leading data, or the leads contradict each other.
                      Showing "0%" would be a lie, and a bare "N/A" reads as a failure — so when the
                      cause is a split, say that instead. */}
                  <p className="text-3xl font-black text-white">
                    {analysis.probability === null || analysis.probability === undefined
                      ? (isMixed ? '—' : 'N/A')
                      : `${analysis.probability}%`}
                  </p>
                  {analysis.probability === null && isMixed && (
                    <p className="text-[10px] text-amber-400/90 uppercase tracking-wider mt-1">no directional call</p>
                  )}
                  {analysis.confidence && !(analysis.probability === null && isMixed) && (
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">{analysis.confidence} confidence</p>
                  )}
                </div>
              </div>
              <p className="text-sm text-slate-300 mt-3">{analysis.summary}</p>
            </div>

            {analysis.leadingIndicators && (
              <div className={`rounded-xl p-4 border ${isMixed ? 'bg-amber-500/5 border-amber-500/25' : 'bg-white/5 border-white/10'}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">🔎 Leading Indicators</p>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${
                    analysis.leadingIndicators.tilt === 'beat' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    : analysis.leadingIndicators.tilt === 'miss' ? 'text-red-400 bg-red-500/10 border-red-500/20'
                    : isMixed ? 'text-amber-400 bg-amber-500/10 border-amber-500/25'
                    : 'text-slate-400 bg-slate-500/10 border-slate-500/20'}`}>
                    {analysis.leadingIndicators.tilt}
                  </span>
                </div>
                {/* A split is a finding, not a failure. Without this line "mixed" and a dash where a
                    percentage belongs read like the brief broke or the data never arrived. */}
                {isMixed && (
                  <p className="text-sm text-amber-200/90 mb-2">
                    The data points <strong>both ways</strong> — some leads argue for a beat, others for a miss.
                    This is a real split in the evidence, not missing data, so no directional call is made.
                  </p>
                )}
                <p className="text-sm text-slate-300">{analysis.leadingIndicators.reasoning}</p>
                {analysis.leadingIndicators.evidence?.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {analysis.leadingIndicators.evidence.map((ev, i) => (
                      <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                        <span className="text-cyan-400 mt-0.5">•</span>{ev}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {analysis.supportingData?.length > 0 && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">📡 Live Data Supporting This Call</p>
                <ul className="space-y-1">
                  {analysis.supportingData.map((d, i) => (
                    <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-emerald-400 mt-0.5">•</span>{d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">💱 Forex Impact</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {analysis.forex?.map((f, i) => (
                  <div key={i} className={`rounded-xl p-3 border ${biasBg(f.bias)}`}>
                    <div className={`flex items-center gap-1 font-bold text-sm ${biasColor(f.bias)}`}>
                      {biasIcon(f.bias)}{f.pair}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{f.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">📈 Indices Impact</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {analysis.indices?.map((idx, i) => (
                  <div key={i} className={`rounded-xl p-3 border ${biasBg(idx.bias)}`}>
                    <div className={`flex items-center gap-1 font-bold text-sm ${biasColor(idx.bias)}`}>
                      {biasIcon(idx.bias)}{idx.name}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{idx.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">🪙 Crypto Impact</p>
              <div className="grid grid-cols-2 gap-2">
                {analysis.crypto?.map((c, i) => (
                  <div key={i} className={`rounded-xl p-3 border ${biasBg(c.bias)}`}>
                    <div className={`flex items-center gap-1 font-bold text-sm ${biasColor(c.bias)}`}>
                      {biasIcon(c.bias)}{c.name}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{c.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">🥇 Commodities</p>
              <div className="grid grid-cols-2 gap-2">
                {analysis.commodities?.map((c, i) => (
                  <div key={i} className={`rounded-xl p-3 border ${biasBg(c.bias)}`}>
                    <div className={`flex items-center gap-1 font-bold text-sm ${biasColor(c.bias)}`}>
                      {biasIcon(c.bias)}{c.name}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{c.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">⚡ Pre-Release Plan</p>
              <ul className="space-y-2">
                {analysis.preEventPlan?.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-amber-400 mt-0.5">•</span>{tip}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4">
              <p className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2">✅ Post-Release Strategy</p>
              <p className="text-sm text-slate-300">{analysis.postEventStrategy}</p>
            </div>

            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
              <p className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2">🎯 Prop Firm Advice</p>
              <p className="text-sm text-slate-300">{analysis.propFirmAdvice}</p>
            </div>

            {/* Provenance: exactly which live inputs the brief was built on, and what was missing. */}
            {dataUsed && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">🛰️ Live Inputs Fetched</p>
                <div className="flex flex-wrap gap-1.5">
                  {dataUsed.yields && (
                    <span className="text-[11px] px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                      2Y {dataUsed.yields.y2 ?? '—'}% / 10Y {dataUsed.yields.y10 ?? '—'}%
                      {dataUsed.yields.change3SessionBps !== null && ` (${dataUsed.yields.change3SessionBps > 0 ? '+' : ''}${dataUsed.yields.change3SessionBps}bps/3d)`}
                    </span>
                  )}
                  {dataUsed.fedFunds && (
                    <span className="text-[11px] px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                      Fed funds {dataUsed.fedFunds.value}% ({dataUsed.fedFunds.date})
                    </span>
                  )}
                  {dataUsed.corePCE && (
                    <span className="text-[11px] px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                      Core PCE {dataUsed.corePCE.yoy}% ({dataUsed.corePCE.date})
                    </span>
                  )}
                  {dataUsed.crossAsset?.length > 0 && (
                    <span className="text-[11px] px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                      Cross-asset: {dataUsed.crossAsset.join(', ')}
                    </span>
                  )}
                  {dataUsed.cot && (
                    <span className="text-[11px] px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                      COT {dataUsed.cot.reportDate}
                    </span>
                  )}
                  {dataUsed.pairsPriced?.length > 0 && (
                    <span className="text-[11px] px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                      {dataUsed.pairsPriced.length} pairs priced + ADR
                    </span>
                  )}
                  <span className={`text-[11px] px-2 py-1 rounded-lg border ${dataUsed.leadingIndicators?.count > 0 ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300' : 'bg-slate-500/10 border-slate-500/20 text-slate-400'}`}>
                    {dataUsed.leadingIndicators?.count || 0} leading prints
                    {dataUsed.leadingIndicators?.family ? ` (${dataUsed.leadingIndicators.family})` : ''}
                  </span>
                </div>
                {dataUsed.missing?.length > 0 && (
                  <p className="text-[11px] text-amber-400/80 mt-2">
                    Not available this run: {dataUsed.missing.join(', ')}
                  </p>
                )}
              </div>
            )}

            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-xs text-slate-500">
                ⚠️ <strong className="text-slate-400">Disclaimer:</strong> This analysis is NOT financial advice. Trading news events carries significant risk of loss, including loss of your entire capital. Past performance does not guarantee future results. Always use proper risk management. BiasForge is an educational tool only.
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

  const [dayFilter, setDayFilter] = useState('All');
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

  function isToday(dateString) {
    if (!dateString) return false;
    const d = new Date(dateString), t = new Date();
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  }

  // Rolling windows (not rigid Sun-Sat weeks) so loaded events always stay visible
  function isUpcoming(dateString) {
    if (!dateString) return false;
    return new Date(dateString) >= new Date(); // now → future
  }

  function isRecent(dateString) {
    if (!dateString) return false;
    const diff = new Date() - new Date(dateString);
    return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000; // last 7 days (already released)
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

  const filteredEvents = useMemo(() => {
    return events
      .filter(e => {
        if (dayFilter === 'Today') return isToday(e.date)
        if (dayFilter === 'Upcoming') return isUpcoming(e.date)
        if (dayFilter === 'Recent') return isRecent(e.date)
        return true // 'All'
      })
      .filter(e => currencyFilter !== 'All' ? e.currency === currencyFilter : true)
      .filter(e => impactFilter !== 'All' ? e.impact.toLowerCase() === impactFilter.toLowerCase() : true)
      .filter(e => search.trim() ? e.title.toLowerCase().includes(search.toLowerCase()) : true)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [events, dayFilter, currencyFilter, impactFilter, search]);

  const highImpactToday = events.filter(e => isToday(e.date) && e.impact?.toLowerCase() === 'high').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {selectedEvent && (
          <AnalyzeModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
        )}

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
        {/* ⚠️ PRE-EVENT ALERT */}
        {(() => {
          const upcoming = events.find(e => {
            const diff = new Date(e.date) - new Date()
            return diff > 0 && diff < 3600000 && (e.impact === 'High' || e.impact === 3)
          })
          if (!upcoming) return null
          const mins = Math.floor((new Date(upcoming.date) - new Date()) / 60000)
          return (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3 animate-pulse">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-400">
                  ⚡ HIGH IMPACT EVENT IN {mins} MINUTES
                </p>
                <p className="text-sm text-white font-semibold mt-1">{upcoming.title} ({upcoming.currency})</p>
                <p className="text-xs text-red-400/70 mt-1">
                  Consider reducing position size or closing trades before release. Prop firm traders: tighten stops or go flat.
                </p>
              </div>
            </div>
          )
        })()}

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
              <option value="All">All Events</option>
              <option value="Upcoming">Upcoming</option>
              <option value="Today">Today</option>
              <option value="Recent">Recent (7d)</option>
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

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-300 text-sm">{error}</div>}

        {loading && (
          <div className="space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="h-24 bg-white/5 border border-white/10 rounded-2xl animate-pulse" />)}
          </div>
        )}

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

                <div className="mt-4">
                  <button onClick={() => setSelectedEvent(event)}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 rounded-xl text-sm font-semibold hover:bg-cyan-500/20 transition-all">
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
            {(() => {
              // How many events fall in the selected time window, ignoring impact/currency/search?
              const dayWindowCount = events.filter(e => {
                if (dayFilter === 'Today') return isToday(e.date)
                if (dayFilter === 'Upcoming') return isUpcoming(e.date)
                if (dayFilter === 'Recent') return isRecent(e.date)
                return true
              }).length
              const whenLabel = dayFilter === 'Today' ? 'today' : dayFilter === 'Upcoming' ? 'upcoming' : dayFilter === 'Recent' ? 'in the last 7 days' : ''
              const impactActive = impactFilter !== 'All'
              const currencyActive = currencyFilter !== 'All'
              const searchActive = !!search.trim()

              // Case 1: events exist in this window, but impact/currency/search filtered them out
              if (dayWindowCount > 0 && (impactActive || currencyActive || searchActive)) {
                const bits = []
                if (impactActive) bits.push(`${impactFilter}-impact`)
                if (currencyActive) bits.push(currencyFilter)
                const what = bits.join(' ') || 'matching'
                return (
                  <>
                    <p className="text-white font-semibold">No {what} events {whenLabel}</p>
                    <p className="text-slate-500 mt-1">There {dayWindowCount === 1 ? 'is' : 'are'} {dayWindowCount} other event{dayWindowCount === 1 ? '' : 's'} {whenLabel} — clear the {impactActive ? 'impact' : currencyActive ? 'currency' : 'search'} filter to see {dayWindowCount === 1 ? 'it' : 'them'}.</p>
                  </>
                )
              }
              // Case 2: nothing released yet for Recent
              if (dayFilter === 'Recent') {
                return (
                  <>
                    <p className="text-white font-semibold">No recent releases yet</p>
                    <p className="text-slate-500 mt-1">Events from earlier this week will appear here once they're released.</p>
                  </>
                )
              }
              // Case 3: genuinely no events in the Today/Upcoming window
              if ((dayFilter === 'Today' || dayFilter === 'Upcoming') && events.length > 0) {
                return (
                  <>
                    <p className="text-white font-semibold">No events {dayFilter === 'Today' ? 'today' : 'upcoming right now'}</p>
                    <p className="text-slate-500 mt-1">Switch to "All Events" to see the full calendar for this week.</p>
                  </>
                )
              }
              // Fallback
              return (
                <>
                  <p className="text-white font-semibold">No events match your filters</p>
                  <p className="text-slate-500 mt-1">Try changing the filters above</p>
                </>
              )
            })()}
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}