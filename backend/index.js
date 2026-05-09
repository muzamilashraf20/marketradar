import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

dotenv.config()

const app = express()
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true
}))
app.use(express.json())

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const LS_API_KEY = process.env.LEMONSQUEEZY_API_KEY
const LS_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID

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
              redirect_url: 'http://localhost:5173/?payment=success',
            },
          },
          relationships: {
            store: {
              data: { type: 'stores', id: String(LS_STORE_ID) }
            },
            variant: {
              data: { type: 'variants', id: String(plan.variantId) }
            }
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
    console.error('FULL ERROR:', JSON.stringify(e.response?.data, null, 2))
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

app.listen(5000, () => console.log('Backend running on port 5000'))