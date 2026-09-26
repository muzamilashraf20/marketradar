// Test vectors for the content-plan pieces that are not planner timing:
//   node backend/scripts/socialPlan.test.mjs
// the education claim check, the DM formats, the approve-time past-event skip, and outcome scoring
// running on a schedule. Code under test is read out of index.js / imported from the modules.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { generateDraft, eduSpecificClaims } from '../social/generator.js'
import { validateSocialPost } from '../social/guardrails.js'

const src = readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8')
const cut = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a + 1)
  if (a === -1 || b === -1 || b <= a) throw new Error(`index.js extraction failed at "${from}" — did the section move?`)
  return src.slice(a, b)
}

let pass = 0, fail = 0
const REAL = { log: console.log, error: console.error, warn: console.warn }
function check(name, ok, detail = '') {
  ok ? pass++ : fail++
  REAL.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`)
}
const quiet = () => { console.log = () => {}; console.warn = () => {}; console.error = () => {} }
const loud = () => { console.log = REAL.log; console.warn = REAL.warn; console.error = REAL.error }

// ── 1. Education claim check ──────────────────────────────────────────────────
{
  check('specific year is caught', eduSpecificClaims('Back in 2022 things moved.').some(s => /year/.test(s)))
  check('bp figure is caught', eduSpecificClaims('The Fed hiked 425bp.').some(s => /figure/.test(s)))
  check('percentage is caught', eduSpecificClaims('Inflation ran at 9.1% at its peak.').some(s => /figure/.test(s)))
  check('calendar date is caught', eduSpecificClaims('On March 15 the market turned.').some(s => /date/.test(s)))
  check('a clean mechanism explanation has none', eduSpecificClaims('When one central bank raises rates faster than another, the gap attracts capital toward the higher-yielding currency.').length === 0)

  const BAD = 'Rate differentials drive currencies. In 2022 the Fed hiked 425bp and the dollar surged as capital chased the yield gap.'
  const GOOD = 'Rate differentials drive currencies.\n\nWhen one central bank raises rates faster than another, capital tends to flow toward the higher yield.\n\n#forex'
  const calls = []
  let haiku = () => ({ checks: [{ i: 0, grounded: true, issue: null }, { i: 1, grounded: true, issue: null }] })
  const fake = { messages: { create: async p => {
    calls.push(p)
    if (p.model.includes('haiku')) return { content: [{ type: 'text', text: JSON.stringify(haiku(p)) }], usage: {} }
    return { content: [{ type: 'text', text: JSON.stringify({ variants: [{ shape: 'explainer', text: BAD }, { shape: 'setup-then-punch', text: GOOD }] }) }], usage: {} }
  } } }
  quiet()
  const r = await generateDraft({ contentType: 'education', platform: 'linkedin', facts: { topic: 'Rate differentials', angle: 'Why the gap moves money.' }, anthropic: fake })
  loud()
  const bad = r.variants.find(v => v.text === BAD)
  check('"in 2022 the Fed hiked 425bp" → hard claim_check flag, even when the model check passes it', bad?.flags.some(f => f.level === 'hard' && f.code === 'claim_check' && /year/.test(f.msg)) && bad.flags.some(f => f.code === 'claim_check' && /425bp/.test(f.msg)), JSON.stringify(bad?.flags))
  check('the clean variant is chosen', r.chosen?.text === GOOD && !r.failed, JSON.stringify(r.chosen))
  const haikuCall = calls.find(c => c.model.includes('haiku'))
  check('education uses the accuracy check, not the FACTS grounding check', /review educational posts/.test(haikuCall?.system || '') && !/against the source FACTS/.test(haikuCall?.system || ''), haikuCall?.system)
  check('the writer got the education brief and the topic', /educational post about FACTS\.topic/.test(calls[0].messages[0].content) && calls[0].messages[0].content.includes('Rate differentials'))

  // The model check catches a wrong (not merely specific) statement.
  haiku = () => ({ checks: [{ i: 0, grounded: true, issue: null }, { i: 1, grounded: false, issue: 'Says higher rates always strengthen a currency — oversimplified to the point of being wrong' }] })
  const fake2 = { messages: { create: async p => (p.model.includes('haiku')
    ? { content: [{ type: 'text', text: JSON.stringify(haiku()) }], usage: {} }
    : { content: [{ type: 'text', text: JSON.stringify({ variants: [{ shape: 'explainer', text: GOOD }, { shape: 'question', text: 'Why do higher rates always make a currency stronger? Because capital always follows yield.' }] }) }], usage: {} }) } }
  quiet()
  const r2 = await generateDraft({ contentType: 'education', platform: 'linkedin', facts: { topic: 'Rate differentials', angle: 'x' }, anthropic: fake2 })
  loud()
  const wrong = r2.variants[1]
  check('model-flagged wrong statement → hard claim_check with the issue', wrong.flags.some(f => f.level === 'hard' && f.code === 'claim_check' && /oversimplified/.test(f.msg)), JSON.stringify(wrong.flags))
}

// ── 2. DM formats: ⚡ NEWS header, topic instead of FACTS ─────────────────────
{
  const escSrc = cut('function esc(s)', '// Resolve the caller')
  const dmSrc = cut('// The source values the draft was written from', 'const socialKeyboard')
  // The DM builder asks what shape a row is (story / carousel / post) and what the story cap is.
  const { socialDraftMessage } = new Function(
    'SOCIAL_MAX_REGENS', 'isStoryRow', 'carouselSlidesOf', 'igStoryDailyCap',
    `${escSrc}\n${dmSrc}\nreturn { socialDraftMessage }`,
  )(3, row => String(row?.format || 'feed') === 'story', row => (Array.isArray(row?.source_ref?.slides) ? row.source_ref.slides : []), () => 3)
  const news = socialDraftMessage({ id: 7, platform: 'x', content_type: 'news_reaction', pillar: 'macro_news', text: 'Take.', source_ref: { facts: { headline: 'Fed holds' }, chosen: {} } })
  check('news DM header starts with "⚡ NEWS ·"', news.startsWith('⚡ NEWS · <b>X · news_reaction</b>'), news.slice(0, 60))
  const bias = socialDraftMessage({ id: 8, platform: 'x', content_type: 'bias_card', pillar: 'daily_bias', text: 'Take.', source_ref: { facts: { pair: 'EURUSD' }, chosen: {} } })
  check('other DMs keep the 📝 header', bias.startsWith('📝 <b>X · bias_card</b>'), bias.slice(0, 40))
  const edu = socialDraftMessage({ id: 9, platform: 'linkedin', content_type: 'education', pillar: 'education', text: 'Lesson.', source_ref: { facts: { topic: 'The carry trade', angle: 'x' }, chosen: {} } })
  check('education DM shows "topic: …" in place of the FACTS block', edu.includes('topic: The carry trade') && !edu.includes('<b>FACTS</b>'), edu)
}

// ── 3. Approve refuses a preview whose events have all happened ───────────────
{
  const approveSrc = cut('// Approve / skip, shared by the Telegram buttons', 'async function socialSkipById')
  const pastEventSrc = cut('function eventsAllPast', '// ── Scorecard')
  const escSrc = cut('function esc(s)', '// Resolve the caller')
  let rows = [], dms = []
  const supabase = { from: () => {
    const st = { f: [], op: 'select', p: null }
    const hit = () => rows.filter(r => st.f.every(fn => fn(r)))
    const run = () => { if (st.op === 'update') { const h = hit(); h.forEach(r => Object.assign(r, st.p)); return { data: h.map(r => ({ ...r })), error: null } } return { data: hit().map(r => ({ ...r })), error: null } }
    const b = { select() { return b }, update(p) { st.op = 'update'; st.p = p; return b }, eq(k, v) { st.f.push(r => r[k] === v); return b }, in(k, vs) { st.f.push(r => vs.includes(r[k])); return b },
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }), then(res, rej) { return Promise.resolve(run()).then(res, rej) } }
    return b
  } }
  let transitions = 0
  // socialHardFlags picks the right check per row shape; here every row is a plain X post, so it
  // is the ordinary guardrail pass. EVENT_ROW_TYPES is what makes the past-event skip cover the
  // Instagram event story as well as the X preview.
  const { socialApproveById } = new Function(
    'supabase', 'validateSocialPost', 'socialPastTexts', 'socialTransition', 'processSocialQueue', 'v2AdminChat', 'sendTG',
    'socialHardFlags', 'EVENT_ROW_TYPES',
    `${escSrc}\n${pastEventSrc}\n${approveSrc}\nreturn { socialApproveById }`,
  )(supabase, validateSocialPost, async () => [], async (id, status) => { transitions++; const r = rows.find(x => x.id === id); r.status = status; return { ...r } }, async () => {}, () => '111', async (c, t) => { dms.push(t) },
    async (row, pastTexts) => validateSocialPost(row.text, { platform: row.platform, contentType: row.content_type, facts: row.source_ref?.facts || {}, pastTexts }).flags.filter(f => f.level === 'hard'),
    new Set(['event_preview', 'event_story']))

  const past = new Date(Date.now() - 3600e3).toISOString()
  rows = [{ id: 5, platform: 'x', content_type: 'event_preview', status: 'draft', text: 'Two USD prints today.', created_at: new Date().toISOString(), source_ref: { facts: { events: [{ at: past, time: past.slice(11, 16), currency: 'USD', title: 'CPI' }] } } }]
  quiet()
  const r = await socialApproveById(5)
  loud()
  check('approve on an all-past preview → refused with 410 and the reason', r.ok === false && r.code === 410 && /Event already happened/.test(r.reason), JSON.stringify(r))
  check('…and the row is marked skipped with "event already happened"', rows[0].status === 'skipped' && rows[0].error === 'event already happened' && transitions === 0, JSON.stringify(rows[0]))
  check('…and the admin is DMed', dms.some(t => /event already happened/.test(t) && /approve/.test(t)), JSON.stringify(dms))

  const ahead = new Date(Date.now() + 3600e3).toISOString()
  rows = [{ id: 6, platform: 'x', content_type: 'event_preview', status: 'draft', text: 'CPI lands this afternoon.', created_at: new Date().toISOString(), source_ref: { facts: { events: [{ at: ahead, time: ahead.slice(11, 16), currency: 'USD', title: 'CPI' }] } } }]
  quiet()
  const r2 = await socialApproveById(6)
  loud()
  check('approve on an upcoming preview → approved as normal', r2.ok === true && rows[0].status === 'approved', JSON.stringify(r2))
}

// ── 4. Outcome scoring runs on a schedule, without the endpoint ───────────────
{
  // From the dedupe helper on: scoreBiasHistory collapses duplicate rows before scoring them.
  const scoringSrc = cut('// Collapse bias_history rows that record the SAME', "app.get('/api/bias-performance'")
  let history = [], scored = []
  const supabase = { from: () => {
    const st = { f: [], op: 'select', p: null }
    const hit = () => history.filter(r => st.f.every(fn => fn(r)))
    const run = () => { if (st.op === 'update') { hit().forEach(r => Object.assign(r, st.p)); return { error: null } } return { data: hit().map(r => ({ ...r })), error: null } }
    const b = { select() { return b }, update(p) { st.op = 'update'; st.p = p; return b }, eq(k, v) { st.f.push(r => r[k] === v); return b }, gte(k, v) { st.f.push(r => r[k] >= v); return b },
      order() { return b }, limit() { return b }, then(res, rej) { return Promise.resolve(run()).then(res, rej) } }
    return b
  } }
  // scoreBias stand-in: a bias older than 24h gets a final verdict, a newer one is still live.
  const scoreBias = async row => { scored.push(row.id); return Date.now() - Date.parse(row.generated_at) > 24 * 3600e3 ? { status: 'final', correct: row.id % 2 === 0, pips: 10 } : { status: 'live', correct: null } }
  const { runScheduledScoring, scoreBiasHistory } = new Function('supabase', 'scoreBias', 'TRACKER_MAX_FETCHES', `${scoringSrc}\nreturn { runScheduledScoring, scoreBiasHistory }`)(supabase, scoreBias, 6)

  const h = hrs => new Date(Date.now() - hrs * 3600e3).toISOString()
  history = [
    { id: 1, engine: 'v2', pair: 'EURUSD', generated_at: h(48), performance: null },
    { id: 2, engine: 'v2', pair: 'GBPUSD', generated_at: h(30), performance: null },
    { id: 3, engine: 'v2', pair: 'AUDUSD', generated_at: h(3), performance: null },
    { id: 4, engine: 'v2', pair: 'USDJPY', generated_at: h(72), performance: { status: 'final', correct: true } },
  ]
  quiet()
  await runScheduledScoring()
  loud()
  check('scheduled run persists final outcomes for windows that have closed', history[0].performance?.status === 'final' && history[1].performance?.status === 'final', JSON.stringify(history.map(r => r.performance)))
  check('a bias still inside its 24h window is not persisted', history[2].performance === null)
  check('already-final rows are not re-fetched (no API cost)', !scored.includes(4), JSON.stringify(scored))

  const endpoint = cut("app.get('/api/bias-performance'", '// 🧭 MACRO COMPASS')
  check('the endpoint calls the same scoreBiasHistory function', /const results = await scoreBiasHistory\(days\)/.test(endpoint) && !/scoreBias\(row\)/.test(endpoint))
  check('the schedule runs it every 6h plus a boot run', /setTimeout\(\(\) => \{ runScheduledScoring\(\) \}/.test(src) && /setInterval\(\(\) => \{ runScheduledScoring\(\) \}, 6 \* 60 \* 60 \* 1000\)/.test(src))
  check('scoreBiasHistory returns the rows with performance attached', (await scoreBiasHistory(7)).length === 4)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
