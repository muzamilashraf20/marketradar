// Test vectors for the social publisher loop.
//   node backend/scripts/socialPublish.test.mjs
//
// processSocialQueue lives inside index.js, which cannot be imported without booting the server and
// its crons against the LIVE database. So the publisher block is read out of index.js as source and
// run here against an in-memory fake Supabase and a fake publishToX. The code under test is the
// shipped code, character for character; only its dependencies are fakes. An assertion below fails
// loudly if the extraction ever stops matching, so this cannot silently test nothing.
//
// What matters most here: nothing posts while the kill switch is off, and one row can never be
// posted twice.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validateSocialPost } from '../social/guardrails.js'

const INDEX = fileURLToPath(new URL('../index.js', import.meta.url))
const src = readFileSync(INDEX, 'utf8')
const cut = (from, to) => {
  const a = src.indexOf(from)
  const b = src.indexOf(to)
  if (a === -1 || b === -1 || b <= a) throw new Error(`index.js extraction failed at "${from}" — did the section move?`)
  return src.slice(a, b)
}
const escSrc = cut('function esc(s)', '// Resolve the caller')
const pastSrc = cut('// excludeId keeps a row', "// The engine's reasoning")
const pubSrc = cut('// 🚀 SOCIAL PUBLISHER', '// 📧 EMAIL TEMPLATE')
for (const [name, text] of [['processSocialQueue', pubSrc], ['socialPastTexts', pastSrc], ['esc', escSrc]]) {
  if (!text.includes(name)) throw new Error(`extraction sanity check failed: ${name} not found`)
}

// Captured once: two modules can be live at the same time (the concurrency case), and restoring a
// console that was itself already patched would silently swallow the rest of this file's output.
const REAL_LOG = console.log
const REAL_ERR = console.error

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`)
}

// ── Fake Supabase: just enough of the builder for the queries the publisher makes ─────────────
let db = []
function makeSupabase() {
  const from = table => {
    const st = { filters: [], op: 'select', payload: null, head: false, orders: [], limitN: null }
    const rows = () => db.filter(r => r.__t === table && st.filters.every(f => f(r)))
    const run = () => {
      if (st.op === 'update') {
        const hit = rows()
        hit.forEach(r => Object.assign(r, st.payload))
        return { data: hit.map(r => ({ ...r })), error: null, count: hit.length }
      }
      let out = rows().map(r => ({ ...r }))
      for (const o of [...st.orders].reverse()) {
        out.sort((a, b) => (a[o.col] === b[o.col] ? 0 : (a[o.col] > b[o.col] ? 1 : -1)) * (o.asc ? 1 : -1))
      }
      const count = out.length
      if (st.limitN != null) out = out.slice(0, st.limitN)
      return { data: st.head ? null : out, error: null, count }
    }
    const b = {
      select(_c, opts) { if (opts?.head) st.head = true; return b },
      update(p) { st.op = 'update'; st.payload = p; return b },
      eq(k, v) { st.filters.push(r => r[k] === v); return b },
      neq(k, v) { st.filters.push(r => r[k] !== v); return b },
      in(k, vs) { st.filters.push(r => vs.includes(r[k])); return b },
      gt(k, v) { st.filters.push(r => r[k] > v); return b },
      gte(k, v) { st.filters.push(r => r[k] >= v); return b },
      lte(k, v) { st.filters.push(r => r[k] != null && r[k] <= v); return b },
      not(k, _op, _v) { st.filters.push(r => r[k] != null); return b },
      order(col, o) { st.orders.push({ col, asc: o?.ascending !== false }); return b },
      limit(n) { st.limitN = n; return b },
      maybeSingle: async () => { const r = run(); return { data: r.data?.[0] ?? null, error: null } },
      single: async () => { const r = run(); return { data: r.data?.[0] ?? null, error: r.data?.[0] ? null : { message: 'no rows' } } },
      then(res, rej) { return Promise.resolve(run()).then(res, rej) },
    }
    return b
  }
  return { from }
}

// ── Other fakes ───────────────────────────────────────────────────────────────
const ADMIN = '111222333'
let dms = []
let logs = []
let publishCalls = []
let publishImpl = async () => ({ id: '1770000000000000001' })
const snap = {}

const env = (autopilot, extra = {}) => {
  if (autopilot === null) delete process.env.SOCIAL_AUTOPILOT   // the variable not being set at all
  else process.env.SOCIAL_AUTOPILOT = autopilot
  for (const [k, v] of Object.entries(extra)) { if (v == null) delete process.env[k]; else process.env[k] = String(v) }
}

function buildModule() {
  const supabase = makeSupabase()
  const sendTG = async (chat, text) => { dms.push({ chat, text }); return { message_id: 1 } }
  const v2AdminChat = () => ADMIN
  const v2LoadSnapshot = async k => snap[k] ?? null
  const v2SaveSnapshot = (k, v) => { snap[k] = v }
  const publishToX = async args => { publishCalls.push(args); return publishImpl(args) }
  const app = { post: () => {} }
  const requireUser = async () => null
  const isAdmin = () => false
  console.log = (...a) => { logs.push(a.join(' ')) }
  console.error = (...a) => { logs.push(a.join(' ')) }
  const mod = new Function(
    'supabase', 'sendTG', 'v2AdminChat', 'v2LoadSnapshot', 'v2SaveSnapshot', 'publishToX', 'validateSocialPost', 'app', 'requireUser', 'isAdmin',
    `${escSrc}\n${pastSrc}\n${pubSrc}\nreturn { processSocialQueue }`,
  )(supabase, sendTG, v2AdminChat, v2LoadSnapshot, v2SaveSnapshot, publishToX, validateSocialPost, app, requireUser, isAdmin)
  return { ...mod, restore: () => { console.log = REAL_LOG; console.error = REAL_ERR } }
}

const ago = min => new Date(Date.now() - min * 60000).toISOString()
const row = (over = {}) => ({
  __t: 'social_queue', id: 1, platform: 'x', content_type: 'bias_card', pillar: 'daily_bias',
  text: 'EUR/USD bearish. The rate gap keeps widening the dollar way.',
  image_url: 'https://x.supabase.co/storage/v1/object/public/social-media/cards/bias_card-1.png',
  image_path: 'cards/bias_card-1.png', source_ref: { facts: { pair: 'EUR/USD', invalidation: '1.0850' } },
  status: 'approved', scheduled_for: ago(5), published_at: null, external_id: null, error: null,
  regen_count: 0, created_at: ago(60), updated_at: ago(60), ...over,
})
function reset(rows, autopilot = 'on', extra = {}) {
  db = rows
  dms = []; logs = []; publishCalls = []
  publishImpl = async () => ({ id: '1770000000000000001' })
  for (const k of Object.keys(snap)) delete snap[k]
  env(autopilot, { X_DAILY_CAP: null, X_MIN_GAP_MIN: null, ...extra })
}
const find = id => db.find(r => r.id === id)

// ── 1. Kill switch ────────────────────────────────────────────────────────────
{
  reset([row(), row({ id: 2 })], 'off')
  const m = buildModule()
  await m.processSocialQueue()
  m.restore()
  check('autopilot off: nothing published', publishCalls.length === 0, JSON.stringify(publishCalls))
  check('autopilot off: rows untouched', db.every(r => r.status === 'approved'), db.map(r => r.status).join(','))
  check('autopilot off: logs the waiting count', logs.some(l => l.includes('autopilot OFF — 2 approved rows waiting')), logs.join(' | '))

  // Only the exact string 'on' enables posting; null here means the env var is not set at all.
  for (const value of ['', 'ON', 'On', 'true', '1', 'yes', 'off', null]) {
    reset([row()], value)
    const m2 = buildModule()
    await m2.processSocialQueue()
    m2.restore()
    check(`autopilot ${value === null ? 'unset' : `"${value}"`} is not "on": no publish`, publishCalls.length === 0 && find(1).status === 'approved', `${publishCalls.length} ${find(1).status}`)
  }
}

// ── 2. Atomic claim: concurrent runs ──────────────────────────────────────────
{
  reset([row()])
  const a = buildModule(), b = buildModule()
  await Promise.all([a.processSocialQueue(), b.processSocialQueue()])
  a.restore(); b.restore()
  check('concurrent runs publish once', publishCalls.length === 1, `${publishCalls.length} calls`)
  check('concurrent runs: row published once', find(1).status === 'published' && find(1).external_id === '1770000000000000001', JSON.stringify(find(1)))
  check('loser logs that it was already claimed', logs.some(l => l.includes('already claimed by another run')), logs.join(' | '))
}

// ── 3. Daily cap ──────────────────────────────────────────────────────────────
{
  const today = new Date().toISOString().slice(0, 10)
  const published = n => Array.from({ length: n }, (_, i) => row({ id: 100 + i, status: 'published', published_at: `${today}T0${i}:00:00.000Z`, text: `old post ${i}` }))
  reset([row(), ...published(5)])
  const m = buildModule()
  await m.processSocialQueue()
  m.restore()
  const r = find(1)
  check('cap reached: not published', publishCalls.length === 0 && r.status === 'approved', `${publishCalls.length} ${r.status}`)
  check('cap reached: held until 06:30 UTC tomorrow', /T06:30:00\.000Z$/.test(r.scheduled_for) && r.scheduled_for > new Date().toISOString(), r.scheduled_for)
  check('cap reached: admin DMed once', dms.filter(d => /Daily X cap reached/.test(d.text)).length === 1, JSON.stringify(dms.map(d => d.text)))

  // Same day, second run: held again but no second DM.
  r.scheduled_for = ago(1)
  dms = []
  const m2 = buildModule()
  await m2.processSocialQueue()
  m2.restore()
  check('cap reached twice in a day: no second DM', dms.length === 0 && find(1).status === 'approved', JSON.stringify(dms))

  // A higher cap lets it through.
  reset([row({ scheduled_for: ago(1) }), ...published(5)], 'on', { X_DAILY_CAP: 9 })
  const m3 = buildModule()
  await m3.processSocialQueue()
  m3.restore()
  check('X_DAILY_CAP=9 with 5 posted: publishes', publishCalls.length === 1 && find(1).status === 'published', `${publishCalls.length} ${find(1).status}`)
}

// ── 4. Minimum gap ────────────────────────────────────────────────────────────
{
  reset([row(), row({ id: 200, status: 'published', published_at: ago(30), text: 'recent post' })])
  const m = buildModule()
  await m.processSocialQueue()
  m.restore()
  const r = find(1)
  check('gap not met: not published, back to approved', publishCalls.length === 0 && r.status === 'approved', `${publishCalls.length} ${r.status}`)
  const want = new Date(new Date(find(200).published_at).getTime() + 90 * 60000).toISOString()
  check('gap not met: scheduled for last + 90min', r.scheduled_for === want, `${r.scheduled_for} vs ${want}`)

  reset([row(), row({ id: 200, status: 'published', published_at: ago(120), text: 'older post' })])
  const m2 = buildModule()
  await m2.processSocialQueue()
  m2.restore()
  check('gap met (120min > 90): publishes', publishCalls.length === 1 && find(1).status === 'published', `${publishCalls.length} ${find(1).status}`)

  reset([row(), row({ id: 200, status: 'published', published_at: ago(20), text: 'recent post' })], 'on', { X_MIN_GAP_MIN: 15 })
  const m3 = buildModule()
  await m3.processSocialQueue()
  m3.restore()
  check('X_MIN_GAP_MIN=15 with 20min since: publishes', publishCalls.length === 1, `${publishCalls.length}`)
}

// ── 5. Guardrails at publish time ─────────────────────────────────────────────
{
  reset([row({ text: 'EUR/USD short below 1.085, SL 1.0820 — guaranteed setup' })])
  const m = buildModule()
  await m.processSocialQueue()
  m.restore()
  const r = find(1)
  check('hard flags: publisher never called', publishCalls.length === 0, JSON.stringify(publishCalls))
  check('hard flags: row failed with the reasons', r.status === 'failed' && /trade_levels/.test(r.error) && /guarantee/.test(r.error), JSON.stringify(r.error))
  check('hard flags: admin DMed', dms.some(d => /Post failed/.test(d.text)), JSON.stringify(dms.map(d => d.text)))

  // A row is not a duplicate of itself just because the claim set it to 'publishing'.
  reset([row()])
  const m2 = buildModule()
  await m2.processSocialQueue()
  m2.restore()
  check('own text is not treated as a duplicate of itself', find(1).status === 'published', `${find(1).status} ${find(1).error}`)
}

// ── 6. Happy path ─────────────────────────────────────────────────────────────
{
  reset([row()])
  const before = new Date().toISOString()
  const m = buildModule()
  await m.processSocialQueue()
  m.restore()
  const r = find(1)
  check('published: status, external_id, published_at', r.status === 'published' && r.external_id === '1770000000000000001' && r.published_at >= before, JSON.stringify(r))
  check('published: text and image passed to the publisher', publishCalls[0].text === r.text && publishCalls[0].imageUrl === r.image_url, JSON.stringify(publishCalls[0]))
  check('published: admin DM carries the post link', dms.some(d => d.text.includes('https://x.com/MuzamilAshraf_1/status/1770000000000000001')), JSON.stringify(dms.map(d => d.text)))

  // Oldest scheduled row goes first, one per run. Texts must differ: two queued rows saying the
  // same thing is a duplicate, and the guardrail below would fail the second one (see next case).
  reset([
    row({ id: 1, scheduled_for: ago(10), text: 'EUR/USD bearish. The rate gap keeps widening the dollar way.' }),
    row({ id: 2, scheduled_for: ago(30), content_type: 'trader_pain', source_ref: { facts: {} }, text: 'Gold is bid while real yields slip back toward their lows.' }),
    row({ id: 3, scheduled_for: ago(20), content_type: 'trader_pain', source_ref: { facts: {} }, text: 'Sterling traders: the central bank decision lands before lunch.' }),
  ])
  const m2 = buildModule()
  await m2.processSocialQueue()
  m2.restore()
  check('one post per run, oldest scheduled_for first', publishCalls.length === 1 && find(2).status === 'published' && find(1).status === 'approved' && find(3).status === 'approved', db.map(r => `${r.id}:${r.status}`).join(','))

  // Two approved rows carrying the SAME text: only one of them can ever reach X. The duplicate
  // check compares against every other queued row, so the row that runs first is the one that
  // fails — the survivor then posts on the next run. The guarantee worth pinning is the outcome:
  // exactly one post, and the other row failed with the reason saved.
  reset([row({ id: 1, scheduled_for: ago(30) }), row({ id: 2, scheduled_for: ago(10) })])
  const dup1 = buildModule()
  await dup1.processSocialQueue()
  dup1.restore()
  const dup2 = buildModule()
  await dup2.processSocialQueue()
  dup2.restore()
  const statuses = [find(1).status, find(2).status].sort().join('/')
  const failedRow = [find(1), find(2)].find(r => r.status === 'failed')
  check('two identical approved rows: exactly one posts, the other fails as a duplicate', statuses === 'failed/published' && /duplicate/.test(failedRow.error) && publishCalls.length === 1, `${statuses} ${failedRow?.error}`)

  // Not yet due stays put.
  reset([row({ scheduled_for: new Date(Date.now() + 3600e3).toISOString() })])
  const m3 = buildModule()
  await m3.processSocialQueue()
  m3.restore()
  check('future scheduled_for is not picked up', publishCalls.length === 0 && find(1).status === 'approved', find(1).status)
}

// ── 7. Publisher throws: failed, no retry ─────────────────────────────────────
{
  reset([row()])
  publishImpl = async () => { throw new Error('X auth rejected (401): Unauthorized. Check the four X_* env vars...') }
  const m = buildModule()
  await m.processSocialQueue()
  m.restore()
  const r = find(1)
  check('publish error: row failed with the message saved', r.status === 'failed' && /X auth rejected \(401\)/.test(r.error), JSON.stringify(r.error))
  check('publish error: not published', r.published_at === null && r.external_id === null)
  check('publish error: admin DMed', dms.some(d => /Post failed/.test(d.text)), JSON.stringify(dms.map(d => d.text)))

  // No automatic retry: a later run must not pick a failed row back up.
  publishCalls = []
  publishImpl = async () => ({ id: 'should-not-happen' })
  const m2 = buildModule()
  await m2.processSocialQueue()
  m2.restore()
  check('failed rows are never retried automatically', publishCalls.length === 0 && find(1).status === 'failed', `${publishCalls.length} ${find(1).status}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
