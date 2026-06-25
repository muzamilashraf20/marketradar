import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import Anthropic from '@anthropic-ai/sdk'
import Parser from 'rss-parser'
import { Resend } from 'resend'

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
  try { const r = await axios.get(`https://api.twelvedata.com/price?symbol=EUR/USD,GBP/USD,USD/JPY,XAU/USD,BTC/USD&apikey=${process.env.TWELVEDATA_API_KEY}`); if (r.data?.code === 429) { if (stale) return res.json(stale); return res.json({ success: true, data: r.data }) }; const result = { success: true, data: r.data }; setCache('prices', result); res.json(result) } catch (e) { if (stale) return res.json(stale); res.status(500).json({ error: 'Price fetch failed' }) }
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
async function getPairRoomBatch(candidates) {
  const tdSymbols = [...new Set(candidates.map(c => ROOM_SYMBOL_MAP[c.symbol]).filter(Boolean))]
  if (!tdSymbols.length) return {}
  // 12-min cache keyed by the set of symbols — daily ADR barely moves intraday, saves heavy TwelveData calls (429 fix)
  const roomCacheKey = `room_${tdSymbols.slice().sort().join('_')}`
  if (isCacheFreshFor(roomCacheKey, 12 * 60 * 1000)) return getCached(roomCacheKey)
  try {
    const r = await axios.get('https://api.twelvedata.com/time_series', {
      params: { symbol: tdSymbols.join(','), interval: '1day', outputsize: 15, apikey: process.env.TWELVEDATA_API_KEY }
    })
    if (r.data?.code === 429) { const st = getCached(roomCacheKey); if (st) return st }
    const out = {}
    for (const c of candidates) {
      const td = ROOM_SYMBOL_MAP[c.symbol]
      if (!td) continue
      const d = tdSymbols.length === 1 ? r.data : r.data?.[td]
      const vals = d?.values
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
    setCache(roomCacheKey, out)
    return out
  } catch (e) { console.error('⚠️ Pair room batch failed:', e?.message); const st = getCached(roomCacheKey); return st || {} }
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

// Fetch real cross-asset data (DXY, VIX, SPY, TLT) from TwelveData — 30min cache
async function fetchCrossAssetLive() {
  if (isCacheFreshFor('cross_asset_live', 30 * 60 * 1000)) return getCached('cross_asset_live')
  const key = process.env.TWELVEDATA_API_KEY
  if (!key) return null
  try {
    const symbols = 'DXY,VIX,SPY,TLT'
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
  } catch (e) { console.log(`📈 Cross-asset fetch failed: ${e?.message} — using FX proxies`) }
  return null
}

// Fetch US Treasury yields (2yr + 10yr) from FRED — 6h cache. Real-time USD rate-expectations read.
async function fetchYields() {
  if (isCacheFreshFor('yields_fred', 6 * 60 * 60 * 1000)) return getCached('yields_fred')
  const key = process.env.FRED_API_KEY
  if (!key) return null
  const getSeries = async (id) => {
    try {
      const r = await axios.get(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=8`, { timeout: 10000 })
      const vals = (r.data?.observations || [])
        .map(o => ({ date: o.date, v: parseFloat(o.value) }))
        .filter(o => !isNaN(o.v))   // FRED uses "." for holidays / missing days
      if (!vals.length) return null
      const latest = vals[0], prev = vals[1] || vals[0]
      return { value: latest.v, change: +(latest.v - prev.v).toFixed(2), date: latest.date } // change in percentage points
    } catch (e) { return null }
  }
  try {
    const [y2, y10] = await Promise.all([getSeries('DGS2'), getSeries('DGS10')])
    if (!y2 && !y10) return null
    const result = { y2, y10 }
    setCache('yields_fred', result)
    console.log(`🏦 Yields (FRED): 2yr ${y2?.value ?? 'n/a'}% · 10yr ${y10?.value ?? 'n/a'}%`)
    return result
  } catch (e) { console.log(`🏦 Yields fetch failed: ${e?.message}`); return null }
}

// Fetch latest US economic ACTUALS from FRED (free) — fills the surprise gap the FF feed lacks. 12h cache.
async function fetchUSActuals() {
  if (isCacheFreshFor('us_actuals_fred', 12 * 60 * 60 * 1000)) return getCached('us_actuals_fred')
  const key = process.env.FRED_API_KEY
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
    system: 'You are an elite macro fundamental strategist for BiasForge.ai. You generate trading bias from economic data, central bank policy, COT positioning, news catalysts, and cross-asset context — NEVER from technical indicators or currency strength scores. Return ONLY valid JSON.',
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
        return `${e.event} (${e.country}) ${rel} [${e.time}] - Impact: HIGH`
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

11. SIGNAL WEIGHTING (intraday direction): Lead with FRESH signals — breaking news, today's CROSS-ASSET flows (DXY, risk-on/off via VIX/SPY), and the US 2Y yield move (rising 2Y = USD-supportive, falling = USD-negative). These drive TODAY'S direction. The US ECONOMIC ACTUALS set the macro backdrop (is inflation hot? labor tight?) and shape conviction. COT is the LAGGING confirm only (per rule 10). If COT conflicts with fresh cross-asset/yield flows, TRUST THE FRESH FLOWS for intraday direction and lower conviction rather than siding with stale positioning.`

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

// Compute Today's AI Bias for the strongest pair, cache it, and alert on direction change.
// force=true bypasses the per-symbol cache (used on breaking-news catalysts)
// sessionOpen=true allows full pair re-pick (used ONLY at session opens: Sydney/Tokyo/London/NY)
// Without sessionOpen, a locked pair is KEPT and only its reasoning/confidence is refreshed.
async function computeTodaysAIBias(force = false, sessionOpen = false) {
  if (isForexClosed()) return null

  const day = utcDay()

  // ── LOCK-ONLY REFRESH: if pair is locked today and this is NOT a session open, just refresh reasoning ──
  let top
  if (todayBiasLock?.date === day && !sessionOpen) {
    console.log(`🔒 LOCK-ONLY PATH: pair=${todayBiasLock.pair} (${todayBiasLock.selectedBy || 'formula'}), lockDate=${todayBiasLock.date}, today=${day}, sessionOpen=${sessionOpen}, force=${force}`)
    // Skip all ranking/scoring — go straight to generateBiasFor on the locked pair
    top = { symbol: todayBiasLock.symbol, pair: todayBiasLock.pair }
    // Still fetch room data for the locked pair so potentialNote is accurate
    let room = {}; try { room = await getPairRoomBatch([top]) } catch (e) {}
    const r = room[top.symbol]
    top.roomScore = r ? r.roomScore : null
    top.adrPips = r ? r.adrPips : null
    top.potential = null // not re-scored, just refreshed
    console.log(`🎯 Today's pair (locked): ${top.pair}`)
  } else {
    // ── FULL RE-PICK (FUNDAMENTAL-DRIVEN): session open or first bias of the day ──
    console.log(`🔄 FULL RE-PICK (fundamentals): sessionOpen=${sessionOpen}, lock=${todayBiasLock?.pair || 'none'}, lockDate=${todayBiasLock?.date || 'none'}, today=${day}`)

    // Fixed candidate list — all major pairs + gold
    const candidates = BIAS_CANDIDATES

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
    let room = {}
    try { room = await getPairRoomBatch(candidates) } catch (e) {
      console.log(`⚠️ Room batch failed (${e?.message}) — retrying in 3s...`)
      await new Promise(r => setTimeout(r, 3000))
      try { room = await getPairRoomBatch(candidates) } catch (e2) { console.log(`⚠️ Room retry also failed — AI will work without room data`) }
    }

    // ── 5. CROSS-ASSET CONTEXT (real data + FX proxies) ──
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

  // 📢 Public channel broadcast — only post decent-conviction biases (Grade C or better), skip weak D/N
  try {
    const grade = (result.tradeGrade || '').toUpperCase()
    const postable = ['A+', 'A', 'B', 'C'].includes(grade)
    if (postable) {
      const arrow = dirUp.includes('BULL') || dirUp.includes('BUY') ? '🟢' : dirUp.includes('BEAR') || dirUp.includes('SELL') ? '🔴' : '⚪'
      const inval = result.bias?.levels?.invalidation && result.bias.levels.invalidation !== 'N/A' ? `\n⚠️ Invalidation: <b>${result.bias.levels.invalidation}</b>` : ''
      const channelMsg = `${arrow} <b>${dirUp} ${result.pair}</b>\\n` +
        `Confidence: <b>${result.confidence}%</b> · Grade <b>${result.tradeGrade}</b>\\n\\n` +
        `🧠 ${result.reasoning}${inval}\\n\\n` +
        `Direction only — you manage your entries.\\n` +
        `🧭 Full tool: biasforge.co`
      sendTG(TG_CHANNEL, channelMsg).catch(() => {})
    }
  } catch (e) { console.error('Channel post error:', e?.message) }

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

    // Win/loss verdict ONLY from closed 24h windows (final). Live biases show running pips but don't affect win rate.
    const final = results.filter(r => r.performance && r.performance.status === 'final')
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
      avgMaePips: avg(withPips, 'maePips')
    }
    const payload = { success: true, days, summary, history: results }
    setCache(cacheKey, payload)
    res.json(payload)
  } catch (e) {
    console.error('bias-performance error:', e?.message)
    res.status(500).json({ success: false, error: e?.message || 'performance unavailable' })
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

    res.json({
      success: true,
      plan: {
        tier: plan?.tier || 'free',
        trialStart: plan?.trial_start,
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
// Reusable COT fetcher (cached 6h — CFTC data updates weekly on Fridays)
async function getCOTData() {
  if (isCacheFreshFor('cot_data', 6 * 60 * 60 * 1000)) return getCached('cot_data')
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
  {
    // ── Fetch 1: Financial instruments (currencies) ──
    const finUrl = 'https://publicreporting.cftc.gov/resource/gpe5-46if.json?' +
                   '%24order=report_date_as_yyyy_mm_dd%20DESC&%24limit=500'
    const finRes = await fetch(finUrl, { headers: { 'Accept': 'application/json', 'User-Agent': 'BiasForge/1.0' } })

    if (finRes.ok) {
      const finRows = await finRes.json()
      if (finRows?.length) {
        reportDate = finRows[0]?.report_date_as_yyyy_mm_dd?.split('T')[0] || ''
        const latest = finRows.filter(r => (r.report_date_as_yyyy_mm_dd || '').startsWith(reportDate.slice(0, 10)))

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
   const comUrl = 'https://publicreporting.cftc.gov/resource/72hh-3qpy.json?' +
               '%24order=report_date_as_yyyy_mm_dd%20DESC&%24limit=50&' +
               '%24where=commodity_name%20in(%27GOLD%27,%27SILVER%27,)'
    const comRes = await fetch(comUrl, { headers: { 'Accept': 'application/json', 'User-Agent': 'BiasForge/1.0' } })

    if (comRes.ok) {
      const comRows = await comRes.json()
      if (comRows?.length) {
        const comDate = comRows[0]?.report_date_as_yyyy_mm_dd?.split('T')[0] || ''
        if (!reportDate) reportDate = comDate
        const comLatest = comRows.filter(r => (r.report_date_as_yyyy_mm_dd || '').startsWith(comDate.slice(0, 10)))

        for (const row of comLatest) {
          const mn = (row.contract_market_name || '').toUpperCase().trim()

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

    const payload = { data: results, reportDate }
    setCache('cot_data', payload)
    return payload
  }
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
app.listen(5000, () => {
  console.log('✅ Backend running on port 5000')
  loadSubscribers()
  loadTelegramSubscribers()
  loadTodayBiasState()
  setInterval(checkAndSendCalendarAlerts, 5 * 60 * 1000)
  console.log('⏰ Calendar cron (5min)')
  setInterval(checkAndSendNewsAlerts, 10 * 60 * 1000)
  console.log('📰 News cron (10min)')
  if (TG_API) { setInterval(pollTelegram, 3000); console.log('📱 Telegram bot polling (3s)') }
  else console.log('⚠️ No TELEGRAM_BOT_TOKEN — bot disabled')
})