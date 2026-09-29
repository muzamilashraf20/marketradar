// Test vectors for lib/tdBudget.js — the TwelveData credit governor — on a VIRTUAL clock.
//   node backend/scripts/tdBudget.test.mjs
//
// The simulated TwelveData records every request at the moment it RECEIVES it (after a random
// uplink latency), which is how the real API counts its per-minute limit. The headline test is a
// deploy-time boot burst: 40+ credits of calls queued at once, with the previous process's last
// minute still in flight — and no rolling 60s window, as TwelveData sees it, may exceed 8.

import { createTdBudget, TD_MINUTE_LIMIT } from '../lib/tdBudget.js'

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`)
}
const quiet = { log() {}, warn() {}, error() {} }
const T0 = Date.parse('2026-09-30T09:00:00Z')
const DAY = '2026-09-30'

// ── virtual clock: sleep() parks on a timer list; run() advances time timer by timer ──
function makeClock(start) {
  let t = start
  const timers = []
  const tick = () => new Promise(r => setImmediate(r))
  return {
    now: () => t,
    sleep: (ms) => new Promise(r => timers.push({ at: t + Math.max(0, ms), r })),
    async run(done, maxSteps = 200000) {
      for (let i = 0; i < maxSteps; i++) {
        await tick(); await tick()
        if (done()) return true
        if (!timers.length) { await tick(); if (done()) return true; if (!timers.length) return false }
        timers.sort((a, b) => a.at - b.at)
        const x = timers.shift()
        t = Math.max(t, x.at)
        x.r()
      }
      return false
    },
  }
}
function mockSb(initial) {
  const store = { td_budget: initial }
  return {
    store,
    from: () => ({
      select: () => ({ eq: (_, k) => ({ maybeSingle: async () => ({ data: store[k] ? { value: store[k] } : null, error: null }) }) }),
      upsert: async (row) => { store[row.key] = JSON.parse(JSON.stringify(row.value)); return { error: null } },
    }),
  }
}
let seed = 42
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }

// Simulated TwelveData: stamps receipt after a random uplink latency, answers after a random downlink.
function makeTD(clock, receipts) {
  return (credits, caller) => async () => {
    await clock.sleep(20 + rnd() * 1500)            // uplink: 20ms – 1.5s
    receipts.push({ t: clock.now(), credits, caller })
    await clock.sleep(20 + rnd() * 1500)            // downlink
    return { status: 200, data: {} }
  }
}
// Worst rolling 60s window and worst calendar minute, as TwelveData would see them.
function worstMinute(receipts) {
  let rolling = 0, calendar = 0
  for (const r of receipts) {
    rolling = Math.max(rolling, receipts.filter(x => x.t <= r.t && x.t > r.t - 60000).reduce((s, x) => s + x.credits, 0))
    const m = Math.floor(r.t / 60000)
    calendar = Math.max(calendar, receipts.filter(x => Math.floor(x.t / 60000) === m).reduce((s, x) => s + x.credits, 0))
  }
  return { rolling, calendar }
}

// The calls a deploy fires in its first minutes: v2 boot run (cross-asset + 8 daily-candle seeds),
// the watcher's spot batch, scoring, a Currency Strength page refresh, an admin price check.
const BURST = [
  ['P2', 8, 'cross-asset'], ['P3', 7, 'currency-strength'], ['P1', 6, 'v2-spot'], ['P3', 5, 'admin-prices'],
  ...Array.from({ length: 8 }, (_, i) => ['P1', 1, `v2-daily-candles-${i}`]),
  ...Array.from({ length: 6 }, (_, i) => ['P3', 1, `scoring-${i}`]),
]
const burstCredits = BURST.reduce((s, [, c]) => s + c, 0)

async function bootBurst({ previous, bootQuietMs, extraOldReceipts = [] }) {
  const clock = makeClock(T0)
  const receipts = [...extraOldReceipts]
  const td = makeTD(clock, receipts)
  const b = createTdBudget({ supabase: mockSb(previous), log: quiet, now: clock.now, sleep: clock.sleep, ...(bootQuietMs != null ? { bootQuietMs } : {}) })
  const order = []
  let settled = 0
  const results = BURST.map(([tier, credits, caller]) =>
    b.call({ tier, credits, caller, request: async () => { order.push({ caller, tier, t: clock.now() }); return td(credits, caller)() } })
      .then(() => 'ok', e => e.message).finally(() => settled++))
  const finished = await clock.run(() => settled === BURST.length)
  return { finished, results: await Promise.all(results), receipts, order, clock, b }
}

// ── 1. deploy-time boot burst, previous process still in its last minute ─────────
{
  // The old process sent 5 credits 20s ago (answered) and 3 more 4s ago that never got an answer
  // before it was killed. TwelveData received them ~0.5s after sending.
  const previous = { day: DAY, used: 300, byTier: {}, byCaller: {}, recent: [
    { sentAt: T0 - 20000, doneAt: T0 - 19000, credits: 5 },
    { sentAt: T0 - 4000, doneAt: null, credits: 3 },
  ] }
  const old = [{ t: T0 - 19500, credits: 5, caller: 'old-process' }, { t: T0 - 3500, credits: 3, caller: 'old-process' }]
  const r = await bootBurst({ previous, extraOldReceipts: old })
  const w = worstMinute(r.receipts)
  check(`boot burst of ${burstCredits} credits all completes`, r.finished && r.results.every(x => x === 'ok'), JSON.stringify(r.results))
  check(`no rolling minute exceeds ${TD_MINUTE_LIMIT} (TwelveData's view, incl. the old process) — worst ${w.rolling}`, w.rolling <= TD_MINUTE_LIMIT)
  check(`no calendar minute exceeds ${TD_MINUTE_LIMIT} — worst ${w.calendar}`, w.calendar <= TD_MINUTE_LIMIT)
  const firstSend = Math.min(...r.order.map(o => o.t))
  check('nothing is sent in the first 65s after boot', firstSend >= T0 + 65000, `first send at +${(firstSend - T0) / 1000}s`)
  const firstP1 = r.order.findIndex(o => o.tier === 'P1'), firstOther = r.order.findIndex(o => o.tier !== 'P1')
  check('P1 goes first once the window opens', firstP1 === 0 && firstOther > firstP1, JSON.stringify(r.order.slice(0, 3)))
  check('daily counter resumed from the previous process', r.b.status().used === 300 + burstCredits, String(r.b.status().used))
  console.log(`      (burst drained in ${((Math.max(...r.receipts.map(x => x.t)) - T0) / 60000).toFixed(1)} virtual minutes)`)
}

// ── 2. even with NO boot quiet period, the seeded window alone prevents the overlap ──
{
  const previous = { day: DAY, used: 0, byTier: {}, byCaller: {}, recent: [{ sentAt: T0 - 3000, doneAt: null, credits: 6 }] }
  const old = [{ t: T0 - 2400, credits: 6, caller: 'old-process' }]
  const r = await bootBurst({ previous, bootQuietMs: 0, extraOldReceipts: old })
  const w = worstMinute(r.receipts)
  check(`without the quiet period, seeded window still keeps every minute ≤ ${TD_MINUTE_LIMIT} — worst ${w.rolling}`, r.finished && w.rolling <= TD_MINUTE_LIMIT)
}

// ── 3. the old failure mode: 1 credit, then an 8-symbol batch, under latency jitter ──
{
  let worst = 0
  for (let k = 0; k < 40; k++) {
    const clock = makeClock(T0)
    const receipts = []
    const td = makeTD(clock, receipts)
    const b = createTdBudget({ supabase: mockSb(null), log: quiet, now: clock.now, sleep: clock.sleep, bootQuietMs: 0 })
    let settled = 0
    b.call({ tier: 'P1', credits: 1, caller: 'spot', request: td(1, 'spot') }).finally(() => settled++)
    b.call({ tier: 'P2', credits: 8, caller: 'cross-asset', request: td(8, 'cross-asset') }).finally(() => settled++)
    b.call({ tier: 'P1', credits: 2, caller: 'spot2', request: td(2, 'spot2') }).finally(() => settled++)
    await clock.run(() => settled === 3)
    worst = Math.max(worst, worstMinute(receipts).rolling)
  }
  check(`1 + 8-symbol batch + 2 under 20ms–1.5s jitter (40 trials): worst minute ${worst} ≤ ${TD_MINUTE_LIMIT}`, worst <= TD_MINUTE_LIMIT)
}

// ── 4. a request of more than 8 symbols is refused, never sent ─────────────────────
{
  const clock = makeClock(T0)
  const b = createTdBudget({ supabase: mockSb(null), log: quiet, now: clock.now, sleep: clock.sleep, bootQuietMs: 0 })
  let sentIt = false
  const e = await b.call({ tier: 'P2', credits: 9, caller: 'too-big', request: async () => { sentIt = true; return {} } }).catch(x => x)
  check('9 symbols in one request → refused, not sent', e?.tdBlocked === true && !sentIt, e?.message)
}

// ── 5. daily gates, daily 429, minute 429, rollover (regression) ───────────────────
async function quick(previous, fn) {
  const clock = makeClock(T0)
  const sb = mockSb(previous)
  const b = createTdBudget({ supabase: sb, log: quiet, now: clock.now, sleep: clock.sleep, bootQuietMs: 0 })
  let done = false, out
  fn(b, clock, sb).then(v => { out = v; done = true }, e => { out = e; done = true })
  await clock.run(() => done)
  return out
}
const ok = async () => ({ status: 200, data: {} })
check('P3 gate: 550 allowed, 551 cache-only', await quick({ day: DAY, used: 545, byTier: {}, byCaller: {} }, async (b) => {
  await b.call({ tier: 'P3', credits: 5, caller: 't', request: ok })
  const e = await b.call({ tier: 'P3', credits: 1, caller: 't', request: ok }).catch(x => x)
  return e?.tdBlocked === true && b.status().state === 'P3-CACHE'
}))
check('P2 gate 650, P1 ceiling 750', await quick({ day: DAY, used: 649, byTier: {}, byCaller: {} }, async (b) => {
  await b.call({ tier: 'P2', credits: 1, caller: 't', request: ok })
  const e2 = await b.call({ tier: 'P2', credits: 1, caller: 't', request: ok }).catch(x => x)
  return e2?.tdBlocked === true
}) && await quick({ day: DAY, used: 748, byTier: {}, byCaller: {} }, async (b) => {
  await b.call({ tier: 'P1', credits: 2, caller: 't', request: ok })
  const e = await b.call({ tier: 'P1', credits: 1, caller: 't', request: ok }).catch(x => x)
  return e?.tdBlocked === true && b.status().state === 'STOPPED'
}))
check('daily 429 stops everything, syncs the count, survives restart', await quick(null, async (b, clock, sb) => {
  const err = Object.assign(new Error('429'), { response: { status: 429, data: { code: 429, message: 'You have run out of API credits for the day. 1213 API credits were used, with the current limit being 800.' } } })
  const e = await b.call({ tier: 'P1', credits: 1, caller: 's', request: async () => { throw err } }).catch(x => x)
  const e2 = await b.call({ tier: 'P1', credits: 1, caller: 's', request: ok }).catch(x => x)
  await clock.sleep(10)
  const b2 = createTdBudget({ supabase: sb, log: quiet, now: clock.now, sleep: clock.sleep, bootQuietMs: 0 })
  const e3 = await b2.call({ tier: 'P1', credits: 1, caller: 's', request: ok }).catch(x => x)
  return e?.td429 && b.status().used === 1213 && e2?.tdBlocked && e3?.tdBlocked
}))
check('minute 429 → one call, no retry, no day stop', await quick(null, async (b) => {
  let calls = 0
  const e = await b.call({ tier: 'P1', credits: 1, caller: 'm', request: async () => { calls++; return { data: { code: 429, message: 'You have run out of API credits for the current minute. 9 API credits were used, with the current limit being 8.' } } } }).catch(x => x)
  return e?.td429 && calls === 1 && b.status().state === 'OPEN'
}))
check('previous day in app_state → counter starts at 0', await quick({ day: '2000-01-01', used: 790, byTier: {}, byCaller: {}, stoppedUntil: T0 + 1e9 }, async (b) => {
  await b.call({ tier: 'P3', credits: 1, caller: 't', request: ok })
  return b.status().used === 1
}))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
