/* Forex sessions, in each market's own local hours, so daylight-saving moves
   with the market instead of drifting an hour twice a year (the fixed-UTC
   table in pages/Sessions.jsx does drift). Same rule as the Topbar's indicator:
   the week runs Sunday 17:00 to Friday 17:00 New York time.

   Times shown to the reader are converted to THEIR local time by the caller. */
export const SESSIONS = [
  { id: 'sydney', name: 'Sydney', tz: 'Australia/Sydney', open: 7, close: 16 },
  { id: 'tokyo', name: 'Tokyo', tz: 'Asia/Tokyo', open: 9, close: 18 },
  { id: 'london', name: 'London', tz: 'Europe/London', open: 8, close: 17 },
  { id: 'newyork', name: 'New York', tz: 'America/New_York', open: 8, close: 17 },
]

const hourIn = (tz, d) => {
  const h = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(d), 10)
  return h === 24 ? 0 : h
}
const DAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const nyDay = d => DAY[new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(d)]

export function isForexClosed(d = new Date()) {
  const day = nyDay(d)
  const h = hourIn('America/New_York', d)
  return day === 6 || (day === 5 && h >= 17) || (day === 0 && h < 17)
}

const isOpenAt = (s, d) => {
  if (isForexClosed(d)) return false
  const h = hourIn(s.tz, d)
  return h >= s.open && h < s.close
}

export const openSessions = (d = new Date()) => SESSIONS.filter(s => isOpenAt(s, d))

/* The next thing to open: a session, or the market itself after the weekend.
   Every boundary here falls on the hour in its own zone, and all four zones sit
   on whole-hour offsets, so stepping hour by hour finds it exactly. */
export function nextOpening(d = new Date()) {
  const start = new Date(d)
  start.setMinutes(0, 0, 0)
  for (let i = 1; i <= 24 * 4; i++) {
    const t = new Date(start.getTime() + i * 3600 * 1000)
    const before = new Date(t.getTime() - 60 * 1000)
    if (isForexClosed(before) && !isForexClosed(t)) {
      const first = SESSIONS.find(s => isOpenAt(s, t))
      return { at: t, name: first ? first.name : 'Market', marketReopens: true }
    }
    const opening = SESSIONS.find(s => isOpenAt(s, t) && !isOpenAt(s, before))
    if (opening) return { at: t, name: opening.name, marketReopens: false }
  }
  return null
}

/* When a session that is open now closes. */
export function closesAt(s, d = new Date()) {
  const start = new Date(d)
  start.setMinutes(0, 0, 0)
  for (let i = 1; i <= 24; i++) {
    const t = new Date(start.getTime() + i * 3600 * 1000)
    if (!isOpenAt(s, t)) return t
  }
  return null
}
