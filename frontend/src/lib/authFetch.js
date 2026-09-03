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
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(fresh ? { Authorization: `Bearer ${fresh}` } : {}),
    },
  })
}
