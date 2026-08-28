import 'dotenv/config'
import crypto from 'crypto'
import express from 'express'
import {
  MONTH_NAMES, parseEconNum, parseReleaseValue, normalizePeriod,
  expectedPeriodFor, nextReleaseAfter, momPercent, leadConsensus, validateReleaseResult, validateReleaseValue, surpriseOf,
} from './lib/releaseValue.js'
import { withBudget } from './lib/withBudget.js'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import Anthropic from '@anthropic-ai/sdk'
import Parser from 'rss-parser'
import * as XLSX from 'xlsx'
import { Resend } from 'resend'
import { runEngine as runEngineV2, CONFIG as V2_CONFIG, isInvalidated, pipFor as v2PipFor, invalidationLevel as v2InvalidationLevel } from './biasEngineV2/biasEngine.js'

const app = express()
const rssParser = new Parser()

app.use(cors({
origin: ['http://localhost:5173', 'http://localhost:5174', 'https://www.biasforge.co', 'https://biasforge.co', 'https://marketradar-taupe.vercel.app'],
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const LS_API_KEY = process.env.LEMONSQUEEZY_API_KEY
const LS_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev'
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TG_API = TG_TOKEN ? `https://api.telegram.org/bot${TG_TOKEN}` : null
const TG_CHANNEL = process.env.TG_CHANNEL || '@biasforgeofficial'  // public broadcast channel

// ============================================
// 🔄 CACHE SYSTEM
// ============================================
const API_CACHE = {}
const CACHE_TTL = 10 * 60 * 1000
function getCached(key) { const e = API_CACHE[key]; return e ? e.data : null }
function isCacheFresh(key) { const e = API_CACHE[key]; return e ? Date.now() - e.timestamp < CACHE_TTL : false }
function setCache(key, data) { API_CACHE[key] = { data, timestamp: Date.now() } }
function isCacheFreshFor(key, ttlMs) { const e = API_CACHE[key]; return e ? Date.now() - e.timestamp < ttlMs : false }

// ============================================
// ⏳ GLOBAL TwelveData RATE LIMITER (shared by v1 + v2)
// Basic-8 plan = 8 credits/min, billed PER SYMBOL. A burst (e.g. a 12-symbol batch, or v1+v2
// firing together) exceeds 8/min and 429s. This is a sliding-window credit budget with headroom
// under 8; acquisitions are serialized (FIFO) so the window accounting is race-free. Callers
// `await tdAcquire(nSymbols)` before every TwelveData request. A run may take a few minutes —
// there's no real-time requirement here.
// ============================================
const TD_CAP = 7                  // max credits per rolling 60s (1 credit of headroom under 8)
const TD_WINDOW = 60 * 1000
const _tdLog = []                 // [{ t, credits }] consumed within the window
let _tdChain = Promise.resolve()  // serialize acquisitions
async function _tdReserve(credits) {
  credits = Math.min(TD_CAP, Math.max(1, credits | 0))
  for (;;) {
    const now = Date.now()
    while (_tdLog.length && now - _tdLog[0].t >= TD_WINDOW) _tdLog.shift()
    const used = _tdLog.reduce((s, x) => s + x.credits, 0)
    if (used + credits <= TD_CAP) { _tdLog.push({ t: now, credits }); return }
    const waitMs = Math.min(TD_WINDOW, TD_WINDOW - (now - _tdLog[0].t) + 50)
    await new Promise(r => setTimeout(r, waitMs))
  }
}
// Acquire N credits (≈ N symbols) before a TwelveData call; resolves when within budget.
function tdAcquire(credits = 1) {
  const p = _tdChain.then(() => _tdReserve(credits))
  _tdChain = p.catch(() => {})   // keep the chain alive even if a caller rejects
  return p
}

// ============================================
// 📅 SHARED ECONOMIC CALENDAR (ForexFactory feed)
// Finnhub /calendar/economic is premium-only now — FF feed is free.
// Normalized shape: { event, country (currency code), time (ISO), impact, forecast, previous }
// 10-min cache + stale fallback (FF rate-limits aggressively)
// ============================================
const FF_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'Accept': 'application/json' }
// FF nextweek.json is dead (404) — FF free feed only reliably serves thisweek. Used as FALLBACK only.
const FF_FEEDS = [
  { name: 'thisweek', url: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json' }
]
// Fetch a single FF feed with retry. 404 = dead URL → skip immediately (no retry). Returns [] on failure.
async function fetchFFFeed(feed) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await axios.get(feed.url, { headers: FF_HEADERS, timeout: 12000 })
      const arr = Array.isArray(r.data) ? r.data : (Array.isArray(r.data?.events) ? r.data.events : null)
      if (!arr) throw new Error('unexpected shape')
      console.log(`📅 FF ${feed.name}: ${arr.length} events loaded`)
      return arr
    } catch (e) {
      const status = e?.response?.status
      console.error(`⚠️ FF ${feed.name} attempt ${attempt} failed: ${status || ''} ${e?.message}`)
      if (status === 404 || status === 429) break // 404 = dead URL; 429 = rate-limited, an instant retry only makes the CDN angrier
      if (attempt < 2) await new Promise(r => setTimeout(r, 1500))
    }
  }
  console.error(`❌ FF ${feed.name}: skipped`)
  return []
}

// ── FMP economic calendar (PRIMARY): forward-looking, date-range, works on weekends ──
// Docs: https://financialmodelingprep.com/stable/economic-calendar  (free tier 250 req/day, UTC times)
const FMP_KEY = process.env.FMP_API_KEY
const MAJOR_CCY = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'CNY']
const CCY_FROM_COUNTRY = { US: 'USD', EU: 'EUR', EA: 'EUR', EMU: 'EUR', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', GB: 'GBP', UK: 'GBP', JP: 'JPY', AU: 'AUD', CA: 'CAD', CH: 'CHF', NZ: 'NZD', CN: 'CNY' }
function normImpact(v) { const s = String(v || '').toLowerCase(); return s === 'high' ? 'High' : s === 'medium' ? 'Medium' : s === 'low' ? 'Low' : 'Low' }
function parseFMPDate(d) {
  if (!d) return null
  let s = String(d).trim()
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s).toISOString() // already has tz
  return new Date(s.replace(' ', 'T') + 'Z').toISOString()                 // "YYYY-MM-DD HH:mm:ss" = UTC
}
function normFMPEvents(rows, from, to, label) {
  const norm = rows.map(e => {
    const ccy = (e.currency && String(e.currency).toUpperCase()) || CCY_FROM_COUNTRY[String(e.country || '').toUpperCase()] || String(e.country || '').toUpperCase()
    const fc = e.estimate ?? e.forecast
    return { event: e.event || 'Event', country: ccy, time: parseFMPDate(e.date), impact: normImpact(e.impact), forecast: (fc === null || fc === undefined) ? '' : String(fc), previous: (e.previous === null || e.previous === undefined) ? '' : String(e.previous) }
  }).filter(e => e.time && MAJOR_CCY.includes(e.country))
  console.log(`📅 FMP calendar (${label}): ${norm.length} major-currency events (${from} → ${to})`)
  return norm
}
async function fetchFMPCalendar() {
  if (!FMP_KEY) { console.log('ℹ️ FMP_API_KEY not set — skipping FMP'); return null }
  const from = new Date().toISOString().slice(0, 10)
  const to = new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 10)
  // Try legacy (free-tier friendly) first, then stable. Whichever returns data wins.
  const endpoints = [
    { label: 'legacy', url: 'https://financialmodelingprep.com/api/v3/economic_calendar' },
    { label: 'stable', url: 'https://financialmodelingprep.com/stable/economic-calendar' }
  ]
  for (const ep of endpoints) {
    try {
      const r = await axios.get(ep.url, { params: { from, to, apikey: FMP_KEY }, timeout: 12000 })
      if (Array.isArray(r.data) && r.data.length) {
        const norm = normFMPEvents(r.data, from, to, ep.label)
        if (norm.length) return norm
        console.error(`⚠️ FMP ${ep.label}: data returned but 0 major-currency events after filter`)
      } else {
        console.error(`⚠️ FMP ${ep.label}: empty/invalid response (${typeof r.data})`)
      }
    } catch (e) {
      console.error(`⚠️ FMP ${ep.label} failed: ${e?.response?.status || ''} ${e?.message}`)
    }
  }
  return null
}

// Calendar-specific failure backoff. Without it, a failed FF fetch leaves ff_calendar stale, so every
// caller (5-min cal cron, news alerts, bias engine, /api/trade-check, v2 feeds) re-hammers FF → 429 storm.
// Separate from the shared 10-min CACHE_TTL, which also governs prices/news/strength.
let calendarCooldownUntil = 0
const CALENDAR_FAIL_COOLDOWN = 30 * 60 * 1000

async function getEconomicCalendar() {
  if (isCacheFresh('ff_calendar')) return getCached('ff_calendar')
  // Inside the failure backoff → serve stale, hit no source. One quiet line instead of the 6-line red cascade.
  if (Date.now() < calendarCooldownUntil) {
    const stale = getCached('ff_calendar')
    if (stale) {
      console.log(`📦 Calendar sources rate-limited — using stale cache (backoff ${Math.ceil((calendarCooldownUntil - Date.now()) / 60000)}min)`)
      return stale
    }
  }
  // 1) PRIMARY: FMP (forward-looking, weekend-safe)
  const fmp = await fetchFMPCalendar()
  if (fmp && fmp.length) { setCache('ff_calendar', fmp); calendarCooldownUntil = 0; return fmp }
  // 2) FALLBACK: ForexFactory thisweek
  try {
    console.log('↩️ FMP unavailable — falling back to ForexFactory')
    const arrays = await Promise.all(FF_FEEDS.map(fetchFFFeed))
    const raw = arrays.flat()
    if (raw.length === 0) throw new Error('FF calendar empty (all feeds failed)')
    const norm = raw.filter(e => e.date).map(e => ({ event: e.title || 'Event', country: (e.country || 'N/A').toUpperCase(), time: new Date(e.date).toISOString(), impact: e.impact || 'Low', forecast: e.forecast || '', previous: e.previous || '' }))
    const seen = new Set()
    const deduped = norm.filter(e => { const k = `${e.event}|${e.country}|${e.time}`; if (seen.has(k)) return false; seen.add(k); return true })
    const future = deduped.filter(e => new Date(e.time) >= new Date()).length
    console.log(`📅 FF calendar (fallback): ${deduped.length} events (${future} upcoming)`)
    setCache('ff_calendar', deduped)
    calendarCooldownUntil = 0   // source healthy again → clear any failure backoff
    return deduped
  } catch (err) {
    const stale = getCached('ff_calendar')
    if (stale) {
      // Back off before returning stale, otherwise the next caller retries immediately (429 storm).
      calendarCooldownUntil = Date.now() + CALENDAR_FAIL_COOLDOWN
      console.log(`📦 Calendar sources rate-limited — using stale cache (backoff ${CALENDAR_FAIL_COOLDOWN / 60000}min)`)
      return stale
    }
    console.error('❌ Calendar fetch failed (FMP + FF), no stale cache:', err.message)
    throw err
  }
}

const PLANS = {
  pro_monthly: { variantId: '1682107', name: 'BiasForge Pro Monthly' },
  pro_annual: { variantId: '1682117', name: 'BiasForge Pro Annual' },
}
// ============================================
// 📧 EMAIL + 📱 TELEGRAM SUBSCRIBERS
// ============================================
let emailSubscribers = []
let telegramSubscribers = []
let lastBiasKey = ''
async function loadSubscribers() {
  try {
    const { data } = await supabase.from('email_subscribers').select('*').eq('active', true)
    if (data) { emailSubscribers = data; console.log(`✅ Loaded ${data.length} email subscribers`) }
  } catch (e) { console.error('Email sub load:', e.message) }
}

async function loadTelegramSubscribers() {
  try {
    const { data } = await supabase.from('telegram_subscribers').select('*').eq('active', true)
    if (data) { telegramSubscribers = data; console.log(`✅ Loaded ${data.length} Telegram subscribers`) }
  } catch (e) { console.error('TG sub load:', e.message) }
}

// ============================================
// 📱 TELEGRAM HELPERS
// ============================================
async function sendTG(chatId, text) {
  if (!TG_API) return false
  try {
    const res = await fetch(`${TG_API}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    })
    const d = await res.json()
    if (!d.ok) { console.error(`❌ TG fail ${chatId}:`, d.description); return false }
    return true
  } catch (e) { console.error(`❌ TG error ${chatId}:`, e.message); return false }
}
// UNUSED since the /api/strength push was removed — its only caller was the strength route, and
// strength is viewer-only, not a bias source. Kept (with lastBiasKey) rather than deleted; the v2
// engine's publishTodayBias is what pushes bias changes now.
async function notifyBiasChange(bp) {
  if (!bp || !bp.pair) return
  const newKey = `${bp.action} ${bp.pair}`
  if (newKey === lastBiasKey) return
  const oldBias = lastBiasKey
  lastBiasKey = newKey
  if (!oldBias) return // first load, skip notification

  const msg = `🔄 <b>Bias Change Alert!</b>\n\n` +
    `Old: <b>${oldBias}</b>\n` +
    `New: <b>${bp.action} ${bp.pair}</b>\n` +
    `Reason: ${bp.reason}\n\n` +
    `📊 Check full analysis at biasforge.co`

  // Telegram notifications
  for (const sub of telegramSubscribers.filter(s => s.active)) {
    sendTG(sub.chat_id, msg).catch(() => {})
  }

  // Email notifications
  try {
    const { data: emailSubs } = await supabase.from('email_subscribers').select('email').eq('active', true)
    if (emailSubs && emailSubs.length > 0) {
      for (const sub of emailSubs) {
        resend.emails.send({
          from: `BiasForge <${FROM_EMAIL}>`,
          to: [sub.email],
          subject: `🔄 Bias Changed: ${bp.action} ${bp.pair}`,
          html: `<h2>Bias Change Alert</h2><p>Old bias: <b>${oldBias}</b></p><p>New bias: <b>${bp.action} ${bp.pair}</b></p><p>${bp.reason}</p><p><a href="https://biasforge.co/dashboard">Open Dashboard</a></p>`
        }).catch(() => {})
      }
    }
  } catch(e) { console.error('Email bias notify error:', e.message) }

  console.log(`🔄 Bias changed: ${oldBias} → ${newKey} — notified subscribers`)
}
function tgCalendarAlert(event, alertType, currency, timeStr) {
  const icon = alertType === '1hr' ? '⏰' : '🔥'
  return `${icon} <b>BiasForge Alert</b>\n\n<b>${event.event} ${alertType === '1hr' ? 'in ~1 Hour' : 'in ~30 Minutes!'}</b>\n\n💱 Currency: <b>${currency}</b>\n📊 Impact: <b>🔴 HIGH</b>\n🕐 Time: <b>${timeStr} EST</b>\n\n${alertType === '1hr' ? '📋 <i>Check your Playbook</i>' : '🛡️ <i>Tighten stops! Volatility incoming.</i>'}\n\n🔗 <a href="https://www.biasforge.co/calendar">Open Dashboard</a>`
}

function tgNewsAlert(articles) {
  const items = articles.slice(0, 3).map((a, i) => `${i + 1}. <b>${a.title}</b>\n   📰 ${a.source} · Impact: ${a.impact}/10`).join('\n\n')
  return `🚨 <b>BiasForge Breaking News</b> 🚨\n\n${items}\n\n🔗 <a href="https://www.biasforge.co/news">View All News</a>`
}

// ============================================
// 📱 TELEGRAM BOT POLLING
// ============================================
let tgOffset = 0

async function pollTelegram() {
  if (!TG_API) return
  try {
    const res = await fetch(`${TG_API}/getUpdates?offset=${tgOffset}&timeout=5&limit=20`)
    const data = await res.json()
    if (!data.ok || !data.result?.length) return

    for (const update of data.result) {
      tgOffset = update.update_id + 1
      const msg = update.message
      if (!msg?.text) continue
      const chatId = msg.chat.id
      const cmd = msg.text.trim().toLowerCase()
      const name = msg.from?.username || msg.from?.first_name || 'Trader'

      if (cmd === '/start' || cmd === '/subscribe') {
        await supabase.from('telegram_subscribers').upsert({ chat_id: String(chatId), username: name, active: true, preferences: { calendar: true, news: true }, subscribed_at: new Date().toISOString() }, { onConflict: 'chat_id' })
        const exists = telegramSubscribers.find(s => s.chat_id === String(chatId))
        if (!exists) telegramSubscribers.push({ chat_id: String(chatId), username: name, active: true, preferences: { calendar: true, news: true } })
        else exists.active = true
        await sendTG(chatId, `✅ <b>Welcome to BiasForge Alerts!</b>\n\nHey ${name}! You're subscribed to:\n\n📅 <b>Calendar Alerts</b> — 1hr & 30min reminders\n📰 <b>News Alerts</b> — Breaking news (8+ impact)\n\n<b>Commands:</b>\n/status — Check subscription\n/calendar — Toggle calendar alerts\n/news — Toggle news alerts\n/stop — Unsubscribe\n/help — All commands\n\n🔗 <a href="https://www.biasforge.co">Open Dashboard</a>`)
        console.log(`📱 TG subscribed: ${name} (${chatId})`)

      } else if (cmd === '/stop' || cmd === '/unsubscribe') {
        await supabase.from('telegram_subscribers').update({ active: false }).eq('chat_id', String(chatId))
        const sub = telegramSubscribers.find(s => s.chat_id === String(chatId))
        if (sub) sub.active = false
        await sendTG(chatId, '👋 <b>Unsubscribed.</b>\nSend /start to re-subscribe anytime.')

      } else if (cmd === '/status') {
        const sub = telegramSubscribers.find(s => s.chat_id === String(chatId))
        if (sub?.active) {
          await sendTG(chatId, `📊 <b>Your Subscription</b>\n\n${sub.preferences?.calendar !== false ? '✅' : '❌'} Calendar Alerts\n${sub.preferences?.news !== false ? '✅' : '❌'} News Alerts\n\nUse /calendar or /news to toggle.`)
        } else await sendTG(chatId, '❌ Not subscribed. Send /start to subscribe.')

      } else if (cmd === '/calendar') {
        const sub = telegramSubscribers.find(s => s.chat_id === String(chatId))
        if (sub?.active) {
          const v = sub.preferences?.calendar === false
          sub.preferences = { ...sub.preferences, calendar: v }
          await supabase.from('telegram_subscribers').update({ preferences: sub.preferences }).eq('chat_id', String(chatId))
          await sendTG(chatId, `📅 Calendar alerts: ${v ? '✅ ON' : '❌ OFF'}`)
        } else await sendTG(chatId, 'Send /start first.')

      } else if (cmd === '/news') {
        const sub = telegramSubscribers.find(s => s.chat_id === String(chatId))
        if (sub?.active) {
          const v = sub.preferences?.news === false
          sub.preferences = { ...sub.preferences, news: v }
          await supabase.from('telegram_subscribers').update({ preferences: sub.preferences }).eq('chat_id', String(chatId))
          await sendTG(chatId, `📰 News alerts: ${v ? '✅ ON' : '❌ OFF'}`)
        } else await sendTG(chatId, 'Send /start first.')

      } else if (cmd === '/help') {
        await sendTG(chatId, '🤖 <b>BiasForge Bot</b>\n\n/start — Subscribe\n/stop — Unsubscribe\n/status — Check sub\n/calendar — Toggle calendar\n/news — Toggle news\n/help — This message\n\n🔗 <a href="https://www.biasforge.co">Dashboard</a>')
} else if (cmd === '/bias') {
        const cached = getCached('strength')
        if (cached && cached.bestPairs && cached.bestPairs[0]) {
          const bp = cached.bestPairs[0]
          const currencies = cached.currencies || []
          const top3 = currencies.slice(0, 3).map(c => `${c.currency}: ${c.strength}`).join(' | ')
          await sendTG(chatId, `🧠 <b>BiasForge — Today's Bias</b>\n\n📊 <b>${bp.action} ${bp.pair}</b>\n💡 ${bp.reason}\n\n💪 Strength: ${top3}\n\n⏰ Updated: ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} EST\n\n🔗 <a href="https://www.biasforge.co/bias">Full AI Analysis</a>`)
        } else {
          await sendTG(chatId, '📊 Market data loading... try again in a minute.')
        }
      } else {
        await sendTG(chatId, '👋 Send /start to subscribe or /help for commands.')
      }
    }
  } catch (e) { /* silent retry */ }
}

// ============================================
// 📧 EMAIL TEMPLATE
// ============================================
function buildAlertEmail({ type, title, items, greeting }) {
  const itemsHtml = items.map(item => `<tr><td style="padding:12px 16px;border-bottom:1px solid #1e293b;"><div style="display:flex;align-items:center;gap:8px;">${item.badge ? `<span style="background:${item.badgeColor || '#0891b2'};color:#000;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;">${item.badge}</span>` : ''}<span style="color:#e2e8f0;font-size:14px;font-weight:600;">${item.title}</span></div>${item.subtitle ? `<div style="color:#94a3b8;font-size:12px;margin-top:4px;">${item.subtitle}</div>` : ''}</td></tr>`).join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#030712;padding:32px 16px;"><tr><td align="center"><table width="100%" style="max-width:560px;background:#0a1628;border-radius:16px;border:1px solid rgba(255,255,255,0.1);overflow:hidden;"><tr><td style="padding:24px 24px 16px;border-bottom:1px solid rgba(255,255,255,0.1);"><table width="100%"><tr><td><span style="font-size:18px;font-weight:900;color:#fff;">Bias</span><span style="font-size:18px;font-weight:900;color:#06b6d4;">Forge</span><span style="font-size:14px;color:#64748b;">.co</span></td><td align="right"><span style="background:${type === 'calendar' ? '#f59e0b20' : '#06b6d420'};color:${type === 'calendar' ? '#f59e0b' : '#06b6d4'};font-size:10px;font-weight:700;padding:4px 10px;border-radius:20px;border:1px solid ${type === 'calendar' ? '#f59e0b30' : '#06b6d430'};">${type === 'calendar' ? '📅 EVENT ALERT' : '📰 NEWS ALERT'}</span></td></tr></table></td></tr><tr><td style="padding:20px 24px 8px;"><p style="color:#94a3b8;font-size:13px;margin:0;">${greeting || 'Hey trader,'}</p><h2 style="color:#fff;font-size:18px;font-weight:700;margin:8px 0 0;">${title}</h2></td></tr><tr><td style="padding:12px 24px;"><table width="100%" style="background:#020617;border-radius:12px;border:1px solid #1e293b;">${itemsHtml}</table></td></tr><tr><td style="padding:16px 24px;" align="center"><a href="https://www.biasforge.co/${type === 'calendar' ? 'calendar' : 'news'}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#06b6d4,#10b981);color:#000;font-size:13px;font-weight:700;text-decoration:none;border-radius:12px;">View in Dashboard →</a></td></tr><tr><td style="padding:16px 24px;border-top:1px solid rgba(255,255,255,0.05);"><p style="color:#475569;font-size:11px;margin:0;text-align:center;">You're receiving this because you subscribed to BiasForge alerts.<br><a href="https://www.biasforge.co/settings" style="color:#06b6d4;text-decoration:none;">Manage preferences</a> · <a href="https://www.biasforge.co/api/email/unsubscribe?email=UNSUBSCRIBE_PLACEHOLDER" style="color:#475569;text-decoration:none;">Unsubscribe</a></p></td></tr></table></td></tr></table></body></html>`
}

async function sendAlertEmail(to, subject, html) {
  try {
    const { data, error } = await resend.emails.send({ from: `BiasForge <${FROM_EMAIL}>`, to: [to], subject, html: html.replace('UNSUBSCRIBE_PLACEHOLDER', encodeURIComponent(to)) })
    if (error) { console.error(`❌ Email fail ${to}:`, error); return false }
    console.log(`✅ Email sent ${to} — ${data?.id}`); return true
  } catch (e) { console.error(`❌ Email error ${to}:`, e.message); return false }
}

// ============================================
// 📧 EMAIL ROUTES
// ============================================
app.post('/api/email/subscribe', async (req, res) => {
  const { email, preferences } = req.body
  if (!email) return res.status(400).json({ error: 'Email required' })
  try {
    await supabase.from('email_subscribers').upsert({ email: email.toLowerCase().trim(), active: true, preferences: preferences || { calendar: true, news: true }, subscribed_at: new Date().toISOString() }, { onConflict: 'email' })
    const exists = emailSubscribers.find(s => s.email === email.toLowerCase().trim())
    if (!exists) emailSubscribers.push({ email: email.toLowerCase().trim(), active: true, preferences: preferences || { calendar: true, news: true } })
    else { exists.active = true; exists.preferences = preferences || exists.preferences }
    const welcomeHtml = buildAlertEmail({ type: 'news', title: 'Welcome to BiasForge Alerts! 🎯', greeting: 'Hey trader,', items: [{ title: '📅 High Impact Calendar Events', subtitle: 'Alerts 1hr and 30min before major events' }, { title: '📰 Breaking Market News', subtitle: 'Instant alerts for impact 8+ news' }, { title: '⚙️ Manage Anytime', subtitle: 'Update from your Settings page' }] })
    await sendAlertEmail(email, '✅ Welcome to BiasForge Alerts', welcomeHtml)
    res.json({ success: true, message: 'Subscribed!' })
  } catch (e) { res.status(500).json({ error: 'Subscription failed' }) }
})

app.get('/api/email/unsubscribe', async (req, res) => {
  const { email } = req.query
  if (!email) return res.status(400).send('Email required')
  try {
    await supabase.from('email_subscribers').update({ active: false }).eq('email', decodeURIComponent(email).toLowerCase().trim())
    const sub = emailSubscribers.find(s => s.email === decodeURIComponent(email).toLowerCase().trim())
    if (sub) sub.active = false
    res.send('<html><body style="background:#030712;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;"><h2>✅ Unsubscribed</h2><p style="color:#94a3b8;">No more BiasForge alerts.</p><a href="https://www.biasforge.co" style="color:#06b6d4;">Back to BiasForge</a></div></body></html>')
  } catch (e) { res.status(500).send('Failed') }
})

app.post('/api/email/preferences', async (req, res) => {
  const { email, preferences } = req.body
  if (!email) return res.status(400).json({ error: 'Email required' })
  try {
    await supabase.from('email_subscribers').update({ preferences }).eq('email', email.toLowerCase().trim())
    const sub = emailSubscribers.find(s => s.email === email.toLowerCase().trim())
    if (sub) sub.preferences = preferences
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: 'Failed' }) }
})

app.get('/api/email/status', async (req, res) => {
  const { email } = req.query
  if (!email) return res.status(400).json({ error: 'Email required' })
  const sub = emailSubscribers.find(s => s.email === email.toLowerCase().trim())
  res.json({ subscribed: sub?.active || false, preferences: sub?.preferences || { calendar: true, news: true } })
})

app.post('/api/email/test', async (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email required' })
  const html = buildAlertEmail({ type: 'calendar', title: '⚠️ FOMC Rate Decision in 1 Hour', greeting: 'Heads up trader!', items: [{ title: 'FOMC Interest Rate Decision', subtitle: 'USD · High Impact · 2:00 PM EST', badge: 'HIGH', badgeColor: '#ef4444' }, { title: 'Fed Press Conference', subtitle: 'USD · High Impact · 2:30 PM EST', badge: 'HIGH', badgeColor: '#ef4444' }] })
  const sent = await sendAlertEmail(email, '🧪 BiasForge Test Alert — FOMC in 1hr', html)
  res.json({ success: sent })
})

// ============================================
// 📱 TELEGRAM ROUTES
// ============================================
app.get('/api/telegram/status', (req, res) => {
  res.json({ botActive: !!TG_API, subscribers: telegramSubscribers.filter(s => s.active).length, botUsername: 'BiasForgeAlertsBot' })
})
app.get('/api/telegram/link', (req, res) => { res.json({ url: 'https://t.me/BiasForgeAlertsBot' }) })

// ============================================
// ⏰ COMBINED ALERT ENGINE (Email + Telegram)
// ============================================
const sentAlerts = new Map()
const sentNewsAlerts = new Set()

// ── TIER 2 MARKET-SHAKER TRACKING ──
// Tier 1 (impact 7-8): refresh locked pair reasoning only
// Tier 2 (impact 9-10 OR geopolitics/central-bank surprise): full re-pick allowed
let lastTier2OverrideAt = 0                   // timestamp of last Tier 2 override
const tier2Stories = new Set()                 // dedupe: story keys that already triggered Tier 2 today
let tier2Day = ''                              // reset dedupe at day boundary
const TIER2_COOLDOWN = 60 * 60 * 1000         // 60 min minimum between Tier 2 overrides
const TIER2_MOVER_IDS = ['geo', 'powell', 'lagarde', 'bailey', 'ueda'] // central banks + geopolitics = market-shakers

async function checkAndSendCalendarAlerts() {
  const emailSubs = emailSubscribers.filter(s => s.active)
  const tgSubs = telegramSubscribers.filter(s => s.active)
  if (emailSubs.length === 0 && tgSubs.length === 0) return
  try {
    const now = new Date()
    let events = []
    try { events = await getEconomicCalendar() } catch (e) { return }
    const highImpact = events.filter(e => { if (!e.time || e.impact?.toLowerCase() !== 'high') return false; const m = (new Date(e.time) - now) / 60000; return m > 0 && m <= 65 })
    if (highImpact.length === 0) return
    const cMap = { 'US': 'USD', 'EU': 'EUR', 'GB': 'GBP', 'JP': 'JPY', 'AU': 'AUD', 'CA': 'CAD', 'CH': 'CHF', 'NZ': 'NZD' }
    let preEventRefresh = false

    for (const event of highImpact) {
      const et = new Date(event.time), min = Math.round((et - now) / 60000), cur = cMap[event.country?.toUpperCase()] || event.country
      let at = null; if (min >= 55 && min <= 65) at = '1hr'; else if (min >= 25 && min <= 35) at = '30min'
      if (!at) continue
      const key = `${event.event}-${event.time}-${at}`
      if (sentAlerts.has(key)) continue
      const timeStr = et.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })

      // Email
      const html = buildAlertEmail({ type: 'calendar', title: at === '1hr' ? `⏰ ${event.event} in ~1 Hour` : `🔥 ${event.event} in ~30 Minutes`, greeting: at === '30min' ? '⚡ Last call!' : 'Heads up trader!', items: [{ title: event.event, subtitle: `${cur} · High Impact · ${timeStr} EST`, badge: 'HIGH', badgeColor: '#ef4444' }, { title: at === '1hr' ? '📋 Check Playbook' : '🛡️ Tighten Stops', subtitle: at === '1hr' ? 'Review strategy before the event.' : 'Close risky positions. Volatility incoming.' }] })
      const subj = at === '1hr' ? `⏰ ${cur}: ${event.event} in 1hr` : `🔥 ${cur} ALERT: ${event.event} in 30min!`
      for (const s of emailSubs.filter(s => s.preferences?.calendar !== false)) await sendAlertEmail(s.email, subj, html)

      // Telegram
      const tgTxt = tgCalendarAlert(event, at, cur, timeStr)
      for (const s of tgSubs.filter(s => s.preferences?.calendar !== false)) await sendTG(s.chat_id, tgTxt)

      sentAlerts.set(key, Date.now())
      if (at === '1hr') preEventRefresh = true
      console.log(`📧📱 ${at} alert: ${event.event}`)
    }

    // Pre-event: refresh Today's AI Bias once when a high-impact event is ~1hr out (fires change alert if it flipped)
    if (preEventRefresh) { computeTodaysAIBias().catch(() => {}) }

    const cutoff = Date.now() - 3 * 60 * 60 * 1000
    for (const [k, v] of sentAlerts) if (v < cutoff) sentAlerts.delete(k)
  } catch (e) { console.error('Cal alert error:', e.message) }
}

// Server-side market-mover detection (mirrors MarketMovers Radar) — used to enrich breaking-news alerts
const MOVERS_SRV = [
  { id: 'trump', name: 'Donald Trump', emoji: '🇺🇸', kw: ['trump', 'tariff', 'tariffs', 'trade war', 'truth social', 'white house'], assets: ['USD', 'Gold', 'S&P500', 'Oil'] },
  { id: 'powell', name: 'Kevin Warsh', emoji: '🏦', kw: ['warsh', 'federal reserve', 'fed chair', 'fomc', 'fed rate', 'fed policy'], assets: ['USD', 'Gold', 'Bonds'] },
  { id: 'lagarde', name: 'Christine Lagarde', emoji: '🇪🇺', kw: ['lagarde', 'ecb', 'european central bank'], assets: ['EUR', 'EUR/USD', 'DAX'] },
  { id: 'musk', name: 'Elon Musk', emoji: '🚀', kw: ['elon musk', 'musk', 'tesla', 'spacex', 'doge '], assets: ['TSLA', 'BTC', 'DOGE'] },
  { id: 'bailey', name: 'Andrew Bailey', emoji: '🇬🇧', kw: ['bailey', 'bank of england', 'boe rate', 'boe governor'], assets: ['GBP', 'GBP/USD', 'FTSE'] },
  { id: 'ueda', name: 'Kazuo Ueda', emoji: '🇯🇵', kw: ['ueda', 'bank of japan', 'boj rate', 'boj governor'], assets: ['JPY', 'USD/JPY', 'Nikkei'] },
  { id: 'geo', name: 'Geopolitics', emoji: '🌐', kw: ['war', 'sanction', 'sanctions', 'opec', 'ceasefire', 'invasion', 'missile', 'nuclear', 'middle east', 'conflict', 'airstrike', 'embargo', 'oil supply'], assets: ['Gold', 'Oil', 'USD', 'Safe Havens'] },
]
function matchMoverSrv(text) { const t = (text || '').toLowerCase(); for (const m of MOVERS_SRV) { if (m.kw.some(k => t.includes(k))) return m } return null }
function tgMoverAlert(articles) {
  const items = articles.slice(0, 3).map(a => {
    const m = matchMoverSrv(`${a.title} ${a.summary || ''}`)
    const who = m ? `${m.emoji} <b>${m.name}</b>` : '📰 <b>Market News</b>'
    const tags = (a.marketTags && a.marketTags.length) ? a.marketTags.join(' · ') : (m ? m.assets.slice(0, 3).join(' · ') : '')
    const line = a.oneliner ? `\n   💡 <i>${a.oneliner}</i>` : ''
    return `${who} — Impact <b>${a.impact}/10</b>\n   ${a.title}${tags ? `\n   📊 ${tags}` : ''}${line}`
  }).join('\n\n')
  return `🚨 <b>MARKET MOVER ALERT</b> 🚨\n\n${items}\n\n🔗 <a href="https://www.biasforge.co/market-movers">Open MarketMovers Radar</a>`
}

async function checkAndSendNewsAlerts() {
  const eSubs = emailSubscribers.filter(s => s.active && s.preferences?.news !== false)
  const tSubs = telegramSubscribers.filter(s => s.active && s.preferences?.news !== false)
  try {
    const cached = getCached('latest_news')
    if (!cached) return
    const hi = cached.filter(a => a.impact >= 8 && !sentNewsAlerts.has(a.title))
    if (hi.length === 0) return

    // ⚡ CATALYST CLASSIFICATION: Tier 1 (refresh only) vs Tier 2 (market-shaker → full re-pick)
    // Reset dedupe at day boundary
    const today = utcDay()
    if (tier2Day !== today) { tier2Stories.clear(); tier2Day = today }

    // Tier 2 candidates: impact 9+ OR (impact 8+ AND matches geopolitics/central-bank mover)
    const tier2Candidates = hi.filter(a => {
      if (a.impact >= 9) return true
      const mover = matchMoverSrv(`${a.title} ${a.summary || ''}`)
      return a.impact >= 8 && mover && TIER2_MOVER_IDS.includes(mover.id)
    })

    // Check Tier 2 eligibility: has candidates + cooldown passed + story not already triggered
    const tier2Eligible = tier2Candidates.length > 0
      && (Date.now() - lastTier2OverrideAt) > TIER2_COOLDOWN
      && tier2Candidates.some(a => {
        const mover = matchMoverSrv(`${a.title} ${a.summary || ''}`)
        const storyKey = mover ? mover.id : a.title.split(' ').slice(0, 5).join(' ').toLowerCase()
        return !tier2Stories.has(storyKey)
      })

    if (tier2Eligible) {
      // 🔴 TIER 2 — MARKET-SHAKER: full re-pick allowed (same as session open)
      const trigger = tier2Candidates[0]
      const mover = matchMoverSrv(`${trigger.title} ${trigger.summary || ''}`)
      const storyKey = mover ? mover.id : trigger.title.split(' ').slice(0, 5).join(' ').toLowerCase()
      tier2Stories.add(storyKey)
      lastTier2OverrideAt = Date.now()
      console.log(`🔴 TIER 2 MARKET-SHAKER: "${trigger.title.slice(0, 70)}" (impact ${trigger.impact}${mover ? ', ' + mover.name : ''}) → FULL re-pick`)
      computeTodaysAIBias(true, true).catch(() => {})
      // v2 reacts to the same shaker instead of waiting for the 2h cron.
      // Rate-limited by the TIER2_COOLDOWN gate above — no extra cooldown needed.
      if (process.env.V2_SHADOW_CRON === 'on') {
        console.log('🔬 [v2-shadow] shaker trigger → immediate re-run')
        runV2Shadow('shaker').catch(e => v2AdminAlert(e, 'v2 shadow run (shaker)'))
      }
    } else {
      // ⚡ TIER 1 — normal catalyst: locked pair reasoning refresh only, NO pair switch
      console.log(`⚡ Tier 1 catalyst: "${hi[0].title.slice(0, 60)}" (impact ${hi[0].impact}) → locked pair refresh only`)
      computeTodaysAIBias(true, false).catch(() => {})
    }

    if (eSubs.length > 0) {
      const items = hi.slice(0, 3).map(a => {
        const m = matchMoverSrv(`${a.title} ${a.summary || ''}`)
        const tags = (a.marketTags && a.marketTags.length) ? a.marketTags.join(' · ') : (m ? m.assets.slice(0, 3).join(' · ') : '')
        const sub = [m ? `${m.emoji} ${m.name}` : a.source, `Impact: ${a.impact}/10`, tags].filter(Boolean).join(' · ')
        return { title: a.title, subtitle: `${sub}${a.oneliner ? ` — ${a.oneliner}` : ''}`, badge: m ? 'MARKET MOVER' : 'BREAKING', badgeColor: '#ef4444' }
      })
      const html = buildAlertEmail({ type: 'news', title: `🚨 ${hi.length} Market-Moving Update${hi.length > 1 ? 's' : ''}`, greeting: 'Breaking!', items })
      for (const s of eSubs) await sendAlertEmail(s.email, `🚨 BiasForge: ${hi[0].title.slice(0, 50)}...`, html)
    }

    if (tSubs.length > 0) {
      const tgTxt = tgMoverAlert(hi)
      for (const s of tSubs) await sendTG(s.chat_id, tgTxt)
    }

    hi.forEach(a => sentNewsAlerts.add(a.title))
    console.log(`📰 News alert → ${eSubs.length} emails, ${tSubs.length} TG`)
    if (sentNewsAlerts.size > 100) { const arr = Array.from(sentNewsAlerts); arr.slice(0, arr.length - 100).forEach(t => sentNewsAlerts.delete(t)) }
  } catch (e) { console.error('News alert error:', e.message) }
}

// ============================================
// AUTH ROUTES
// ============================================
app.post('/api/register', async (req, res) => {
  const { email, password, name } = req.body
  try { const { data, error } = await supabase.auth.admin.createUser({ email, password, user_metadata: { name }, email_confirm: true }); if (error) throw error; res.json({ success: true, user: data.user }) } catch (e) { res.status(400).json({ error: e.message }) }
})
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body
  try { const { data, error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; res.json({ success: true, user: data.user, session: data.session }) } catch (e) { res.status(400).json({ error: e.message }) }
})

// ============================================
// 💳 PAYMENTS
// ============================================
app.post('/api/checkout', async (req, res) => {
  const { planKey } = req.body; const plan = PLANS[planKey]
  if (!plan) return res.status(400).json({ error: 'Invalid plan' })
  try {
    const response = await axios.post('https://api.lemonsqueezy.com/v1/checkouts', { data: { type: 'checkouts', attributes: { checkout_data: {}, product_options: { redirect_url: 'https://www.biasforge.co/?payment=success' } }, relationships: { store: { data: { type: 'stores', id: String(LS_STORE_ID) } }, variant: { data: { type: 'variants', id: String(plan.variantId) } } } } }, { headers: { 'Authorization': `Bearer ${LS_API_KEY}`, 'Content-Type': 'application/vnd.api+json', 'Accept': 'application/vnd.api+json' } })
    res.json({ success: true, url: response.data.data.attributes.url })
  } catch (e) { res.status(500).json({ error: 'Checkout failed' }) }
})
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const event = req.headers['x-event-name']
    const payload = JSON.parse(req.body)
    const email = payload.data?.attributes?.user_email?.toLowerCase()?.trim()
    const variantId = String(payload.data?.attributes?.variant_id || '')

    console.log(`💳 Webhook: ${event} — ${email} — variant ${variantId}`)

    if ((event === 'subscription_created' || event === 'order_created') && email) {
      const tier = 'pro'

      // Try to find user by email and update their plan
      const { data: authUsers } = await supabase.auth.admin.listUsers()
      const matchedUser = authUsers?.users?.find(u => u.email?.toLowerCase() === email)

      if (matchedUser) {
        await supabase.from('user_plans').upsert({
          user_id: matchedUser.id,
          email,
          tier,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        console.log(`✅ Plan upgraded to PRO: ${email} (${matchedUser.id})`)
      } else {
        // User not found by auth, upsert by email
        await supabase.from('user_plans').upsert({
          email,
          tier,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'email' })
        console.log(`✅ Plan upgraded to PRO by email: ${email}`)
      }
    }

    if (event === 'subscription_cancelled' && email) {
      await supabase.from('user_plans').update({
        tier: 'free',
        updated_at: new Date().toISOString(),
      }).eq('email', email)
      console.log(`⚠️ Plan downgraded to FREE: ${email}`)
    }
  } catch (e) {
    console.error('Webhook error:', e.message)
  }
  res.json({ received: true })
})

// ============================================
// 💰 PRICES
// ============================================
app.get('/api/prices', async (req, res) => {
  if (isCacheFresh('prices')) return res.json(getCached('prices'))
  const stale = getCached('prices')
  try { await tdAcquire(5); const r = await axios.get(`https://api.twelvedata.com/price?symbol=EUR/USD,GBP/USD,USD/JPY,XAU/USD,BTC/USD&apikey=${process.env.TWELVEDATA_API_KEY}`); if (r.data?.code === 429) { if (stale) return res.json(stale); return res.json({ success: true, data: r.data }) }; const result = { success: true, data: r.data }; setCache('prices', result); res.json(result) } catch (e) { if (stale) return res.json(stale); res.status(500).json({ error: 'Price fetch failed' }) }
})

// ============================================
// 🤖 AI
// ============================================
app.post('/api/ai', aiRateLimiter, async (req, res) => {
  const { prompt, system } = req.body; if (!prompt) return res.status(400).json({ error: 'Prompt required' })
  try { const m = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 4096, system: system || 'You are a financial markets analyst for BiasForge.', messages: [{ role: 'user', content: prompt }] }); trackAI('ai-analyze', 'claude-sonnet-4-6', m.usage); res.json({ success: true, response: m.content[0].text }) } catch (e) { console.error('AI error:', e?.message || e); res.status(500).json({ error: e?.message || 'AI failed' }) }
})
// Returns fresh currency strength, computing it live if the cache is cold and the market is open.
// Returns null when the forex market is closed (weekend) — strength is meaningless then.
async function getLiveStrength() {
  if (isForexClosed()) return null
  if (isCacheFresh('strength')) return getCached('strength')
  const pairs = ['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','NZD/USD','USD/CAD']
  try {
    await tdAcquire(pairs.length)
    const r = await axios.get(`https://api.twelvedata.com/time_series?symbol=${pairs.join(',')}&interval=1day&outputsize=2&apikey=${process.env.TWELVEDATA_API_KEY}`)
    if (r.data.code === 429) return getCached('strength') || null
    const scores = {USD:0,EUR:0,GBP:0,JPY:0,AUD:0,NZD:0,CAD:0,CHF:0}, counts = {...scores}
    pairs.forEach(p => { const [b,q] = p.split('/'), d = r.data[p]; if (!d?.values || d.values.length < 2) return; const c = parseFloat(d.values[0].close), pr = parseFloat(d.values[1].close); if (!c || !pr) return; const ch = ((c-pr)/pr)*100; scores[b]+=ch; counts[b]++; scores[q]-=ch; counts[q]++ })
    const avg = {}; Object.keys(scores).forEach(c => avg[c] = counts[c] > 0 ? scores[c]/counts[c] : 0)
    const vals = Object.values(avg), mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1
    const norm = {}; Object.keys(avg).forEach(c => norm[c] = Math.round(((avg[c]-mn)/rng)*100))
    const sorted = Object.entries(norm).sort((a,b)=>b[1]-a[1]).map(([c,s])=>({currency:c,strength:s,raw:avg[c].toFixed(4),label:s>=65?'Strong':s>=35?'Neutral':'Weak'}))
    const allZ = sorted.every(c => c.strength === 0)
    const result = { success:true, currencies:sorted, bestPairs:[], marketClosed:allZ, updatedAt:new Date().toISOString() }
    if (!allZ) setCache('strength', result)
    return result
  } catch (e) { return getCached('strength') || null }
}

// Move-maturity context: how much of the typical daily range a pair has already used today.
// Lets the AI flag "late/chase" biases vs fresh ones. Returns { text, pctADR, fromOpenPips } or null.
async function getMoveContext(symbol, currentPrice) {
  if (currentPrice === 'unknown') return null
  const symbolMap = { EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY', XAUUSD: 'XAU/USD', GBPJPY: 'GBP/JPY', AUDUSD: 'AUD/USD', USDCAD: 'USD/CAD', USDCHF: 'USD/CHF', NZDUSD: 'NZD/USD', EURJPY: 'EUR/JPY', EURGBP: 'EUR/GBP', NAS100: 'IXIC', BTC: 'BTC/USD' }
  const pip = /JPY/i.test(symbol) ? 0.01 : /XAU/i.test(symbol) ? 0.1 : (/BTC|NAS/i.test(symbol) ? 1 : 0.0001)
  try {
    await tdAcquire(1)
    const r = await axios.get('https://api.twelvedata.com/time_series', {
      params: { symbol: symbolMap[symbol] || symbol, interval: '1day', outputsize: 15, apikey: process.env.TWELVEDATA_API_KEY }
    })
    const vals = r.data?.values
    if (!Array.isArray(vals) || vals.length < 3) return null
    // vals[0] = today (forming), vals[1..] = completed days
    const completed = vals.slice(1)
    const adr = completed.reduce((s, d) => s + (parseFloat(d.high) - parseFloat(d.low)), 0) / completed.length
    const today = vals[0]
    const tOpen = parseFloat(today.open), tHigh = parseFloat(today.high), tLow = parseFloat(today.low)
    const cur = parseFloat(currentPrice)
    const adrPips = adr / pip
    const todayRangePips = (tHigh - tLow) / pip
    const pctADR = adrPips ? Math.round((todayRangePips / adrPips) * 100) : 0
    const fromOpenPips = +(((cur - tOpen) / pip)).toFixed(1)
    const dir = fromOpenPips > 0 ? 'UP' : fromOpenPips < 0 ? 'DOWN' : 'flat'
    // Directional move as % of ADR — THIS is what determines FRESH/EXTENDED/LATE
    const dirPct = adrPips ? Math.round((Math.abs(fromOpenPips) / adrPips) * 100) : 0
    const text = `ADR (~14d): ${adrPips.toFixed(0)} pips. Price is ${Math.abs(fromOpenPips).toFixed(0)} pips ${dir} from today's open (${dirPct}% of ADR directionally). Total range today: ${todayRangePips.toFixed(0)} pips (${pctADR}% of ADR). IMPORTANT: Use the DIRECTIONAL move from open (${dirPct}%) to judge entry quality — if your bias direction matches the move, ${dirPct}% is used; if opposite, the move creates room for your direction.`
    return { text, pctADR, dirPct, fromOpenPips, adrPips: +adrPips.toFixed(0) }
  } catch (e) { return null }
}

// Batch: for candidate pairs, compute ADR (typical daily range) and how much of the
// move in the bias DIRECTION has already happened today. One TwelveData call for all pairs.
// Returns { SYMBOL: { adrPips, favorablePips, pctUsed, roomScore } }. roomScore 1=fresh, 0=exhausted.
const ROOM_SYMBOL_MAP = { EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY', AUDUSD: 'AUD/USD', USDCAD: 'USD/CAD', USDCHF: 'USD/CHF', NZDUSD: 'NZD/USD', EURGBP: 'EUR/GBP', EURJPY: 'EUR/JPY', GBPJPY: 'GBP/JPY', AUDJPY: 'AUD/JPY', XAUUSD: 'XAU/USD' }

// ── SHARED TwelveData candle cache (v1 + v2 both read this to avoid per-pair 429s) ──
// TwelveData bills PER SYMBOL, so the real lever is caching each symbol's candles and
// reusing them across BOTH engines within a short window — not just batching the HTTP call.
// Per-symbol cache: only STALE symbols are (re)fetched, in one batched request.
async function fetchCandlesBatch(pairs, interval, ttlMs, keyPrefix, chunkSize = 2) {
  const out = {}
  const stale = []
  const wanted = [...new Set(pairs)].filter(p => ROOM_SYMBOL_MAP[p])
  for (const p of wanted) {
    const ck = `${keyPrefix}_${p}`
    if (isCacheFreshFor(ck, ttlMs)) out[p] = getCached(ck)   // fresh cache hit → 0 credits
    else stale.push(p)
  }
  if (stale.length) {
    // Anti-amplification: getPairMarket calls this once per pair (8×/run). Cap to ONE fetch
    // attempt per stale-set per ~20s (covers a single run) so a throttled set isn't re-hit 8×.
    const attemptKey = `${keyPrefix}_attempt_${stale.slice().sort().join('_')}`
    if (!isCacheFreshFor(attemptKey, 20 * 1000)) {
      setCache(attemptKey, 1)
      // Fetch in SMALL chunks through the shared limiter so we stay under 8 credits/min.
      const CHUNK = Math.max(1, chunkSize)
      let got = 0
      for (let i = 0; i < stale.length; i += CHUNK) {
        const group = stale.slice(i, i + CHUNK)
        const syms = group.map(p => ROOM_SYMBOL_MAP[p])
        try {
          await tdAcquire(syms.length)   // credit-gated: waits until within budget
          const r = await axios.get('https://api.twelvedata.com/time_series', {
            params: { symbol: syms.join(','), interval, outputsize: 15, apikey: process.env.TWELVEDATA_API_KEY }
          })
          // time_series SUCCESS carries no top-level `code`; ERROR responses do (429/400/401…).
          if (r.data?.code) {
            console.warn(`⚠️ TwelveData ${interval} error code=${r.data.code} msg="${r.data.message || ''}" (${syms.join(',')})`)
          } else {
            for (const p of group) {
              const td = ROOM_SYMBOL_MAP[p]
              const d = group.length === 1 ? r.data : r.data?.[td]
              if (Array.isArray(d?.values)) { setCache(`${keyPrefix}_${p}`, d.values); out[p] = d.values; got++ }
            }
          }
        } catch (e) { console.warn(`⚠️ Candle chunk (${interval} ${syms.join(',')}) failed: ${e?.message}`) }
      }
      console.log(`📈 [candles ${interval}] fetched ${got}/${stale.length} fresh`)
    }
    // Per-symbol stale fallback: any stale symbol we couldn't (re)fetch this run uses its LAST
    // cached candle (even if expired) instead of dropping out → caller gets data, not a SKIP.
    let staleUsed = 0
    for (const p of stale) {
      if (out[p]) continue
      const cached = getCached(`${keyPrefix}_${p}`)
      if (Array.isArray(cached)) { out[p] = cached; staleUsed++ }
    }
    if (staleUsed) console.log(`📈 [candles ${interval}] ${staleUsed} from stale cache (throttled/failed)`)
  }
  return out   // { PAIR: values[] }
}
// Daily candles: 10-min shared TTL for v1 (its room/exhaustion read wants intraday freshness).
const getDailyCandles  = (pairs) => fetchCandlesBatch(pairs, '1day',  10 * 60 * 1000,      'tdcandle_d')
// Weekly candles: 6h shared TTL (weekly ATR is a slow, weekly buffer)
const getWeeklyCandles = (pairs) => fetchCandlesBatch(pairs, '1week', 6 * 60 * 60 * 1000, 'tdcandle_w')

// v2 daily candles: OWN key (tdcandle_dv2) + 6h TTL, so the 30-min shadow cron reuses them and
// refetches at most once per 6h (PDH/PDL + ADR are daily, static within the day). v1 untouched.
// COLD-START SEED: tdAcquire allows a burst of up to 7 at once, which still 429s a fresh fill (harder
// on a closed-market Saturday). So seed SLOWLY — one symbol every ~10s — and DB-persist after EACH
// symbol so a partial seed survives a mid-fill 429 and the next run resumes where it left off.
const V2_DAILY_TTL = 6 * 60 * 60 * 1000
const V2_SEED_GAP_MS = 10 * 1000
async function getV2DailyCandles(pairs) {
  const wanted = [...new Set(pairs)].filter(p => ROOM_SYMBOL_MAP[p])
  const out = {}
  const stale = []
  for (const p of wanted) {
    if (isCacheFreshFor(`tdcandle_dv2_${p}`, V2_DAILY_TTL)) out[p] = getCached(`tdcandle_dv2_${p}`)
    else stale.push(p)
  }

  // Load the DB snapshot once — used both as the MERGE BASE for persistence and as the recovery
  // source, so a partial re-seed never overwrites previously-good symbols in the snapshot.
  let _db = null
  const loadDb = async () => { if (_db === null) _db = (await v2LoadSnapshot('daily_candles_v2')) || {}; return _db }

  // Slow, paced seed of stale/cold symbols — one at a time, ~10s apart. Guarded so only one seeding
  // pass runs at a time (a run's first getPairMarket call seeds all; later pairs hit the warm cache).
  if (stale.length && !isCacheFreshFor('tdcandle_dv2_seeding', 3 * 60 * 1000)) {
    setCache('tdcandle_dv2_seeding', 1)
    const base = await loadDb()   // merge base — keeps prior-good symbols we don't re-seed this pass
    let got = 0
    for (const p of stale) {
      try {
        await tdAcquire(1)
        const r = await axios.get('https://api.twelvedata.com/time_series', {
          params: { symbol: ROOM_SYMBOL_MAP[p], interval: '1day', outputsize: 15, apikey: process.env.TWELVEDATA_API_KEY }
        })
        if (r.data?.code) {
          console.warn(`⚠️ [v2 candles] ${p} error code=${r.data.code} "${r.data.message || ''}"`)
        } else if (Array.isArray(r.data?.values)) {
          setCache(`tdcandle_dv2_${p}`, r.data.values); out[p] = r.data.values; base[p] = r.data.values; got++
          // incremental persist of the MERGED snapshot — a partial seed survives a later 429
          v2SaveSnapshot('daily_candles_v2', base)
        }
      } catch (e) { console.warn(`⚠️ [v2 candles] ${p} fetch failed: ${e?.message}`) }
      await new Promise(res => setTimeout(res, V2_SEED_GAP_MS))   // slow stagger (cold seed only)
    }
    console.log(`📈 [v2 candles] slow-seed ${got}/${stale.length} fetched → ${Object.keys(out).length}/${wanted.length} present`)
  }

  // Anything still missing: expired in-memory cache → then DB snapshot (survives restarts / partial seed).
  const missing = wanted.filter(p => !Array.isArray(out[p]))
  if (missing.length) {
    let recovered = 0
    for (const p of missing) { const old = getCached(`tdcandle_dv2_${p}`); if (Array.isArray(old)) { out[p] = old; recovered++ } }
    const stillMissing = wanted.filter(p => !Array.isArray(out[p]))
    if (stillMissing.length) {
      const snap = await loadDb()
      for (const p of stillMissing) { if (Array.isArray(snap[p])) { out[p] = snap[p]; setCache(`tdcandle_dv2_${p}`, snap[p]); recovered++ } }
    }
    if (recovered) console.log(`📈 [v2 candles] recovered ${recovered}/${missing.length} from stale/DB`)
    const finalMissing = wanted.filter(p => !Array.isArray(out[p]))
    if (finalMissing.length) console.warn(`📈 [v2 candles] ${finalMissing.length} still missing (${finalMissing.join(',')}) — will seed next run`)
  }

  return out
}

async function getPairRoomBatch(candidates) {
  const symbols = [...new Set(candidates.map(c => c.symbol).filter(s => ROOM_SYMBOL_MAP[s]))]
  if (!symbols.length) return {}
  // 12-min result cache — derived room metrics barely move intraday
  const roomCacheKey = `room_${symbols.slice().sort().join('_')}`
  if (isCacheFreshFor(roomCacheKey, 12 * 60 * 1000)) return getCached(roomCacheKey)
  try {
    const candles = await getDailyCandles(symbols)   // shared per-symbol cache (both engines)
    const out = {}
    for (const c of candidates) {
      const vals = candles[c.symbol]
      if (!Array.isArray(vals) || vals.length < 3) continue
      const pip = /JPY/.test(c.symbol) ? 0.01 : /XAU/.test(c.symbol) ? 0.1 : 0.0001
      const completed = vals.slice(1)
      const adr = completed.reduce((s, x) => s + (parseFloat(x.high) - parseFloat(x.low)), 0) / completed.length
      const today = vals[0]
      const open = parseFloat(today.open), cur = parseFloat(today.close)
      const adrPips = adr / pip
      const fromOpen = (cur - open) / pip // + = up
      const favorable = c.action === 'BUY' ? Math.max(fromOpen, 0) : Math.max(-fromOpen, 0)
      const pctUsed = adrPips ? Math.min(favorable / adrPips, 1) : 0
      out[c.symbol] = { adrPips: +adrPips.toFixed(0), favorablePips: +favorable.toFixed(0), pctUsed: Math.round(pctUsed * 100), roomScore: +(1 - pctUsed).toFixed(2) }
    }
    if (Object.keys(out).length) setCache(roomCacheKey, out)
    return out
  } catch (e) { console.error('⚠️ Pair room batch failed:', e?.message); const st = getCached(roomCacheKey); return st || {} }
}

const EXHAUST_DIRPCT = 150 // 1.5x ADR — beyond this, a directional move is exhausted; no fresh setup in that direction

// getMoveContext's dirPct is UNCAPPED (unlike room.roomScore, which caps at 100%) — it can read
// 150+, which is what lets us detect a move that has gone 1.5x+ beyond a normal daily range.
// moveDir comes from fromOpenPips' sign: > 0 = 'UP', < 0 = 'DOWN'.
function isPairExhausted(dirPct, biasAction, moveDir) {
  if (dirPct == null || !biasAction || !moveDir) return false
  const biasWantsUp = String(biasAction).toUpperCase() === 'BUY'
  const moveIsUp = String(moveDir).toUpperCase() === 'UP'
  return (biasWantsUp === moveIsUp) && dirPct > EXHAUST_DIRPCT
}

// ── STAGE 1: MOVE POTENTIAL SCORING ──
// Picks the pair most likely to deliver a catchable move today, combining:
// strength divergence (conviction) + room left (ADR) + upcoming catalyst + ADR size + fresh news.
const NEWS_KW = {
  USD: ['fed', 'dollar', 'powell', 'fomc', 'treasury', 'u.s.'], EUR: ['ecb', 'euro', 'lagarde', 'eurozone'],
  GBP: ['boe', 'pound', 'sterling', 'bailey', 'britain'], JPY: ['boj', 'yen', 'ueda', 'japan'],
  AUD: ['rba', 'aussie', 'australia'], CAD: ['boc', 'loonie', 'canada'],
  CHF: ['snb', 'franc', 'swiss'], NZD: ['rbnz', 'kiwi', 'new zealand'],
  XAU: ['gold', 'safe haven', 'precious', 'bullion', 'xau', 'haven demand', 'risk aversion']
}
function scorePairPotential(candidates, room, events, newsTitles) {
  const now = Date.now()
  const upHigh = (events || []).filter(e => e.time && (e.impact || '').toLowerCase() === 'high' && new Date(e.time).getTime() > now)
  const titles = (newsTitles || []).map(t => String(t).toLowerCase())
  return candidates.map(c => {
    const base = c.symbol.slice(0, 3), quote = c.symbol.slice(3)
    const strengthScore = Math.max(0, Math.min(c.diff / 70, 1))            // conviction
    const r = room[c.symbol]
    const roomScore = r ? r.roomScore : 0.5                                // 1=fresh, 0=exhausted
    const adrPips = r ? r.adrPips : null
    const adrScore = adrPips ? Math.max(0.1, Math.min(adrPips / 120, 1)) : 0.5 // can it move 50-100p?
    // catalyst: nearest upcoming high-impact event on base/quote currency
    let eventScore = 0, nextEvent = null
    for (const e of upHigh) {
      const ec = (e.country || '').toUpperCase()
      if (ec !== base && ec !== quote) continue
      const mins = (new Date(e.time).getTime() - now) / 60000
      const s = mins <= 240 ? 1.0 : mins <= 16 * 60 ? 0.7 : 0
      if (s > eventScore) { eventScore = s; nextEvent = { event: e.event, country: ec, mins: Math.round(mins) } }
    }
    // fresh news momentum on either currency
    let newsScore = 0
    for (const cur of [base, quote]) {
      const kws = NEWS_KW[cur] || []
      if (titles.some(t => kws.some(k => t.includes(k)))) { newsScore = 1; break }
    }
    const potential = +(0.28 * eventScore + 0.27 * strengthScore + 0.20 * roomScore + 0.15 * adrScore + 0.10 * newsScore).toFixed(3)
    return { ...c, base, quote, strengthScore, roomScore, adrPips, adrScore, eventScore, nextEvent, newsScore, potential }
  }).sort((a, b) => b.potential - a.potential)
}
function potentialNote(p) {
  const bits = []
  if (p.nextEvent) bits.push(`${p.nextEvent.country} event ${p.nextEvent.mins < 60 ? p.nextEvent.mins + 'm' : Math.round(p.nextEvent.mins / 60) + 'h'} away`)
  if (p.adrPips) bits.push(`ADR ${p.adrPips}p`)
  if (p.roomScore != null) bits.push(`${Math.round(p.roomScore * 100)}% room left`)
  if (p.newsScore) bits.push('active news')
  return bits.join(' · ')
}

// Reusable AI bias generator — used by both the /api/bias route and the Today's Bias scheduler.

// ── STEP 2: AI-powered pair selection ──
// Builds candidates list including XAUUSD (gold), which can't come from currency-strength diff
function buildCandidatesWithGold(ranked, strength) {
  const candidates = ranked.slice(0, 8) // take top 8 FX pairs (wider net for AI)
  if (!candidates.some(c => c.symbol === 'XAUUSD')) {
    const usdStr = strength?.currencies?.find(c => c.currency === 'USD')?.strength ?? 50
    // Gold is roughly inverse-USD + safe-haven; preliminary direction for room calc only
    const goldAction = usdStr < 50 ? 'BUY' : 'SELL'
    const goldDiff = Math.abs(50 - usdStr)
    candidates.push({ symbol: 'XAUUSD', pair: 'XAUUSD', action: goldAction, diff: goldDiff, isGold: true })
  }
  return candidates
}

// Fixed candidate list — all major pairs + gold (no strength-based pre-filter)
const BIAS_CANDIDATES = ['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','EURGBP','EURJPY','GBPJPY','AUDJPY','XAUUSD']
  .map(s => ({ symbol: s, pair: s }))

// Build cross-asset context from existing price/room data (no extra API calls)
function buildCrossAssetContext(room, liveAssets, yields) {
  const lines = []
  // ── Real cross-asset data (if available) ──
  if (liveAssets) {
    if (liveAssets.DXY) lines.push(`DXY (US Dollar Index): ${liveAssets.DXY.price} (${liveAssets.DXY.change > 0 ? '+' : ''}${liveAssets.DXY.change}% — ${liveAssets.DXY.change > 0 ? 'USD STRENGTHENING → bearish for gold/XAU & risk currencies' : liveAssets.DXY.change < 0 ? 'USD WEAKENING → bullish for gold/XAU & risk currencies' : 'flat'}${liveAssets.DXY.price > 100 ? ' | DXY ABOVE 100 = strong-dollar regime, structural headwind for gold' : ''})`)
    if (liveAssets.VIX) lines.push(`VIX (Fear Index): ${liveAssets.VIX.price} — ${liveAssets.VIX.price > 25 ? 'HIGH FEAR' : liveAssets.VIX.price > 18 ? 'ELEVATED' : 'LOW/CALM'}`)
    if (liveAssets.SPY) lines.push(`S&P 500 proxy (SPY): ${liveAssets.SPY.price} (${liveAssets.SPY.change > 0 ? '+' : ''}${liveAssets.SPY.change}%)`)
    if (liveAssets.TLT) lines.push(`US Bonds proxy (TLT): ${liveAssets.TLT.price} (${liveAssets.TLT.change > 0 ? '+' : ''}${liveAssets.TLT.change}% intraday — NOTE: single-day TLT move is noise; trust the US 2Y/10Y yields below for true rate direction, not this)`)
  }
  // ── US Treasury yields (TwelveData US2Y/US10Y, FRED fallback) — USD rate-expectations driver ──
  if (yields) {
    if (yields.y2) {
      const bps = Math.round(yields.y2.change * 100)
      lines.push(`US 2Y yield: ${yields.y2.value}% (${bps > 0 ? '+' : ''}${bps}bps today — ${bps > 0 ? 'rising → USD-supportive (hawkish repricing)' : bps < 0 ? 'falling → USD-negative (dovish repricing)' : 'flat'})`)
    }
    if (yields.y10) {
      const bps = Math.round(yields.y10.change * 100)
      lines.push(`US 10Y yield: ${yields.y10.value}% (${bps > 0 ? '+' : ''}${bps}bps today)`)
    }
  }
  // ── Proxy signals from FX price action (always available) ──
  const g = (sym) => room[sym] || {}
  const eurusd = g('EURUSD'), gbpusd = g('GBPUSD'), usdjpy = g('USDJPY'), audusd = g('AUDUSD')
  const usdBearish = [eurusd, gbpusd, audusd].filter(r => r.fromOpenPips > 0).length + (usdjpy.fromOpenPips < 0 ? 1 : 0)
  const usdBullish = [eurusd, gbpusd, audusd].filter(r => r.fromOpenPips < 0).length + (usdjpy.fromOpenPips > 0 ? 1 : 0)
  if (!liveAssets?.DXY) {
    if (usdBearish >= 3) lines.push('DXY PROXY (from FX): USD WEAKENING (3+ pairs confirming)')
    else if (usdBullish >= 3) lines.push('DXY PROXY (from FX): USD STRENGTHENING (3+ pairs confirming)')
    else lines.push('DXY PROXY (from FX): USD MIXED')
  }
  const audjpy = g('AUDJPY'), gold = g('XAUUSD')
  if (audjpy.fromOpenPips > 3 && gold.fromOpenPips < 0) lines.push('RISK SENTIMENT (from FX): RISK-ON (AUDJPY up + gold down)')
  else if (audjpy.fromOpenPips < -3 && gold.fromOpenPips > 0) lines.push('RISK SENTIMENT (from FX): RISK-OFF (AUDJPY down + gold up)')
  else lines.push('RISK SENTIMENT (from FX): NEUTRAL')
  if (usdjpy.fromOpenPips < -5) lines.push('JPY: STRENGTHENING today (USDJPY falling)')
  else if (usdjpy.fromOpenPips > 5) lines.push('JPY: WEAKENING today (USDJPY rising)')
  return lines.join('\n')
}

// Fetch real cross-asset data from TwelveData — 30min cache. UUP (dollar ETF) and VIXY (VIX ETF)
// are added as proxies for DXY/VIX, which the TwelveData Basic plan does not serve as indices.
// US2Y/US10Y (Treasury yield quotes) ride along in the SAME batch — market-sourced and same-day,
// they are the primary source for fetchYields() (FRED publishes 1-2 business days late).
const CROSS_ASSET_CORE = 'DXY,VIX,SPY,TLT,UUP,VIXY'
const CROSS_ASSET_BONDS = 'US2Y,US10Y'
let _tdBondFails = 0             // consecutive batches that came back with no US2Y/US10Y data
const TD_BOND_MAX_FAILS = 3      // after this, stop paying credits for them (FRED fallback takes over)
async function fetchCrossAssetLive() {
  if (isCacheFreshFor('cross_asset_live', 30 * 60 * 1000)) return getCached('cross_asset_live')
  const key = process.env.TWELVEDATA_API_KEY
  if (!key) return null
  const withBonds = _tdBondFails < TD_BOND_MAX_FAILS
  const symbols = withBonds ? `${CROSS_ASSET_CORE},${CROSS_ASSET_BONDS}` : CROSS_ASSET_CORE
  try {
    // 8 symbols = 8 credits, exactly the Basic-8 per-minute allowance. tdAcquire clamps the
    // reservation to TD_CAP (7) — safe here, because logging 7 locks out every other TwelveData
    // call for the rest of the window, so the 1 credit of headroom absorbs the 8th symbol.
    await tdAcquire(String(symbols).split(',').length)
    const r = await axios.get(`https://api.twelvedata.com/quote?symbol=${symbols}&apikey=${key}`, { timeout: 10000 })
    const result = {}
    for (const sym of symbols.split(',')) {
      const d = r.data[sym] || r.data
      // bond quotes (US2Y/US10Y) may key the level as `price` rather than `close` — accept either
      const px = d && d.close != null && d.close !== '' ? d.close : d?.price
      if (d && px && !d.code) {
        result[sym] = {
          price: parseFloat(px),
          change: parseFloat(d.percent_change || 0),
          prev: parseFloat(d.previous_close || px),
          absChange: d.change != null && d.change !== '' ? parseFloat(d.change) : null,  // raw-unit change (= percentage points for yields)
          datetime: d.datetime || null                                                   // last print — freshness check
        }
      }
    }
    if (Object.keys(result).length > 0) {
      if (withBonds) {
        if (result.US2Y || result.US10Y) _tdBondFails = 0
        else if (++_tdBondFails >= TD_BOND_MAX_FAILS) console.log(`📈 Cross-asset: ${CROSS_ASSET_BONDS} returned no data ${TD_BOND_MAX_FAILS}x — dropped from batch, yields fall back to FRED`)
      }
      setCache('cross_asset_live', result)
      console.log(`📈 Cross-asset live: ${Object.keys(result).join(', ')}`)
      return result
    }
    // empty result — never overwrite a good cache; fall back to stale
    if (withBonds) _tdBondFails++   // a plan/symbol rejection can fail the whole batch — don't keep it forever
    const staleEmpty = getCached('cross_asset_live')
    if (staleEmpty) { console.log('📈 Cross-asset empty — using stale cache'); return staleEmpty }
  } catch (e) {
    // Only blame the bond symbols for a request-level rejection (unknown symbol / not on plan) —
    // not for a network hiccup or a 429, which would otherwise drop them for the whole process.
    const st = e?.response?.status
    if (withBonds && st >= 400 && st < 500 && st !== 429) _tdBondFails++
    const stale = getCached('cross_asset_live')
    if (stale) { console.log(`📈 Cross-asset fetch failed (${e?.message}) — using stale cache`); return stale }
    console.log(`📈 Cross-asset fetch failed: ${e?.message} — using FX proxies`)
  }
  return null
}

// Fetch US Treasury yields (2yr + 10yr) — 30min cache, matching the cross-asset batch cadence.
// PRIMARY: TwelveData US2Y/US10Y. Market-sourced and same-day, and they ride along in the
// cross-asset batch, so this path costs no extra TwelveData credits.
// FALLBACK: FRED DGS2/DGS10, applied PER SERIES. TwelveData routinely serves US2Y but not US10Y,
// and the old "return as soon as EITHER exists" shape meant y10 stayed null forever and the FRED
// fallback never fired. Each leg now fills independently. FRED publishes 1-2 BUSINESS DAYS late,
// which is fine for the 10Y (a LEVEL input only) but not for the 2Y, which carries direction —
// `fred_stale` therefore tracks the 2Y leg specifically.
// Shape: { y2:{value,change,date}, y10:{...}, source, fred_date, fred_stale }
const YIELDS_TTL = 30 * 60 * 1000
async function fetchYields() {
  const cachedY = getCached('yields_fred')
  if (isCacheFreshFor('yields_fred', YIELDS_TTL) && cachedY) return cachedY
  const fmt = (o) => o ? `${o.value}% (${o.change > 0 ? '+' : ''}${Math.round(o.change * 100)}bps) @ ${o.datetime || o.date}` : 'n/a'

  // ── FRED single-series reader (used as a per-leg gap filler AND as the full fallback) ──
  const key = process.env.FRED_API_KEY?.trim()
  if (!key) console.warn('🏦 FRED: FRED_API_KEY not set in env — no yields fallback')
  const getSeries = async (id) => {
    if (!key) return null
    const maskedUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=***&file_type=json&sort_order=desc&limit=8`
    try {
      const r = await axios.get(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=8`, { timeout: 10000 })
      const obs = r.data?.observations || []
      const vals = obs.map(o => ({ date: o.date, v: parseFloat(o.value) })).filter(o => !isNaN(o.v))   // FRED uses "." for holidays
      if (!vals.length) { console.warn(`🏦 FRED ${id}: HTTP ${r.status}, ${obs.length} obs, 0 numeric — ${maskedUrl}`); return null }
      const latest = vals[0], prev = vals[1] || vals[0]
      return { value: latest.v, change: +(latest.v - prev.v).toFixed(2), date: latest.date } // change in percentage points
    } catch (e) {
      console.warn(`🏦 FRED ${id} error: status=${e?.response?.status ?? 'n/a'} msg="${e?.message}" body=${JSON.stringify(e?.response?.data || '').slice(0, 120)} — ${maskedUrl}`)
      return null
    }
  }

  // ── PRIMARY: TwelveData US2Y / US10Y ──
  let tdY2 = null, tdY10 = null
  try {
    const x = await fetchCrossAssetLive()
    const fromTd = (q) => {
      const v = q?.price
      if (v == null || isNaN(v)) return null
      // Guard: must look like a YIELD (percent), not a bond price. If TwelveData ever serves a
      // price (~99) here, reject it and let FRED answer rather than feed "99%" to the scorer.
      if (v <= 0 || v > 20) { console.warn(`🏦 Yields: TwelveData level ${v} outside plausible yield range — ignoring`); return null }
      // FRED's `change` is the 1-day move in PERCENTAGE POINTS — mirror that, NOT percent_change.
      // previous_close is in the same unit as the level, so its difference is unambiguous; prefer it
      // over the vendor `change` field, whose unit (points vs bps) isn't guaranteed for bond quotes.
      let chg = (q.prev != null && !isNaN(q.prev) && q.prev !== v) ? v - q.prev
        : (q.absChange != null && !isNaN(q.absChange)) ? q.absChange : 0
      // A >1.5pp single-day move in a Treasury yield is not real — assume a unit mismatch and
      // report no day-change rather than a bogus bps figure. The LEVEL is still good, and v2's
      // direction comes off the multi-session level history anyway, not this field.
      if (Math.abs(chg) > 1.5) { console.warn(`🏦 Yields: implausible day-change ${chg} on level ${v} — reporting 0`); chg = 0 }
      return {
        value: +v.toFixed(3),
        change: +chg.toFixed(3),
        date: (q.datetime || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
        datetime: q.datetime || null
      }
    }
    tdY2 = fromTd(x?.US2Y); tdY10 = fromTd(x?.US10Y)
    if (!tdY2 && !tdY10) console.log('🏦 Yields: TwelveData US2Y/US10Y not in cross-asset batch — trying FRED fallback')
    else if (!tdY10) console.log('🏦 Yields: TwelveData served US2Y but not US10Y — filling 10Y from FRED DGS10')
    else if (!tdY2) console.log('🏦 Yields: TwelveData served US10Y but not US2Y — filling 2Y from FRED DGS2')
  } catch (e) {
    console.log(`🏦 Yields: TwelveData US2Y/US10Y failed (${e?.message}) — trying FRED fallback`)
  }

  // ── PER-LEG FRED FILL (DGS2 / DGS10) ──
  try {
    const [fredY2, fredY10] = await Promise.all([
      tdY2 ? null : getSeries('DGS2'),
      tdY10 ? null : getSeries('DGS10'),
    ])
    const y2 = tdY2 || fredY2, y10 = tdY10 || fredY10
    if (!y2 && !y10) {
      if (cachedY) { console.log('🏦 Yields empty (TwelveData + FRED) — using stale cache'); return cachedY }
      return null
    }
    // fred_date reports which FRED print (if any) is in play; fred_stale tracks the 2Y leg only,
    // because that is the leg the v2 direction is built from.
    const fredDate = (tdY2 ? null : fredY2?.date) || (tdY10 ? null : fredY10?.date) || null
    const source = (tdY2 && tdY10) ? 'twelvedata'
      : (tdY2 || tdY10) ? 'twelvedata+fred'
      : 'fred-fallback'
    const result = { y2, y10, source, fred_date: fredDate, fred_stale: !tdY2 }
    setCache('yields_fred', result)
    console.log(`🏦 Yields FRESHNESS: source=${source}${!tdY2 ? ' (2Y on 1-2 business day govt lag)' : ''} · 2Y ${fmt(y2)} · 10Y ${fmt(y10)} · fred_date=${fredDate || 'n/a'}`)
    return result
  } catch (e) { if (cachedY) { console.log(`🏦 Yields fetch failed (${e?.message}) — using stale cache`); return cachedY } console.log(`🏦 Yields fetch failed: ${e?.message}`); return null }
}

// Fetch latest US economic ACTUALS from FRED (free) — fills the surprise gap the FF feed lacks. 12h cache.
// 2-YEAR GOVERNMENT YIELDS — the primary FX driver (rate differentials). All three sources are free
// and daily. TwelveData carries no sovereign yield series, so each central bank is queried directly:
//   USD → FRED DGS2 | EUR → ECB AAA yield curve 2Y | CAD → Bank of Canada Valet (no key needed)
// We keep BOTH the level and the 1-day change; the CHANGE is what actually moves FX.
const RATE_TTL = 60 * 60 * 1000   // 1h — these are daily series, no need to hammer them
// v2's macro scorer needs a 3-SESSION change (today vs 3 sessions back = 4 levels). Keep 8 so a
// holiday or a single missing print doesn't drop a currency out of the cross-section.
const RATE_HISTORY_KEEP = 8
let lastGoodRates = null
async function fetchRateDifferentials() {
  const cached = getCached('rate_diffs_v2')
  if (isCacheFreshFor('rate_diffs_v2', RATE_TTL) && cached) return cached
  // `history` (newest first) is what the v2 cross-sectional macro scorer needs: it derives each
  // currency's 3-SESSION change and then that currency's deviation from the G10 mean. `change`
  // (1-day) is kept for the prompt's rates block and for v1 compatibility.
  const pick = (rows) => rows.length >= 2
    ? {
        value: rows[0].v,
        change: +(rows[0].v - rows[1].v).toFixed(3),
        date: rows[0].d,
        history: rows.slice(0, RATE_HISTORY_KEEP).map(r => ({ d: r.d, v: r.v })),
      }
    : null
  const desc = (rows) => rows.sort((a, b) => (a.d < b.d ? 1 : -1))
  const out = {}
  // USD — FRED DGS2 (daily 2Y constant maturity). '.' marks a holiday/no-print day.
  try {
    const key = (process.env.FRED_API_KEY || '').trim()
    if (key) {
      const r = await axios.get('https://api.stlouisfed.org/fred/series/observations', {
        params: { series_id: 'DGS2', api_key: key, file_type: 'json', sort_order: 'desc', limit: 12 },
        timeout: 12000,
      })
      const rows = (r.data?.observations || [])
        .filter(o => o.value !== '.')
        .map(o => ({ d: o.date, v: parseFloat(o.value) }))
        .filter(o => !isNaN(o.v))
      out.USD = pick(desc(rows))
    }
  } catch (e) { console.warn(`⚠️ [rates] USD/FRED failed: ${e?.message}`) }
  // EUR — ECB SDMX. Observations are index-keyed; the index maps into structure.dimensions.observation[0].values.
  try {
    const r = await axios.get('https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y', {
      params: { lastNObservations: 12, format: 'jsondata' }, timeout: 12000,
    })
    const j = r.data
    const series = j?.dataSets?.[0]?.series
    const k = series && Object.keys(series)[0]
    const obs = k ? series[k].observations : null
    const times = j?.structure?.dimensions?.observation?.[0]?.values || []
    if (obs) {
      const rows = Object.entries(obs)
        .map(([i, v]) => ({ d: times[+i]?.id, v: v[0] }))
        .filter(o => o.d != null && o.v != null)
        .map(o => ({ d: o.d, v: +(+o.v).toFixed(3) }))
      out.EUR = pick(desc(rows))
    }
  } catch (e) { console.warn(`⚠️ [rates] EUR/ECB failed: ${e?.message}`) }
  // CAD — Bank of Canada Valet, no API key required.
  try {
    const id = 'BD.CDN.2YR.DQ.YLD'
    const r = await axios.get(`https://www.bankofcanada.ca/valet/observations/${id}/json`, {
      params: { recent: 12 }, timeout: 12000,
    })
    const rows = (r.data?.observations || [])
      .map(o => ({ d: o.d, v: parseFloat(o[id]?.v) }))
      .filter(o => !isNaN(o.v))
    out.CAD = pick(desc(rows))
  } catch (e) { console.warn(`⚠️ [rates] CAD/BoC failed: ${e?.message}`) }
  // GBP — Bank of England IADB CSV, no key. BoE publishes daily gilt yields at 5y/10y/20y only (no 2y),
  // so IUDSNPY (5y nominal par) is the short-end proxy for UK rate expectations.
  try {
    const d = new Date(), p2 = n => String(n).padStart(2, '0')
    const MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const from = new Date(d.getTime() - 20 * 86400000)
    const fmt = x => `${p2(x.getDate())}/${MONS[x.getMonth()]}/${x.getFullYear()}`
    const r = await axios.get('https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp', {
      params: { 'csv.x': 'yes', Datefrom: fmt(from), Dateto: fmt(d), SeriesCodes: 'IUDSNPY', CSVF: 'TN', UsingCodes: 'Y', VPD: 'Y', VFD: 'N' },
      timeout: 15000, responseType: 'text',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },   // BoE rejects unknown agents
    })
    const MON = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' }
    const lines = String(r.data).split(/\r?\n/).filter(Boolean)
    const col = (lines[0] || '').split(',').indexOf('IUDSNPY')
    if (col > 0) {
      const rows = lines.slice(1).map(l => {
        const c = l.split(','), m = (c[0] || '').trim().match(/^(\d{2}) (\w{3}) (\d{4})$/)
        if (!m || !MON[m[2]]) return null
        const v = parseFloat(c[col]); return isNaN(v) ? null : { d: `${m[3]}-${MON[m[2]]}-${m[1]}`, v }
      }).filter(Boolean)
      out.GBP = pick(desc(rows))
    }
  } catch (e) { console.warn(`⚠️ [rates] GBP/BoE failed: ${e?.message}`) }

  // JPY — Japan MoF daily JGB CSV, no key. Latin-1/Shift-JIS text with a banner row before the real
  // header, so we locate the 'Date,' header row and read the 2Y column.
  // TWO FILES, and both are needed. `jgbcme.csv` is MONTH-TO-DATE only — on the 6th of a month it
  // holds 3 rows, which cannot produce a 3-session change, so JPY would silently drop out of the
  // cross-section for the first days of EVERY month. `historical/jgbcme_all.csv` carries the full
  // series but publishes a few days late. Read the fresh one first and only pay for the 1.2MB
  // historical file when the month-to-date file is too short to cover the lookback.
  const mofParse = (buf) => {
    const lines = Buffer.from(buf).toString('latin1').split(/\r?\n/)
    const hi = lines.findIndex(l => /^Date,/i.test(l))
    const col = hi >= 0 ? lines[hi].split(',').findIndex(h => h.trim() === '2Y') : -1
    if (col <= 0) return []
    return lines.slice(hi + 1).map(l => {
      const c = l.split(','), m = (c[0] || '').trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
      if (!m) return null
      const v = parseFloat(c[col]); return isNaN(v) ? null : { d: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, v }
    }).filter(Boolean)
  }
  const mofGet = async (path) => (await axios.get(
    `https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/${path}`,
    { timeout: 20000, responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } },
  )).data
  try {
    let rows = mofParse(await mofGet('jgbcme.csv'))
    const mtdCount = rows.length
    if (mtdCount < RATE_HISTORY_KEEP) {
      try {
        const hist = mofParse(await mofGet('historical/jgbcme_all.csv'))
        const byDate = new Map(hist.map(r => [r.d, r.v]))
        for (const r of rows) byDate.set(r.d, r.v)          // month-to-date wins — it's fresher
        rows = [...byDate.entries()].map(([d, v]) => ({ d, v }))
        console.log(`   [rates] JPY: month-to-date had ${mtdCount} rows (< ${RATE_HISTORY_KEEP}) — merged MoF historical (${hist.length})`)
      } catch (e) { console.warn(`⚠️ [rates] JPY/MoF historical failed: ${e?.message}`) }
    }
    if (rows.length) out.JPY = pick(desc(rows))
  } catch (e) { console.warn(`⚠️ [rates] JPY/MoF failed: ${e?.message}`) }

  // AUD — RBA table F2 (daily CSV, no key). Metadata block sits above the data; we locate the
  // 'Series ID' row and read the FCMYGBAG2D column (interpolated 2-year government bond yield).
  try {
    const r = await axios.get('https://www.rba.gov.au/statistics/tables/csv/f2-data.csv', {
      timeout: 20000, responseType: 'arraybuffer',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    })
    const lines = Buffer.from(r.data).toString('latin1').split(/\r?\n/)
    const idRow = lines.findIndex(l => /^Series ID,/i.test(l))
    const col = idRow >= 0 ? lines[idRow].split(',').findIndex(h => h.trim() === 'FCMYGBAG2D') : -1
    if (col > 0) {
      const MON2 = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' }
      // Only the tail matters and this file carries 60k+ historical rows (plus trailing blanks),
      // so drop empties and scan from the end.
      const rows = lines.filter(l => l.trim() && l.trim() !== ','.repeat(l.trim().length)).slice(-40).map(l => {
        const c = l.split(','), m = (c[0] || '').trim().match(/^(\d{2})-(\w{3})-(\d{4})$/)
        if (!m || !MON2[m[2]]) return null
        const v = parseFloat(c[col]); return isNaN(v) ? null : { d: `${m[3]}-${MON2[m[2]]}-${m[1]}`, v }
      }).filter(Boolean)
      out.AUD = pick(desc(rows))
    }
  } catch (e) { console.warn(`⚠️ [rates] AUD/RBA failed: ${e?.message}`) }

  // NZD — RBNZ table B2 "daily close" workbook. RBNZ discontinued the B2 CSV, so an .xlsx (~445KB)
  // is the only machine-readable form left. INM.DG102.NZZCF = 2-year secondary-market government
  // bond closing yield — a TRUE 2y, unlike the GBP 5y proxy. Published with a ~1 business day lag.
  //
  // Three things here are deliberate:
  //   - the column is resolved by SERIES ID, never by position. Two header rows sit above the ids
  //     and RBNZ has reordered columns before; a fixed index would silently read a different
  //     maturity, which is far worse than dropping out.
  //   - dates are read as RAW Excel serials. With cellDates the parser builds Dates in LOCAL time
  //     and toISOString() then shifts them a day backwards on a UTC+ host — and a one-day skew is
  //     enough to trip the contemporaneity check in computeMacroRateScores.
  //   - a full browser header set is required, not just a User-Agent. rbnz.govt.nz returned 200 to a
  //     UA-only request from a residential IP but 403 from Railway, so the edge is scoring the whole
  //     request, not the agent string. Sending the headers a real browser download carries — Accept,
  //     Accept-Language, Referer from the B2 page, and the Sec-Fetch-* set — is the cheap fix to try
  //     before resorting to a third-party fetch-through, which would put someone else in the data path.
  try {
    const r = await axios.get('https://www.rbnz.govt.nz/-/media/project/sites/rbnz/files/statistics/series/b/b2/hb2-daily-close.xlsx', {
      timeout: 30000, responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*;q=0.8',
        'Accept-Language': 'en-NZ,en-GB;q=0.9,en;q=0.8',
        'Referer': 'https://www.rbnz.govt.nz/statistics/series/exchange-and-interest-rates/wholesale-interest-rates',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
      },
    })
    const sheet = XLSX.read(r.data, { type: 'buffer' }).Sheets['Data']
    const grid = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) : []
    const idRow = grid.findIndex(row => String(row?.[0]).trim() === 'Series Id')
    const col = idRow >= 0 ? grid[idRow].findIndex(h => String(h).trim() === 'INM.DG102.NZZCF') : -1
    if (col > 0) {
      const EXCEL_EPOCH = Date.UTC(1899, 11, 30)
      // Only the tail matters — the sheet carries daily rows back to 1985, so walk from the end.
      const rows = []
      for (let i = grid.length - 1; i >= 0 && rows.length < RATE_HISTORY_KEEP + 6; i--) {
        const serial = grid[i]?.[0], v = parseFloat(grid[i]?.[col])
        if (typeof serial !== 'number' || serial < 20000 || isNaN(v)) continue
        rows.push({ d: new Date(EXCEL_EPOCH + serial * 86400000).toISOString().slice(0, 10), v })
      }
      out.NZD = pick(desc(rows))
    } else {
      console.warn('⚠️ [rates] NZD/RBNZ: series INM.DG102.NZZCF not found — B2 sheet layout may have changed')
    }
  } catch (e) { console.warn(`⚠️ [rates] NZD/RBNZ failed: ${e?.message}`) }

  // Per-currency last-good fallback so one flaky source never blanks the whole set.
  const merged = { ...out }
  if (lastGoodRates) for (const c of Object.keys(lastGoodRates)) { if (!merged[c] && lastGoodRates[c]) merged[c] = lastGoodRates[c] }
  const fresh = Object.keys(out).filter(c => out[c])
  if (fresh.length) { lastGoodRates = { ...(lastGoodRates || {}), ...Object.fromEntries(fresh.map(c => [c, out[c]])) }; setCache('rate_diffs_v2', merged) }
  console.log(`   [v2 rates] ${fresh.length}/7 fresh → ${Object.entries(merged).map(([c, r]) => `${c}=${r.value}(${r.change >= 0 ? '+' : ''}${r.change})`).join(' ')}`)
  return merged
}
async function fetchUSActuals() {
  if (isCacheFreshFor('us_actuals_fred', 12 * 60 * 60 * 1000)) return getCached('us_actuals_fred')
  const key = process.env.FRED_API_KEY?.trim()
  if (!key) return null
  const SERIES = [
    { id: 'CPIAUCSL', label: 'CPI',                 kind: 'yoy' },
    { id: 'CPILFESL', label: 'Core CPI',            kind: 'yoy' },
    { id: 'PCEPILFE', label: 'Core PCE (Fed gauge)', kind: 'yoy' },
    { id: 'PAYEMS',   label: 'Nonfarm Payrolls',    kind: 'mom_diff' },
    { id: 'UNRATE',   label: 'Unemployment',        kind: 'level' },
    { id: 'RSAFS',    label: 'Retail Sales',        kind: 'mom_pct' },
  ]
  const fetchOne = async (s) => {
    try {
      const r = await axios.get(`https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=${key}&file_type=json&sort_order=desc&limit=14`, { timeout: 10000 })
      const vals = (r.data?.observations || []).map(o => ({ date: o.date, v: parseFloat(o.value) })).filter(o => !isNaN(o.v))
      if (!vals.length) return null
      const latest = vals[0]
      if (s.kind === 'yoy') {
        if (!vals[12]) return null
        const cur = +((latest.v / vals[12].v - 1) * 100).toFixed(1)
        const prev = (vals[1] && vals[13]) ? +((vals[1].v / vals[13].v - 1) * 100).toFixed(1) : null
        return `US ${s.label}: ${cur}% YoY${prev !== null ? ` (prev ${prev}% → ${cur > prev ? 'hotter' : cur < prev ? 'cooler' : 'flat'})` : ''} [${latest.date}]`
      }
      if (s.kind === 'mom_diff') {
        if (!vals[1]) return null
        const cur = Math.round(latest.v - vals[1].v)          // PAYEMS in thousands → jobs added
        const prev = vals[2] ? Math.round(vals[1].v - vals[2].v) : null
        return `US ${s.label}: ${cur >= 0 ? '+' : ''}${cur}k jobs${prev !== null ? ` (prev ${prev >= 0 ? '+' : ''}${prev}k)` : ''} [${latest.date}]`
      }
      if (s.kind === 'mom_pct') {
        if (!vals[1]) return null
        const cur = +((latest.v / vals[1].v - 1) * 100).toFixed(1)
        const prev = vals[2] ? +((vals[1].v / vals[2].v - 1) * 100).toFixed(1) : null
        return `US ${s.label}: ${cur >= 0 ? '+' : ''}${cur}% MoM${prev !== null ? ` (prev ${prev >= 0 ? '+' : ''}${prev}%)` : ''} [${latest.date}]`
      }
      const prevL = vals[1] ? +vals[1].v.toFixed(1) : null    // level (unemployment)
      return `US ${s.label}: ${(+latest.v.toFixed(1))}%${prevL !== null ? ` (prev ${prevL}%)` : ''} [${latest.date}]`
    } catch (e) { return null }
  }
  try {
    const lines = (await Promise.all(SERIES.map(fetchOne))).filter(Boolean)
    if (!lines.length) return null
    const block = lines.join('\n')
    setCache('us_actuals_fred', block)
    console.log(`📑 US actuals (FRED): ${lines.length} series loaded`)
    return block
  } catch (e) { console.log(`📑 US actuals fetch failed: ${e?.message}`); return null }
}

// AI selects the best tradeable pair using MACRO FUNDAMENTALS (not currency strength)
async function selectBestPairAI(candidates, room, calendarData, newsData, cotSummary, recentReleases, crossAssetContext) {
  const candidateLines = candidates.map(c => {
    const r = room[c.symbol]
    const roomInfo = r
      ? `ADR ${r.adrPips}p, ${r.pctUsed}% of ADR used today (${Math.round(r.roomScore * 100)}% room left)`
      : 'room data N/A'
    return `${c.symbol} | ${roomInfo}`
  }).join('\n')

  const prompt = `You are an institutional macro strategist. Select the SINGLE BEST tradeable pair for this session using ONLY fundamental analysis.

AVAILABLE PAIRS:
${candidateLines}

──────────────────────────────
MACRO FUNDAMENTAL DATA
──────────────────────────────

1. BREAKING & RECENT NEWS (scored by impact):
${newsData || 'No recent news available'}

2. UPCOMING HIGH-IMPACT EVENTS (next 24-48h):
${calendarData || 'No upcoming events'}

3. RECENT ECONOMIC RELEASES (past 7 days, high-impact):
${recentReleases || 'No recent release data'}

4. INSTITUTIONAL POSITIONING (CFTC COT — weekly):
${cotSummary || 'Not available'}

5. CROSS-ASSET CONTEXT (calculated from today's price action):
${crossAssetContext || 'Not available'}

──────────────────────────────
HOW TO SELECT
──────────────────────────────

SIGNAL PRIORITY (most → least predictive for an intraday pick):
1. FRESH catalysts — breaking/recent news, an imminent or just-released high-impact event, a clear cross-asset move TODAY (DXY, risk-on/off). These DRIVE intraday direction.
2. Upcoming high-impact event risk — shapes timing & conviction (don't take a strong directional pick right into a coin-flip event).
3. COT positioning — WEEKLY and LAGGING (released Fridays). It only shows where institutions are POSITIONED, not which way price moves today. Use it ONLY to CONFIRM a fresh-catalyst pick or adjust conviction — NEVER as the primary or sole reason to pick a pair.

THINK LIKE A MACRO TRADER:
- What is the DOMINANT macro theme driving FRESH flows right now? (news catalyst, central bank divergence, geopolitics, a cross-asset move today)
- Which pair is MOST affected by that fresh theme — and is there an actual NEW driver, or just stale structural positioning?
- Is the move FRESH (room to run) or already EXHAUSTED (>70% ADR used = late, do not chase)?
- Does COT CONFIRM the fresh-catalyst direction, or conflict with it? (confirm = more conviction; conflict = lower conviction)
- For XAUUSD (gold), apply these directional rules EXPLICITLY:
  • STRONG USD / rising DXY (especially DXY > 100) = BEARISH gold. This usually DOMINATES — a hawkish Fed + strong dollar will crush gold even if other factors look supportive.
  • RISING real yields / hawkish Fed repricing / rate-HIKE expectations = BEARISH gold (higher opportunity cost of holding non-yielding gold).
  • FALLING yields / dovish Fed / rate-CUT expectations = BULLISH gold.
  • Safe-haven demand (geopolitics, risk-off) = BULLISH gold, BUT this is often OVERWHELMED by a strong-dollar/hawkish-Fed regime — do NOT let a geopolitical headline override a dominant USD-strength trend.
  • A single-day TLT bounce is NOT "yields falling" — check the FRED 2Y/10Y yield direction and DXY for the true regime. If DXY is strong and rates are repricing hawkish, gold is BEARISH regardless of one day's TLT tick.
  • The 2Y yield (Fed-policy-sensitive) and DXY matter MORE for gold than the 10Y. A FALLING 10Y does NOT make gold bullish if the 2Y is rising and the Fed is hawkish — short-end rates + the dollar dominate gold's direction. Do not call gold bullish off a falling 10Y alone.

DO NOT:
- Pick based on currency strength scores or momentum indicators
- Pick a pair whose ONLY edge is COT positioning — a pair needs a FRESH catalyst (news / event / cross-asset) to be selected; COT alone is NOT enough
- Pick a pair just because it has the "biggest number" — pick because the FRESH FUNDAMENTAL CASE is strongest
- Pick a pair where the move already happened (>70% ADR used = late)

CONVICTION GUIDE:
- Strong: a clear FRESH catalyst (news/event/cross-asset) AND COT confirms AND the move is not exhausted
- Moderate: a fresh catalyst present, but COT neutral/conflicting or the move partly extended
- Developing: only a weak or single fresh signal — needs confirmation (COT alone NEVER qualifies as "strong")

Return ONLY valid JSON:
{
  "symbol": "USDJPY",
  "direction": "SELL",
  "selectionReasoning": "2-3 sentences: the MACRO CASE for this pair — what fundamental drivers, what catalyst, why NOW",
  "conviction": "strong|moderate|developing",
  "primaryDriver": "e.g. BOJ rate hike / Fed dovish pivot / risk-off",
  "whatWouldFlipIt": "e.g. if BOJ signals no more hikes / if US data beats",
  "runnerUps": [
    { "symbol": "EURUSD", "direction": "BUY", "oneliner": "..." }
  ]
}`

  const m = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: `You are an elite macro fundamental strategist for BiasForge. You generate trading bias from economic data, central bank policy, COT positioning, news catalysts, and cross-asset context — NEVER from technical indicators or currency strength scores. Return ONLY valid JSON.

ANTI-HALLUCINATION: Only cite specific numbers, statistics, or historical claims that are EXPLICITLY present in the data provided to you (price, calendar forecast/previous, news, COT, cross-asset values). NEVER invent or estimate specific figures — especially:
- Historical superlatives like 'X-year low/high', 'weakest since...', 'highest in decades' UNLESS that exact claim appears verbatim in the provided news/data.
- Precise statistics (participation rates, GDP figures, historical averages) that are not in the data you received.
If you want to describe a move as significant, use qualitative language ('sharply weaker', 'notable miss vs forecast') instead of fabricated precise historical claims. When in doubt, describe what the DATA shows, not what you recall from training. A single fabricated number destroys trader trust — accuracy over drama.

NEVER reference internal rule numbers (e.g. 'rule 9', 'rule 8') in your user-facing reasoning output. Rules guide your analysis but must stay invisible to the reader.`,
    messages: [{ role: 'user', content: prompt }]
  })
  trackAI('pair-selection', 'claude-sonnet-4-6', m.usage)
  let raw = m.content[0].text.trim().replace(/```json|```/g, '').trim()
  // Robustness: agar koi prose JSON ke around aa jaye to outermost { ... } slice kar lo
  const jStart = raw.indexOf('{'), jEnd = raw.lastIndexOf('}')
  if (jStart !== -1 && jEnd > jStart) raw = raw.slice(jStart, jEnd + 1)
  return JSON.parse(raw)
}

// Reusable AI bias generator (single pair) — used by /api/bias, Today's Bias lock-refresh, and post-selection deep analysis.
// Returns the bias object (cached for CACHE_TTL per symbol+timeframe). Throws on AI/parse failure.
async function generateBiasFor(symbol, timeframe, force = false) {
  const tf = timeframe || 'intraday'
  const cacheKey = `bias_${symbol}_${tf}`
  if (!force && isCacheFresh(cacheKey)) return getCached(cacheKey)
  const prevBias = getCached(cacheKey) // previous analysis (even if stale) — used for bias continuity

  const symbolMap = { EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY', XAUUSD: 'XAU/USD', GBPJPY: 'GBP/JPY', AUDUSD: 'AUD/USD', USDCAD: 'USD/CAD', USDCHF: 'USD/CHF', NZDUSD: 'NZD/USD', EURJPY: 'EUR/JPY', EURGBP: 'EUR/GBP', NAS100: 'IXIC', BTC: 'BTC/USD' }

  // 1. Fetch current price (with retry — TwelveData free tier rate-limits in bursts)
  let currentPrice = 'unknown'
  for (let attempt = 0; attempt < 3 && currentPrice === 'unknown'; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500 * attempt))
      await tdAcquire(1)
      const pr = await axios.get(`https://api.twelvedata.com/price?symbol=${symbolMap[symbol] || symbol}&apikey=${process.env.TWELVEDATA_API_KEY}`)
      if (pr.data?.price) currentPrice = pr.data.price
    } catch (e) {}
  }

  // 1b. Move-maturity context (ADR vs how much price has already moved today) — powers late-bias detection
  let moveContext = null
  if (currentPrice !== 'unknown' && !isForexClosed()) {
    moveContext = await getMoveContext(symbol, currentPrice)
  }

  // Currency strength intentionally NOT included — bias engine is 100% fundamental
  // (Currency Strength is a separate standalone feature on its own page)

  // 3. Get upcoming calendar events (3 days ahead) — with relative time so the AI never calls a past event "upcoming"
  let calendarData = 'No upcoming events'
  try {
    const now = new Date()
    const ahead = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    const events = (await getEconomicCalendar())
      .filter(e => e.impact?.toLowerCase?.() === 'high' && new Date(e.time) > now && new Date(e.time) < ahead)
      .slice(0, 8)
      .map(e => {
        const mins = Math.round((new Date(e.time) - now) / 60000)
        const rel = mins < 60 ? `in ${mins}min` : mins < 1440 ? `in ${Math.floor(mins / 60)}h ${mins % 60}m` : `in ${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`
        const fcPrev = (e.forecast || e.previous)
          ? ` — forecast: ${e.forecast || 'N/A'}, previous: ${e.previous || 'N/A'}`
          : ''
        return `${e.event} (${e.country}) ${rel}${fcPrev} [${e.time}] - Impact: HIGH`
      })
    if (events.length > 0) calendarData = events.join(' | ')
  } catch (e) {}

  // 4. Get recent high-impact news from cache (cached under 'latest_news', score field is `impact`)
  let newsData = 'No recent high-impact news'
  try {
    const cachedNews = getCached('latest_news')
    if (Array.isArray(cachedNews)) {
      const highImpact = cachedNews
        .filter(a => (a.impact || 0) >= 7)
        .slice(0, 5)
        .map(a => a.title)
      if (highImpact.length > 0) newsData = highImpact.join(' | ')
    }
  } catch (e) {}

  // 5. Extract currencies involved in the pair
  const baseCur = symbol.substring(0, 3)
  const quoteCur = symbol.substring(3, 6)

  

  // 5b. Fresh macro signals: cross-asset + US yields + US actuals (cached — now feeds DIRECTION, not just selection)
  let macroContext = 'Not available'
  try {
    let liveAssets = null, yields = null
    try { liveAssets = await fetchCrossAssetLive() } catch (e) {}
    try { yields = await fetchYields() } catch (e) {}
    const lines = []
    if (liveAssets?.DXY) lines.push(`DXY: ${liveAssets.DXY.price} (${liveAssets.DXY.change > 0 ? '+' : ''}${liveAssets.DXY.change}%)`)
    if (liveAssets?.VIX) lines.push(`VIX: ${liveAssets.VIX.price} — ${liveAssets.VIX.price > 25 ? 'HIGH FEAR' : liveAssets.VIX.price > 18 ? 'ELEVATED' : 'CALM'}`)
    if (liveAssets?.SPY) lines.push(`S&P (SPY): ${liveAssets.SPY.price} (${liveAssets.SPY.change > 0 ? '+' : ''}${liveAssets.SPY.change}% — ${liveAssets.SPY.change >= 0 ? 'risk-on' : 'risk-off'})`)
    if (liveAssets?.TLT) lines.push(`US Bonds (TLT): ${liveAssets.TLT.change > 0 ? '+' : ''}${liveAssets.TLT.change}% (${liveAssets.TLT.change > 0 ? 'yields falling' : 'yields rising'})`)
    if (yields?.y2) { const b = Math.round(yields.y2.change * 100); lines.push(`US 2Y yield: ${yields.y2.value}% (${b > 0 ? '+' : ''}${b}bps — ${b > 0 ? 'USD-supportive' : b < 0 ? 'USD-negative' : 'flat'})`) }
    if (yields?.y10) { const b = Math.round(yields.y10.change * 100); lines.push(`US 10Y yield: ${yields.y10.value}% (${b > 0 ? '+' : ''}${b}bps)`) }
    if (lines.length) macroContext = lines.join('\n')
  } catch (e) {}
  let usActuals = 'Not available'
  try { const a = await fetchUSActuals(); if (a) usActuals = a } catch (e) {}

  // 6. Institutional positioning (COT) for the pair's currencies — weekly CFTC data
  let cotData = 'Not available'
  try {
    const cot = await getCOTData()
    const rel = (cot?.data || []).filter(c => c.currency === baseCur || c.currency === quoteCur)
    if (rel.length) {
      cotData = rel.map(c =>
        `${c.currency}: ${c.bias} (net ${c.netPosition > 0 ? '+' : ''}${c.netPosition.toLocaleString()} contracts; leveraged funds net ${c.breakdown?.leveragedFunds?.net > 0 ? '+' : ''}${(c.breakdown?.leveragedFunds?.net || 0).toLocaleString()})`
      ).join(' | ') + ` [CFTC report: ${cot.reportDate}]`
    }
  } catch (e) {}

  const template = `{
  "symbol": "${symbol}",
  "direction": "Bullish|Bearish|Neutral",
  "confidence": 0,
  "confidenceReasoning": "1 sentence explaining why confidence is at this level",
  "timeframe": "${tf}",
  "reasoning": "3-4 sentence detailed macro analysis combining all data sources",
  "keyDrivers": ["driver1", "driver2", "driver3", "driver4"],
  "scenarios": [
    {"condition": "Primary scenario", "outcome": "Expected move", "probability": "High|Medium|Low"},
    {"condition": "Alternative scenario", "outcome": "What happens", "probability": "High|Medium|Low"}
  ],
  "levels": {
    "currentPrice": "${currentPrice}",
    "invalidation": "specific price where this entire bias is WRONG"
  },
  "invalidationNote": "1 sentence: what happens if invalidation level is hit",
  "entryQuality": "FRESH|EXTENDED|LATE|N/A",
  "entryQualityNote": "1 sentence: is now a good time to look for a technical entry, or has the move already extended (chase risk)?",
  "propFirmRisk": {
    "recommendedRisk": "0.5-1%",
    "maxLots": "calculated based on 50k account",
    "remainingDailyBudget": "estimated",
    "status": "SAFE|CAUTION|DANGER",
    "warning": null
  },
  "tradeGrade": "A+|A|B|C|D",
  "generatedAt": "${new Date().toISOString()}"
}`

  const systemPrompt = `You are an elite institutional macro trader and analyst at a top hedge fund. You provide precise, actionable trading bias analysis.

CRITICAL RULES:
1. CONFIDENCE SCORING: Be precise and varied. Use the FULL range 40-95%. 
   - 85-95% = Strong conviction (multiple data sources align, clear trend, no conflicting events)
   - 70-84% = Moderate conviction (most data aligns but some uncertainty)
   - 55-69% = Weak conviction (mixed signals, upcoming risk events)
   - 40-54% = Very low conviction (conflicting data, recommend sitting out)
   Never default to 75%. Calibrate based on actual data quality.
   CONFLUENCE = CONVICTION: Do NOT be reflexively conservative. When MULTIPLE independent signals point the SAME direction — e.g. an economic release surprise + US yield move + cross-asset flows (DXY/VIX/SPY) + breaking news all agreeing — that is a HIGH-CONVICTION setup and confidence of 75-85% (Grade A/B) is JUSTIFIED and expected. A big NFP miss (e.g. 57k vs 110k forecast) with falling yields and risk-off flows is NOT a 'marginal' call — it is a clear, confident directional read. Reserve LOW confidence (Grade C/D, <60%) ONLY for when signals genuinely CONFLICT with each other (e.g. hawkish data but risk-on flows), or when you truly lack the key data. Do not manufacture false uncertainty when the macro picture is clearly aligned — that under-serves the trader as much as false confidence would.

3. ENTRY QUALITY (move maturity): Use the MOVE CONTEXT data to judge whether the favorable move has already largely happened. BiasForge gives traders a fundamental DIRECTION; they confirm with their own technical setup — so warn them when the move is extended (a technical entry now would be a chase).
   - FRESH: pair has used <40% of its ADR, or has barely moved in the bias direction → good time to hunt a technical setup. Grade unaffected.
   - EXTENDED: ~40-70% of ADR used in the bias direction → suggest waiting for a pullback before entering. Lower the tradeGrade by ONE level (A+→A, A→B, etc.).
   - LATE: >70% of ADR already used in the bias direction → the move is mature; a fresh entry now is a chase. Set tradeGrade to C at most, and the entryQualityNote must advise waiting for a pullback or the next session. Direction can still be correct — this is about timing, not direction.
   - If MOVE CONTEXT is unavailable (market closed / no data), set entryQuality to "N/A".

4. INVALIDATION LEVEL: The invalidation is the MOST important field — a specific price where the bias is completely wrong. For ${tf}:
   - Intraday: within 30-80 pips of current price for forex, proportional for gold
   - Swing: within 100-200 pips for forex
   - For a BEARISH/SELL bias: invalidation sits ABOVE current price
   - For a BULLISH/BUY bias: invalidation sits BELOW current price
   BiasForge provides direction and invalidation — traders manage their own entries, stops, and targets.

5. TRADE GRADE: A+ = perfect alignment all sources. A = strong. B = decent. C = marginal. D = don't trade. Apply the ENTRY QUALITY downgrades from rule 3.

6. All prices must be REAL numbers relative to current price ${currentPrice}. Never use placeholder text. IF THE CURRENT PRICE IS "unknown": do NOT estimate or invent any price levels from memory — set every field inside "levels" and the invalidation to the string "N/A" and focus only on direction, confidence, and reasoning.

7. Return ONLY valid JSON. No markdown, no explanation outside JSON.

8. EVENT TIMING: Every event in "UPCOMING HIGH-IMPACT EVENTS" is in the FUTURE (relative time given, e.g. "in 2h 15m"). Never describe any event as upcoming, pending, or "later today" unless it appears in that list. Events NOT in the list have already been released — treat their impact as priced in via the news/strength data.

9. BIAS CONTINUITY: If a PREVIOUS BIAS is provided and the current price has NOT crossed its invalidation level, strongly default to MAINTAINING the same direction — adjust confidence up or down instead of flipping. Only flip direction if (a) price has crossed the previous invalidation level, or (b) a major new catalyst has clearly reversed the macro picture. If you do flip, your reasoning MUST explicitly state what changed since the previous analysis (e.g. "Flipping from Bearish: price broke invalidation at 0.8030 after..."). Intraday noise and pullbacks are NOT reasons to flip. Whipsaw flip-flopping destroys trader trust.

10. COT POSITIONING: The COT data shows weekly institutional positioning (released Fridays, lags by days). Weight it HEAVILY for swing timeframe, LIGHTLY for intraday (it cannot capture today's flows). When institutional positioning aligns with your direction, mention it in keyDrivers; when it conflicts, acknowledge the tension in reasoning.

11. SIGNAL WEIGHTING (intraday direction): Lead with FRESH signals — breaking news, today's CROSS-ASSET flows (DXY, risk-on/off via VIX/SPY), and the US 2Y yield move (rising 2Y = USD-supportive, falling = USD-negative). These drive TODAY'S direction. The US ECONOMIC ACTUALS set the macro backdrop (is inflation hot? labor tight?) and shape conviction. COT is the LAGGING confirm only (per rule 10). If COT conflicts with fresh cross-asset/yield flows, TRUST THE FRESH FLOWS for intraday direction and lower conviction rather than siding with stale positioning.

12. ANTI-HALLUCINATION: Only cite specific numbers, statistics, or historical claims that are EXPLICITLY present in the data provided to you (price, calendar forecast/previous, news, COT, cross-asset values). NEVER invent or estimate specific figures — especially:
   - Historical superlatives like 'X-year low/high', 'weakest since...', 'highest in decades' UNLESS that exact claim appears verbatim in the provided news/data.
   - Precise statistics (participation rates, GDP figures, historical averages) that are not in the data you received.
   If you want to describe a move as significant, use qualitative language ('sharply weaker', 'notable miss vs forecast') instead of fabricated precise historical claims. When in doubt, describe what the DATA shows, not what you recall from training. A single fabricated number destroys trader trust — accuracy over drama.

13. NEVER reference internal rule numbers (e.g. 'rule 9', 'rule 8') in your user-facing reasoning output. Rules guide your analysis but must stay invisible to the reader.

14. EXTRACT RELEASES FROM NEWS: If the breaking news contains an actual economic release figure (e.g. 'NFP came in at 57k vs 110k expected', 'CPI rose 0.2%'), treat that ACTUAL number as ground truth for surprise analysis — compare it to the forecast and let the surprise drive both direction and conviction. News-reported actuals are often fresher than the FRED/calendar data during the first hours after a release. If news and FRED disagree on a number, prefer the more recent news figure but note the discrepancy.`

  const prevLine = prevBias
    ? `${prevBias.direction} @ ${prevBias.confidence}% confidence (generated ${prevBias.generatedAt || 'earlier'}) · invalidation level: ${prevBias.levels?.invalidation || 'N/A'}`
    : 'None — this is the first analysis for this symbol today'

  const userPrompt = `Analyze ${symbol} (${baseCur}/${quoteCur}) for ${tf} bias.

CURRENT LIVE PRICE: ${currentPrice}
TIMESTAMP: ${new Date().toISOString()}

PREVIOUS BIAS (your own earlier analysis — apply rule 9):
${prevLine}

MOVE CONTEXT (for ENTRY QUALITY — rule 3):
${moveContext?.text || 'Not available (market closed or data unavailable) — set entryQuality to "N/A"'}

UPCOMING HIGH-IMPACT EVENTS (next 3 days):
${calendarData}

RECENT HIGH-IMPACT NEWS:
${newsData}

INSTITUTIONAL POSITIONING (COT — weekly CFTC report, ${baseCur}/${quoteCur} relevant only):
${cotData}

CROSS-ASSET & US YIELDS (today's flows — FRESH intraday direction signal):
${macroContext}

RECENT US ECONOMIC ACTUALS (official FRED data — the current macro reality):
${usActuals}

Combine ALL data sources above for your analysis. Return JSON matching this structure:
${template}`

  const m = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  })
  trackAI('bias-engine', 'claude-sonnet-4-6', m.usage)
  const raw = m.content[0].text.trim().replace(/```json|```/g, '').trim()
  const bias = JSON.parse(raw)
  bias.generatedAt = new Date().toISOString()

  // INVALIDATION-SIDE GUARD: AI sometimes places invalidation on the WRONG side of price
  // (bearish with invalidation BELOW price, or bullish ABOVE), or too close so intraday noise
  // trips it. Both break the continuity rule (price never "crosses" a wrong-side level, so the
  // bias gets stuck). Verify direction + minimum distance; correct if needed.
  if (currentPrice !== 'unknown' && bias.levels && bias.levels.invalidation && bias.levels.invalidation !== 'N/A') {
    const invPip = /JPY/i.test(symbol) ? 0.01 : /XAU/i.test(symbol) ? 0.1 : (/BTC|NAS/i.test(symbol) ? 1 : 0.0001)
    const invPrice = parseFloat(currentPrice)
    const invLevel = parseFloat(bias.levels.invalidation)
    const invDir = String(bias.direction || '').toLowerCase()
    const invBear = invDir.includes('bear')
    const invBull = invDir.includes('bull')
    const invAdr = moveContext && moveContext.adrPips ? moveContext.adrPips : 60
    const invBufferPips = Math.max(30, Math.min(invAdr * 0.5, 120))
    const invBuffer = invBufferPips * invPip
    if (!isNaN(invPrice) && !isNaN(invLevel) && (invBear || invBull)) {
      const invDist = Math.abs(invLevel - invPrice) / invPip
      let invFixed = null
      if (invBear && invLevel <= invPrice) invFixed = invPrice + invBuffer
      else if (invBull && invLevel >= invPrice) invFixed = invPrice - invBuffer
      else if (invDist < invBufferPips) invFixed = invBear ? invPrice + invBuffer : invPrice - invBuffer
      if (invFixed !== null) {
        const invDec = invPip === 0.0001 ? 5 : invPip === 0.01 ? 3 : invPip === 0.1 ? 2 : 2
        bias.levels.invalidation = invFixed.toFixed(invDec)
        bias.invalidationCorrected = true
        console.log(`⚠️ Invalidation corrected for ${symbol} (${bias.direction}): AI gave wrong-side/tight level, moved to ${bias.levels.invalidation}`)
      }
    }
  }

  // ENTRY QUALITY GUARD: enforce grade downgrade for mature moves; default N/A when no move data.
  const demote = (g, steps) => { const order = ['A+', 'A', 'B', 'C', 'D']; const i = order.indexOf(g); return i < 0 ? g : order[Math.min(i + steps, order.length - 1)] }
  if (!moveContext) {
    bias.entryQuality = 'N/A'
  } else {
    bias.moveContext = { pctADR: moveContext.pctADR, dirPct: moveContext.dirPct, fromOpenPips: moveContext.fromOpenPips, adrPips: moveContext.adrPips }
    const eq = String(bias.entryQuality || '').toUpperCase()
    if (eq === 'LATE') {
      // cap at C
      const order = ['A+', 'A', 'B', 'C', 'D']
      if (order.indexOf(bias.tradeGrade) < order.indexOf('C')) bias.tradeGrade = 'C'
    } else if (eq === 'EXTENDED') {
      bias.tradeGrade = demote(bias.tradeGrade, 1)
    }
  }

  // HARD GUARD: if live price was unavailable, never ship AI-guessed levels — suppress them.
  if (currentPrice === 'unknown') {
    bias.levels = { currentPrice: 'N/A', invalidation: 'N/A' }
    bias.invalidationNote = 'Live price feed temporarily unavailable — exact levels suppressed to avoid inaccurate figures. Direction & reasoning are based on live strength, calendar, and news data.'
    if (bias.tradeGrade === 'A+' || bias.tradeGrade === 'A') bias.tradeGrade = 'B'
  }
  bias.dataSources = {
    price: currentPrice !== 'unknown',
    calendar: calendarData !== 'No upcoming events',
    news: newsData !== 'No recent high-impact news'
  }

  // Strip any extra level fields the AI might still return (entry, SL, TP removed from BiasForge output)
  if (bias.levels) {
    const clean = { currentPrice: bias.levels.currentPrice, invalidation: bias.levels.invalidation }
    bias.levels = clean
  }

  setCache(cacheKey, bias)
  return bias
}

// 🔎 PAIR LOOKUP — returns the v2 engine's CURRENT view on one pair.
// This used to run v1's own AI generation per request, which meant the same pair could read BUY here
// and SELL on the dashboard, from two different engines with different logic. One state, one answer:
// it now reads bias_state_v2, the same source the dashboard and Macro Compass use. No model call,
// so no cost and no run-to-run drift.
app.post('/api/bias', aiRateLimiter, async (req, res) => {
  const { symbol } = req.body
  if (!symbol) return res.status(400).json({ error: 'Symbol required' })
  try {
    if (!supabase) return res.json({ success: false, error: 'Database unavailable' })

    if (!V2_CONFIG.PAIRS.includes(symbol)) {
      return res.json({
        success: false,
        unsupported: true,
        error: `${symbol} isn't covered by the macro engine yet — it tracks ${V2_CONFIG.PAIRS.join(', ')}.`,
      })
    }

    const { data, error } = await supabase.from('bias_state_v2').select('*').eq('pair', symbol).maybeSingle()
    if (error) throw error

    // Serve-time invalidation — same display-only suppression as the headline and the compass
    // (see v2BreachedAtServeTime). A bias whose level already broke falls through to the Neutral
    // response below instead of being served as live. No DB write: runV2Shadow owns the state.
    const breached = !!data && data.status === 'running' && data.direction !== 'FLAT'
      && v2BreachedAtServeTime(data, '[api/bias]')

    if (!data || breached || data.status !== 'running' || data.direction === 'FLAT') {
      return res.json({
        success: true,
        bias: {
          symbol,
          direction: 'Neutral',
          confidence: data?.confidence ?? null,
          tradeGrade: data?.grade || null,
          // "too close to call" would be a lie for a bias that broke its level — say which it is.
          reasoning: breached
            ? 'Invalidation level broke — this bias is off the table until the engine re-scores it.'
            : 'No directional bias right now — the macro signals are too close to call on this pair.',
          flat: true,
          generatedAt: data?.updated_at || null,
        },
      })
    }

    res.json({
      success: true,
      bias: {
        symbol: data.pair,
        direction: data.direction === 'BUY' ? 'Bullish' : 'Bearish',
        confidence: data.confidence ?? null,
        tradeGrade: data.grade || null,
        entryTiming: data.entry_timing || null,
        reasoning: data.thesis || '',
        invalidation: data.invalidation_level ?? null,
        levels: { invalidation: data.invalidation_level ?? 'N/A' },
        invalidationReasoning: data.invalidation_text || '',
        regime: data.regime || null,
        engine: 'v2',
        generatedAt: data.updated_at || null,
      },
    })
  } catch (e) {
    console.error('Bias lookup error:', e?.message)
    res.status(500).json({ success: false, error: 'Could not load the bias for that pair.' })
  }
})

// ============================================
// 📌 TODAY'S AI BIAS (auto-computed + change alerts) — session opens + pre-event
// ============================================
let lastTodaysBiasKey = ''
let lastChannelPostKey = ''  // "{DIRECTION} {PAIR} {GRADE}" — persisted per-day so restarts don't re-post
const TODAY_BIAS_TTL = 45 * 60 * 1000 // 45 min — keeps Anthropic cost bounded under dashboard traffic

// ── 💰 AI cost tracking — logs every Anthropic call's token usage and estimated cost ──
const MODEL_PRICES = { 'claude-sonnet-4-6': { in: 3, out: 15 }, 'claude-haiku-4-5-20251001': { in: 1, out: 5 } } // $ per 1M tokens
let aiCosts = { date: new Date().toISOString().slice(0, 10), totalUSD: 0, calls: 0, byFeature: {} }
function trackAI(label, model, usage) {
  try {
    const day = new Date().toISOString().slice(0, 10)
    if (aiCosts.date !== day) aiCosts = { date: day, totalUSD: 0, calls: 0, byFeature: {} }
    const p = MODEL_PRICES[model] || { in: 3, out: 15 }
    const cost = ((usage?.input_tokens || 0) * p.in + (usage?.output_tokens || 0) * p.out) / 1e6
    aiCosts.totalUSD += cost; aiCosts.calls++
    if (!aiCosts.byFeature[label]) aiCosts.byFeature[label] = { calls: 0, usd: 0 }
    aiCosts.byFeature[label].calls++; aiCosts.byFeature[label].usd = +(aiCosts.byFeature[label].usd + cost).toFixed(4)
    console.log(`💰 [${label}] in:${usage?.input_tokens || 0} out:${usage?.output_tokens || 0} ≈ $${cost.toFixed(4)} | today: $${aiCosts.totalUSD.toFixed(3)} (${aiCosts.calls} calls)`)
  } catch (e) {}
}

// Memo of already-scored news (title → scores) so each article is scored by AI only ONCE
const newsScoreMemo = new Map()

// ── 🛡️ Per-IP rate limit for expensive AI endpoints (cache hits don't count) ──
const AI_RATE_LIMIT = 30 // fresh AI requests per IP per hour
const aiRateMap = new Map() // ip → { count, resetAt }
function aiRateLimiter(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown'
  const now = Date.now()
  let entry = aiRateMap.get(ip)
  if (!entry || now > entry.resetAt) { entry = { count: 0, resetAt: now + 60 * 60 * 1000 }; aiRateMap.set(ip, entry) }
  entry.count++
  if (entry.count > AI_RATE_LIMIT) {
    console.warn(`🛡️ Rate limit hit: ${ip} (${entry.count} AI requests this hour)`)
    return res.status(429).json({ success: false, error: 'Too many AI requests — please wait a bit and try again.' })
  }
  if (aiRateMap.size > 5000) aiRateMap.clear() // memory guard
  next()
}

// Pick the strongest OANDA-tradeable pair from live currency strength divergence
function rankOandaPairs(strength) {
  if (!strength?.currencies?.length) return []
  const str = {}; strength.currencies.forEach(c => { str[c.currency] = c.strength })
  const oandaPairs = [['EUR','USD'],['GBP','USD'],['USD','JPY'],['AUD','USD'],['USD','CAD'],['USD','CHF'],['NZD','USD'],['EUR','GBP'],['EUR','JPY'],['GBP','JPY'],['AUD','JPY']]
  const ranked = []
  for (const [b, q] of oandaPairs) {
    if (str[b] === undefined || str[q] === undefined) continue
    const diff = str[b] - str[q]
    ranked.push({ symbol: `${b}${q}`, pair: `${b}${q}`, action: diff > 0 ? 'BUY' : 'SELL', diff: Math.abs(diff) })
  }
  ranked.sort((a, b) => b.diff - a.diff)
  return ranked
}
function pickTopOandaPair(strength) { return rankOandaPairs(strength)[0] || null }

// ── Today's Bias daily pair lock (anchor + hysteresis, persisted across restarts) ──
let todayBiasLock = null // { date: 'YYYY-MM-DD', symbol, pair }
const utcDay = () => new Date().toISOString().slice(0, 10)

async function loadTodayBiasState() {
  try {
    const { data, error } = await supabase.from('app_state').select('value').eq('key', 'today_bias_state').single()
    if (error) { console.log(`⚠️ loadTodayBiasState: Supabase error — ${error.message}`); return }
    const v = data?.value
    const today = utcDay()
    if (v?.lock?.date === today) {
      todayBiasLock = v.lock
      if (v.result) {
        setCache('today_bias', v.result)
        lastTodaysBiasKey = `${v.result.direction} ${v.result.pair}`.toUpperCase()
      }
      console.log(`✅ Restored today's bias state: ${v.lock.pair} (lock date=${v.lock.date}, today=${today})`)
    } else {
      console.log(`📅 Bias state found but date mismatch: lockDate=${v?.lock?.date || 'none'}, today=${today} — starting fresh (AI will pick)`)
    }
  } catch (e) { console.log(`⚠️ loadTodayBiasState failed: ${e?.message} — starting without lock`) }
}
async function saveTodayBiasState(result) {
  try {
    await supabase.from('app_state').upsert(
      { key: 'today_bias_state', value: { lock: todayBiasLock, result }, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )
  } catch (e) { console.error('today_bias persist error:', e?.message) }
}

async function loadChannelPostState() {
  try {
    const { data } = await supabase.from('app_state').select('value').eq('key', 'channel_post_state').single()
    if (data?.value?.key && data.value.date === utcDay()) {
      lastChannelPostKey = data.value.key
      console.log(`✅ Restored channel post state: ${lastChannelPostKey}`)
    }
  } catch (e) { console.log(`⚠️ loadChannelPostState failed: ${e?.message}`) }
}
async function saveChannelPostState(key) {
  try {
    await supabase.from('app_state').upsert(
      { key: 'channel_post_state', value: { key, date: utcDay() }, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )
  } catch (e) { console.error('channel post state persist error:', e?.message) }
}

// ── v2 HEADLINE PAIR ──────────────────────────────────────────────────────────
// v2 scores every pair continuously; v1's dashboard, Telegram and history are all built around ONE
// headline bias per day. This adapter picks that headline pair from bias_state_v2 and maps it into
// the exact shape computeTodaysAIBias() returns, so every downstream consumer keeps working unchanged.
//
// Selection (hybrid): take pairs whose |diff| cleared the open threshold — a real macro signal — and
// among those pick the highest confidence, which already folds in entry timing (ADR spent). That
// favours a slightly weaker but still-tradeable setup over a strong one whose move is already done.
// If nothing cleared the threshold, fall back to the best confidence available.
// Confidence points a challenger must beat the current headline by before the headline hands over.
// Guards against alert spam from near-tied pairs — see the churn guard below.
const V2_HEADLINE_SWITCH_MARGIN = 5

// ── SERVE-TIME INVALIDATION GUARD ─────────────────────────────────────────────
// The engine only re-evaluates invalidation on its own tick (V2_SHADOW_INTERVAL_MIN, 2h by
// default), so a level broken minutes after a tick stayed on the dashboard as a live bias for the
// rest of the window. Everything below is DISPLAY SUPPRESSION ONLY — it hides a breached row and
// writes nothing. CLOSE vs FLIP is decide()'s call and runV2Shadow is the sole writer of
// bias_state_v2; a second writer here would race the engine.
//
// The comparison itself is isInvalidated() from biasEngine.js — the SAME function decide()'s
// Trigger B uses, so display and engine can never disagree about an exact touch of the level.
//
// Price is read from cache only — the serve path never makes a network call. Sources, newest wins
// (getCached ignores TTL, so an expired v1 candle can be older than a fresh v2 one):
//   v2spot_*      — spot written by the 10-min invalidation watcher, for pairs with a live bias
//   tdcandle_d_*  — v1's daily candles (10-min TTL, only warm while v1 paths run)
//   tdcandle_dv2_*— v2's own daily candles (6h TTL)
// Without the watcher's spot the freshest number here is a 6h candle, which is why the watcher
// seeds v2spot_* — that costs nothing extra and it is what makes this guard actually timely.
function v2CachedPrice(pair) {
  let best = null
  const consider = (e, px) => {
    if (!e || !Number.isFinite(px)) return
    if (!best || e.timestamp > best.timestamp) best = { price: px, timestamp: e.timestamp }
  }
  const spot = API_CACHE[`v2spot_${pair}`]
  consider(spot, parseFloat(spot?.data))
  for (const key of [`tdcandle_d_${pair}`, `tdcandle_dv2_${pair}`]) {
    const e = API_CACHE[key]
    consider(e, Array.isArray(e?.data) && e.data[0] ? parseFloat(e.data[0].close) : NaN)
  }
  return best
}

// true (and logs) when this row's invalidation level is already broken.
// `price` overrides the cache (the watcher passes its fresh spot). No price from either → false:
// fail OPEN, so a cold cache or a failed fetch never blanks a live bias.
function v2BreachedAtServeTime(row, tag, { action = 'dropping', price = null } = {}) {
  const lvl = row?.invalidation_level
  if (lvl == null || !Number.isFinite(+lvl)) return false
  let px = price != null && Number.isFinite(+price) ? +price : null
  let ageMin = 0
  if (px == null) {
    const cached = v2CachedPrice(row.pair)
    if (!cached) return false
    px = cached.price
    ageMin = Math.round((Date.now() - cached.timestamp) / 60000)
  }
  if (!isInvalidated(row.direction, px, lvl)) return false
  const dp = row.pair.includes('JPY') ? 3 : row.pair === 'XAUUSD' ? 2 : 5
  console.warn(`⚠️ ${tag} ${row.pair} invalidation breached at serve time (${px.toFixed(dp)} vs ${(+lvl).toFixed(dp)}, price ${ageMin === 0 ? 'live' : `${ageMin}min old`}) — ${action}`)
  return true
}

// Spot for pairs that currently have a running bias — TwelveData /price, 1 credit per symbol.
// Called ONLY by the 10-min invalidation watcher, and only when there is a bias to protect, so an
// idle engine spends nothing. Fetched prices are cached as `v2spot_*` so the serve-time guard
// reads them too. Anything that fails is simply absent from the result: the caller then falls back
// to the candle cache, and if that is cold too the guard skips that pair. Never throws.
async function v2FetchSpot(pairs) {
  const wanted = pairs.filter(p => ROOM_SYMBOL_MAP[p])
  const key = process.env.TWELVEDATA_API_KEY
  if (!wanted.length || !key) return {}
  const syms = wanted.map(p => ROOM_SYMBOL_MAP[p])
  try {
    await tdAcquire(syms.length)
    const r = await axios.get('https://api.twelvedata.com/price', {
      params: { symbol: syms.join(','), apikey: key }, timeout: 8000
    })
    if (r.data?.code) {
      console.warn(`⚠️ [v2 spot] error code=${r.data.code} "${r.data.message || ''}" — falling back to cached price`)
      return {}
    }
    const out = {}
    for (const p of wanted) {
      // /price returns { price } for a single symbol, { "EUR/USD": { price }, … } for a batch.
      const d = syms.length === 1 ? r.data : r.data?.[ROOM_SYMBOL_MAP[p]]
      const px = parseFloat(d?.price)
      if (Number.isFinite(px)) { out[p] = px; setCache(`v2spot_${p}`, px) }
    }
    return out
  } catch (e) {
    console.warn(`⚠️ [v2 spot] fetch failed (${e?.message}) — falling back to cached price`)
    return {}
  }
}

// Returns the bias to publish, or null meaning "v2 genuinely has no qualifying bias right now".
// THROWS when the engine state could not be READ at all. The caller must keep those two apart:
// a null is a real answer and must publish nothing, while a throw means we know nothing and the
// last good card should keep serving. Collapsing them into one null is what let a read blip look
// identical to a flat day.
async function getV2HeadlineBias() {
  if (!supabase) { const e = new Error('supabase client unavailable'); e.v2Degraded = true; throw e }
  const { data, error } = await supabase
    .from('bias_state_v2')
    .select('*')
    .eq('status', 'running')
    .neq('direction', 'FLAT')
  if (error) { const e = new Error(`bias_state_v2 read failed: ${error.message}`); e.v2Degraded = true; throw e }

  // V2_CONFIG.PAIRS is the engine's own enabled list (already excludes gold while V2_GOLD_ENABLED is
  // false) — filtering on it here means a disabled pair can never surface from a stale row.
  let rows = (data || []).filter(r => V2_CONFIG.PAIRS.includes(r.pair))
  if (!rows.length) { console.log('   [v2 headline] no running bias — nothing to surface'); return null }

  // Serve-time invalidation — see v2BreachedAtServeTime. Filtered off `rows` (not just the chosen
  // top) so the churn guard below can't hold a breached incumbent either. Pool stays sorted, so
  // dropping a row simply promotes the next candidate.
  rows = rows.filter(r => !v2BreachedAtServeTime(r, '[v2 headline]'))
  if (!rows.length) { console.log('   [v2 headline] every running bias is breached — nothing to surface'); return null }

  const strong = rows.filter(r => Math.abs(r.diff_at_entry ?? 0) >= V2_CONFIG.OPEN_THRESHOLD)
  const pool = strong.length ? strong : rows
  pool.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || Math.abs(b.diff_at_entry ?? 0) - Math.abs(a.diff_at_entry ?? 0))
  let top = pool[0]

  // ── CHURN GUARD ──
  // v2 has no daily pair lock, so without this the headline would hand over to whichever pair leads
  // on confidence at that instant — and every handover writes bias_history, DMs subscribers and posts
  // to the public channel. Confidence values cluster, so 1-2 point wobble would read as spam.
  // Same dead-band idea the engine already uses for flips: the challenger must clear the incumbent by
  // a real margin. The incumbent is held only while it is still a live bias (present in `rows`, which
  // is already filtered to running + non-FLAT + engine-enabled).
  const publishedPrev = getCached('today_bias')
  const incumbent = publishedPrev?.engine === 'v2'
    ? rows.find(r => r.pair === publishedPrev.pair)
    : null
  if (incumbent && incumbent.pair !== top.pair) {
    const lead = (top.confidence ?? 0) - (incumbent.confidence ?? 0)
    if (lead < V2_HEADLINE_SWITCH_MARGIN) {
      console.log(`   [v2 headline] holding ${incumbent.pair} (${incumbent.confidence}%) — ${top.pair} (${top.confidence}%) leads by ${lead}, needs ${V2_HEADLINE_SWITCH_MARGIN}`)
      top = incumbent
    } else {
      console.log(`   [v2 headline] switching ${incumbent.pair} (${incumbent.confidence}%) → ${top.pair} (${top.confidence}%), lead ${lead}`)
    }
  }

  const dirWord = top.direction === 'BUY' ? 'Bullish' : top.direction === 'SELL' ? 'Bearish' : 'Neutral'
  const timing = top.entry_timing || 'FRESH'
  const timingNote = timing === 'LATE' ? 'LATE — wait for a pullback'
    : timing === 'EXTENDED' ? 'EXTENDED — much of the daily range is spent'
    : 'FRESH — room left in the daily range'

  console.log(`🎯 [v2 headline] ${top.pair} ${top.direction} · ${top.confidence}% · Grade ${top.grade} · ${timing} (from ${pool.length} candidate${pool.length === 1 ? '' : 's'}${strong.length ? '' : ', none above threshold'})`)

  const bias = {
    symbol: top.pair,
    direction: dirWord,
    confidence: top.confidence ?? 0,
    tradeGrade: top.grade || '-',
    reasoning: top.thesis || '',
    invalidation: top.invalidation_level ?? null,
    // Channel post + bias_history read `bias.levels.invalidation` — mirror it there too.
    levels: { invalidation: top.invalidation_level ?? 'N/A' },
    invalidationReasoning: top.invalidation_text || '',
    entryTiming: timing,
    entryTimingNote: timingNote,
    engine: 'v2',
    regime: top.regime || null,
    generatedAt: top.updated_at || new Date().toISOString(),
  }

  return {
    symbol: top.pair,
    pair: top.pair,
    direction: dirWord,
    confidence: top.confidence ?? 0,
    tradeGrade: top.grade || '-',
    reasoning: top.thesis || '',
    movePotential: { score: null, note: timingNote, adrPips: null, roomPct: null, nextEvent: null },
    bias,
    // Top-level engine marker: the churn guard and /api/macro-compass both read this off the cached
    // result to tell a v2-published headline from a v1 one.
    engine: 'v2',
    selectionMethod: 'v2',
    selectionReasoning: top.thesis || null,
    runnerUps: pool.slice(1, 3).map(r => ({ symbol: r.pair, direction: r.direction })),
    conviction: top.grade || null,
    primaryDriver: null,
    whatWouldFlipIt: top.invalidation_text || null,
    generatedAt: bias.generatedAt,
    updatedAt: new Date().toISOString(),
  }
}

// Compute Today's AI Bias for the strongest pair, cache it, and alert on direction change.
// force=true bypasses the per-symbol cache (used on breaking-news catalysts)
// sessionOpen=true allows full pair re-pick (used ONLY at session opens: Sydney/Tokyo/London/NY)
// Without sessionOpen, a locked pair is KEPT and only its reasoning/confidence is refreshed.
async function computeTodaysAIBias(force = false, sessionOpen = false, _exhaustRetry = false) {
  if (isForexClosed()) return null

  // ── ENGINE SWITCH: BIAS_ENGINE=v2 serves the headline bias from the v2 engine. There is NO v1
  // fallback on this path any more. The fallback did not merely write a history row — it published a
  // whole second engine's opinion: DMs to every subscriber and a post to the public channel. So on a
  // day v2 correctly had no edge, subscribers still got a v1 call (gold included, which v2 does not
  // even score). An empty v2 is the honest output and must publish NOTHING.
  //
  // The one case that is NOT "no bias" is a failed READ — there we know nothing, so keep serving the
  // last good card rather than blanking it. getV2HeadlineBias throws for exactly that case.
  if (process.env.BIAS_ENGINE === 'v2') {
    let v2
    try {
      v2 = await getV2HeadlineBias()
    } catch (e) {
      console.error(`⚠️ [v2 headline] DEGRADED (${e?.message}) — serving last published bias, publishing nothing`)
      return getCached('today_bias') || null
    }
    if (v2) {
      // Stamp the lock with today's date even though v2 doesn't use it for selection (its state is
      // per-pair). saveTodayBiasState persists { lock, result } and loadTodayBiasState only restores
      // the cached result when lock.date === today — without this stamp the cache is dropped on every
      // Railway restart, which would silently reset the churn guard's incumbent on each deploy.
      todayBiasLock = { date: utcDay(), pair: v2.pair, symbol: v2.symbol, selectedBy: 'v2' }
      return publishTodayBias(v2)
    }
    console.log('   [v2 headline] no qualifying bias — publishing nothing (no history row, no DM, no channel post)')
    return null
  }

  const day = utcDay()

  // ── LOCK-ONLY REFRESH: if pair is locked today and this is NOT a session open, just refresh reasoning ──
  let top
  let candidates = null // populated only on the FULL RE-PICK path — read by the exhaustion switch below
  let room = {}
  // selectedBy==='v2' locks exist only to persist the v2 cache across restarts (see the engine switch
  // above) — v1 must ignore them, otherwise reaching this line as the v2 fallback would re-generate on
  // the pair v2 just went flat on instead of making its own independent pick.
  if (todayBiasLock?.date === day && todayBiasLock.selectedBy !== 'v2' && !sessionOpen) {
    console.log(`🔒 LOCK-ONLY PATH: pair=${todayBiasLock.pair} (${todayBiasLock.selectedBy || 'formula'}), lockDate=${todayBiasLock.date}, today=${day}, sessionOpen=${sessionOpen}, force=${force}`)
    // Skip all ranking/scoring — go straight to generateBiasFor on the locked pair
    top = { symbol: todayBiasLock.symbol, pair: todayBiasLock.pair }
    // Still fetch room data for the locked pair so potentialNote is accurate
    try { room = await getPairRoomBatch([top]) } catch (e) {}
    const r = room[top.symbol]
    top.roomScore = r ? r.roomScore : null
    top.adrPips = r ? r.adrPips : null
    top.potential = null // not re-scored, just refreshed
    console.log(`🎯 Today's pair (locked): ${top.pair}`)
  } else {
    // ── FULL RE-PICK (FUNDAMENTAL-DRIVEN): session open or first bias of the day ──
    console.log(`🔄 FULL RE-PICK (fundamentals): sessionOpen=${sessionOpen}, lock=${todayBiasLock?.pair || 'none'}, lockDate=${todayBiasLock?.date || 'none'}, today=${day}`)

    // Fixed candidate list — all major pairs + gold
    candidates = BIAS_CANDIDATES

    // ── 1. CALENDAR: upcoming + recent releases ──
    let events = []; try { events = await getEconomicCalendar() } catch (e) {}
    let calendarData = 'No upcoming events'
    let recentReleases = 'No recent release data'
    try {
      const now = new Date()
      const ahead48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      // Upcoming high-impact
      const upcoming = events.filter(e => e.impact?.toLowerCase?.() === 'high' && new Date(e.time) > now && new Date(e.time) < ahead48h).slice(0, 10).map(e => {
        const mins = Math.round((new Date(e.time) - now) / 60000)
        const rel = mins < 60 ? `in ${mins}min` : mins < 1440 ? `in ${Math.floor(mins / 60)}h ${mins % 60}m` : `in ${Math.floor(mins / 1440)}d`
        return `${e.event} (${e.country}) ${rel}${e.forecast ? ' | Forecast: ' + e.forecast : ''}${e.previous ? ' | Previous: ' + e.previous : ''}`
      })
      if (upcoming.length > 0) calendarData = upcoming.join('\n')
      // Recent high-impact releases (past 7 days) — for economic surprise context
      const recent = events.filter(e => e.impact?.toLowerCase?.() === 'high' && new Date(e.time) < now && new Date(e.time) > weekAgo).slice(0, 10).map(e => {
        const daysAgo = Math.round((now - new Date(e.time)) / (24 * 60 * 60 * 1000))
        return `${e.event} (${e.country}) ${daysAgo}d ago${e.forecast ? ' | Forecast: ' + e.forecast : ''}${e.previous ? ' | Previous: ' + e.previous : ''}`
      })
      if (recent.length > 0) recentReleases = recent.join('\n')
    } catch (e) {}

    // ── 2. NEWS: pre-warm if empty ──
    let newsTitles = (() => { const n = getCached('latest_news'); return Array.isArray(n) ? n.filter(a => (a.impact || 0) >= 7).map(a => `[${a.category || a.source}] ${a.title}${a.oneliner ? ' — ' + a.oneliner : ''}`) : [] })()
    if (!newsTitles.length) {
      console.log('📰 News cache empty — fetching for AI selection...')
      try {
        const feeds = [
          { name: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
          { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/topNews' },
          { name: 'Fox Business', url: 'https://feeds.foxbusiness.com/foxbusiness/markets' },
          { name: 'Investing.com', url: 'https://www.investing.com/rss/news.rss' },
          { name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories' },
          { name: 'FXStreet', url: 'https://www.fxstreet.com/rss/news' },
          { name: 'DailyFX', url: 'https://www.dailyfx.com/feeds/market-news' }
        ]
        const results = await Promise.allSettled(feeds.map(f => rssParser.parseURL(f.url).then(p => p.items.slice(0, 8).map(i => ({ source: f.name, title: i.title || '', summary: i.contentSnippet || '' })))))
        let articles = []; results.forEach(r => { if (r.status === 'fulfilled') articles.push(...r.value) })
        if (articles.length) {
          const titles = articles.slice(0, 20).map((a, n) => `${n + 1}.[${a.source}]${a.title}`).join('\n')
          try {
            const m = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 4096, system: 'Macro analyst for BiasForge. Return ONLY JSON array.\n[{"index":1,"impact":8,"category":"Central Bank","bias":"bearish","marketTags":["USD↓"],"oneliner":"..."}]', messages: [{ role: 'user', content: `Score:\n${titles}` }] })
            trackAI('news-scoring', 'claude-haiku-4-5-20251001', m.usage)
            const s = JSON.parse(m.content[0].text.trim().replace(/```json|```/g, '').trim())
            articles = articles.slice(0, 20).map((a, i) => { const sc = s.find(x => x.index === i + 1); return { ...a, impact: sc?.impact || 5, category: sc?.category || 'General', bias: sc?.bias || 'neutral', marketTags: sc?.marketTags || [], oneliner: sc?.oneliner || '' } })
            articles.sort((a, b) => b.impact - a.impact)
            setCache('latest_news', articles)
            newsTitles = articles.filter(a => a.impact >= 7).map(a => `[${a.category || a.source}] ${a.title}${a.oneliner ? ' — ' + a.oneliner : ''}`)
            console.log(`📰 Fetched & scored ${articles.length} articles, ${newsTitles.length} high-impact`)
          } catch (e) { newsTitles = articles.slice(0, 10).map(a => a.title); console.log(`📰 Scoring failed, using ${newsTitles.length} raw titles`) }
        }
      } catch (e) { console.log('📰 News pre-fetch failed:', e?.message) }
    }
    let newsData = 'No recent high-impact news'
    if (newsTitles.length > 0) newsData = newsTitles.slice(0, 8).join('\n')

    // ── 3. COT ──
    let cotSummary = 'Not available'
    try {
      const cot = await getCOTData()
      if (cot?.data?.length) {
        cotSummary = cot.data.map(c => `${c.currency}: ${c.bias} (net ${c.netPosition > 0 ? '+' : ''}${c.netPosition.toLocaleString()}, change ${c.weeklyChange > 0 ? '+' : ''}${c.weeklyChange?.toLocaleString() || '?'})`).join('\n')
      }
    } catch (e) {}

    // ── 4. ROOM DATA (with retry for TwelveData 429) ──
    try { room = await getPairRoomBatch(candidates) } catch (e) {
      const retryWait = 8000 + Math.floor(Math.random() * 2000)
      console.log(`⚠️ Room batch failed (${e?.message}) — retrying in ${retryWait}ms...`)
      await new Promise(r => setTimeout(r, retryWait))
      try { room = await getPairRoomBatch(candidates) } catch (e2) { console.log(`⚠️ Room retry also failed — AI will work without room data`) }
    }

    // ── 5. CROSS-ASSET CONTEXT (real data + FX proxies) ──
    // Stagger: if cross-asset cache is cold, wait briefly so the room batch call
    // (which just ran) doesn't share TwelveData's per-minute window.
    if (!isCacheFreshFor('cross_asset_live', 30 * 60 * 1000)) {
      await new Promise(r => setTimeout(r, 2000 + Math.floor(Math.random() * 1000)))
    }
    let liveAssets = null
    try { liveAssets = await fetchCrossAssetLive() } catch (e) {}
    let yields = null
    try { yields = await fetchYields() } catch (e) {}
    const crossAssetContext = buildCrossAssetContext(room, liveAssets, yields)

    // ── LOG: what data AI is receiving ──
    console.log(`📊 AI FUNDAMENTAL DATA:`)
    console.log(`   News: ${newsTitles.length} high-impact headlines`)
    console.log(`   Calendar: ${calendarData.split('\n').length} upcoming | ${recentReleases === 'No recent release data' ? 0 : recentReleases.split('\n').length} recent releases`)
    console.log(`   COT: ${cotSummary !== 'Not available' ? 'YES' : 'NO'}`)
    console.log(`   Cross-asset: ${crossAssetContext.split('\n').length} signals`)
    console.log(`   Room: ${Object.keys(room).length}/12 pairs`)

    // ── AI FUNDAMENTAL SELECTION ──
    let aiPick = null
    console.log(`🤖 AI fundamental selection: ${candidates.length} candidates`)
    try {
      aiPick = await selectBestPairAI(candidates, room, calendarData, newsData, cotSummary, recentReleases, crossAssetContext)
      console.log(`🤖 AI selected: ${aiPick.symbol} ${aiPick.direction} [${aiPick.conviction || '?'}] — "${(aiPick.selectionReasoning || '').slice(0, 120)}..."`)
      console.log(`   Primary driver: ${aiPick.primaryDriver || '?'} | Flip condition: ${aiPick.whatWouldFlipIt || '?'}`)
      if (aiPick.runnerUps?.length) console.log(`   Runner-ups: ${aiPick.runnerUps.map(r => `${r.symbol} ${r.direction}`).join(', ')}`)
    } catch (e) {
      console.error('⚠️ AI fundamental selection failed:', e?.message)
    }

    if (aiPick?.symbol) {
      const picked = candidates.find(c => c.symbol === aiPick.symbol) || candidates[0]
      const r = room[picked.symbol]
      top = {
        ...picked,
        action: aiPick.direction === 'BUY' ? 'BUY' : 'SELL',
        roomScore: r?.roomScore ?? null,
        adrPips: r?.adrPips ?? null,
        potential: null,
        aiSelected: true,
        selectionReasoning: aiPick.selectionReasoning,
        runnerUps: aiPick.runnerUps,
        conviction: aiPick.conviction,
        primaryDriver: aiPick.primaryDriver,
        whatWouldFlipIt: aiPick.whatWouldFlipIt
      }
    } else {
      // Fallback: if AI fails, pick the pair with most room left (safest default)
      const withRoom = candidates.filter(c => room[c.symbol]).sort((a, b) => (room[b.symbol]?.roomScore || 0) - (room[a.symbol]?.roomScore || 0))
      top = withRoom[0] || candidates[0]
      top.action = 'NEUTRAL'
      console.log('⚠️ AI failed — fallback to most room available: ' + top.symbol)
    }

    todayBiasLock = { date: day, symbol: top.symbol, pair: top.pair, selectedBy: top.aiSelected ? 'ai' : 'formula' }
    console.log(`🎯 Today's pair${sessionOpen ? ' (session open)' : ''}: ${top.pair} · ${top.aiSelected ? 'AI-selected' : 'formula'} · ${potentialNote(top)}`)
  }

  let bias
  try {
    bias = await generateBiasFor(top.symbol, 'intraday', force)
  } catch (e) { console.error('Today bias gen error:', e?.message); return getCached('today_bias') || null }

  // ── EXHAUSTION SWITCH: a pair whose bias direction already moved >1.5x ADR from today's open
  // is exhausted (e.g. a 2.6x-ADR selloff) — a fresh SELL there just chases a move that's already
  // done. Reuses bias.moveContext (already computed inside generateBiasFor — no extra API call).
  // Tries up to 2 fresh alternatives (AI runner-ups first, then remaining candidates ranked by
  // room left) before giving up.
  const MAX_EXHAUST_SWITCHES = 2
  const runnerUpPool = top.runnerUps || []
  const triedSymbols = new Set([top.symbol])
  let switches = 0
  let stillExhausted = false
  while (true) {
    const mc = bias.moveContext
    if (!mc) { stillExhausted = false; break }
    const moveDir = mc.fromOpenPips > 0 ? 'UP' : 'DOWN'
    const biasAction = /buy|bull/i.test(bias.direction) ? 'BUY' : /sell|bear/i.test(bias.direction) ? 'SELL' : null
    stillExhausted = isPairExhausted(mc.dirPct, biasAction, moveDir)
    if (!stillExhausted) break
    if (switches >= MAX_EXHAUST_SWITCHES) break

    console.log(`🚫 EXHAUSTED: ${top.pair} already ${mc.dirPct}% ADR in ${bias.direction} direction — looking for a fresh pair`)

    let nextSymbol = runnerUpPool.map(r => r.symbol).find(s => s && !triedSymbols.has(s))
    if (!nextSymbol && candidates) {
      const fallback = candidates
        .filter(c => !triedSymbols.has(c.symbol))
        .sort((a, b) => (room[b.symbol]?.roomScore || 0) - (room[a.symbol]?.roomScore || 0))[0]
      nextSymbol = fallback?.symbol
    }

    if (!nextSymbol) {
      // LOCK-ONLY path has no candidate list to fall back on — force one full re-pick instead
      // of guessing, guarded so it can only happen once per call.
      if (!candidates && !_exhaustRetry) {
        console.log(`🔓 Locked pair exhausted with no alternatives — forcing one full re-pick`)
        todayBiasLock = null
        return computeTodaysAIBias(force, true, true)
      }
      break
    }

    switches++
    triedSymbols.add(nextSymbol)
    console.log(`↪️ Switching to fresh candidate: ${nextSymbol} (attempt ${switches}/${MAX_EXHAUST_SWITCHES})`)
    let switchedBias
    try {
      switchedBias = await generateBiasFor(nextSymbol, 'intraday', force)
    } catch (e) { console.error(`Exhaustion switch bias gen failed for ${nextSymbol}:`, e?.message); continue }

    const r = room[nextSymbol]
    top = { symbol: nextSymbol, pair: nextSymbol, roomScore: r?.roomScore ?? null, adrPips: r?.adrPips ?? null }
    bias = switchedBias
  }

  if (stillExhausted) {
    console.log(`⚠️ Exhaustion-switch attempts used up — keeping ${top.pair} with a warning note`)
    bias.reasoning = `⚠️ Note: most pairs extended today — setups limited. ${bias.reasoning || ''}`.trim()
  }

  if (switches > 0) {
    todayBiasLock = { date: day, symbol: top.symbol, pair: top.pair, selectedBy: 'exhaustion-switch' }
    console.log(`🔒 Lock updated after exhaustion switch: ${top.pair}`)
  }

  const result = {
    symbol: top.symbol,
    pair: top.pair,
    direction: bias.direction || 'Neutral',
    confidence: bias.confidence || 0,
    tradeGrade: bias.tradeGrade || '-',
    reasoning: bias.reasoning || '',
    movePotential: {
      score: top.potential ?? null,
      note: potentialNote(top),
      adrPips: top.adrPips ?? null,
      roomPct: top.roomScore != null ? Math.round(top.roomScore * 100) : null,
      nextEvent: top.nextEvent || null
    },
    bias, // full object for the dashboard widget
    selectionMethod: top.aiSelected ? 'ai' : 'formula',
    selectionReasoning: top.selectionReasoning || null,
    runnerUps: top.runnerUps || null,
    conviction: top.conviction || null,
    primaryDriver: top.primaryDriver || null,
    whatWouldFlipIt: top.whatWouldFlipIt || null,
    generatedAt: bias.generatedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  return publishTodayBias(result)
}

// Shared publish tail for BOTH engines: cache, persist, record history, alert subscribers, post to
// the channel. Extracted so the v2 headline path gets identical downstream behaviour instead of a
// second copy that can drift.
async function publishTodayBias(result) {
  setCache('today_bias', result)
  saveTodayBiasState(result).catch(() => {})

  // Change detection → alert subscribers (skip the very first computation)
  const newKey = `${result.direction} ${result.pair}`.toUpperCase()
  if (newKey !== lastTodaysBiasKey) {
    // 📜 Bias History: record every new bias (first of day + every pair/direction change)
    const saved = await saveBiasHistory(result, lastTodaysBiasKey || null)
    if (saved) {
      if (lastTodaysBiasKey) notifyTodaysBiasChange(result, lastTodaysBiasKey).catch(() => {})
      lastTodaysBiasKey = newKey   // advance ONLY after confirmed save — failed insert retries next cycle
    } else {
      console.warn(`⚠️ Bias change ${lastTodaysBiasKey || 'first of day'} → ${newKey} NOT saved — will retry next cycle`)
    }
  }

  // 📢 Channel post — fires whenever bias changes (pair OR direction OR grade) AND grade is C+
  // Tracked separately from subscriber DMs; persisted so restarts never cause duplicate posts.
  const channelGrade = (result.tradeGrade || '').toUpperCase()
  const channelKey = newKey  // "DIRECTION PAIR" only — grade/confidence changes don't re-post
  if (['A+', 'A', 'A-', 'B', 'C'].includes(channelGrade) && channelKey !== lastChannelPostKey) {
    const dirUp = result.direction.toUpperCase()
    const arrow = /BULL|BUY/.test(dirUp) ? '🟢' : /BEAR|SELL/.test(dirUp) ? '🔴' : '⚪'
    const inval = result.bias?.levels?.invalidation && result.bias.levels.invalidation !== 'N/A'
      ? `\n⚠️ Invalidation: <b>${result.bias.levels.invalidation}</b>` : ''
    const channelMsg = `${arrow} <b>${dirUp} ${result.pair}</b>\n` +
      `Confidence: <b>${result.confidence}%</b> · Grade <b>${result.tradeGrade}</b>\n\n` +
      `🧠 ${result.reasoning}${inval}\n\n` +
      `Direction only — you manage your entries.\n` +
      `🧭 Full tool: biasforge.co`
    try {
      const ok = await sendTG(TG_CHANNEL, channelMsg)
      if (ok) {
        lastChannelPostKey = channelKey
        saveChannelPostState(channelKey).catch(() => {})
        console.log(`📢 Channel post sent: ${channelKey}`)
      } else {
        console.error(`❌ Channel post failed (bot returned not-ok): ${channelKey}`)
      }
    } catch (e) {
      console.error(`❌ Channel post error: ${e?.message}`)
    }
  }

  return result
}

// Save a Today's Bias snapshot to history whenever it changes.
// Stamped with the engine that produced it so the two are never mixed again in a win rate — v1 and
// v2 are different engines and averaging them describes neither. Requires (run once in Supabase):
//   alter table bias_history add column if not exists engine text;
// Pre-migration rows stay null and are excluded by the `.eq('engine','v2')` filter in
// /api/bias-performance, which is what drops the historical XAUUSD rows (v2 does not score gold).
async function saveBiasHistory(result, previousKey) {
  try {
    const { error } = await supabase.from('bias_history').insert({
      engine: result.engine === 'v2' ? 'v2' : 'v1',
      pair: result.pair,
      direction: result.direction,
      confidence: result.confidence,
      trade_grade: result.tradeGrade,
      reasoning: result.reasoning,
      previous_bias: previousKey,
      invalidation: result.bias?.levels?.invalidation || null,
      generated_at: result.generatedAt || new Date().toISOString(),
    })
    if (error) throw error   // supabase-js DB errors ko return karta hai, throw nahi — check zaroori
    console.log(`📜 Bias history saved: ${result.direction} ${result.pair} (was: ${previousKey || 'first of day'})`)
    return true
  } catch (e) { console.error('Bias history save error:', e?.message); return false }
}

// Telegram + Email alert when Today's AI Bias flips direction/pair
async function notifyTodaysBiasChange(result, oldKey) {
  const dirUp = result.direction.toUpperCase()
  const msg = `📌 <b>Today's Bias Changed!</b>\n\n` +
    `Pair: <b>${result.pair}</b>\n` +
    `Old: <b>${oldKey}</b>\n` +
    `New: <b>${dirUp} ${result.pair}</b>\n` +
    `Confidence: <b>${result.confidence}%</b> · Grade <b>${result.tradeGrade}</b>\n\n` +
    `🧠 ${result.reasoning}\n\n` +
    `🔗 <a href="https://www.biasforge.co/bias">Open AI Bias Engine</a>`
  for (const sub of telegramSubscribers.filter(s => s.active)) sendTG(sub.chat_id, msg).catch(() => {})

  try {
    const { data: emailSubs } = await supabase.from('email_subscribers').select('email').eq('active', true)
    if (emailSubs?.length) {
      for (const sub of emailSubs) {
        resend.emails.send({
          from: `BiasForge <${FROM_EMAIL}>`,
          to: [sub.email],
          subject: `📌 Today's Bias: ${dirUp} ${result.pair} (${result.confidence}%)`,
          html: `<h2>Today's Bias Changed</h2><p>Old: <b>${oldKey}</b></p><p>New: <b>${dirUp} ${result.pair}</b> · ${result.confidence}% · Grade ${result.tradeGrade}</p><p>${result.reasoning}</p><p><a href="https://www.biasforge.co/bias">Open AI Bias Engine</a></p>`
        }).catch(() => {})
      }
    }
  } catch (e) { console.error('Today bias email error:', e.message) }
  console.log(`📌 Today's bias changed: ${oldKey} → ${lastTodaysBiasKey}`)
}

// Dashboard widget endpoint — serves cached AI bias; computes lazily only when stale (>45 min)
// 💰 AI cost dashboard — today's Anthropic spend estimate, per feature
app.get('/api/ai-costs', (req, res) => {
  res.json({ success: true, ...aiCosts, totalUSD: +aiCosts.totalUSD.toFixed(4) })
})

// NOTE: /api/bias-history was removed — it had no callers. The Bias History modal reads
// /api/bias-performance, which returns the same rows PLUS a real-market score per bias.

// ============================================
// 🎯 BIAS ACCURACY TRACKER
// Scores every saved bias against REAL TwelveData 1h candles (24h window).
// Finalized scores are persisted to bias_history.performance (jsonb), so each
// bias is fetched/computed exactly ONCE — protects the TwelveData free tier.
// Requires (run once in Supabase SQL editor):
//   alter table bias_history add column if not exists performance jsonb;
// ============================================
const TRACKER_SYMBOL_MAP = { EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY', XAUUSD: 'XAU/USD', GBPJPY: 'GBP/JPY', AUDUSD: 'AUD/USD', USDCAD: 'USD/CAD', USDCHF: 'USD/CHF', NZDUSD: 'NZD/USD', EURJPY: 'EUR/JPY', EURGBP: 'EUR/GBP', NAS100: 'IXIC', BTC: 'BTC/USD' }
const TRACKER_WINDOW_HOURS = 24
const TRACKER_MAX_FETCHES = 6 // TwelveData free tier = 8 credits/min — leave headroom

function trackerPipSize(pair) {
  const p = (pair || '').toUpperCase()
  if (p.includes('JPY')) return 0.01
  if (p.includes('XAU')) return 0.1
  if (p.includes('BTC') || p.includes('NAS')) return 1
  return 0.0001
}
function trackerIsLong(direction) { return /BULL|BUY|LONG/i.test(direction || '') }
function tdDateUTC(d) { return new Date(d).toISOString().slice(0, 19).replace('T', ' ') }

// Score one bias against real candles. NEVER guesses — explicit error on missing data.
// Uses 15m candles so entry is taken at the candle closest to the bias minute
// (a 1h candle's open can be up to 59 min stale and spans the whole hourly range).
async function scoreBias(row) {
  const symbol = TRACKER_SYMBOL_MAP[(row.pair || '').toUpperCase()]
  if (!symbol) return { status: 'error', error: `No symbol mapping for ${row.pair}` }
  const start = new Date(row.generated_at)
  const windowEnd = new Date(start.getTime() + TRACKER_WINDOW_HOURS * 3600 * 1000)
  const isFinal = Date.now() > windowEnd.getTime()
  // Pull a little before the bias and a little past the window so edges aren't clipped
  const fetchStart = new Date(start.getTime() - 30 * 60 * 1000)
  const fetchEnd = new Date(Math.min(windowEnd.getTime() + 30 * 60 * 1000, Date.now()))
  try {
    await tdAcquire(1)
    const r = await axios.get('https://api.twelvedata.com/time_series', {
      params: {
        symbol, interval: '15min', timezone: 'UTC',
        start_date: tdDateUTC(fetchStart), end_date: tdDateUTC(fetchEnd),
        outputsize: 120, apikey: process.env.TWELVEDATA_API_KEY
      }
    })
    if (r.data?.status === 'error' || !Array.isArray(r.data?.values) || !r.data.values.length) {
      return { status: 'error', error: r.data?.message || 'No candle data returned (market closed or rate limit)' }
    }
    // TwelveData = newest first → flip to ascending, keep only candles at/after the bias time
    const all = [...r.data.values].reverse().map(c => ({
      t: new Date(c.datetime.includes('T') ? c.datetime : c.datetime.replace(' ', 'T') + 'Z'),
      o: parseFloat(c.open), h: parseFloat(c.high), l: parseFloat(c.low), c: parseFloat(c.close)
    }))
    const startMs = start.getTime()
    const inWindow = all.filter(c => c.t.getTime() >= startMs - 15 * 60 * 1000 && c.t.getTime() <= windowEnd.getTime())
    if (inWindow.length < 2) {
      return { status: 'live', correct: null, note: 'Awaiting more candles (market closed / window still open)', candles: inWindow.length, windowHours: TRACKER_WINDOW_HOURS, scoredAt: new Date().toISOString() }
    }
    const pip = trackerPipSize(row.pair)
    const long = trackerIsLong(row.direction)
    const entry = inWindow[0].o                       // entry = open of the candle at/just after the bias minute
    const endPrice = inWindow[inWindow.length - 1].c
    const hi = Math.max(...inWindow.map(c => c.h))
    const lo = Math.min(...inWindow.map(c => c.l))
    const pips = +(((endPrice - entry) * (long ? 1 : -1)) / pip).toFixed(1)
    const mfe = +((long ? hi - entry : entry - lo) / pip).toFixed(1)
    const mae = +((long ? entry - lo : hi - entry) / pip).toFixed(1)
    return {
      status: isFinal ? 'final' : 'live',
      entryPrice: entry, endPrice,
      pips, mfePips: mfe, maePips: mae,
      // Only deliver a win/loss verdict once the 24h window has actually closed.
      // While live, show running pips/MFE/MAE but leave correct = null (no premature ✗).
      correct: isFinal ? pips > 0 : null,
      candles: inWindow.length, windowHours: TRACKER_WINDOW_HOURS, interval: '15min',
      scoredAt: new Date().toISOString()
    }
  } catch (e) {
    return { status: 'error', error: e?.message || 'TwelveData fetch failed' }
  }
}

// 🎯 Bias performance — every bias scored vs real market + summary stats
app.get('/api/bias-performance', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 90)
    const cacheKey = `bias_performance_${days}`
    if (isCacheFresh(cacheKey)) return res.json(getCached(cacheKey))
    const since = new Date(Date.now() - days * 86400 * 1000).toISOString()
    // v2 rows ONLY. A win rate blended across two engines describes neither, and pre-migration rows
    // have engine=null so they drop out on their own — XAUUSD included, which v2 never scores.
    const { data: rows, error } = await supabase
      .from('bias_history').select('*')
      .eq('engine', 'v2')
      .gte('generated_at', since)
      .order('generated_at', { ascending: false })
      .limit(50)
    if (error) throw error

    let fetches = 0
    const results = []
    for (const row of rows || []) {
      // Already permanently scored → reuse, zero API cost
      if (row.performance?.status === 'final') { results.push(row); continue }
      if (fetches >= TRACKER_MAX_FETCHES) {
        results.push({ ...row, performance: { status: 'pending', note: 'Queued (rate-limit headroom) — scores on next refresh' } })
        continue
      }
      fetches++
      const perf = await scoreBias(row)
      // Persist ONLY completed 24h windows — each bias costs exactly one fetch, ever
      if (perf.status === 'final') {
        try {
          const { error: upErr } = await supabase.from('bias_history').update({ performance: perf }).eq('id', row.id)
          if (upErr) console.error('Tracker persist error (run the performance column SQL?):', upErr.message)
        } catch (pe) { console.error('Tracker persist error:', pe?.message) }
      }
      results.push({ ...row, performance: perf })
    }

    // Win/loss verdict ONLY from closed 24h windows (final) AND high-conviction calls — Grade B+
    // with 60%+ confidence. Low-conviction D-grade biases (e.g. NFP-day whipsaws) were never meant
    // to be acted on and shouldn't drag down the win rate. Live biases show running pips but don't
    // affect win rate.
    const isHighConviction = (r) => {
      const g = (r.trade_grade || r.tradeGrade || '').toUpperCase()
      const conf = r.confidence ?? r.performance?.confidence ?? 0
      return ['A+', 'A', 'B'].includes(g) && conf >= 60
    }
    const final = results.filter(r => r.performance?.status === 'final' && isHighConviction(r))
    const live = results.filter(r => r.performance && r.performance.status === 'live')
    const withPips = results.filter(r => r.performance && typeof r.performance.pips === 'number' && (r.performance.status === 'final' || r.performance.status === 'live'))
    const wins = final.filter(r => r.performance.correct === true)
    const avg = (arr, key) => arr.length ? +(arr.reduce((s, r) => s + r.performance[key], 0) / arr.length).toFixed(1) : null
    const summary = {
      total: results.length,
      scored: final.length,          // finalized = counted toward win rate
      live: live.length,             // still inside 24h window
      wins: wins.length,
      winRate: final.length ? +((wins.length / final.length) * 100).toFixed(1) : null,
      avgPips: avg(withPips, 'pips'),
      avgMfePips: avg(withPips, 'mfePips'),
      avgMaePips: avg(withPips, 'maePips'),
      countedBasis: 'Grade B+ & 60%+ confidence'
    }
    const payload = { success: true, days, summary, history: results }
    setCache(cacheKey, payload)
    res.json(payload)
  } catch (e) {
    console.error('bias-performance error:', e?.message)
    res.status(500).json({ success: false, error: e?.message || 'performance unavailable' })
  }
})

// 🧭 MACRO COMPASS — every pair the v2 engine currently has a view on, for the multi-pair panel.
// Reads the same table and applies the same pair filter as getV2HeadlineBias() so the panel can
// never show a pair the engine has disabled, and the headline row is flagged rather than
// re-derived on the client. Sorted strongest-conviction first.
app.get('/api/macro-compass', async (req, res) => {
  try {
    if (!supabase) return res.json({ success: false, error: 'Database unavailable' })
    const { data, error } = await supabase.from('bias_state_v2').select('*')
    if (error) throw error

    const rows = (data || []).filter(r => V2_CONFIG.PAIRS.includes(r.pair))
    // Same serve-time invalidation guard the headline uses — a level broken between engine ticks
    // must not render as a live bias on the compass either. Display-only: nothing is written back.
    const running = rows.filter(r => r.status === 'running' && r.direction !== 'FLAT')
    const breached = new Set(running.filter(r => v2BreachedAtServeTime(r, '[macro-compass]')).map(r => r.pair))
    const active = running.filter(r => !breached.has(r.pair))

    // A query that succeeds but returns nothing is indistinguishable from a healthy empty table,
    // so it used to fail silently — the panel sat blank for 20 minutes with nothing in the logs
    // until a Railway restart cleared it. Log the row counts at each stage so the next occurrence
    // says whether Supabase returned nothing or the pair filter ate everything.
    if ((data || []).length === 0) {
      console.warn('⚠️ [macro-compass] supabase returned 0 rows — client may be stale')
    } else if (rows.length === 0) {
      console.warn(`⚠️ [macro-compass] ${data.length} raw rows but 0 survived the pair filter`)
    }

    // The headline is whatever was actually PUBLISHED to Today's Bias, not a fresh re-derivation.
    // Today's Bias is cached for TODAY_BIAS_TTL and is subject to the churn guard, so re-deriving
    // here would let the panel flag a different pair than the dashboard card is showing for up to
    // 45 minutes. Reading the published result makes the two disagree by construction impossible.
    // Only trust it if it came from v2 AND that pair is still a live bias; otherwise derive.
    const published = getCached('today_bias')
    const publishedIsLive = published?.engine === 'v2' && active.some(r => r.pair === published.pair)

    // Fallback derivation — used before the first v2 publish, or while v1 is driving the headline.
    const strong = active.filter(r => Math.abs(r.diff_at_entry ?? 0) >= V2_CONFIG.OPEN_THRESHOLD)
    const pool = strong.length ? strong : active
    const derived = pool.length
      ? [...pool].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || Math.abs(b.diff_at_entry ?? 0) - Math.abs(a.diff_at_entry ?? 0))[0].pair
      : null

    const headline = publishedIsLive ? published.pair : derived
    const headlineSource = publishedIsLive ? 'published' : 'derived'

    // Why is this pair flat? bias_state_v2 can't answer it: a pair that was FLAT and stayed FLAT
    // persists no new row, so its stored diff/reason is frozen at whenever it last closed. runV2Shadow
    // stashes every run's fresh read in memory — read that instead. Cold cache (fresh boot, no run
    // yet) → null, and the client keeps its generic fallback line.
    const freshReads = getCached('v2_fresh_reads') || {}
    const T = V2_CONFIG.OPEN_THRESHOLD
    const noBiasReasonFor = pair => {
      const f = freshReads[pair]
      if (!f) return null
      // Engine had a real edge but the day's range is already spent — entering here is chasing.
      if (f.reason === 'adr_exhausted') return "Macro edge is there, but today's range is already spent — no clean entry left."
      const edge = Math.abs(f.diff ?? NaN)
      if (!Number.isFinite(edge)) return null

      // "Too evenly matched" was being shown for two situations that are nothing alike. A pair can
      // sit under the threshold because nothing is happening, or because its components are pulling
      // hard in OPPOSITE directions and cancelling — AUDUSD on 2026-08-17 had the highest sub-
      // threshold diff of any pair AND the lowest confidence, because macro was strongly pro-AUD
      // while orderflow and sentiment fought it. Calling that "evenly matched" is simply false.
      // Count components opposing the net direction from the sign pattern of contrib (m/o/s).
      const sign = f.diff > 0 ? 1 : f.diff < 0 ? -1 : 0
      let against = 0
      if (sign !== 0 && f.contrib) {
        for (const v of [f.contrib.m, f.contrib.o, f.contrib.s]) {
          if (typeof v === 'number' && v !== 0 && Math.sign(v) !== sign) against++
        }
      }
      if (against >= 2) return 'Components disagree — macro points one way, flow and sentiment the other. No clean read.'
      // The lean line asserts "nothing is fighting this" — only claim that when contrib was actually
      // read. A SKIP result (no market data) carries no contrib, and absence of evidence is not
      // evidence of agreement, so fall through to the neutral line instead.
      if (against === 0 && f.contrib && edge >= 1.2) return `Leaning ${sign > 0 ? 'BUY' : 'SELL'} but ${edge.toFixed(1)} of ${T.toFixed(1)} — not enough conviction to call it.`
      return 'Macro signals too evenly matched — no edge on this pair.'
    }

    const shape = r => ({
      pair: r.pair,
      direction: r.direction,                       // 'BUY' | 'SELL' | 'FLAT'
      confidence: r.confidence ?? null,             // 40..92 signal strength — NOT a win rate
      grade: r.grade || null,                       // A | A- | B | C | D
      entryTiming: r.entry_timing || null,          // FRESH | EXTENDED | LATE
      thesis: r.thesis || null,
      invalidationLevel: r.invalidation_level ?? null,
      invalidationText: r.invalidation_text || null,
      regime: r.regime || null,
      isHeadline: r.pair === headline,
      updatedAt: r.updated_at || null,
      noBiasReason: null,                           // flat pairs only — filled in below
    })

    // Active pairs first (strongest conviction leading), then anything currently flat/closed.
    const activeOut = active
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .map(shape)
    // A breached row still carries its old BUY/SELL in the DB, and MacroCompass renders "NO BIAS"
    // purely off direction === 'FLAT' — so force it here, otherwise the card keeps showing the dead
    // direction in the flat group. Still a display override only: the DB row is untouched.
    // A flat pair's stored thesis is FROZEN at whenever it last transitioned — bias_state_v2 only
    // persists on a change, so a pair flat since 10 Aug still carries 10 Aug's thesis. Serving that
    // today as if current is precisely the staleness this panel exists to remove, and there is no
    // fresh one to swap in (writeThesis only runs on OPEN/FLIP). So it is dropped, and the
    // invalidation level goes with it — a level shown on a non-bias reads as an entry.
    //
    // What replaces it is what the engine ACTUALLY computed this run: the lean direction from
    // sign(diff), the fresh confidence, and the per-component breakdown. That is strictly more
    // useful than the old prose, because it names WHICH leg disagrees. No model call involved.
    const leanFor = (pair) => {
      const f = freshReads[pair]
      if (!f || !Number.isFinite(f.diff) || f.diff === 0 || !f.contrib) return null
      const sign = f.diff > 0 ? 1 : -1
      const part = (label, v) => ({
        label,
        value: +(v ?? 0).toFixed(2),
        // agrees with the net lean, so the card can colour dissent without redoing the maths
        agrees: (v ?? 0) === 0 ? null : Math.sign(v) === sign,
      })
      return {
        direction: sign > 0 ? 'BUY' : 'SELL',
        confidence: f.confidence ?? null,
        diff: f.diff,
        components: [part('Macro', f.contrib.m), part('Flow', f.contrib.o), part('Sentiment', f.contrib.s)],
        at: f.at || null,
      }
    }
    const flatOut = rows.filter(r => !active.includes(r)).map(r => {
      const base = { ...shape(r), thesis: null, invalidationLevel: null, invalidationText: null }
      return breached.has(r.pair)
        ? { ...base, direction: 'FLAT', noBiasReason: 'Invalidation level broke — this bias is off the table until the engine re-scores it.' }
        : { ...base, noBiasReason: noBiasReasonFor(r.pair), lean: leanFor(r.pair) }
    })

    res.json({
      success: true,
      engine: 'v2',
      headline,
      // 'published' = mirroring the live Today's Bias card. 'derived' = v2 hasn't published a
      // headline yet (or v1 is driving), so this is the compass's own best pick and the dashboard
      // card may legitimately name a different pair.
      headlineSource,
      regime: active[0]?.regime || rows[0]?.regime || null,
      counts: { total: rows.length, active: active.length, flat: flatOut.length },
      pairs: [...activeOut, ...flatOut],
      updatedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.error('macro-compass error:', e?.message)
    res.json({ success: false, error: 'Failed to load macro compass' })
  }
})

app.get('/api/today-bias', async (req, res) => {
  try {
    if (isForexClosed()) {
      const cached = getCached('today_bias')
      return res.json({ success: true, marketClosed: true, reason: 'Forex market closed (weekend)', ...(cached || { bias: null }), stale: !!cached })
    }
    if (isCacheFreshFor('today_bias', TODAY_BIAS_TTL)) {
      return res.json({ success: true, ...getCached('today_bias'), cached: true })
    }
    const result = await computeTodaysAIBias()
    if (!result) return res.json({ success: true, bias: null, reason: 'No strong pair available right now' })
    // computeTodaysAIBias falls back to the old cache on AI failure — flag it if it's older than the TTL
    const isStale = result.updatedAt && (Date.now() - new Date(result.updatedAt).getTime()) > TODAY_BIAS_TTL
    res.json({ success: true, ...result, stale: isStale })
  } catch (e) {
    console.error('today-bias error:', e?.message)
    const cached = getCached('today_bias')
    res.json({ success: true, ...(cached || { bias: null }), stale: !!cached, error: 'compute failed' })
  }
})

// ============================================
// 🚀 PRE-TRADE GUARDIAN
// ============================================
app.post('/api/trade-check', aiRateLimiter, async (req, res) => {
  const { symbol, direction, lotSize, stopLossPips, accountSize, dailyDrawdownUsed, totalDrawdownUsed, maxDailyDrawdown, maxTotalDrawdown, riskPerTrade, useAI = true } = req.body
  if (!symbol || !direction || !lotSize || !stopLossPips) return res.status(400).json({ success: false, error: 'Required fields missing' })
  try {
    let upcomingEvents = []
    try { const now = new Date(), future = new Date(now.getTime() + 4*60*60*1000); upcomingEvents = (await getEconomicCalendar()).filter(e => e.time && new Date(e.time) > now && new Date(e.time) < future && e.impact?.toLowerCase()==='high').slice(0,5).map(e => ({ event:e.event, country:e.country, time:e.time, minutesUntil:Math.round((new Date(e.time)-now)/60000) })) } catch(e){}

    const pipValue = symbol.toUpperCase().includes('JPY') ? 9.09 : 10
    const estRisk$ = lotSize * pipValue * stopLossPips, estRiskPct = accountSize ? (estRisk$ / accountSize) * 100 : 0
    const tradeCur = symbol.toUpperCase().replace('/','').match(/.{1,3}/g)||[]
    const cMap = { 'US':'USD','EU':'EUR','GB':'GBP','JP':'JPY','AU':'AUD','CA':'CAD','CH':'CHF','NZ':'NZD' }
    const conflicting = upcomingEvents.filter(e => { const ec = cMap[e.country?.toUpperCase()] || e.country?.toUpperCase(); return ec && tradeCur.includes(ec) })
    const imminent = upcomingEvents.find(e => e.minutesUntil <= 60), conflImm = conflicting.find(e => e.minutesUntil <= 60)

    const reasons=[], warnings=[]; let verdict='GREEN', headline='Trade conditions look clear', rec='Proceed with your setup.', conf=85
    if (dailyDrawdownUsed>=90) { verdict='RED'; headline='STOP trading today'; reasons.push(`Drawdown at ${dailyDrawdownUsed.toFixed(1)}%`); rec='Close terminal.'; conf=98 }
    else if (estRiskPct>maxDailyDrawdown) { verdict='RED'; headline='Risk exceeds daily limit'; reasons.push(`Risk: ${estRiskPct.toFixed(2)}%`); rec=`Reduce lot size`; conf=96 }
    else if (conflImm) { verdict='RED'; headline=`${conflImm.event} in ${conflImm.minutesUntil}min`; reasons.push('News affects this pair'); rec=`Wait ${conflImm.minutesUntil+15}min`; conf=94 }
    else if (dailyDrawdownUsed>=70) { verdict='YELLOW'; headline='Drawdown danger zone'; reasons.push(`${dailyDrawdownUsed.toFixed(1)}% used`); rec='Reduce size 50%'; conf=88 }
    else if (estRiskPct>riskPerTrade*1.5) { verdict='YELLOW'; headline='Above normal risk'; reasons.push(`Risk: ${estRiskPct.toFixed(2)}%`); rec=`Stay within ${riskPerTrade}%`; conf=90 }
    else if (imminent) { verdict='YELLOW'; headline=`News in ${imminent.minutesUntil}min`; reasons.push(imminent.event); rec=`Wait ${imminent.minutesUntil+10}min`; conf=82 }
    else { reasons.push(`Risk ${estRiskPct.toFixed(2)}% within ${riskPerTrade}% rule`); reasons.push(upcomingEvents.length===0?'No high-impact news next 4h':`${upcomingEvents.length} events, none affect ${symbol}`) }
    if (totalDrawdownUsed>=80&&verdict!=='RED') warnings.push(`Total DD at ${totalDrawdownUsed.toFixed(1)}%`)

    let final = { verdict, headline, reasons, warnings, recommendation:rec, confidence:conf, engine:'rule-based' }
    if (useAI) {
      try {
        const ctx = `TRADE: ${direction} ${lotSize} lots ${symbol}, SL ${stopLossPips} pips
RISK: $${estRisk$.toFixed(2)} (${estRiskPct.toFixed(2)}% of account)
DRAWDOWN: daily ${dailyDrawdownUsed?.toFixed(1) || 0}% used of ${maxDailyDrawdown}% limit, total ${totalDrawdownUsed?.toFixed(1) || 0}% of ${maxTotalDrawdown}%
RISK RULE: ${riskPerTrade}% per trade
UPCOMING HIGH-IMPACT NEWS (next 4h): ${upcomingEvents.map(e=>`${e.event} (${e.country}) in ${e.minutesUntil}min`).join('; ') || 'none'}
RULE-BASED DRAFT: ${JSON.stringify({ verdict, headline, reasons, warnings, recommendation: rec, confidence: conf })}`
        const m = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: 'You are an elite prop firm risk advisor. Refine the rule-based draft verdict using the trade context. Respond with ONLY valid JSON, no markdown fences, no preamble, exactly this shape: {"verdict":"GREEN|YELLOW|RED","headline":"short punchy headline (max 8 words)","reasons":["3-4 short specific bullets, each under 12 words"],"warnings":["0-2 warnings, only if genuinely warranted"],"recommendation":"one actionable sentence","confidence":85}. Rules: verdict must be GREEN, YELLOW or RED. reasons must always contain 3-4 items grounded in the numbers provided. Never invent news events not listed in context. confidence is an integer 0-100.',
          messages: [{ role: 'user', content: ctx }]
        })
        trackAI('guardian', 'claude-sonnet-4-6', m.usage)
        const ai = JSON.parse(m.content[0].text.trim().replace(/```json|```/g, '').trim())
        final = {
          verdict: ['GREEN','YELLOW','RED'].includes(ai.verdict) ? ai.verdict : verdict,
          headline: (typeof ai.headline === 'string' && ai.headline.trim()) ? ai.headline.trim() : headline,
          reasons: (Array.isArray(ai.reasons) && ai.reasons.length) ? ai.reasons.map(String).slice(0, 4) : reasons,
          warnings: Array.isArray(ai.warnings) ? ai.warnings.map(String).slice(0, 2) : warnings,
          recommendation: (typeof ai.recommendation === 'string' && ai.recommendation.trim()) ? ai.recommendation.trim() : rec,
          confidence: Number.isFinite(+ai.confidence) ? Math.min(100, Math.max(0, Math.round(+ai.confidence))) : conf,
          engine: 'ai-enhanced'
        }
      } catch (e) { console.error('Guardian AI refine failed, falling back to rule-based:', e?.message) }
    }
    res.json({ success:true, verdict:final, meta:{ estimatedRiskDollars:estRisk$.toFixed(2), estimatedRiskPercent:estRiskPct.toFixed(2), upcomingEvents, analyzedAt:new Date().toISOString() } })
  } catch(e){ res.status(500).json({ success:false, error:'Analysis failed' }) }
})
// ============================================
// 💳 GUMROAD WEBHOOK — Auto Pro Upgrade
// ============================================
app.post('/api/gumroad/webhook', async (req, res) => {
  try {
    const { email, product_id, product_name, sale_id, recurrence, price, refunded, subscription_id, resource_name } = req.body
    console.log('Gumroad webhook:', { email, product_name, sale_id, recurrence, refunded, resource_name })
    if (!email) return res.status(400).json({ error: 'No email provided' })
    const buyerEmail = email.toLowerCase().trim()
    if (refunded === 'true' || resource_name === 'cancellation' || resource_name === 'subscription_ended') {
      await supabase.from('user_plans').update({ tier: 'free', updated_at: new Date().toISOString() }).eq('email', buyerEmail)
      console.log(`Downgraded ${buyerEmail} to free`)
      return res.json({ success: true, action: 'downgraded' })
    }
    const { data: existing } = await supabase.from('user_plans').select('*').eq('email', buyerEmail).single()
    if (existing) {
      await supabase.from('user_plans').update({ tier: 'pro', updated_at: new Date().toISOString() }).eq('email', buyerEmail)
    } else {
      const { data: { users } } = await supabase.auth.admin.listUsers()
      const authUser = users?.find(u => u.email?.toLowerCase() === buyerEmail)
      await supabase.from('user_plans').upsert({ user_id: authUser?.id || null, email: buyerEmail, tier: 'pro', updated_at: new Date().toISOString() }, { onConflict: 'email' })
    }
    console.log(`Upgraded ${buyerEmail} to PRO`)
    res.json({ success: true, action: 'upgraded' })
  } catch (e) {
    console.error('Gumroad webhook error:', e.message)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})
// ============================================
// 🪙 CRYPTO PAYMENTS (NOWPayments — runs PARALLEL to Gumroad)
//    Settlement USDT (TRC20). Customer pays BTC / USDT / USDC.
//    Crypto does NOT auto-renew → we track expires_at and expire on read.
// ============================================

// NOWPayments signs the IPN with HMAC-SHA512 over the JSON body
// with keys sorted alphabetically (recursively). Rebuild + compare.
function npSortObject(obj) {
  return Object.keys(obj).sort().reduce((acc, key) => {
    const val = obj[key]
    acc[key] = (val && typeof val === 'object' && !Array.isArray(val)) ? npSortObject(val) : val
    return acc
  }, {})
}

// PART 1 — create an invoice, return the hosted checkout URL
app.post('/api/crypto/create-payment', async (req, res) => {
  try {
    const { email, plan } = req.body
    if (!email) return res.status(400).json({ error: 'No email provided' })
    if (plan !== 'monthly' && plan !== 'annual') return res.status(400).json({ error: 'Invalid plan' })
    const buyerEmail = email.toLowerCase().trim()
    const price = plan === 'annual' ? 399 : 40
    const { data } = await axios.post('https://api.nowpayments.io/v1/invoice', {
      price_amount: price,
      price_currency: 'usd',
      // pay_currency is deliberately omitted, not sent as null — NOWPayments rejects a null with
      // INVALID_REQUEST_PARAMS ("pay_currency must be a string"). Leaving the field out is what
      // lets the customer pick BTC / USDT / USDC on the hosted NOWPayments page.
      order_id: `biasforge_${plan}_${buyerEmail}_${Date.now()}`,
      order_description: `BiasForge Pro ${plan}`,
      ipn_callback_url: 'https://marketradar-production.up.railway.app/api/crypto/webhook',
      success_url: 'https://biasforge.co/dashboard?crypto=success',
      cancel_url: 'https://biasforge.co/pricing?crypto=cancelled'
    }, {
      headers: { 'x-api-key': process.env.NOWPAYMENTS_API_KEY, 'Content-Type': 'application/json' }
    })
    console.log('Crypto invoice created:', { email: buyerEmail, plan, id: data?.id })
    res.json({ success: true, invoice_url: data.invoice_url })
  } catch (e) {
    console.error('Crypto create-payment error:', e.response?.data || e.message)
    res.status(500).json({ error: 'Failed to create crypto payment' })
  }
})

// PART 2 — IPN webhook: verify signature, then upgrade + set expiry
app.post('/api/crypto/webhook', async (req, res) => {
  try {
    const sig = req.headers['x-nowpayments-sig']
    const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET
    if (!sig || !ipnSecret) return res.status(400).json({ error: 'Missing signature' })

    const expected = crypto.createHmac('sha512', ipnSecret)
      .update(JSON.stringify(npSortObject(req.body)))
      .digest('hex')
    const sigBuf = Buffer.from(sig, 'hex')
    const expBuf = Buffer.from(expected, 'hex')
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      console.error('Crypto webhook: invalid signature')
      return res.status(401).json({ error: 'Invalid signature' })
    }

    const { payment_status, order_id } = req.body
    console.log('Crypto webhook:', { payment_status, order_id })

    // Only credit on fully-paid statuses (waiting/confirming/partially_paid do NOT upgrade)
    if (payment_status !== 'finished' && payment_status !== 'confirmed') {
      return res.json({ success: true, action: 'ignored', status: payment_status })
    }

    // order_id = biasforge_<plan>_<email>_<timestamp>. Email may contain '_',
    // so plan is index 1, timestamp is the last chunk, email is everything between.
    const parts = (order_id || '').split('_')
    const plan = parts[1]
    const buyerEmail = parts.slice(2, -1).join('_')
    if (!buyerEmail || (plan !== 'monthly' && plan !== 'annual')) {
      console.error('Crypto webhook: cannot parse order_id', order_id)
      return res.status(400).json({ error: 'Bad order_id' })
    }

    // Stack the new term on top of any remaining active time
    const { data: existing } = await supabase.from('user_plans').select('*').eq('email', buyerEmail).single()
    const days = plan === 'annual' ? 365 : 30
    const now = Date.now()
    const existingMs = existing?.expires_at ? new Date(existing.expires_at).getTime() : 0
    const base = existingMs > now ? existingMs : now
    const expiresAt = new Date(base + days * 24 * 60 * 60 * 1000).toISOString()

    if (existing) {
      await supabase.from('user_plans').update({ tier: 'pro', expires_at: expiresAt, updated_at: new Date().toISOString() }).eq('email', buyerEmail)
    } else {
      const { data: { users } } = await supabase.auth.admin.listUsers()
      const authUser = users?.find(u => u.email?.toLowerCase() === buyerEmail)
      await supabase.from('user_plans').upsert({ user_id: authUser?.id || null, email: buyerEmail, tier: 'pro', expires_at: expiresAt, updated_at: new Date().toISOString() }, { onConflict: 'email' })
    }
    console.log(`Crypto: upgraded ${buyerEmail} to PRO until ${expiresAt}`)
    res.json({ success: true, action: 'upgraded', expires_at: expiresAt })
  } catch (e) {
    console.error('Crypto webhook error:', e.message)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})
// ============================================
// 📓 TRADE JOURNAL
// ============================================
app.get('/api/trades', async (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' })
  
  try {
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' })

    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })

    if (error) throw error
    res.json({ success: true, trades: data })
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch trades' })
  }
})

app.post('/api/trades', async (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' })

  try {
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' })

    const t = req.body
    const { data, error } = await supabase
      .from('trades')
      .insert({
        user_id: user.id,
        pair: t.pair,
        direction: t.direction,
        entry_price: t.entryPrice || null,
        exit_price: t.exitPrice || null,
        lot_size: t.lotSize || null,
        stop_loss: t.stopLoss || null,
        take_profit: t.takeProfit || null,
        pnl: parseFloat(t.pnl) || 0,
        result: t.result,
        date: t.date,
        session: t.session || null,
        setup: t.setup || null,
        notes: t.notes || null,
        emotion: t.emotion || null,
        rating: t.rating || 3,
        before_image: t.beforeImage || null,
        before_link: t.beforeLink || null,
        after_image: t.afterImage || null,
        after_link: t.afterLink || null,
      })
      .select()
      .single()

    if (error) throw error
    res.json({ success: true, trade: data })
  } catch (e) {
    res.status(500).json({ error: 'Failed to save trade' })
  }
})

app.put('/api/trades/:id', async (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' })
  try {
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' })

    const t = req.body
    const { data, error } = await supabase
      .from('trades')
      .update({
        pair: t.pair,
        direction: t.direction,
        entry_price: t.entryPrice || null,
        exit_price: t.exitPrice || null,
        lot_size: t.lotSize || null,
        stop_loss: t.stopLoss || null,
        take_profit: t.takeProfit || null,
        pnl: parseFloat(t.pnl) || 0,
        result: t.result,
        date: t.date,
        session: t.session || null,
        setup: t.setup || null,
        notes: t.notes || null,
        emotion: t.emotion || null,
        rating: t.rating || 3,
        before_image: t.beforeImage || null,
        before_link: t.beforeLink || null,
        after_image: t.afterImage || null,
        after_link: t.afterLink || null,
      })
      .eq('id', req.params.id)
      .eq('user_id', user.id) // users can only edit their own trades
      .select()
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Trade not found' })
    res.json({ success: true, trade: data })
  } catch (e) {
    res.status(500).json({ error: 'Failed to update trade' })
  }
})

app.delete('/api/trades/:id', async (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' })

  try {
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' })

    const { error } = await supabase
      .from('trades')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', user.id)

    if (error) throw error
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete trade' })
  }
})
// ============================================
// 👤 USER PLAN
// ============================================
app.get('/api/user/plan', async (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' })

  try {
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' })

    // Check if plan exists
    let { data: plan } = await supabase
      .from('user_plans')
      .select('*')
      .eq('user_id', user.id)
      .single()

    // If no plan exists, create free plan
    if (!plan) {
      const { data: newPlan } = await supabase
        .from('user_plans')
        .insert({
          user_id: user.id,
          email: user.email,
          tier: 'free',
          trial_start: new Date().toISOString(),
        })
        .select()
        .single()
      plan = newPlan
    }

    // Crypto plans don't auto-renew — downgrade once past expiry.
    // Gumroad/subscription pro users have expires_at = null, so they're never touched here.
    if (plan?.tier === 'pro' && plan?.expires_at && new Date(plan.expires_at).getTime() < Date.now()) {
      await supabase.from('user_plans').update({ tier: 'free', updated_at: new Date().toISOString() }).eq('user_id', user.id)
      plan.tier = 'free'
      console.log(`Crypto plan expired — downgraded ${user.email} to free`)
    }

    res.json({
      success: true,
      plan: {
        tier: plan?.tier || 'free',
        trialStart: plan?.trial_start,
        expiresAt: plan?.expires_at || null,
        updatedAt: plan?.updated_at,
      }
    })
  } catch (e) {
    res.status(500).json({ error: 'Failed to get plan' })
  }
})
// ============================================
// 📅 CALENDAR (ForexFactory feed — Finnhub economic calendar is premium-only)
// ============================================
app.get('/api/calendar', async (req, res) => {
  const mc = ['USD','EUR','GBP','JPY','AUD','CAD','CHF','NZD','CNY']
  try {
    const events = await getEconomicCalendar()
    const norm = events.filter(e=>mc.includes(e.country)).map(e=>({ title:e.event, country:e.country, date:e.time, impact:e.impact?.toLowerCase()==='high'?'High':e.impact?.toLowerCase()==='medium'?'Medium':'Low', forecast:e.forecast||'-', previous:e.previous||'-', actual:'-' }))
    norm.sort((a,b)=>{const o={High:0,Medium:1,Low:2};return o[a.impact]!==o[b.impact]?o[a.impact]-o[b.impact]:new Date(a.date)-new Date(b.date)})
    res.json(norm)
  } catch(e){ res.status(502).json({error:'Calendar fetch failed'}) }
})

// ============================================
// 🗓️ CALENDAR EVENT BRIEF — POST /api/calendar-brief
// The prompt used to be built in the browser (EconomicCalendar.jsx) and shipped to the generic
// /api/ai passthrough, which meant: the prompt was visible in DevTools, anyone could POST an
// arbitrary prompt to it, and the model saw ONLY the event's title/forecast/previous — every macro
// fact (chair, policy rate, core PCE, CB stances) was HARDCODED TEXT the model just read back.
// This endpoint takes the event IDENTIFIER only and fetches the macro state live, per request.
// v2 is untouched: the one v2 asset read here (the banked 2Y history) is READ-ONLY.
// ============================================

// Facts no free API publishes. Kept here, NOT inline in the prompt, so there is exactly one place
// to update them — and the prompt carries the verified date so the model can weigh their age.
// NAMES ONLY: no rate levels, no policy stance. Everything with a number comes from a live fetch.
// last verified: 2026-08-07
const POLICY_SEATS = {
  lastVerified: '2026-08-07',
  USD: 'Federal Reserve — Chair: Kevin Warsh (took office May 2026)',
  EUR: 'European Central Bank — President: Christine Lagarde',
  GBP: 'Bank of England — Governor: Andrew Bailey',
  JPY: 'Bank of Japan — Governor: Kazuo Ueda',
  CHF: 'Swiss National Bank — Chairman: Martin Schlegel',
  CAD: 'Bank of Canada — Governor: Tiff Macklem',
  AUD: 'Reserve Bank of Australia — Governor: Michele Bullock',
  NZD: 'Reserve Bank of New Zealand — Governor: Christian Hawkesby',
}

// Pairs to analyse for a given event currency — restricted to ROOM_SYMBOL_MAP keys, because that
// is what getDailyCandles can actually price. XAUUSD is always included (it trades every macro event).
const BRIEF_PAIRS = {
  USD: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'XAUUSD'],
  EUR: ['EURUSD', 'EURGBP', 'EURJPY', 'XAUUSD'],
  GBP: ['GBPUSD', 'EURGBP', 'GBPJPY', 'XAUUSD'],
  JPY: ['USDJPY', 'EURJPY', 'GBPJPY', 'AUDJPY', 'XAUUSD'],
  AUD: ['AUDUSD', 'AUDJPY', 'EURUSD', 'XAUUSD'],
  CAD: ['USDCAD', 'EURUSD', 'XAUUSD'],
  CHF: ['USDCHF', 'EURUSD', 'XAUUSD'],
  NZD: ['NZDUSD', 'AUDUSD', 'EURUSD', 'XAUUSD'],
  CNY: ['AUDUSD', 'USDJPY', 'XAUUSD'],
}

// Which already-released prints LEAD a given event. `match` classifies the event the user clicked;
// `leads` selects the recent releases that inform it. Both run against ForexFactory titles.
const LEADING_FAMILIES = [
  { id: 'employment',
    match: /non.?farm|payroll|\bnfp\b|unemployment rate|employment change|claimant count/i,
    leads: /\badp\b|jobless claims|unemployment claims|challenger|\bjolts\b|employment (index|change|component)|ism.*employ|average hourly earnings|labou?r cost/i },
  { id: 'inflation',
    // PPI belongs on BOTH sides: it leads CPI, but it is also a high-impact inflation print in its
    // own right. Without it in `match`, opening a brief on "PPI m/m" matched no family at all and
    // returned zero leading indicators.
    match: /\bcpi\b|consumer price|inflation rate|core pce|pce price index|\brpi\b|\bppi\b|producer price/i,
    leads: /\bppi\b|producer price|import price|average hourly earnings|inflation expectation|prices? (paid|index)|unit labou?r cost/i },
  { id: 'rate-decision',
    match: /rate (decision|statement)|interest rate|monetary policy|fomc|official cash rate|cash rate/i,
    leads: /\bcpi\b|consumer price|core pce|non.?farm|payroll|unemployment rate|\bgdp\b|retail sales|member|speaks|minutes/i },
  { id: 'growth',
    match: /\bgdp\b|gross domestic/i,
    leads: /retail sales|industrial production|\bism\b|\bpmi\b|durable goods|trade balance|construction/i },
  { id: 'consumption',
    match: /retail sales|consumer spending|personal spending/i,
    leads: /consumer (confidence|sentiment|credit)|redbook|average hourly earnings|non.?farm|payroll/i },
  { id: 'activity',
    match: /\bism\b|\bpmi\b|manufacturing index|services index/i,
    leads: /philly fed|philadelphia fed|empire state|richmond|chicago pmi|flash|industrial production|durable goods/i },
]


// FEDFUNDS (effective policy rate) + PCEPILFE (core PCE index → YoY) straight from FRED.
// These two were the worst of the hardcoded facts — "3.50%-3.75%" and "core PCE ~3.3%" were typed
// into the browser prompt and the model simply recited them. Now they carry their own print date.
const BRIEF_MACRO_TTL = 12 * 60 * 60 * 1000
async function fetchPolicyRateAndInflation() {
  // A result still missing a leg is only held for 30min, not the full 12h — otherwise one transient
  // FRED timeout would suppress that series for the rest of the day.
  const cachedMacro = getCached('cal_brief_macro')
  if (cachedMacro && isCacheFreshFor('cal_brief_macro', cachedMacro.partial ? 30 * 60 * 1000 : BRIEF_MACRO_TTL)) return cachedMacro
  const key = process.env.FRED_API_KEY?.trim()
  if (!key) return { fedFunds: null, corePCE: null, error: 'FRED_API_KEY not set' }
  const obs = async (id, limit) => {
    try {
      const r = await axios.get('https://api.stlouisfed.org/fred/series/observations', {
        params: { series_id: id, api_key: key, file_type: 'json', sort_order: 'desc', limit },
        timeout: 10000,
      })
      return (r.data?.observations || []).map(o => ({ date: o.date, v: parseFloat(o.value) })).filter(o => !isNaN(o.v))
    } catch (e) { console.warn(`🏦 FRED ${id} (brief) failed: ${e?.message}`); return [] }
  }
  const [ff, pce] = await Promise.all([obs('FEDFUNDS', 4), obs('PCEPILFE', 15)])
  const fedFunds = ff.length
    ? { value: +ff[0].v.toFixed(2), prev: ff[1] ? +ff[1].v.toFixed(2) : null, date: ff[0].date }
    : null
  // Core PCE is published as an INDEX — the headline figure traders quote is its 12-month change.
  const corePCE = pce.length >= 13
    ? {
        yoy: +((pce[0].v / pce[12].v - 1) * 100).toFixed(1),
        prevYoY: (pce[1] && pce[13]) ? +((pce[1].v / pce[13].v - 1) * 100).toFixed(1) : null,
        date: pce[0].date,
      }
    : null
  // Per-leg stale fallback. One leg failing is common (transient FRED timeout) and must not blank
  // the other or, worse, get cached as null for the next 12h — that is how a working fed funds read
  // disappeared between two runs. Keep the last good value for whichever leg failed.
  const prevGood = cachedMacro
  const out = { fedFunds: fedFunds || prevGood?.fedFunds || null, corePCE: corePCE || prevGood?.corePCE || null }
  out.partial = !out.fedFunds || !out.corePCE
  if (out.fedFunds || out.corePCE) setCache('cal_brief_macro', out)
  if (!fedFunds || !corePCE) console.warn(`⚠️ [brief] FRED partial: FEDFUNDS ${fedFunds ? 'ok' : 'FAILED'}, PCEPILFE ${corePCE ? 'ok' : 'FAILED'}${(!fedFunds && out.fedFunds) || (!corePCE && out.corePCE) ? ' — reused last good value' : ''}`)
  return out
}

// Yield LEVELS for the brief. fetchYields() is the shared path and is tried first so a warm cache
// costs nothing — but its primary source is the TwelveData cross-asset batch, and tdAcquire() can
// park it behind the credit budget for minutes. When that happens the request budget expires before
// the function ever reaches its own FRED fallback, and the brief reports no yields at all despite
// FRED being up. So: give the shared path a short leash, then read DGS2/DGS10 directly.
async function briefYields(cross) {
  // 1. Shared cache, if the crons have already filled it — free and instant.
  const cached = getCached('yields_fred')
  if (cached && isCacheFreshFor('yields_fred', YIELDS_TTL) && (cached.y2 || cached.y10)) return cached
  // 2. The cross-asset batch THIS request already fetched. Deliberately NOT fetchYields(): that
  //    would re-enter fetchCrossAssetLive() and park behind the TwelveData credit budget, and the
  //    request budget expires before its own FRED fallback ever runs.
  const fromTd = (q) => {
    const v = q?.price
    if (v == null || isNaN(v) || v <= 0 || v > 20) return null   // must look like a yield, not a bond price
    let chg = (q.prev != null && !isNaN(q.prev) && q.prev !== v) ? v - q.prev : 0
    if (Math.abs(chg) > 1.5) chg = 0                              // implausible 1-day move = unit mismatch
    return { value: +v.toFixed(3), change: +chg.toFixed(3), date: (q.datetime || '').slice(0, 10), datetime: q.datetime || null }
  }
  const tdY2 = fromTd(cross?.US2Y), tdY10 = fromTd(cross?.US10Y)
  if (tdY2 && tdY10) return { y2: tdY2, y10: tdY10, source: 'twelvedata (cross-asset batch)', fred_stale: false }
  // 3. Whatever is still missing comes straight from FRED — free, fast, no shared credit budget.
  const key = process.env.FRED_API_KEY?.trim()
  if (!key) return tdY2 || tdY10 ? { y2: tdY2, y10: tdY10, source: 'twelvedata (partial, no FRED key)', fred_stale: false } : null
  const leg = async (id) => {
    try {
      const r = await axios.get('https://api.stlouisfed.org/fred/series/observations', {
        params: { series_id: id, api_key: key, file_type: 'json', sort_order: 'desc', limit: 8 },
        timeout: 10000,
      })
      const vals = (r.data?.observations || []).map(o => ({ date: o.date, v: parseFloat(o.value) })).filter(o => !isNaN(o.v))
      if (!vals.length) return null
      const latest = vals[0], prev = vals[1] || vals[0]
      return { value: latest.v, change: +(latest.v - prev.v).toFixed(2), date: latest.date }
    } catch (e) { console.warn(`🏦 [brief] FRED ${id} failed: ${e?.message}`); return null }
  }
  const [fredY2, fredY10] = await Promise.all([tdY2 ? null : leg('DGS2'), tdY10 ? null : leg('DGS10')])
  const y2 = tdY2 || fredY2, y10 = tdY10 || fredY10
  if (!y2 && !y10) return null
  const source = (tdY2 && tdY10) ? 'twelvedata (cross-asset batch)'
    : (tdY2 || tdY10) ? 'twelvedata + FRED (FRED leg on a 1-2 business day govt lag)'
    : 'FRED DGS2/DGS10 direct (1-2 business day govt lag)'
  console.log(`🏦 [brief] yields via ${source}`)
  return { y2, y10, source, fred_stale: !tdY2 }
}

// READ-ONLY view of the 2Y history v2 banks. Same 3-session basis as v2Yield2y3SessionBps(), but it
// does NOT record today's level or write the snapshot — the brief must not mutate v2 state.
async function briefYield2y3Session() {
  try {
    const hist = await v2Yield2yLoadHistory()
    const latest = hist?.[0], back = hist?.[Y2_LOOKBACK_SESSIONS]
    if (!latest || !back) return { bps: null, sessions: hist?.length || 0, reason: `history not built yet (${hist?.length || 0}/${Y2_LOOKBACK_SESSIONS + 1} sessions banked)` }
    const ageDays = Math.floor((Date.now() - new Date(latest.date + 'T00:00:00Z').getTime()) / 86400000)
    if (ageDays > Y2_MAX_STALE_DAYS) return { bps: null, sessions: hist.length, reason: `history frozen — newest banked session ${latest.date} is ${ageDays}d old` }
    return { bps: +((latest.value - back.value) * 100).toFixed(1), sessions: hist.length, from: back.date, to: latest.date }
  } catch (e) { return { bps: null, sessions: 0, reason: e?.message || 'unavailable' } }
}

// Recent releases WITH their actuals — the one thing the shared calendar cannot give us.
// The FF free feed carries only title/country/date/impact/forecast/previous (verified: no `actual`
// key at all, even on past events), and fetchFMPCalendar() only ever requests from TODAY forward,
// so neither existing path can answer "what did ADP actually print". This asks FMP for the PAST
// window and keeps `actual`/`estimate`. 30-min cache, keyed per currency.
const BRIEF_ACTUALS_TTL = 30 * 60 * 1000
// `lastVendorStatus` records WHY the vendor produced nothing — key absent vs rejected vs quota vs
// simply empty. Externally these all look identical (the calendar just falls back to the FF feed),
// and there is no way to read Railway's env vars from here, so the endpoint reports this coarse
// status instead. It carries no key material — only a reason code.
let lastVendorStatus = null
async function fetchRecentActuals(currency) {
  const ck = `brief_actuals_${currency}`
  if (isCacheFreshFor(ck, BRIEF_ACTUALS_TTL)) { lastVendorStatus = 'ok (cached)'; return getCached(ck) }
  if (!FMP_KEY) { lastVendorStatus = 'FMP_API_KEY not set in env'; return null }
  const to = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 14 * 86400 * 1000).toISOString().slice(0, 10)
  const endpoints = [
    { label: 'legacy', url: 'https://financialmodelingprep.com/api/v3/economic_calendar' },
    { label: 'stable', url: 'https://financialmodelingprep.com/stable/economic-calendar' },
  ]
  const attempts = []
  for (const ep of endpoints) {
    try {
      const r = await axios.get(ep.url, { params: { from, to, apikey: FMP_KEY }, timeout: 12000 })
      if (!Array.isArray(r.data) || !r.data.length) {
        // FMP answers auth/plan problems with HTTP 200 and an {"Error Message": …} object, so an
        // empty or non-array body is the shape a rejected key actually arrives in.
        const msg = r.data?.['Error Message'] || r.data?.message || (Array.isArray(r.data) ? 'empty array' : `non-array ${typeof r.data}`)
        attempts.push(`${ep.label}: HTTP ${r.status}, ${String(msg).slice(0, 120)}`)
        continue
      }
      const rows = r.data.map(e => {
        const ccy = (e.currency && String(e.currency).toUpperCase()) || CCY_FROM_COUNTRY[String(e.country || '').toUpperCase()] || String(e.country || '').toUpperCase()
        return {
          title: e.event || 'Event', currency: ccy, time: parseFMPDate(e.date),
          actual: (e.actual === null || e.actual === undefined) ? null : String(e.actual),
          forecast: (() => { const f = e.estimate ?? e.forecast; return (f === null || f === undefined) ? null : String(f) })(),
          previous: (e.previous === null || e.previous === undefined) ? null : String(e.previous),
        }
      }).filter(e => e.time && e.currency === currency && e.actual !== null && String(e.actual).trim() !== '')
      console.log(`📑 [brief] FMP ${ep.label} past-window: ${rows.length} ${currency} releases with actuals (${from} → ${to})`)
      if (rows.length) { lastVendorStatus = `ok (${ep.label}, ${rows.length} rows)`; setCache(ck, rows); return rows }
      attempts.push(`${ep.label}: HTTP ${r.status}, ${r.data.length} rows but 0 ${currency} with actuals`)
    } catch (e) {
      const st = e?.response?.status
      const body = e?.response?.data?.['Error Message'] || e?.response?.data?.message || e?.message
      attempts.push(`${ep.label}: ${st ? `HTTP ${st}` : 'network'}, ${String(body).slice(0, 120)}`)
      console.warn(`⚠️ [brief] FMP ${ep.label} past-window failed: ${st || ''} ${e?.message}`)
    }
  }
  lastVendorStatus = attempts.join(' | ') || 'no response'
  return null
}

// ============================================
// 🔎 RELEASE ACTUALS CACHE — proprietary prints no free API carries
// ADP and the two ISM PMIs are licensed products: ISM pulled all 22 of its series off FRED in 2016,
// and ADP was never there. They are also the most useful NFP leads, so the brief has been reporting
// "insufficient leading data" for exactly the events where a lead would matter most.
//
// A cron searches each release ONCE, just after it publishes, and banks the result. The brief only
// ever READS this table — so its latency and cost are unchanged, and an empty table degrades to the
// existing FRED path rather than failing. Cost lands per RELEASE (~3/month), not per brief.
//
// Jobless claims are deliberately NOT here: FRED's ICSA already carries them for free, and a probe
// confirmed the searched figure and ICSA agree exactly. Paying for a search there would buy nothing.
// ============================================


// Every series here must be BOTH proprietary (absent from FRED/ECB/ONS) and present on the FF
// calendar, which supplies the forecast — the half the search cannot reliably get.
const SEARCHED_SERIES = {
  ADP: {
    label: 'ADP National Employment Report',
    subject: 'private payrolls change',
    match: /adp.*(non.?farm|employment)/i,
    domains: ['adp.com', 'adpemploymentreport.com', 'mediacenter.adp.com'],
    range: [-2_000_000, 2_000_000],   // jobs; a real print is tens/hundreds of thousands
    cadence: 'monthly',
    polarity: 'direct',
  },
  ISM_MFG: {
    label: 'ISM Manufacturing PMI',
    subject: 'headline PMI index value',
    match: /^ism manufacturing pmi$/i,
    domains: ['ismworld.org'],
    range: [25, 80],                  // a diffusion index; outside this is a parse error, not a print
    cadence: 'monthly',
    polarity: 'direct',
  },
  ISM_SVC: {
    label: 'ISM Services PMI',
    subject: 'headline PMI index value',
    match: /^ism (services|non-manufacturing) pmi$/i,
    domains: ['ismworld.org'],
    range: [25, 80],
    cadence: 'monthly',
    polarity: 'direct',
  },
  // ── Companions: a second figure printed in the SAME release as its parent ──
  // Prices-paid is one of the better CPI/PPI leads and is not on FRED, but it sits in the very
  // report the parent search already retrieves. Asking for both figures in one call costs nothing;
  // a separate series would mean a second monthly search for a number already on the page.
  ISM_MFG_PRICES: {
    label: 'ISM Manufacturing Prices Index',
    subject: 'Prices Index (prices paid) sub-index value',
    match: /^ism manufacturing prices$/i,
    domains: ['ismworld.org'],
    range: [25, 80],
    cadence: 'monthly',
    polarity: 'direct',
    filledBy: 'ISM_MFG',      // never searched on its own — see the sweep loop
  },
  ISM_SVC_PRICES: {
    label: 'ISM Services Prices Index',
    subject: 'Prices Index (prices paid) sub-index value',
    match: /^ism (services|non-manufacturing) prices$/i,
    domains: ['ismworld.org'],
    range: [25, 80],
    cadence: 'monthly',
    polarity: 'direct',
    filledBy: 'ISM_SVC',
  },
}
// parent → companion, derived from filledBy so the two directions cannot drift apart.
const SERIES_COMPANION = Object.fromEntries(
  Object.entries(SEARCHED_SERIES).filter(([, c]) => c.filledBy).map(([id, c]) => [c.filledBy, id])
)

// Which searched series inform which event family (families come from LEADING_FAMILIES).
const SEARCH_LEADING_BY_FAMILY = {
  employment: ['ADP', 'ISM_MFG', 'ISM_SVC'],
  activity: ['ISM_MFG', 'ISM_SVC'],
  growth: ['ISM_MFG', 'ISM_SVC'],
  inflation: ['ISM_MFG_PRICES', 'ISM_SVC_PRICES'],
  'rate-decision': ['ADP', 'ISM_MFG', 'ISM_MFG_PRICES'],
}

// TIME-BOXED, not a permanent latch. The table is created by hand in Supabase, so "missing" is a
// state that ends without the process being told — a one-way boolean would keep the sweeper
// disabled until the next redeploy, silently, for a table that now exists. The suppression exists
// only to stop every sweep re-logging the same error, so it expires on its own.
const RA_MISSING_RECHECK_MS = 10 * 60 * 1000
let raMissingUntil = 0
const raTableMissing = () => Date.now() < raMissingUntil
function raTableGone(error) {
  const c = error?.code || ''
  if (c === '42P01' || c === 'PGRST205' || /release_actuals/i.test(error?.message || '') && /does not exist|not find/i.test(error?.message || '')) {
    if (!raTableMissing()) {
      console.error(`⚠️ [release-actuals] table \`release_actuals\` does not exist — searches paused ${RA_MISSING_RECHECK_MS / 60000}min, brief falls back to FRED. Run backend/scripts/release_actuals.sql to enable.`)
    }
    raMissingUntil = Date.now() + RA_MISSING_RECHECK_MS
    return true
  }
  return false
}

// ── Ledger: one row per RELEASE, created when the event appears on the calendar ──
// Created at SCHEDULE time, not at search time, because the forecast comes from the FF feed and FF
// only serves the current week — if the row were created after the release the forecast could
// already be gone, and beat/miss with it.
async function ensurePendingReleaseRows() {
  if (raTableMissing()) return 0
  let events = []
  try { events = await getEconomicCalendar() } catch (e) { return 0 }
  const rows = []
  for (const e of events) {
    if ((e.country || '').toUpperCase() !== 'USD' || !e.time) continue
    for (const [id, cfg] of Object.entries(SEARCHED_SERIES)) {
      if (!cfg.match.test(e.event || '')) continue
      const period = expectedPeriodFor(e.time)
      rows.push({
        release_key: `${id}:${period.key}`,
        series_id: id,
        reference_period: period.key,
        scheduled_at: e.time,
        next_release_at: nextReleaseAfter(e.time),
        forecast: e.forecast || null,
        previous: e.previous || null,
        status: 'pending',
        attempts: 0,
      })
    }
  }
  if (!rows.length) return 0
  try {
    // ignoreDuplicates: a row already banked (possibly already `found`) must never be reset to
    // pending by a later calendar refresh — that would re-run a search we already paid for.
    const { error } = await supabase.from('release_actuals').upsert(rows, { onConflict: 'release_key', ignoreDuplicates: true })
    if (error) { if (!raTableGone(error)) console.warn(`⚠️ [release-actuals] row upsert failed: ${error.message}`); return 0 }
  } catch (e) { console.warn(`⚠️ [release-actuals] row upsert threw: ${e?.message}`); return 0 }
  return rows.length
}

// ── The search itself ──
// The query gets MORE SPECIFIC with each attempt. A bare retry would re-run the same search and the
// model would very likely surface the same stale page it surfaced last time — which is exactly the
// failure mode observed in testing (a 9-month-old ADP print returned as "most recent"). Naming the
// period and the publication date forces a different result set.
function releaseSearchQuery(cfg, period, scheduledAt, attempt) {
  const d = new Date(scheduledAt)
  const relDate = `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
  const base = `${cfg.label} ${period.name} ${period.year}`
  if (attempt <= 1) return base
  if (attempt === 2) return `${base} released ${relDate} press release`
  return `"${cfg.label}" ${period.name} ${period.year} official report published ${relDate} — not a prior month`
}

const RELEASE_SEARCH_GUARD = `You report a single economic data release. Rules you must not break:

1. Report a figure ONLY if you found it on a page you actually retrieved in this conversation, and you can give the exact URL.
2. You are looking for ONE SPECIFIC reference period. If you cannot find that exact period, answer "not available" — do NOT substitute a different month, and do NOT report the most recent figure you happen to find instead.
3. Never estimate, interpolate, recall from memory, or reason your way to a number. A wrong number stated confidently is far worse than "not available".
4. release_date is when the figure was PUBLISHED. reference_period is the month the figure DESCRIBES. They are different — report both, and do not confuse a revised figure for the initial print.

5. Where a second figure is requested, it comes from the SAME report as the first. Report it only if you actually saw it there; leave companion_value null otherwise. Do not confuse the two figures — they are different numbers on the same page and both look like plausible index readings.

Return ONLY raw JSON, no markdown:
{"status":"found"|"not available","value":"<figure exactly as published>","companion_value":"<second figure, or null>","reference_period":"<period it describes>","release_date":"<YYYY-MM-DD it was published>","source_url":"<exact URL>","reason":"<only when not available>"}`

async function searchReleaseActual(seriesId, cfg, period, scheduledAt, attempt, companionCfg) {
  const query = releaseSearchQuery(cfg, period, scheduledAt, attempt)
  const prompt = `Find the ${cfg.subject} from the ${cfg.label}.

REQUIRED reference period: ${period.name} ${period.year} (${period.key})
Expected publication date: on or about ${new Date(scheduledAt).toISOString().slice(0, 10)}

Search for: ${query}
${companionCfg ? `
ALSO, from that same report, report the ${companionCfg.subject} as "companion_value". This is a
DIFFERENT number from the headline figure above — both are index readings in the same release, so
be careful not to repeat the headline. If you cannot find it, set companion_value to null; do not
guess it and do not let it change the headline answer.
` : ''}
If the only figures you can find are for a different month, that is "not available" — say so rather than reporting the wrong month.`
  let messages = [{ role: 'user', content: prompt }]
  let m, pauses = 0
  for (;;) {
    m = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: RELEASE_SEARCH_GUARD,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6, allowed_domains: cfg.domains }],
      messages,
    })
    // Server-tool loop caps at 10 iterations and stops with pause_turn — resume by appending the
    // assistant turn, with no extra user message.
    if (m.stop_reason !== 'pause_turn' || pauses >= 2) break
    pauses++
    messages = [...messages, { role: 'assistant', content: m.content }]
  }
  trackAI('release-search', 'claude-sonnet-4-6', m.usage)
  const searches = m.usage?.server_tool_use?.web_search_requests || 0
  const text = m.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim().replace(/```json|```/g, '').trim()
  let out = null
  try { out = JSON.parse(text) } catch (e) {
    const s = text.indexOf('{'), t = text.lastIndexOf('}')
    if (s >= 0 && t > s) { try { out = JSON.parse(text.slice(s, t + 1)) } catch (e2) {} }
  }
  return { result: out, searches, query }
}


// ── Health: a silent gate that rejects everything looks identical to a gate that is simply working ──
const RA_HEALTH_KEY = 'release_actuals_health'
const RA_ALERT_AFTER = 3
async function raRecordOutcome(found, releaseKey, reason) {
  try {
    const prev = (await v2LoadSnapshot(RA_HEALTH_KEY)) || { consecutiveRejects: 0, alerted: false, recent: [] }
    if (found) {
      if (prev.consecutiveRejects || prev.alerted) await v2SaveSnapshot(RA_HEALTH_KEY, { consecutiveRejects: 0, alerted: false, recent: [] })
      return
    }
    const recent = [{ release_key: releaseKey, reason: String(reason || '').slice(0, 200), at: new Date().toISOString() }, ...(prev.recent || [])].slice(0, 5)
    const consecutiveRejects = (prev.consecutiveRejects || 0) + 1
    let alerted = prev.alerted || false
    if (consecutiveRejects >= RA_ALERT_AFTER && !alerted) {
      const chat = v2AdminChat()   // numeric-only: an @handle would risk posting to the public channel
      const body = `⚠️ Release-actuals search has failed ${consecutiveRejects} releases in a row.\n\n`
        + recent.map(r => `• ${r.release_key}\n  ${r.reason}`).join('\n')
        + `\n\nEither the search is not finding these prints, or the validation gate is too tight. Brief is falling back to FRED meanwhile.`
      if (chat) { await sendTG(chat, body); alerted = true; console.log(`📱 [release-actuals] admin alerted after ${consecutiveRejects} consecutive rejects`) }
      else console.error(`⚠️ [release-actuals] ${consecutiveRejects} consecutive rejects — no TG_ADMIN_CHAT_ID, logged only:\n${body}`)
    }
    await v2SaveSnapshot(RA_HEALTH_KEY, { consecutiveRejects, alerted, recent })
  } catch (e) { console.warn(`⚠️ [release-actuals] health record failed: ${e?.message}`) }
}

// ── Sweeper ──
// Every tick: top up pending rows from the calendar, then process anything now due. State lives in
// the DB, not in a timer, so a Railway redeploy cannot lose a release or double-search one.
const RA_PUBLISH_DELAY_MS = 20 * 60 * 1000            // give the publisher time to put the page up
const RA_BACKOFF_MS = [0, 40 * 60 * 1000, 2 * 60 * 60 * 1000]   // extra wait before attempts 2 and 3
const RA_MAX_ATTEMPTS = 3
async function sweepReleaseActuals() {
  if (raTableMissing()) return
  // No time-of-day gate. An earlier version only swept 11–21 UTC on weekdays, which bought nothing
  // — the expensive step is the search, and that is already gated by the due-filter below — while
  // actively delaying work that was ALREADY due: a release missed during downtime, or a row
  // backfilled by hand, sat untouched until the window happened to reopen. Spend is bounded by the
  // due-filter and the 3-attempt cap, not by the clock.
  await ensurePendingReleaseRows()
  let due = []
  try {
    const { data, error } = await supabase.from('release_actuals').select('*').eq('status', 'pending').lt('attempts', RA_MAX_ATTEMPTS)
    if (error) { if (!raTableGone(error)) console.warn(`⚠️ [release-actuals] select failed: ${error.message}`); return }
    const now = Date.now()
    due = (data || []).filter(r => {
      // Two independent waits, both must have elapsed:
      //   publish delay — from the SCHEDULED release, so the page has had time to go up
      //   retry backoff — from the LAST ATTEMPT, not the release. Anchoring backoff to
      //     scheduled_at made it a no-op for any overdue row (a backfill, or a release missed
      //     during downtime): all three attempts would fire on consecutive sweeps and burn the
      //     cap inside 45 minutes, which is exactly when a transient outage is still ongoing.
      const publishReady = new Date(r.scheduled_at).getTime() + RA_PUBLISH_DELAY_MS
      const retryReady = r.attempts > 0
        ? new Date(r.updated_at || r.scheduled_at).getTime() + (RA_BACKOFF_MS[r.attempts] || 0)
        : 0
      return now >= publishReady && now >= retryReady
    })
    // Heartbeat: without this a sweep that ran and found nothing is indistinguishable from a sweep
    // that never ran. Only logged when something is pending, so an idle month stays quiet.
    if ((data || []).length) console.log(`🔎 [release-actuals] sweep: ${(data || []).length} pending, ${due.length} due now`)
  } catch (e) { console.warn(`⚠️ [release-actuals] select threw: ${e?.message}`); return }
  if (!due.length) return

  const byKey = new Map(due.map(r => [r.release_key, r]))

  // A companion is normally filled by its parent's search, never its own — two figures on one page
  // should not cost two searches. But that only holds while the parent is still pending. A
  // companion added AFTER its parent already completed would otherwise sit pending forever, since
  // the parent will never search again. Look up the parents once and let orphans search alone.
  const orphanCompanions = new Set()
  const companionParents = due
    .filter(r => SEARCHED_SERIES[r.series_id]?.filledBy)
    .map(r => `${SEARCHED_SERIES[r.series_id].filledBy}:${r.reference_period}`)
  if (companionParents.length) {
    try {
      const { data: parents } = await supabase.from('release_actuals')
        .select('release_key,status').in('release_key', companionParents)
      const stillPending = new Set((parents || []).filter(p => p.status === 'pending').map(p => p.release_key))
      for (const r of due) {
        const fb = SEARCHED_SERIES[r.series_id]?.filledBy
        if (fb && !stillPending.has(`${fb}:${r.reference_period}`)) orphanCompanions.add(r.release_key)
      }
    } catch (e) { console.warn(`⚠️ [release-actuals] parent lookup failed: ${e?.message}`) }
  }

  for (const row of due) {
    const cfg = SEARCHED_SERIES[row.series_id]
    if (!cfg) continue
    // Skip only if the parent is still coming to fill it. Its lifecycle otherwise mirrors the
    // parent's below, so a parent that goes terminal takes its companion with it.
    if (cfg.filledBy && !orphanCompanions.has(row.release_key)) continue
    if (orphanCompanions.has(row.release_key)) console.log(`🔎 [release-actuals] ${row.release_key} is orphaned (parent already settled) — searching it directly`)
    const period = { key: row.reference_period, name: MONTH_NAMES[+row.reference_period.slice(5, 7) - 1], year: +row.reference_period.slice(0, 4) }
    const attempt = (row.attempts || 0) + 1
    const companionId = SERIES_COMPANION[row.series_id] || null
    const companionRow = companionId ? byKey.get(`${companionId}:${row.reference_period}`) : null
    const companionCfg = companionRow ? SEARCHED_SERIES[companionId] : null
    try {
      const { result, searches, query } = await searchReleaseActual(row.series_id, cfg, period, row.scheduled_at, attempt, companionCfg)
      const check = validateReleaseResult(result, cfg.range, period, row.scheduled_at)
      if (check.ok) {
        const surprise = surpriseOf(check.numeric, row.forecast)
        await supabase.from('release_actuals').update({
          actual: String(result.value), surprise, source_url: result.source_url,
          release_date: result.release_date, status: 'found', attempts: attempt, reject_reason: null,
        }).eq('release_key', row.release_key)
        console.log(`✅ [release-actuals] ${row.release_key} = ${result.value} (${surprise || 'no forecast'}) via "${query}" · ${searches} searches`)
        await raRecordOutcome(true, row.release_key)

        // Companion rides the same result. It gets its OWN range check — the two figures are both
        // plausible index readings, so the only thing standing between "prices index" and "the
        // headline repeated" is that check plus the model's own care. Period and release_date are
        // inherited: they came from the same report, so re-validating them proves nothing.
        if (companionRow && companionCfg) {
          const cv = validateReleaseValue(result.companion_value, companionCfg.range)
          if (cv.ok) {
            const cSurprise = surpriseOf(cv.numeric, companionRow.forecast)
            await supabase.from('release_actuals').update({
              actual: String(result.companion_value), surprise: cSurprise, source_url: result.source_url,
              release_date: result.release_date, status: 'found', attempts: attempt, reject_reason: null,
            }).eq('release_key', companionRow.release_key)
            console.log(`✅ [release-actuals] ${companionRow.release_key} = ${result.companion_value} (${cSurprise || 'no forecast'}) — companion of ${row.release_key}, no extra search`)
          } else {
            const cTerminal = attempt >= RA_MAX_ATTEMPTS
            await supabase.from('release_actuals').update({
              attempts: attempt, reject_reason: `companion: ${cv.reason}`, status: cTerminal ? 'not_available' : 'pending',
            }).eq('release_key', companionRow.release_key)
            console.warn(`⚠️ [release-actuals] ${companionRow.release_key} companion rejected — ${cv.reason}`)
          }
        }
      } else {
        if (companionRow) {
          // Parent failed, so the companion has no result to ride — advance it in lockstep.
          await supabase.from('release_actuals').update({
            attempts: attempt, reject_reason: `parent ${row.release_key}: ${check.reason}`,
            status: attempt >= RA_MAX_ATTEMPTS ? 'not_available' : 'pending',
          }).eq('release_key', companionRow.release_key)
        }
        const terminal = attempt >= RA_MAX_ATTEMPTS
        await supabase.from('release_actuals').update({
          // Record WHICH escalation level failed — otherwise a terminal row cannot tell you whether
          // the query never found the page or the gate refused what it found.
          attempts: attempt, reject_reason: `${check.reason} [q${attempt}: ${query}]`,
          status: terminal ? 'not_available' : 'pending',
        }).eq('release_key', row.release_key)
        console.warn(`⚠️ [release-actuals] ${row.release_key} attempt ${attempt}/${RA_MAX_ATTEMPTS} rejected — ${check.reason}`)
        if (terminal) await raRecordOutcome(false, row.release_key, check.reason)
      }
    } catch (e) {
      const attemptsNow = attempt
      const terminal = attemptsNow >= RA_MAX_ATTEMPTS
      const reason = `search threw: ${String(e?.message || e).slice(0, 160)}`
      try {
        await supabase.from('release_actuals').update({ attempts: attemptsNow, reject_reason: reason, status: terminal ? 'not_available' : 'pending' }).eq('release_key', row.release_key)
      } catch (e2) {}
      console.error(`❌ [release-actuals] ${row.release_key}: ${reason}`)
      if (terminal) await raRecordOutcome(false, row.release_key, reason)
    }
  }
}

// ── Read side: what the brief consumes ──
// A monthly print three weeks old is not stale — it IS the current print. What matters is whether
// the NEXT one has since landed: past that, serving the previous month as current is the same
// error the write gate exists to prevent, just on the read path.
const RA_SUPERSEDED_GRACE_MS = 2 * 24 * 60 * 60 * 1000
async function getCachedReleaseActuals(familyId, currency) {
  if (raTableMissing() || currency !== 'USD') return []
  const wanted = SEARCH_LEADING_BY_FAMILY[familyId] || []
  if (!wanted.length) return []
  try {
    const { data, error } = await supabase.from('release_actuals')
      .select('*').eq('status', 'found').in('series_id', wanted)
      .order('scheduled_at', { ascending: false }).limit(12)
    if (error) { if (!raTableGone(error)) console.warn(`⚠️ [release-actuals] read failed: ${error.message}`); return [] }
    const now = Date.now()
    const seen = new Set()
    const out = []
    for (const r of data || []) {
      if (seen.has(r.series_id)) continue          // newest row per series only
      if (now > new Date(r.next_release_at).getTime() + RA_SUPERSEDED_GRACE_MS) continue   // superseded
      seen.add(r.series_id)
      const a = parseReleaseValue(r.actual), p = parseReleaseValue(r.previous)
      out.push({
        title: SEARCHED_SERIES[r.series_id]?.label || r.series_id,
        date: r.scheduled_at,
        actual: r.actual, forecast: r.forecast || null, previous: r.previous || null,
        surprise: r.surprise || null,
        vsPrevious: (a !== null && p !== null) ? (a > p ? 'higher' : a < p ? 'lower' : 'flat') : null,
        polarity: SEARCHED_SERIES[r.series_id]?.polarity || 'direct',
        referencePeriod: r.reference_period,
        releaseDate: r.release_date,
        sourceUrl: r.source_url,
      })
    }
    return out
  } catch (e) { console.warn(`⚠️ [release-actuals] read threw: ${e?.message}`); return [] }
}

// Read-only ops view of the ledger. The sweeper's whole story lives in Railway logs, which is a
// bad place to answer "did it work and is the number right" from — this returns the banked rows,
// including reject_reason, so a gate that is too tight is visible without log archaeology.
// No writes, no model call, no cost. Public economic figures only.
app.get('/api/release-actuals', async (req, res) => {
  try {
    const { data, error } = await supabase.from('release_actuals')
      .select('release_key,series_id,reference_period,scheduled_at,next_release_at,forecast,previous,actual,surprise,release_date,source_url,status,attempts,reject_reason,updated_at')
      .order('scheduled_at', { ascending: false }).limit(40)
    if (error) {
      if (raTableGone(error)) return res.status(503).json({ success: false, error: 'release_actuals table does not exist — run backend/scripts/release_actuals.sql' })
      return res.status(502).json({ success: false, error: error.message })
    }
    const rows = data || []
    res.json({
      success: true,
      counts: rows.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a }, {}),
      rows,
    })
  } catch (e) { res.status(502).json({ success: false, error: String(e?.message || e).slice(0, 200) }) }
})

// FRED supplement, US only. The calendar vendors are the right source for actual-vs-FORECAST, but
// when FMP is down (production currently falls back to the FF feed, which publishes no actuals at
// all) the model would get nothing. FRED does publish the prints themselves — no forecast, so these
// carry actual-vs-PREVIOUS only and are labelled as such. A direction of travel beats no data;
// it is NOT a beat/miss and must never be presented as one.
// `kind` decides what actually reaches the model:
//   level    — the series is already in the event's units (claims counts, a sentiment index, an
//              expectations rate). Report it as published.
//   mom_pct  — the series is an INDEX but the event is a percent change. FRED serves CPI, PPI and
//              average hourly earnings as levels, so reporting them raw put "PPI final demand:
//              156.566 vs 157.001" in front of a CPI m/m forecast of 0.1% — units that do not even
//              answer the question being asked. Converted, it reads "-0.3% m/m", which does.
const FRED_LEADING = {
  employment: [
    { id: 'ICSA',   label: 'Initial jobless claims', kind: 'level', unit: 'claims', polarity: 'inverse' },
    { id: 'CCSA',   label: 'Continued jobless claims', kind: 'level', unit: 'claims', polarity: 'inverse' },
  ],
  inflation: [
    { id: 'PPIFIS', label: 'PPI final demand', kind: 'mom_pct', polarity: 'direct' },
    { id: 'CES0500000003', label: 'Average hourly earnings', kind: 'mom_pct', polarity: 'direct' },
    { id: 'IR',     label: 'Import price index', kind: 'mom_pct', polarity: 'direct' },
    { id: 'ULCNFB', label: 'Unit labour costs (nonfarm business)', kind: 'mom_pct', polarity: 'direct' },
    { id: 'MICH',   label: 'UMich 1-year inflation expectations', kind: 'level', unit: '%', polarity: 'direct' },
  ],
  consumption: [{ id: 'UMCSENT', label: 'UMich consumer sentiment', kind: 'level', unit: 'index', polarity: 'direct' }],
  growth: [{ id: 'INDPRO', label: 'Industrial production', kind: 'mom_pct', polarity: 'direct' }],
  activity: [{ id: 'INDPRO', label: 'Industrial production', kind: 'mom_pct', polarity: 'direct' }],
  'rate-decision': [
    { id: 'ICSA',   label: 'Initial jobless claims', kind: 'level', unit: 'claims', polarity: 'inverse' },
    { id: 'PPIFIS', label: 'PPI final demand', kind: 'mom_pct', polarity: 'direct' },
    { id: 'MICH',   label: 'UMich 1-year inflation expectations', kind: 'level', unit: '%', polarity: 'direct' },
  ],
}
// 12h cache, keyed PER SERIES rather than per family.
//
// Two reasons it must be per series, not per family. First, series are shared — ICSA appears in
// employment and rate-decision, PPIFIS in inflation and rate-decision — so one brief warms the
// others. Second and more important: caching a family's whole result set would bank a PARTIAL one.
// Two identical-data CPI briefs returned 6 leads and then 2, because four FRED calls timed out on
// the second; storing that thin result for 12h would have made the flakiness permanent instead of
// fixing it. Caching each series on its own means a slow call falls back to that series' last good
// value and the lead simply stays, which is the whole point.
const FRED_LEADING_TTL = 12 * 60 * 60 * 1000
async function fetchFredLeading(familyId, currency) {
  if (currency !== 'USD') return []
  const series = FRED_LEADING[familyId] || []
  const key = process.env.FRED_API_KEY?.trim()
  if (!key || !series.length) return []
  const one = async (s) => {
    // `kind` is in the key so a config change to how a series is rendered cannot be served from a
    // cache entry built under the old shape.
    const ck = `fredlead_${s.id}_${s.kind}`
    if (isCacheFreshFor(ck, FRED_LEADING_TTL)) {
      const hit = getCached(ck)
      if (hit) return hit
    }
    // Any failure — timeout, empty response, unusable values — falls back to this series' last good
    // value at ANY age. These are weekly or monthly series, so yesterday's copy is the same figure;
    // dropping the lead entirely is the only outcome that actually changes what the model sees.
    const stale = (why) => {
      const old = getCached(ck)
      if (old) { console.warn(`⚠️ [brief] FRED ${s.id} ${why} — serving last good value`); return old }
      console.warn(`⚠️ [brief] FRED ${s.id} ${why} — no cached value, lead dropped`)
      return null
    }
    try {
      const r = await axios.get('https://api.stlouisfed.org/fred/series/observations', {
        params: { series_id: s.id, api_key: key, file_type: 'json', sort_order: 'desc', limit: 4 },
        timeout: 10000,
      })
      const vals = (r.data?.observations || []).map(o => ({ date: o.date, v: parseFloat(o.value) })).filter(o => !isNaN(o.v))
      if (!vals.length) return stale('returned no numeric observations')
      const latest = vals[0], prev = vals[1], prior = vals[2]
      if (s.kind === 'mom_pct') {
        // Needs two prior levels: one to compute this month's change, one for last month's, so the
        // model can see whether the pace is accelerating rather than just the latest number.
        const mom = momPercent(latest.v, prev?.v)
        if (mom === null) return stale('had too few levels to compute m/m')
        const prevMom = momPercent(prev?.v, prior?.v)
        const item = {
          title: `${s.label} m/m (computed from FRED ${s.id} index)`,
          date: new Date(latest.date + 'T00:00:00Z').toISOString(),
          actual: `${mom > 0 ? '+' : ''}${mom}%`,
          forecast: null,
          previous: prevMom === null ? null : `${prevMom > 0 ? '+' : ''}${prevMom}%`,
          surprise: null,   // FRED publishes no forecast — beat/miss is NOT computable
          vsPrevious: prevMom === null ? null : (mom > prevMom ? 'higher' : mom < prevMom ? 'lower' : 'flat'),
          noForecast: true,
          polarity: s.polarity || 'direct',
          // Flagged so the prompt can say so: this is derived from FRED's already-rounded index,
          // while BLS computes from unrounded internals, so it can differ from the published
          // headline by a tick. It must never be presented as the official print.
          computed: true,
        }
        setCache(ck, item)
        return item
      }
      const item = {
        title: `${s.label} (FRED ${s.id})`,
        date: new Date(latest.date + 'T00:00:00Z').toISOString(),
        actual: `${latest.v}${s.unit === '%' ? '%' : ''}`, forecast: null, previous: prev ? String(prev.v) : null,
        surprise: null,   // no forecast published for this series — beat/miss is NOT computable
        vsPrevious: prev ? (latest.v > prev.v ? 'higher' : latest.v < prev.v ? 'lower' : 'flat') : null,
        noForecast: true,
        polarity: s.polarity || 'direct',
      }
      setCache(ck, item)
      return item
    } catch (e) { return stale(`failed (${e?.message})`) }
  }
  return (await Promise.all(series.map(one))).filter(Boolean)
}

// Merge banked search results with the FRED supplement. They are complementary, not alternatives:
// the cache carries the proprietary prints WITH a forecast (so a real beat/miss), FRED carries the
// government series with no forecast (direction only). Together the model sees strictly more than
// either alone. Cache first — a genuine beat/miss outranks a direction of travel.
function mergeLeadingItems(cached, fred) {
  const seen = new Set(cached.map(i => i.title))
  return [...cached, ...fred.filter(i => !seen.has(i.title))]
    .sort((x, y) => (x.date < y.date ? 1 : -1))
    .slice(0, 8)
}
function leadingSourceLabel(cached, fred) {
  if (cached.length && fred.length) return 'search-cache + fred-supplement'
  if (cached.length) return 'search-cache'
  return fred.length ? 'fred-supplement' : null
}

async function fetchLeadingIndicators(event) {
  const fam = LEADING_FAMILIES.find(f => f.match.test(event.title))
  if (!fam) return { family: null, items: [], note: `no leading-indicator family maps to "${event.title}"` }
  const rows = await fetchRecentActuals(event.currency)
  if (!rows) {
    // Cache is a plain indexed select — no credit limiter, no vendor. An empty table simply yields
    // [] and the path below is byte-for-byte the behaviour that shipped before this cache existed.
    const [cached, fred] = await Promise.all([
      getCachedReleaseActuals(fam.id, event.currency),
      fetchFredLeading(fam.id, event.currency),
    ])
    const items = mergeLeadingItems(cached, fred)
    return {
      family: fam.id, items, source: leadingSourceLabel(cached, fred), vendorStatus: lastVendorStatus,
      note: items.length
        ? `calendar vendor published no actuals this run — ${cached.length} banked search print(s) with forecasts, ${fred.length} FRED print(s) without`
        : 'no source returned released actuals this run',
    }
  }
  const now = Date.now()
  const items = rows
    .filter(e => new Date(e.time).getTime() < now)
    .filter(e => fam.leads.test(e.title))
    .map(e => {
      const a = parseEconNum(e.actual), f = parseEconNum(e.forecast), p = parseEconNum(e.previous)
      // Only claim a surprise when BOTH sides parsed — otherwise the direction is unknown, not neutral.
      const surprise = (a !== null && f !== null) ? (a > f ? 'beat' : a < f ? 'miss' : 'inline') : null
      return {
        title: e.title, date: e.time, actual: e.actual, forecast: e.forecast, previous: e.previous,
        surprise, vsPrevious: (a !== null && p !== null) ? (a > p ? 'higher' : a < p ? 'lower' : 'flat') : null,
      }
    })
    .sort((x, y) => (x.date < y.date ? 1 : -1))
    .slice(0, 8)
  if (!items.length) {
    const [cached, fred] = await Promise.all([
      getCachedReleaseActuals(fam.id, event.currency),
      fetchFredLeading(fam.id, event.currency),
    ])
    const merged = mergeLeadingItems(cached, fred)
    if (merged.length) return { family: fam.id, items: merged, source: leadingSourceLabel(cached, fred), vendorStatus: lastVendorStatus, note: `no ${fam.id} vendor prints in the last 14 days — ${cached.length} banked search print(s), ${fred.length} FRED print(s)` }
  }
  return { family: fam.id, items, source: items.length ? 'calendar-vendor' : null, vendorStatus: lastVendorStatus, note: items.length ? null : `no ${fam.id} leading prints with actuals in the last 14 days for ${event.currency}` }
}

// Live price + how much of the typical daily range each affected pair has already spent.
// Same ADR maths as getPairRoomBatch, but DIRECTION-AGNOSTIC: the brief has no bias to measure
// "favorable" against yet, so it reports the raw move from open and the range used.
async function fetchBriefPairContext(symbols) {
  const out = {}
  // CACHE FIRST. getDailyCandles() → tdAcquire() blocks on the TwelveData credit budget, which the
  // crons and the bias engine are also drawing on; waiting there costs the whole request budget and
  // returns nothing. v1/v2 keep tdcandle_d_* warm, so read those keys directly and only pay for a
  // fetch on the symbols genuinely absent — with its own inner deadline, so whatever WAS cached
  // still reaches the model instead of being thrown away with the timeout.
  const candles = {}
  const ok = (v) => Array.isArray(v) && v.length >= 3
  let absent = []
  for (const s of symbols) {
    // Tier 1: v1's shared daily cache. Tier 2: v2's own (6h TTL, so warm far more often). Both are
    // the same TwelveData daily candles under different keys; reading them is free and read-only.
    const v1 = getCached(`tdcandle_d_${s}`)
    const v2 = ok(v1) ? null : getCached(`tdcandle_dv2_${s}`)
    if (ok(v1)) candles[s] = v1
    else if (ok(v2)) candles[s] = v2
    else absent.push(s)
  }
  // Tier 3: v2's DB snapshot, which survives a Railway redeploy — the in-memory tiers do not, and a
  // fresh instance would otherwise report no prices at all until the next cron run. Read-only select.
  if (absent.length) {
    try {
      const snap = await v2LoadSnapshot('daily_candles_v2')
      if (snap) {
        for (const s of absent) if (ok(snap[s])) candles[s] = snap[s]
        absent = absent.filter(s => !candles[s])
      }
    } catch (e) { console.warn(`⚠️ [brief] v2 candle snapshot read failed: ${e?.message}`) }
  }
  // Only now pay TwelveData credits, and only for what is genuinely absent.
  if (absent.length) {
    const fresh = await Promise.race([
      getDailyCandles(absent).catch(() => ({})),
      new Promise(r => setTimeout(() => r({}), 12000)),
    ])
    for (const s of absent) if (ok(fresh?.[s])) candles[s] = fresh[s]
  }
  try {
    for (const s of symbols) {
      const vals = candles[s]
      if (!Array.isArray(vals) || vals.length < 3) { out[s] = null; continue }
      const pip = /JPY/.test(s) ? 0.01 : /XAU/.test(s) ? 0.1 : 0.0001
      const completed = vals.slice(1)
      const adr = completed.reduce((sum, x) => sum + (parseFloat(x.high) - parseFloat(x.low)), 0) / completed.length
      const t = vals[0]
      const open = parseFloat(t.open), cur = parseFloat(t.close), hi = parseFloat(t.high), lo = parseFloat(t.low)
      const adrPips = adr / pip
      if (!adrPips || isNaN(cur)) { out[s] = null; continue }
      const fromOpen = (cur - open) / pip
      out[s] = {
        price: cur,
        // Candles can come from a cache or a snapshot, so the model must be told HOW CURRENT the
        // price is rather than assuming it is this second's tick.
        asOf: t.datetime || null,
        adrPips: +adrPips.toFixed(0),
        fromOpenPips: Math.round(fromOpen),
        moveDirection: fromOpen > 0 ? 'up' : fromOpen < 0 ? 'down' : 'flat',
        pctADRDirectional: Math.round((Math.abs(fromOpen) / adrPips) * 100),
        pctADRRange: Math.round(((hi - lo) / pip / adrPips) * 100),
      }
    }
  } catch (e) { console.warn(`⚠️ [brief] pair context failed: ${e?.message}`) }
  for (const s of symbols) if (!(s in out)) out[s] = null
  return out
}

// Client input goes into a model prompt — strip anything that could break out of the event block
// or smuggle instructions. Identifiers only; there is no free-text field on this endpoint.
function sanitizeBriefField(v, max = 120) {
  return String(v ?? '').replace(/[`\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

const BRIEF_FETCH_BUDGET = 20 * 1000

const BRIEF_CACHE_TTL = 15 * 60 * 1000
app.post('/api/calendar-brief', aiRateLimiter, async (req, res) => {
  const event = {
    title: sanitizeBriefField(req.body?.title),
    currency: sanitizeBriefField(req.body?.currency, 8).toUpperCase(),
    date: sanitizeBriefField(req.body?.date, 40),
    impact: sanitizeBriefField(req.body?.impact, 12),
    forecast: sanitizeBriefField(req.body?.forecast, 24),
    previous: sanitizeBriefField(req.body?.previous, 24),
    actual: sanitizeBriefField(req.body?.actual, 24),
  }
  if (!event.title || !event.currency) return res.status(400).json({ success: false, error: 'title and currency required' })

  const cacheKey = `brief_${event.title}|${event.currency}|${event.date}|${event.actual}`.toLowerCase()
  if (isCacheFreshFor(cacheKey, BRIEF_CACHE_TTL)) {
    const hit = getCached(cacheKey)
    if (hit) { console.log(`🗓️ [brief] cache hit — ${event.title} (${event.currency})`); return res.json({ ...hit, cached: true }) }
  }

  const t0 = Date.now()
  console.log(`🗓️ [brief] ${event.title} (${event.currency}) — fetching live inputs…`)

  const pairs = BRIEF_PAIRS[event.currency] || ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD']
  const B = BRIEF_FETCH_BUDGET
  // TwelveData Basic allows ~8 credits/minute, shared with the crons. The pair candles (6) and the
  // cross-asset batch (8) cannot both clear in one window from a cold cache, so they run in sequence
  // rather than racing each other, and PAIRS GO FIRST: per-pair price and ADR are what the per-pair
  // analysis is built on, and they have no second source, whereas cross-asset degrades to its last
  // cached batch and the yield levels have an independent FRED path.
  const timings = {}
  const pairCtx = await withBudget(fetchBriefPairContext(pairs), B, 'pairs', timings)
  let cross = await withBudget(fetchCrossAssetLive(), B, 'crossAsset', timings)
  // Throttled out? Fall back to the last cached batch and SAY it is last-known, rather than dropping
  // the dollar and volatility read entirely. Each quote carries its own `datetime`, so the model can
  // still see how old the print is.
  let crossStale = false
  if (!cross) { const st = getCached('cross_asset_live'); if (st) { cross = st; crossStale = true; console.log('📈 [brief] cross-asset throttled — using last cached batch') } }
  const tParallel = Date.now()
  const [yields, y2sess, macro, cot, leading] = await Promise.all([
    withBudget(briefYields(cross), B, 'yields', timings),
    withBudget(briefYield2y3Session(), B, 'yield2y3Session', timings),
    withBudget(fetchPolicyRateAndInflation(), B, 'fredPolicyRate', timings),
    withBudget(getCOTData(), B, 'cot', timings),
    withBudget(fetchLeadingIndicators(event), B, 'leadingIndicators', timings),
  ])
  timings.parallelGroup = Date.now() - tParallel
  timings.dataTotal = Date.now() - t0

  // ── Format each block. "not available" is a first-class answer: the model is told to treat it
  //    as unknown rather than fill the gap from training data. ──
  const NA = 'not available'
  const gaps = []

  const yieldsBlock = (() => {
    if (!yields?.y2 && !yields?.y10) { gaps.push('US Treasury yields'); return NA }
    const leg = (o, label) => o ? `${label}: ${o.value}% (1-day ${o.change > 0 ? '+' : ''}${Math.round(o.change * 100)}bps) [${o.datetime || o.date}]` : `${label}: ${NA}`
    const sess = y2sess?.bps != null
      ? `2Y 3-session change: ${y2sess.bps > 0 ? '+' : ''}${y2sess.bps}bps (${y2sess.from} → ${y2sess.to})`
      : `2Y 3-session change: ${NA} — ${y2sess?.reason || 'no history'}`
    if (y2sess?.bps == null) gaps.push('2Y 3-session direction')
    const curve = (yields.y2 && yields.y10) ? `\n10Y-2Y spread: ${(yields.y10.value - yields.y2.value).toFixed(2)}pp` : ''
    return `${leg(yields.y2, '2Y')}\n${leg(yields.y10, '10Y')}\n${sess}${curve}\nsource: ${yields.source}`
  })()

  const macroBlock = (() => {
    const lines = []
    if (macro?.fedFunds) lines.push(`Effective fed funds rate (FRED FEDFUNDS): ${macro.fedFunds.value}%${macro.fedFunds.prev != null ? ` (prior print ${macro.fedFunds.prev}%)` : ''} [print date ${macro.fedFunds.date}]`)
    else { lines.push(`Effective fed funds rate: ${NA}`); gaps.push('fed funds rate') }
    if (macro?.corePCE) lines.push(`Core PCE (FRED PCEPILFE, 12-month change): ${macro.corePCE.yoy}%${macro.corePCE.prevYoY != null ? ` (prior month ${macro.corePCE.prevYoY}% → ${macro.corePCE.yoy > macro.corePCE.prevYoY ? 'accelerating' : macro.corePCE.yoy < macro.corePCE.prevYoY ? 'cooling' : 'flat'})` : ''} [print date ${macro.corePCE.date}]`)
    else { lines.push(`Core PCE: ${NA}`); gaps.push('core PCE') }
    return lines.join('\n')
  })()

  const crossBlock = (() => {
    if (!cross || !Object.keys(cross).length) { gaps.push('cross-asset (DXY/VIX/SPY/TLT)'); return NA }
    const q = (sym, label, proxy) => {
      const d = cross[sym] || (proxy ? cross[proxy] : null)
      const used = cross[sym] ? sym : (d ? `${proxy} (proxy for ${sym})` : null)
      return d ? `${label}: ${d.price} (${d.change > 0 ? '+' : ''}${d.change}% on the day) [${used}${d.datetime ? `, print ${d.datetime}` : ''}]` : `${label}: ${NA}`
    }
    const lines = [q('DXY', 'US dollar index', 'UUP'), q('VIX', 'Volatility (VIX)', 'VIXY'), q('SPY', 'S&P 500 (SPY)'), q('TLT', 'Long bonds (TLT)')]
    if (lines.some(l => l.endsWith(NA))) gaps.push('part of cross-asset')
    if (crossStale) { gaps.push('live cross-asset refresh (using last cached batch)'); lines.unshift('NOTE: this batch is LAST CACHED, not refreshed this request — treat the levels as recent but not current.') }
    return lines.join('\n')
  })()

  const cotBlock = (() => {
    const rows = cot?.data || []
    if (!rows.length) { gaps.push('COT positioning'); return NA }
    const wanted = new Set([event.currency, 'USD', 'XAU', ...pairs.flatMap(p => [p.slice(0, 3), p.slice(3)])])
    const picked = rows.filter(r => wanted.has(r.currency))
    if (!picked.length) { gaps.push('COT for these currencies'); return NA }
    return picked.map(r => `${r.currency}: net ${r.netPosition > 0 ? '+' : ''}${r.netPosition} contracts (${r.bias})${r.weeklyChange != null ? `, week-over-week ${r.weeklyChange > 0 ? '+' : ''}${r.weeklyChange}` : ''}`).join('\n')
      + `\nCFTC report date: ${cot.reportDate || 'unknown'} (weekly, published with a lag)`
  })()

  const pairsBlock = (() => {
    const lines = pairs.map(s => {
      const c = pairCtx?.[s]
      const disp = `${s.slice(0, 3)}/${s.slice(3)}`
      if (!c) return `${disp}: price ${NA}, ADR usage ${NA}`
      return `${disp}: ${c.price}${c.asOf ? ` (candle as of ${c.asOf})` : ''} | ADR ~${c.adrPips} pips | ${Math.abs(c.fromOpenPips)} pips ${c.moveDirection} from today's open = ${c.pctADRDirectional}% of ADR directionally | ${c.pctADRRange}% of ADR spent as total range`
    })
    if (pairs.every(s => !pairCtx?.[s])) gaps.push('live pair prices / ADR')
    else if (pairs.some(s => !pairCtx?.[s])) gaps.push('ADR for some pairs')
    return lines.join('\n')
  })()

  // Deterministic verdict on whether the leads agree, computed before the prompt is built.
  const consensus = leadConsensus(leading?.items || [])

  const leadingBlock = (() => {
    if (!leading?.items?.length) { gaps.push('leading indicators'); return `${NA} — ${leading?.note || 'none found'}` }
    const noneHaveForecast = leading.items.every(i => !i.forecast)
    // Never render a bare number. The period a figure DESCRIBES and the date it was PUBLISHED are
    // different, and a monthly print read three weeks later is still current — the model can only
    // judge that if both are on the page.
    return leading.items.map(i => {
      const stamp = i.referencePeriod
        ? `[covers ${i.referencePeriod}, published ${i.releaseDate || i.date.slice(0, 10)}]`
        : `[${i.date.slice(0, 10)}]`
      // `computed` figures are derived from FRED's rounded index, not read off the publisher's
      // release, so they can differ from the official headline by a tick. Say so — a trader acting
      // on a 0.1 difference must know which of these is the printed number and which is our maths.
      const derived = i.computed ? ' [DERIVED from the index, not the published headline — may differ by 0.1]' : ''
      return `${i.title} ${stamp} actual ${i.actual}${i.forecast ? ` vs forecast ${i.forecast}` : ` (forecast ${NA})`}${i.previous ? `, previous ${i.previous}` : ''} → ${i.surprise ? `${i.surprise.toUpperCase()} vs forecast` : 'surprise vs forecast NOT computable'}${i.vsPrevious ? `, ${i.vsPrevious} vs previous` : ''}${derived}${i.sourceUrl ? ` (source: ${i.sourceUrl})` : ''}`
    }).join('\n')
      + `\n(family: ${leading.family}, source: ${leading.source || 'unknown'}${leading.note ? ` — ${leading.note}` : ''})`
      + (noneHaveForecast
        ? `\nIMPORTANT: no print above has a forecast, so NONE of them is a beat or a miss. You may describe the direction of travel versus the previous print, but tilt MUST be "insufficient leading data" and probability MUST be null.`
        : '')
      // The split is decided in code, not left to the model. Three identical-input briefs returned
      // miss / beat / beat off this same set — a fair reading of contradictory evidence, but not
      // something a product can show a trader. Stating the verdict as a fact removes the coin flip.
      + (consensus.verdict === 'mixed'
        ? `\nCONSENSUS CHECK (computed in code, not your judgement): the leads above DISAGREE.`
          + ` ${consensus.forecastBacked} carry a computable surprise (net ${consensus.netSurprise > 0 ? '+' : ''}${consensus.netSurprise}),`
          + ` while ${consensus.directional} give direction only (net ${consensus.netDirectional > 0 ? '+' : ''}${consensus.netDirectional}), and those two point opposite ways.`
          + `\nTherefore tilt MUST be "mixed" and probability MUST be null. Do NOT pick a side. In`
          + ` reasoning, state plainly which leads point which way and say the evidence is genuinely split.`
        : '')
  })()

  const seat = POLICY_SEATS[event.currency]
  const seatBlock = [seat, event.currency !== 'USD' ? POLICY_SEATS.USD : null].filter(Boolean).join('\n') || NA

  console.log(`🗓️ [brief] live inputs in ${((Date.now() - t0) / 1000).toFixed(1)}s — yields:${yields?.y2 ? `2Y ${yields.y2.value}%` : 'MISSING'}/${yields?.y10 ? `10Y ${yields.y10.value}%` : 'MISSING'} (src ${yields?.source || 'n/a'}, 3sess ${y2sess?.bps ?? 'n/a'}bps) · fedfunds:${macro?.fedFunds ? `${macro.fedFunds.value}% @${macro.fedFunds.date}` : 'MISSING'} · corePCE:${macro?.corePCE ? `${macro.corePCE.yoy}% @${macro.corePCE.date}` : 'MISSING'} · cross:${cross ? Object.keys(cross).join('/') : 'MISSING'} · COT:${cot?.data?.length ? `${cot.data.length} rows @${cot.reportDate}` : 'MISSING'} · pairs:${pairs.filter(s => pairCtx?.[s]).length}/${pairs.length} priced · leading:${leading?.items?.length || 0} prints (${leading?.family || 'no family'})${gaps.length ? ` · GAPS: ${gaps.join(', ')}` : ' · no gaps'}`)

  const prompt = `Produce a pre-release trading brief for one economic event.

EVENT
Title: ${event.title}
Currency: ${event.currency}
Impact: ${event.impact || 'unspecified'}
Release time: ${event.date || 'unspecified'}
Forecast: ${event.forecast || NA}
Previous: ${event.previous || NA}
Actual: ${event.actual && event.actual !== '-' ? event.actual : 'not yet released'}

LIVE MARKET DATA — fetched ${new Date().toISOString()}, at request time.
This is the ONLY market data you may cite. Your training data is stale for every level, rate,
positioning figure and policy stance below. Anything marked "${NA}" is UNKNOWN: say so, do not fill it in.

1. US TREASURY YIELDS
${yieldsBlock}

2. POLICY RATE AND INFLATION (FRED, live)
${macroBlock}

3. CROSS-ASSET
${crossBlock}

4. CFTC COT POSITIONING
${cotBlock}

5. AFFECTED PAIRS — LIVE PRICE AND ADR USAGE
${pairsBlock}

6. LEADING INDICATORS ALREADY RELEASED THIS CYCLE
${leadingBlock}

7. OFFICE HOLDERS — static config, last verified ${POLICY_SEATS.lastVerified}
${seatBlock}
Names only. Do NOT infer a policy stance, rate path or reaction function from a name — stance must
come from sections 1-4 or be reported as unknown.

WHAT TO ANALYSE
a) Which way the leading indicators in section 6 lean — beat or miss — and why. If section 6 is
   "${NA}", or no print there has a computable actual-vs-forecast surprise, then tilt is
   "insufficient leading data" and probability MUST be null. Never manufacture a probability.
b) Each pair in section 5: impact in the context of THAT pair's own live state — its COT net and
   weekly change from section 4, how much ADR it has already spent from section 5, and the yield
   direction from section 1. Generic "this event is USD-positive so EUR/USD falls" reasoning is not
   acceptable on its own; name the pair's live numbers.
c) State which live data point supports your conclusion, quoting the figure.

RULES
- Every number you cite must appear verbatim in sections 1-6.
- Do not state any policy rate, inflation figure, central-bank stance or market level that is not
  in the blocks above. If it is not there, write "${NA}".
- For instruments with no live data in sections 1-5 (crypto, oil), set bias "neutral" and say in
  the reason which live proxy you inferred from, or that no live data covers it.
- No hedged filler: if the live data does not support a directional call, say it is neutral.
- Gold is already covered as XAU/USD in the "forex" array — do NOT add a gold or XAU entry to
  "commodities" as well. Writing the same instrument up twice is pure duplication.

Return ONLY a valid JSON object, no markdown fences, no commentary. Structure (fill every field
from YOUR analysis — the example strings are format hints, not answers):
{
  "overallBias": "short label, e.g. USD bullish into the print",
  "biasDirection": "bullish | bearish | neutral",
  "probability": 0-100 integer, or null when tilt is "insufficient leading data" OR "mixed",
  "confidence": "high | medium | low",
  "summary": "2-3 sentences on what this event means given the live data above",
  "leadingIndicators": {
    "tilt": "beat | miss | mixed | insufficient leading data",
    "reasoning": "why, citing section 6 prints by name and figure",
    "evidence": ["<print name>: actual X vs forecast Y → beat/miss"]
  },
  "supportingData": ["the live data points that support the call, each quoting its figure"],
  "forex": [${pairs.map(s => `{"pair": "${s.slice(0, 3)}/${s.slice(3)}", "bias": "", "reason": "cite this pair's COT net, ADR spent and the yield direction"}`).join(', ')}],
  "indices": [
    {"name": "S&P 500", "bias": "", "reason": "anchor to SPY/VIX/TLT from section 3"},
    {"name": "NASDAQ", "bias": "", "reason": ""},
    {"name": "DOW", "bias": "", "reason": ""}
  ],
  "crypto": [
    {"name": "BTC/USD", "bias": "", "reason": ""},
    {"name": "ETH/USD", "bias": "", "reason": ""}
  ],
  "commodities": [
    {"name": "Oil (WTI)", "bias": "", "reason": ""}
  ],
  "preEventPlan": ["3-4 concrete actions for the hour before the release"],
  "postEventStrategy": "what to do on a beat vs a miss, referencing the levels in section 5",
  "propFirmAdvice": "risk guidance for a funded trader on this specific event",
  "dataGaps": ["which inputs were ${NA} and what that stops you concluding"]
}`

  try {
    const tModel = Date.now()
    const m = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      // 8192, not 4096: the schema asks for ~14 reasoned entries plus evidence and gap lists, and a
      // truncated response is unparseable JSON — the whole brief is lost for the sake of a few tokens.
      max_tokens: 8192,
      system: 'You are a macro analyst for BiasForge. You analyse ONLY the live data provided in the prompt. You never cite a level, rate, or positioning figure from memory, and you say "not available" rather than estimate. Output raw JSON only.',
      messages: [{ role: 'user', content: prompt }],
    })
    timings.model = Date.now() - tModel
    trackAI('calendar-brief', 'claude-sonnet-4-6', m.usage)
    if (m.stop_reason === 'max_tokens') throw new Error(`response truncated at max_tokens (${m.usage?.output_tokens} out)`)
    const text = (m.content?.[0]?.text || '').trim().replace(/```json|```/g, '').trim()
    let analysis
    try { analysis = JSON.parse(text) } catch (e) {
      const s = text.indexOf('{'), t = text.lastIndexOf('}')
      if (s < 0 || t <= s) throw new Error(`model did not return JSON (stop_reason=${m.stop_reason}, ${text.length} chars: "${text.slice(0, 200)}")`)
      analysis = JSON.parse(text.slice(s, t + 1))
    }
    const payload = {
      success: true,
      analysis,
      dataUsed: {
        yields: yields?.y2 || yields?.y10 ? { source: yields.source, y2: yields.y2?.value ?? null, y10: yields.y10?.value ?? null, change3SessionBps: y2sess?.bps ?? null } : null,
        fedFunds: macro?.fedFunds || null,
        corePCE: macro?.corePCE || null,
        crossAsset: cross ? Object.keys(cross) : null,
        cot: cot?.data?.length ? { reportDate: cot.reportDate, currencies: (cot.data || []).map(r => r.currency) } : null,
        pairsPriced: pairs.filter(s => pairCtx?.[s]),
        leadingIndicators: {
          family: leading?.family || null, count: leading?.items?.length || 0,
          source: leading?.source || null, vendorStatus: leading?.vendorStatus || null,
          withForecast: (leading?.items || []).filter(i => i.forecast).length,   // how many can yield a real beat/miss
          consensus: consensus.verdict,
          tally: { forecastBacked: consensus.forecastBacked, directional: consensus.directional, netSurprise: consensus.netSurprise, netDirectional: consensus.netDirectional },
          note: leading?.note || null,
        },
        missing: gaps,
      },
      timings: { ...timings, totalMs: Date.now() - t0 },
      generatedAt: new Date().toISOString(),
    }
    setCache(cacheKey, payload)
    console.log(`🗓️ [brief] done in ${((Date.now() - t0) / 1000).toFixed(1)}s — bias "${analysis.overallBias}" (${analysis.biasDirection}), tilt "${analysis.leadingIndicators?.tilt}", probability ${analysis.probability ?? 'null'}`)
    res.json(payload)
  } catch (e) {
    // Surface the reason: without it a 502 here is indistinguishable from a dead upstream, and this
    // endpoint has three distinct failure modes (model error, truncation, unparseable output).
    console.error(`❌ [brief] ${event.title} after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${e?.message || e}`)
    res.status(502).json({ success: false, error: 'Brief generation failed', detail: String(e?.message || e).slice(0, 300) })
  }
})

// ============================================
// 💪 CURRENCY STRENGTH
// ============================================

// Helper: Check if Forex market is currently closed
// Forex closes: Friday 22:00 UTC
// Forex opens:  Sunday 22:00 UTC
// Returns true when the forex market is closed.
// Anchored to New York local time (Sun 5PM ET → Fri 5PM ET) so DST (EDT/EST) is auto-handled.
function nyParts() {
  const now = new Date()
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(now)
  let h = parseInt(p.find(x => x.type === 'hour')?.value, 10)
  if (h === 24) h = 0
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { day: dayMap[p.find(x => x.type === 'weekday')?.value], hour: h }
}
function isForexClosed() {
  const { day, hour } = nyParts()
  if (day === 6) return true              // Saturday — closed all day (ET)
  if (day === 5 && hour >= 17) return true // Friday after 5PM ET
  if (day === 0 && hour < 17) return true  // Sunday before 5PM ET (Sydney open)
  return false
}

app.get('/api/strength', async (req, res) => {
  // ✅ NEW: Weekend check FIRST — return closed state immediately
  if (isForexClosed()) {
    return res.json({
      success: true,
      currencies: [
        { currency: 'USD', strength: 0, raw: '0.0000', label: 'Neutral' },
        { currency: 'EUR', strength: 0, raw: '0.0000', label: 'Neutral' },
        { currency: 'GBP', strength: 0, raw: '0.0000', label: 'Neutral' },
        { currency: 'JPY', strength: 0, raw: '0.0000', label: 'Neutral' },
        { currency: 'AUD', strength: 0, raw: '0.0000', label: 'Neutral' },
        { currency: 'NZD', strength: 0, raw: '0.0000', label: 'Neutral' },
        { currency: 'CAD', strength: 0, raw: '0.0000', label: 'Neutral' },
        { currency: 'CHF', strength: 0, raw: '0.0000', label: 'Neutral' },
      ],
      bestPairs: [],
      marketClosed: true,
      reason: 'Forex market closed (Weekend) — Opens Sunday 22:00 UTC',
      updatedAt: new Date().toISOString(),
    })
  }

  if (isCacheFresh('strength')) return res.json(getCached('strength'))
  const stale = getCached('strength'), pairs=['EUR/USD','GBP/USD','USD/JPY','USD/CHF','AUD/USD','NZD/USD','USD/CAD']
  try {
    await tdAcquire(pairs.length)
    const r = await axios.get(`https://api.twelvedata.com/time_series?symbol=${pairs.join(',')}&interval=1day&outputsize=2&apikey=${process.env.TWELVEDATA_API_KEY}`)
    if(r.data.code===429){if(stale)return res.json(stale);return res.status(429).json({success:false,error:'Rate limit'})}
    const scores={USD:0,EUR:0,GBP:0,JPY:0,AUD:0,NZD:0,CAD:0,CHF:0},counts={...scores}
    pairs.forEach(p=>{const[b,q]=p.split('/'),d=r.data[p];if(!d?.values||d.values.length<2)return;const c=parseFloat(d.values[0].close),pr=parseFloat(d.values[1].close);if(!c||!pr)return;const ch=((c-pr)/pr)*100;scores[b]+=ch;counts[b]++;scores[q]-=ch;counts[q]++})
    const avg={};Object.keys(scores).forEach(c=>avg[c]=counts[c]>0?scores[c]/counts[c]:0)
    const vals=Object.values(avg),mn=Math.min(...vals),mx=Math.max(...vals),rng=mx-mn||1
    const norm={};Object.keys(avg).forEach(c=>norm[c]=Math.round(((avg[c]-mn)/rng)*100))
    const sorted=Object.entries(norm).sort((a,b)=>b[1]-a[1]).map(([c,s])=>({currency:c,strength:s,raw:avg[c].toFixed(4),label:s>=65?'Strong':s>=35?'Neutral':'Weak'}))
   const allZ=sorted.every(c=>c.strength===0),bp=[]
    const oandaPairs=[['EUR','USD'],['GBP','USD'],['USD','JPY'],['AUD','USD'],['USD','CAD'],['USD','CHF'],['NZD','USD'],['EUR','GBP'],['EUR','JPY'],['GBP','JPY'],['AUD','JPY']]
    if(!allZ&&sorted.length>=2){
      const str={};sorted.forEach(c=>str[c.currency]=c.strength)
      let best=null,bestDiff=0
      oandaPairs.forEach(([b,q])=>{
        if(str[b]!==undefined&&str[q]!==undefined){
          const diff=(str[b]||0)-(str[q]||0)
          if(Math.abs(diff)>bestDiff){
            bestDiff=Math.abs(diff)
            best=diff>0
              ?{pair:`${b}${q}`,action:'BUY',reason:`${b} stronger than ${q}`}
              :{pair:`${b}${q}`,action:'SELL',reason:`${q} stronger than ${b}`}
          }
        }
      })
      if(best)bp.push(best)
    }
    // NOTE: no bias push from here. Currency strength is deliberately EXCLUDED from the bias engine
    // (lagging — viewer-only), so pushing a strength-derived "Bias Change Alert" to Telegram/email
    // contradicted the engine. Bias pushes come from the v2 engine (publishTodayBias) only.
    const result={success:true,currencies:sorted,bestPairs:bp,marketClosed:allZ,updatedAt:new Date().toISOString()};if(!allZ){setCache('strength',result)}res.json(result)
  } catch(e){if(stale)return res.json(stale);res.status(500).json({success:false,error:'Strength failed'})}
})

// ============================================
// 📰 NEWS
// ============================================
app.get('/api/news', async (req, res) => {
  if (isCacheFresh('latest_news')) return res.json({ success: true, articles: getCached('latest_news') })
  const feeds=[{name:'CNBC',url:'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114'},{name:'Nasdaq',url:'https://www.nasdaq.com/feed/rssoutbound?category=Markets'},{name:'Fox Business',url:'https://feeds.foxbusiness.com/foxbusiness/markets'},{name:'Reuters',url:'https://feeds.reuters.com/reuters/topNews'},{name:'Investing.com',url:'https://www.investing.com/rss/news.rss'}]
  try {
    const results=await Promise.allSettled(feeds.map(f=>rssParser.parseURL(f.url).then(p=>p.items.slice(0,12).map(i=>({source:f.name,title:i.title||'',summary:i.contentSnippet||'',url:i.link||'',publishedAt:i.pubDate?new Date(i.pubDate).toISOString():new Date().toISOString()})))))
    let articles=[];results.forEach((r,i)=>{if(r.status==='fulfilled')articles.push(...r.value)})
    if(!articles.length)return res.status(502).json({success:false,error:'All feeds failed'})
    // Reuse previous scores; only send NEW (unseen) articles to the AI — was re-scoring all ~50 articles every 10 min
    let scored=articles.map(a=>{const prev=newsScoreMemo.get(a.title);return prev?{...a,...prev}:{...a,impact:5,category:'General',bias:'neutral',marketTags:[],oneliner:'',_unscored:true}})
    const unscored=scored.map((a,i)=>({a,i})).filter(x=>x.a._unscored)
    if(unscored.length){
      try{
        const titles=unscored.map((x,n)=>`${n+1}.[${x.a.source}]${x.a.title}`).join('\n')
        const m=await anthropic.messages.create({model:'claude-haiku-4-5-20251001',max_tokens:4096,system:'Macro analyst for BiasForge. Return ONLY JSON array.\n[{"index":1,"impact":8,"category":"Central Bank","bias":"bearish","marketTags":["USD↓"],"oneliner":"..."}]',messages:[{role:'user',content:`Score:\n${titles}`}]})
        trackAI('news-scoring','claude-haiku-4-5-20251001',m.usage)
        const s=JSON.parse(m.content[0].text.trim().replace(/```json|```/g,'').trim())
        s.forEach(x=>{const u=unscored[x.index-1];if(u){const f={impact:x.impact||5,category:x.category||'General',bias:x.bias||'neutral',marketTags:x.marketTags||[],oneliner:x.oneliner||''};Object.assign(scored[u.i],f);newsScoreMemo.set(u.a.title,f)}})
        if(newsScoreMemo.size>300){const keys=[...newsScoreMemo.keys()];keys.slice(0,keys.length-300).forEach(k=>newsScoreMemo.delete(k))}
      }catch(e){}
    }
    scored.forEach(a=>{delete a._unscored})
    scored.sort((a,b)=>b.impact!==a.impact?b.impact-a.impact:new Date(b.publishedAt)-new Date(a.publishedAt))
    setCache('latest_news',scored);res.json({success:true,articles:scored})
  } catch(e){res.status(500).json({success:false,error:'News failed'})}
})

// ============================================
// 📊 COT REPORT (Currencies + Commodities + Crypto)
// ============================================
// Reusable COT fetcher (cached 24h — CFTC data updates weekly on Fridays; a single fetch
// failure falls back to the last cached value instead of zeroing positioning).
async function getCOTData() {
  if (isCacheFreshFor('cot_data', 24 * 60 * 60 * 1000)) return getCached('cot_data')
  // ── Dataset 1: TFF (gpe5-46if) — Currencies + USD Index ──
  const FINANCIAL_MAP = {
    'EURO FX':              { currency: 'EUR', flag: '🇪🇺' },
    'BRITISH POUND':        { currency: 'GBP', flag: '🇬🇧' },
    'JAPANESE YEN':         { currency: 'JPY', flag: '🇯🇵' },
    'SWISS FRANC':          { currency: 'CHF', flag: '🇨🇭' },
    'AUSTRALIAN DOLLAR':    { currency: 'AUD', flag: '🇦🇺' },
    'NZ DOLLAR':            { currency: 'NZD', flag: '🇳🇿' },
    'CANADIAN DOLLAR':      { currency: 'CAD', flag: '🇨🇦' },
    'USD INDEX':            { currency: 'USD', flag: '🇺🇸' },
  }

  // ── Dataset 2: Disaggregated (72hh-3qpy) — Gold, Silver, BTC, ETH ──
  const COMMODITY_MAP = {
    'GOLD':                 { currency: 'XAU', flag: '🥇' },
    'SILVER':               { currency: 'XAG', flag: '🥈' },
    
  }

  const results = []
  const seen = new Set()
  let reportDate = ''
  try {
    // ── Fetch 1: Financial instruments (currencies) ──
    const finUrl = 'https://publicreporting.cftc.gov/resource/gpe5-46if.json?' +
                   '%24order=report_date_as_yyyy_mm_dd%20DESC&%24limit=500'
    const finRes = await fetch(finUrl, { headers: FF_HEADERS, signal: AbortSignal.timeout(12000) })
    if (!finRes.ok) console.warn(`⚠️ COT financial fetch HTTP ${finRes.status} — currency positioning unavailable`)

    if (finRes.ok) {
      const finRows = await finRes.json()
      if (finRows?.length) {
        reportDate = finRows[0]?.report_date_as_yyyy_mm_dd?.split('T')[0] || ''
        const latest = finRows.filter(r => (r.report_date_as_yyyy_mm_dd || '').startsWith(reportDate.slice(0, 10)))

        // ── WoW: prior report's net per currency (v2 OrderFlow wants week-over-week change) ──
        const finDates = [...new Set(finRows.map(r => (r.report_date_as_yyyy_mm_dd || '').slice(0, 10)).filter(Boolean))].sort().reverse()
        const priorFinDate = finDates[1] || null
        const priorNet = {}
        if (priorFinDate) {
          for (const row of finRows.filter(r => (r.report_date_as_yyyy_mm_dd || '').startsWith(priorFinDate))) {
            const mn = (row.contract_market_name || '').toUpperCase().trim()
            const m = FINANCIAL_MAP[mn]
            if (!m) continue
            const q = v => parseInt(v) || 0
            priorNet[m.currency] = (q(row.asset_mgr_positions_long) + q(row.lev_money_positions_long)) - (q(row.asset_mgr_positions_short) + q(row.lev_money_positions_short))
          }
        }

        for (const row of latest) {
          const mn = (row.contract_market_name || '').toUpperCase().trim()
          let m = null
          for (const [k, v] of Object.entries(FINANCIAL_MAP)) {
            if (mn === k) { m = v; break }
          }
          if (!m || seen.has(m.currency)) continue
          seen.add(m.currency)

          const p = v => parseInt(v) || 0
          const al = p(row.asset_mgr_positions_long), as = p(row.asset_mgr_positions_short)
          const ll = p(row.lev_money_positions_long), ls = p(row.lev_money_positions_short)
          const dl = p(row.dealer_positions_long_all), ds = p(row.dealer_positions_short_all)
          const tl = al + ll, ts = as + ls, np = tl - ts

          let bias = 'Neutral'
          if (np > 5000) bias = 'Bullish'
          else if (np < -5000) bias = 'Bearish'

          results.push({
            currency: m.currency, flag: m.flag,
            longContracts: tl, shortContracts: ts, netPosition: np,
            weeklyChange: priorNet[m.currency] != null ? np - priorNet[m.currency] : null,
            bias, reportDate,
            breakdown: {
              assetManagers: { long: al, short: as, net: al - as },
              leveragedFunds: { long: ll, short: ls, net: ll - ls },
              dealers: { long: dl, short: ds, net: dl - ds },
            },
          })
        }
      }
    }

    // ── Fetch 2: Disaggregated (commodities + crypto) ──
   // NOTE: trailing comma in the IN(...) list makes Socrata 400 → gold silently missing. No trailing comma.
   const comUrl = 'https://publicreporting.cftc.gov/resource/72hh-3qpy.json?' +
               '%24order=report_date_as_yyyy_mm_dd%20DESC&%24limit=50&' +
               '%24where=commodity_name%20in(%27GOLD%27,%27SILVER%27)'
    const comRes = await fetch(comUrl, { headers: FF_HEADERS, signal: AbortSignal.timeout(12000) })
    if (!comRes.ok) console.warn(`⚠️ COT commodity fetch HTTP ${comRes.status} — gold/XAU positioning unavailable`)

    if (comRes.ok) {
      const comRows = await comRes.json()
      if (comRows?.length) {
        const comDate = comRows[0]?.report_date_as_yyyy_mm_dd?.split('T')[0] || ''
        if (!reportDate) reportDate = comDate
        const comLatest = comRows.filter(r => (r.report_date_as_yyyy_mm_dd || '').startsWith(comDate.slice(0, 10)))
        // Log what the gold/XAU lookup is matching against (COMMODITY_MAP keys are substring-matched on contract_market_name)
        console.log(`🥇 COT commodity contracts (${comDate}): ${[...new Set(comLatest.map(r => (r.contract_market_name || '').trim()))].join(' | ') || 'none'}`)

        // ── WoW: prior report's net per commodity (smart money = managed money + other reportables) ──
        const comDates = [...new Set(comRows.map(r => (r.report_date_as_yyyy_mm_dd || '').slice(0, 10)).filter(Boolean))].sort().reverse()
        const priorComDate = comDates[1] || null
        const priorNetCom = {}
        if (priorComDate) {
          for (const row of comRows.filter(r => (r.report_date_as_yyyy_mm_dd || '').startsWith(priorComDate))) {
            const mn = (row.contract_market_name || '').toUpperCase().trim()
            if (mn.includes('MICRO') || mn.includes('E-MINI')) continue   // skip mini/micro → use main GOLD/SILVER
            let m = null
            for (const [k, v] of Object.entries(COMMODITY_MAP)) { if (mn.includes(k)) { m = v; break } }
            if (!m) continue
            const q = v => parseInt(v) || 0
            priorNetCom[m.currency] = (q(row.m_money_positions_long_all) + q(row.other_rept_positions_long)) - (q(row.m_money_positions_short_all) + q(row.other_rept_positions_short))
          }
        }

        for (const row of comLatest) {
          const mn = (row.contract_market_name || '').toUpperCase().trim()
          if (mn.includes('MICRO') || mn.includes('E-MINI')) continue   // skip mini/micro → use main GOLD/SILVER

          let m = null
          for (const [k, v] of Object.entries(COMMODITY_MAP)) {
            if (mn.includes(k)) { m = v; break }
          }
          if (!m || seen.has(m.currency)) continue
          seen.add(m.currency)

          const p = v => parseInt(v) || 0
          // Disaggregated uses: managed money (≈ leveraged funds), swap dealers (≈ dealers), producer/merchant
         const mml = p(row.m_money_positions_long_all), mms = p(row.m_money_positions_short_all)
const sdl = p(row.swap_positions_long_all), sds = p(row.swap_positions_short_all)
          const pml = p(row.prod_merc_positions_long), pms = p(row.prod_merc_positions_short)
          const orl = p(row.other_rept_positions_long), ors = p(row.other_rept_positions_short)

          // Smart money = Managed Money + Other Reportables
          const tl = mml + orl, ts = mms + ors, np = tl - ts

          let bias = 'Neutral'
          // Use different thresholds for crypto (smaller market)
          const threshold = (m.currency === 'BTC' || m.currency === 'ETH') ? 500 : 5000
          if (np > threshold) bias = 'Bullish'
          else if (np < -threshold) bias = 'Bearish'

          results.push({
            currency: m.currency, flag: m.flag,
            longContracts: tl, shortContracts: ts, netPosition: np,
            weeklyChange: priorNetCom[m.currency] != null ? np - priorNetCom[m.currency] : null,
            bias, reportDate: comDate,
            breakdown: {
              assetManagers: { long: mml, short: mms, net: mml - mms },   // Managed Money
              leveragedFunds: { long: orl, short: ors, net: orl - ors },  // Other Reportables
              dealers: { long: sdl, short: sds, net: sdl - sds },         // Swap Dealers
            },
          })
        }
      }
    }

    // Sort: Bullish → Neutral → Bearish, then by abs net position
    results.sort((a, b) => {
      const o = { Bullish: 0, Neutral: 1, Bearish: 2 }
      return o[a.bias] !== o[b.bias]
        ? o[a.bias] - o[b.bias]
        : Math.abs(b.netPosition) - Math.abs(a.netPosition)
    })
  } catch (e) {
    console.warn(`⚠️ COT fetch error: ${e?.message}`)
  }

  // Durability: never overwrite a good cache with an empty result. COT is weekly, so on an
  // empty/failed fetch fall back to the last cached value instead of returning nothing.
  if (!results.length) {
    const stale = getCached('cot_data')
    if (stale) { console.warn('⚠️ COT: empty/failed fetch — using last cached value'); return stale }
    return { data: [], reportDate: '' }
  }
  console.log(`📊 COT loaded (${results.length}): ${results.map(r => `${r.currency}(${r.netPosition > 0 ? '+' : ''}${r.netPosition})`).join(', ')}${results.some(r => r.currency === 'XAU') ? '' : ' ⚠️ NO XAU'}`)
  const payload = { data: results, reportDate }
  setCache('cot_data', payload)
  return payload
}

app.get('/api/cot', async (req, res) => {
  try {
    const cot = await getCOTData()
    res.json({ success: true, data: cot.data, reportDate: cot.reportDate, fetchedAt: new Date().toISOString() })
  } catch (e) {
    console.error('COT error:', e.message)
    const stale = getCached('cot_data')
    if (stale) return res.json({ success: true, ...stale, stale: true, fetchedAt: new Date().toISOString() })
    res.status(502).json({ success: false, error: 'COT fetch failed' })
  }
})
// ============================================
// 📅 EARNINGS
// ============================================
app.get('/api/earnings', async (req, res) => {
  const apiKey=process.env.FINNHUB_API_KEY;if(!apiKey)return res.status(500).json({error:'No key'})
  try{const now=new Date(),from=new Date(now),to=new Date(now);from.setDate(now.getDate()-1);to.setDate(now.getDate()+14);const r=await fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${from.toISOString().split('T')[0]}&to=${to.toISOString().split('T')[0]}&token=${apiKey}`,{headers:{'Accept':'application/json'}});if(!r.ok)throw new Error('Finnhub error');const d=await r.json();const norm=(d.earningsCalendar||[]).map(i=>({symbol:i.symbol||'—',date:i.date||'',hour:i.hour||'amc',epsEstimate:i.epsEstimate??null,epsActual:i.epsActual??null,revenueEstimate:i.revenueEstimate??null,revenueActual:i.revenueActual??null,quarter:i.quarter||null,year:i.year||null}));norm.sort((a,b)=>a.date!==b.date?new Date(a.date)-new Date(b.date):a.symbol.localeCompare(b.symbol));res.json({success:true,earnings:norm,total:norm.length,fetchedAt:new Date().toISOString()})}catch(e){res.status(502).json({success:false,error:'Earnings failed'})}
})

// ============================================
// 🚀 START
// ============================================
// 🧠 Session bias alert — checks every 5 min for session opens (lightweight hour check + duplicate guard)
  let lastSessionFired = ''
  setInterval(async () => {
    try {
      if (isForexClosed()) return
      // Match each market's LOCAL open hour so DST shifts are handled automatically
      const hourIn = (tz) => { const h = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date()), 10); return h === 24 ? 0 : h }
      let session = null
      if (hourIn('Australia/Sydney') === 7) session = 'Sydney'
      else if (hourIn('Asia/Tokyo') === 9) session = 'Tokyo'
      else if (hourIn('Europe/London') === 8) session = 'London'
      else if (hourIn('America/New_York') === 8) session = 'New York'
      if (!session) return
      // Duplicate guard: only fire once per session per day
      const sessionKey = `${utcDay()}-${session}`
      if (lastSessionFired === sessionKey) return
      lastSessionFired = sessionKey
      console.log(`🧠 Session open detected: ${session} — triggering AI pair selection (sessionOpen=true)`)
      // Compute fresh AI bias — sessionOpen=true allows full pair re-pick
      const result = await computeTodaysAIBias(false, true)
      if (!result) return
      const msg = `🔔 <b>${session} Session Open!</b>\n\n` +
        `📊 <b>Today's Bias: ${result.direction.toUpperCase()} ${result.pair}</b>\n` +
        `Confidence: <b>${result.confidence}%</b> · Grade <b>${result.tradeGrade}</b>\n` +
        `💡 ${result.reasoning}\n\n` +
        `🔗 <a href="https://www.biasforge.co/bias">Open AI Bias Engine</a>`
      for (const sub of telegramSubscribers.filter(s => s.active)) {
        await sendTG(sub.chat_id, msg)
      }
      console.log(`🧠 Session AI bias alert sent: ${session} — ${result.direction} ${result.pair} (${result.confidence}%)`)
    } catch (e) { console.error('Session alert error:', e.message) }
  }, 5 * 60 * 1000)   // ← every 5 min instead of 60 min (lightweight: just an hour comparison)
  console.log('🧠 Session AI bias alerts (every 5min, DST-safe)')
// ============================================================================
// 🔬 BIAS ENGINE v2 — SHADOW MODE (does NOT touch the live dashboard / v1 engine)
// Wires the v2 feeds.* + market access to existing data functions. Writes only to
// bias_state_v2 / bias_history_v2. Manual endpoint + env-gated cron.
// ============================================================================
let v2LastGoodCOT = null      // last non-empty COT snapshot → durability for orderflow
let v2LastGoodYields = null   // last-good yields snapshot → durability for XAU macro
let v2LastGoodBasket = null   // last-good risk basket (per-field) → durability for sentiment

// ── v2 real-yield DIRECTION — US2Y level across SESSIONS, never a same-day price feed ──
// The previous implementation derived direction from TLT + UUP percent-change. UUP is a
// DOLLAR-INDEX ETF, so scoring USD off it is circular (justifying price with price): USD collapsed
// to neutral, and because USD is a leg of every major, every composite diff shrank with it. That
// whole path is gone — no ETF proxy carries direction any more.
// Direction is now the 3-TRADING-SESSION change in the US 2Y level, in basis points, read off a
// rolling history of daily 2Y closes (in-memory + app_state, same durability pattern as COT/basket).
// The 10Y is a LEVEL input only; it contributes no direction.
const Y2_HISTORY_KEY = 'yield2y_history_v2'
const Y2_HISTORY_LEN = 6            // keep 6 sessions of headroom; the read needs today + 3 back = 4
const Y2_LOOKBACK_SESSIONS = 3      // "3 sessions ago" = index 3 in a newest-first history
const Y2_HIGH_BPS = 8               // |3-session change| >= 8bps → high confidence
const Y2_MED_BPS = 4                // 4–8bps → medium; below 4bps → low, neutral, component clamped to 0
const Y2_MAX_STALE_DAYS = 5         // newest banked session older than this (weekend+holiday) → no direction
let v2Yield2yHistory = null         // [{ date:'YYYY-MM-DD', value: 3.712 }] sorted NEWEST first

// Hydrate the 2Y session history from app_state once per process (cron restarts lose in-memory).
async function v2Yield2yLoadHistory() {
  if (Array.isArray(v2Yield2yHistory)) return v2Yield2yHistory
  const db = await v2LoadSnapshot(Y2_HISTORY_KEY)
  v2Yield2yHistory = Array.isArray(db)
    ? db.filter(r => r && r.date && r.value != null && !isNaN(r.value))
    : []
  return v2Yield2yHistory
}

// Record the current 2Y level against its session date, then return the 3-session change in bps.
// Returns bps=null on COLD START (fewer than 4 distinct sessions banked) — the caller must treat
// that as 'low' confidence, NOT fall back to a single-day change.
async function v2Yield2y3SessionBps(y2) {
  const hist = await v2Yield2yLoadHistory()
  const date = y2?.date, value = y2?.value
  if (date && value != null && !isNaN(value)) {
    const i = hist.findIndex(r => r.date === date)
    if (i >= 0) hist[i] = { date, value }          // same session, later print — refresh in place
    else hist.unshift({ date, value })
    hist.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))   // newest first
    if (hist.length > Y2_HISTORY_LEN) hist.length = Y2_HISTORY_LEN
    v2Yield2yHistory = hist
    v2SaveSnapshot(Y2_HISTORY_KEY, hist)
  }
  const latest = hist[0], back = hist[Y2_LOOKBACK_SESSIONS]
  if (!latest || !back) return { bps: null, sessions: hist.length, from: null, to: latest?.date ?? null }
  // Staleness guard: if the 2Y leg has been missing long enough that the newest banked session is
  // older than a weekend-plus-holiday, the history is frozen — report no direction rather than let
  // a stale change keep scoring 'high' forever.
  const ageDays = Math.floor((Date.now() - new Date(latest.date + 'T00:00:00Z').getTime()) / 86400000)
  if (ageDays > Y2_MAX_STALE_DAYS) {
    console.warn(`   [v2 yields] 2Y history frozen — newest session ${latest.date} is ${ageDays}d old, direction suppressed`)
    return { bps: null, sessions: hist.length, from: back.date, to: latest.date, stale_days: ageDays }
  }
  return {
    bps: +((latest.value - back.value) * 100).toFixed(1),
    sessions: hist.length, from: back.date, to: latest.date,
  }
}

// Map the 3-session bps change onto direction + confidence. Phrased in GOLD-POSITIVE space
// (rising yields = USD-firm / gold-negative) to match how the scorer already consumes the field.
function v2YieldDirectionFromBps(bps) {
  const clamped = {
    real_yield_direction: 'neutral',
    direction_confidence: 'low',
    yields_macro_contribution: 'CLAMP TO 0 — 2Y 3-session change is inside the 4bps noise floor (or history not built yet)',
  }
  if (bps == null) return clamped
  const mag = Math.abs(bps)
  if (mag < Y2_MED_BPS) return clamped
  return {
    real_yield_direction: bps > 0
      ? `rising 2Y yields over 3 sessions (+${mag}bps) → USD-firm / gold-negative`
      : `falling 2Y yields over 3 sessions (-${mag}bps) → USD-soft / gold-positive`,
    direction_confidence: mag >= Y2_HIGH_BPS ? 'high' : 'medium',
    yields_macro_contribution: 'score from real_yield_direction',
  }
}

// DB-backed durability for v2 last-good snapshots (COT, risk basket). The cron process can reset
// on Railway redeploy, wiping in-memory snapshots — persist to app_state so they survive restarts.
async function v2LoadSnapshot(key) {
  try {
    const { data, error } = await supabase.from('app_state').select('value').eq('key', key).maybeSingle()
    if (error) return null
    return data?.value ?? null
  } catch (e) { return null }
}
function v2SaveSnapshot(key, value) {
  // fire-and-forget — don't block the run on the write
  supabase.from('app_state').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .then(({ error }) => { if (error) console.error(`⚠️ [v2 db] snapshot save ${key} failed: ${error.message}`) })
    .catch(e => console.error(`⚠️ [v2 db] snapshot save ${key} error: ${e?.message}`))
}

// ── Step A OBSERVATION LOG ──────────────────────────────────────────────────
// Every run's macro telemetry, banked as a ring buffer. Without this the data exists only in
// Railway logs and in the response of a MANUAL run — cron runs (the majority) would be lost, and
// the two questions this observation window exists to answer would be unanswerable.
// Records ONLY what is already computed. Changes no threshold, band, or weight.
const V2_TELEMETRY_KEY = 'v2_macro_telemetry'
const V2_TELEMETRY_MAX = 400          // ~33 days at the 2h cron cadence
let v2Telemetry = null
async function v2RecordTelemetry(trigger, out) {
  try {
    if (!Array.isArray(v2Telemetry)) v2Telemetry = (await v2LoadSnapshot(V2_TELEMETRY_KEY)) || []
    const m = out?.macro_rate || {}
    const row = {
      at: new Date().toISOString(), trigger, regime: out?.regime ?? null,
      macro_status: m.status ?? null,
      xsection: (m.xsection || []).length,
      dropped: Object.keys(m.dropped || {}),
      spread: m.spread ?? null,
      floor: m.floor ?? null,
      shadow_floor: m.shadow_floor ?? null,     // what a 6.9bps floor WOULD have done — logged, never applied
      macro_scores: m.scores ?? null,
      full: 0, redist: 0, diffs: {}, opens: [], outcomes: [],
    }
    for (const r of out?.results || []) {
      // per-pair basis is kept alongside the diff — question 1 is specifically about the FULL pairs,
      // so a bare count of FULL/REDIST would not be enough to answer it later.
      // c = per-component contribution to this pair's diff (macro / orderflow / sentiment).
      // d === c.m + c.o + c.s. Without this, "which component was decisive" is unanswerable later.
      row.diffs[r.pair] = { d: r.diff ?? null, b: r.macro_basis ?? null, c: r.contrib ?? null }
      if (r.macro_basis === 'REDIST') row.redist++
      else if (r.macro_basis === 'FULL') row.full++
      // opens carry their basis so FULL and REDIST open RATES can be compared. If REDIST pairs open
      // more often per opportunity, macro is suppressing the diff rather than sharpening it.
      if (r.action === 'OPEN' || r.action === 'FLIP') {
        row.opens.push({ pair: r.pair, action: r.action, direction: r.direction || null, basis: r.macro_basis ?? null, diff: r.diff ?? null, contrib: r.contrib ?? null })
      }
      if (r.outcome) row.outcomes.push(r.outcome)
    }
    v2Telemetry.push(row)
    if (v2Telemetry.length > V2_TELEMETRY_MAX) v2Telemetry = v2Telemetry.slice(-V2_TELEMETRY_MAX)
    v2SaveSnapshot(V2_TELEMETRY_KEY, v2Telemetry)
  } catch (e) { console.warn(`⚠️ [v2 telemetry] record failed: ${e?.message}`) }
}

// ── Step A HEALTH MONITOR ───────────────────────────────────────────────────
// Reads the banked telemetry once a day and messages the admin's PERSONAL Telegram chat ONLY when
// something is broken. Silent when healthy — no daily "all good" ping.
// Strictly read-only: calls no engine code, spends no model credits, and touches nothing in the
// scoring path (threshold, bands, weights, floor, cadence all untouched).
const V2_HEALTH_KEY = 'v2_health_alert_state'
const V2_HEALTH_WINDOW_H = 24     // look-back window per check
const V2_HEALTH_REALERT_H = 72    // re-remind if the SAME problem is still unresolved after this
const V2_HEALTH_BASELINE_DROPS = ['AUD']   // RBA publishes ~6 business days late — known and accepted

// The admin chat is deliberately a SEPARATE env var from TG_CHANNEL. Internal alerts must never
// reach @biasforgeofficial, so this refuses anything that isn't a numeric chat id — channel targets
// are @handles, personal chats are numeric. No fallback: misconfigured means silent, never public.
function v2AdminChat() {
  const id = (process.env.TG_ADMIN_CHAT_ID || '').trim()
  if (!id) return null
  if (!/^-?\d+$/.test(id)) {
    console.error('⚠️ [v2 health] TG_ADMIN_CHAT_ID must be a NUMERIC chat id (an @handle would risk the public channel) — alerts disabled')
    return null
  }
  return id
}

// Runtime admin alerting for engine-level failures. Deliberately separate from v2HealthCheck below:
// that is a DAILY sweep over telemetry with a 72h re-alert, which is right for slow degradations
// (a source drifting stale) but useless for a hard failure. An exhausted Anthropic balance or a
// Railway restart loop otherwise produces one log line every couple of hours and no notification at
// all, which is how those went unnoticed. Dedup is per error CLASS on a 30-minute window, so a
// 2h-cron failing repeatedly alerts once, not every run.
const V2_ALERT_DEDUP_MS = 30 * 60 * 1000
const v2AlertLast = new Map()   // errorClass → epoch ms of the last alert actually sent

// Anthropic failures are split out because they demand different responses and folding them into one
// "AI failed" alert makes it un-actionable: a credit/quota problem is ours and needs a top-up right
// now, a 429 or 5xx is theirs and usually self-heals before anyone can act.
function classifyEngineError(err) {
  const status = err?.status ?? err?.response?.status ?? null
  const raw = `${err?.error?.type || ''} ${err?.message || ''}`.toLowerCase()
  if (/credit balance|insufficient|billing|quota|payment/.test(raw)) return { cls: 'anthropic_credit', label: 'Anthropic credit/quota exhausted', urgent: true }
  if (status === 401 || status === 403 || /api key|authentication|unauthorized/.test(raw)) return { cls: 'anthropic_auth', label: 'Anthropic auth rejected — check ANTHROPIC_API_KEY', urgent: true }
  if (status === 429 || /rate.?limit|overloaded/.test(raw)) return { cls: 'anthropic_ratelimit', label: 'Anthropic rate limited / overloaded', urgent: false }
  if ((status != null && status >= 500) || /timeout|etimedout|econnreset|socket hang up|enotfound/.test(raw)) return { cls: 'upstream', label: 'Upstream or network failure', urgent: false }
  return { cls: 'engine', label: 'Engine run failed', urgent: false }
}

// No-ops (logs only) when TG_ADMIN_CHAT_ID is unset. Returns whether an alert was actually sent.
async function v2AdminAlert(err, context = 'v2 engine') {
  const { cls, label, urgent } = classifyEngineError(err)
  const now = Date.now()
  const suppressed = now - (v2AlertLast.get(cls) ?? 0) < V2_ALERT_DEDUP_MS
  console.error(`🚨 [v2 alert:${cls}] ${context} — ${label}: ${err?.message || err}${suppressed ? ' (deduped, already alerted within 30min)' : ''}`)
  if (suppressed) return false
  const chat = v2AdminChat()
  if (!chat) { console.error('⚠️ [v2 alert] no TG_ADMIN_CHAT_ID set — logged only'); return false }
  // Stamp BEFORE awaiting the send: two failures landing together must not both clear the window.
  v2AlertLast.set(cls, now)
  const msg = `${urgent ? '🔴' : '🟠'} <b>BiasForge — ${context}</b>\n\n<b>${label}</b>\n`
    + `<code>${String(err?.message || err).slice(0, 300)}</code>\n\n`
    + `<i>This error class is muted for ${V2_ALERT_DEDUP_MS / 60000} min.</i>`
  try { await sendTG(chat, msg) } catch (e) { console.error(`⚠️ [v2 alert] send failed: ${e?.message}`) }
  return true
}

async function v2HealthCheck() {
  try {
    const rows = (Array.isArray(v2Telemetry) ? v2Telemetry : await v2LoadSnapshot(V2_TELEMETRY_KEY)) || []
    const prev = (await v2LoadSnapshot(V2_HEALTH_KEY)) || {}
    // The baseline is STATIC on purpose. Folding a new drop into it would make the problem vanish
    // from the next check, which then reads as "recovered" and fires a recovery message while the
    // source is still down. Repetition is instead suppressed by the signature dedupe below, so an
    // unresolved drop stays quiet without ever being falsely declared fixed.
    const known = new Set(V2_HEALTH_BASELINE_DROPS)
    const cutoff = Date.now() - V2_HEALTH_WINDOW_H * 3600000
    const recent = rows.filter((r) => r?.at && new Date(r.at).getTime() >= cutoff)
    const problems = []
    let newDrops = []

    if (!recent.length) {
      // The absence of rows IS the failure. A dead cron writes no bad rows, so every other check
      // would read as healthy — this is the one condition that would otherwise be invisible.
      problems.push(`No v2 runs recorded in ${V2_HEALTH_WINDOW_H}h — shadow cron may be down. Last run: ${rows[rows.length - 1]?.at || 'never'}`)
    } else {
      const insuff = recent.filter((r) => r.macro_status === 'INSUFFICIENT')
      if (insuff.length) problems.push(`macro_status=INSUFFICIENT on ${insuff.length}/${recent.length} runs — macro nulled for ALL pairs`)
      const thin = recent.filter((r) => (r.xsection ?? 99) <= 3)
      if (thin.length) problems.push(`cross-section fell to ${Math.min(...thin.map((r) => r.xsection))} on ${thin.length}/${recent.length} runs (floor is 4)`)
      // Only NEW drops. AUD drops on nearly every run and is the accepted baseline; alerting on it
      // daily would be precisely the noise this check exists to avoid.
      newDrops = [...new Set(recent.flatMap((r) => r.dropped || []))].filter((c) => !known.has(c))
      if (newDrops.length) problems.push(`new source drop: ${newDrops.join(', ')} (baseline: ${[...known].join(', ') || 'none'})`)
    }

    const sig = problems.join(' | ')
    const chat = v2AdminChat()
    const now = Date.now()
    const sinceLast = prev.last_alert_at ? (now - new Date(prev.last_alert_at).getTime()) / 3600000 : Infinity

    if (problems.length) {
      const repeat = sig === prev.last_sig
      // New problem → alert. Same problem still unresolved → re-remind only after V2_HEALTH_REALERT_H.
      if (!repeat || sinceLast >= V2_HEALTH_REALERT_H) {
        const msg = `🚨 <b>BiasForge v2 — Step A health</b>\n\n${problems.map((p) => `• ${p}`).join('\n')}\n\n`
          + `<code>runs/${V2_HEALTH_WINDOW_H}h: ${recent.length}</code>${repeat ? '\n\n<i>(still unresolved)</i>' : ''}`
        console.error(`🚨 [v2 health] ${sig}`)
        if (chat) await sendTG(chat, msg)
        else console.error('⚠️ [v2 health] no TG_ADMIN_CHAT_ID set — alert logged only')
      } else {
        console.log(`   [v2 health] problem unchanged, next re-alert in ${(V2_HEALTH_REALERT_H - sinceLast).toFixed(1)}h`)
      }
      v2SaveSnapshot(V2_HEALTH_KEY, {
        last_sig: sig,
        last_alert_at: (!repeat || sinceLast >= V2_HEALTH_REALERT_H) ? new Date().toISOString() : (prev.last_alert_at ?? null),
      })
    } else {
      // Healthy: stay silent. Send ONE recovery note if we were previously alerting, so a fixed
      // problem doesn't just go quiet with no way to tell it was resolved.
      if (prev.last_sig) {
        console.log('   [v2 health] recovered')
        if (chat) await sendTG(chat, `✅ <b>BiasForge v2 — Step A health recovered</b>\n\nPrevious issue cleared:\n• ${prev.last_sig}`)
      }
      v2SaveSnapshot(V2_HEALTH_KEY, { last_sig: null, last_alert_at: null })
    }
  } catch (e) { console.error(`⚠️ [v2 health] check failed: ${e?.message}`) }
}

// Per-pair market is DERIVED from the shared candle caches (getDailyCandles / getWeeklyCandles)
// so v2 reuses v1's TwelveData fetches instead of hitting the per-symbol rate limit itself.
function v2AdrFromDaily(pair, vals) {
  const completed = vals.slice(1)
  const adr = completed.reduce((s, x) => s + (parseFloat(x.high) - parseFloat(x.low)), 0) / (completed.length || 1)
  const today = vals[0]
  const price = parseFloat(today.close)               // latest (forming) daily close ≈ current price
  const todayRange = parseFloat(today.high) - parseFloat(today.low)
  const adrUsedPct = adr > 0 ? Math.min(todayRange / adr, 1) : 0   // fraction of ADR spent today
  return { price: isFinite(price) ? price : null, adrUsedPct, adr }
}
function v2WeeklyAtr(vals) {
  if (!Array.isArray(vals) || vals.length < 4) return null
  // vals[0] = current (forming) week → ATR from completed weeks; hot week relaxes the exhaustion cap
  const trs = vals.slice(1).map(d => parseFloat(d.high) - parseFloat(d.low)).filter(n => isFinite(n) && n > 0)
  if (!trs.length) return null
  const atr = trs.reduce((s, x) => s + x, 0) / trs.length
  return { atr, isHighAtrWeek: trs[0] > atr * 1.25 }
}
// Weekly-ATR PROXY from daily candles — used when the weekly cache is cold/unavailable so
// v2 never SKIPs while daily data exists (v1 keeps daily warm). A trading week ≈ 5 sessions →
// weekly range ≈ dailyADR * √5 (random-walk scaling). isHighAtrWeek from recent daily expansion.
function v2AtrFromDaily(vals) {
  const ranges = vals.slice(1).map(d => parseFloat(d.high) - parseFloat(d.low)).filter(n => isFinite(n) && n > 0)
  if (!ranges.length) return null
  const adr = ranges.reduce((s, x) => s + x, 0) / ranges.length
  const recent = ranges.slice(0, 3)
  const recentAvg = recent.reduce((s, x) => s + x, 0) / recent.length
  return { atr: adr * Math.sqrt(5), isHighAtrWeek: recentAvg > adr * 1.25 }
}

// The data-access layer the v2 engine expects. Each method is defensive: a failing
// feed returns a safe default so one bad source can't kill the whole shadow run.
function buildV2Feeds() {
  return {
    async getCalendarThisWeek() {
      try {
        const events = await getEconomicCalendar()
        const now = Date.now(), weekAhead = now + 7 * 24 * 60 * 60 * 1000
        return (events || [])
          .filter(e => { const t = new Date(e.time).getTime(); return t >= now - 24 * 60 * 60 * 1000 && t <= weekAhead })
          .map(e => ({ title: e.event, impact: String(e.impact || '').toLowerCase() }))
      } catch (e) { return [] }
    },
    async getCentralBankText() {
      // No dedicated CB-speech feed in-stack → FRED actuals + recent high-impact releases (per plan)
      const parts = []
      try { const actuals = await fetchUSActuals(); if (actuals) parts.push('US ECONOMIC ACTUALS (FRED):\n' + actuals) } catch (e) {}
      try {
        const events = await getEconomicCalendar()
        const now = Date.now(), weekAgo = now - 7 * 24 * 60 * 60 * 1000
        const recent = (events || [])
          .filter(e => String(e.impact || '').toLowerCase() === 'high' && new Date(e.time).getTime() < now && new Date(e.time).getTime() > weekAgo)
          .slice(0, 12)
          .map(e => `${e.event} (${e.country})${e.forecast ? ' | forecast ' + e.forecast : ''}${e.previous ? ' | previous ' + e.previous : ''}`)
        if (recent.length) parts.push('RECENT HIGH-IMPACT RELEASES (past 7d):\n' + recent.join('\n'))
      } catch (e) {}
      return parts.join('\n\n') || ''
    },
    async getNewsHeadlines() {
      const n = getCached('latest_news')
      if (!Array.isArray(n)) return []
      // Prefix MarketMovers Radar context so Haiku extraction + Sonnet scoring know which headline
      // is a market-shaker and which assets it hits (MOVERS_SRV / matchMoverSrv hoisted above).
      return n.filter(a => (a.impact || 0) >= 7).map(a => {
        const m = matchMoverSrv(`${a.title} ${a.summary || ''}`)
        const mv = m ? `[MOVER ${m.emoji} ${m.name} → ${m.assets.slice(0, 3).join(', ')} | impact ${a.impact || 0}/10] ` : ''
        return `${mv}[${a.category || a.source}] ${a.title}${a.oneliner ? ' — ' + a.oneliner : ''}`
      })
    },
    async getCOT() {
      let out = {}
      try {
        const cot = await getCOTData()
        for (const c of (cot?.data || [])) out[c.currency] = { net: c.netPosition, change: c.weeklyChange ?? null }
      } catch (e) { console.warn(`⚠️ [v2 cot] getCOTData error: ${e?.message}`) }
      if (Object.keys(out).length) {
        v2LastGoodCOT = out
        v2SaveSnapshot('cot_last_good_v2', out)   // DB-persist so cron restarts don't lose it
        console.log(`   [v2 cot] fresh (${Object.keys(out).length}): ${Object.entries(out).map(([c, v]) => `${c}=${v.net}${v.change != null ? '/' + v.change : ''}`).join(' ')}`)
        return out
      }
      // fetch empty → in-memory snapshot, then DB snapshot (survives process restart)
      if (v2LastGoodCOT) { console.warn(`   [v2 cot] cache(mem) ${Object.keys(v2LastGoodCOT).length} ccy — fetch empty`); return v2LastGoodCOT }
      const db = await v2LoadSnapshot('cot_last_good_v2')
      if (db && Object.keys(db).length) { v2LastGoodCOT = db; console.warn(`   [v2 cot] cache(db) ${Object.keys(db).length} ccy — fetch empty, restored from DB`); return db }
      console.warn('   [v2 cot] EMPTY (no fetch, no mem snapshot, no DB snapshot)')
      return {}
    },
    async getRiskBasket() {
      const basket = { vix: null, gold: null, dxy: null, spx: null, jpy: null, chf: null }
      try {
        const x = await fetchCrossAssetLive()   // DXY,VIX,SPY,TLT + UUP,VIXY proxies
        if (x) {
          basket.vix = x.VIX?.price ?? x.VIXY?.price ?? null   // VIXY = VIX-futures ETF proxy (Basic plan)
          basket.dxy = x.DXY?.price ?? x.UUP?.price ?? null    // UUP = US-dollar-index ETF proxy (Basic plan)
          basket.spx = x.SPY?.price ?? null
        }
      } catch (e) {}
      // read-only: don't trigger the paced seed here (would grab the seed guard before the pair loop);
      // gold comes from whatever the pair loop / a prior run already seeded, else the basket snapshot fills it.
      try { const gv = getCached('tdcandle_dv2_XAUUSD'); if (Array.isArray(gv) && gv[0]) basket.gold = parseFloat(gv[0].close) } catch (e) {}
      try {
        const s = await getLiveStrength()   // safe-haven read for JPY/CHF (0..100 strength)
        const find = c => s?.currencies?.find(z => z.currency === c)?.strength ?? null
        basket.jpy = find('JPY'); basket.chf = find('CHF')
      } catch (e) {}
      // Hydrate the in-memory snapshot from DB once (survives cron process restarts)
      if (!v2LastGoodBasket) { const dbSnap = await v2LoadSnapshot('basket_last_good_v2'); if (dbSnap) v2LastGoodBasket = dbSnap }
      // Fill any missing field from last-good, update the snapshot per-field, and DB-persist it.
      const merged = { ...basket }
      let filled = 0
      if (v2LastGoodBasket) for (const k of Object.keys(merged)) { if (merged[k] == null && v2LastGoodBasket[k] != null) { merged[k] = v2LastGoodBasket[k]; filled++ } }
      const freshEntries = Object.entries(basket).filter(([, v]) => v != null)
      if (freshEntries.length) {
        v2LastGoodBasket = { ...(v2LastGoodBasket || {}), ...Object.fromEntries(freshEntries) }
        v2SaveSnapshot('basket_last_good_v2', v2LastGoodBasket)
      }
      console.log(`   [v2 basket] ${freshEntries.length}/6 fresh${filled ? `, ${filled} from cache` : ''} → vix=${merged.vix ?? 'n/a'} spx=${merged.spx ?? 'n/a'} dxy=${merged.dxy ?? 'n/a'} gold=${merged.gold ?? 'n/a'} jpy=${merged.jpy ?? 'n/a'} chf=${merged.chf ?? 'n/a'}`)
      return merged
    },
    // 2Y government yields per currency — the rate-differential driver for FX macro scoring.
    async getRates() {
      try { return await fetchRateDifferentials() } catch (e) { console.warn(`⚠️ [v2 rates] failed: ${e?.message}`); return {} }
    },
    async getYields() {
      // LEVELS: TwelveData US2Y/US10Y (market-sourced, same-day), each leg falling back to FRED
      // DGS2/DGS10 independently inside fetchYields().
      // DIRECTION: the US2Y 3-TRADING-SESSION change in bps — never a same-day ETF proxy. Below the
      // 4bps noise floor (or on cold start, before 4 sessions are banked) the direction is 'neutral'
      // at 'low' confidence and the yields contribution to macro is clamped to 0. No guessing, and
      // no falling back to a single-day change.
      let y = null
      try { y = await fetchYields() } catch (e) {}

      if (y && (y.y2?.value != null || y.y10?.value != null)) {
        let sess = { bps: null, sessions: 0, from: null, to: null }
        try { sess = await v2Yield2y3SessionBps(y.y2) } catch (e) { console.warn(`⚠️ [v2 yields] 2Y history failed: ${e?.message}`) }
        const dir = v2YieldDirectionFromBps(sess.bps)
        const yieldSource = y.source || 'unknown'
        const levelDate = y.y2?.date || y.y10?.date || null
        y = {
          ...y,
          yield_source: yieldSource,
          level_date: levelDate,
          fred_date: y.fred_date ?? null,
          fred_stale: !!y.fred_stale,
          ...dir,
          direction_source: `US2Y 3-session change (${sess.from || 'n/a'} → ${sess.to || 'n/a'}, ${sess.bps == null ? 'no history' : `${sess.bps > 0 ? '+' : ''}${sess.bps}bps`})`,
          y2_3session_bps: sess.bps,
          y2_history_sessions: sess.sessions,
        }
        v2LastGoodYields = y
        console.log(`   [v2 yields] fresh (${yieldSource}) dir=${dir.direction_confidence} bps3=${sess.bps ?? 'n/a'} sessions=${sess.sessions}/${Y2_LOOKBACK_SESSIONS + 1} ${JSON.stringify(y)}`)
        return y
      }

      if (v2LastGoodYields) { console.warn(`   [v2 yields] cache ${JSON.stringify(v2LastGoodYields)} (fetch empty)`); return v2LastGoodYields }
      console.warn('   [v2 yields] none (no TwelveData, no FRED, no snapshot yet)')
      return null
    },
    async getPairMarket(pair) {
      // Read from the SHARED candle caches — the first getPairMarket call in a run warms all
      // v2 pairs in one batched request (only stale symbols fetched), the rest hit cache.
      const daily = await getV2DailyCandles(V2_CONFIG.PAIRS)
      const dvals = daily[pair]
      if (!Array.isArray(dvals) || dvals.length < 3) {
        console.log(`   [v2 mkt] ${pair}: SKIP no_daily (candles=${Array.isArray(dvals) ? dvals.length : 'none'})`)
        return null
      }
      const { price: candlePrice, adrUsedPct, adr } = v2AdrFromDaily(pair, dvals)
      if (candlePrice == null) { console.log(`   [v2 mkt] ${pair}: SKIP bad_price`); return null }

      // PRICE FRESHNESS. The daily candle cache has a 6h TTL, so its forming-bar close can be hours
      // old — while the 10-min invalidation watcher and the serve-time display guard both read live
      // spot. decide()'s invalidation trigger is a question about the CURRENT price, so that split
      // stranded biases: the watcher saw a breach on live spot and fired a run, the engine then
      // re-decided on a stale candle close, saw no breach, and HELD. The bias stayed `running` in
      // the DB but was dropped from every display, re-fired a full engine run (Haiku + Sonnet) every
      // 30min forever, and never wrote its outcome row. On 2026-08-24 this had consumed BOTH running
      // biases at once — "every running bias is breached — nothing to surface" — leaving Today's
      // Bias empty, with no v1 fallback behind it.
      //
      // Reading the same freshest price the guard reads closes the gap. v2CachedPrice returns the
      // NEWEST of live spot / v1 daily / v2 daily, so this can only move price forward in time.
      // Note the watcher caches its spot immediately BEFORE firing the run, so an invalidation-
      // triggered run now decides on exactly the price that triggered it.
      //
      // adr / adrUsedPct / pdh / pdl still come from the daily candles on purpose: those are daily
      // by definition, and adrUsedPct is computed from today's HIGH-LOW range, not from price.
      let price = candlePrice
      let priceSrc = 'daily-candle'
      const freshPx = v2CachedPrice(pair)
      if (freshPx && Number.isFinite(freshPx.price)) {
        price = freshPx.price
        priceSrc = `cached-${Math.round((Date.now() - freshPx.timestamp) / 60000)}min`
      }

      // 1day only by default — ATR from daily (dailyADR*√5). Weekly is OPTIONAL: use a REAL weekly
      // ATR ONLY if it's already cached (read-only, spends no credits); never fetch weekly here.
      const f = v2AtrFromDaily(dvals)
      if (!f) { console.log(`   [v2 mkt] ${pair}: SKIP no_atr`); return null }
      let atr = f.atr, isHighAtrWeek = f.isHighAtrWeek, atrSrc = 'daily'
      const wCached = getCached(`tdcandle_w_${pair}`)
      const w = Array.isArray(wCached) ? v2WeeklyAtr(wCached) : null
      if (w) { atr = w.atr; isHighAtrWeek = w.isHighAtrWeek; atrSrc = 'weekly-cache' }
      // Previous completed day = dvals[1] (dvals[0] is today's forming bar) → PDH/PDL, already in the data
      const prev = dvals[1]
      const pdh = prev ? parseFloat(prev.high) : null
      const pdl = prev ? parseFloat(prev.low) : null
      const dp = pair.includes('JPY') ? 3 : pair === 'XAUUSD' ? 2 : 5
      const mkt = { pair, price, atr, adr, pdh, pdl, adrUsedPct, isHighAtrWeek }
      // Preview the levels through the SAME function decide() uses, rather than re-deriving them
      // here. A local copy of the formula drifts the moment the real one changes — this line spent
      // the whole time the cushion was 0 still describing it as "0.2 × daily ATR cushion", and it
      // would now print the raw PDL/PDH level while the engine used the 0.5 ADR floor.
      const buf = V2_CONFIG.INVALIDATION_ATR_BUFFER * adr
      const invBuy = v2InvalidationLevel('BUY', mkt), invSell = v2InvalidationLevel('SELL', mkt)
      const fl = (v) => Number.isFinite(v) ? v.toFixed(dp) : 'n/a'
      // flag which constraint set each level, so a run of floored levels is visible at a glance
      const src = (v, anchor, sign) => Number.isFinite(v) && Number.isFinite(anchor)
        ? (Math.abs(v - (anchor + sign * buf)) < 1e-9 ? 'pd' : 'floor') : '-'
      console.log(`   [v2 mkt] ${pair}: price=${price.toFixed(dp)} PDL=${fl(pdl)} PDH=${fl(pdh)}`
        + ` | inval BUY=${fl(invBuy)}(${src(invBuy, pdl, -1)}) SELL=${fl(invSell)}(${src(invSell, pdh, +1)})`
        + ` (buf=${buf.toFixed(dp)} floor=${(V2_CONFIG.MIN_INVALIDATION_ADR * adr).toFixed(dp)})`
        + ` adrUsed=${Math.round(adrUsedPct * 100)}% [${atrSrc}, px:${priceSrc}]`)
      return mkt
    },
    // RUNNING MFE / MAE. Called on every HOLD refresh for a pair that still holds a bias.
    //
    // This was omitted when the shadow engine was built, and because the call site uses optional
    // chaining (`feeds.updateRunning?.()`) its absence was silent: mfe/mae sat at their schema
    // default of 0 forever, so every outcome row recorded 0.0/0.0 excursion.
    //
    // SAMPLED, NOT CONTINUOUS. Price is read once per engine run (2h cron, plus watcher/shaker
    // ticks), so an excursion that opens and closes between two runs is never seen. These are a
    // lower bound on the true excursion, not the intrabar extreme — do not present them as MFE/MAE
    // in the textbook sense.
    //
    // Both are POSITIVE magnitudes, matching the v1 performance path (mfePips/maePips):
    // mfe = best move in the bias's favour, mae = worst move against it, each in pips.
    async updateRunning(pair, price) {
      try {
        if (!Number.isFinite(+price)) return
        const { data, error } = await supabase.from('bias_state_v2')
          .select('direction, entry_price, mfe, mae').eq('pair', pair).maybeSingle()
        if (error) { console.error(`⚠️ [v2 db] updateRunning read(${pair}) failed: ${error.message}`); return }
        if (!data || data.direction === 'FLAT' || data.entry_price == null) return
        const excursion = ((+price - +data.entry_price) * (data.direction === 'BUY' ? 1 : -1)) / v2PipFor(pair)
        if (!Number.isFinite(excursion)) return
        const prevMfe = +(data.mfe ?? 0), prevMae = +(data.mae ?? 0)
        // max() against the previous value is what makes these RATCHETS — they only ever widen.
        const mfe = Math.max(prevMfe, +excursion.toFixed(1))
        const mae = Math.max(prevMae, +(-excursion).toFixed(1))
        if (mfe === prevMfe && mae === prevMae) return          // no new extreme — skip the write
        const { error: e2 } = await supabase.from('bias_state_v2').update({ mfe, mae }).eq('pair', pair)
        if (e2) console.error(`⚠️ [v2 db] updateRunning write(${pair}) failed: ${e2.message}`)
        else console.log(`   [v2 excursion] ${pair} mfe=${mfe}p mae=${mae}p (now ${excursion.toFixed(1)}p)`)
      } catch (e) { console.error(`⚠️ [v2 db] updateRunning(${pair}) error: ${e?.message}`) }
    },
  }
}

async function runV2Shadow(trigger) {
  // Forex closed (weekend) → skip: prices are frozen at Friday's close, so re-scoring produces
  // nothing new and just burns Haiku (extraction) + Sonnet (scoring) credits every 2h. The cron
  // keeps ticking; the first tick after Sunday 5PM ET passes this gate on its own. Manual trigger
  // (/api/v2/shadow/run — explicit user action, used for testing) always runs.
  if (isForexClosed() && trigger !== 'manual') {
    console.log(`🔬 [v2-shadow:${trigger}] skipped — forex market closed (weekend)`)
    return { regime: 'closed', results: [], skipped: true }
  }
  const started = Date.now()
  const feeds = buildV2Feeds()
  const onUsage = (label, model, usage) => { try { trackAI(label, model, usage) } catch (e) {} }
  const out = await runEngineV2({ supabase, feeds, onUsage })
  const ts = new Date().toISOString()
  const isChange = a => a === 'OPEN' || a === 'FLIP' || a === 'CLOSE'
  const changes = out.results.filter(r => isChange(r.action))
  // Header: timestamped so 12+h of runs are scannable by time; change-count surfaces whipsaw at a glance.
  console.log(`🔬 [v2-shadow:${trigger}] ${ts} | regime=${out.regime} | ${changes.length} bias change(s) | ${Date.now() - started}ms`)
  for (const r of out.results) {
    const tag = isChange(r.action) ? '🔔 CHANGE' : '        '
    const inval = r.invalidation != null ? ` inval=${(+r.invalidation).toFixed(r.pair.includes('JPY') ? 3 : r.pair === 'XAUUSD' ? 2 : 5)}` : ''
    console.log(`   ${tag} ${r.pair.padEnd(6)} ${String(r.action).padEnd(9)} ${String(r.direction || 'FLAT').padEnd(4)} diff=${String(r.diff).padStart(6)}${r.reason ? ' (' + r.reason + ')' : ''}${inval}`)
  }
  // One grep-friendly summary line for whipsaw review: `grep "v2-CHANGES"` gives every bias transition.
  if (changes.length) console.log(`   ⚑ v2-CHANGES ${ts}: ${changes.map(c => `${c.pair} ${c.action} ${c.direction || ''}${c.reason ? '/' + c.reason : ''}`.trim()).join(', ')}`)

  // Stash each pair's FRESH read (this run's diff/action/reason) in memory. A pair that is FLAT and
  // stays FLAT deliberately persists no new bias_state_v2 row (whipsaw guard), so /api/macro-compass
  // has nothing current to explain WHY it isn't tradeable — the engine computes exactly that here and
  // then throws it away. Memory only: no DB write, no migration, bias_state_v2 untouched. On restart
  // the cache is empty until the next run repopulates it (consumers treat cold as "no reason").
  // confidence/grade/contrib were being computed every run and discarded here. contrib is what lets
  // the compass tell a CONFLICT (macro one way, flow/sentiment the other) apart from a genuinely
  // even matchup — the two produce similar small diffs but mean opposite things to a trader.
  // NOTE: thesis is deliberately absent — writeThesis() only runs on OPEN/FLIP, so a pair that stays
  // FLAT has no fresh thesis to stash. Anything the compass shows for a flat pair is the frozen
  // bias_state_v2 one.
  const freshReads = {}
  for (const r of out.results) {
    freshReads[r.pair] = {
      diff: r.diff ?? null, action: r.action || null, reason: r.reason || null,
      confidence: r.confidence ?? null, grade: r.grade || null,
      contrib: r.contrib || null, direction: r.direction || null,
      at: ts,
    }
  }
  setCache('v2_fresh_reads', freshReads)
  await v2RecordTelemetry(trigger, out)   // Step A observation window — see V2_TELEMETRY_KEY
  return out
}

// Manual trigger — inspect a full v2 run on demand. Does not affect the live dashboard.
app.post('/api/v2/shadow/run', async (req, res) => {
  try { const out = await runV2Shadow('manual'); res.json({ success: true, pairs: V2_CONFIG.PAIRS.length, ...out }) }
  catch (e) { console.error('v2 shadow run error:', e?.message); res.status(500).json({ success: false, error: e?.message }) }
})

// Read-only rollup of the Step A observation window. Answers the two questions the window exists
// for: (1) do the FULL-macro pairs ever reach OPEN_THRESHOLD, or is the spread never big enough,
// and (2) how often does the quiet regime actually occur. Reads banked telemetry only — it runs
// no engine work, spends no model credits, and changes nothing.
app.get('/api/v2/shadow/telemetry', async (req, res) => {
  try {
    const rows = (Array.isArray(v2Telemetry) ? v2Telemetry : await v2LoadSnapshot(V2_TELEMETRY_KEY)) || []
    const T = V2_CONFIG.OPEN_THRESHOLD
    const n = rows.length
    const count = (f) => rows.filter(f).length
    const pctOf = (k) => (n ? +((k / n) * 100).toFixed(1) : null)

    // per-pair: how close does it get, split by whether macro was included that run
    const pairs = {}
    for (const r of rows) {
      for (const [p, v] of Object.entries(r.diffs || {})) {
        const d = typeof v === 'object' ? v.d : v, b = typeof v === 'object' ? v.b : null
        if (d == null) continue
        const e = pairs[p] || (pairs[p] = { runs: 0, full_runs: 0, redist_runs: 0, max_abs_diff: 0, hits: 0, full_hits: 0 })
        e.runs++
        if (b === 'FULL') e.full_runs++; else if (b === 'REDIST') e.redist_runs++
        e.max_abs_diff = Math.max(e.max_abs_diff, Math.abs(d))
        if (Math.abs(d) >= T) { e.hits++; if (b === 'FULL') e.full_hits++ }
      }
    }
    for (const e of Object.values(pairs)) {
      e.max_abs_diff = +e.max_abs_diff.toFixed(2)
      e.pct_runs_at_threshold = e.runs ? +((e.hits / e.runs) * 100).toFixed(1) : null
    }
    const spreads = rows.map((r) => r.spread).filter((x) => x != null).sort((a, b) => a - b)
    const mid = (a) => (a.length ? a[Math.floor(a.length / 2)] : null)

    res.json({
      success: true,
      window: { runs: n, first: rows[0]?.at ?? null, last: rows[n - 1]?.at ?? null, open_threshold: T },
      q1_do_full_pairs_reach_threshold: {
        runs_with_any_full_pair_at_threshold: count((r) => Object.values(r.diffs || {}).some((v) => v?.b === 'FULL' && Math.abs(v.d ?? 0) >= T)),
        pct: pctOf(count((r) => Object.values(r.diffs || {}).some((v) => v?.b === 'FULL' && Math.abs(v.d ?? 0) >= T))),
        per_pair: pairs,
        spread_bps: { n: spreads.length, min: spreads[0] ?? null, median: mid(spreads), max: spreads[spreads.length - 1] ?? null },
      },
      q2_regime_mix: {
        event_heavy: count((r) => r.regime === 'event-heavy'), quiet: count((r) => r.regime === 'quiet'),
        pct_quiet: pctOf(count((r) => r.regime === 'quiet')),
      },
      shadow_floor_6_9bps: { would_pass: count((r) => r.shadow_floor === 'WOULD_PASS'), would_block: count((r) => r.shadow_floor === 'WOULD_BLOCK') },
      live_floor_3bps: { passed: count((r) => r.floor === 'PASSED'), blocked: count((r) => r.floor === 'BLOCKED') },
      macro_status: { ok: count((r) => r.macro_status === 'OK'), floor_flat: count((r) => r.macro_status === 'FLOOR_FLAT'), insufficient: count((r) => r.macro_status === 'INSUFFICIENT') },
      xsection_histogram: rows.reduce((a, r) => ((a[r.xsection] = (a[r.xsection] || 0) + 1), a), {}),
      dropped_counts: rows.reduce((a, r) => { for (const c of r.dropped || []) a[c] = (a[c] || 0) + 1; return a }, {}),

      // Open RATE per basis, not a raw count. FULL and REDIST have different pair counts per run
      // (3 vs 4 while AUD is stale), so raw open totals are not comparable — the denominator is
      // pair-runs, i.e. how many chances each group actually had.
      q3_open_rate_by_basis: (() => {
        const g = { FULL: { pair_runs: 0, opens: 0 }, REDIST: { pair_runs: 0, opens: 0 } }
        for (const r of rows) {
          for (const v of Object.values(r.diffs || {})) if (g[v?.b]) g[v.b].pair_runs++
          for (const o of r.opens || []) {
            // Rows banked before opens carried their basis are strings ("PAIR:ACTION:DIR"). The basis
            // is still recoverable from the SAME run's diffs, so those opens are not lost.
            const pair = typeof o === 'string' ? o.split(':')[0] : o?.pair
            const basis = (typeof o === 'string' ? null : o?.basis) ?? r.diffs?.[pair]?.b
            if (g[basis]) g[basis].opens++
          }
        }
        for (const k of Object.keys(g)) {
          g[k].open_rate_pct = g[k].pair_runs ? +((g[k].opens / g[k].pair_runs) * 100).toFixed(2) : null
        }
        g.interpretation = 'If REDIST open_rate exceeds FULL, macro is shrinking the diff rather than sharpening it — that would put the regime weights in question, not just the bands.'
        return g
      })(),

      // Every bias that ended, with how it actually resolved. Too few samples to conclude anything
      // for a long while — recorded so the question is answerable later at all.
      q4_outcomes: (() => {
        const all = rows.flatMap((r) => (r.outcomes || []).map((o) => ({ at: r.at, ...o })))
        const by = (f) => all.filter(f).length
        return {
          n: all.length,
          by_reason: all.reduce((a, o) => ((a[o.closed_reason || o.ended_by] = (a[o.closed_reason || o.ended_by] || 0) + 1), a), {}),
          invalidation_hit: by((o) => o.closed_reason === 'level_break'),
          direction_ran: by((o) => (o.realized_pips ?? 0) > 0),
          went_against: by((o) => (o.realized_pips ?? 0) < 0),
          caveat: 'mfe/mae are as of the last HOLD refresh, so an excursion between runs is not captured.',
          list: all,
        }
      })(),

      // rows banked before opens became structured are strings — the ring buffer survives deploys
      // How long biases actually survive. A cluster of sub-24h exits is whipsaw, not signal.
      q5_flip_cadence: (() => {
        const all = rows.flatMap((r) => r.outcomes || [])
        const held = all.map((o) => o.held_hours).filter((h) => h != null).sort((a, b) => a - b)
        const under = (h) => held.filter((x) => x < h).length
        const pct = (k) => (held.length ? +((k / held.length) * 100).toFixed(1) : null)
        return {
          n: held.length,
          held_hours: {
            min: held[0] ?? null,
            median: held.length ? held[Math.floor(held.length / 2)] : null,
            max: held[held.length - 1] ?? null,
          },
          under_6h: under(6), pct_under_6h: pct(under(6)),
          under_24h: under(24), pct_under_24h: pct(under(24)),
          list: all.map((o) => ({ pair: o.pair, dir: o.direction, held_hours: o.held_hours, ended_by: o.ended_by, reason: o.closed_reason, realized_pips: o.realized_pips })),
        }
      })(),

      // Directional skew. A raw SELL count conflates opposite views — EURUSD SELL is USD-strong while
      // USDJPY SELL is USD-weak — so the meaningful figure is the IMPLIED USD direction. The macro
      // score aggregate below tests the same thing at the source: if a currency's cross-sectional
      // score is persistently one-signed, that is a cross-section problem, not a whipsaw problem.
      q6_direction_skew: (() => {
        const opens = rows.flatMap((r) => (r.opens || []).map((o) => {
          if (typeof o === 'string') { const [pair, action, direction] = o.split(':'); return { pair, action, direction } }
          return o
        })).filter((o) => o.pair && o.direction)
        const usdLeg = (pair, dir) => (pair.startsWith('USD') ? (dir === 'BUY' ? 'strong' : 'weak')
          : pair.endsWith('USD') ? (dir === 'BUY' ? 'weak' : 'strong') : null)
        const macro = {}
        for (const r of rows) {
          for (const [c, s] of Object.entries(r.macro_scores || {})) {
            if (s == null) continue
            const e = macro[c] || (macro[c] = { n: 0, sum: 0, pos: 0, neg: 0, zero: 0 })
            e.n++; e.sum += s
            if (s > 0) e.pos++; else if (s < 0) e.neg++; else e.zero++
          }
        }
        for (const e of Object.values(macro)) e.mean = +(e.sum / e.n).toFixed(2)
        return {
          raw: { SELL: opens.filter((o) => o.direction === 'SELL').length, BUY: opens.filter((o) => o.direction === 'BUY').length },
          implied_usd: {
            strong: opens.filter((o) => usdLeg(o.pair, o.direction) === 'strong').length,
            weak: opens.filter((o) => usdLeg(o.pair, o.direction) === 'weak').length,
          },
          macro_score_by_currency: macro,
          note: 'implied_usd is the diagnostic; `raw` mixes USD-base and USD-quote pairs and will look skewed even when USD views are balanced.',
        }
      })(),

      // WHICH COMPONENT DRIVES EACH PAIR. USDCAD and EURUSD have near-identical leg divergence
      // (4.30 vs 4.17bps mean gap in 3-session changes) yet 0% vs 43% threshold-hit rates, so the
      // difference is not coming from macro. This attributes every pair's diff to macro / orderflow
      // / sentiment, over all runs and again restricted to the runs that actually opened a bias.
      q7_component_attribution: (() => {
        const mk = () => ({ runs: 0, sum_abs: { m: 0, o: 0, s: 0 }, decisive: { m: 0, o: 0, s: 0, none: 0 } })
        const tally = (bucket, c) => {
          if (!c) return
          bucket.runs++
          for (const k of ['m', 'o', 's']) bucket.sum_abs[k] += Math.abs(c[k] ?? 0)
          const ranked = ['m', 'o', 's'].map((k) => [k, Math.abs(c[k] ?? 0)]).sort((a, b) => b[1] - a[1])
          if (ranked[0][1] === 0) bucket.decisive.none++
          else bucket.decisive[ranked[0][0]]++
        }
        const perPair = {}, onOpen = {}
        for (const r of rows) {
          for (const [p, v] of Object.entries(r.diffs || {})) tally(perPair[p] || (perPair[p] = mk()), v?.c)
          for (const o of r.opens || []) if (typeof o !== 'string' && o?.pair) tally(onOpen[o.pair] || (onOpen[o.pair] = mk()), o.contrib)
        }
        const finish = (obj) => {
          for (const e of Object.values(obj)) {
            e.mean_abs = Object.fromEntries(['m', 'o', 's'].map((k) => [k, e.runs ? +(e.sum_abs[k] / e.runs).toFixed(3) : null]))
            delete e.sum_abs
          }
          return obj
        }
        return {
          all_runs: finish(perPair),
          on_opens_only: finish(onOpen),
          legend: 'm=macro, o=orderflow, s=sentiment. mean_abs = average |contribution| to the diff; decisive = how often that component had the largest |contribution|.',
        }
      })(),

      opens: rows.flatMap((r) => (r.opens || []).map((o) => (typeof o === 'string' ? { at: r.at.slice(0, 16), raw: o } : { at: r.at.slice(0, 16), ...o }))),
      recent: rows.slice(-8),
    })
  } catch (e) { res.status(500).json({ success: false, error: e?.message }) }
})

// Read-only view of the exact yields payload the v2 scorer receives, plus the rolling US2Y session
// history the direction is built from. Public market data only — no keys, no user data. Exists so the
// 2Y 3-session direction and the per-leg FRED fill can be verified without tailing Railway logs.
app.get('/api/v2/shadow/yields', async (req, res) => {
  try {
    const y = await buildV2Feeds().getYields()
    res.json({ success: true, yields: y, y2_history: v2Yield2yHistory || [], sessions_needed: Y2_LOOKBACK_SESSIONS + 1 })
  } catch (e) { res.status(500).json({ success: false, error: e?.message }) }
})

app.listen(5000, () => {
  console.log('✅ Backend running on port 5000')
  loadSubscribers()
  loadTelegramSubscribers()
  loadTodayBiasState()
  loadChannelPostState()
  setInterval(checkAndSendCalendarAlerts, 5 * 60 * 1000)
  console.log('⏰ Calendar cron (5min)')
  setInterval(checkAndSendNewsAlerts, 10 * 60 * 1000)
  console.log('📰 News cron (10min)')
  // Step A health monitor — reads banked telemetry once a day, messages the ADMIN's personal chat
  // only when something is broken. Never posts to TG_CHANNEL. First check 10min after boot so a
  // restart-loop can't spam, then daily.
  setTimeout(() => { v2HealthCheck().catch(e => console.error('v2 health boot check error:', e?.message)) }, 10 * 60 * 1000)
  setInterval(() => { v2HealthCheck().catch(e => console.error('v2 health check error:', e?.message)) }, 24 * 60 * 60 * 1000)
  console.log(`🩺 v2 Step A health monitor (daily, admin DM ${process.env.TG_ADMIN_CHAT_ID ? 'configured' : 'NOT configured — will log only'})`)
  // Release-actuals sweeper. State lives in `release_actuals`, not in this timer, so a redeploy
  // cannot lose a release or re-run a search already paid for. First tick 2min after boot so a
  // restart picks up anything that came due while the process was down.
  setTimeout(() => { sweepReleaseActuals().catch(e => console.error('release-actuals boot sweep error:', e?.message)) }, 2 * 60 * 1000)
  setInterval(() => { sweepReleaseActuals().catch(e => console.error('release-actuals sweep error:', e?.message)) }, 15 * 60 * 1000)
  console.log(`🔎 Release-actuals sweeper (15min, ${Object.keys(SEARCHED_SERIES).join('/')}, admin DM ${process.env.TG_ADMIN_CHAT_ID ? 'configured' : 'NOT configured — will log only'})`)
  if (TG_API) { setInterval(pollTelegram, 3000); console.log('📱 Telegram bot polling (3s)') }
  else console.log('⚠️ No TELEGRAM_BOT_TOKEN — bot disabled')
  // 🔬 v2 shadow cron — OFF by default. Set V2_SHADOW_CRON=on (Railway env) to enable.
  if (process.env.V2_SHADOW_CRON === 'on') {
    const mins = parseInt(process.env.V2_SHADOW_INTERVAL_MIN || '120', 10)
    // setInterval ka pehla tick poore interval baad aata hai — har restart ~2h blind window chhodta
    // tha (aur us window mein dobara restart hua to run aur aage khisak jaata). Boot ke thodi der baad
    // ek run khud kick karo taake restart kabhi biases freeze na kare. 90s delay se v1 pehle shared
    // candle cache warm kar leta hai.
    setTimeout(() => { runV2Shadow('boot').catch(e => v2AdminAlert(e, 'v2 shadow run (boot)')) }, 90 * 1000)
    setInterval(() => { runV2Shadow('cron').catch(e => v2AdminAlert(e, 'v2 shadow run (cron)')) }, mins * 60 * 1000)
    // Market-open catch-up: fixed 2h tick weekly open se decoupled hai — Sunday 17:00 ET pe biases
    // ~2h tak frozen reh sakte the jab tak koi tick open-hours mein na aaye. Har 5min check karo aur
    // jaise hi market closed→open flip kare, EK run fire karo. runV2Shadow ka closed-gate abhi bhi
    // closed hours protect karta hai; ye sirf transition pe chalega.
    let v2PrevClosed = isForexClosed()
    setInterval(() => {
      const closedNow = isForexClosed()
      if (v2PrevClosed && !closedNow) {
        console.log('🔬 v2 shadow: market just opened (closed→open) — firing catch-up run')
        runV2Shadow('open').catch(e => v2AdminAlert(e, 'v2 shadow run (open)'))
      }
      v2PrevClosed = closedNow
    }, 5 * 60 * 1000)

    // ── INVALIDATION WATCHER (10min) ──
    // The main tick is 2h, so a level broken right after a tick used to sit live until the next one.
    // This watcher only READS — running non-FLAT rows vs the cached price — and on a breach fires a
    // FULL runV2Shadow so the engine decides CLOSE vs FLIP itself. It deliberately writes no state:
    // decide() owns that, and a second writer would race the engine mid-run.
    // Per-pair cooldown, same idea as TIER2_COOLDOWN: one breach can't re-run the engine every
    // 10min while price sits the wrong side of the level.
    const V2_INVAL_COOLDOWN = 30 * 60 * 1000
    const v2InvalFiredAt = new Map()   // pair → last trigger ms
    setInterval(async () => {
      try {
        if (!supabase || isForexClosed()) return
        const { data, error } = await supabase
          .from('bias_state_v2').select('pair, direction, invalidation_level')
          .eq('status', 'running').neq('direction', 'FLAT')
        if (error) { console.error(`⚠️ [v2 inval watch] read failed: ${error.message}`); return }
        const now = Date.now()
        // Cooldown BEFORE the spot fetch, so a pair already re-run costs no credits and doesn't
        // re-log every 10min. Nothing left to watch → no TwelveData call at all.
        const watch = (data || [])
          .filter(r => V2_CONFIG.PAIRS.includes(r.pair))
          .filter(r => now - (v2InvalFiredAt.get(r.pair) || 0) > V2_INVAL_COOLDOWN)
        if (!watch.length) return
        const spot = await v2FetchSpot(watch.map(r => r.pair))
        const hits = watch.filter(r => v2BreachedAtServeTime(r, '[v2 inval watch]', {
          action: 're-running engine',
          price: spot[r.pair] ?? null,   // absent → helper falls back to the candle cache
        }))
        if (!hits.length) return
        for (const r of hits) v2InvalFiredAt.set(r.pair, now)
        console.log(`🔬 [v2 inval watch] ${hits.map(r => r.pair).join(', ')} broke invalidation → runV2Shadow('invalidation')`)
        await runV2Shadow('invalidation')
      } catch (e) { v2AdminAlert(e, 'v2 invalidation watch') }
    }, 10 * 60 * 1000)

    console.log(`🔬 v2 shadow cron ON (every ${mins}min, +1 boot run + open catch-up + 10min invalidation watch → bias_state_v2 / bias_history_v2)`)
  } else {
    console.log('🔬 v2 shadow cron OFF (set V2_SHADOW_CRON=on to enable)')
  }
})