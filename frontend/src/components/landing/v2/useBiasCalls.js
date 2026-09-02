import { useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const CACHE_KEY = 'bf_landing_calls'

/* Closed bias calls, baked into the page at build time and refreshed on load —
   the same pattern the hero compass uses, so the record is in the static HTML
   for a crawler or a visitor with JavaScript disabled. */
export const bakedCalls = () =>
  (typeof globalThis !== 'undefined' ? globalThis.__BF_CALLS__ : null) || null

/* Quoting precision per pair — the convention the backend logs use. */
export const fmtLevel = (pair, v) => {
  if (v == null) return null
  const dp = pair?.includes('JPY') ? 3 : pair === 'XAUUSD' ? 2 : 5
  return Number(v).toFixed(dp)
}

export const fmtPair = p => (p && p.length === 6 ? `${p.slice(0, 3)}/${p.slice(3)}` : p || '')

export const fmtDate = iso => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/* NOTE ON OUTCOMES — the reason this hook passes closed_reason through instead
   of reducing it to held/invalidated.

   The engine closes a bias for three reasons: the price crossed the invalidation
   level (level_break), conviction fell under the floor (conviction_floor), or
   the regime flipped (regime_reversal). There is no state meaning "ran to a
   conclusion and the level held" — a call is either broken, withdrawn, or still
   open. Mapping the two withdrawal reasons onto "Held" would assert a favourable
   outcome the engine never measured, so each reason is shown as itself. */
export function useBiasCalls() {
  const [calls, setCalls] = useState(() => bakedCalls() || [])
  const [ready, setReady] = useState(() => !!bakedCalls())

  useEffect(() => {
    let alive = true
    fetch(`${API_BASE}/api/bias-calls`)
      .then(r => r.json())
      .then(json => {
        if (!alive) return
        if (!json?.success || !Array.isArray(json.calls)) throw new Error('empty')
        setCalls(json.calls)
        setReady(true)
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(json.calls)) } catch { /* private mode */ }
      })
      .catch(() => {
        /* Fall back to the last set seen, never to an error state — but only
           when nothing was baked. The baked set is written at build time and is
           the newest record we have offline; a cache written on some earlier
           visit is older by definition, and letting it win replaced a complete
           list of closed calls with whatever a stale visit happened to hold. */
        if (!alive || bakedCalls()) return setReady(true)
        try {
          const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
          if (Array.isArray(cached) && cached.length) setCalls(cached)
        } catch { /* nothing baked and no cache: the section hides itself */ }
        // Resolve either way. Without this the section skeletons forever when
        // the fetch fails and nothing is baked or cached.
        setReady(true)
      })
    return () => { alive = false }
  }, [])

  return { calls, ready }
}
