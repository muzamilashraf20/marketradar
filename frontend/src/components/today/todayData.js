import { authedFetch } from '../../lib/authFetch'

/* Today's data. Every call here is one the app already made before Today
   existed (the old Overview, the Calendar, the landing's record); no endpoint
   is new. Each loader resolves to its card's data or throws, and useLiveData
   turns a throw into that card's own error state. */
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'

async function json(res) {
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// The headline bias. Directions arrive as words (Bullish / Bearish / Neutral).
export async function loadTodayBias() {
  const d = await json(await authedFetch(`${API}/api/today-bias`))
  if (!d.success) throw new Error(d.error || 'today-bias failed')
  const word = String(d.direction || '').toLowerCase()
  const direction = word.includes('bull') ? 'BUY' : word.includes('bear') ? 'SELL' : null
  return {
    has: !!(d.pair && direction),
    reason: d.reason || null,
    pair: d.pair || null,
    direction,
    confidence: typeof d.confidence === 'number' ? d.confidence : null,
    grade: d.tradeGrade && d.tradeGrade !== '-' ? d.tradeGrade : null,
    thesis: d.reasoning || d.bias?.reasoning || '',
    entryTiming: d.bias?.entryTiming || null,
    invalidation: d.bias?.invalidation ?? (typeof d.bias?.levels?.invalidation === 'number' ? d.bias.levels.invalidation : null),
    generatedAt: d.generatedAt || d.bias?.generatedAt || d.updatedAt || null,
    stale: !!d.stale,
    // The backend sends its own threshold, derived from the engine cadence (cycle + cache + 15 min).
    staleAfterMins: Number.isFinite(d.staleAfterMins) ? d.staleAfterMins : 180,
    marketClosed: !!d.marketClosed,
  }
}

export async function loadCompass() {
  const d = await json(await authedFetch(`${API}/api/macro-compass`))
  if (!d.success || !Array.isArray(d.pairs)) throw new Error(d.error || 'macro-compass failed')
  return { pairs: d.pairs, marketClosed: !!d.marketClosed, updatedAt: d.updatedAt || null }
}

/* The calendar, normalised exactly as the Economic Calendar page does it
   (EconomicCalendar.jsx: impact defaults to 'Low', currency comes from
   `country`), and "high impact" means what it means there — impact 'high',
   case-insensitive — so the two pages never disagree about what counts. */
export async function loadUpcomingHighImpact() {
  const data = await json(await fetch(`${API}/api/calendar`))
  if (!Array.isArray(data)) throw new Error('calendar failed')
  return data
    .map(item => ({
      title: item.title || 'Event',
      currency: item.country || 'N/A',
      date: item.date,
      impact: item.impact || 'Low',
      forecast: item.forecast || '-',
      previous: item.previous || '-',
    }))
    .filter(e => e.impact.toLowerCase() === 'high' && e.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
}

export async function loadTopNews() {
  const d = await json(await authedFetch(`${API}/api/news`))
  if (!d.success || !Array.isArray(d.articles)) throw new Error(d.error || 'news failed')
  return [...d.articles].sort((a, b) => (b.impact || 0) - (a.impact || 0))
}

export async function loadClosedCalls() {
  const d = await json(await fetch(`${API}/api/bias-calls?limit=3`))
  if (!d.success || !Array.isArray(d.calls)) throw new Error(d.error || 'bias-calls failed')
  return d.calls.slice(0, 3)
}

/* ── formatting ─────────────────────────────────────────────────────────── */

export const localTime = d => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function localDayTime(d, now) {
  const date = new Date(d)
  const today = new Date(now)
  const tomorrow = new Date(now); tomorrow.setDate(today.getDate() + 1)
  const sameDay = (a, b) => a.toDateString() === b.toDateString()
  const day = sameDay(date, today) ? 'Today' : sameDay(date, tomorrow) ? 'Tomorrow'
    : date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day} ${localTime(date)}`
}

export function ago(iso, now) {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h} h ${mins % 60} min ago`
  const days = Math.floor(h / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function countdown(at, now) {
  const ms = new Date(at).getTime() - now
  if (ms <= 0) return 'now'
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24)
  if (d > 0) return `in ${d}d ${h % 24}h`
  if (h > 0) return `in ${h}h ${m % 60}m`
  return `in ${m}m`
}

export const pairCurrencies = pair => (pair && pair.length === 6 ? [pair.slice(0, 3), pair.slice(3)] : [])
