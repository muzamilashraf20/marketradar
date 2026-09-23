// Test vectors for LinkedIn sibling drafts.
//   node backend/scripts/socialSibling.test.mjs
//
// Same approach as the other social tests: the draft block is read out of index.js and run against
// fakes, so this is the shipped code. What matters most here: an X draft is never lost because its
// LinkedIn sibling failed, and there is at most one LinkedIn draft a day.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validateSocialPost } from '../social/guardrails.js'

const src = readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8')
const cut = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to)
  if (a === -1 || b === -1 || b <= a) throw new Error(`index.js extraction failed at "${from}" — did the section move?`)
  return src.slice(a, b)
}
const RENDERER = new URL('../social/renderer.js', import.meta.url).href
const block = cut('// 📝 SOCIAL DRAFTS', '// ⏰ SOCIAL TRIGGERS').replace("await import('./social/renderer.js')", `await import('${RENDERER}')`)
const escSrc = cut('function esc(s)', '// Resolve the caller')
const truncSrc = cut('function truncateTGHtml', '// Photo upload via multipart')
for (const n of ['createDraftAndNotify', 'createInstagramSibling', 'LINKEDIN_SIBLING_TYPES']) {
  if (!block.includes(n)) throw new Error(`extraction sanity check failed: ${n} not found`)
}

let pass = 0, fail = 0
const REAL = { log: console.log, error: console.error, warn: console.warn }
function check(name, ok, detail = '') {
  ok ? pass++ : fail++
  REAL.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`)
}

// ── Fakes ─────────────────────────────────────────────────────────────────────
let rows = [], nextId = 1, uploads = [], tg = [], gens = [], logs = []
let genImpl = null
let igCap = 1
let failUploads = false
const ADMIN = '111222333'

function table() {
  const st = { filters: [], op: 'select', payload: null, limitN: null }
  const hits = () => rows.filter(r => st.filters.every(f => f(r)))
  const run = () => {
    if (st.op === 'insert') { const r = { id: nextId++, created_at: new Date().toISOString(), regen_count: 0, ...st.payload }; rows.push(r); return { data: [{ ...r }], error: null } }
    if (st.op === 'update') { const h = hits(); h.forEach(r => Object.assign(r, st.payload)); return { data: h.map(r => ({ ...r })), error: null } }
    let out = hits().map(r => ({ ...r }))
    if (st.limitN != null) out = out.slice(0, st.limitN)
    return { data: out, error: null }
  }
  const b = {
    select() { return b }, insert(p) { st.op = 'insert'; st.payload = p; return b }, update(p) { st.op = 'update'; st.payload = p; return b },
    eq(k, v) { st.filters.push(r => r[k] === v); return b }, neq(k, v) { st.filters.push(r => r[k] !== v); return b },
    in(k, vs) { st.filters.push(r => vs.includes(r[k])); return b }, gt(k, v) { st.filters.push(r => r[k] > v); return b },
    gte(k, v) { st.filters.push(r => r[k] >= v); return b }, order() { return b }, limit(n) { st.limitN = n; return b },
    single: async () => { const r = run(); return { data: r.data[0] ?? null, error: r.data[0] ? null : { message: 'no rows' } } },
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then(res, rej) { return Promise.resolve(run()).then(res, rej) },
  }
  return b
}
const supabase = {
  from: table,
  storage: { from: bucket => ({
    upload: async (path, png) => { if (failUploads) return { error: { message: 'storage down' } }; uploads.push({ bucket, path, bytes: png.length }); return { error: null } },
    getPublicUrl: path => ({ data: { publicUrl: `https://bucket.example/${bucket}/${path}` } }),
  }) },
}
const sendTG = async (chat, text, extra = {}) => { tg.push({ m: 'sendMessage', chat, text, extra }); return { message_id: 100 + tg.length } }
const sendTGPhoto = async (chat, buf, caption, extra = {}) => { tg.push({ m: 'sendPhoto', chat, caption, extra, bytes: buf.length }); return 200 + tg.length }
const tgCall = async (method, body) => { tg.push({ m: method, ...body }); return { message_id: 300 + tg.length } }
const snap = {}

// ~1250 characters, as LinkedIn drafts are (500–1300): past Telegram's 1024-character caption limit.
const LI_BODY = 'Why EUR/USD still leans lower, in plain terms.\n\n' + 'The rate gap between US and German 2Y yields keeps widening, and that gap is what pays traders to hold dollars over euros. '.repeat(10) + '\n\n#forex #macro'
const generateDraft = async args => {
  gens.push(args)
  if (genImpl) return genImpl(args)
  const text = args.platform === 'linkedin' ? LI_BODY : 'EUR/USD bearish. The rate gap keeps widening the dollar way.'
  const chosen = { shape: 'one-liner', text, flags: [], factcheck: { status: 'grounded', issue: null } }
  return { failed: false, chosen, variants: [chosen] }
}

function build() {
  const app = { post: () => {}, get: () => {}, patch: () => {} }
  console.log = (...a) => logs.push(a.join(' '))
  console.error = (...a) => logs.push(a.join(' '))
  console.warn = (...a) => logs.push(a.join(' '))
  return new Function(
    'supabase', 'sendTG', 'sendTGPhoto', 'tgCall', 'v2AdminChat', 'v2LoadSnapshot', 'v2SaveSnapshot', 'generateDraft', 'validateSocialPost',
    'app', 'requireUser', 'optionalUser', 'getEconomicCalendar', 'anthropic', 'trackAI', 'processSocialQueue', 'utcDay',
    'socialAutopilotOn', 'xDailyCap', 'xMinGapMin', 'linkedinDailyCap', 'linkedinTokenStatus', 'igDailyCap',
    // The DM builder asks what shape a row is (story / carousel / post) and what the story cap is.
    'isStoryRow', 'carouselSlidesOf', 'igStoryDailyCap',
    `${escSrc}\n${truncSrc}\n${block}\nreturn { createDraftAndNotify, socialDraftMessage, createInstagramSibling }`,
  )(supabase, sendTG, sendTGPhoto, tgCall, () => ADMIN, async k => snap[k] ?? null, (k, v) => { snap[k] = v }, generateDraft, validateSocialPost,
    app, async () => null, async () => null, async () => [], {}, () => {}, async () => {}, () => new Date().toISOString().slice(0, 10),
    () => false, () => 5, () => 90, () => 1, () => null, () => igCap,
    row => String(row?.format || 'feed') === 'story', row => (Array.isArray(row?.source_ref?.slides) ? row.source_ref.slides : []), () => 3)
}
const restore = () => { console.log = REAL.log; console.error = REAL.error; console.warn = REAL.warn }
const settle = () => new Promise(r => setTimeout(r, 400))
function reset() { rows = []; nextId = 1; uploads = []; tg = []; gens = []; logs = []; genImpl = null; igCap = 1; failUploads = false; for (const k of Object.keys(snap)) delete snap[k] }

const FACTS = { pair: 'EUR/USD', direction: 'BEARISH', confidence: 72, grade: 'B', reasoning: 'Rate gap widening. Specs long euro.', invalidation: '1.0850' }

// ── 1. No LinkedIn siblings under the current plan ────────────────────────────
// LinkedIn gets its own education and Saturday results from the planner; X drafts are not copied.
for (const [contentType, facts] of [
  ['bias_card', FACTS], ['event_preview', { dateLabel: 'Monday', events: [{ time: '12:30', currency: 'USD', title: 'CPI', impact: 'High' }] }],
  ['news_reaction', { headline: 'Fed holds', marketTags: ['USD↑'] }], ['macro_insight', { reasoning: 'Gold firm.' }],
  ['weekly_scorecard', { rangeLabel: 'x', rows: [{ date: 'Mon', pair: 'EURUSD', direction: 'BEARISH', outcome: 'hit' }] }], ['build_log', {}],
]) {
  reset()
  const m = build()
  await m.createDraftAndNotify({ contentType, facts, notes: 'n' })
  await settle()
  restore()
  check(`X ${contentType} → no LinkedIn sibling`, !rows.some(r => r.platform === 'linkedin'), JSON.stringify(rows.map(r => r.platform)))
}

// A LinkedIn draft made directly (as the planner does) never spawns anything.
{
  reset()
  const m = build()
  await m.createDraftAndNotify({ contentType: 'education', platform: 'linkedin', facts: { topic: 'Carry trade', angle: 'x' } })
  await settle()
  restore()
  check('a LinkedIn draft does not spawn another draft', rows.length === 1 && rows[0].platform === 'linkedin', JSON.stringify(rows.map(r => r.platform)))
}

// ── 2. DM mechanics for drafts too long for a caption ─────────────────────────
// A LinkedIn scorecard renders its own card and runs past Telegram's 1024-character caption limit:
// card first, then the full text with the buttons on it.
{
  reset()
  const m = build()
  const li = await m.createDraftAndNotify({ contentType: 'weekly_scorecard', platform: 'linkedin', facts: { rangeLabel: '15 – 19 September', rows: [{ date: 'Mon 15', pair: 'EURUSD', direction: 'BEARISH', outcome: 'hit' }, { date: 'Tue 16', pair: 'GBPUSD', direction: 'BULLISH', outcome: 'miss' }, { date: 'Wed 17', pair: 'AUDUSD', direction: 'BEARISH', outcome: 'miss' }] } })
  await settle()
  restore()
  const textDm = tg.find(t => t.m === 'sendMessage' && t.extra?.reply_markup)
  check('LinkedIn DM header starts "LINKEDIN · weekly_scorecard"', /^📝 <b>LINKEDIN · weekly_scorecard<\/b>/.test(textDm?.text || ''), textDm?.text?.slice(0, 60))
  check('long LinkedIn draft: card first (rendered), then full text with buttons', tg.findIndex(t => t.m === 'sendPhoto') < tg.indexOf(textDm) && textDm?.extra?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === `sq:ap:${li.id}`, JSON.stringify(tg.map(t => t.m)))
  check('tg_message_id is the message with the buttons', rows.find(r => r.id === li.id)?.tg_message_id === 100 + tg.indexOf(textDm) + 1, String(rows.find(r => r.id === li.id)?.tg_message_id))
}

// ── 5. No Instagram siblings under the current plan ───────────────────────────
// Instagram now runs its own content plan — one carousel a day plus its own story lane — so an X
// draft is not copied there. A sibling would only compete with the carousel for IG_DAILY_CAP.
// createInstagramSibling is kept for the day a type is added back to INSTAGRAM_SIBLING_TYPES, and
// is exercised directly below so it cannot rot.
const IG_BODY = 'EUR/USD leans lower today.\n\nThe rate gap keeps widening in the dollar\'s favour.\n\n#forex #eurusd #macro #trading #fx'
const genWithIg = (overrideIg) => args => {
  if (args.platform === 'instagram' && overrideIg) return overrideIg(args)
  const text = args.platform === 'linkedin' ? LI_BODY : args.platform === 'instagram' ? IG_BODY : 'EUR/USD bearish. The rate gap keeps widening the dollar way.'
  const chosen = { shape: 'one-liner', text, flags: [], factcheck: { status: 'grounded', issue: null } }
  return { failed: false, chosen, variants: [chosen] }
}

for (const [contentType, facts] of [
  ['bias_card', FACTS],
  ['event_preview', { dateLabel: 'Monday', events: [{ time: '12:30', currency: 'USD', title: 'CPI', impact: 'High' }] }],
  ['weekly_scorecard', { rangeLabel: 'x', rows: [{ date: 'Mon', pair: 'EURUSD', direction: 'BEARISH', outcome: 'hit' }] }],
  ['news_reaction', { headline: 'Fed holds', marketTags: ['USD'] }],
  ['macro_insight', { reasoning: 'Gold firm.' }],
]) {
  reset(); genImpl = genWithIg()
  const m = build()
  await m.createDraftAndNotify({ contentType, facts, notes: 'n' })
  await settle()
  restore()
  check(`X ${contentType} → no Instagram sibling (Instagram posts its own carousel)`, !rows.some(r => r.platform === 'instagram'), JSON.stringify(rows.map(r => r.platform)))
}

{
  reset(); genImpl = genWithIg()
  const m = build()
  const x = await m.createDraftAndNotify({ contentType: 'bias_card', facts: FACTS, sourceRef: { trigger: 'bias_engine' } })
  await settle()
  restore()
  check('an X draft still renders exactly one card for itself', uploads.length === 1 && !!x.image_url, `uploads=${uploads.length}`)
  check('no LinkedIn or Instagram row alongside it', rows.length === 1 && rows[0].platform === 'x', JSON.stringify(rows.map(r => r.platform)))
}

// Called directly, the sibling helper still works — that is what makes re-enabling it a one-line
// change — and it still reuses the X card rather than rendering a second one.
{
  reset(); genImpl = genWithIg()
  const m = build()
  const x = await m.createDraftAndNotify({ contentType: 'bias_card', facts: FACTS, sourceRef: { trigger: 'bias_engine' } })
  await settle()
  const ig = await m.createInstagramSibling(x, { contentType: 'bias_card', facts: FACTS, sourceRef: { trigger: 'bias_engine' }, pillar: 'daily_bias' })
  await settle()
  restore()
  check('createInstagramSibling still reuses the X card, rendered once', ig?.image_url === x.image_url && uploads.length === 1, `${ig?.image_url} uploads=${uploads.length}`)
  check('createInstagramSibling stores siblingId and the trigger', ig?.source_ref?.siblingId === x.id && ig?.source_ref?.trigger === 'bias_engine', JSON.stringify(ig?.source_ref))
  const igDm = tg.find(t => (t.caption || t.text || '').includes('INSTAGRAM · bias_card'))
  check('its DM header says INSTAGRAM, and the buttons act on the Instagram row',
    /📝 <b>INSTAGRAM · bias_card<\/b>/.test(igDm?.caption || igDm?.text || '')
    && (igDm?.reply_markup || igDm?.extra?.reply_markup)?.inline_keyboard?.[0]?.[0]?.callback_data === `sq:ap:${ig?.id}`,
    JSON.stringify(tg.map(t => (t.caption || t.text || '').slice(0, 40))))

  // Its two gates still hold: no card to reuse, and the daily cap.
  reset(); genImpl = genWithIg()
  const m2 = build()
  const noCard = await m2.createInstagramSibling({ id: 1, image_url: null }, { contentType: 'bias_card', facts: FACTS, sourceRef: {} })
  restore()
  check('no card to reuse → no Instagram sibling, and it says why', noCard === null && logs.some(l => /no card to reuse/.test(l)), logs.join(' | '))

  reset(); genImpl = genWithIg()
  const m3 = build()
  const x3 = await m3.createDraftAndNotify({ contentType: 'bias_card', facts: FACTS })
  await settle()
  await m3.createInstagramSibling(x3, { contentType: 'bias_card', facts: FACTS, sourceRef: {} })
  await settle()
  const second = await m3.createInstagramSibling(x3, { contentType: 'bias_card', facts: FACTS, sourceRef: {} })
  await settle()
  restore()
  check('cap 1: the second Instagram draft of the day is refused', second === null && rows.filter(r => r.platform === 'instagram').length === 1 && logs.some(l => /today already has 1 Instagram draft/.test(l)), JSON.stringify(rows.map(r => r.platform)))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
