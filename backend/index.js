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
  origin: ['http://localhost:5173', 'http://localhost:5174', 'https://marketradar-taupe.vercel.app'],
  credentials: true
}))
app.use(express.json())

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const LS_API_KEY = process.env.LEMONSQUEEZY_API_KEY
const LS_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev'

// ============================================
// 🔄 API CACHE SYSTEM — Save TwelveData credits
// ============================================
const API_CACHE = {}
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

function getCached(key) {
  const entry = API_CACHE[key]
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) return entry.data
  return entry.data
}

function isCacheFresh(key) {
  const entry = API_CACHE[key]
  if (!entry) return false
  return Date.now() - entry.timestamp < CACHE_TTL
}

function setCache(key, data) {
  API_CACHE[key] = { data, timestamp: Date.now() }
}

const PLANS = {
  basic_monthly:  { variantId: '1619191', name: 'Basic Monthly' },
  basic_annual:   { variantId: '1619209', name: 'Basic Annual' },
  pro_monthly:    { variantId: '1619215', name: 'PRO Monthly' },
  pro_annual:     { variantId: '1619223', name: 'PRO Annual' },
}

// ============================================
// 📧 EMAIL SUBSCRIBERS — In-memory + Supabase
// ============================================
let emailSubscribers = []

// Load subscribers from Supabase on startup
async function loadSubscribers() {
  try {
    const { data, error } = await supabase
      .from('email_subscribers')
      .select('*')
      .eq('active', true)
    if (!error && data) {
      emailSubscribers = data
      console.log(`✅ Loaded ${data.length} email subscribers`)
    }
  } catch (e) {
    console.error('Failed to load subscribers:', e.message)
  }
}

// ============================================
// 📧 EMAIL TEMPLATE — Beautiful BiasForge branded
// ============================================
function buildAlertEmail({ type, title, items, greeting }) {
  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #1e293b;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${item.badge ? `<span style="background:${item.badgeColor || '#0891b2'};color:#000;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;">${item.badge}</span>` : ''}
          <span style="color:#e2e8f0;font-size:14px;font-weight:600;">${item.title}</span>
        </div>
        ${item.subtitle ? `<div style="color:#94a3b8;font-size:12px;margin-top:4px;">${item.subtitle}</div>` : ''}
      </td>
    </tr>
  `).join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#030712;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#0a1628;border-radius:16px;border:1px solid rgba(255,255,255,0.1);overflow:hidden;">
        
        <!-- Header -->
        <tr>
          <td style="padding:24px 24px 16px;border-bottom:1px solid rgba(255,255,255,0.1);">
            <table width="100%"><tr>
              <td>
                <span style="font-size:18px;font-weight:900;color:#fff;">Bias</span><span style="font-size:18px;font-weight:900;color:#06b6d4;">Forge</span><span style="font-size:14px;color:#64748b;">.ai</span>
              </td>
              <td align="right">
                <span style="background:${type === 'calendar' ? '#f59e0b20' : '#06b6d420'};color:${type === 'calendar' ? '#f59e0b' : '#06b6d4'};font-size:10px;font-weight:700;padding:4px 10px;border-radius:20px;border:1px solid ${type === 'calendar' ? '#f59e0b30' : '#06b6d430'};">
                  ${type === 'calendar' ? '📅 EVENT ALERT' : '📰 NEWS ALERT'}
                </span>
              </td>
            </tr></table>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:20px 24px 8px;">
            <p style="color:#94a3b8;font-size:13px;margin:0;">${greeting || 'Hey trader,'}</p>
            <h2 style="color:#fff;font-size:18px;font-weight:700;margin:8px 0 0;">${title}</h2>
          </td>
        </tr>

        <!-- Items -->
        <tr>
          <td style="padding:12px 24px;">
            <table width="100%" style="background:#020617;border-radius:12px;border:1px solid #1e293b;">
              ${itemsHtml}
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:16px 24px;" align="center">
            <a href="https://marketradar-taupe.vercel.app/${type === 'calendar' ? 'calendar' : 'news'}" 
               style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#06b6d4,#10b981);color:#000;font-size:13px;font-weight:700;text-decoration:none;border-radius:12px;">
              View in Dashboard →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 24px;border-top:1px solid rgba(255,255,255,0.05);">
            <p style="color:#475569;font-size:11px;margin:0;text-align:center;">
              You're receiving this because you subscribed to BiasForge.ai alerts.<br>
              <a href="https://marketradar-taupe.vercel.app/settings" style="color:#06b6d4;text-decoration:none;">Manage preferences</a> · 
              <a href="https://marketradar-taupe.vercel.app/api/email/unsubscribe?email=UNSUBSCRIBE_PLACEHOLDER" style="color:#475569;text-decoration:none;">Unsubscribe</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ============================================
// 📧 SEND EMAIL HELPER
// ============================================
async function sendAlertEmail(to, subject, html) {
  try {
    const { data, error } = await resend.emails.send({
      from: `BiasForge.ai <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html: html.replace('UNSUBSCRIBE_PLACEHOLDER', encodeURIComponent(to)),
    })
    if (error) {
      console.error(`❌ Email failed to ${to}:`, error)
      return false
    }
    console.log(`✅ Email sent to ${to} — ID: ${data?.id}`)
    return true
  } catch (e) {
    console.error(`❌ Email error to ${to}:`, e.message)
    return false
  }
}

// ============================================
// 📧 EMAIL ROUTES
// ============================================

// Subscribe
app.post('/api/email/subscribe', async (req, res) => {
  const { email, preferences } = req.body
  if (!email) return res.status(400).json({ error: 'Email required' })

  try {
    // Upsert into Supabase
    const { error } = await supabase
      .from('email_subscribers')
      .upsert({
        email: email.toLowerCase().trim(),
        active: true,
        preferences: preferences || { calendar: true, news: true },
        subscribed_at: new Date().toISOString(),
      }, { onConflict: 'email' })

    if (error) throw error

    // Update in-memory list
    const exists = emailSubscribers.find(s => s.email === email.toLowerCase().trim())
    if (!exists) {
      emailSubscribers.push({
        email: email.toLowerCase().trim(),
        active: true,
        preferences: preferences || { calendar: true, news: true },
      })
    } else {
      exists.active = true
      exists.preferences = preferences || exists.preferences
    }

    // Send welcome email
    const welcomeHtml = buildAlertEmail({
      type: 'news',
      title: 'Welcome to BiasForge Alerts! 🎯',
      greeting: `Hey trader,`,
      items: [
        { title: '📅 High Impact Calendar Events', subtitle: 'Get alerts 1hr and 30min before major events (FOMC, NFP, CPI etc.)' },
        { title: '📰 Breaking Market News', subtitle: 'Instant alerts when high-impact news breaks (score 8+)' },
        { title: '⚙️ Manage Anytime', subtitle: 'Update preferences or unsubscribe from your Settings page' },
      ]
    })
    await sendAlertEmail(email, '✅ Welcome to BiasForge.ai Alerts', welcomeHtml)

    res.json({ success: true, message: 'Subscribed! Check your inbox for confirmation.' })
  } catch (e) {
    console.error('Subscribe error:', e.message)
    res.status(500).json({ error: 'Subscription failed' })
  }
})

// Unsubscribe
app.get('/api/email/unsubscribe', async (req, res) => {
  const { email } = req.query
  if (!email) return res.status(400).send('Email required')

  try {
    await supabase
      .from('email_subscribers')
      .update({ active: false })
      .eq('email', decodeURIComponent(email).toLowerCase().trim())

    // Update in-memory
    const sub = emailSubscribers.find(s => s.email === decodeURIComponent(email).toLowerCase().trim())
    if (sub) sub.active = false

    res.send(`
      <html>
      <body style="background:#030712;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
        <div style="text-align:center;">
          <h2>✅ Unsubscribed</h2>
          <p style="color:#94a3b8;">You will no longer receive BiasForge.ai alerts.</p>
          <a href="https://marketradar-taupe.vercel.app" style="color:#06b6d4;">Back to BiasForge</a>
        </div>
      </body>
      </html>
    `)
  } catch (e) {
    res.status(500).send('Unsubscribe failed')
  }
})

// Update preferences
app.post('/api/email/preferences', async (req, res) => {
  const { email, preferences } = req.body
  if (!email) return res.status(400).json({ error: 'Email required' })

  try {
    await supabase
      .from('email_subscribers')
      .update({ preferences })
      .eq('email', email.toLowerCase().trim())

    const sub = emailSubscribers.find(s => s.email === email.toLowerCase().trim())
    if (sub) sub.preferences = preferences

    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: 'Update failed' })
  }
})

// Get subscription status
app.get('/api/email/status', async (req, res) => {
  const { email } = req.query
  if (!email) return res.status(400).json({ error: 'Email required' })

  const sub = emailSubscribers.find(s => s.email === email.toLowerCase().trim())
  res.json({
    subscribed: sub?.active || false,
    preferences: sub?.preferences || { calendar: true, news: true },
  })
})

// Send test email (for debugging)
app.post('/api/email/test', async (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email required' })

  const html = buildAlertEmail({
    type: 'calendar',
    title: '⚠️ FOMC Rate Decision in 1 Hour',
    greeting: 'Heads up trader!',
    items: [
      { title: 'FOMC Interest Rate Decision', subtitle: 'USD · High Impact · 2:00 PM EST', badge: 'HIGH', badgeColor: '#ef4444' },
      { title: 'Fed Press Conference', subtitle: 'USD · High Impact · 2:30 PM EST', badge: 'HIGH', badgeColor: '#ef4444' },
    ]
  })

  const sent = await sendAlertEmail(email, '🧪 BiasForge Test Alert — FOMC in 1hr', html)
  res.json({ success: sent })
})

// ============================================
// ⏰ ALERT ENGINE — Cron-style checker
// ============================================
const sentAlerts = new Map() // Track sent alerts to avoid duplicates

async function checkAndSendCalendarAlerts() {
  if (emailSubscribers.filter(s => s.active).length === 0) return

  try {
    const apiKey = process.env.FINNHUB_API_KEY
    if (!apiKey) return

    const now = new Date()
    const future = new Date(now.getTime() + 2 * 60 * 60 * 1000) // 2 hours ahead
    const from = now.toISOString().split('T')[0]
    const to = future.toISOString().split('T')[0]

    const calResp = await fetch(
      `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${apiKey}`
    )
    if (!calResp.ok) return

    const calData = await calResp.json()
    const events = calData.economicCalendar || []

    const highImpact = events.filter(e => {
      if (!e.time || e.impact?.toLowerCase() !== 'high') return false
      const eventTime = new Date(e.time)
      const minutesUntil = (eventTime - now) / 60000
      return minutesUntil > 0 && minutesUntil <= 65 // Within next 65 mins
    })

    if (highImpact.length === 0) return

    // Check if we need to send 1hr or 30min alerts
    const currencyMap = { 'US': 'USD', 'EU': 'EUR', 'GB': 'GBP', 'JP': 'JPY', 'AU': 'AUD', 'CA': 'CAD', 'CH': 'CHF', 'NZ': 'NZD' }

    for (const event of highImpact) {
      const eventTime = new Date(event.time)
      const minutesUntil = Math.round((eventTime - now) / 60000)
      const currency = currencyMap[event.country?.toUpperCase()] || event.country

      // Determine alert type (1hr or 30min)
      let alertType = null
      if (minutesUntil >= 55 && minutesUntil <= 65) alertType = '1hr'
      else if (minutesUntil >= 25 && minutesUntil <= 35) alertType = '30min'

      if (!alertType) continue

      const alertKey = `${event.event}-${event.time}-${alertType}`
      if (sentAlerts.has(alertKey)) continue

      // Build email
      const timeStr = eventTime.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York'
      })

      const html = buildAlertEmail({
        type: 'calendar',
        title: alertType === '1hr'
          ? `⏰ ${event.event} in ~1 Hour`
          : `🔥 ${event.event} in ~30 Minutes`,
        greeting: alertType === '30min' ? '⚡ Last call trader!' : 'Heads up trader!',
        items: [
          {
            title: event.event,
            subtitle: `${currency} · High Impact · ${timeStr} EST`,
            badge: 'HIGH',
            badgeColor: '#ef4444'
          },
          {
            title: alertType === '1hr' ? '📋 Check your Playbook' : '🛡️ Check Prop Firm Risk',
            subtitle: alertType === '1hr'
              ? 'Review your strategy before the event. Reduce exposure if needed.'
              : 'Close risky positions or tighten stops. Volatility incoming.',
          }
        ]
      })

      const subject = alertType === '1hr'
        ? `⏰ ${currency} High Impact: ${event.event} in 1hr`
        : `🔥 ${currency} ALERT: ${event.event} in 30min!`

      // Send to all active subscribers with calendar preference
      const calSubs = emailSubscribers.filter(s =>
        s.active && (s.preferences?.calendar !== false)
      )

      for (const sub of calSubs) {
        await sendAlertEmail(sub.email, subject, html)
      }

      sentAlerts.set(alertKey, Date.now())
      console.log(`📧 Sent ${alertType} alert: ${event.event} to ${calSubs.length} subscribers`)
    }

    // Cleanup old alerts (older than 3 hours)
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000
    for (const [key, timestamp] of sentAlerts) {
      if (timestamp < threeHoursAgo) sentAlerts.delete(key)
    }
  } catch (e) {
    console.error('Calendar alert check error:', e.message)
  }
}

// Track sent news alerts
const sentNewsAlerts = new Set()

async function checkAndSendNewsAlerts() {
  const newsSubs = emailSubscribers.filter(s =>
    s.active && (s.preferences?.news !== false)
  )
  if (newsSubs.length === 0) return

  try {
    // Use cached news if available
    const cached = getCached('latest_news')
    if (!cached) return

    const highImpactNews = cached.filter(a =>
      a.impact >= 8 && !sentNewsAlerts.has(a.title)
    )

    if (highImpactNews.length === 0) return

    const items = highImpactNews.slice(0, 3).map(article => ({
      title: article.title,
      subtitle: `${article.source} · Impact: ${article.impact}/10 · ${article.category || 'Markets'}`,
      badge: 'BREAKING',
      badgeColor: '#ef4444'
    }))

    const html = buildAlertEmail({
      type: 'news',
      title: `🚨 ${highImpactNews.length} High Impact News Alert${highImpactNews.length > 1 ? 's' : ''}`,
      greeting: 'Breaking market-moving news!',
      items
    })

    for (const sub of newsSubs) {
      await sendAlertEmail(
        sub.email,
        `🚨 BiasForge: ${highImpactNews[0].title.slice(0, 50)}...`,
        html
      )
    }

    // Mark as sent
    highImpactNews.forEach(a => sentNewsAlerts.add(a.title))
    console.log(`📰 Sent news alert: ${highImpactNews.length} articles to ${newsSubs.length} subscribers`)

    // Cleanup old entries (keep last 100)
    if (sentNewsAlerts.size > 100) {
      const arr = Array.from(sentNewsAlerts)
      arr.slice(0, arr.length - 100).forEach(t => sentNewsAlerts.delete(t))
    }
  } catch (e) {
    console.error('News alert check error:', e.message)
  }
}

// ============================================
// AUTH ROUTES
// ============================================
app.post('/api/register', async (req, res) => {
  const { email, password, name } = req.body
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email, password,
      user_metadata: { name },
      email_confirm: true
    })
    if (error) throw error
    res.json({ success: true, user: data.user })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    res.json({ success: true, user: data.user, session: data.session })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// ============================================
// 💳 PAYMENT ROUTES
// ============================================
app.post('/api/checkout', async (req, res) => {
  const { planKey } = req.body
  const plan = PLANS[planKey]
  if (!plan) return res.status(400).json({ error: 'Invalid plan' })
  try {
    const response = await axios.post(
      'https://api.lemonsqueezy.com/v1/checkouts',
      {
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {},
            product_options: {
              redirect_url: 'https://marketradar-taupe.vercel.app/?payment=success',
            },
          },
          relationships: {
            store: { data: { type: 'stores', id: String(LS_STORE_ID) } },
            variant: { data: { type: 'variants', id: String(plan.variantId) } }
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${LS_API_KEY}`,
          'Content-Type': 'application/vnd.api+json',
          'Accept': 'application/vnd.api+json',
        }
      }
    )
    const checkoutUrl = response.data.data.attributes.url
    res.json({ success: true, url: checkoutUrl })
  } catch (e) {
    console.error('Checkout error:', JSON.stringify(e.response?.data, null, 2))
    res.status(500).json({ error: 'Checkout failed', detail: e.response?.data })
  }
})

app.get('/api/plans', (req, res) => {
  res.json({ plans: PLANS })
})

app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const event = req.headers['x-event-name']
  const payload = JSON.parse(req.body)
  if (event === 'subscription_created' || event === 'order_created') {
    const email = payload.data?.attributes?.user_email
    const variantId = String(payload.data?.attributes?.variant_id)
    const planEntry = Object.entries(PLANS).find(([, v]) => v.variantId === variantId)
    const planName = planEntry ? planEntry[0] : 'basic'
    const tier = planName.startsWith('pro') ? 'pro' : 'basic'
    if (email) {
      await supabase.from('user_plans').upsert({ email, tier, updated_at: new Date() })
    }
  }
  res.json({ received: true })
})

// ============================================
// 💰 PRICES
// ============================================
app.get('/api/prices', async (req, res) => {
  if (isCacheFresh('prices')) return res.json(getCached('prices'))
  const stale = getCached('prices')
  const symbols = 'EUR/USD,GBP/USD,USD/JPY,XAU/USD,BTC/USD'
  try {
    const response = await axios.get(
      `https://api.twelvedata.com/price?symbol=${symbols}&apikey=${process.env.TWELVEDATA_API_KEY}`
    )
    if (response.data?.code === 429 || response.data?.status === 'error') {
      if (stale) return res.json(stale)
      return res.json({ success: true, data: response.data })
    }
    const result = { success: true, data: response.data }
    setCache('prices', result)
    res.json(result)
  } catch (e) {
    if (stale) return res.json(stale)
    res.status(500).json({ error: 'Price fetch failed' })
  }
})

// ============================================
// 🤖 AI ROUTES
// ============================================
app.post('/api/ai', async (req, res) => {
  const { prompt, system } = req.body
  if (!prompt) return res.status(400).json({ error: 'Prompt required' })
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 1024,
      system: system || 'You are a financial markets analyst assistant for BiasForge.ai.',
      messages: [{ role: 'user', content: prompt }],
    })
    res.json({ success: true, response: message.content[0].text })
  } catch (e) {
    console.error('Anthropic error:', e)
    res.status(500).json({ error: 'AI request failed' })
  }
})

app.post('/api/bias', async (req, res) => {
  const { symbol, timeframe, propFirm } = req.body
  if (!symbol) return res.status(400).json({ error: 'Symbol required' })
  const now = new Date().toISOString()
  const prompt = `Analyze ${symbol} for ${timeframe || 'intraday'} trading bias as of ${now}.`
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 2048,
      system: 'You are a senior macro trader for BiasForge.ai. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    })
    const text = message.content[0].text.trim().replace(/```json|```/g, '').trim()
    const bias = JSON.parse(text)
    res.json({ success: true, bias })
  } catch (e) {
    console.error('Bias error:', e.message)
    res.status(500).json({ success: false, error: 'AI analysis failed.' })
  }
})

// ============================================
// 🚀 PRE-TRADE GUARDIAN
// ============================================
app.post('/api/trade-check', async (req, res) => {
  const {
    symbol, direction, lotSize, stopLossPips, entryPrice,
    accountSize, dailyDrawdownUsed, totalDrawdownUsed,
    maxDailyDrawdown, maxTotalDrawdown, riskPerTrade,
    useAI = false,
  } = req.body

  if (!symbol || !direction || !lotSize || !stopLossPips) {
    return res.status(400).json({ success: false, error: 'Required: symbol, direction, lotSize, stopLossPips' })
  }

  try {
    let upcomingEvents = []
    try {
      const apiKey = process.env.FINNHUB_API_KEY
      if (apiKey) {
        const now = new Date()
        const future = new Date(now.getTime() + 4 * 60 * 60 * 1000)
        const from = now.toISOString().split('T')[0]
        const to = future.toISOString().split('T')[0]
        const calResp = await fetch(`https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${apiKey}`)
        if (calResp.ok) {
          const calData = await calResp.json()
          const events = calData.economicCalendar || []
          upcomingEvents = events
            .filter(e => { if (!e.time) return false; const t = new Date(e.time); return t > now && t < future })
            .filter(e => e.impact?.toLowerCase() === 'high')
            .slice(0, 5)
            .map(e => ({ event: e.event, country: e.country, time: e.time, minutesUntil: Math.round((new Date(e.time) - now) / 60000) }))
        }
      }
    } catch (calErr) { console.error('Calendar fetch in trade-check:', calErr.message) }

    const dailyDrawdownRemaining = (maxDailyDrawdown || 5) - (dailyDrawdownUsed || 0)
    const totalDrawdownRemaining = (maxTotalDrawdown || 10) - (totalDrawdownUsed || 0)
    const pipValue = symbol.toUpperCase().includes('JPY') ? 9.09 : 10
    const estimatedRiskDollars = lotSize * pipValue * stopLossPips
    const estimatedRiskPercent = accountSize ? (estimatedRiskDollars / accountSize) * 100 : 0

    const tradeCurrencies = symbol.toUpperCase().replace('/', '').match(/.{1,3}/g) || []
    const currencyMap = { 'US': 'USD', 'EU': 'EUR', 'GB': 'GBP', 'JP': 'JPY', 'AU': 'AUD', 'CA': 'CAD', 'CH': 'CHF', 'NZ': 'NZD' }
    const conflictingEvents = upcomingEvents.filter(e => { const ec = currencyMap[e.country?.toUpperCase()]; return ec && tradeCurrencies.includes(ec) })
    const imminentNews = upcomingEvents.find(e => e.minutesUntil <= 60)
    const conflictingImminent = conflictingEvents.find(e => e.minutesUntil <= 60)

    const reasons = [], warnings = []
    let verdict = 'GREEN', headline = 'Trade conditions look clear', recommendation = 'Proceed with your planned setup. Stick to your stop loss.', confidence = 85

    if (dailyDrawdownUsed >= 90) { verdict = 'RED'; headline = 'Account blow-up risk — STOP trading today'; reasons.push(`Daily drawdown at ${dailyDrawdownUsed.toFixed(1)}%`); recommendation = 'Close terminal. Resume tomorrow.'; confidence = 98 }
    else if (estimatedRiskPercent > maxDailyDrawdown) { verdict = 'RED'; headline = 'Single trade risk exceeds daily limit'; reasons.push(`This trade risks ${estimatedRiskPercent.toFixed(2)}%`); recommendation = `Reduce lot size to ${(lotSize * (maxDailyDrawdown / estimatedRiskPercent) * 0.5).toFixed(2)}`; confidence = 96 }
    else if (conflictingImminent) { verdict = 'RED'; headline = `${conflictingImminent.event} in ${conflictingImminent.minutesUntil} min`; reasons.push(`High-impact news directly affects ${symbol}`); recommendation = `Wait ${conflictingImminent.minutesUntil + 15} minutes`; confidence = 94 }
    else if (dailyDrawdownUsed >= 70) { verdict = 'YELLOW'; headline = 'Daily drawdown danger zone'; reasons.push(`${dailyDrawdownUsed.toFixed(1)}% of daily limit used`); recommendation = 'Reduce position size by 50%.'; confidence = 88 }
    else if (estimatedRiskPercent > riskPerTrade * 1.5) { verdict = 'YELLOW'; headline = 'Risk above your normal limit'; reasons.push(`This trade risks ${estimatedRiskPercent.toFixed(2)}%`); recommendation = `Reduce to stay within ${riskPerTrade}% rule`; confidence = 90 }
    else if (imminentNews) { verdict = 'YELLOW'; headline = `News event in ${imminentNews.minutesUntil} min`; reasons.push(`${imminentNews.event} could spike volatility`); recommendation = `Wait ${imminentNews.minutesUntil + 10} min`; confidence = 82 }
    else { reasons.push(`Risk is ${estimatedRiskPercent.toFixed(2)}% — within your ${riskPerTrade}% rule`); reasons.push(`Daily drawdown ${dailyDrawdownUsed.toFixed(1)}% used`); reasons.push(upcomingEvents.length === 0 ? 'No high-impact news in next 4 hours' : `${upcomingEvents.length} events — none affect ${symbol}`) }

    if (totalDrawdownUsed >= 80 && verdict !== 'RED') warnings.push(`Total drawdown at ${totalDrawdownUsed.toFixed(1)}%`)
    if (upcomingEvents.length >= 3) warnings.push(`${upcomingEvents.length} high-impact events in next 4h`)

    let finalVerdict = { verdict, headline, reasons, warnings, recommendation, confidence, engine: 'rule-based' }

    if (useAI) {
      try {
        const tradeContext = `TRADE: ${direction} ${lotSize} lots ${symbol}, SL ${stopLossPips} pips\nRISK: $${estimatedRiskDollars.toFixed(2)} (${estimatedRiskPercent.toFixed(2)}%)\nDRAWDOWN: Daily ${dailyDrawdownUsed?.toFixed(1)}%/${maxDailyDrawdown}%, Total ${totalDrawdownUsed?.toFixed(1)}%/${maxTotalDrawdown}%\nNEWS: ${upcomingEvents.map(e => `${e.event}(${e.country}) in ${e.minutesUntil}m`).join('; ') || 'none'}\nRULE VERDICT: ${verdict}`
        const message = await anthropic.messages.create({ model: 'claude-sonnet-4-5-20250514', max_tokens: 800, system: 'You are an elite prop firm risk advisor. Return ONLY valid JSON.', messages: [{ role: 'user', content: `Refine this trade verdict:\n${tradeContext}` }] })
        const raw = message.content[0].text.trim().replace(/```json|```/g, '').trim()
        finalVerdict = { ...JSON.parse(raw), engine: 'ai-enhanced' }
      } catch (aiErr) { console.warn('AI enhancement failed:', aiErr.message) }
    }

    res.json({ success: true, verdict: finalVerdict, meta: { estimatedRiskDollars: estimatedRiskDollars.toFixed(2), estimatedRiskPercent: estimatedRiskPercent.toFixed(2), upcomingEvents, analyzedAt: new Date().toISOString() } })
  } catch (e) { console.error('Trade check error:', e.message); res.status(500).json({ success: false, error: 'Trade analysis failed' }) }
})

// ============================================
// 📅 CALENDAR
// ============================================
app.get('/api/calendar', async (req, res) => {
  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FINNHUB_API_KEY not configured.' })
  const majorCountries = ['US', 'EU', 'GB', 'JP', 'AU', 'CA', 'CH', 'NZ', 'CN']
  try {
    const now = new Date()
    const fromDate = new Date(now); fromDate.setDate(now.getDate() - 3)
    const toDate = new Date(now); toDate.setDate(now.getDate() + 14)
    const from = fromDate.toISOString().split('T')[0]
    const to = toDate.toISOString().split('T')[0]
    const response = await fetch(`https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${apiKey}`, { headers: { 'Accept': 'application/json' } })
    if (!response.ok) throw new Error(`Finnhub error: ${response.status}`)
    const data = await response.json()
    const events = data.economicCalendar || []
    const filtered = events.filter(item => majorCountries.includes(item.country?.toUpperCase()))
    const normalized = filtered.map((item) => ({
      title: item.event || 'Economic Event',
      country: ({ 'US': 'USD', 'EU': 'EUR', 'GB': 'GBP', 'JP': 'JPY', 'AU': 'AUD', 'CA': 'CAD', 'CH': 'CHF', 'NZ': 'NZD', 'CN': 'CNY' })[item.country?.toUpperCase()] || item.country?.toUpperCase() || 'N/A',
      date: item.time ? new Date(item.time).toISOString() : new Date().toISOString(),
      impact: item.impact?.toLowerCase() === 'high' ? 'High' : item.impact?.toLowerCase() === 'medium' ? 'Medium' : 'Low',
      forecast: item.estimate != null ? String(item.estimate) : '-',
      previous: item.prev != null ? String(item.prev) : '-',
      actual: item.actual != null ? String(item.actual) : '-',
    }))
    normalized.sort((a, b) => {
      const io = { High: 0, Medium: 1, Low: 2 }
      if (io[a.impact] !== io[b.impact]) return io[a.impact] - io[b.impact]
      return new Date(a.date) - new Date(b.date)
    })
    return res.json(normalized)
  } catch (err) { console.error('Calendar error:', err.message); return res.status(502).json({ error: 'Failed to fetch calendar data.' }) }
})

// ============================================
// 💪 CURRENCY STRENGTH
// ============================================
app.get('/api/strength', async (req, res) => {
  if (isCacheFresh('strength')) return res.json(getCached('strength'))
  const stale = getCached('strength')
  const apiKey = process.env.TWELVEDATA_API_KEY
  const pairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD']

  try {
    const symbolStr = pairs.join(',')
    const response = await axios.get(
      `https://api.twelvedata.com/time_series?symbol=${symbolStr}&interval=1day&outputsize=2&apikey=${apiKey}`
    )
    const tsData = response.data

    if (tsData.code === 429 || tsData.status === 'error') {
      if (stale) return res.json(stale)
      return res.status(429).json({ success: false, error: 'Rate limit hit. Try again in 1 minute.', marketClosed: false })
    }

    const scores = { USD: 0, EUR: 0, GBP: 0, JPY: 0, AUD: 0, NZD: 0, CAD: 0, CHF: 0 }
    const counts = { USD: 0, EUR: 0, GBP: 0, JPY: 0, AUD: 0, NZD: 0, CAD: 0, CHF: 0 }

    pairs.forEach(pair => {
      const [base, quote] = pair.split('/')
      const pairData = tsData[pair]
      if (!pairData?.values || pairData.values.length < 2) return
      const current = parseFloat(pairData.values[0].close)
      const prev = parseFloat(pairData.values[1].close)
      if (!current || !prev || isNaN(current) || isNaN(prev)) return
      const change = ((current - prev) / prev) * 100
      if (scores[base] !== undefined) { scores[base] += change; counts[base]++ }
      if (scores[quote] !== undefined) { scores[quote] -= change; counts[quote]++ }
    })

    const averaged = {}
    Object.keys(scores).forEach(c => { averaged[c] = counts[c] > 0 ? scores[c] / counts[c] : 0 })

    const values = Object.values(averaged)
    const min = Math.min(...values), max = Math.max(...values), range = max - min || 1

    const normalized = {}
    Object.keys(averaged).forEach(c => { normalized[c] = Math.round(((averaged[c] - min) / range) * 100) })

    const sorted = Object.entries(normalized)
      .sort((a, b) => b[1] - a[1])
      .map(([currency, strength]) => ({
        currency, strength,
        raw: averaged[currency].toFixed(4),
        label: strength >= 65 ? 'Strong' : strength >= 35 ? 'Neutral' : 'Weak',
      }))

    const allZero = sorted.every(c => c.strength === 0)
    const strongest = sorted[0], weakest = sorted[sorted.length - 1]
    const bestPairs = []

    if (!allZero && strongest && weakest && strongest.currency !== weakest.currency) {
      bestPairs.push({ pair: `${strongest.currency}/${weakest.currency}`, action: 'BUY', reason: `${strongest.currency} strongest, ${weakest.currency} weakest` })
      bestPairs.push({ pair: `${weakest.currency}/${strongest.currency}`, action: 'SELL', reason: `Sell ${weakest.currency} against ${strongest.currency}` })
    }

    const result = { success: true, currencies: sorted, bestPairs, marketClosed: allZero, updatedAt: new Date().toISOString() }
    if (!allZero) setCache('strength', result)
    return res.json(result)
  } catch (err) {
    console.error('Strength error:', err.message)
    if (stale) return res.json(stale)
    return res.status(500).json({ success: false, error: 'Failed to calculate strength.' })
  }
})

// ============================================
// 📰 NEWS (with alert caching)
// ============================================
app.get('/api/news', async (req, res) => {
  const feeds = [
    { name: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
    { name: 'Nasdaq', url: 'https://www.nasdaq.com/feed/rssoutbound?category=Markets' },
    { name: 'Fox Business', url: 'https://feeds.foxbusiness.com/foxbusiness/markets' },
    { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/topNews' },
    { name: 'Investing.com', url: 'https://www.investing.com/rss/news.rss' },
  ]
  try {
    const results = await Promise.allSettled(
      feeds.map(feed => rssParser.parseURL(feed.url).then(parsed =>
        parsed.items.slice(0, 12).map(item => ({
          source: feed.name, title: item.title || '', summary: item.contentSnippet || item.content || '',
          url: item.link || '', publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        }))
      ))
    )
    let articles = []
    results.forEach((r, i) => { if (r.status === 'fulfilled') articles.push(...r.value); else console.error(`Feed failed [${feeds[i].name}]:`, r.reason?.message) })
    if (articles.length === 0) return res.status(502).json({ success: false, error: 'All RSS feeds failed.' })

    const titlesForAI = articles.map((a, i) => `${i + 1}. [${a.source}] ${a.title}`).join('\n')
    let scoredArticles = articles.map(a => ({ ...a, impact: 5, category: 'General', bias: 'neutral', marketTags: [], oneliner: '' }))

    try {
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 2048,
        system: `You are a macro trading analyst for BiasForge.ai.\nFor each news headline, return impact score, category, bias, market tags, and one-liner.\nReturn ONLY valid JSON array. No markdown.\n[{"index":1,"impact":8,"category":"Central Bank","bias":"bearish","marketTags":["USD↓","EUR/USD↑","Gold↑"],"oneliner":"Fed rate cut signals USD weakness"}]`,
        messages: [{ role: 'user', content: `Score these headlines:\n${titlesForAI}` }],
      })
      const raw = message.content[0].text.trim().replace(/```json|```/g, '').trim()
      const scores = JSON.parse(raw)
      scores.forEach(score => { const idx = score.index - 1; if (scoredArticles[idx]) { scoredArticles[idx].impact = score.impact || 5; scoredArticles[idx].category = score.category || 'General'; scoredArticles[idx].bias = score.bias || 'neutral'; scoredArticles[idx].marketTags = score.marketTags || []; scoredArticles[idx].oneliner = score.oneliner || '' } })
    } catch (aiErr) { console.error('AI scoring error:', aiErr.message) }

    scoredArticles.sort((a, b) => { if (b.impact !== a.impact) return b.impact - a.impact; return new Date(b.publishedAt) - new Date(a.publishedAt) })

    // Cache for news alerts
    setCache('latest_news', scoredArticles)

    return res.json({ success: true, articles: scoredArticles })
  } catch (e) { console.error('News error:', e.message); return res.status(500).json({ success: false, error: 'News fetch failed.' }) }
})

// ============================================
// 📊 COT REPORT
// ============================================
app.get('/api/cot', async (req, res) => {
  const CONTRACT_MAP = {
    'EURO FX': { currency: 'EUR', flag: '🇪🇺' }, 'BRITISH POUND': { currency: 'GBP', flag: '🇬🇧' },
    'JAPANESE YEN': { currency: 'JPY', flag: '🇯🇵' }, 'SWISS FRANC': { currency: 'CHF', flag: '🇨🇭' },
    'AUSTRALIAN DOLLAR': { currency: 'AUD', flag: '🇦🇺' }, 'NZ DOLLAR': { currency: 'NZD', flag: '🇳🇿' },
    'CANADIAN DOLLAR': { currency: 'CAD', flag: '🇨🇦' }, 'USD INDEX': { currency: 'USD', flag: '🇺🇸' },
    'GOLD': { currency: 'XAU', flag: '🥇' }, 'SILVER': { currency: 'XAG', flag: '🥈' },
  }
  try {
    const apiUrl = 'https://publicreporting.cftc.gov/resource/gpe5-46if.json?$order=report_date_as_yyyy_mm_dd DESC&$limit=50'
    const response = await fetch(apiUrl, { headers: { 'Accept': 'application/json', 'User-Agent': 'BiasForge/1.0' } })
    if (!response.ok) throw new Error(`CFTC API error: ${response.status}`)
    const rows = await response.json()
    if (!rows || rows.length === 0) throw new Error('No data from CFTC')
    const latestDate = rows[0]?.report_date_as_yyyy_mm_dd?.split('T')[0] || ''
    const latestRows = rows.filter(r => (r.report_date_as_yyyy_mm_dd || '').startsWith(latestDate.slice(0, 10)))
    const results = [], seenCurrencies = new Set()
    for (const row of latestRows) {
      const marketName = (row.market_and_exchange_names || '').toUpperCase()
      let matched = null
      for (const [key, val] of Object.entries(CONTRACT_MAP)) { if (marketName.includes(key)) { matched = val; break } }
      if (!matched || seenCurrencies.has(matched.currency)) continue
      seenCurrencies.add(matched.currency)
      const parse = (val) => parseInt(val) || 0
      const amLong = parse(row.asset_mgr_positions_long), amShort = parse(row.asset_mgr_positions_short)
      const levLong = parse(row.lev_money_positions_long), levShort = parse(row.lev_money_positions_short)
      const dlrLong = parse(row.dealer_positions_long), dlrShort = parse(row.dealer_positions_short)
      const totalLong = amLong + levLong, totalShort = amShort + levShort, netPosition = totalLong - totalShort
      let bias = 'Neutral'; if (netPosition > 5000) bias = 'Bullish'; else if (netPosition < -5000) bias = 'Bearish'
      results.push({ currency: matched.currency, flag: matched.flag, longContracts: totalLong, shortContracts: totalShort, netPosition, bias, reportDate: latestDate, breakdown: { assetManagers: { long: amLong, short: amShort, net: amLong - amShort }, leveragedFunds: { long: levLong, short: levShort, net: levLong - levShort }, dealers: { long: dlrLong, short: dlrShort, net: dlrLong - dlrShort } } })
    }
    results.sort((a, b) => { const bo = { Bullish: 0, Neutral: 1, Bearish: 2 }; if (bo[a.bias] !== bo[b.bias]) return bo[a.bias] - bo[b.bias]; return Math.abs(b.netPosition) - Math.abs(a.netPosition) })
    return res.json({ success: true, data: results, reportDate: latestDate, fetchedAt: new Date().toISOString() })
  } catch (err) { console.error('COT error:', err.message); return res.status(502).json({ success: false, error: 'Failed to fetch COT data', detail: err.message }) }
})

// ============================================
// 📅 EARNINGS CALENDAR
// ============================================
app.get('/api/earnings', async (req, res) => {
  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FINNHUB_API_KEY not configured.' })
  try {
    const now = new Date()
    const fromDate = new Date(now); fromDate.setDate(now.getDate() - 1)
    const toDate = new Date(now); toDate.setDate(now.getDate() + 14)
    const from = fromDate.toISOString().split('T')[0], to = toDate.toISOString().split('T')[0]
    const response = await fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${apiKey}`, { headers: { 'Accept': 'application/json' } })
    if (!response.ok) throw new Error(`Finnhub error: ${response.status}`)
    const data = await response.json()
    const earnings = data.earningsCalendar || []
    const normalized = earnings.map(item => ({ symbol: item.symbol || '—', date: item.date || '', hour: item.hour || 'amc', epsEstimate: item.epsEstimate ?? null, epsActual: item.epsActual ?? null, revenueEstimate: item.revenueEstimate ?? null, revenueActual: item.revenueActual ?? null, quarter: item.quarter || null, year: item.year || null }))
    normalized.sort((a, b) => { if (a.date !== b.date) return new Date(a.date) - new Date(b.date); return a.symbol.localeCompare(b.symbol) })
    return res.json({ success: true, earnings: normalized, from, to, total: normalized.length, fetchedAt: new Date().toISOString() })
  } catch (err) { console.error('Earnings error:', err.message); return res.status(502).json({ success: false, error: 'Failed to fetch earnings data', detail: err.message }) }
})

// ============================================
// 🚀 START SERVER + CRON JOBS
// ============================================
app.listen(5000, () => {
  console.log('✅ Backend running on port 5000')

  // Load subscribers on startup
  loadSubscribers()

  // Check calendar alerts every 5 minutes
  setInterval(checkAndSendCalendarAlerts, 5 * 60 * 1000)
  console.log('⏰ Calendar alert cron started (every 5 min)')

  // Check news alerts every 10 minutes
  setInterval(checkAndSendNewsAlerts, 10 * 60 * 1000)
  console.log('📰 News alert cron started (every 10 min)')
})