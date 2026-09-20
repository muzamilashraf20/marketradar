// Test vectors for the social triggers (bias card + planner).
//   node backend/scripts/socialTriggers.test.mjs
//
// Same approach as socialPublish.test.mjs: the trigger block is read out of index.js as source and
// run against fakes, so the code under test is the shipped code. `Date` is injected as a constructor
// parameter, which is what lets a test pin the run to "Saturday 07:00 UTC" without touching the
// source. createDraftAndNotify is faked — this file is about WHEN a draft is created and with what
// facts, not about generation, which socialGuardrails/generator tests already cover.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const src = readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8')
const cutOut = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to)
  if (a === -1 || b === -1 || b <= a) throw new Error(`index.js extraction failed at "${from}" — did the section move?`)
  return src.slice(a, b)
}
const block = cutOut('// ⏰ SOCIAL TRIGGERS', '// 🚀 SOCIAL PUBLISHER')
for (const n of ['enqueueBiasCardDraft', 'runSocialPlanner', 'socialScorecardRows']) {
  if (!block.includes(n)) throw new Error(`extraction sanity check failed: ${n} not found`)
}

let pass = 0, fail = 0
const REAL_LOG = console.log, REAL_ERR = console.error
function check(name, ok, detail = '') {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`)
}

// ── State shared by the fakes ─────────────────────────────────────────────────
let NOW = new Date('2026-09-21T07:00:00.000Z')      // Monday by default
let queue = []          // social_queue
let history = []        // bias_history
let snap = {}           // app_state
let drafts = []         // createDraftAndNotify calls
let dms = []
let logs = []
let draftImpl = args => ({ id: 900 + drafts.length, content_type: args.contentType, status: 'draft' })
let calendar = []
let nextQueueId = 1

class FakeDate extends Date {
  constructor(...a) { if (a.length === 0) super(NOW.getTime()); else super(...a) }
  static now() { return NOW.getTime() }
}

function table(name) {
  const st = { filters: [], op: 'select', payload: null, orders: [], limitN: null }
  const store = () => (name === 'social_queue' ? queue : history)
  const rows = () => store().filter(r => st.filters.every(f => f(r)))
  const run = () => {
    if (st.op === 'update') { const hit = rows(); hit.forEach(r => Object.assign(r, st.payload)); return { data: hit.map(r => ({ ...r })), error: null } }
    let out = rows().map(r => ({ ...r }))
    for (const o of [...st.orders].reverse()) out.sort((a, b) => (a[o.col] === b[o.col] ? 0 : a[o.col] > b[o.col] ? 1 : -1) * (o.asc ? 1 : -1))
    if (st.limitN != null) out = out.slice(0, st.limitN)
    return { data: out, error: null }
  }
  const b = {
    select() { return b },
    update(p) { st.op = 'update'; st.payload = p; return b },
    eq(k, v) { st.filters.push(r => r[k] === v); return b },
    in(k, vs) { st.filters.push(r => vs.includes(r[k])); return b },
    gte(k, v) { st.filters.push(r => r[k] >= v); return b },
    order(col, o) { st.orders.push({ col, asc: o?.ascending !== false }); return b },
    limit(n) { st.limitN = n; return b },
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then(res, rej) { return Promise.resolve(run()).then(res, rej) },
  }
  return b
}

function build() {
  const supabase = { from: table }
  const createDraftAndNotify = async args => { drafts.push(args); return draftImpl(args) }
  const v2LoadSnapshot = async k => snap[k] ?? null
  const v2SaveSnapshot = (k, v) => { snap[k] = v }
  const sendTG = async (chat, text) => { dms.push({ chat, text }); return { message_id: 1 } }
  const v2AdminChat = () => '111222333'
  const esc = s => String(s ?? '')
  const getEconomicCalendar = async () => calendar
  const SOCIAL_PILLARS = { macro_insight: 'education', trader_pain: 'trader_psychology', contrarian: 'trader_psychology' }
  const utcDay = () => new FakeDate().toISOString().slice(0, 10)
  const app = { get: () => {} }
  const requireUser = async () => null
  const isAdmin = () => false
  console.log = (...a) => { logs.push(a.join(' ')) }
  console.error = (...a) => { logs.push(a.join(' ')) }
  const mod = new Function(
    'supabase', 'createDraftAndNotify', 'v2LoadSnapshot', 'v2SaveSnapshot', 'sendTG', 'v2AdminChat', 'esc',
    'getEconomicCalendar', 'SOCIAL_PILLARS', 'utcDay', 'app', 'requireUser', 'isAdmin', 'Date',
    `${block}\nreturn { enqueueBiasCardDraft, runSocialPlanner, SOCIAL_FALLBACK_UTC_MIN }`,
  )(supabase, createDraftAndNotify, v2LoadSnapshot, v2SaveSnapshot, sendTG, v2AdminChat, esc,
    getEconomicCalendar, SOCIAL_PILLARS, utcDay, app, requireUser, isAdmin, FakeDate)
  return { ...mod, restore: () => { console.log = REAL_LOG; console.error = REAL_ERR } }
}

const iso = d => new Date(d).toISOString()
const day = (dateStr, time = '07:00') => { NOW = new Date(`${dateStr}T${time}:00.000Z`) }
const qrow = over => { const r = { id: nextQueueId++, platform: 'x', content_type: 'event_preview', status: 'draft', created_at: iso(NOW), ...over }; queue.push(r); return r }
const hist = over => { history.push({ id: history.length + 1, engine: 'v2', pair: 'EURUSD', direction: 'Bearish', generated_at: iso(NOW), performance: null, ...over }) }
function reset() { queue = []; history = []; snap = {}; drafts = []; dms = []; logs = []; calendar = []; nextQueueId = 1; draftImpl = args => ({ id: 900 + drafts.length, content_type: args.contentType, status: 'draft' }) }
const biasResult = over => ({ engine: 'v2', pair: 'EURUSD', direction: 'Bearish', confidence: 72, tradeGrade: 'B', reasoning: 'Rate gap widening. Specs long euro.', bias: { levels: { invalidation: '1.0850' } }, ...over })
const run = async fn => { const m = build(); try { return await fn(m) } finally { m.restore() } }

// ── A. Bias card trigger ──────────────────────────────────────────────────────
{
  day('2026-09-21')
  for (const grade of ['C', 'D', '', null]) {
    reset()
    await run(m => m.enqueueBiasCardDraft(biasResult({ tradeGrade: grade })))
    check(`grade ${grade || '(none)'} → no draft`, drafts.length === 0 && logs.some(l => /below B/.test(l)), logs.join(' | '))
  }
  for (const grade of ['A', 'A-', 'B', 'a-']) {
    reset()
    await run(m => m.enqueueBiasCardDraft(biasResult({ tradeGrade: grade }), 261))
    check(`grade ${grade} → draft created`, drafts.length === 1 && drafts[0].contentType === 'bias_card' && drafts[0].pillar === 'daily_bias', JSON.stringify(drafts))
  }
  reset()
  await run(m => m.enqueueBiasCardDraft(biasResult({ engine: 'v1' })))
  check('v1 engine → no draft', drafts.length === 0 && logs.some(l => /not v2/.test(l)), logs.join(' | '))

  reset()
  await run(m => m.enqueueBiasCardDraft(biasResult(), 261))
  const f = drafts[0].facts
  check('facts are exactly the five fields, no invalidation',
    JSON.stringify(Object.keys(f).sort()) === JSON.stringify(['confidence', 'direction', 'grade', 'pair', 'reasoning']) && !JSON.stringify(f).includes('1.0850'), JSON.stringify(f))
  check('sourceRef carries the bias_history id', drafts[0].sourceRef.biasHistoryId === 261 && drafts[0].sourceRef.trigger === 'bias_engine', JSON.stringify(drafts[0].sourceRef))

  // One per day, whatever the existing card's status.
  for (const status of ['draft', 'approved', 'publishing', 'published']) {
    reset()
    qrow({ content_type: 'bias_card', status })
    await run(m => m.enqueueBiasCardDraft(biasResult(), 262))
    check(`bias card already ${status} today → no second card`, drafts.length === 0 && logs.some(l => /already exists today/.test(l)), logs.join(' | '))
  }
  // A skipped/failed card does not block a new one.
  reset()
  qrow({ content_type: 'bias_card', status: 'skipped' })
  await run(m => m.enqueueBiasCardDraft(biasResult(), 263))
  check('skipped card today does not block a new one', drafts.length === 1, JSON.stringify(drafts.length))

  // Yesterday's card does not block today's.
  reset()
  qrow({ content_type: 'bias_card', status: 'published', created_at: iso(new Date(NOW.getTime() - 26 * 3600e3)) })
  await run(m => m.enqueueBiasCardDraft(biasResult(), 264))
  check('yesterday\'s card does not block today\'s', drafts.length === 1, JSON.stringify(drafts.length))
}

// ── Bias card vs planner draft ────────────────────────────────────────────────
{
  for (const status of ['draft', 'approved']) {
    reset(); day('2026-09-21')
    const planner = qrow({ content_type: 'event_preview', status })
    await run(m => m.enqueueBiasCardDraft(biasResult(), 265))
    check(`planner row (${status}) is replaced by the bias card`,
      queue.find(r => r.id === planner.id).status === 'skipped' && drafts.length === 1 && dms.some(d => /replaced by today's bias card/.test(d.text)), `${queue[0].status} ${drafts.length} ${JSON.stringify(dms)}`)
  }
  for (const status of ['published', 'publishing']) {
    reset(); day('2026-09-21')
    const planner = qrow({ content_type: 'event_preview', status })
    await run(m => m.enqueueBiasCardDraft(biasResult(), 266))
    check(`planner row (${status}) is NOT replaced — bias card skipped instead`,
      queue.find(r => r.id === planner.id).status === status && drafts.length === 0 && logs.some(l => /already went out/.test(l)), `${queue[0].status} ${drafts.length}`)
  }
}

// ── B. Planner ────────────────────────────────────────────────────────────────
{
  // Weekday with a high-impact event today.
  reset(); day('2026-09-21', '07:00')
  calendar = [
    { event: 'CPI y/y', country: 'USD', time: '2026-09-21T12:30:00.000Z', impact: 'High', forecast: '3.1%', previous: '3.0%' },
    { event: 'Retail Sales', country: 'GBP', time: '2026-09-21T06:00:00.000Z', impact: 'Medium' },
    { event: 'Old CPI', country: 'EUR', time: '2026-09-20T12:30:00.000Z', impact: 'High' },
  ]
  await run(m => m.runSocialPlanner())
  check('weekday + high-impact event → event_preview', drafts.length === 1 && drafts[0].contentType === 'event_preview' && drafts[0].pillar === 'calendar', JSON.stringify(drafts.map(d => d.contentType)))
  check('only today\'s high-impact events are passed', drafts[0].facts.events.length === 1 && drafts[0].facts.events[0].title === 'CPI y/y' && drafts[0].facts.events[0].time === '12:30', JSON.stringify(drafts[0].facts.events))
  check('planner marks the slot done', snap.social_planner_state.done.biasWindow === true, JSON.stringify(snap.social_planner_state))

  // Weekday with no events → rotation, index advances only on success.
  reset(); day('2026-09-22', '08:00')
  hist({ reasoning: 'Gold firm as real yields slip.' })
  await run(m => m.runSocialPlanner())
  check('no events → rotation starts at macro_insight', drafts.length === 1 && drafts[0].contentType === 'macro_insight' && drafts[0].pillar === 'education', JSON.stringify(drafts.map(d => d.contentType)))
  check('macro_insight facts carry latest v2 reasoning + events', drafts[0].facts.reasoning === 'Gold firm as real yields slip.' && Array.isArray(drafts[0].facts.events), JSON.stringify(drafts[0].facts))
  check('rotation index advanced to 1', snap.social_rotation === 1, JSON.stringify(snap.social_rotation))

  // Next day continues the rotation.
  queue = []; drafts = []; day('2026-09-23', '08:00')
  await run(m => m.runSocialPlanner())
  check('next day → trader_pain', drafts[0]?.contentType === 'trader_pain' && snap.social_rotation === 2, `${drafts[0]?.contentType} idx=${snap.social_rotation}`)

  // Blocked generation: index must not advance, slot must not be burned.
  reset(); day('2026-09-22', '08:00')
  draftImpl = () => null
  await run(m => m.runSocialPlanner())
  check('blocked draft → rotation index unchanged', (snap.social_rotation ?? 0) === 0, JSON.stringify(snap.social_rotation))
  check('blocked draft → slot not marked done, attempt counted', snap.social_planner_state.done.biasWindow === false && snap.social_planner_state.attempts === 1, JSON.stringify(snap.social_planner_state))
  await run(m => m.runSocialPlanner())
  await run(m => m.runSocialPlanner())
  check('blocked draft retries up to 3 attempts', drafts.length === 3 && snap.social_planner_state.attempts === 3, `${drafts.length} ${snap.social_planner_state.attempts}`)
  await run(m => m.runSocialPlanner())
  check('after 3 attempts the planner gives up for the day', drafts.length === 3 && snap.social_planner_state.done.biasWindow === true, `${drafts.length}`)

  // Slot already filled by any live row.
  for (const status of ['draft', 'approved', 'published']) {
    reset(); day('2026-09-21', '09:00')
    qrow({ content_type: 'bias_card', status })
    await run(m => m.runSocialPlanner())
    check(`slot filled by a ${status} row → planner creates nothing`, drafts.length === 0 && snap.social_planner_state.done.biasWindow === true, JSON.stringify(drafts))
  }

  // Before the fallback time.
  reset(); day('2026-09-21', '05:00')
  await run(m => m.runSocialPlanner())
  check('before 06:30 UTC → nothing', drafts.length === 0 && !snap.social_planner_state, JSON.stringify(drafts))

  // Restart safety within the same day.
  reset(); day('2026-09-21', '09:00')
  snap.social_planner_state = { date: '2026-09-21', done: { biasWindow: true, saturday: false }, attempts: 1 }
  await run(m => m.runSocialPlanner())
  check('slot already done today (restart) → no second draft', drafts.length === 0, JSON.stringify(drafts))

  // Date rollover resets the state.
  reset(); day('2026-09-22', '09:00')
  snap.social_planner_state = { date: '2026-09-21', done: { biasWindow: true, saturday: true }, attempts: 3 }
  hist({ reasoning: 'Yields drifting lower.' })
  await run(m => m.runSocialPlanner())
  check('new UTC day resets planner state', drafts.length === 1 && snap.social_planner_state.date === '2026-09-22' && snap.social_planner_state.done.biasWindow === true, JSON.stringify(snap.social_planner_state))
}

// ── Saturday scorecard ────────────────────────────────────────────────────────
{
  const fin = correct => ({ status: 'final', correct, pips: correct ? 30 : -12 })
  reset(); day('2026-09-26', '10:00')   // Saturday
  hist({ pair: 'EURUSD', performance: fin(true) })
  hist({ pair: 'GBPUSD', performance: fin(false) })
  hist({ pair: 'XAUUSD', performance: { status: 'live', correct: null } })
  await run(m => m.runSocialPlanner())
  check('Saturday with 2 resolved calls → skipped with a log', drafts.length === 0 && logs.some(l => /only 2 resolved/.test(l)), logs.join(' | '))
  check('too-few skip does not mark Saturday done (calls can resolve later)', snap.social_planner_state.done.saturday === false, JSON.stringify(snap.social_planner_state))

  hist({ pair: 'USDJPY', performance: fin(true) })
  hist({ pair: 'AUDUSD', performance: fin(false) })
  drafts = []
  await run(m => m.runSocialPlanner())
  check('Saturday with 4 resolved calls → weekly_scorecard', drafts.length === 1 && drafts[0].contentType === 'weekly_scorecard' && drafts[0].pillar === 'accountability', JSON.stringify(drafts.map(d => d.contentType)))
  const rows = drafts[0].facts.rows
  check('scorecard rows map final→hit/miss and live→open', rows.length === 5 && rows.filter(r => r.outcome === 'hit').length === 2 && rows.filter(r => r.outcome === 'miss').length === 2 && rows.filter(r => r.outcome === 'open').length === 1, JSON.stringify(rows))
  check('scorecard facts contain no totals, percentages or win rate',
    !/win|rate|%|total|count|score:/i.test(JSON.stringify(drafts[0].facts).replace(/"rangeLabel":"[^"]*"/, '')) && Object.keys(drafts[0].facts).sort().join(',') === 'rangeLabel,rows', JSON.stringify(drafts[0].facts))
  check('Saturday marked done after a successful draft', snap.social_planner_state.done.saturday === true)

  drafts = []
  await run(m => m.runSocialPlanner())
  check('Saturday: no second scorecard the same day', drafts.length === 0)

  // Saturday before 06:30, and rows with no performance at all.
  reset(); day('2026-09-26', '05:00')
  hist({ performance: fin(true) }); hist({ performance: fin(true) }); hist({ performance: fin(false) })
  await run(m => m.runSocialPlanner())
  check('Saturday before 06:30 → nothing', drafts.length === 0)

  reset(); day('2026-09-26', '10:00')
  hist({}); hist({}); hist({})
  await run(m => m.runSocialPlanner())
  check('unscored rows are not counted as resolved', drafts.length === 0 && logs.some(l => /only 0 resolved/.test(l)), logs.join(' | '))
}

// ── Sunday ────────────────────────────────────────────────────────────────────
{
  reset(); day('2026-09-27', '10:00')   // Sunday
  calendar = [{ event: 'CPI', country: 'USD', time: '2026-09-27T12:30:00.000Z', impact: 'High' }]
  hist({ performance: { status: 'final', correct: true } })
  await run(m => m.runSocialPlanner())
  check('Sunday → nothing drafted, no state written', drafts.length === 0 && !snap.social_planner_state, JSON.stringify({ drafts: drafts.length, snap }))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
