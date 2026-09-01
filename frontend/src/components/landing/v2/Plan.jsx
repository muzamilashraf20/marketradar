import { useState } from 'react'
import { Check, Bitcoin, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { Section } from './Section'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export const GUMROAD_URL = 'https://biasforge.gumroad.com/l/ntjpje'
export const PRICE_MONTHLY = 40
export const PRICE_ANNUAL = 399

const INCLUDED = [
  'Macro bias and invalidation level for every major pair',
  'Prop Firm Mode with live drawdown tracking',
  'Economic calendar with directional context',
  'Impact-scored live news',
  'COT positioning and currency strength',
  'Trade journal',
]

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

  /* Crypto checkout via NOWPayments. Carried over from the previous pricing
     section unchanged: it needs an email to attribute the payment, so an
     anonymous visitor is sent to sign in first, exactly as before. */
  const handleCrypto = async () => {
    const email = auth?.user?.email
    if (!email) { navigate('/login'); return }
    setCryptoFailed(false)
    setCryptoLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/crypto/create-payment`, {
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
      <div className="mt-12 max-w-md">
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
              className={`bf-pill px-4 py-1.5 transition-colors ${
                annual === o.on ? 'bg-slate-100 text-[#030712] font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="bf-card mt-6 p-7">
          <p className="text-[13px] text-slate-400">Pro</p>

          <p className="mt-3 flex items-baseline gap-2">
            <span className="bf-mono text-[38px] font-medium tracking-tight text-slate-50 leading-none">
              ${annual ? PRICE_ANNUAL : PRICE_MONTHLY}
            </span>
            <span className="text-[14px] bf-t3">{annual ? '/ year' : '/ month'}</span>
          </p>

          <p className="mt-3 text-[13.5px] bf-t3">
            {annual ? (
              <>
                {/* The saving stated as what twelve months at the monthly rate
                    would actually cost — an arithmetic fact, not a claim. */}
                <span className="line-through bf-t3">${PRICE_MONTHLY * 12} / year</span>{' '}
                billed monthly
              </>
            ) : (
              <>or ${PRICE_ANNUAL} / year</>
            )}
          </p>

          <ul className="mt-7 space-y-3">
            {INCLUDED.map(item => (
              <li key={item} className="flex gap-2.5 text-[14px] leading-[1.6] text-slate-300">
                <Check size={15} className="text-emerald-400 shrink-0 mt-[3px]" aria-hidden="true" strokeWidth={2.25} />
                {item}
              </li>
            ))}
          </ul>

          <a
            href={GUMROAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="bf-pill bf-lift mt-8 block w-full px-6 py-3 text-center text-[15px] font-medium bg-cyan-500 text-[#030712] hover:bg-cyan-400"
          >
            Get access
          </a>

          {/* Second payment method, equal billing with the card option. */}
          <button
            type="button"
            onClick={handleCrypto}
            disabled={cryptoLoading}
            aria-busy={cryptoLoading}
            className="bf-pill bf-lift bf-hairline mt-2.5 flex w-full items-center justify-center gap-2 px-6 py-3 text-[14px] font-medium text-cyan-300 hover:border-cyan-500/40 disabled:opacity-60"
          >
            {cryptoLoading ? (
              <>
                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                Redirecting…
              </>
            ) : (
              <>
                <Bitcoin size={15} className="text-cyan-400" aria-hidden="true" />
                Pay with crypto
              </>
            )}
          </button>

          {cryptoFailed && (
            <p className="mt-2 text-center text-[12px] text-rose-400" role="alert">
              Crypto checkout failed. Please try again or pay by card.
            </p>
          )}

          <p className="mt-4 text-center text-[12.5px] bf-t3">
            Card or crypto · BTC, USDT and USDC accepted · Cancel anytime.
          </p>
        </div>
      </div>
    </Section>
  )
}
