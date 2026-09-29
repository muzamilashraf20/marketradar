// TwelveData credit governor. EVERY TwelveData request goes through call() — nothing else may
// hit api.twelvedata.com directly.
//
// The free Basic plan is 800 credits/day and 8/min, billed per symbol. TwelveData counts a call
// made after the daily cap as "used" too (it reported 1213/800 on 2026-09-28), so without a
// governor an exhausted day keeps hammering the API all evening. This module owns three things:
//
//   1. A daily counter (UTC day, same reset as TwelveData) persisted in app_state, so a deploy or
//      restart resumes the count instead of starting from zero.
//   2. Priority gates. Past each threshold a tier stops fetching and its callers serve cache:
//        P3 (strength page, scoring, briefs, extras)  → cache-only above 550
//        P2 (cross-asset basket / yields)             → cache-only above 650
//        P1 (invalidation spot, engine daily candles) → everything stops above 750
//      A "run out of API credits for the day" 429 also stops everything until 00:00 UTC.
//   3. A per-minute queue that keeps TwelveData's view of every rolling minute at or under 8
//      credits (1 credit per SYMBOL). P1 waiters go first. Nothing here ever retries a request.
//
// PER-MINUTE — why it is stricter than "count sends in the last 60s" (2026-09-30):
// "[td-budget] per-minute 429 [P2 cross-asset] — 9 API credits were used, limit 8". Credits were
// already counted per symbol; the leak was TIMING. TwelveData counts a request when it RECEIVES it,
// we counted it when we SENT it, and network latency varies — so a 1-credit call and the next
// 8-symbol batch could sit 60s apart in our window yet inside one TwelveData minute. Now:
//   - a request holds its credits from the moment it is sent until 60s after its RESPONSE (an upper
//     bound on when TwelveData received it) plus a 2s margin; an in-flight request always counts;
//   - a call runs only if the window + its own credits stays ≤ 8, otherwise it waits for room;
//     a single request of more than 8 symbols is refused outright (it could never be sent);
//   - a deploy cannot burst: every send is persisted with the daily counter, a new process seeds its
//     window from the previous process's last minute, and it sends nothing in its first 65s.
//
// Blocked or rate-limited calls REJECT (err.tdBlocked / err.td429). Every caller already has a
// cache / last-good fallback in its catch — that fallback is the whole point.

export const TD_DAILY_LIMIT = 800
export const TD_GATES = { P1: 750, P2: 650, P3: 550 }
export const TD_MINUTE_LIMIT = 8        // the plan's per-minute credits (1 per symbol)
const MINUTE_WINDOW = 60 * 1000
const WINDOW_MARGIN = 2 * 1000          // slack on top of response-time stamping (clock skew)
const INFLIGHT_RELEASE = 2 * MINUTE_WINDOW   // a request that never settles stops counting after this
const MINUTE_PAUSE = 60 * 1000 + WINDOW_MARGIN   // after a per-minute 429
const BOOT_QUIET = 65 * 1000            // no sends in a new process's first 65s (the old one's last minute ages out)
const STATE_KEY = 'td_budget'
const PRIORITY = { P1: 0, P2: 1, P3: 2 }

const realSleep = (ms) => new Promise(r => setTimeout(r, ms))

function blockedError(tier, caller, why) {
  const e = new Error(`TwelveData ${tier} blocked (${why}) — serving cache [${caller}]`)
  e.tdBlocked = true
  return e
}

// now / sleep are injectable so the per-minute behaviour can be tested on a virtual clock.
export function createTdBudget({ supabase, log = console, now = () => Date.now(), sleep = realSleep, bootQuietMs = BOOT_QUIET }) {
  const utcDay = () => new Date(now()).toISOString().slice(0, 10)
  const nextUtcMidnight = () => { const d = new Date(now()); d.setUTCHours(24, 0, 0, 0); return d.getTime() }
  const freshState = () => ({ day: utcDay(), used: 0, byTier: { P1: 0, P2: 0, P3: 0 }, byCaller: {}, stoppedUntil: null, stopReason: null })

  let state = freshState()
  let lastLabel = 'OPEN'
  let persistTimer = null
  let pausedUntil = 0
  const quietUntil = now() + bootQuietMs
  const sent = []                   // [{ sentAt, doneAt|null, credits }] — this minute's traffic
  const queue = []                  // [{ tier, credits, seq, resolve }]
  let seq = 0
  let pumping = false

  // When an entry stops counting against the minute.
  const expiresAt = (e) => (e.doneAt != null ? e.doneAt + MINUTE_WINDOW + WINDOW_MARGIN : e.sentAt + INFLIGHT_RELEASE)
  function prune(t) { for (let i = sent.length - 1; i >= 0; i--) if (expiresAt(sent[i]) <= t) sent.splice(i, 1) }
  const windowCredits = (t) => { prune(t); return sent.reduce((s, e) => s + e.credits, 0) }

  const persistNow = async () => {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
    if (!supabase) return
    try {
      prune(now())
      const value = { ...state, recent: sent.map(e => ({ sentAt: e.sentAt, doneAt: e.doneAt, credits: e.credits })) }
      const { error } = await supabase.from('app_state')
        .upsert({ key: STATE_KEY, value, updated_at: new Date(now()).toISOString() }, { onConflict: 'key' })
      if (error) log.error(`⚠️ [td-budget] persist failed: ${error.message}`)
    } catch (e) { log.error(`⚠️ [td-budget] persist error: ${e?.message}`) }
  }

  const ready = (async () => {
    if (!supabase) return
    try {
      const { data, error } = await supabase.from('app_state').select('value').eq('key', STATE_KEY).maybeSingle()
      const v = data?.value
      if (!error && v) {
        if (v.day === utcDay()) {
          const { recent, ...rest } = v
          state = { ...freshState(), ...rest, byTier: { P1: 0, P2: 0, P3: 0, ...(v.byTier || {}) }, byCaller: { ...(v.byCaller || {}) } }
        }
        // The previous process's last minute still counts against TwelveData's window (any day).
        for (const e of Array.isArray(v.recent) ? v.recent : []) {
          const credits = Math.max(0, e?.credits | 0)
          if (!credits || !Number.isFinite(e.sentAt)) continue
          // Never settled there → assume it did just now (it may still be in flight on the old box).
          sent.push({ sentAt: e.sentAt, doneAt: Number.isFinite(e.doneAt) ? e.doneAt : now(), credits })
        }
        prune(now())
      }
    } catch (e) { log.error(`⚠️ [td-budget] load error: ${e?.message}`) }
    lastLabel = label()
    log.log(`💳 [td-budget] boot · ${line()} · minute window seeded with ${windowCredits(now())} credit(s) from the previous process · quiet ${Math.round(bootQuietMs / 1000)}s`)
  })()

  function rollover() {
    if (state.day === utcDay()) return
    log.log(`💳 [td-budget] day closed ${state.day} · used ${state.used}/${TD_DAILY_LIMIT} — reset`)
    state = freshState()
    persistNow()
  }
  function stopped() { return state.stoppedUntil && now() < state.stoppedUntil }
  function label() {
    if (stopped() || state.used >= TD_GATES.P1) return 'STOPPED'
    if (state.used >= TD_GATES.P2) return 'P2-CACHE'
    if (state.used >= TD_GATES.P3) return 'P3-CACHE'
    return 'OPEN'
  }
  function line() {
    const top = Object.entries(state.byCaller).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`).join(', ')
    return `used ${state.used}/${TD_DAILY_LIMIT} · P1 ${state.byTier.P1} · P2 ${state.byTier.P2} · P3 ${state.byTier.P3} · ${label()}${stopped() ? ` (${state.stopReason}, until 00:00 UTC)` : ''}${top ? ` · top: ${top}` : ''}`
  }
  function noteTransition() {
    const cur = label()
    if (cur !== lastLabel) { log.warn(`💳 [td-budget] ${lastLabel} → ${cur} · ${line()}`); lastLabel = cur; persistNow() }
  }
  // Would `credits` more for this tier stay within its gate?
  function allowed(tier, credits) {
    rollover()
    if (stopped()) return 'daily cap reached'
    const gate = TD_GATES[tier] ?? TD_GATES.P3
    if (state.used + credits > gate) return `${state.used}/${TD_DAILY_LIMIT} used, ${tier} gate ${gate}`
    return null
  }

  function stopForDay(reason, reportedUsed) {
    if (Number.isFinite(reportedUsed) && reportedUsed > state.used) state.used = reportedUsed
    state.stoppedUntil = nextUtcMidnight()
    state.stopReason = reason
    noteTransition()
    persistNow()
  }

  // ── per-minute queue (priority, then FIFO) ──
  async function pump() {
    if (pumping) return
    pumping = true
    try {
      while (queue.length) {
        queue.sort((a, b) => (PRIORITY[a.tier] - PRIORITY[b.tier]) || (a.seq - b.seq))
        const t = now()
        const holdUntil = Math.max(pausedUntil, quietUntil)
        if (holdUntil > t) { await sleep(holdUntil - t); continue }
        const job = queue[0]
        if (windowCredits(t) + job.credits <= TD_MINUTE_LIMIT) {
          const entry = { sentAt: t, doneAt: null, credits: job.credits }
          sent.push(entry)
          queue.shift()
          job.resolve(entry)
          continue
        }
        // Wait for the earliest entry to age out, then look again.
        const next = Math.min(...sent.map(expiresAt))
        await sleep(Math.max(50, next - t + 1))
      }
    } finally { pumping = false }
  }
  const slot = (tier, credits) => new Promise(resolve => { queue.push({ tier, credits, seq: seq++, resolve }); pump() })

  function read429(resOrErr) {
    const status = resOrErr?.response?.status
    const body = resOrErr?.response?.data ?? resOrErr?.data
    if (status !== 429 && body?.code !== 429) return null
    return String(body?.message || resOrErr?.message || '429')
  }
  function handle429(msg, tier, caller) {
    if (/run out of api credits for the day/i.test(msg)) {
      const m = msg.match(/(\d+)\s+API credits were used/i)
      log.warn(`💳 [td-budget] DAILY cap 429 from TwelveData [${caller}] — "${msg.slice(0, 160)}" → all calls stop until 00:00 UTC`)
      stopForDay('TwelveData daily 429', m ? parseInt(m[1], 10) : NaN)
    } else {
      pausedUntil = now() + MINUTE_PAUSE
      log.warn(`💳 [td-budget] per-minute 429 [${tier} ${caller}] — "${msg.slice(0, 160)}" → queue paused 62s, no retry`)
    }
    const e = new Error(`TwelveData 429 [${caller}]: ${msg.slice(0, 120)}`)
    e.td429 = true
    return e
  }

  // request: () => axios promise. Resolves with the axios response; rejects tdBlocked / td429 /
  // whatever the request itself threw. `credits` = number of SYMBOLS in the request.
  async function call({ tier = 'P3', credits = 1, caller = 'unknown', request }) {
    credits = Math.max(1, credits | 0)
    if (credits > TD_MINUTE_LIMIT) throw blockedError(tier, caller, `${credits} symbols exceed the ${TD_MINUTE_LIMIT}/min limit — split the request`)
    await ready
    let why = allowed(tier, credits)
    if (why) throw blockedError(tier, caller, why)
    const entry = await slot(tier, credits)
    why = allowed(tier, credits)          // the budget may have moved while this call queued
    if (why) { entry.doneAt = entry.sentAt - MINUTE_WINDOW - WINDOW_MARGIN; throw blockedError(tier, caller, why) }   // never sent → frees its slot at once

    state.used += credits
    state.byTier[tier] = (state.byTier[tier] || 0) + credits
    state.byCaller[caller] = (state.byCaller[caller] || 0) + credits
    persistNow()                          // the minute window must survive a deploy, so persist every send
    noteTransition()

    let res
    try { res = await request() } catch (e) {
      entry.doneAt = now()
      const msg = read429(e)
      if (msg) throw handle429(msg, tier, caller)
      throw e
    }
    entry.doneAt = now()
    const msg = read429(res)
    if (msg) throw handle429(msg, tier, caller)
    return res
  }

  const hourly = setInterval(() => { rollover(); log.log(`💳 [td-budget] ${line()}`) }, 60 * 60 * 1000)
  hourly.unref?.()

  return { call, ready, status: () => ({ ...state, state: label(), minuteCredits: windowCredits(now()) }), line }
}
