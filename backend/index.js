import 'dotenv/config'
import crypto from 'crypto'
import express from 'express'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import Anthropic from '@anthropic-ai/sdk'
import Parser from 'rss-parser'
import { Resend } from 'resend'
import { runEngine as runEngineV2, CONFIG as V2_CONFIG } from './biasEngineV2/biasEngine.js'

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
      if (status === 404) break // dead URL — retrying won't help
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

async function getEconomicCalendar() {
  if (isCacheFresh('ff_calendar')) return getCached('ff_calendar')
  // 1) PRIMARY: FMP (forward-looking, weekend-safe)
  const fmp = await fetchFMPCalendar()
  if (fmp && fmp.length) { setCache('ff_calendar', fmp); return fmp }
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
    return deduped
  } catch (err) {
    console.error('❌ Calendar fetch failed (FMP + FF):', err.message)
    const stale = getCached('ff_calendar')
    if (stale) { console.log('📦 Using stale calendar cache'); return stale }
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
  { id: 'powell', name: 'Jerome Powell', emoji: '🏦', kw: ['powell', 'federal reserve', 'fed chair', 'fomc', 'fed rate', 'fed policy'], assets: ['USD', 'Gold', 'Bonds'] },
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
    if (liveAssets.TLT) lines.push(`US Bonds proxy (TLT): ${liveAssets.TLT.price} (${liveAssets.TLT.change > 0 ? '+' : ''}${liveAssets.TLT.change}% intraday — NOTE: single-day TLT move is noise; trust FRED 2Y/10Y yields below for true rate direction, not this)`)
  }
  // ── US Treasury yields (FRED) — real-time USD rate-expectations driver ──
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
async function fetchCrossAssetLive() {
  if (isCacheFreshFor('cross_asset_live', 30 * 60 * 1000)) return getCached('cross_asset_live')
  const key = process.env.TWELVEDATA_API_KEY
  if (!key) return null
  try {
    const symbols = 'DXY,VIX,SPY,TLT,UUP,VIXY'
    await tdAcquire(String(symbols).split(',').length)
    const r = await axios.get(`https://api.twelvedata.com/quote?symbol=${symbols}&apikey=${key}`, { timeout: 10000 })
    const result = {}
    for (const sym of symbols.split(',')) {
      const d = r.data[sym] || r.data
      if (d && d.close && !d.code) {
        result[sym] = {
          price: parseFloat(d.close),
          change: parseFloat(d.percent_change || 0),
          prev: parseFloat(d.previous_close || d.close)
        }
      }
    }
    if (Object.keys(result).length > 0) {
      setCache('cross_asset_live', result)
      console.log(`📈 Cross-asset live: ${Object.keys(result).join(', ')}`)
      return result
    }
    // empty result — never overwrite a good cache; fall back to stale
    const staleEmpty = getCached('cross_asset_live')
    if (staleEmpty) { console.log('📈 Cross-asset empty — using stale cache'); return staleEmpty }
  } catch (e) {
    const stale = getCached('cross_asset_live')
    if (stale) { console.log(`📈 Cross-asset fetch failed (${e?.message}) — using stale cache`); return stale }
    console.log(`📈 Cross-asset fetch failed: ${e?.message} — using FX proxies`)
  }
  return null
}

// Fetch US Treasury yields (2yr + 10yr) from FRED — 6h cache. Real-time USD rate-expectations read.
async function fetchYields() {
  if (isCacheFreshFor('yields_fred', 6 * 60 * 60 * 1000)) return getCached('yields_fred')
  const key = process.env.FRED_API_KEY?.trim()
  if (!key) { console.warn('🏦 FRED: FRED_API_KEY not set in env'); return null }
  const getSeries = async (id) => {
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
  try {
    const [y2, y10] = await Promise.all([getSeries('DGS2'), getSeries('DGS10')])
    if (!y2 && !y10) { const stale = getCached('yields_fred'); if (stale) { console.log('🏦 Yields empty — using stale cache'); return stale } return null }
    const result = { y2, y10 }
    setCache('yields_fred', result)
    console.log(`🏦 Yields (FRED): 2yr ${y2?.value ?? 'n/a'}% · 10yr ${y10?.value ?? 'n/a'}%`)
    return result
  } catch (e) { const stale = getCached('yields_fred'); if (stale) { console.log(`🏦 Yields fetch failed (${e?.message}) — using stale cache`); return stale } console.log(`🏦 Yields fetch failed: ${e?.message}`); return null }
}

// Fetch latest US economic ACTUALS from FRED (free) — fills the surprise gap the FF feed lacks. 12h cache.
// 2-YEAR GOVERNMENT YIELDS — the primary FX driver (rate differentials). All three sources are free
// and daily. TwelveData carries no sovereign yield series, so each central bank is queried directly:
//   USD → FRED DGS2 | EUR → ECB AAA yield curve 2Y | CAD → Bank of Canada Valet (no key needed)
// We keep BOTH the level and the 1-day change; the CHANGE is what actually moves FX.
const RATE_TTL = 60 * 60 * 1000   // 1h — these are daily series, no need to hammer them
let lastGoodRates = null
async function fetchRateDifferentials() {
  const cached = getCached('rate_diffs_v2')
  if (isCacheFreshFor('rate_diffs_v2', RATE_TTL) && cached) return cached
  const pick = (rows) => rows.length >= 2
    ? { value: rows[0].v, change: +(rows[0].v - rows[1].v).toFixed(3), date: rows[0].d }
    : null
  const desc = (rows) => rows.sort((a, b) => (a.d < b.d ? 1 : -1))
  const out = {}
  // USD — FRED DGS2 (daily 2Y constant maturity). '.' marks a holiday/no-print day.
  try {
    const key = (process.env.FRED_API_KEY || '').trim()
    if (key) {
      const r = await axios.get('https://api.stlouisfed.org/fred/series/observations', {
        params: { series_id: 'DGS2', api_key: key, file_type: 'json', sort_order: 'desc', limit: 5 },
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
      params: { lastNObservations: 5, format: 'jsondata' }, timeout: 12000,
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
      params: { recent: 5 }, timeout: 12000,
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

  // JPY — Japan MoF daily JGB CSV (current calendar year), no key. Latin-1/Shift-JIS text with a
  // banner row before the real header, so we locate the 'Date,' header row and read the 2Y column.
  try {
    const r = await axios.get('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv', {
      timeout: 15000, responseType: 'arraybuffer',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    })
    const text = Buffer.from(r.data).toString('latin1')
    const lines = text.split(/\r?\n/)
    const hi = lines.findIndex(l => /^Date,/i.test(l))
    const col = hi >= 0 ? lines[hi].split(',').findIndex(h => h.trim() === '2Y') : -1
    if (col > 0) {
      const rows = lines.slice(hi + 1).map(l => {
        const c = l.split(','), m = (c[0] || '').trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
        if (!m) return null
        const v = parseFloat(c[col]); return isNaN(v) ? null : { d: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, v }
      }).filter(Boolean)
      out.JPY = pick(desc(rows))
    }
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

  // Per-currency last-good fallback so one flaky source never blanks the whole set.
  const merged = { ...out }
  if (lastGoodRates) for (const c of Object.keys(lastGoodRates)) { if (!merged[c] && lastGoodRates[c]) merged[c] = lastGoodRates[c] }
  const fresh = Object.keys(out).filter(c => out[c])
  if (fresh.length) { lastGoodRates = { ...(lastGoodRates || {}), ...Object.fromEntries(fresh.map(c => [c, out[c]])) }; setCache('rate_diffs_v2', merged) }
  console.log(`   [v2 rates] ${fresh.length}/6 fresh → ${Object.entries(merged).map(([c, r]) => `${c}=${r.value}(${r.change >= 0 ? '+' : ''}${r.change})`).join(' ')}`)
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

app.post('/api/bias', aiRateLimiter, async (req, res) => {
  const { symbol, timeframe } = req.body
  if (!symbol) return res.status(400).json({ error: 'Symbol required' })
  try {
    const wasCached = isCacheFresh(`bias_${symbol}_${timeframe || 'intraday'}`)
    const bias = await generateBiasFor(symbol, timeframe)
    res.json({ success: true, bias, cached: wasCached })
  } catch (e) {
    console.error('Bias error:', e?.message)
    res.status(500).json({ success: false, error: e?.message || 'AI analysis failed.' })
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
async function getV2HeadlineBias() {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('bias_state_v2')
    .select('*')
    .eq('status', 'running')
    .neq('direction', 'FLAT')
  if (error) { console.error(`⚠️ [v2 headline] read failed: ${error.message}`); return null }

  // V2_CONFIG.PAIRS is the engine's own enabled list (already excludes gold while V2_GOLD_ENABLED is
  // false) — filtering on it here means a disabled pair can never surface from a stale row.
  let rows = (data || []).filter(r => V2_CONFIG.PAIRS.includes(r.pair))
  if (!rows.length) { console.log('   [v2 headline] no running bias — nothing to surface'); return null }

  const strong = rows.filter(r => Math.abs(r.diff_at_entry ?? 0) >= V2_CONFIG.OPEN_THRESHOLD)
  const pool = strong.length ? strong : rows
  pool.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || Math.abs(b.diff_at_entry ?? 0) - Math.abs(a.diff_at_entry ?? 0))
  const top = pool[0]

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

  // ── ENGINE SWITCH: BIAS_ENGINE=v2 serves the headline bias from the v2 engine instead of running
  // v1's own selection + generation. v1 stays intact as the fallback: if v2 has nothing running
  // (fresh DB, all FLAT, or a read error) we fall through and compute the v1 bias as before.
  if (process.env.BIAS_ENGINE === 'v2') {
    try {
      const v2 = await getV2HeadlineBias()
      if (v2) return publishTodayBias(v2)
      console.log('   [v2 headline] empty — falling back to v1 for this cycle')
    } catch (e) {
      console.error(`⚠️ [v2 headline] failed, falling back to v1: ${e?.message}`)
    }
  }

  const day = utcDay()

  // ── LOCK-ONLY REFRESH: if pair is locked today and this is NOT a session open, just refresh reasoning ──
  let top
  let candidates = null // populated only on the FULL RE-PICK path — read by the exhaustion switch below
  let room = {}
  if (todayBiasLock?.date === day && !sessionOpen) {
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

// Save a Today's Bias snapshot to history whenever it changes
async function saveBiasHistory(result, previousKey) {
  try {
    const { error } = await supabase.from('bias_history').insert({
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

// 📜 Bias History — timeline of all Today's Bias changes (default: last 7 days, max 30)
app.get('/api/bias-history', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 30)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('bias_history')
      .select('*')
      .gte('generated_at', since)
      .order('generated_at', { ascending: false })
      .limit(100)
    if (error) throw error
    res.json({ success: true, history: data || [], days })
  } catch (e) {
    console.error('bias-history error:', e?.message)
    res.json({ success: true, history: [], error: 'history unavailable' })
  }
})

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
    const days = Math.min(parseInt(req.query.days) || 14, 30)
    const cacheKey = `bias_performance_${days}`
    if (isCacheFresh(cacheKey)) return res.json(getCached(cacheKey))
    const since = new Date(Date.now() - days * 86400 * 1000).toISOString()
    const { data: rows, error } = await supabase
      .from('bias_history').select('*')
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
    const active = rows.filter(r => r.status === 'running' && r.direction !== 'FLAT')

    // Same hybrid rule as the headline pair: prefer setups that cleared the open threshold,
    // then rank by confidence (which already accounts for entry timing).
    const strong = active.filter(r => Math.abs(r.diff_at_entry ?? 0) >= V2_CONFIG.OPEN_THRESHOLD)
    const pool = strong.length ? strong : active
    const headline = pool.length
      ? [...pool].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || Math.abs(b.diff_at_entry ?? 0) - Math.abs(a.diff_at_entry ?? 0))[0].pair
      : null

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
    })

    // Active pairs first (strongest conviction leading), then anything currently flat/closed.
    const activeOut = active
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .map(shape)
    const flatOut = rows.filter(r => !active.includes(r)).map(shape)

    res.json({
      success: true,
      engine: 'v2',
      headline,
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
      pay_currency: null, // customer picks BTC / USDT / USDC on the NOWPayments page
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
    const result={success:true,currencies:sorted,bestPairs:bp,marketClosed:allZ,updatedAt:new Date().toISOString()};if(!allZ){if(bp[0])notifyBiasChange(bp[0]);setCache('strength',result)}res.json(result)
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

// LIVE real-yield DIRECTION. FRED yields carry accurate LEVELS but publish 1-2 days late (govt lag),
// so they cannot convey TODAY's direction. TLT (20y+ treasury ETF) moves inverse to long yields in
// real time; UUP (dollar ETF) confirms. Requiring TLT+UUP AGREEMENT filters TLT's single-day noise —
// a lone TLT tick is noise, but TLT-down + USD-up together is a real gold-negative signal.
async function liveYieldDirection() {
  const x = await fetchCrossAssetLive()   // { DXY, VIX, SPY, TLT, UUP, VIXY } from TwelveData
  const tlt = x?.TLT, uup = x?.UUP
  if (!tlt || tlt.price == null) return null
  // Magnitude gate: moves smaller than this are noise, not signal. Without it a 0.03% TLT tick
  // was scoring 'high' confidence and driving a directional call off nothing.
  const MIN_MOVE_PCT = 0.15
  const sig = v => (v == null || Math.abs(v) < MIN_MOVE_PCT) ? 0 : (v > 0 ? 1 : -1)
  // express both in GOLD-POSITIVE space: +1 = gold-positive, -1 = gold-negative
  const tltDir = sig(tlt.change)          // TLT up = long yields DOWN = gold+
  const uupDir = -sig(uup?.change)        // USD (UUP) up = gold-
  const agree = tltDir !== 0 && tltDir === uupDir
  let real_yield_direction, direction_confidence
  if (agree && tltDir > 0)       { real_yield_direction = 'falling yields + soft USD → gold-positive'; direction_confidence = 'high' }
  else if (agree && tltDir < 0)  { real_yield_direction = 'rising yields + firm USD → gold-negative';  direction_confidence = 'high' }
  else if (tltDir < 0 || uupDir < 0) { real_yield_direction = 'leaning gold-negative (rising yields or firm USD)'; direction_confidence = 'mixed' }
  else if (tltDir > 0 || uupDir > 0) { real_yield_direction = 'leaning gold-positive (falling yields or soft USD)'; direction_confidence = 'mixed' }
  else                           { real_yield_direction = 'flat / conflicting'; direction_confidence = 'low' }
  return {
    source: 'TLT+UUP (live)', real_yield_direction, direction_confidence,
    tlt_change_pct: tlt.change, uup_change_pct: uup?.change ?? null,
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
      return n.filter(a => (a.impact || 0) >= 7).map(a => `[${a.category || a.source}] ${a.title}${a.oneliner ? ' — ' + a.oneliner : ''}`)
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
      // Primary: FRED US2Y/US10Y. FRED is flaky, so on failure fall back to a TLT proxy from the
      // (working, cached, rate-limited) cross-asset feed. Keep a last-good snapshot either way.
      let y = null, src = null
      try { y = await fetchYields() } catch (e) {}

      // FRED gives accurate LEVELS but lags 1-2 days, so it cannot convey TODAY's direction.
      // Always derive DIRECTION from the live TLT+UUP feed and attach it; keep FRED's level for
      // context and flag staleness so the scorer trusts the live direction over the stale day-change.
      let live = null
      try { live = await liveYieldDirection() } catch (e) {}
      const fredDate = y?.y2?.date || y?.y10?.date || null
      const fredAgeDays = fredDate ? Math.floor((Date.now() - new Date(fredDate + 'T00:00:00Z').getTime()) / 86400000) : null
      const fredStale = (fredAgeDays == null) ? true : (fredAgeDays >= 1)

      if (y && (y.y2?.value != null || y.y10?.value != null)) {
        src = live ? 'FRED-level + live-dir' : 'FRED'
        y = {
          ...y,
          fred_date: fredDate,
          fred_stale: fredStale,
          real_yield_direction: live?.real_yield_direction ?? '(FRED day-change only — may be 1-2 days stale)',
          direction_source: live?.source ?? 'FRED (stale)',
          direction_confidence: live?.direction_confidence ?? 'low',
          tlt_change_pct: live?.tlt_change_pct ?? null,
          uup_change_pct: live?.uup_change_pct ?? null,
        }
      } else if (live) {
        src = 'live-dir'
        y = live
      }

      if (src) {
        v2LastGoodYields = y
        console.log(`   [v2 yields] fresh (${src}) ${JSON.stringify(y)}`)
        return y
      }
      if (v2LastGoodYields) { console.warn(`   [v2 yields] cache ${JSON.stringify(v2LastGoodYields)} (fetch empty)`); return v2LastGoodYields }
      console.warn('   [v2 yields] none (no FRED, no TLT, no snapshot yet)')
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
      const { price, adrUsedPct, adr } = v2AdrFromDaily(pair, dvals)
      if (price == null) { console.log(`   [v2 mkt] ${pair}: SKIP bad_price`); return null }

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
      const buf = V2_CONFIG.INVALIDATION_ATR_BUFFER * adr   // 0.2 × daily ATR cushion
      const invBuy = pdl != null ? (pdl - buf).toFixed(dp) : 'n/a'
      const invSell = pdh != null ? (pdh + buf).toFixed(dp) : 'n/a'
      console.log(`   [v2 mkt] ${pair}: price=${price.toFixed(dp)} PDL=${pdl != null ? pdl.toFixed(dp) : 'n/a'} PDH=${pdh != null ? pdh.toFixed(dp) : 'n/a'} | inval BUY=${invBuy} SELL=${invSell} (buf=${buf.toFixed(dp)}) adrUsed=${Math.round(adrUsedPct * 100)}% [${atrSrc}]`)
      return { price, atr, adr, pdh, pdl, adrUsedPct, isHighAtrWeek }
    },
    // updateRunning intentionally omitted in shadow — running MFE/MAE stats not tracked yet
  }
}

async function runV2Shadow(trigger) {
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
  return out
}

// Manual trigger — inspect a full v2 run on demand. Does not affect the live dashboard.
app.post('/api/v2/shadow/run', async (req, res) => {
  try { const out = await runV2Shadow('manual'); res.json({ success: true, pairs: V2_CONFIG.PAIRS.length, ...out }) }
  catch (e) { console.error('v2 shadow run error:', e?.message); res.status(500).json({ success: false, error: e?.message }) }
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
  if (TG_API) { setInterval(pollTelegram, 3000); console.log('📱 Telegram bot polling (3s)') }
  else console.log('⚠️ No TELEGRAM_BOT_TOKEN — bot disabled')
  // 🔬 v2 shadow cron — OFF by default. Set V2_SHADOW_CRON=on (Railway env) to enable.
  if (process.env.V2_SHADOW_CRON === 'on') {
    const mins = parseInt(process.env.V2_SHADOW_INTERVAL_MIN || '30', 10)
    setInterval(() => { runV2Shadow('cron').catch(e => console.error('v2 shadow cron error:', e?.message)) }, mins * 60 * 1000)
    console.log(`🔬 v2 shadow cron ON (every ${mins}min → bias_state_v2 / bias_history_v2)`)
  } else {
    console.log('🔬 v2 shadow cron OFF (set V2_SHADOW_CRON=on to enable)')
  }
})