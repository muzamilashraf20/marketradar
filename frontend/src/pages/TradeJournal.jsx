import { useState, useEffect } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'
import {
  Plus, Trash2, TrendingUp, TrendingDown, Filter,
  Calendar, DollarSign, Target, AlertTriangle, X,
  BarChart3, Award, Flame, Search, ChevronDown, ChevronUp
} from 'lucide-react'

const STORAGE_KEY = 'bf_trade_journal'

const PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD',
  'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'CAD/JPY',
  'XAU/USD', 'XAG/USD', 'NAS100', 'US30', 'S&P500', 'BTC/USD', 'ETH/USD',
]

function loadTrades() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveTrades(trades) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trades))
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  })
}

export default function TradeJournal() {
  const [trades, setTrades] = useState(loadTrades)
  const [showForm, setShowForm] = useState(false)
  const [filterPair, setFilterPair] = useState('All')
  const [filterResult, setFilterResult] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [sortBy, setSortBy] = useState('date') // date, pnl
  const [sortDir, setSortDir] = useState('desc')

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
  })

  useEffect(() => {
    saveTrades(trades)
  }, [trades])

  const resetForm = () => {
    setForm({
      pair: 'EUR/USD', direction: 'LONG', entryPrice: '', exitPrice: '',
      lotSize: '', stopLoss: '', takeProfit: '', pnl: '',
      date: new Date().toISOString().split('T')[0], session: 'London',
      setup: '', notes: '', emotion: 'Calm', rating: 3,
    })
  }

  const handleSubmit = () => {
    const pnlValue = parseFloat(form.pnl) || 0
    const trade = {
      id: Date.now(),
      ...form,
      pnl: pnlValue,
      result: pnlValue > 0 ? 'WIN' : pnlValue < 0 ? 'LOSS' : 'BE',
      createdAt: new Date().toISOString(),
    }
    setTrades(prev => [trade, ...prev])
    resetForm()
    setShowForm(false)
  }

  const deleteTrade = (id) => {
    setTrades(prev => prev.filter(t => t.id !== id))
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
      if (sortBy === 'pnl') {
        return sortDir === 'desc' ? b.pnl - a.pnl : a.pnl - b.pnl
      }
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
    if (currentStreak === 0) {
      streakType = t.result
      currentStreak = 1
    } else if (t.result === streakType) {
      currentStreak++
    } else {
      break
    }
  }

  return (
    <DashboardLayout title="Trade Journal" subtitle="Log trades, track P&L, improve your edge">
      <div className="space-y-5">

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
              {/* Header */}
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

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={!form.pnl}
                  className="w-full py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 text-black text-sm font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Save Trade
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}