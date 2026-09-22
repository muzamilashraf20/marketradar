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
for (const n of ['createDraftAndNotify', 'createLinkedInSibling', 'LINKEDIN_SIBLING_TYPES']) {
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
    `${escSrc}\n${truncSrc}\n${block}\nreturn { createDraftAndNotify, socialDraftMessage }`,
  )(supabase, sendTG, sendTGPhoto, tgCall, () => ADMIN, async k => snap[k] ?? null, (k, v) => { snap[k] = v }, generateDraft, validateSocialPost,
    app, async () => null, async () => null, async () => [], {}, () => {}, async () => {}, () => new Date().toISOString().slice(0, 10),
    () => false, () => 5, () => 90, () => 1, () => null, () => igCap)
}
const restore = () => { console.log = REAL.log; console.error = REAL.error; console.warn = REAL.warn }
const settle = () => new Promise(r => setTimeout(r, 400))
function reset() { rows = []; nextId = 1; uploads = []; tg = []; gens = []; logs = []; genImpl = null; igCap = 1; failUploads = false; for (const k of Object.keys(snap)) delete snap[k] }

const FACTS = { pair: 'EUR/USD', direction: 'BEARISH', confidence: 72, grade: 'B', reasoning: 'Rate gap widening. Specs long euro.', invalidation: '1.0850' }

// ── 1. X bias card → LinkedIn sibling with the same card ──────────────────────
{
  reset()
  const m = build()
  const x = await m.createDraftAndNotify({ contentType: 'bias_card', facts: FACTS, sourceRef: { trigger: 'bias_engine', biasHistoryId: 9 } })
  await settle()
  restore()
  const li = rows.find(r => r.platform === 'linkedin')
  check('X draft created', x && rows.find(r => r.id === x.id)?.platform === 'x')
  check('LinkedIn sibling created', !!li && li.status === 'draft' && li.content_type === 'bias_card', JSON.stringify(rows.map(r => `${r.id}:${r.platform}`)))
  check('sibling stores siblingId = the X row id, and keeps the trigger', li?.source_ref?.siblingId === x.id && li?.source_ref?.biasHistoryId === 9, JSON.stringify(li?.source_ref))
  check('sibling reuses the X card: same image_url, rendered once', li?.image_url === x.image_url && !!x.image_url && uploads.length === 1, `${li?.image_url} vs ${x.image_url}, uploads=${uploads.length}`)
  check('sibling generated from the same facts for platform linkedin', gens[1]?.platform === 'linkedin' && gens[1]?.facts === FACTS, JSON.stringify(gens.map(g => g.platform)))
  const xDm = tg.find(t => t.m === 'sendPhoto' && t.extra?.reply_markup)
  check('X DM header starts "X · bias_card"', /^📝 <b>X · bias_card<\/b>/.test(xDm?.caption || ''), xDm?.caption?.slice(0, 60))
  const liDm = tg.filter(t => t.m === 'sendMessage').find(t => /LINKEDIN · bias_card/.test(t.text))
  check('LinkedIn DM header starts "LINKEDIN · bias_card"', !!liDm && /^📝 <b>LINKEDIN · bias_card<\/b>/.test(liDm.text), JSON.stringify(tg.map(t => t.m)))
  check('LinkedIn DM keeps the full text and the buttons (too long for a caption)', liDm?.text.includes(LI_BODY.slice(-40).replace(/&/g, '&amp;')) && liDm?.extra?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === `sq:ap:${li?.id}`, liDm?.text?.slice(-80))
  check('LinkedIn card sent by URL before the text (no re-render)', tg.some(t => t.m === 'sendPhoto' && t.photo === x.image_url && /Card for #/.test(t.caption)), JSON.stringify(tg.filter(t => t.m === 'sendPhoto').map(t => t.photo || 'buffer')))
  check('tg_message_id on the LinkedIn row is the message with the buttons', rows.find(r => r.id === li?.id)?.tg_message_id === 100 + tg.indexOf(liDm) + 1, String(rows.find(r => r.id === li?.id)?.tg_message_id))
}

// A LinkedIn draft short enough for a caption goes out as one photo message by URL.
{
  reset()
  genImpl = args => {
    const text = args.platform === 'linkedin' ? 'EUR/USD leans lower.\n\nThe rate gap keeps widening in the dollar\'s favour.' : 'EUR/USD bearish. The rate gap keeps widening the dollar way.'
    const chosen = { shape: 'one-liner', text, flags: [], factcheck: { status: 'grounded', issue: null } }
    return { failed: false, chosen, variants: [chosen] }
  }
  const m = build()
  const x = await m.createDraftAndNotify({ contentType: 'bias_card', facts: FACTS })
  await settle()
  restore()
  const li = rows.find(r => r.platform === 'linkedin')
  const liDm = tg.find(t => t.m === 'sendPhoto' && t.photo === x.image_url)
  check('short LinkedIn DM: one photo message by URL, with caption and buttons', /^📝 <b>LINKEDIN · bias_card<\/b>/.test(liDm?.caption || '') && liDm?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === `sq:ap:${li?.id}`, JSON.stringify(liDm))
}

// ── 2. The sibling throws: the X draft stands ─────────────────────────────────
{
  reset()
  genImpl = args => { if (args.platform === 'linkedin') throw new Error('Anthropic 529 overloaded'); return generateDraftDefault(args) }
  const m = build()
  let thrown = null, x = null
  try { x = await m.createDraftAndNotify({ contentType: 'bias_card', facts: FACTS }) } catch (e) { thrown = e }
  await settle()
  restore()
  check('X draft returned despite the sibling throwing', !thrown && x?.platform === 'x' && x?.status === 'draft', thrown?.message)
  check('X row is saved and DM\'d', rows.some(r => r.id === x?.id) && tg.some(t => t.extra?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === `sq:ap:${x?.id}`))
  check('no LinkedIn row after the failure', !rows.some(r => r.platform === 'linkedin'))
  check('the sibling failure is logged, naming the X draft as unaffected', logs.some(l => /LinkedIn sibling of #\d+ failed \(X draft unaffected\).*529/.test(l)), logs.join(' | '))
}
function generateDraftDefault(args) {
  const text = args.platform === 'linkedin' ? LI_BODY : 'EUR/USD bearish. The rate gap keeps widening the dollar way.'
  const chosen = { shape: 'one-liner', text, flags: [], factcheck: { status: 'grounded', issue: null } }
  return { failed: false, chosen, variants: [chosen] }
}

// A sibling that is blocked by the guardrails (failed draft) is also just a skipped sibling.
{
  reset()
  genImpl = args => args.platform === 'linkedin'
    ? { failed: true, chosen: null, variants: [{ shape: 'x', text: 'bad', flags: [{ level: 'hard', code: 'guarantee', msg: 'Promises an outcome' }] }] }
    : generateDraftDefault(args)
  const m = build()
  const x = await m.createDraftAndNotify({ contentType: 'bias_card', facts: FACTS })
  await settle()
  restore()
  check('blocked sibling: X draft stands, no LinkedIn row', x?.platform === 'x' && !rows.some(r => r.platform === 'linkedin'))
}

// ── 3. One LinkedIn draft per day ─────────────────────────────────────────────
{
  reset()
  const m = build()
  await m.createDraftAndNotify({ contentType: 'bias_card', facts: FACTS })
  await settle()
  await m.createDraftAndNotify({ contentType: 'event_preview', facts: { dateLabel: 'Monday', events: [{ time: '12:30', currency: 'USD', title: 'CPI', impact: 'High' }] } })
  await settle()
  restore()
  check('second X draft the same day → no second LinkedIn draft', rows.filter(r => r.platform === 'linkedin').length === 1 && rows.filter(r => r.platform === 'x').length === 2, JSON.stringify(rows.map(r => `${r.platform}:${r.content_type}`)))
  check('the skip is logged', logs.some(l => /today already has LinkedIn draft/.test(l)), logs.join(' | '))

  // A skipped or failed LinkedIn row does not use up the day.
  reset()
  rows.push({ id: 50, platform: 'linkedin', content_type: 'bias_card', status: 'skipped', created_at: new Date().toISOString(), text: 'old' })
  nextId = 51
  const m2 = build()
  await m2.createDraftAndNotify({ contentType: 'bias_card', facts: FACTS })
  await settle()
  restore()
  check('a skipped LinkedIn row today does not block a new sibling', rows.filter(r => r.platform === 'linkedin' && r.status === 'draft').length === 1)
}

// ── 4. Which types get siblings ───────────────────────────────────────────────
for (const [contentType, want] of [['trader_pain', false], ['contrarian', false], ['macro_insight', true], ['news_reaction', true], ['build_log', true]]) {
  reset()
  const m = build()
  await m.createDraftAndNotify({ contentType, facts: contentType === 'macro_insight' ? { reasoning: 'Gold firm.' } : {}, notes: 'n' })
  await settle()
  restore()
  const got = rows.some(r => r.platform === 'linkedin')
  check(`${contentType} → ${want ? 'gets' : 'no'} LinkedIn sibling`, got === want, JSON.stringify(rows.map(r => r.platform)))
}

// A LinkedIn draft never spawns a sibling of its own.
{
  reset()
  const m = build()
  await m.createDraftAndNotify({ contentType: 'bias_card', platform: 'linkedin', facts: FACTS })
  await settle()
  restore()
  check('a LinkedIn draft does not spawn another draft', rows.length === 1 && rows[0].platform === 'linkedin', JSON.stringify(rows.map(r => r.platform)))
}

// ── 5. Instagram siblings ─────────────────────────────────────────────────────
const IG_BODY = 'EUR/USD leans lower today.\n\nThe rate gap keeps widening in the dollar\'s favour.\n\n#forex #eurusd #macro #trading #fx'
const genWithIg = (overrideIg) => args => {
  if (args.platform === 'instagram' && overrideIg) return overrideIg(args)
  const text = args.platform === 'linkedin' ? LI_BODY : args.platform === 'instagram' ? IG_BODY : 'EUR/USD bearish. The rate gap keeps widening the dollar way.'
  const chosen = { shape: 'one-liner', text, flags: [], factcheck: { status: 'grounded', issue: null } }
  return { failed: false, chosen, variants: [chosen] }
}
{
  reset(); genImpl = genWithIg()
  const m = build()
  const x = await m.createDraftAndNotify({ contentType: 'bias_card', facts: FACTS, sourceRef: { trigger: 'bias_engine' } })
  await settle()
  restore()
  const ig = rows.find(r => r.platform === 'instagram')
  check('X bias card → Instagram sibling', !!ig && ig.status === 'draft' && ig.content_type === 'bias_card', JSON.stringify(rows.map(r => r.platform)))
  check('Instagram sibling reuses the X card, rendered once', ig?.image_url === x.image_url && uploads.length === 1, `${ig?.image_url} uploads=${uploads.length}`)
  check('Instagram sibling stores siblingId and the trigger', ig?.source_ref?.siblingId === x.id && ig?.source_ref?.trigger === 'bias_engine', JSON.stringify(ig?.source_ref))
  check('Instagram generated for platform instagram from the same facts', gens.some(g => g.platform === 'instagram' && g.facts === FACTS))
  check('LinkedIn sibling still created alongside', rows.some(r => r.platform === 'linkedin'))
  const igDm = tg.find(t => (t.caption || t.text || '').includes('INSTAGRAM · bias_card'))
  check('Instagram DM header starts "INSTAGRAM · bias_card"', /📝 <b>INSTAGRAM · bias_card<\/b>/.test(igDm?.caption || igDm?.text || ''), JSON.stringify(tg.map(t => (t.caption || t.text || '').slice(0, 40))))
}

// The Instagram sibling throws: X and LinkedIn stand.
{
  reset(); genImpl = genWithIg(() => { throw new Error('Anthropic overloaded for instagram') })
  const m = build()
  let thrown = null, x = null
  try { x = await m.createDraftAndNotify({ contentType: 'bias_card', facts: FACTS }) } catch (e) { thrown = e }
  await settle()
  restore()
  check('Instagram sibling failure: X draft returned and saved', !thrown && x?.platform === 'x' && rows.some(r => r.id === x.id), thrown?.message)
  check('Instagram sibling failure: LinkedIn sibling unaffected', rows.some(r => r.platform === 'linkedin') && !rows.some(r => r.platform === 'instagram'), JSON.stringify(rows.map(r => r.platform)))
  check('Instagram sibling failure is logged as X-unaffected', logs.some(l => /Instagram sibling of #\d+ failed \(X draft unaffected\)/.test(l)), logs.join(' | '))
}

// Types without a card: no Instagram sibling (LinkedIn may still get one).
for (const contentType of ['macro_insight', 'news_reaction', 'build_log', 'trader_pain']) {
  reset(); genImpl = genWithIg()
  const m = build()
  await m.createDraftAndNotify({ contentType, facts: contentType === 'macro_insight' ? { reasoning: 'Gold firm.' } : {}, notes: 'n' })
  await settle()
  restore()
  check(`${contentType} → no Instagram sibling`, !rows.some(r => r.platform === 'instagram'), JSON.stringify(rows.map(r => r.platform)))
}
{
  reset(); genImpl = genWithIg()
  const m = build()
  await m.createDraftAndNotify({ contentType: 'event_preview', facts: { dateLabel: 'Monday', events: [{ time: '12:30', currency: 'USD', title: 'CPI', impact: 'High' }] } })
  await settle()
  restore()
  check('event_preview → Instagram sibling', rows.some(r => r.platform === 'instagram' && r.content_type === 'event_preview'), JSON.stringify(rows.map(r => `${r.platform}:${r.content_type}`)))
}

// X card render failed: no image to reuse → no Instagram sibling.
{
  reset(); genImpl = genWithIg(); failUploads = true
  const m = build()
  const x = await m.createDraftAndNotify({ contentType: 'bias_card', facts: FACTS })
  await settle()
  restore()
  check('X draft without a card → no Instagram sibling, and it says why', !x.image_url && !rows.some(r => r.platform === 'instagram') && logs.some(l => /no card to reuse/.test(l)), JSON.stringify(rows.map(r => r.platform)))
}

// IG_DAILY_CAP bounds Instagram drafts per day.
{
  reset(); genImpl = genWithIg()
  const m = build()
  await m.createDraftAndNotify({ contentType: 'bias_card', facts: FACTS })
  await settle()
  await m.createDraftAndNotify({ contentType: 'event_preview', facts: { dateLabel: 'Monday', events: [{ time: '12:30', currency: 'USD', title: 'CPI', impact: 'High' }] } })
  await settle()
  restore()
  check('cap 1: second card draft the same day → no second Instagram draft', rows.filter(r => r.platform === 'instagram').length === 1 && logs.some(l => /today already has 1 Instagram draft/.test(l)), JSON.stringify(rows.map(r => r.platform)))

  reset(); genImpl = genWithIg(); igCap = 2
  const m2 = build()
  await m2.createDraftAndNotify({ contentType: 'bias_card', facts: FACTS })
  await settle()
  await m2.createDraftAndNotify({ contentType: 'event_preview', facts: { dateLabel: 'Monday', events: [{ time: '12:30', currency: 'USD', title: 'CPI', impact: 'High' }] } })
  await settle()
  restore()
  check('cap 2: two Instagram drafts allowed', rows.filter(r => r.platform === 'instagram').length === 2, JSON.stringify(rows.map(r => r.platform)))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
