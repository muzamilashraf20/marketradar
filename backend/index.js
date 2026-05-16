import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import Anthropic from '@anthropic-ai/sdk'
import Parser from 'rss-parser'

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

const PLANS = {
  basic_monthly:  { variantId: '1619191', name: 'Basic Monthly' },
  basic_annual:   { variantId: '1619209', name: 'Basic Annual' },
  pro_monthly:    { variantId: '1619215', name: 'PRO Monthly' },
  pro_annual:     { variantId: '1619223', name: 'PRO Annual' },
}

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

app.get('/api/prices', async (req, res) => {
  const symbols = 'EUR/USD,GBP/USD,USD/JPY,USD/CHF,AUD/USD,NZD/USD,USD/CAD,XAU/USD,BTC/USD,ETH/USD'
  try {
    const response = await axios.get(
      `https://api.twelvedata.com/price?symbol=${symbols}&apikey=${process.env.TWELVEDATA_API_KEY}`
    )
    res.json({ success: true, data: response.data })
  } catch (e) {
    res.status(500).json({ error: 'Price fetch failed' })
  }
})

app.post('/api/ai', async (req, res) => {
  const { prompt, system } = req.body
  if (!prompt) return res.status(400).json({ error: 'Prompt required' })
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
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
      model: 'claude-sonnet-4-5',
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

app.get('/api/calendar', async (req, res) => {
  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'FINNHUB_API_KEY not configured.' })
  }

  // Sirf yeh major trading currencies
  const majorCountries = ['US', 'EU', 'GB', 'JP', 'AU', 'CA', 'CH', 'NZ', 'CN']

  try {
    const now = new Date()
    const fromDate = new Date(now)
    fromDate.setDate(now.getDate() - 3)
    const toDate = new Date(now)
    toDate.setDate(now.getDate() + 14) // 2 weeks ahead

    const from = fromDate.toISOString().split('T')[0]
    const to = toDate.toISOString().split('T')[0]

    const response = await fetch(
      `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${apiKey}`,
      { headers: { 'Accept': 'application/json' } }
    )

    if (!response.ok) {
      throw new Error(`Finnhub error: ${response.status}`)
    }

    const data = await response.json()
    const events = data.economicCalendar || []

    // Sirf major currencies filter karo
   const filtered = events.filter(item =>
  majorCountries.includes(item.country?.toUpperCase())
)

    const normalized = filtered.map((item) => ({
      title: item.event || 'Economic Event',
     country: ({
  'US': 'USD', 'EU': 'EUR', 'GB': 'GBP', 'JP': 'JPY',
  'AU': 'AUD', 'CA': 'CAD', 'CH': 'CHF', 'NZ': 'NZD', 'CN': 'CNY'
})[item.country?.toUpperCase()] || item.country?.toUpperCase() || 'N/A',
      date: item.time ? new Date(item.time).toISOString() : new Date().toISOString(),
      impact: item.impact?.toLowerCase() === 'high' ? 'High'
            : item.impact?.toLowerCase() === 'medium' ? 'Medium'
            : 'Low',
      forecast: item.estimate != null ? String(item.estimate) : '-',
      previous: item.prev != null ? String(item.prev) : '-',
      actual: item.actual != null ? String(item.actual) : '-',
    }))

    // High impact pehle, phir date se sort
    normalized.sort((a, b) => {
      const impactOrder = { High: 0, Medium: 1, Low: 2 }
      if (impactOrder[a.impact] !== impactOrder[b.impact]) {
        return impactOrder[a.impact] - impactOrder[b.impact]
      }
      return new Date(a.date) - new Date(b.date)
    })

    return res.json(normalized)

  } catch (err) {
    console.error('Finnhub calendar error:', err.message)
    return res.status(502).json({ error: 'Failed to fetch calendar data.' })
  }
})

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
      feeds.map(feed =>
        rssParser.parseURL(feed.url).then(parsed =>
          parsed.items.slice(0, 12).map(item => ({
            source: feed.name,
            title: item.title || '',
            summary: item.contentSnippet || item.content || '',
            url: item.link || '',
            publishedAt: item.pubDate
              ? new Date(item.pubDate).toISOString()
              : new Date().toISOString(),
            impact: 5,
            category: 'General',
          }))
        )
      )
    )

    let articles = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        articles.push(...r.value)
      } else {
        console.error(`Feed failed [${feeds[i].name}]:`, r.reason?.message)
      }
    })

    if (articles.length === 0) {
      return res.status(502).json({ success: false, error: 'All RSS feeds failed.' })
    }

    articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))

    return res.json({ success: true, articles })

  } catch (e) {
    console.error('News route error:', e.message)
    return res.status(500).json({
      success: false,
      error: 'News fetch failed.',
      detail: e.message
    })
  }
})

app.listen(5000, () => console.log('Backend running on port 5000'))