import { useEffect, useMemo, useState } from 'react';
import { Newspaper, RefreshCw, AlertTriangle, Search, Clock, SlidersHorizontal } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Same keywords we used before, but now we also enforce "recency window"
const HIGH_IMPACT_WORDS = [
  'fed','fomc','powell','ecb','lagarde','boj','boe','rba','rbnz','snb',
  'cpi','ppi','inflation','gdp','recession','unemployment','jobs','nfp','payrolls',
  'rate cut','rate hike','hawkish','dovish','yields','bond','treasury',
  'tariff','sanction','trade war','geopolitical','war','attack',
  'default','bank','banking','liquidity','crisis','collapse',
  'earnings','guidance','merger','acquisition',
  'gold','oil','crude','bitcoin','crypto','ethereum','dollar','eur','jpy','gbp',
  'nasdaq','nyse','cme','london stock exchange','lse','futures','options',
];

function calcImpactScore(title, description, entities) {
  const text = `${title} ${description}`.toLowerCase();

  // Base score starts low so random news doesn’t look important
  let score = 2;

  for (const w of HIGH_IMPACT_WORDS) {
    if (text.includes(w)) score += 1;
  }

  // Entities bonus: if Marketaux found real traded entities, that’s usually more market-related
  const entityCount = Array.isArray(entities) ? entities.length : 0;
  if (entityCount >= 1) score += 1;
  if (entityCount >= 3) score += 1;

  // If title looks like BREAKING (caps)
  if (/[A-Z]{6,}/.test(title)) score += 1;

  return Math.max(1, Math.min(10, score));
}

function impactBadgeClass(score) {
  if (score >= 8) return 'bg-red-500/10 border-red-500/40 text-red-300';
  if (score >= 5) return 'bg-amber-500/10 border-amber-500/40 text-amber-300';
  return 'bg-slate-500/10 border-slate-500/40 text-slate-300';
}

function timeAgo(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const diff = now - date;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

export default function NewsFeed() {
  const [rawArticles, setRawArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Controls
  const [hours, setHours] = useState(48); // last 48h default
  const [highOnly, setHighOnly] = useState(false);

  const fetchNews = async () => {
    try {
      setLoading(true);
      setError('');

      const res = await fetch(`${API_BASE}/api/news?hours=${hours}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data?.error || 'Failed to load market news');
      }

      setRawArticles(data.articles || []);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Could not load latest market news.');
      setRawArticles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours]);

  const articles = useMemo(() => {
    const q = search.trim().toLowerCase();

    const enriched = rawArticles.map((a) => {
      const impact = calcImpactScore(a.title || '', a.description || '', a.entities);
      return { ...a, impactScore: impact };
    });

    const filtered = enriched
      .filter((a) => {
        if (highOnly && a.impactScore < 8) return false;
        if (!q) return true;

        const t = `${a.title || ''} ${a.description || ''} ${a.source || ''}`.toLowerCase();
        return t.includes(q);
      })
      .sort((a, b) => {
        // 1) High impact FIRST
        if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
        // 2) Then newest
        return new Date(b.publishedAt) - new Date(a.publishedAt);
      });

    return filtered;
  }, [rawArticles, search, highOnly]);

  const highCount = articles.filter((a) => a.impactScore >= 8).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-sm font-semibold mb-2">
              <Newspaper className="w-4 h-4" />
              MARKET-MOVING NEWS
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">News Feed</h1>
            <p className="text-slate-400 mt-1">
              High-impact headlines pinned on top. (Time window: last {hours} hours)
            </p>
          </div>

          <button
            onClick={fetchNews}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-300 hover:text-white hover:border-cyan-500/40 transition-all disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Controls */}
        <div className="bg-[#020617] border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-slate-300 text-sm font-semibold">
            <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
            Filters
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 text-slate-500" size={18} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search: Fed, CPI, Gold, Nasdaq..."
                className="w-full bg-[#030712] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="bg-[#030712] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500"
            >
              <option className="bg-[#020617]" value={6}>Last 6 hours</option>
              <option className="bg-[#020617]" value={24}>Last 24 hours</option>
              <option className="bg-[#020617]" value={48}>Last 48 hours</option>
              <option className="bg-[#020617]" value={72}>Last 3 days</option>
              <option className="bg-[#020617]" value={168}>Last 7 days</option>
            </select>

            <button
              onClick={() => setHighOnly((v) => !v)}
              className={`px-4 py-3 rounded-xl text-sm font-semibold transition-all border ${
                highOnly
                  ? 'bg-red-500/15 border-red-500/40 text-red-300'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:border-cyan-500/40 hover:text-white'
              }`}
            >
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

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />
            ))}
          </div>
        )}

        {/* News list */}
        {!loading && articles.length > 0 && (
          <div className="space-y-4">
            {articles.map((a) => {
              const isHigh = a.impactScore >= 8;

              return (
                <div
                  key={a.id}
                  className={`bg-[#020617] border rounded-2xl p-5 transition-all ${
                    isHigh
                      ? 'border-red-500/40 shadow-lg shadow-red-500/10'
                      : 'border-white/10 hover:border-cyan-500/40'
                  }`}
                >
                  {isHigh && (
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-red-500/20">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                        High Impact
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${impactBadgeClass(a.impactScore)}`}>
                      Impact {a.impactScore}/10
                    </span>
                    {a.source && (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-white/10 bg-white/5 text-slate-300">
                        {a.source}
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-semibold text-white hover:text-cyan-400 transition-colors">
                    {a.title}
                  </h3>

                  {a.description && (
                    <p className="text-sm text-slate-400 mt-2 line-clamp-2">{a.description}</p>
                  )}

                  <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      {timeAgo(a.publishedAt)}
                    </span>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 px-4 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 rounded-xl text-sm font-semibold text-center hover:bg-cyan-500/20 transition-all"
                    >
                      Read
                    </a>
                    <button
                      onClick={() => alert(`Analyze with AI (next step):\n\n${a.title}`)}
                      className="py-2 px-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl text-sm font-semibold hover:bg-emerald-500/20 transition-all"
                    >
                      Analyze
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
            <p className="text-white font-semibold">No headlines found in this window</p>
            <p className="text-slate-500 mt-1 text-sm">
              Try increasing time range (e.g. last 7 days) or turning off “High impact only”.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}