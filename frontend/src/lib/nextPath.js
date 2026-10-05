/* Where to send someone after sign-in or checkout: the `next` query parameter.

   Only a same-site path is accepted — "/bias?x=1#y", never "//evil.com" or
   "https://…" — so a crafted link cannot bounce a fresh sign-in off-site. */
export function safeNext(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return null
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null
  return raw
}

export const nextFromSearch = search => safeNext(new URLSearchParams(search).get('next'))

/* The path a request was for, with its query and hash — what `next` carries. */
export const fullPath = location => `${location.pathname}${location.search}${location.hash}`

/* Google sign-in leaves the site and comes back to /dashboard (the redirect URL
   Supabase allows), so `next` cannot ride along in the URL. It is parked here
   before leaving and picked up by the /dashboard redirect. Ten minutes is
   plenty for an OAuth round trip; anything older is ignored. */
const KEY = 'bf_next'
const TTL_MS = 10 * 60 * 1000

export function rememberNext(path) {
  const p = safeNext(path)
  if (!p) return
  try { sessionStorage.setItem(KEY, JSON.stringify({ p, at: Date.now() })) } catch { /* storage blocked */ }
}

// Read without removing — safe to call while rendering (StrictMode renders twice).
export function peekRememberedNext() {
  try {
    const raw = sessionStorage.getItem(KEY)
    const v = raw ? JSON.parse(raw) : null
    return v && Date.now() - v.at < TTL_MS ? safeNext(v.p) : null
  } catch {
    return null
  }
}

export function clearRememberedNext() {
  try { sessionStorage.removeItem(KEY) } catch { /* storage blocked */ }
}
