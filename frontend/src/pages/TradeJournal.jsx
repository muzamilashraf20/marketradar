import TradeAnalytics from '../components/dashboard/TradeAnalytics'
import { useState, useEffect, useRef } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import {
  Plus, Trash2, TrendingUp, TrendingDown, Filter,
  Calendar, DollarSign, Target, AlertTriangle, X,
  BarChart3, Award, Flame, Search, ChevronDown, ChevronUp,
  Image, Link, ExternalLink, Camera, Eye, Loader2, CloudOff, Cloud
} from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD',
  'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'CAD/JPY',
  'XAU/USD', 'XAG/USD', 'NAS100', 'US30', 'S&P500', 'BTC/USD', 'ETH/USD',
]

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// Image to base64 converter
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Compress image before storing
async function compressImage(file, maxWidth = 800, quality = 0.6) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new window.Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1)
        canvas.width = img.width * ratio
        canvas.height = img.height * ratio
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

// Lightbox component
function Lightbox({ src, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <button className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors">
        <X size={24} />
      </button>
      <img
        src={src}
        alt="Chart screenshot"
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

// Screenshot upload field component
function ScreenshotField({ label, imageKey, linkKey, form, setForm }) {
  const fileRef = useRef()

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert('Image too large. Max 5MB.')
      return
    }
    // Compress image to reduce size
    const compressed = await compressImage(file)
    setForm(prev => ({ ...prev, [imageKey]: compressed }))
  }

  const removeImage = () => {
    setForm(prev => ({ ...prev, [imageKey]: '' }))
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      <label className="text-[10px] text-slate-500 uppercase tracking-wider block">{label}</label>

      {/* TradingView Link */}
      <div className="relative">
        <Link size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
        <input
          type="url"
          value={form[linkKey]}
          onChange={e => setForm(prev => ({ ...prev, [linkKey]: e.target.value }))}
          placeholder="https://www.tradingview.com/chart/..."
          className="w-full pl-8 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-slate-700 outline-none focus:border-cyan-500/30 transition-colors"
        />
      </div>

      {/* Image Upload */}
      {form[imageKey] ? (
        <div className="relative group rounded-lg overflow-hidden border border-white/10">
          <img
            src={form[imageKey]}
            alt={label}
            className="w-full h-28 object-cover"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              onClick={removeImage}
              className="p-1.5 bg-red-500/80 rounded-lg text-white hover:bg-red-500 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full h-16 border border-dashed border-white/10 rounded-lg flex items-center justify-center gap-2 text-slate-600 hover:text-slate-400 hover:border-white/20 transition-all text-xs"
        >
          <Camera size={14} />
          Upload Screenshot
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  )
}

export default function TradeJournal() {
  const { user } = useAuth()
  const [trades, setTrades] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [filterPair, setFilterPair] = useState('All')
  const [filterResult, setFilterResult] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [sortBy, setSortBy] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const [lightboxSrc, setLightboxSrc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [form, setForm] = useState({
    pair: 'EUR/USD',
    direction: 'LONG',
    entryPrice: '',
    exitPrice: '',
    lotSize: '',
    stopLoss: '',
    takeProfit: '',
    pnl: '',
    date: new Date().toISOString().split('T')[0],
    session: 'London',
    setup: '',
    notes: '',
    emotion: 'Calm',
    rating: 3,
    beforeImage: '',
    beforeLink: '',
    afterImage: '',
    afterLink: '',
  })

  // Fetch trades from API
  const fetchTrades = async () => {
    if (!user?.token) { setLoading(false); return }
    try {
      const res = await fetch(`${API_URL}/api/trades`, {
        headers: { 'Authorization': `Bearer ${user.token}` }
      })
      const data = await res.json()
      if (data.success) {
        // Map snake_case DB fields to camelCase for frontend
        const mapped = data.trades.map(t => ({
          id: t.id,
          pair: t.pair,
          direction: t.direction,
          entryPrice: t.entry_price || '',
          exitPrice: t.exit_price || '',
          lotSize: t.lot_size || '',
          stopLoss: t.stop_loss || '',
          takeProfit: t.take_profit || '',
          pnl: t.pnl,
          result: t.result,
          date: t.date,
          session: t.session || '',
          setup: t.setup || '',
          notes: t.notes || '',
          emotion: t.emotion || 'Calm',
          rating: t.rating || 3,
          beforeImage: t.before_image || '',
          beforeLink: t.before_link || '',
          afterImage: t.after_image || '',
          afterLink: t.after_link || '',
          createdAt: t.created_at,
        }))
        setTrades(mapped)
      }
    } catch (e) {
      setError('Failed to load trades')
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchTrades()
  }, [user])

  const resetForm = () => {
    setForm({
      pair: 'EUR/USD', direction: 'LONG', entryPrice: '', exitPrice: '',
      lotSize: '', stopLoss: '', takeProfit: '', pnl: '',
      date: new Date().toISOString().split('T')[0], session: 'London',
      setup: '', notes: '', emotion: 'Calm', rating: 3,
      beforeImage: '', beforeLink: '', afterImage: '', afterLink: '',
    })
  }

  const handleSubmit = async () => {
    if (!user?.token) { setError('Please log in to save trades'); return }
    setSaving(true)
    setError('')

    const pnlValue = parseFloat(form.pnl) || 0
    const tradeData = {
      ...form,
      pnl: pnlValue,
      result: pnlValue > 0 ? 'WIN' : pnlValue < 0 ? 'LOSS' : 'BE',
    }

    try {
      const res = await fetch(`${API_URL}/api/trades`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`,
        },
        body: JSON.stringify(tradeData),
      })
      const data = await res.json()
      if (data.success) {
        await fetchTrades()
        resetForm()
        setShowForm(false)
      } else {
        setError(data.error || 'Failed to save trade')
      }
    } catch (e) {
      setError('Could not connect to server')
    }
    setSaving(false)
  }

  const deleteTrade = async (id) => {
    if (!user?.token) return
    try {
      const res = await fetch(`${API_URL}/api/trades/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${user.token}` },
      })
      const data = await res.json()
      if (data.success) {
        setTrades(prev => prev.filter(t => t.id !== id))
      }
    } catch (e) {
      setError('Failed to delete trade')
    }
  }

  // Filtered & sorted trades
  const filtered = trades
    .filter(t => filterPair === 'All' || t.pair === filterPair)
    .filter(t => filterResult === 'All' || t.result === filterResult)
    .filter(t => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return t.pair.toLowerCase().includes(q) ||
        t.setup?.toLowerCase().includes(q) ||
        t.notes?.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (sortBy === 'pnl') return sortDir === 'desc' ? b.pnl - a.pnl : a.pnl - b.pnl
      return sortDir === 'desc'
        ? new Date(b.date) - new Date(a.date)
        : new Date(a.date) - new Date(b.date)
    })

  // Stats
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0)
  const wins = trades.filter(t => t.result === 'WIN').length
  const losses = trades.filter(t => t.result === 'LOSS').length
  const winRate = trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0
  const bestTrade = trades.length > 0 ? Math.max(...trades.map(t => t.pnl)) : 0
  const worstTrade = trades.length > 0 ? Math.min(...trades.map(t => t.pnl)) : 0
  const avgWin = wins > 0 ? trades.filter(t => t.result === 'WIN').reduce((s, t) => s + t.pnl, 0) / wins : 0
  const avgLoss = losses > 0 ? trades.filter(t => t.result === 'LOSS').reduce((s, t) => s + t.pnl, 0) / losses : 0

  // Streak
  let currentStreak = 0
  let streakType = ''
  for (const t of trades) {
    if (currentStreak === 0) { streakType = t.result; currentStreak = 1 }
    else if (t.result === streakType) { currentStreak++ }
    else { break }
  }

  // Check if a trade has any chart data
  const hasChartData = (trade) =>
    trade.beforeImage || trade.beforeLink || trade.afterImage || trade.afterLink

  if (loading) {
    return (
      <DashboardLayout title="Trade Journal" subtitle="Log trades, track P&L, improve your edge">
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="text-cyan-400 animate-spin" />
          <span className="text-slate-400 text-sm ml-3">Loading trades...</span>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title="Trade Journal" subtitle="Log trades, track P&L, improve your edge">
      <div className="space-y-5">

        {/* Cloud sync indicator */}
        <div className="flex items-center gap-2 text-[10px] text-emerald-400/60">
          <Cloud size={12} />
          <span>Synced to cloud — your trades are saved across all devices</span>
        </div>

        {/* Error banner */}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400/60 hover:text-red-400"><X size={14} /></button>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className={`rounded-xl p-4 border text-center ${totalPnl >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
            <div className={`text-xl font-bold font-mono ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Total P&L ($)</div>
          </div>
          <div className="rounded-xl p-4 border bg-cyan-500/10 border-cyan-500/20 text-center">
            <div className="text-xl font-bold font-mono text-cyan-400">{winRate}%</div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Win Rate ({wins}W / {losses}L)</div>
          </div>
          <div className="rounded-xl p-4 border bg-white/[0.03] border-white/10 text-center">
            <div className="text-xl font-bold font-mono text-white">{trades.length}</div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Total Trades</div>
          </div>
          <div className={`rounded-xl p-4 border text-center ${
            streakType === 'WIN' ? 'bg-emerald-500/10 border-emerald-500/20' :
            streakType === 'LOSS' ? 'bg-red-500/10 border-red-500/20' :
            'bg-white/[0.03] border-white/10'
          }`}>
            <div className={`text-xl font-bold font-mono ${
              streakType === 'WIN' ? 'text-emerald-400' : streakType === 'LOSS' ? 'text-red-400' : 'text-slate-400'
            }`}>
              {currentStreak > 0 ? `${currentStreak} ${streakType}` : '—'}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Current Streak</div>
          </div>
        </div>

        {/* Extra Stats Row */}
        {trades.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl p-3 border bg-white/[0.02] border-white/5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Award size={14} className="text-emerald-400" />
              </div>
              <div>
                <div className="text-xs font-bold font-mono text-emerald-400">+{bestTrade.toFixed(2)}</div>
                <div className="text-[10px] text-slate-600">Best Trade</div>
              </div>
            </div>
            <div className="rounded-xl p-3 border bg-white/[0.02] border-white/5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <AlertTriangle size={14} className="text-red-400" />
              </div>
              <div>
                <div className="text-xs font-bold font-mono text-red-400">{worstTrade.toFixed(2)}</div>
                <div className="text-[10px] text-slate-600">Worst Trade</div>
              </div>
            </div>
            <div className="rounded-xl p-3 border bg-white/[0.02] border-white/5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <TrendingUp size={14} className="text-cyan-400" />
              </div>
              <div>
                <div className="text-xs font-bold font-mono text-cyan-400">+{avgWin.toFixed(2)}</div>
                <div className="text-[10px] text-slate-600">Avg Win</div>
              </div>
            </div>
            <div className="rounded-xl p-3 border bg-white/[0.02] border-white/5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <TrendingDown size={14} className="text-amber-400" />
              </div>
              <div>
                <div className="text-xs font-bold font-mono text-amber-400">{avgLoss.toFixed(2)}</div>
                <div className="text-[10px] text-slate-600">Avg Loss</div>
              </div>
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 text-black text-xs font-bold rounded-xl hover:opacity-90 transition-all"
          >
            <Plus size={14} />
            Log Trade
          </button>

          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search trades..."
              className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-slate-600 outline-none focus:border-cyan-500/30 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterPair}
              onChange={(e) => setFilterPair(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-slate-300 outline-none"
            >
              <option value="All">All Pairs</option>
              {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select
              value={filterResult}
              onChange={(e) => setFilterResult(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs text-slate-300 outline-none"
            >
              <option value="All">All Results</option>
              <option value="WIN">Wins</option>
              <option value="LOSS">Losses</option>
              <option value="BE">Breakeven</option>
            </select>
            <button
              onClick={() => {
                if (sortBy === 'date') { setSortBy('pnl') }
                else { setSortBy('date'); setSortDir(sortDir === 'desc' ? 'asc' : 'desc') }
              }}
              className="flex items-center gap-1 px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-400 hover:text-white transition-colors"
            >
              <Filter size={12} />
              {sortBy === 'date' ? 'Date' : 'P&L'}
              {sortDir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
            </button>
          </div>
        </div>
{/* ── Analytics Section ── */}
            {trades.length > 0 && (
              <TradeAnalytics trades={trades} />
            )}
        {/* Trade List */}
        {filtered.length === 0 && !showForm && (
          <div className="bg-white/[0.03] border border-dashed border-white/10 rounded-xl p-10 text-center">
            <BarChart3 size={28} className="text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-400 mb-1">
              {trades.length === 0 ? 'No trades logged yet' : 'No trades match your filters'}
            </h3>
            <p className="text-xs text-slate-600 max-w-sm mx-auto mb-4">
              {trades.length === 0
                ? 'Start logging your trades to track performance, identify patterns, and improve your edge.'
                : 'Try changing your filters or search query.'}
            </p>
            {trades.length === 0 && (
              <button
                onClick={() => setShowForm(true)}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-500 text-black text-xs font-bold rounded-xl hover:opacity-90 transition-all"
              >
                Log Your First Trade
              </button>
            )}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map(trade => {
              const isExpanded = expandedId === trade.id
              const resultColor = trade.result === 'WIN'
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : trade.result === 'LOSS'
                ? 'text-red-400 bg-red-500/10 border-red-500/20'
                : 'text-slate-400 bg-white/5 border-white/10'
              const dirColor = trade.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400'
              const borderLeft = trade.result === 'WIN'
                ? 'border-l-emerald-400'
                : trade.result === 'LOSS'
                ? 'border-l-red-400'
                : 'border-l-slate-500'

              return (
                <div key={trade.id} className={`bg-white/[0.03] border border-white/10 border-l-2 ${borderLeft} rounded-xl overflow-hidden`}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : trade.id)}
                    className="w-full flex items-center gap-3 p-4 text-left"
                  >
                    <div className="min-w-[60px]">
                      <div className="text-sm font-bold font-mono text-white">{trade.pair}</div>
                      <div className={`text-[10px] font-bold ${dirColor}`}>{trade.direction}</div>
                    </div>
                    <div className="flex-1 hidden sm:block">
                      <div className="text-[10px] text-slate-600">{formatDate(trade.date)} · {trade.session}</div>
                      {trade.setup && <div className="text-xs text-slate-400 truncate mt-0.5">{trade.setup}</div>}
                    </div>

                    {hasChartData(trade) && (
                      <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                        <Camera size={10} className="text-cyan-400" />
                        <span className="text-[9px] text-cyan-400 font-bold">CHARTS</span>
                      </div>
                    )}

                    <div className={`text-sm font-bold font-mono ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)}
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-1 rounded border ${resultColor}`}>
                      {trade.result}
                    </span>
                    <div className="text-slate-600 shrink-0">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
                      <div className="sm:hidden text-[10px] text-slate-600 mb-2">
                        {formatDate(trade.date)} · {trade.session}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {trade.entryPrice && (
                          <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2 text-center">
                            <div className="text-[10px] text-slate-600">Entry</div>
                            <div className="text-xs font-mono text-white">{trade.entryPrice}</div>
                          </div>
                        )}
                        {trade.exitPrice && (
                          <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2 text-center">
                            <div className="text-[10px] text-slate-600">Exit</div>
                            <div className="text-xs font-mono text-white">{trade.exitPrice}</div>
                          </div>
                        )}
                        {trade.lotSize && (
                          <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2 text-center">
                            <div className="text-[10px] text-slate-600">Lot Size</div>
                            <div className="text-xs font-mono text-white">{trade.lotSize}</div>
                          </div>
                        )}
                        {trade.stopLoss && (
                          <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2 text-center">
                            <div className="text-[10px] text-slate-600">SL</div>
                            <div className="text-xs font-mono text-red-400">{trade.stopLoss}</div>
                          </div>
                        )}
                      </div>

                      {hasChartData(trade) && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Camera size={12} className="text-cyan-400" />
                            <span className="text-[10px] text-cyan-400 uppercase tracking-wider font-semibold">Chart Screenshots</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {(trade.beforeImage || trade.beforeLink) && (
                              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">📊 Before Trade</span>
                                  {trade.beforeLink && (
                                    <a href={trade.beforeLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-[9px] text-cyan-400 hover:text-cyan-300 transition-colors">
                                      <ExternalLink size={9} /> TradingView
                                    </a>
                                  )}
                                </div>
                                {trade.beforeImage && (
                                  <button onClick={(e) => { e.stopPropagation(); setLightboxSrc(trade.beforeImage) }} className="relative group w-full rounded-lg overflow-hidden border border-white/5">
                                    <img src={trade.beforeImage} alt="Before trade chart" className="w-full h-32 object-cover" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                      <Eye size={20} className="text-white" />
                                    </div>
                                  </button>
                                )}
                                {!trade.beforeImage && trade.beforeLink && (
                                  <a href={trade.beforeLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-2 p-2 bg-cyan-500/5 border border-cyan-500/10 rounded-lg text-xs text-cyan-400 hover:bg-cyan-500/10 transition-colors">
                                    <Link size={11} /> Open Chart
                                  </a>
                                )}
                              </div>
                            )}
                            {(trade.afterImage || trade.afterLink) && (
                              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">📈 After Trade</span>
                                  {trade.afterLink && (
                                    <a href={trade.afterLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-[9px] text-cyan-400 hover:text-cyan-300 transition-colors">
                                      <ExternalLink size={9} /> TradingView
                                    </a>
                                  )}
                                </div>
                                {trade.afterImage && (
                                  <button onClick={(e) => { e.stopPropagation(); setLightboxSrc(trade.afterImage) }} className="relative group w-full rounded-lg overflow-hidden border border-white/5">
                                    <img src={trade.afterImage} alt="After trade chart" className="w-full h-32 object-cover" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                      <Eye size={20} className="text-white" />
                                    </div>
                                  </button>
                                )}
                                {!trade.afterImage && trade.afterLink && (
                                  <a href={trade.afterLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-2 p-2 bg-cyan-500/5 border border-cyan-500/10 rounded-lg text-xs text-cyan-400 hover:bg-cyan-500/10 transition-colors">
                                    <Link size={11} /> Open Chart
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {trade.notes && (
                        <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                          <div className="text-[10px] text-slate-600 mb-1">Notes</div>
                          <p className="text-xs text-slate-400 leading-relaxed">{trade.notes}</p>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-600">Emotion: {trade.emotion}</span>
                          <span className="text-[10px] text-slate-600">·</span>
                          <span className="text-[10px] text-amber-400">
                            {'★'.repeat(trade.rating)}{'☆'.repeat(5 - trade.rating)}
                          </span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteTrade(trade.id) }}
                          className="text-slate-600 hover:text-red-400 transition-colors p-1"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Add Trade Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />
            <div className="relative w-full max-w-lg bg-[#0a1628] border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-[#0a1628] z-10">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Plus size={16} className="text-cyan-400" />
                  Log New Trade
                </h3>
                <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Row 1: Pair + Direction */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Pair</label>
                    <select
                      value={form.pair}
                      onChange={e => setForm({ ...form, pair: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-500/30"
                    >
                      {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Direction</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setForm({ ...form, direction: 'LONG' })}
                        className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
                          form.direction === 'LONG'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-white/5 text-slate-500 border border-white/10'
                        }`}
                      >↑ LONG</button>
                      <button
                        onClick={() => setForm({ ...form, direction: 'SHORT' })}
                        className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
                          form.direction === 'SHORT'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-white/5 text-slate-500 border border-white/10'
                        }`}
                      >↓ SHORT</button>
                    </div>
                  </div>
                </div>

                {/* Row 2: Entry + Exit + Lot */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: 'entryPrice', label: 'Entry Price' },
                    { key: 'exitPrice', label: 'Exit Price' },
                    { key: 'lotSize', label: 'Lot Size' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">{f.label}</label>
                      <input
                        type="number"
                        step="any"
                        value={form[f.key]}
                        onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-500/30"
                        placeholder="0.00"
                      />
                    </div>
                  ))}
                </div>

                {/* Row 3: SL + TP + P&L */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Stop Loss</label>
                    <input
                      type="number"
                      step="any"
                      value={form.stopLoss}
                      onChange={e => setForm({ ...form, stopLoss: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-500/30"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Take Profit</label>
                    <input
                      type="number"
                      step="any"
                      value={form.takeProfit}
                      onChange={e => setForm({ ...form, takeProfit: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-500/30"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-red-400/80 uppercase tracking-wider mb-1 block font-semibold">P&L ($) *</label>
                    <input
                      type="number"
                      step="any"
                      value={form.pnl}
                      onChange={e => setForm({ ...form, pnl: e.target.value })}
                      className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-500/30"
                      placeholder="+50 or -30"
                      required
                    />
                  </div>
                </div>
{/* Tags */}
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Tags</label>
                  <div className="flex flex-wrap gap-1.5">
                    {['A+ Setup', 'News Trade', 'Trend Follow', 'Reversal', 'Scalp', 'Revenge Trade', 'FOMO'].map(tag => (
                      <button key={tag} type="button"
                        onClick={() => {
                          const current = form.tags || []
                          setForm({...form, tags: current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]})
                        }}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                          (form.tags || []).includes(tag)
                            ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
                            : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >{tag}</button>
                    ))}
                  </div>
                </div>
                {/* Row 4: Date + Session */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Date</label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={e => setForm({ ...form, date: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-500/30"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Session</label>
                    <select
                      value={form.session}
                      onChange={e => setForm({ ...form, session: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-500/30"
                    >
                      {['Tokyo', 'London', 'New York', 'Sydney'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 5: Setup */}
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Setup / Strategy</label>
                  <input
                    type="text"
                    value={form.setup}
                    onChange={e => setForm({ ...form, setup: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-500/30"
                    placeholder="e.g. London breakout, OB + FVG, Supply zone..."
                  />
                </div>

                {/* Row 6: Notes */}
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-500/30 resize-none"
                    placeholder="What went well? What could improve?"
                  />
                </div>

                {/* BEFORE / AFTER CHARTS */}
                <div className="border border-cyan-500/10 rounded-xl p-4 bg-cyan-500/[0.02] space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Camera size={13} className="text-cyan-400" />
                    <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">Chart Screenshots</span>
                    <span className="text-[9px] text-slate-600 ml-1">(Optional)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ScreenshotField
                      label="📊 Before Trade"
                      imageKey="beforeImage"
                      linkKey="beforeLink"
                      form={form}
                      setForm={setForm}
                    />
                    <ScreenshotField
                      label="📈 After Trade"
                      imageKey="afterImage"
                      linkKey="afterLink"
                      form={form}
                      setForm={setForm}
                    />
                  </div>
                </div>

                {/* Row 7: Emotion + Rating */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Emotion</label>
                    <select
                      value={form.emotion}
                      onChange={e => setForm({ ...form, emotion: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-500/30"
                    >
                      {['Calm', 'Confident', 'Anxious', 'FOMO', 'Revenge', 'Greedy', 'Patient', 'Frustrated'].map(e => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Trade Rating</label>
                    <div className="flex gap-1 mt-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          onClick={() => setForm({ ...form, rating: star })}
                          className={`text-lg transition-colors ${
                            star <= form.rating ? 'text-amber-400' : 'text-slate-700'
                          }`}
                        >★</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Error in modal */}
                {error && (
                  <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={!form.pnl || saving}
                  className="w-full py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 text-black text-sm font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Trade'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

    </DashboardLayout>
  )
}