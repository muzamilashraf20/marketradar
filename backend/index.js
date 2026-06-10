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
async function getEconomicCalendar() {
  if (isCacheFresh('ff_calendar')) return getCached('ff_calendar')
  const urls = ['https://nfs.faireconomy.media/ff_calendar_thisweek.json', 'https://nfs.faireconomy.media/ff_calendar_nextweek.json']
  try {
    const results = await Promise.allSettled(urls.map(u => fetch(u, { headers: FF_HEADERS }).then(r => r.ok ? r.json() : Promise.reject(new Error('FF ' + r.status)))))
    const raw = []
    for (const r of results) if (r.status === 'fulfilled' && Array.isArray(r.value)) raw.push(...r.value)
    if (raw.length === 0) throw new Error('FF calendar empty')
    const norm = raw.filter(e => e.date).map(e => ({ event: e.title || 'Event', country: (e.country || 'N/A').toUpperCase(), time: new Date(e.date).toISOString(), impact: e.impact || 'Low', forecast: e.forecast || '', previous: e.previous || '' }))
    setCache('ff_calendar', norm)
    return norm
  } catch (err) {
    console.error('❌ FF calendar fetch failed:', err.message)
    const stale = getCached('ff_calendar')
    if (stale) { console.log('📦 Using stale FF calendar cache'); return stale }
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

async function checkAndSendNewsAlerts() {
  const eSubs = emailSubscribers.filter(s => s.active && s.preferences?.news !== false)
  const tSubs = telegramSubscribers.filter(s => s.active && s.preferences?.news !== false)
  if (eSubs.length === 0 && tSubs.length === 0) return
  try {
    const cached = getCached('latest_news')
    if (!cached) return
    const hi = cached.filter(a => a.impact >= 8 && !sentNewsAlerts.has(a.title))
    if (hi.length === 0) return

    const items = hi.slice(0, 3).map(a => ({ title: a.title, subtitle: `${a.source} · Impact: ${a.impact}/10`, badge: 'BREAKING', badgeColor: '#ef4444' }))
    const html = buildAlertEmail({ type: 'news', title: `🚨 ${hi.length} High Impact News`, greeting: 'Breaking!', items })
    for (const s of eSubs) await sendAlertEmail(s.email, `🚨 BiasForge: ${hi[0].title.slice(0, 50)}...`, html)

    const tgTxt = tgNewsAlert(hi)
    for (const s of tSubs) await sendTG(s.chat_id, tgTxt)

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
app.post('/api/ai', async (req, res) => {
  const { prompt, system } = req.body; if (!prompt) return res.status(400).json({ error: 'Prompt required' })
  try { const m = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 4096, system: system || 'You are a financial markets analyst for BiasForge.', messages: [{ role: 'user', content: prompt }] }); res.json({ success: true, response: m.content[0].text }) } catch (e) { console.error('AI error:', e?.message || e); res.status(500).json({ error: e?.message || 'AI failed' }) }
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

// Reusable AI bias generator — used by both the /api/bias route and the Today's Bias scheduler.
// Returns the bias object (cached for CACHE_TTL per symbol+timeframe). Throws on AI/parse failure.
async function generateBiasFor(symbol, timeframe) {
  const tf = timeframe || 'intraday'
  const cacheKey = `bias_${symbol}_${tf}`
  if (isCacheFresh(cacheKey)) return getCached(cacheKey)

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

  // 2. Get currency strength (live if cache cold and market open)
  let strengthData = ''
  try {
    const strength = await getLiveStrength()
    if (strength?.currencies) {
      strengthData = strength.currencies.map(c => `${c.currency}: ${c.strength}/100 (${c.label})`).join(', ')
    } else if (isForexClosed()) {
      strengthData = 'Forex market is currently closed (weekend) — no live currency strength available.'
    }
  } catch (e) {}

  // 3. Get upcoming calendar events (3 days ahead)
  let calendarData = 'No upcoming events'
  try {
    const now = new Date()
    const ahead = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    const events = (await getEconomicCalendar())
      .filter(e => e.impact?.toLowerCase?.() === 'high' && new Date(e.time) > now && new Date(e.time) < ahead)
      .slice(0, 8)
      .map(e => `${e.event} (${e.country}) at ${e.time || 'TBD'} - Impact: HIGH`)
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
    "entry": "specific price or range",
    "target1": "specific price",
    "target2": "specific price",
    "stopLoss": "specific price",
    "invalidation": "specific price where this entire bias is WRONG"
  },
  "invalidationNote": "1 sentence: what happens if invalidation level is hit",
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

2. INVALIDATION LEVEL: This is the MOST important field. It must be a specific price where the bias is completely wrong. For ${tf}:
   - Intraday: within 30-80 pips of entry for forex, proportional for gold/indices
   - Swing: within 100-200 pips of entry for forex

3. TRADE GRADE: A+ = perfect alignment all sources. A = strong. B = decent. C = marginal. D = don't trade.

4. All prices must be REAL numbers relative to current price ${currentPrice}. Never use placeholder text. IF THE CURRENT PRICE IS "unknown": do NOT estimate or invent any price levels from memory — set every field inside "levels" and the invalidation to the string "N/A" and focus only on direction, confidence, and reasoning.

5. Return ONLY valid JSON. No markdown, no explanation outside JSON.`

  const userPrompt = `Analyze ${symbol} (${baseCur}/${quoteCur}) for ${tf} bias.

CURRENT LIVE PRICE: ${currentPrice}
TIMESTAMP: ${new Date().toISOString()}

CURRENCY STRENGTH DATA:
${strengthData || 'Not available'}

UPCOMING HIGH-IMPACT EVENTS (next 3 days):
${calendarData}

RECENT HIGH-IMPACT NEWS:
${newsData}

Combine ALL data sources above for your analysis. Return JSON matching this structure:
${template}`

  const m = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  })
  const raw = m.content[0].text.trim().replace(/```json|```/g, '').trim()
  const bias = JSON.parse(raw)
  bias.generatedAt = new Date().toISOString()
  // HARD GUARD: if live price was unavailable, never ship AI-guessed levels — suppress them.
  if (currentPrice === 'unknown') {
    bias.levels = { currentPrice: 'N/A', entry: 'N/A', target1: 'N/A', target2: 'N/A', stopLoss: 'N/A', invalidation: 'N/A' }
    bias.invalidationNote = 'Live price feed temporarily unavailable — exact levels suppressed to avoid inaccurate figures. Direction & reasoning are based on live strength, calendar, and news data.'
    if (bias.tradeGrade === 'A+' || bias.tradeGrade === 'A') bias.tradeGrade = 'B'
  }
  bias.dataSources = {
    price: currentPrice !== 'unknown',
    strength: !!strengthData,
    calendar: calendarData !== 'No upcoming events',
    news: newsData !== 'No recent high-impact news'
  }
  setCache(cacheKey, bias)
  return bias
}

app.post('/api/bias', async (req, res) => {
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

// Pick the strongest OANDA-tradeable pair from live currency strength divergence
function pickTopOandaPair(strength) {
  if (!strength?.currencies?.length) return null
  const str = {}; strength.currencies.forEach(c => { str[c.currency] = c.strength })
  const oandaPairs = [['EUR','USD'],['GBP','USD'],['USD','JPY'],['AUD','USD'],['USD','CAD'],['USD','CHF'],['NZD','USD'],['EUR','GBP'],['EUR','JPY'],['GBP','JPY'],['AUD','JPY']]
  let best = null, bestDiff = 0
  for (const [b, q] of oandaPairs) {
    if (str[b] === undefined || str[q] === undefined) continue
    const diff = str[b] - str[q]
    if (Math.abs(diff) > bestDiff) {
      bestDiff = Math.abs(diff)
      best = { symbol: `${b}${q}`, pair: `${b}${q}`, action: diff > 0 ? 'BUY' : 'SELL', diff: Math.abs(diff) }
    }
  }
  return best
}

// Compute Today's AI Bias for the strongest pair, cache it, and alert on direction change.
async function computeTodaysAIBias() {
  if (isForexClosed()) return null
  const strength = await getLiveStrength()
  const top = pickTopOandaPair(strength)
  if (!top) return null

  let bias
  try {
    bias = await generateBiasFor(top.symbol, 'intraday')
  } catch (e) { console.error('Today bias gen error:', e?.message); return getCached('today_bias') || null }

  const result = {
    symbol: top.symbol,
    pair: top.pair,
    direction: bias.direction || 'Neutral',
    confidence: bias.confidence || 0,
    tradeGrade: bias.tradeGrade || '-',
    reasoning: bias.reasoning || '',
    bias, // full object for the dashboard widget
    updatedAt: new Date().toISOString(),
  }
  setCache('today_bias', result)

  // Change detection → alert subscribers (skip the very first computation)
  const newKey = `${result.direction} ${result.pair}`.toUpperCase()
  if (lastTodaysBiasKey && newKey !== lastTodaysBiasKey) {
    notifyTodaysBiasChange(result, lastTodaysBiasKey).catch(() => {})
  }
  lastTodaysBiasKey = newKey
  return result
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
app.get('/api/today-bias', async (req, res) => {
  try {
    if (isForexClosed()) {
      return res.json({ success: true, marketClosed: true, reason: 'Forex market closed (weekend)', bias: getCached('today_bias') || null })
    }
    if (isCacheFreshFor('today_bias', TODAY_BIAS_TTL)) {
      return res.json({ success: true, ...getCached('today_bias'), cached: true })
    }
    const result = await computeTodaysAIBias()
    if (!result) return res.json({ success: true, bias: null, reason: 'No strong pair available right now' })
    res.json({ success: true, ...result })
  } catch (e) {
    console.error('today-bias error:', e?.message)
    res.json({ success: true, bias: getCached('today_bias') || null, error: 'compute failed' })
  }
})

// ============================================
// 🚀 PRE-TRADE GUARDIAN
// ============================================
app.post('/api/trade-check', async (req, res) => {
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
    if (useAI) { try { const ctx=`TRADE:${direction} ${lotSize}lots ${symbol} SL${stopLossPips}\nRISK:$${estRisk$.toFixed(2)}(${estRiskPct.toFixed(2)}%)\nDD:${dailyDrawdownUsed?.toFixed(1)}%/${maxDailyDrawdown}%\nNEWS:${upcomingEvents.map(e=>`${e.event}(${e.country})${e.minutesUntil}m`).join(';')||'none'}`; const m=await anthropic.messages.create({model:'claude-sonnet-4-6',max_tokens:2048,system:'Elite prop firm risk advisor. ONLY JSON.',messages:[{role:'user',content:`Refine:\n${ctx}`}]}); final={...JSON.parse(m.content[0].text.trim().replace(/```json|```/g,'').trim()),engine:'ai-enhanced'} } catch(e){} }
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
    let scored=articles.map(a=>({...a,impact:5,category:'General',bias:'neutral',marketTags:[],oneliner:''}))
    try{const titles=articles.map((a,i)=>`${i+1}.[${a.source}]${a.title}`).join('\n');const m=await anthropic.messages.create({model:'claude-haiku-4-5-20251001',max_tokens:8192,system:'Macro analyst for BiasForge. Return ONLY JSON array.\n[{"index":1,"impact":8,"category":"Central Bank","bias":"bearish","marketTags":["USD↓"],"oneliner":"..."}]',messages:[{role:'user',content:`Score:\n${titles}`}]});const s=JSON.parse(m.content[0].text.trim().replace(/```json|```/g,'').trim());s.forEach(x=>{const idx=x.index-1;if(scored[idx]){scored[idx].impact=x.impact||5;scored[idx].category=x.category||'General';scored[idx].bias=x.bias||'neutral';scored[idx].marketTags=x.marketTags||[];scored[idx].oneliner=x.oneliner||''}})}catch(e){}
    scored.sort((a,b)=>b.impact!==a.impact?b.impact-a.impact:new Date(b.publishedAt)-new Date(a.publishedAt))
    setCache('latest_news',scored);res.json({success:true,articles:scored})
  } catch(e){res.status(500).json({success:false,error:'News failed'})}
})

// ============================================
// 📊 COT REPORT (Currencies + Commodities + Crypto)
// ============================================
app.get('/api/cot', async (req, res) => {
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

  try {
    const results = []
    const seen = new Set()

    // ── Fetch 1: Financial instruments (currencies) ──
    const finUrl = 'https://publicreporting.cftc.gov/resource/gpe5-46if.json?' +
                   '%24order=report_date_as_yyyy_mm_dd%20DESC&%24limit=500'
    const finRes = await fetch(finUrl, { headers: { 'Accept': 'application/json', 'User-Agent': 'BiasForge/1.0' } })

    let reportDate = ''

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

    res.json({
      success: true,
      data: results,
      reportDate,
      fetchedAt: new Date().toISOString(),
    })
  } catch (e) {
    console.error('COT error:', e.message)
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
// 🧠 Session bias alert — every hour, computes Today's AI Bias at session opens
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
      // Compute fresh AI bias (this also fires a change-alert internally if direction flipped)
      const result = await computeTodaysAIBias()
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
  }, 60 * 60 * 1000)
  console.log('🧠 Session AI bias alerts (hourly, DST-safe)')
app.listen(5000, () => {
  console.log('✅ Backend running on port 5000')
  loadSubscribers()
  loadTelegramSubscribers()
  setInterval(checkAndSendCalendarAlerts, 5 * 60 * 1000)
  console.log('⏰ Calendar cron (5min)')
  setInterval(checkAndSendNewsAlerts, 10 * 60 * 1000)
  console.log('📰 News cron (10min)')
  if (TG_API) { setInterval(pollTelegram, 3000); console.log('📱 Telegram bot polling (3s)') }
  else console.log('⚠️ No TELEGRAM_BOT_TOKEN — bot disabled')
})