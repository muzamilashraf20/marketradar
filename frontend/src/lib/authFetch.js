import { supabase } from './supabase'

/* Always use a fresh access token — the Supabase client auto-refreshes, so the
   token stored on the user object goes stale long before the session does. Falls
   back to the stored one if the session lookup fails.

   This lived as a private copy in TradeJournal.jsx and Settings.jsx. It is here
   now because the dashboard's read-only panels need it too: several API routes
   that used to answer anyone are split by caller, and the app has to identify
   itself to get the full payload rather than the public one. */
export const getFreshToken = async (fallback) => {
  try {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token || fallback
  } catch {
    return fallback
  }
}

/* fetch with the caller's session attached when there is one.

   Deliberately does NOT fail when signed out. The routes this is used against
   answer either way — anonymously they return the public shape, with a token
   the full one — so a missing session degrades the payload, never the request.
   Callers that must be signed in use requireUser on the server and check the
   401 themselves. */
export async function authedFetch(url, { token, ...init } = {}) {
  const fresh = await getFreshToken(token)
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(fresh ? { Authorization: `Bearer ${fresh}` } : {}),
    },
  })
  reportDenial(res)
  return res
}

/* A Pro route that refuses the caller answers 401 { code: 'login_required' } or
   403 { code: 'pro_required' }. The plan the app is showing is then out of date
   (lapsed, or just bought), so AuthContext listens for this and asks the server
   again. Reads a clone, so the caller still gets an unread body. */
export const ACCESS_DENIED_EVENT = 'bf:access-denied'

function reportDenial(res) {
  if (res.status !== 401 && res.status !== 403) return
  if (typeof window === 'undefined') return
  res.clone().json().then(body => {
    if (body?.code === 'pro_required' || body?.code === 'login_required') {
      window.dispatchEvent(new CustomEvent(ACCESS_DENIED_EVENT, { detail: { code: body.code } }))
    }
  }).catch(() => {})
}
