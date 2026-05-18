import { useEffect, useState } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'
import {
  Radio, RefreshCw, Search, Filter, AlertTriangle,
  TrendingUp, TrendingDown, Minus, ExternalLink, Loader2
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

/* ───────── Market Movers to track ───────── */
const MOVERS = [
  { id: 'all', name: 'All Movers', avatar: '🌍', color: 'bg-cyan-400/10 text-cyan-400 border-cyan-400/20' },
  { id: 'trump', name: 'Donald Trump', avatar: '🇺🇸', keywords: ['trump', 'tariff', 'tariffs', 'trade war', 'truth social', 'white house', 'president'], color: 'bg-red-400/10 text-red-400 border-red-400/20', role: 'US President', affectedAssets: ['USD', 'Gold', 'S&P500', 'Oil'] },
  { id: 'powell', name: 'Jerome Powell', avatar: '🏦', keywords: ['powell', 'federal reserve', 'fed chair', 'fomc', 'fed rate', 'fed interest', 'fed policy'], color: 'bg-amber-400/10 text-amber-400 border-amber-400/20', role: 'Fed Chair', affectedAssets: ['USD', 'Gold', 'Bonds', 'S&P500'] },
  { id: 'lagarde', name: 'Christine Lagarde', avatar: '🇪🇺', keywords: ['lagarde', 'ecb', 'european central bank', 'ecb rate', 'ecb policy'], color: 'bg-blue-400/10 text-blue-400 border-blue-400/20', role: 'ECB President', affectedAssets: ['EUR', 'EUR/USD', 'DAX'] },
  { id: 'musk', name: 'Elon Musk', avatar: '🚀', keywords: ['elon musk', 'musk', 'tesla', 'spacex', 'doge ', 'x.com', 'twitter'], color: 'bg-purple-400/10 text-purple-400 border-purple-400/20', role: 'Tesla/X CEO', affectedAssets: ['TSLA', 'BTC', 'DOGE'] },
  { id: 'bailey', name: 'Andrew Bailey', avatar: '🇬🇧', keywords: ['bailey', 'bank of england', 'boe rate', 'boe policy', 'boe governor'], color: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20', role: 'BOE Governor', affectedAssets: ['GBP', 'GBP/USD', 'FTSE'] },
  { id: 'ueda', name: 'Kazuo Ueda', avatar: '🇯🇵', keywords: ['ueda', 'bank of japan', 'boj rate', 'boj policy', 'boj governor'], color: 'bg-pink-400/10 text-pink-400 border-pink-400/20', role: 'BOJ Governor', affectedAssets: ['JPY', 'USD/JPY', 'Nikkei'] },
]

function timeAgo(dateString) {
  const diff = new Date() - new Date(dateString)
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  if (m > 0) return `${m}m ago`
  return 'Just now'
}

function matchMover(article) {
  const text = `${article.title} ${article.summary}`.toLowerCase()
  for (const mover of MOVERS) {
    if (mover.id === 'all') continue
    if (mover.keywords?.some(kw => text.includes(kw))) {
      return mover
    }
  }
  return null
}

export default function MarketMoversRadar() {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchNews()
  }, [])

  const fetchNews = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await fetch(`${API_BASE}/api/news`)
      const data = await res.json()
      if (data.success) {
        // Match each article to a mover
        const matched = (data.articles || [])
          .map(article => {
            const mover = matchMover(article)
            if (!mover) return null
            return { ...article, mover }
          })
          .filter(Boolean)
          .sort((a, b) => {
            // Sort by impact then time
            if ((b.impact || 0) !== (a.impact || 0)) return (b.impact || 0) - (a.impact || 0)
            return new Date(b.publishedAt) - new Date(a.publishedAt)
          })
        setArticles(matched)
      } else {
        setError('Failed to fetch news')
      }
    } catch (e) {
      console.error('MarketMovers fetch error:', e)
      setError('Failed to connect to news API')
    } finally {
      setLoading(false)
    }
  }

  // Filtered articles
  const filtered = articles.filter(a => {
    const matchFilter = activeFilter === 'all' || a.mover.id === activeFilter
    const matchSearch = !searchQuery.trim() || 
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.mover.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchFilter && matchSearch
  })

  // Stats
  const totalMatched = articles.length
  const highImpact = articles.filter(a => (a.impact || 0) >= 8).length
  const moverCounts = {}
  articles.forEach(a => {
    moverCounts[a.mover.id] = (moverCounts[a.mover.id] || 0) + 1
  })
  const topMover = Object.entries(moverCounts).sort((a, b) => b[1] - a[1])[0]

  return (
    <DashboardLayout title="MarketMovers Radar" subtitle="Track powerful voices that move markets">
      <div className="space-y-5">

        {/* Live Alert Banner */}
        <div className="bg-cyan-500/[0.06] border border-cyan-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.6)] animate-pulse shrink-0" />
          <span className="text-xs font-semibold text-cyan-400">LIVE MONITORING</span>
          <span className="text-xs text-slate-500">— Tracking statements from world leaders, central bankers & market movers</span>
          <button
            onClick={fetchNews}
            className="ml-auto text-slate-500 hover:text-cyan-400 transition-colors shrink-0"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl p-4 border bg-white/[0.03] border-white/10 text-center">
            <div className="text-xl font-bold font-mono text-white">{totalMatched}</div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Matched Articles</div>
          </div>
          <div className="rounded-xl p-4 border bg-red-500/10 border-red-500/20 text-center">
            <div className="text-xl font-bold font-mono text-red-400">{highImpact}</div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">High Impact</div>
          </div>
          <div className="rounded-xl p-4 border bg-cyan-500/10 border-cyan-500/20 text-center">
            <div className="text-xl font-bold font-mono text-cyan-400">{Object.keys(moverCounts).length}</div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Active Movers</div>
          </div>
          <div className="rounded-xl p-4 border bg-amber-500/10 border-amber-500/20 text-center">
            <div className="text-sm font-bold font-mono text-amber-400 truncate">
              {topMover ? MOVERS.find(m => m.id === topMover[0])?.name || '—' : '—'}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Top Mover Today</div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search news or mover..."
              className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-slate-600 outline-none focus:border-cyan-500/30 transition-colors"
            />
          </div>

          {/* Mover Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {MOVERS.map(mover => {
              const isActive = activeFilter === mover.id
              const count = mover.id === 'all' ? totalMatched : (moverCounts[mover.id] || 0)
              return (
                <button
                  key={mover.id}
                  onClick={() => setActiveFilter(mover.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap transition-all shrink-0 ${
                    isActive
                      ? mover.color + ' border-current'
                      : 'bg-white/5 text-slate-500 border-white/10 hover:border-white/20'
                  }`}
                >
                  <span>{mover.avatar}</span>
                  <span className="hidden sm:inline">{mover.id === 'all' ? 'All' : mover.name.split(' ').pop()}</span>
                  {count > 0 && (
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                      isActive ? 'bg-white/10' : 'bg-white/5'
                    }`}>{count}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-12 text-center">
            <Loader2 size={24} className="text-cyan-400 animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-400">Scanning news for market-moving statements...</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
            <AlertTriangle size={20} className="text-red-400 mx-auto mb-2" />
            <p className="text-xs text-red-400">{error}</p>
            <button onClick={fetchNews} className="mt-3 text-xs text-slate-400 hover:text-white transition-colors">
              Try again
            </button>
          </div>
        )}

        {/* No Results */}
        {!loading && !error && filtered.length === 0 && (
          <div className="bg-white/[0.03] border border-dashed border-white/10 rounded-xl p-10 text-center">
            <Radio size={24} className="text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-400 mb-1">No market-moving statements found</h3>
            <p className="text-xs text-slate-600 max-w-sm mx-auto">
              {activeFilter !== 'all'
                ? `No recent news about ${MOVERS.find(m => m.id === activeFilter)?.name}. Try "All Movers" filter.`
                : 'No news from tracked leaders right now. Check back soon — markets never sleep.'
              }
            </p>
          </div>
        )}

        {/* Articles */}
        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((article, i) => {
              const mover = article.mover
              const score = article.impact || 5
              const impactLabel = score >= 8 ? 'HIGH' : score >= 5 ? 'MED' : 'LOW'
              const impactBorder = score >= 8
                ? 'border-l-red-400'
                : score >= 5
                ? 'border-l-amber-400'
                : 'border-l-slate-500'
              const impactBadge = score >= 8
                ? 'text-red-400 bg-red-500/10 border-red-500/20'
                : score >= 5
                ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                : 'text-slate-400 bg-white/5 border-white/10'
              const biasIcon = article.bias === 'bullish'
                ? TrendingUp
                : article.bias === 'bearish'
                ? TrendingDown
                : Minus
              const biasColor = article.bias === 'bullish'
                ? 'text-emerald-400'
                : article.bias === 'bearish'
                ? 'text-red-400'
                : 'text-slate-400'
              const BiasIcon = biasIcon

              return (
                <div
                  key={i}
                  className={`bg-white/[0.03] border border-white/10 border-l-2 ${impactBorder} rounded-xl p-4 hover:border-white/15 transition-all`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0 border ${mover.color}`}>
                        {mover.avatar}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{mover.name}</span>
                          <span className="text-[10px] text-slate-600">{mover.role}</span>
                        </div>
                        <div className="text-[10px] text-slate-600 mt-0.5">
                          {article.source} · {timeAgo(article.publishedAt)}
                        </div>
                      </div>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-1 rounded border shrink-0 ${impactBadge}`}>
                      {impactLabel} IMPACT
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="text-sm text-slate-200 font-medium leading-relaxed mb-3">
                    {article.title}
                  </h3>

                  {/* AI One-liner / Market Impact */}
                  {article.oneliner && (
                    <div className={`${biasColor} bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2 mb-3 flex items-center gap-2`}>
                      <BiasIcon size={13} className={biasColor} />
                      <span className="text-xs font-medium">{article.oneliner}</span>
                    </div>
                  )}

                  {/* Bottom: Tags + Affected Assets + Link */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Market Tags */}
                      {article.marketTags?.slice(0, 3).map((tag, ti) => (
                        <span key={ti} className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                      {/* Affected Assets from mover */}
                      {(!article.marketTags || article.marketTags.length === 0) && mover.affectedAssets?.slice(0, 3).map((asset, ai) => (
                        <span key={ai} className="text-[10px] font-mono text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded">
                          {asset}
                        </span>
                      ))}
                    </div>

                    {article.url && (
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-slate-600 hover:text-cyan-400 transition-colors flex items-center gap-1"
                      >
                        Read source <ExternalLink size={10} />
                      </a>
                    )}
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