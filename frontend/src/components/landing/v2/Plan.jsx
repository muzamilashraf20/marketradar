import { useState } from 'react'
import { Check, Bitcoin } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import Button from '../../ui/Button'
import Card from '../../ui/Card'
import { FOCUS_RING } from '../../ui/styles'
import { Section } from './Section'
import { FAQ } from './faqData'
import { gumroadUrl, PRICE_MONTHLY, PRICE_ANNUAL, ANNUAL_PER_MONTH, ANNUAL_SAVING, INCLUDED } from './pricing'
import { authedFetch } from '../../../lib/authFetch'

// A visitor makes the account first and pays from /subscribe, so every purchase is tied to an account.
const SIGN_UP_TO_PAY = '/login?next=/subscribe'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

// Prices, the Gumroad link and the feature list live in ./pricing (shared with /subscribe).

/* Section 9 — one plan. Annual is the default, and both prices are in the markup
   either way, so the page still states the full price with JavaScript off. */
export default function Plan() {
  const [annual, setAnnual] = useState(true)
  const [cryptoLoading, setCryptoLoading] = useState(false)
  const [cryptoFailed, setCryptoFailed] = useState(false)

  // useAuth returns the raw context, which is null with no provider above it —
  // and the prerender renders this tree without one. Read it defensively so the
  // static build cannot crash on the pricing section.
  const auth = useAuth()
  const navigate = useNavigate()

  /* Card: signed in → Gumroad with ?uid=<account id>, so the payment lands on
     this account. Signed out (and the prerendered HTML) → create the account
     first; the visitor pays from /subscribe. Never straight to Gumroad. */
  const user = auth?.user
  const cardHref = user?.id ? gumroadUrl(user.id) : SIGN_UP_TO_PAY

  /* Crypto checkout via NOWPayments. It needs an account to attribute the
     payment, so an anonymous visitor is sent to sign up first. Signed in, the
     session token lets the server put the account id in the order. */
  const handleCrypto = async () => {
    const email = user?.email
    if (!email) { navigate(SIGN_UP_TO_PAY); return }
    setCryptoFailed(false)
    setCryptoLoading(true)
    try {
      const res = await authedFetch(`${API_URL}/api/crypto/create-payment`, {
        token: user?.token,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, plan: annual ? 'annual' : 'monthly' }),
      })
      const data = await res.json()
      if (!res.ok || !data.success || !data.invoice_url) {
        throw new Error(data.error || 'Could not start crypto checkout')
      }
      window.location.href = data.invoice_url // NOWPayments hosted invoice
    } catch {
      setCryptoFailed(true)
      setCryptoLoading(false)
    }
  }

  return (
    <Section id="pricing" eyebrow="Pricing" headline="One plan. The whole picture.">
      {/* Card left, answers right. The right half was empty and read as
          unfinished. These are the first three FAQ entries reused verbatim from
          faqData — the same source the FAQPage schema is generated from, so
          there is exactly one copy of each answer on the page. */}
      <div className="mt-12 grid lg:grid-cols-[minmax(0,26rem)_1fr] gap-10 lg:gap-16 items-start">
        <div className="max-w-md">
        <div
          className="inline-flex bf-pill bf-hairline p-0.5 text-[13px]"
          role="group"
          aria-label="Billing period"
        >
          {[
            { label: 'Annual', on: true },
            { label: 'Monthly', on: false },
          ].map(o => (
            <button
              key={o.label}
              type="button"
              onClick={() => setAnnual(o.on)}
              aria-pressed={annual === o.on}
              className={`bf-pill px-4 py-1.5 transition-colors ${FOCUS_RING} ${
                annual === o.on ? 'bg-bf-text text-bf-bg font-medium' : 'text-bf-text-2 hover:text-bf-text'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <Card padding="none" className="mt-6 p-7">
          <p className="text-[13px] text-bf-text-2">Pro</p>

          <p className="mt-3 flex items-baseline gap-2">
            <span className="bf-mono text-[38px] font-medium tracking-tight text-bf-text leading-none">
              ${annual ? PRICE_ANNUAL : PRICE_MONTHLY}
            </span>
            <span className="text-[14px] bf-t3">{annual ? '/ year' : '/ month'}</span>
          </p>

          {/* Both figures are arithmetic on the two real prices, not typed in:
              the annual price over twelve months, and twelve months at the
              monthly rate minus the annual price. Change a price constant and
              these follow. */}
          <p className="mt-3 text-[13.5px] bf-t3">
            {annual
              ? <>${ANNUAL_PER_MONTH} / month, billed annually · Save ${ANNUAL_SAVING} vs monthly</>
              : <>or ${PRICE_ANNUAL} / year and save ${ANNUAL_SAVING}</>}
          </p>

          <ul className="mt-7 space-y-3">
            {INCLUDED.map(item => (
              <li key={item} className="flex gap-2.5 text-[14px] leading-[1.6] text-slate-300">
                <Check size={15} className="text-bf-bull-soft shrink-0 mt-[3px]" aria-hidden="true" strokeWidth={2.25} />
                {item}
              </li>
            ))}
          </ul>

          <Button href={cardHref} external={!!user?.id} size="lg" fullWidth className="mt-8">
            Get access
          </Button>

          {/* Second payment method, equal billing with the card option. Button
              swaps the Bitcoin icon for its own spinner while loading. */}
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            className="mt-2.5"
            onClick={handleCrypto}
            loading={cryptoLoading}
            iconLeft={<Bitcoin size={15} className="text-bf-accent" aria-hidden="true" />}
          >
            {cryptoLoading ? 'Redirecting…' : 'Pay with crypto'}
          </Button>

          {cryptoFailed && (
            <p className="mt-2 text-center text-[12px] text-rose-400" role="alert">
              Crypto checkout failed. Please try again or pay by card.
            </p>
          )}

          <p className="mt-4 text-center text-[12.5px] bf-t3">
            {/* No coin list: which cryptocurrencies are offered is set in the
                NOWPayments dashboard, not in code (pay_currency is left out of
                the invoice), so naming them here would be unverifiable. */}
            Card or crypto · Cancel anytime.
          </p>
          </Card>
        </div>

        <dl className="space-y-8" data-reveal>
          {FAQ.slice(0, 3).map(({ q, a }) => (
            <div key={q}>
              <dt className="text-[15px] font-medium text-slate-100">{q}</dt>
              <dd className="mt-2.5 text-[14.5px] leading-[1.75] text-slate-400">{a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  )
}
