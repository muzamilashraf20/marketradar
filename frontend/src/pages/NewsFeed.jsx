import { useEffect, useMemo, useState } from 'react';
import { Newspaper, RefreshCw, AlertTriangle, Search, Clock, SlidersHorizontal, Zap, X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ─── News Analyze Modal ───────────────────────────────────────────────────────
function NewsAnalyzeModal({ article, onClose }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { fetchAnalysis(); }, []);

  const fetchAnalysis = async () => {
    try {
      setLoading(true);
      setError('');

      const prompt = `You are a professional macro trading analyst for BiasForge.

Analyze this market news headline and provide a complete trading brief:

Headline: ${article.title}
Source: ${article.source}
Summary: ${article.summary || 'N/A'}
Published: ${new Date(article.publishedAt).toLocaleString()}

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "overallBias": "BEARISH USD",
  "biasDirection": "bearish",
  "probability": 68,
  "summary": "2-3 sentence summary of market impact",
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
  "tradingPlan": "Specific action: what to buy/sell and why",
  "propFirmAdvice": "Risk management advice for prop firm traders"
}`

      const res = await fetch(`${API_BASE}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'AI failed')
      const clean = data.response.trim().replace(/```json|```/g, '').trim()
      setAnalysis(JSON.parse(clean))
    } catch (err) {
      console.error('Analysis error:', err)
      setError('Failed to generate analysis. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const biasColor = (b) => {
    if (!b) return 'text-slate-400'
    if (b.toLowerCase() === 'bullish') return 'text-emerald-400'
    if (b.toLowerCase() === 'bearish') return 'text-red-400'
    return 'text-slate-400'
  }
  const biasIcon = (b) => {
    if (!b) return <Minus className="w-3 h-3" />
    if (b.toLowerCase() === 'bullish') return <TrendingUp className="w-3 h-3" />
    if (b.toLowerCase() === 'bearish') return <TrendingDown className="w-3 h-3" />
    return <Minus className="w-3 h-3" />
  }
  const biasBg = (b) => {
    if (!b) return 'bg-slate-500/10 border-slate-500/20'
    if (b.toLowerCase() === 'bullish') return 'bg-emerald-500/10 border-emerald-500/20'
    if (b.toLowerCase() === 'bearish') return 'bg-red-500/10 border-red-500/20'
    return 'bg-slate-500/10 border-slate-500/20'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#020617] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between p-6 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold mb-1">
              <Zap className="w-3 h-3" /> AI TRADING BRIEF — PRO
            </div>
            <h2 className="text-base font-bold text-white leading-snug">{article.title}</h2>
            <p className="text-xs text-slate-400 mt-1">{article.source} · {new Date(article.publishedAt).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 ml-4 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <div className="p-8 text-center">
            <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400 text-sm">Claude is analyzing market impact...</p>
          </div>
        )}
        {error && <div className="p-6"><div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">{error}</div></div>}

        {!loading && analysis && (
          <div className="p-6 space-y-6">
            <div className={`rounded-xl p-5 border ${analysis.biasDirection === 'bullish' ? 'bg-emerald-500/10 border-emerald-500/30' : analysis.biasDirection === 'bearish' ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-500/10 border-slate-500/30'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 mb-1">OVERALL BIAS</p>
                  <p className={`text-2xl font-black ${analysis.biasDirection === 'bullish' ? 'text-emerald-400' : analysis.biasDirection === 'bearish' ? 'text-red-400' : 'text-slate-300'}`}>{analysis.overallBias}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400 mb-1">PROBABILITY</p>
                  <p className="text-3xl font-black text-white">{analysis.probability}%</p>
                </div>
              </div>
              <p className="text-sm text-slate-300 mt-3">{analysis.summary}</p>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">💱 Forex Impact</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {analysis.forex?.map((f, i) => (
                  <div key={i} className={`rounded-xl p-3 border ${biasBg(f.bias)}`}>
                    <div className={`flex items-center gap-1 font-bold text-sm ${biasColor(f.bias)}`}>{biasIcon(f.bias)}{f.pair}</div>
                    <p className="text-xs text-slate-400 mt-1">{f.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">📈 Indices</p>
              <div className="grid grid-cols-3 gap-2">
                {analysis.indices?.map((idx, i) => (
                  <div key={i} className={`rounded-xl p-3 border ${biasBg(idx.bias)}`}>
                    <div className={`flex items-center gap-1 font-bold text-sm ${biasColor(idx.bias)}`}>{biasIcon(idx.bias)}{idx.name}</div>
                    <p className="text-xs text-slate-400 mt-1">{idx.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">🪙 Crypto</p>
              <div className="grid grid-cols-2 gap-2">
                {analysis.crypto?.map((c, i) => (
                  <div key={i} className={`rounded-xl p-3 border ${biasBg(c.bias)}`}>
                    <div className={`flex items-center gap-1 font-bold text-sm ${biasColor(c.bias)}`}>{biasIcon(c.bias)}{c.name}</div>
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
                    <div className={`flex items-center gap-1 font-bold text-sm ${biasColor(c.bias)}`}>{biasIcon(c.bias)}{c.name}</div>
                    <p className="text-xs text-slate-400 mt-1">{c.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4">
              <p className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2">⚡ Trading Plan</p>
              <p className="text-sm text-slate-300">{analysis.tradingPlan}</p>
            </div>

            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
              <p className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2">🎯 Prop Firm Advice</p>
              <p className="text-sm text-slate-300">{analysis.propFirmAdvice}</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-xs text-slate-500">⚠️ <strong className="text-slate-400">Disclaimer:</strong> NOT financial advice. High risk. Always use proper risk management.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Impact Tag Component ─────────────────────────────────────────────────────
function MarketTag({ tag }) {
  const isUp = tag.includes('↑')
  const isDown = tag.includes('↓')
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
      isUp ? 'bg-emerald-500/15 text-emerald-400' :
      isDown ? 'bg-red-500/15 text-red-400' :
      'bg-slate-500/15 text-slate-400'
    }`}>
      {tag}
    </span>
  )
}

// ─── Helper Functions ─────────────────────────────────────────────────────────
function impactBadgeClass(score) {
  if (score >= 8) return 'bg-red-500/10 border-red-500/40 text-red-300';
  if (score >= 5) return 'bg-amber-500/10 border-amber-500/40 text-amber-300';
  return 'bg-slate-500/10 border-slate-500/40 text-slate-300';
}

function timeAgo(dateString) {
  const diff = new Date() - new Date(dateString);
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return 'Just now';
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NewsFeed() {
  const [rawArticles, setRawArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [hours, setHours] = useState(48);
  const [highOnly, setHighOnly] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState(null);

  const fetchNews = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${API_BASE}/api/news?hours=${hours}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || 'Failed to load market news');
      setRawArticles(data.articles || []);
    } catch (e) {
      setError(e.message || 'Could not load latest market news.');
      setRawArticles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNews(); }, [hours]);

  const articles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rawArticles
      .filter(a => {
        if (highOnly && (a.impact || 0) < 8) return false;
        if (!q) return true;
        return `${a.title} ${a.summary} ${a.source}`.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (b.impact !== a.impact) return b.impact - a.impact;
        return new Date(b.publishedAt) - new Date(a.publishedAt);
      });
  }, [rawArticles, search, highOnly]);

  const highCount = articles.filter(a => (a.impact || 0) >= 8).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {selectedArticle && (
          <NewsAnalyzeModal article={selectedArticle} onClose={() => setSelectedArticle(null)} />
        )}

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-sm font-semibold mb-2">
              <Newspaper className="w-4 h-4" /> MARKET-MOVING NEWS
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">News Feed</h1>
            <p className="text-slate-400 mt-1">AI-scored headlines. High impact pinned on top.</p>
          </div>
          <button onClick={fetchNews} disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-300 hover:text-white hover:border-cyan-500/40 transition-all disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="bg-[#020617] border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-slate-300 text-sm font-semibold">
            <SlidersHorizontal className="w-4 h-4 text-cyan-400" /> Filters
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 text-slate-500" size={18} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search: Fed, CPI, Gold, Nasdaq..."
                className="w-full bg-[#030712] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500" />
            </div>
            <select value={hours} onChange={e => setHours(Number(e.target.value))}
              className="bg-[#030712] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500">
              <option value={6}>Last 6 hours</option>
              <option value={24}>Last 24 hours</option>
              <option value={48}>Last 48 hours</option>
              <option value={72}>Last 3 days</option>
              <option value={168}>Last 7 days</option>
            </select>
            <button onClick={() => setHighOnly(v => !v)}
              className={`px-4 py-3 rounded-xl text-sm font-semibold transition-all border ${highOnly ? 'bg-red-500/15 border-red-500/40 text-red-300' : 'bg-white/5 border-white/10 text-slate-300 hover:border-cyan-500/40 hover:text-white'}`}>
              {highOnly ? 'Showing High Impact Only' : 'Show High Impact Only'}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <p className="text-sm text-slate-400">Headlines</p>
            <p className="text-2xl font-bold text-white mt-1">{rawArticles.length}</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5">
            <p className="text-sm text-red-300">High Impact (8–10)</p>
            <p className="text-2xl font-bold text-white mt-1">{highCount}</p>
          </div>
          <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-5">
            <p className="text-sm text-cyan-300">Showing</p>
            <p className="text-2xl font-bold text-white mt-1">{articles.length}</p>
          </div>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-300 text-sm">{error}</div>}

        {loading && (
          <div className="space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />)}
          </div>
        )}

        {/* News List */}
        {!loading && articles.length > 0 && (
          <div className="space-y-4">
            {articles.map((a, idx) => {
              const isHigh = (a.impact || 0) >= 8;
              return (
                <div key={idx}
                  className={`bg-[#020617] border rounded-2xl p-5 transition-all ${isHigh ? 'border-red-500/40 shadow-lg shadow-red-500/10' : 'border-white/10 hover:border-cyan-500/40'}`}>

                  {isHigh && (
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-red-500/20">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <span className="text-xs font-bold text-red-400 uppercase tracking-wider">High Impact</span>
                    </div>
                  )}

                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${impactBadgeClass(a.impact || 5)}`}>
                      Impact {a.impact || 5}/10
                    </span>
                    {a.source && (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-white/10 bg-white/5 text-slate-300">
                        {a.source}
                      </span>
                    )}
                    {a.category && a.category !== 'General' && (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                        {a.category}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="text-lg font-semibold text-white hover:text-cyan-400 transition-colors">
                    {a.title}
                  </h3>

                  {/* AI One-liner */}
                  {a.oneliner && (
                    <p className="text-sm text-cyan-300/80 mt-1 italic">{a.oneliner}</p>
                  )}

                  {/* Market Tags — MRKT Style */}
                  {a.marketTags && a.marketTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {a.marketTags.map((tag, i) => (
                        <MarketTag key={i} tag={tag} />
                      ))}
                    </div>
                  )}

                  {/* Time */}
                  <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock size={14} />{timeAgo(a.publishedAt)}
                    </span>
                  </div>

                  {/* Buttons */}
                  <div className="mt-4 flex gap-2">
                    <a href={a.url} target="_blank" rel="noopener noreferrer"
                      className="flex-1 py-2 px-4 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 rounded-xl text-sm font-semibold text-center hover:bg-cyan-500/20 transition-all">
                      Read
                    </a>
                    <button onClick={() => setSelectedArticle(a)}
                      className="flex items-center gap-1.5 py-2 px-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl text-sm font-semibold hover:bg-emerald-500/20 transition-all">
                      <Zap className="w-3.5 h-3.5" /> Analyze
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && !error && articles.length === 0 && (
          <div className="text-center py-16">
            <AlertTriangle className="mx-auto w-10 h-10 text-slate-500 mb-4" />
            <p className="text-white font-semibold">No headlines found</p>
            <p className="text-slate-500 mt-1 text-sm">Try increasing time range or turning off filters.</p>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}