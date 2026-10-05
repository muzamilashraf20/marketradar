import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { peekRememberedNext, clearRememberedNext } from '../../lib/nextPath'

/* Old dashboard paths, kept working for good: bookmarks, the links in Telegram
   and email alerts, Google sign-in's return URL and the crypto checkout's
   return URLs all point at them. The query string and hash ride along, so
   /dashboard?crypto=success arrives as /today?crypto=success. */
export function LegacyRedirect({ to }) {
  const { search, hash } = useLocation()
  return <Navigate to={{ pathname: to, search, hash }} replace />
}

/* /dashboard is also where Google sign-in returns (it is the redirect URL
   Supabase allows). If the sign-in started from a deep link, the path it was
   for was parked before leaving the site — go there instead of Today. Only when
   nothing else is in the URL, so a return with its own query (the crypto
   checkout's ?crypto=success) is never overridden.

   Google sign-in uses Supabase's implicit flow: it returns here with the tokens
   in the hash (#access_token=…). Leaving before the Supabase client has read
   them would drop the session, so hold until AuthContext has finished loading
   (it awaits getSession(), which waits for that read), and do not carry the
   token hash on to the next page. A failed sign-in returns #error=…&
   error_description=… instead; that hash is carried on so the sign-in page can
   say what went wrong (RequirePro passes it to /login). */
const TOKEN_HASH = /access_token|refresh_token/
const ERROR_HASH = /error_description|[#&]error=/
export function DashboardRedirect() {
  const { search, hash } = useLocation()
  const { loading } = useAuth()
  const tokens = TOKEN_HASH.test(hash)
  const failed = ERROR_HASH.test(hash)
  const parked = !search && !failed ? peekRememberedNext() : null
  const waiting = (tokens || failed) && loading
  // Used once: cleared as soon as this redirect actually goes somewhere.
  useEffect(() => { if (!waiting) clearRememberedNext() }, [waiting])
  if (waiting) return null
  if (parked) return <Navigate to={parked} replace />
  return <Navigate to={{ pathname: '/today', search, hash: tokens ? '' : hash }} replace />
}

/* /pricing: the checkout screen for a signed-in account, the landing's pricing
   section for a visitor. The crypto checkout cancels back to
   /pricing?crypto=cancelled, so the query is kept either way. */
export function PricingRedirect() {
  const { user, loading } = useAuth()
  const { search, hash } = useLocation()
  if (loading) return null
  if (user) return <Navigate to={{ pathname: '/subscribe', search, hash }} replace />
  return <Navigate to={{ pathname: '/', search, hash: '#pricing' }} replace />
}
