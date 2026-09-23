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
import { createIgTokenStore as realCreateIgTokenStore, igTokenStatus } from '../social/instagramPublisher.js'
import { checkCarousel, CAROUSEL_TYPES } from '../social/generator.js'

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
// The past-event safety net lives with the triggers; the publisher calls it.
const pastEventSrc = cut('function eventsAllPast', '// ── Scorecard')
// The publisher's guardrail re-check, and the row shape helpers it leans on (story vs carousel vs
// single post). Both live in the drafts section, above the publisher.
const flagsSrc = cut('// The hard flags on a row', '// Approve / skip, shared')
const rowShapeSrc = cut('const isStoryRow =', '// Instagram rows created today')
for (const [name, text] of [['processSocialQueue', pubSrc], ['socialPastTexts', pastSrc], ['esc', escSrc], ['socialHardFlags', flagsSrc], ['isCarouselRow', rowShapeSrc]]) {
  if (!text.includes(name)) throw new Error(`extraction sanity check failed: ${name} not found`)
}

// Captured once: two modules can be live at the same time (the concurrency case), and restoring a
// console that was itself already patched would silently swallow the rest of this file's output.
const REAL_LOG = console.log
const REAL_ERR = console.error
const REAL_WARN = console.warn

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
let liCalls = []
let liImpl = async () => ({ id: 'urn:li:share:7000000000000000001' })
let liToken = { expiresOn: '2026-11-20', daysLeft: 60, expired: false }
let igCalls = []
let igStoryCalls = []
let igStoryImpl = async () => ({ id: '17900000000000009', permalink: 'https://www.instagram.com/stories/biasforge.co/17900000000000009/', story: true })
let igImpl = async (args, deps) => ({ id: '17900000000000001', permalink: 'https://www.instagram.com/p/ABC123/' })
let igEnvToken = 'IG_ENV_TOKEN'
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
  const publishToLinkedIn = async args => { liCalls.push(args); return liImpl(args) }
  const linkedinTokenStatus = () => liToken
  const utcDay = () => new Date().toISOString().slice(0, 10)
  // The real token store, with its app_state save pointed at the fake snapshot map and the env read
  // controllable, so refresh → save → publish is exercised as shipped.
  const createIgTokenStore = ({ load }) => realCreateIgTokenStore({ load, save: async v => { snap.ig_token = v }, env: () => igEnvToken })
  const publishToInstagram = async (args, deps) => { const token = await deps.token(); igCalls.push({ ...args, token }); return igImpl(args, deps) }
  const app = { post: () => {} }
  const requireUser = async () => null
  const isAdmin = () => false
  console.log = (...a) => { logs.push(a.join(' ')) }
  console.error = (...a) => { logs.push(a.join(' ')) }
  console.warn = (...a) => { logs.push(a.join(' ')) }
  const publishStory = async (args, deps) => { const token = await deps.token(); igStoryCalls.push({ ...args, token }); return igStoryImpl(args, deps) }
  const mod = new Function(
    'supabase', 'sendTG', 'v2AdminChat', 'v2LoadSnapshot', 'v2SaveSnapshot', 'publishToX', 'validateSocialPost', 'app', 'requireUser', 'isAdmin',
    'publishToLinkedIn', 'linkedinTokenStatus', 'utcDay', 'createIgTokenStore', 'igTokenStatus', 'publishToInstagram', 'SOCIAL_BUCKET',
    'publishStory', 'checkCarousel', 'CAROUSEL_TYPES', 'EVENT_ROW_TYPES',
    `${escSrc}\n${pastSrc}\n${pastEventSrc}\n${rowShapeSrc}\n${flagsSrc}\n${pubSrc}\nreturn { processSocialQueue, checkLinkedInToken, maintainIgToken, socialHardFlags }`,
  )(supabase, sendTG, v2AdminChat, v2LoadSnapshot, v2SaveSnapshot, publishToX, validateSocialPost, app, requireUser, isAdmin,
    publishToLinkedIn, linkedinTokenStatus, utcDay, createIgTokenStore, igTokenStatus, publishToInstagram, 'social-media',
    publishStory, checkCarousel, CAROUSEL_TYPES, new Set(['event_preview', 'event_story']))
  return { ...mod, restore: () => { console.log = REAL_LOG; console.error = REAL_ERR; console.warn = REAL_WARN } }
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
  dms = []; logs = []; publishCalls = []; liCalls = []
  liImpl = async () => ({ id: 'urn:li:share:7000000000000000001' })
  liToken = { expiresOn: '2026-11-20', daysLeft: 60, expired: false }
  igCalls = []
  igStoryCalls = []
  igStoryImpl = async () => ({ id: '17900000000000009', permalink: 'https://www.instagram.com/stories/biasforge.co/17900000000000009/', story: true })
  igImpl = async () => ({ id: '17900000000000001', permalink: 'https://www.instagram.com/p/ABC123/' })
  igEnvToken = 'IG_ENV_TOKEN'
  publishImpl = async () => ({ id: '1770000000000000001' })
  for (const k of Object.keys(snap)) delete snap[k]
  env(autopilot, { X_DAILY_CAP: null, X_MIN_GAP_MIN: null, LINKEDIN_DAILY_CAP: null, IG_DAILY_CAP: null, ...extra })
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

// ── 8. LinkedIn ───────────────────────────────────────────────────────────────
const LI_TEXT = 'Why the dollar keeps the upper hand on EUR/USD this week.\n\nThe rate gap between US and German 2Y yields is still widening, and that gap is what funds carry trades against the euro.\n\n#forex'
const liRow = (over = {}) => row({ platform: 'linkedin', text: LI_TEXT, ...over })
{
  // One row per platform per run: an X row and a LinkedIn row both go out in the same tick.
  reset([row({ id: 1 }), liRow({ id: 2 })])
  const m = buildModule()
  await m.processSocialQueue()
  m.restore()
  check('one X and one LinkedIn post in the same run', publishCalls.length === 1 && liCalls.length === 1 && find(1).status === 'published' && find(2).status === 'published', `x=${publishCalls.length} li=${liCalls.length} ${find(1).status}/${find(2).status}`)
  check('LinkedIn: external_id is the post URN', find(2).external_id === 'urn:li:share:7000000000000000001', find(2).external_id)
  check('LinkedIn: DM carries the feed URL', dms.some(d => d.text.includes('https://www.linkedin.com/feed/update/urn:li:share:7000000000000000001') && /Posted to LinkedIn/.test(d.text)), JSON.stringify(dms.map(d => d.text)))
  check('X: DM still says "Posted to X" with the x.com link', dms.some(d => /Posted to X</.test(d.text) && d.text.includes('https://x.com/MuzamilAshraf_1/status/')), JSON.stringify(dms.map(d => d.text)))

  // Two LinkedIn rows due: only one per run.
  reset([liRow({ id: 1, scheduled_for: ago(30) }), liRow({ id: 2, scheduled_for: ago(10), text: 'EUR/USD in one line: positioning is lopsided.\n\nSpeculators are still net long the euro while the macro inputs lean the other way, and crowded positioning tends to unwind on the first disappointment.' })])
  const m2 = buildModule()
  await m2.processSocialQueue()
  m2.restore()
  check('LinkedIn: at most one row per run', liCalls.length === 1 && find(1).status === 'published' && find(2).status === 'approved', `${liCalls.length} ${find(1).status}/${find(2).status}`)
}

// LinkedIn cap is counted over LinkedIn rows only, and does not touch X.
{
  const today = new Date().toISOString().slice(0, 10)
  // Five X posts today: X is at its cap. LinkedIn has posted nothing, so its cap of 1 is free.
  const xPosted = Array.from({ length: 5 }, (_, i) => row({ id: 100 + i, status: 'published', published_at: `${today}T0${i}:00:00.000Z`, text: `old x post ${i}` }))
  reset([row({ id: 1 }), liRow({ id: 2 }), ...xPosted])
  const m = buildModule()
  await m.processSocialQueue()
  m.restore()
  check('X at its cap does not stop LinkedIn', find(1).status === 'approved' && find(2).status === 'published' && publishCalls.length === 0 && liCalls.length === 1, `${find(1).status}/${find(2).status}`)

  // One LinkedIn post already today: LinkedIn is held, X still posts.
  reset([row({ id: 1 }), liRow({ id: 2 }), liRow({ id: 50, status: 'published', published_at: `${today}T01:00:00.000Z`, text: 'earlier linkedin post' })])
  const m2 = buildModule()
  await m2.processSocialQueue()
  m2.restore()
  const li = find(2)
  check('LinkedIn cap (1/day) reached: held until 06:30 UTC tomorrow, not posted', li.status === 'approved' && /T06:30:00\.000Z$/.test(li.scheduled_for) && liCalls.length === 0, `${li.status} ${li.scheduled_for}`)
  check('LinkedIn at its cap does not stop X', find(1).status === 'published' && publishCalls.length === 1, find(1).status)
  check('LinkedIn cap DM is separate and says LinkedIn', dms.some(d => /Daily LinkedIn cap reached/.test(d.text)) && !dms.some(d => /Daily X cap reached/.test(d.text)), JSON.stringify(dms.map(d => d.text)))

  // LINKEDIN_DAILY_CAP=2 lets a second one through.
  reset([liRow({ id: 2 }), liRow({ id: 50, status: 'published', published_at: `${today}T01:00:00.000Z`, text: 'earlier linkedin post' })], 'on', { LINKEDIN_DAILY_CAP: 2 })
  const m3 = buildModule()
  await m3.processSocialQueue()
  m3.restore()
  check('LINKEDIN_DAILY_CAP=2 with 1 posted: publishes', find(2).status === 'published' && liCalls.length === 1, find(2).status)

  // No min-gap rule for LinkedIn: a LinkedIn post 5 minutes ago does not hold the next one back
  // beyond the daily cap.
  reset([liRow({ id: 2 }), liRow({ id: 50, status: 'published', published_at: ago(5), text: 'five minutes ago' })], 'on', { LINKEDIN_DAILY_CAP: 3 })
  const m4 = buildModule()
  await m4.processSocialQueue()
  m4.restore()
  check('LinkedIn has no minimum gap', find(2).status === 'published', find(2).status)
}

// Expired token: no API call, row failed, admin told.
{
  reset([liRow({ id: 2 })])
  liToken = { expiresOn: '2026-09-01', daysLeft: -20, expired: true }
  const m = buildModule()
  await m.processSocialQueue()
  m.restore()
  const r = find(2)
  check('expired token → LinkedIn publisher never called', liCalls.length === 0, `${liCalls.length}`)
  check('expired token → row failed with "token expired"', r.status === 'failed' && /token expired/.test(r.error), `${r.status} ${r.error}`)
  check('expired token → admin DMed', dms.some(d => /Post failed/.test(d.text) && /token expired/.test(d.text)), JSON.stringify(dms.map(d => d.text)))
}

// LinkedIn guardrails and errors: the same rules as X.
{
  reset([liRow({ id: 2, text: `${LI_TEXT}\n\nEntry at 1.0850, SL 1.0880.` })])
  const m = buildModule()
  await m.processSocialQueue()
  m.restore()
  check('LinkedIn: hard flag at publish time → failed, publisher never called', find(2).status === 'failed' && liCalls.length === 0 && /trade_levels/.test(find(2).error), `${find(2).status} ${find(2).error}`)

  reset([liRow({ id: 2 })])
  liImpl = async () => { throw new Error('LinkedIn token expired or revoked — re-run the token script') }
  const m2 = buildModule()
  await m2.processSocialQueue()
  await m2.processSocialQueue()
  m2.restore()
  check('LinkedIn: API error → failed with the message, no retry', find(2).status === 'failed' && /re-run the token script/.test(find(2).error) && liCalls.length === 1, `${find(2).status} calls=${liCalls.length}`)

  // A LinkedIn post and its X sibling share phrasing by design. The duplicate check is per
  // platform, so the X sibling being published must not fail the LinkedIn post.
  const shared = 'The rate gap between US and German 2Y yields is still widening, and that gap is what funds carry trades against the euro.'
  reset([liRow({ id: 2, text: `Why the dollar keeps the upper hand on EUR/USD.\n\n${shared}` }), row({ id: 1, status: 'published', published_at: ago(300), text: `EUR/USD: ${shared}` })])
  const m3 = buildModule()
  await m3.processSocialQueue()
  m3.restore()
  check('X sibling with the same sentence does not make LinkedIn a duplicate', find(2).status === 'published', `${find(2).status} ${find(2).error}`)
}

// Kill switch covers LinkedIn too.
{
  reset([row({ id: 1 }), liRow({ id: 2 })], 'off')
  const m = buildModule()
  await m.processSocialQueue()
  m.restore()
  check('autopilot off: LinkedIn not posted either', liCalls.length === 0 && publishCalls.length === 0 && find(2).status === 'approved')
  check('autopilot off: waiting count includes LinkedIn', logs.some(l => l.includes('autopilot OFF — 2 approved rows waiting')), logs.join(' | '))
}

// ── 9. Instagram ──────────────────────────────────────────────────────────────
const IG_TEXT = 'EUR/USD leans lower today.\n\nThe rate gap between US and German 2Y yields keeps widening in the dollar\'s favour.\n\n#forex #eurusd #macro #trading #fx'
// Every row carries a format once the social_queue migration has run: 'feed' for a post or a
// carousel, 'story' for a story card.
const igRow = (over = {}) => row({ platform: 'instagram', text: IG_TEXT, format: 'feed', ...over })
const seedIgToken = async (over = {}) => {
  const s = realCreateIgTokenStore({ load: async () => snap.ig_token, save: async v => { snap.ig_token = v }, env: () => igEnvToken })
  await s.current()
  Object.assign(snap.ig_token, over)
}
{
  // All three platforms in one run, one row each.
  reset([row({ id: 1 }), liRow({ id: 2 }), igRow({ id: 3 })])
  await seedIgToken({ refreshedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 50 * 86400e3).toISOString() })
  const m = buildModule()
  await m.processSocialQueue()
  m.restore()
  check('X, LinkedIn and Instagram each post once in the same run', publishCalls.length === 1 && liCalls.length === 1 && igCalls.length === 1 && [1, 2, 3].every(id => find(id).status === 'published'), `${publishCalls.length}/${liCalls.length}/${igCalls.length} ${[1, 2, 3].map(id => find(id).status)}`)
  const ig = find(3)
  check('Instagram: external_id is the media id', ig.external_id === '17900000000000001', ig.external_id)
  check('Instagram: permalink stored in source_ref, facts kept', ig.source_ref?.permalink === 'https://www.instagram.com/p/ABC123/' && ig.source_ref?.facts?.pair === 'EUR/USD', JSON.stringify(ig.source_ref))
  check('Instagram: caption and card URL passed to the publisher', igCalls[0].caption === IG_TEXT && igCalls[0].imageUrls?.[0] === ig.image_url, JSON.stringify(igCalls[0]))
  check('Instagram: DM carries the permalink', dms.some(d => /Posted to Instagram/.test(d.text) && d.text.includes('https://www.instagram.com/p/ABC123/')), JSON.stringify(dms.map(d => d.text)))
  check('X and LinkedIn rows got no permalink written', find(1).source_ref?.permalink === undefined && find(2).source_ref?.permalink === undefined)
}

// Instagram cap is its own.
{
  const today = new Date().toISOString().slice(0, 10)
  const xFull = Array.from({ length: 5 }, (_, i) => row({ id: 100 + i, status: 'published', published_at: `${today}T0${i}:00:00.000Z`, text: `old x ${i}` }))
  const liFull = [liRow({ id: 150, status: 'published', published_at: `${today}T01:00:00.000Z`, text: 'earlier li' })]
  reset([row({ id: 1 }), liRow({ id: 2 }), igRow({ id: 3 }), ...xFull, ...liFull])
  await seedIgToken({ refreshedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 50 * 86400e3).toISOString() })
  const m = buildModule()
  await m.processSocialQueue()
  m.restore()
  check('X and LinkedIn at their caps do not stop Instagram', find(1).status === 'approved' && find(2).status === 'approved' && find(3).status === 'published', [1, 2, 3].map(id => find(id).status).join('/'))

  reset([row({ id: 1 }), igRow({ id: 3 }), igRow({ id: 160, status: 'published', published_at: `${today}T02:00:00.000Z`, text: 'earlier ig' })])
  await seedIgToken({ refreshedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 50 * 86400e3).toISOString() })
  const m2 = buildModule()
  await m2.processSocialQueue()
  m2.restore()
  check('Instagram cap (1/day) reached: held, not posted; X still posts', find(3).status === 'approved' && /T06:30:00\.000Z$/.test(find(3).scheduled_for) && igCalls.length === 0 && find(1).status === 'published', `${find(3).status} ${find(3).scheduled_for}`)
  check('Instagram cap DM is its own', dms.some(d => /Daily Instagram cap reached/.test(d.text)), JSON.stringify(dms.map(d => d.text)))

  reset([igRow({ id: 3 }), igRow({ id: 160, status: 'published', published_at: `${today}T02:00:00.000Z`, text: 'earlier ig' })], 'on', { IG_DAILY_CAP: 2 })
  await seedIgToken({ refreshedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 50 * 86400e3).toISOString() })
  const m3 = buildModule()
  await m3.processSocialQueue()
  m3.restore()
  check('IG_DAILY_CAP=2 with 1 posted: publishes', find(3).status === 'published', find(3).status)
}

// ── Instagram stories and carousels ───────────────────────────────────────────
// A story is a different surface with its own cap: three stories a day must never use up the one
// carousel slot, and a posted carousel must never hold back a story.
// A real macro_101 deck: six slides, cover first, cta last.
const SLIDES = [
  { kind: 'cover', kicker: 'Macro 101', title: 'Why do real yields move gold?' },
  { kind: 'concept', label: 'The idea', title: 'Gold pays you nothing', paragraphs: ['Holding gold costs whatever you could have earned elsewhere.'] },
  { kind: 'concept', label: 'The mechanism', title: 'Nominal is not the number that matters', paragraphs: ['A real yield is the nominal yield minus the inflation the market expects.'] },
  { kind: 'points', label: 'How traders use it', title: 'Three ways this shows up', points: ['Read the real yield direction first.', 'Treat a fight against it as another driver.', 'Use it as context, not a trigger.'] },
  { kind: 'callout', label: 'Common mistake', text: 'Reading a rate rise as bearish for gold without checking what inflation expectations did.' },
  { kind: 'cta', line: 'The macro read, every session.' },
].map((s, i) => ({ ...s, url: `https://x.supabase.co/s${i + 1}.png`, path: `cards/ig/s${i + 1}.png` }))
const storyRow = (over = {}) => igRow({
  format: 'story', content_type: 'bias_story', text: '', image_url: 'https://x.supabase.co/story.png',
  source_ref: { facts: { pair: 'EUR/USD', direction: 'BEARISH', confidence: 78, grade: 'A-', driver: 'The rate gap keeps widening.' }, cardKind: 'bias_card' },
  ...over,
})
{
  const today = new Date().toISOString().slice(0, 10)
  reset([storyRow({ id: 10 })])
  await seedIgToken({ refreshedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 50 * 86400e3).toISOString() })
  const m = buildModule()
  await m.processSocialQueue()
  m.restore()
  check('story: published through publishStory, not the feed publisher', igStoryCalls.length === 1 && igCalls.length === 0 && find(10).status === 'published', `${igStoryCalls.length}/${igCalls.length} ${find(10).status}`)
  check('story: only the image is sent — a story carries no caption', igStoryCalls[0]?.imageUrl === 'https://x.supabase.co/story.png' && !('caption' in (igStoryCalls[0] || {})), JSON.stringify(igStoryCalls[0]))
  check('story: an empty caption is not treated as a guardrail failure', find(10).error === null, find(10).error)

  // Story cap: independent of the feed cap in both directions.
  reset([storyRow({ id: 10 }), igRow({ id: 11, status: 'published', published_at: `${today}T02:00:00.000Z`, text: 'the day\'s carousel' })])
  await seedIgToken({ refreshedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 50 * 86400e3).toISOString() })
  const m2 = buildModule()
  await m2.processSocialQueue()
  m2.restore()
  check('a posted feed carousel (cap 1/1) does not block a story', find(10).status === 'published' && igStoryCalls.length === 1, `${find(10).status} ${igStoryCalls.length}`)

  reset([
    igRow({ id: 12 }),
    ...[0, 1, 2].map(i => storyRow({ id: 20 + i, status: 'published', published_at: `${today}T0${i + 1}:00:00.000Z` })),
  ])
  await seedIgToken({ refreshedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 50 * 86400e3).toISOString() })
  const m3 = buildModule()
  await m3.processSocialQueue()
  m3.restore()
  check('three posted stories (story cap 3/3) do not block the day\'s feed post', find(12).status === 'published' && igCalls.length === 1, `${find(12).status} ${igCalls.length}`)

  // The story cap still applies to stories.
  reset([
    storyRow({ id: 13 }),
    ...[0, 1, 2].map(i => storyRow({ id: 30 + i, status: 'published', published_at: `${today}T0${i + 1}:00:00.000Z` })),
  ])
  await seedIgToken({ refreshedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 50 * 86400e3).toISOString() })
  const m4 = buildModule()
  await m4.processSocialQueue()
  m4.restore()
  check('story cap (3/day) reached: held, not posted', find(13).status === 'approved' && igStoryCalls.length === 0 && /T06:30:00\.000Z$/.test(find(13).scheduled_for), `${find(13).status} ${find(13).scheduled_for}`)

  reset([storyRow({ id: 14 }), ...[0, 1, 2].map(i => storyRow({ id: 40 + i, status: 'published', published_at: `${today}T0${i + 1}:00:00.000Z` }))], 'on', { IG_STORY_DAILY_CAP: 4 })
  await seedIgToken({ refreshedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 50 * 86400e3).toISOString() })
  const m5 = buildModule()
  await m5.processSocialQueue()
  m5.restore()
  check('IG_STORY_DAILY_CAP=4 with 3 posted: publishes', find(14).status === 'published', find(14).status)

  // A carousel posts every slide, in order.
  const caption = `Gold does not pay you anything, and that is the whole reason it cares about real yields.\n\nWhen the return on a government bond rises after inflation, the cost of holding an asset that pays nothing rises with it. That is the mechanism, and it works in both directions.\n\nNothing here is a trade call.\n\n#forex #trading #macro #gold #propfirm`
  reset([igRow({ id: 15, content_type: 'macro_101', text: caption, source_ref: { facts: { topic: 'Real yields' }, slides: SLIDES } })])
  await seedIgToken({ refreshedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 50 * 86400e3).toISOString() })
  const m6 = buildModule()
  await m6.processSocialQueue()
  m6.restore()
  check('carousel: every slide URL goes to the publisher, in order', JSON.stringify(igCalls[0]?.imageUrls) === JSON.stringify(SLIDES.map(s => s.url)), JSON.stringify(igCalls[0]?.imageUrls))
  check('carousel: the caption is the row text, and it published', igCalls[0]?.caption === caption && find(15).status === 'published', `${find(15).status} ${find(15).error || ''}`)

  // A caption edited past the carousel rules never reaches Instagram.
  reset([igRow({ id: 16, content_type: 'macro_101', text: 'Too short, and no hashtags.', source_ref: { facts: { topic: 'Real yields' }, slides: SLIDES } })])
  await seedIgToken({ refreshedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 50 * 86400e3).toISOString() })
  const m7 = buildModule()
  await m7.processSocialQueue()
  m7.restore()
  check('carousel: a caption that breaks the caption rules fails at publish time', find(16).status === 'failed' && /caption_length|caption_hashtags/.test(find(16).error) && igCalls.length === 0, `${find(16).status} ${find(16).error}`)
}

// Expired Instagram token: no API call, failed, DM.
{
  reset([igRow({ id: 3 })])
  await seedIgToken({ refreshedAt: '2026-06-01T00:00:00.000Z', expiresAt: '2026-08-01T00:00:00.000Z' })
  const m = buildModule()
  await m.processSocialQueue()
  m.restore()
  check('expired IG token → publisher never called, row failed "token expired"', igCalls.length === 0 && find(3).status === 'failed' && /token expired/.test(find(3).error), `${igCalls.length} ${find(3).status} ${find(3).error}`)
}

// Publisher failure (e.g. a container that never finishes) → failed, no retry.
{
  reset([igRow({ id: 3 })])
  await seedIgToken({ refreshedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 50 * 86400e3).toISOString() })
  igImpl = async () => { throw new Error('Instagram container C1 did not finish processing within 60s (last status IN_PROGRESS)') }
  const m = buildModule()
  await m.processSocialQueue()
  await m.processSocialQueue()
  m.restore()
  check('IG container timeout → row failed with the message, not retried', find(3).status === 'failed' && /did not finish processing/.test(find(3).error) && igCalls.length === 1, `${find(3).status} calls=${igCalls.length}`)
}

// Token refresh: saves to app_state, and the next post uses the refreshed token.
{
  const realFetch = globalThis.fetch
  let refreshUrls = []
  globalThis.fetch = async url => {
    refreshUrls.push(String(url))
    return { ok: true, status: 200, json: async () => ({ access_token: 'IG_REFRESHED_TOKEN', token_type: 'bearer', expires_in: 5184000 }) }
  }
  reset([igRow({ id: 3 })])
  await seedIgToken()            // freshly seeded from env: refreshedAt null → due immediately
  const m = buildModule()
  await m.maintainIgToken()
  await m.processSocialQueue()
  m.restore()
  globalThis.fetch = realFetch
  check('refresh called Meta\'s refresh endpoint with the seeded token', refreshUrls.length === 1 && refreshUrls[0].includes('refresh_access_token?grant_type=ig_refresh_token&access_token=IG_ENV_TOKEN'), refreshUrls.join(' '))
  check('refreshed token and expiry saved to app_state', snap.ig_token?.token === 'IG_REFRESHED_TOKEN' && !!snap.ig_token.refreshedAt && Date.parse(snap.ig_token.expiresAt) > Date.now() + 59 * 86400e3, JSON.stringify(snap.ig_token))
  check('the next Instagram post uses the refreshed token', igCalls[0]?.token === 'IG_REFRESHED_TOKEN' && find(3).status === 'published', `${igCalls[0]?.token} ${find(3).status}`)

  // Not due yet (refreshed 2 days ago): no call.
  refreshUrls = []
  globalThis.fetch = async url => { refreshUrls.push(String(url)); throw new Error('should not be called') }
  reset([])
  await seedIgToken({ refreshedAt: new Date(Date.now() - 2 * 86400e3).toISOString(), expiresAt: new Date(Date.now() + 58 * 86400e3).toISOString() })
  const m2 = buildModule()
  await m2.maintainIgToken()
  m2.restore()
  globalThis.fetch = realFetch
  check('token refreshed 2 days ago → no refresh call', refreshUrls.length === 0, refreshUrls.join(' '))

  // Refresh failure: never throws, DMs once a day.
  globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'Token is too new to refresh', code: 100 } }) })
  reset([])
  await seedIgToken()
  const m3 = buildModule()
  let threw = null
  try { await m3.maintainIgToken(); await m3.maintainIgToken() } catch (e) { threw = e }
  m3.restore()
  globalThis.fetch = realFetch
  check('refresh failure does not throw out of the check', threw === null, threw?.message)
  check('refresh failure DMs once a day, with Meta\'s message', dms.filter(d => /Instagram token refresh failed/.test(d.text)).length === 1 && dms[0].text.includes('Token is too new to refresh'), JSON.stringify(dms.map(d => d.text)))
  check('refresh failure leaves the old token in place', snap.ig_token?.token === 'IG_ENV_TOKEN', snap.ig_token?.token)
}

// ── 10. News is exempt from the minimum gap; everything else still waits ─────
{
  const NEWS = 'EUR/USD: the Fed hold keeps the rate gap in the dollar\'s favour.'
  reset([row({ id: 1, content_type: 'news_reaction', text: NEWS, source_ref: { facts: { headline: 'Fed holds' } } }), row({ id: 200, status: 'published', published_at: ago(20), text: 'recent post' })])
  const m = buildModule()
  await m.processSocialQueue()
  m.restore()
  check('news_reaction publishes with the min gap not met (20min < 90)', find(1).status === 'published' && publishCalls.length === 1, `${find(1).status} ${find(1).scheduled_for}`)

  reset([row({ id: 1 }), row({ id: 200, status: 'published', published_at: ago(20), text: 'recent post' })])
  const m2 = buildModule()
  await m2.processSocialQueue()
  m2.restore()
  check('a non-news row in the same situation waits', find(1).status === 'approved' && publishCalls.length === 0 && find(1).scheduled_for > new Date().toISOString(), `${find(1).status} ${find(1).scheduled_for}`)

  // News still counts toward the daily cap.
  const today = new Date().toISOString().slice(0, 10)
  reset([row({ id: 1, content_type: 'news_reaction', text: NEWS, source_ref: { facts: { headline: 'Fed holds' } } }),
    ...Array.from({ length: 5 }, (_, i) => row({ id: 100 + i, status: 'published', published_at: `${today}T0${i}:00:00.000Z`, text: `old post ${i}` }))])
  const m3 = buildModule()
  await m3.processSocialQueue()
  m3.restore()
  check('news_reaction still counts toward X_DAILY_CAP (held at 5/5)', find(1).status === 'approved' && publishCalls.length === 0, find(1).status)
}

// ── 11. An event_preview whose events have all happened is skipped, not posted ─
{
  const EV_TEXT = 'Two USD prints land together at 12:30 UTC: CPI and jobless claims.'
  const evRow = (events, over = {}) => row({ id: 1, content_type: 'event_preview', text: EV_TEXT, source_ref: { facts: { dateLabel: 'Today', events } }, ...over })
  reset([evRow([{ time: '00:01', at: ago(120), currency: 'USD', title: 'CPI' }, { time: '00:02', at: ago(60), currency: 'USD', title: 'Claims' }])])
  const m = buildModule()
  await m.processSocialQueue()
  m.restore()
  check('all events past → skipped with the reason, publisher never called', find(1).status === 'skipped' && find(1).error === 'event already happened' && publishCalls.length === 0, `${find(1).status} ${find(1).error}`)
  check('the skip is DMed', dms.some(d => /event already happened/.test(d.text) && /publish/.test(d.text)), JSON.stringify(dms.map(d => d.text)))

  reset([evRow([{ time: '00:01', at: ago(60), currency: 'USD', title: 'CPI' }, { time: '23:59', at: new Date(Date.now() + 3600e3).toISOString(), currency: 'USD', title: 'Fed speaks' }])])
  const m2 = buildModule()
  await m2.processSocialQueue()
  m2.restore()
  check('one event still ahead → published as normal', find(1).status === 'published' && publishCalls.length === 1, find(1).status)
}

// Token warning DM: once a day, only from 7 days out.
{
  reset([])
  liToken = { expiresOn: '2026-09-28', daysLeft: 6, expired: false }
  const m = buildModule()
  await m.checkLinkedInToken()
  await m.checkLinkedInToken()
  m.restore()
  check('token 6 days out → one warning DM, not two', dms.filter(d => /LinkedIn token/.test(d.text)).length === 1 && dms[0].text.includes('Re-run the LinkedIn token script'), JSON.stringify(dms.map(d => d.text)))

  reset([])
  liToken = { expiresOn: '2026-10-10', daysLeft: 19, expired: false }
  const m2 = buildModule()
  await m2.checkLinkedInToken()
  m2.restore()
  check('token 19 days out → no DM', dms.length === 0)

  reset([])
  liToken = null
  const m3 = buildModule()
  await m3.checkLinkedInToken()
  m3.restore()
  check('LINKEDIN_TOKEN_EXPIRES unset → no DM, no crash', dms.length === 0)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
