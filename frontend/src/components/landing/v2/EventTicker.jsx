import { useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const CACHE_KEY = 'bf_landing_events'
const ROTATE_MS = 3600
const COUNT = 3

const IMPACT = {
  High: { label: 'High impact', cls: 'text-rose-400 border-rose-400/30' },
  Medium: { label: 'Medium impact', cls: 'text-amber-400 border-amber-400/30' },
  Low: { label: 'Low impact', cls: 'text-slate-400 border-slate-500/30' },
}

const fmtWhen = iso => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-GB', {
    weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC'
}

/* ═══════════ Animation 4 — news ticker ═══════════
   Three upcoming economic calendar events, rotating every ~3.6s. The row has a
   fixed height so the rotation cannot move anything below it. */
export default function EventTicker() {
  // Baked in at build time so the prerendered page names a real upcoming event
  // rather than the generic fallback line. See LiveCompass for the full note.
  const [events, setEvents] = useState(
    () => (typeof globalThis !== 'undefined' ? globalThis.__BF_EVENTS__ : null) || []
  )
  const [i, setI] = useState(0)

  useEffect(() => {
    let alive = true

    const take = list => {
      const now = Date.now()
      return (list || [])
        .filter(e => e?.title && new Date(e.date).getTime() > now)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, COUNT)
    }

    fetch(`${API_BASE}/api/calendar`)
      .then(r => r.json())
      .then(json => {
        if (!alive) return
        // The endpoint sorts by impact first; re-sort by time and keep the
        // high-impact ones, which are the only events worth a hero slot.
        const high = take(Array.isArray(json) ? json.filter(e => e.impact === 'High') : [])
        const next = high.length ? high : take(Array.isArray(json) ? json : [])
        if (!next.length) throw new Error('empty')
        setEvents(next)
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)) } catch { /* private mode */ }
      })
      .catch(() => {
        // Same rule as the compass: fall back to what we last saw, never an error.
        try {
          const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]')
          // Only replace what is on screen if the cache actually holds something.
          // An empty cache used to overwrite the events baked into the
          // prerendered page, so a failed fetch downgraded a real event line to
          // the generic fallback.
          const next = Array.isArray(cached) ? take(cached) : []
          if (alive && next.length) setEvents(next)
        } catch { /* leave whatever is already rendered */ }
      })

    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (events.length < 2) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) return // hold on one item; no rotation, no motion
    const id = setInterval(() => setI(p => (p + 1) % events.length), ROTATE_MS)
    return () => clearInterval(id)
  }, [events.length])

  const e = events[i]
  const impact = IMPACT[e?.impact] || IMPACT.Low

  // Height is reserved whether or not an event ever arrives — CLS stays at zero.
  return (
    <div className="h-[38px] flex items-center overflow-hidden" aria-live="off">
      {e ? (
        <p key={i} className="bf-ticker-item flex items-center gap-2.5 text-[12.5px] min-w-0">
          <span className={`bf-pill shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border ${impact.cls}`}>
            {impact.label}
          </span>
          <span className="text-slate-300 truncate">
            <span className="bf-t3 bf-mono">{e.country}</span>{' '}
            {e.title}
          </span>
          <span className="bf-t3 shrink-0 hidden sm:inline bf-mono">{fmtWhen(e.date)}</span>
        </p>
      ) : (
        <p className="text-[12.5px] bf-t3">Upcoming high-impact events from the economic calendar.</p>
      )}
    </div>
  )
}
