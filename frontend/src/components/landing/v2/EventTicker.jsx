import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import EmptyState from '../../ui/EmptyState'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const CACHE_KEY = 'bf_landing_events'
const ROTATE_MS = 3600
// Backstop clock re-read. The exact drop-off is a timer set for the soonest
// event's time (see below); this only covers timers a browser has delayed.
const CLOCK_MS = 30000
const COUNT = 3
const ROW = 38 // px — one ticker row, matching the reserved h-[38px]

// "in 42m", "in 5h 12m", "in 2d 4h" — computed from the event's own time.
const countdown = ms => {
  const m = Math.max(1, Math.round(ms / 60000))
  if (m < 60) return `in ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `in ${h}h ${m % 60}m`
  return `in ${Math.floor(h / 24)}d ${h % 24}h`
}

const IMPACT = {
  High: { label: 'High impact', cls: 'text-rose-400 border-rose-400/30' },
  Medium: { label: 'Medium impact', cls: 'text-amber-400 border-amber-400/30' },
  Low: { label: 'Low impact', cls: 'text-slate-400 border-slate-500/30' },
}

const isServer = typeof window === 'undefined'

const fmtWhen = iso => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-GB', {
    weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC'
}

// Upcoming only, soonest first, capped. Applied to EVERY source — live, baked
// or cached — and on every render against the current clock, so an event whose
// time has passed is never on screen, however old the data it came from.
const upcomingOf = (list, now) =>
  (Array.isArray(list) ? list : [])
    .filter(e => e?.title && new Date(e.date).getTime() > now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, COUNT)

/* Upcoming high-impact events from the economic calendar, rotating.

   Real data, so the hero labels it live — never "Demo data".

   WHERE THE EVENTS COME FROM
   1. Build time: the build fetched /api/calendar and inlined up to three
      upcoming events as window.__BF_EVENTS__. They were upcoming THEN; by the
      time a visitor loads the page they may not be, so they are filtered
      against the visitor's clock before anything renders.
   2. On load: /api/calendar is fetched live and replaces them.
   3. If that fails: a copy saved on an earlier visit, if it holds anything
      still upcoming; otherwise the (filtered) build-time set stays.
   If nothing upcoming is left from any source, an empty state says so.

   THE STATIC HTML CARRIES NO EVENT. A prerendered event line would be read by
   crawlers and no-JS visitors long after the event had passed, and nothing
   could filter it for them. The server render shows a neutral line instead;
   the browser fills in real, upcoming events on mount. */
export default function EventTicker() {
  const [events, setEvents] = useState(
    () => (isServer ? [] : (globalThis.__BF_EVENTS__ || []))
  )
  const [now, setNow] = useState(() => Date.now())
  const [pos, setPos] = useState(0)
  const [snap, setSnap] = useState(false)

  useEffect(() => {
    let alive = true

    fetch(`${API_BASE}/api/calendar`)
      .then(r => r.json())
      .then(json => {
        if (!alive) return
        // The endpoint sorts by impact first; keep the high-impact ones, which
        // are the only events worth a hero slot, and fall back to any impact.
        const all = Array.isArray(json) ? json : []
        const high = upcomingOf(all.filter(e => e.impact === 'High'), Date.now())
        const next = high.length ? high : upcomingOf(all, Date.now())
        if (!next.length) throw new Error('empty')
        setEvents(next)
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)) } catch { /* private mode */ }
      })
      .catch(() => {
        try {
          const cached = upcomingOf(JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'), Date.now())
          if (alive && cached.length) setEvents(cached)
        } catch { /* keep whatever is already held; the render filters it */ }
      })

    return () => { alive = false }
  }, [])

  const upcoming = upcomingOf(events, now)
  const soonest = upcoming.length ? new Date(upcoming[0].date).getTime() : null

  /* Re-read the clock the moment the soonest event's time arrives, so it drops
     off exactly then rather than on the next poll. Background tabs throttle
     timers, so the clock is also re-read when the tab becomes visible, and a
     slow interval backs both up. */
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    const slow = setInterval(tick, CLOCK_MS)
    document.addEventListener('visibilitychange', onVisible)
    let exact
    if (soonest != null) {
      // setTimeout caps at ~24.8 days; an event further out is caught by the interval.
      const wait = soonest - Date.now() + 25
      if (wait < 2 ** 31 - 1) exact = setTimeout(tick, Math.max(0, wait))
    }
    return () => {
      clearInterval(slow)
      clearTimeout(exact)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [soonest])

  /* Smooth vertical scroll. The rows sit in a column one ROW tall each and the
     column slides up by a row every ROTATE_MS. The first event is repeated at
     the end so the wrap is seamless: after sliding onto that copy, the column
     jumps back to the real first row with its transition switched off, and
     since the two rows are identical the jump cannot be seen. Transform only. */
  const count = upcoming.length
  const [reduced] = useState(
    () => !isServer && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )

  useEffect(() => {
    if (count < 2 || reduced) return // hold on the next event; no rotation, no motion
    const id = setInterval(() => setPos(p => p + 1), ROTATE_MS)
    return () => clearInterval(id)
  }, [count, reduced])

  useEffect(() => {
    if (!snap) return
    let inner = 0
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setSnap(false)) })
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner) }
  }, [snap])

  // Height is reserved in every state — CLS stays at zero.
  if (isServer) {
    return (
      <div className="h-[38px] flex items-center overflow-hidden">
        <p className="text-[12.5px] bf-t3">Upcoming high-impact events from the economic calendar.</p>
      </div>
    )
  }

  if (!upcoming.length) {
    return (
      <div className="h-[38px] flex items-center overflow-hidden">
        <EmptyState size="sm" icon={CalendarClock} message="No upcoming high-impact events on the calendar right now." className="w-full" />
      </div>
    )
  }

  const rows = count > 1 ? [...upcoming, upcoming[0]] : upcoming
  const at = count > 1 ? Math.min(pos, count) : 0
  const onSlid = () => {
    if (pos >= count && count > 1) { setSnap(true); setPos(0) }
  }

  return (
    <div className="h-[38px] overflow-hidden" aria-live="off">
      <ul
        className={snap || reduced ? '' : 'motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-bf'}
        style={{ transform: `translateY(-${at * ROW}px)` }}
        onTransitionEnd={onSlid}
      >
        {rows.map((e, k) => {
          const impact = IMPACT[e.impact] || IMPACT.Low
          // The soonest event is highlighted as "Next", with a countdown worked
          // out from its real time. The repeated first row is decorative.
          const isNext = k % count === 0
          return (
            <li
              key={`${e.title}-${e.date}-${k}`}
              className="h-[38px] flex items-center gap-2.5 text-[12.5px] min-w-0"
              aria-hidden={k === count && count > 1 ? 'true' : undefined}
            >
              {isNext && <span className="bf-blip w-1.5 h-1.5 shrink-0 rounded-full bg-bf-accent" aria-hidden="true" />}
              <span className={`bf-pill shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border ${impact.cls}`}>
                {impact.label}
              </span>
              <span className={`truncate ${isNext ? 'text-bf-text' : 'text-slate-300'}`}>
                <span className="bf-t3 bf-mono">{e.country}</span>{' '}
                {e.title}
              </span>
              {isNext ? (
                <span className="shrink-0 text-[11.5px] font-medium text-bf-accent-soft tabular-nums">
                  Next · {countdown(new Date(e.date).getTime() - now)}
                </span>
              ) : (
                <span className="bf-t3 shrink-0 hidden sm:inline bf-mono">{fmtWhen(e.date)}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
