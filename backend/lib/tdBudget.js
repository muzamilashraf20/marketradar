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
//   3. A per-minute queue under 8 credits/min. P1 waiters go first. A per-minute 429 pauses the
//      queue for 60s; nothing here ever retries a request.
//
// Blocked or rate-limited calls REJECT (err.tdBlocked / err.td429). Every caller already has a
// cache / last-good fallback in its catch — that fallback is the whole point.

export const TD_DAILY_LIMIT = 800
export const TD_GATES = { P1: 750, P2: 650, P3: 550 }
const MINUTE_CAP = 7                 // 1 credit of headroom under the plan's 8/min
const MINUTE_WINDOW = 60 * 1000
const MINUTE_PAUSE = 60 * 1000       // after a per-minute 429
const PERSIST_DEBOUNCE = 15 * 1000
const STATE_KEY = 'td_budget'
const PRIORITY = { P1: 0, P2: 1, P3: 2 }

const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10)
const nextUtcMidnight = (t = Date.now()) => { const d = new Date(t); d.setUTCHours(24, 0, 0, 0); return d.getTime() }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const freshState = () => ({ day: utcDay(), used: 0, byTier: { P1: 0, P2: 0, P3: 0 }, byCaller: {}, stoppedUntil: null, stopReason: null })

function blockedError(tier, caller, why) {
  const e = new Error(`TwelveData ${tier} blocked (${why}) — serving cache [${caller}]`)
  e.tdBlocked = true
  return e
}

export function createTdBudget({ supabase, log = console }) {
  let state = freshState()
  let lastLabel = 'OPEN'
  let persistTimer = null
  let pausedUntil = 0
  const sent = []                  // [{ t, credits }] sent within the last minute
  const queue = []                   // [{ tier, credits, seq, resolve }]
  let seq = 0
  let pumping = false

  const persistNow = async () => {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
    if (!supabase) return
    try {
      const { error } = await supabase.from('app_state')
        .upsert({ key: STATE_KEY, value: state, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) log.error(`⚠️ [td-budget] persist failed: ${error.message}`)
    } catch (e) { log.error(`⚠️ [td-budget] persist error: ${e?.message}`) }
  }
  const persistSoon = () => { if (!persistTimer) persistTimer = setTimeout(persistNow, PERSIST_DEBOUNCE) }

  const ready = (async () => {
    if (!supabase) return
    try {
      const { data, error } = await supabase.from('app_state').select('value').eq('key', STATE_KEY).maybeSingle()
      const v = data?.value
      if (!error && v?.day === utcDay()) {
        state = { ...freshState(), ...v, byTier: { P1: 0, P2: 0, P3: 0, ...(v.byTier || {}) }, byCaller: { ...(v.byCaller || {}) } }
      }
    } catch (e) { log.error(`⚠️ [td-budget] load error: ${e?.message}`) }
    lastLabel = label()
    log.log(`💳 [td-budget] boot · ${line()}`)
  })()

  function rollover() {
    if (state.day === utcDay()) return
    log.log(`💳 [td-budget] day closed ${state.day} · used ${state.used}/${TD_DAILY_LIMIT} — reset`)
    state = freshState()
    persistNow()
  }
  function stopped() { return state.stoppedUntil && Date.now() < state.stoppedUntil }
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
    const now = label()
    if (now !== lastLabel) { log.warn(`💳 [td-budget] ${lastLabel} → ${now} · ${line()}`); lastLabel = now; persistNow() }
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
        const now = Date.now()
        if (pausedUntil > now) { await sleep(pausedUntil - now); continue }
        while (sent.length && now - sent[0].t >= MINUTE_WINDOW) sent.shift()
        const used = sent.reduce((s, x) => s + x.credits, 0)
        const job = queue[0]
        // An oversized batch (the 8-symbol cross-asset quote) goes out alone into an empty window.
        if (used === 0 || used + job.credits <= MINUTE_CAP) {
          sent.push({ t: now, credits: job.credits })
          queue.shift()
          job.resolve()
          continue
        }
        await sleep(Math.max(50, MINUTE_WINDOW - (now - sent[0].t) + 50))
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
      pausedUntil = Date.now() + MINUTE_PAUSE
      log.warn(`💳 [td-budget] per-minute 429 [${tier} ${caller}] — "${msg.slice(0, 160)}" → queue paused 60s, no retry`)
    }
    const e = new Error(`TwelveData 429 [${caller}]: ${msg.slice(0, 120)}`)
    e.td429 = true
    return e
  }

  // request: () => axios promise. Resolves with the axios response; rejects tdBlocked / td429 /
  // whatever the request itself threw.
  async function call({ tier = 'P3', credits = 1, caller = 'unknown', request }) {
    credits = Math.max(1, credits | 0)
    await ready
    let why = allowed(tier, credits)
    if (why) throw blockedError(tier, caller, why)
    await slot(tier, credits)
    why = allowed(tier, credits)          // the budget may have moved while this call queued
    if (why) throw blockedError(tier, caller, why)

    state.used += credits
    state.byTier[tier] = (state.byTier[tier] || 0) + credits
    state.byCaller[caller] = (state.byCaller[caller] || 0) + credits
    persistSoon()
    noteTransition()

    let res
    try { res = await request() } catch (e) {
      const msg = read429(e)
      if (msg) throw handle429(msg, tier, caller)
      throw e
    }
    const msg = read429(res)
    if (msg) throw handle429(msg, tier, caller)
    return res
  }

  const hourly = setInterval(() => { rollover(); log.log(`💳 [td-budget] ${line()}`) }, 60 * 60 * 1000)
  hourly.unref?.()

  return { call, ready, status: () => ({ ...state, state: label() }), line }
}
