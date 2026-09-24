// Test vectors for the social triggers under the current content plan.
//   node backend/scripts/socialTriggers.test.mjs
//
// The trigger block is read out of index.js as source and run against fakes, so the code under
// test is the shipped code. `Date` is injected, which pins "now" to any weekday and UTC time without
// touching the source. createDraftAndNotify is faked — this file is about WHEN a draft is created
// and with what facts, not about generation.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pickEduTopic, EDU_REPEAT_DAYS, EDU_TOPICS } from '../social/eduTopics.js'

const src = readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8')
const cutOut = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to)
  if (a === -1 || b === -1 || b <= a) throw new Error(`index.js extraction failed at "${from}" — did the section move?`)
  return src.slice(a, b)
}
const rawBlock = cutOut('// ⏰ SOCIAL TRIGGERS', '// 🚀 SOCIAL PUBLISHER')
for (const n of ['enqueueBiasCardDraft', 'runSocialPlanner', 'enqueueNewsReactions', 'nextEventPreview', 'eventsAllPast', 'draftEducation', 'runIgLanes']) {
  if (!rawBlock.includes(n)) throw new Error(`extraction sanity check failed: ${n} not found`)
}
// The renderer loader is the one line of the block this file replaces: left as shipped it would
// import the real satori/resvg renderer and draw a PNG on every planner run. Everything else runs
// as written.
const LOADER = "const loadRenderer = () => import('./social/renderer.js')"
if (!rawBlock.includes(LOADER)) throw new Error('extraction sanity check failed: the renderer loader moved')
const block = rawBlock.replace(LOADER, '')

let pass = 0, fail = 0
const REAL = { log: console.log, error: console.error, warn: console.warn }
function check(name, ok, detail = '') {
  ok ? pass++ : fail++
  REAL.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`)
}

// ── Fakes ─────────────────────────────────────────────────────────────────────
let NOW = new Date('2026-09-22T09:00:00.000Z')      // a Tuesday
let queue = [], history = [], snap = {}, drafts = [], dms = [], logs = [], calendar = [], nextQueueId = 1
// Instagram: the decks the lanes asked for, the feed cap, and the scored news the daily brief reads.
let carousels = [], igFeedCap = 1, scoredNews = []
let draftImpl = null

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
    select() { return b }, update(p) { st.op = 'update'; st.payload = p; return b },
    eq(k, v) { st.filters.push(r => r[k] === v); return b }, in(k, vs) { st.filters.push(r => vs.includes(r[k])); return b },
    gte(k, v) { st.filters.push(r => r[k] >= v); return b },
    order(col, o) { st.orders.push({ col, asc: o?.ascending !== false }); return b }, limit(n) { st.limitN = n; return b },
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then(res, rej) { return Promise.resolve(run()).then(res, rej) },
  }
  return b
}

// Fake createDraftAndNotify: inserts a row, like the real one, so later checks see it.
const createDraftAndNotify = async args => {
  drafts.push(args)
  if (draftImpl) { const r = await draftImpl(args); if (!r) return null }
  const row = { id: nextQueueId++, platform: args.platform || 'x', content_type: args.contentType, status: 'draft', created_at: new Date(NOW).toISOString(), source_ref: { ...(args.sourceRef || {}), facts: args.facts } }
  queue.push(row)
  dms.push({ text: `draft ${row.id}` })
  return row
}

function build() {
  const supabase = { from: table }
  console.log = (...a) => logs.push(a.join(' '))
  console.error = (...a) => logs.push(a.join(' '))
  console.warn = (...a) => logs.push(a.join(' '))
  return new Function(
    'supabase', 'createDraftAndNotify', 'v2LoadSnapshot', 'v2SaveSnapshot', 'sendTG', 'v2AdminChat', 'esc',
    'getEconomicCalendar', 'SOCIAL_PILLARS', 'utcDay', 'app', 'requireUser', 'isAdmin', 'Date',
    'matchMoverSrv', 'pickEduTopic', 'EDU_REPEAT_DAYS',
    // The Instagram lanes live in this same block. Their own helpers come with it; what they reach
    // for outside it — the caps, the renderer, storage, the writer, the DM plumbing — is faked here.
    // igLanes below decides whether this run does any Instagram work at all.
    'igDailyCap', 'igStoryDailyCap', 'loadRenderer', 'socialUploadPng', 'socialPastTexts', 'generateCarousel',
    'anthropic', 'trackAI', 'sendTGPhoto', 'socialDraftMessage', 'socialKeyboard', 'tgCall', 'getCached', 'firstSentence', 'newsCardData',
    `${block}\nreturn { enqueueBiasCardDraft, runSocialPlanner, enqueueNewsReactions, nextEventPreview, eventsAllPast, isSameStory, NEWS_DAILY_MAX, calledItCandidate, planIgCarousel }`,
  )(supabase, createDraftAndNotify, async k => snap[k] ?? null, (k, v) => { snap[k] = v }, async (c, t) => { dms.push({ text: t }) }, () => '111', s => String(s ?? ''),
    async () => calendar, { macro_insight: 'education', trader_pain: 'trader_psychology', contrarian: 'trader_psychology' },
    () => new FakeDate().toISOString().slice(0, 10), { get: () => {} }, async () => null, () => false, FakeDate,
    text => (/tariff/i.test(text) ? { assets: ['USD', 'Gold'] } : null), pickEduTopic, EDU_REPEAT_DAYS,
    () => igFeedCap, () => 3,
    async () => ({ renderCard: async () => Buffer.from('png'), renderCarousel: async slides => slides.map(() => Buffer.from('png')) }),
    async () => ({ path: 'cards/ig/x.png', url: 'https://x.supabase.co/x.png' }),
    async () => [], async args => { carousels.push(args); return { failed: false, slides: [{ kind: 'cover', title: 'x' }, { kind: 'cta', line: 'y' }], caption: 'c', flags: [], factcheck: { status: 'grounded', issue: null } } },
    {}, () => {}, async () => 1, () => 'dm', id => ({ inline_keyboard: [[{ text: 'ok', callback_data: `sq:ap:${id}` }]] }), async () => null,
    () => scoredNews, s => String(s || '').split('.')[0],
    // The real one lives in the drafts section; the news lane falls back to it when a card was
    // not rendered, which is always the case here because createDraftAndNotify is faked.
    (facts = {}, postText = '') => ({ summary: facts.oneliner || postText, assets: facts.instruments || [], impactScore: facts.impactScore, time: facts.publishedAt || null, date: new Date(NOW).toISOString() }))
}
const restore = () => { console.log = REAL.log; console.error = REAL.error; console.warn = REAL.warn }
const run = async fn => { const m = build(); try { return await fn(m) } finally { restore() } }

const iso = d => new Date(d).toISOString()
const at = (dateStr, time) => { NOW = new Date(`${dateStr}T${time}:00.000Z`) }
const minsFromNow = m => iso(NOW.getTime() + m * 60000)
function reset() { queue = []; history = []; snap = {}; drafts = []; dms = []; logs = []; calendar = []; nextQueueId = 1; draftImpl = null; carousels = []; igFeedCap = 1; scoredNews = [] }
const qrow = over => { const r = { id: nextQueueId++, platform: 'x', content_type: 'bias_card', status: 'draft', created_at: iso(NOW), source_ref: {}, ...over }; queue.push(r); return r }
const hist = over => history.push({ id: history.length + 1, engine: 'v2', pair: 'EURUSD', direction: 'Bearish', generated_at: iso(NOW), performance: null, reasoning: 'Rate gap.', ...over })
const news = (over = {}) => ({ source: 'Wire', title: 'Fed holds rates and signals no cuts before December', summary: '', url: 'https://example.com/a', publishedAt: minsFromNow(-(over.minutesAgo ?? 1)), impact: 9, marketTags: ['USD↑', 'Gold↓'], oneliner: '', ...over })
const cal = (country, minutes, title = 'CPI y/y', impact = 'High') => ({ event: title, country, time: minsFromNow(minutes), impact, forecast: '3.1%', previous: '3.0%' })
const drafted = type => drafts.filter(d => d.contentType === type)
const plannerLine = () => logs.filter(l => l.startsWith('[social planner]')).pop() || ''

// ── 1. News: immediate, capped at 3, no duplicates ────────────────────────────
{
  reset(); at('2026-09-22', '09:00')
  await run(m => m.enqueueNewsReactions([news({ minutesAgo: 1, impact: 9 })]))
  check('9/10 story published 1 min ago → drafted immediately (no delay)', drafted('news_reaction').length === 1, JSON.stringify(drafts.map(d => d.contentType)))
  check('news draft: pillar macro_news, trigger news, headline in facts', drafts[0]?.pillar === 'macro_news' && drafts[0]?.sourceRef?.trigger === 'news' && drafts[0]?.facts?.headline.startsWith('Fed holds'), JSON.stringify(drafts[0]))
  check('DM sent right away', dms.length === 1)
  check('the decision is logged', logs.some(l => /\[social news\] drafted #\d+ from "Fed holds/.test(l)), logs.join(' | '))

  // Two more distinct stories, then a fourth.
  await run(m => m.enqueueNewsReactions([
    news({ title: 'Oil jumps as supply talks collapse in Vienna', marketTags: ['CAD↑', 'Oil↑'] }),
    news({ title: 'Eurozone manufacturing contracts for a sixth month', marketTags: ['EUR↓'] }),
  ]))
  check('three distinct stories → three drafts', drafted('news_reaction').length === 3, `${drafted('news_reaction').length}`)
  await run(m => m.enqueueNewsReactions([news({ title: 'Japan finance ministry warns on rapid yen moves', marketTags: ['JPY↑'] })]))
  check('4th qualifying story the same day → skipped', drafted('news_reaction').length === 3 && logs.some(l => /daily cap 3\/3/.test(l)), logs.filter(l => /social news/.test(l)).join(' | '))

  // Skipped drafts still count toward the cap.
  reset(); at('2026-09-22', '09:00')
  for (let i = 0; i < 3; i++) qrow({ content_type: 'news_reaction', status: 'skipped', source_ref: { facts: { headline: `old story number ${i} about something else`, marketTags: [] } } })
  await run(m => m.enqueueNewsReactions([news()]))
  check('skipped news drafts still use up the day\'s 3', drafted('news_reaction').length === 0, `${drafted('news_reaction').length}`)

  // Near-duplicates: already drafted today, and within one batch.
  reset(); at('2026-09-22', '09:00')
  qrow({ content_type: 'news_reaction', source_ref: { facts: { headline: 'Fed holds rates and signals no cuts before December', marketTags: ['USD↑', 'Gold↓'] } } })
  await run(m => m.enqueueNewsReactions([news({ title: 'Fed holds rates, signals no rate cuts before December' })]))
  check('near-duplicate of a story already drafted today → skipped', drafted('news_reaction').length === 0 && logs.some(l => /same story as "Fed holds/.test(l)), logs.join(' | '))

  reset(); at('2026-09-22', '09:00')
  await run(m => m.enqueueNewsReactions([
    news({ title: 'Fed keeps rates on hold, no cuts seen before December', impact: 9 }),
    news({ title: 'Fed leaves rates on hold and says no cut likely before December', impact: 8, marketTags: ['USD↑', 'Gold↓'] }),
  ]))
  check('same story reworded by another outlet → only one draft', drafted('news_reaction').length === 1, JSON.stringify(drafts.map(d => d.facts.headline)))

  // The opposite failure matters as much: different USD stories with the same tags must both go.
  reset(); at('2026-09-22', '09:00')
  await run(m => m.enqueueNewsReactions([
    news({ title: 'Fed holds rates and signals no cuts before December', marketTags: ['USD↑'] }),
    news({ title: 'US payrolls beat forecasts as wage growth accelerates', marketTags: ['USD↑'] }),
  ]))
  check('different stories sharing tags are NOT merged', drafted('news_reaction').length === 2, JSON.stringify(drafts.map(d => d.facts.headline)))

  reset(); at('2026-09-22', '09:00')
  await run(m => m.enqueueNewsReactions([news({ title: 'Fed holds rates and signals no cuts before December' }), news({ title: 'Oil jumps as supply talks collapse in Vienna', marketTags: ['Oil↑'] })]))
  check('two different stories in one batch → two drafts', drafted('news_reaction').length === 2)

  // Blocked generation: logged, and the same story is not retried in the batch.
  reset(); at('2026-09-22', '09:00'); draftImpl = () => null
  await run(m => m.enqueueNewsReactions([news()]))
  check('blocked news draft is logged', logs.some(l => /blocked by the guardrails/.test(l)), logs.join(' | '))

  // isSameStory directly.
  const m = build(); restore()
  check('isSameStory: unrelated stories differ', !m.isSameStory({ headline: 'Fed holds rates', tags: ['USD↑'] }, { title: 'Oil jumps on supply fears', marketTags: ['Oil↑'] }))
}

// ── 2. Events: USD high-impact only, 45 min – 6 h ahead, grouped, max 2/day ────
{
  const plan = async () => { await run(m => m.runSocialPlanner()) }
  reset(); at('2026-09-22', '09:00'); calendar = [cal('EUR', 120)]
  await plan()
  check('EUR high-impact event → no preview', drafted('event_preview').length === 0 && /event:none-ahead\(USD\)/.test(plannerLine()), plannerLine())

  reset(); at('2026-09-22', '09:00'); calendar = [cal('USD', -180)]
  await plan()
  check('USD event 3 h ago → no preview', drafted('event_preview').length === 0, plannerLine())

  reset(); at('2026-09-22', '09:00'); calendar = [cal('USD', 30)]
  await plan()
  check('USD event 30 min away → no preview (too close)', drafted('event_preview').length === 0, plannerLine())

  reset(); at('2026-09-22', '09:00'); calendar = [cal('USD', 120, 'CPI y/y', 'Medium')]
  await plan()
  check('USD medium-impact → no preview', drafted('event_preview').length === 0)

  reset(); at('2026-09-22', '09:00'); calendar = [cal('USD', 420)]
  await plan()
  check('USD event 7 h away → not yet', drafted('event_preview').length === 0 && /event:next-in-7h/.test(plannerLine()), plannerLine())

  reset(); at('2026-09-22', '09:00'); calendar = [cal('USD', 120)]
  await plan()
  const ev = drafted('event_preview')[0]
  check('USD event 2 h away → preview', !!ev && ev.pillar === 'calendar' && ev.facts.events.length === 1, JSON.stringify(ev))
  check('preview facts keep the absolute time (at) for the past-event check', ev?.facts.events[0].at === minsFromNow(120) && ev.facts.events[0].time === minsFromNow(120).slice(11, 16), JSON.stringify(ev?.facts.events[0]))

  reset(); at('2026-09-22', '09:00'); calendar = [cal('USD', 120, 'CPI y/y'), cal('USD', 180, 'Core CPI m/m'), cal('USD', 240, 'Fed Chair speaks')]
  await plan()
  const g = drafted('event_preview')[0]
  check('two USD events 1 h apart (and a third within 2 h) → one grouped preview', drafted('event_preview').length === 1 && g.facts.events.map(e => e.title).join(',') === 'CPI y/y,Core CPI m/m,Fed Chair speaks', JSON.stringify(g?.facts.events.map(e => e.title)))
  await plan()
  check('next run: the grouped events are not previewed again', drafted('event_preview').length === 1, plannerLine())

  // Cap: two previews already today → a third qualifying event gets none.
  reset(); at('2026-09-22', '09:00'); calendar = [cal('USD', 60, 'A')]
  await plan()
  at('2026-09-22', '12:00'); calendar = [cal('USD', 90, 'B')]
  await plan()
  at('2026-09-22', '15:00'); calendar = [cal('USD', 90, 'C')]
  await plan()
  check('third preview in a day → none (max 2)', drafted('event_preview').length === 2 && /event:cap\(2\/2\)/.test(plannerLine()), `${drafted('event_preview').length} ${plannerLine()}`)

  reset(); at('2026-09-26', '09:00'); calendar = [cal('USD', 120)]
  await plan()
  check('Saturday → no event preview', drafted('event_preview').length === 0 && /event:weekend/.test(plannerLine()), plannerLine())
}

// ── 3. eventsAllPast (the approve/publish safety net) ─────────────────────────
{
  reset(); at('2026-09-22', '15:00')
  const m = build(); restore()
  const row = evs => ({ created_at: '2026-09-22T08:00:00.000Z', source_ref: { facts: { events: evs } } })
  check('all events past → true', m.eventsAllPast(row([{ at: '2026-09-22T12:30:00.000Z' }, { at: '2026-09-22T14:00:00.000Z' }])) === true)
  check('one still ahead → false', m.eventsAllPast(row([{ at: '2026-09-22T12:30:00.000Z' }, { at: '2026-09-22T16:00:00.000Z' }])) === false)
  check('old rows with HH:MM only use the row\'s date', m.eventsAllPast(row([{ time: '12:30' }])) === true && m.eventsAllPast(row([{ time: '18:00' }])) === false)
  check('unreadable time → false (never skip on doubt)', m.eventsAllPast(row([{ time: 'All Day' }])) === false)
  check('no events → false', m.eventsAllPast({ source_ref: { facts: {} } }) === false)
}

// ── 4. Bias card ──────────────────────────────────────────────────────────────
{
  const bias = over => ({ engine: 'v2', pair: 'EURUSD', direction: 'Bearish', confidence: 72, tradeGrade: 'B', reasoning: 'Rate gap.', bias: { levels: { invalidation: '1.0850' } }, ...over })
  reset(); at('2026-09-22', '09:00')
  await run(m => m.enqueueBiasCardDraft(bias({ tradeGrade: 'C' })))
  check('grade C → no bias card', drafts.length === 0)

  reset(); at('2026-09-22', '09:00')
  const newsRow = qrow({ content_type: 'news_reaction', status: 'draft' })
  const evRow = qrow({ content_type: 'event_preview', status: 'approved' })
  await run(m => m.enqueueBiasCardDraft(bias(), 261))
  check('bias card drafted', drafted('bias_card').length === 1 && drafts[0].facts.pair === 'EURUSD' && !JSON.stringify(drafts[0].facts).includes('1.0850'), JSON.stringify(drafts[0]))
  check('bias card no longer skips today\'s news or event drafts', newsRow.status === 'draft' && evRow.status === 'approved', `${newsRow.status}/${evRow.status}`)
  check('bias card is X only (no platform override → no LinkedIn draft from the trigger)', !drafts.some(d => d.platform === 'linkedin'))

  await run(m => m.enqueueBiasCardDraft(bias(), 262))
  check('second bias card the same day → skipped', drafted('bias_card').length === 1)
}

// ── 5. Rotation: X only, 1/day, only on a quiet day ───────────────────────────
{
  reset(); at('2026-09-22', '07:00')
  await run(m => m.runSocialPlanner())
  check('quiet day at the fallback time → rotation pillar drafted', drafted('macro_insight').length === 1 && drafts.find(d => d.contentType === 'macro_insight').platform === undefined, plannerLine())
  await run(m => m.runSocialPlanner())
  check('rotation max 1/day', drafted('macro_insight').length + drafted('trader_pain').length === 1, plannerLine())
  check('rotation index advanced', snap.social_rotation === 1)

  reset(); at('2026-09-22', '07:00'); qrow({ content_type: 'bias_card' }); qrow({ content_type: 'news_reaction' })
  await run(m => m.runSocialPlanner())
  check('2 other X drafts by the fallback time → rotation skipped', !drafts.some(d => ['macro_insight', 'trader_pain', 'contrarian'].includes(d.contentType)) && /rotation:skipped\(2 drafts\)/.test(plannerLine()), plannerLine())

  reset(); at('2026-09-22', '07:00'); qrow({ content_type: 'bias_card' })
  await run(m => m.runSocialPlanner())
  check('1 other X draft → rotation still drafted', drafted('macro_insight').length === 1, plannerLine())

  reset(); at('2026-09-22', '05:00')
  await run(m => m.runSocialPlanner())
  check('before the fallback time → no rotation', !drafts.some(d => d.contentType === 'macro_insight') && /rotation:not-yet/.test(plannerLine()), plannerLine())

  reset(); at('2026-09-22', '07:00'); draftImpl = a => a.contentType === 'macro_insight' ? null : true
  await run(m => m.runSocialPlanner())
  check('blocked rotation draft → index not advanced', (snap.social_rotation ?? 0) === 0)
}

// ── 6. LinkedIn education, Saturday results ───────────────────────────────────
{
  reset(); at('2026-09-22', '07:00')
  await run(m => m.runSocialPlanner())
  const edu = drafts.find(d => d.contentType === 'education')
  check('weekday at the fallback time → one LinkedIn education draft', !!edu && edu.platform === 'linkedin' && edu.pillar === 'education' && !!edu.facts.topic && !!edu.facts.angle, JSON.stringify(edu))
  check('planner log names the topic', new RegExp(`li:li-edu:drafted\\(topic: ${edu?.facts.topic.replace(/[()]/g, '.')}\\)`).test(plannerLine()), plannerLine())
  await run(m => m.runSocialPlanner())
  check('education drafted once per day', drafts.filter(d => d.contentType === 'education').length === 1)

  reset(); at('2026-09-27', '07:00')        // Sunday
  await run(m => m.runSocialPlanner())
  check('Sunday → education drafted (and no X rotation)', drafts.some(d => d.contentType === 'education') && !drafts.some(d => d.contentType === 'macro_insight'), plannerLine())

  // 45-day no-repeat, by running the planner day after day.
  reset()
  const seen = new Map()
  let repeatWithin45 = null
  for (let d = 0; d < 90; d++) {
    const day = new Date(Date.UTC(2026, 8, 20) + d * 86400000)
    if (day.getUTCDay() === 6) continue
    at(day.toISOString().slice(0, 10), '07:00')
    queue = []
    const before = drafts.length
    await run(m => m.runSocialPlanner())
    const e = drafts.slice(before).find(x => x.contentType === 'education')
    if (!e) continue
    const prev = seen.get(e.facts.topicId)
    if (prev && (day - prev) / 86400000 < EDU_REPEAT_DAYS) repeatWithin45 = `${e.facts.topicId} after ${(day - prev) / 86400000}d`
    seen.set(e.facts.topicId, day)
  }
  check(`no topic repeats within ${EDU_REPEAT_DAYS} days over 90 days of planner runs`, repeatWithin45 === null && seen.size >= 38, `${repeatWithin45} topics=${seen.size}`)

  // Blocked education draft: topic not burned.
  reset(); at('2026-09-22', '07:00'); draftImpl = a => a.contentType === 'education' ? null : true
  await run(m => m.runSocialPlanner())
  check('blocked education draft → rotation history unchanged', !(snap.li_edu_rotation?.history?.length), JSON.stringify(snap.li_edu_rotation))

  // Saturday.
  const fin = correct => ({ status: 'final', correct })
  reset(); at('2026-09-26', '07:00')
  hist({ performance: fin(true) }); hist({ performance: fin(false) }); hist({ performance: { status: 'live' } })
  await run(m => m.runSocialPlanner())
  const sat2 = drafts.filter(d => d.platform === 'linkedin')
  check('Saturday with 2 resolved calls → LinkedIn education instead, reason logged', sat2.length === 1 && sat2[0].contentType === 'education' && logs.some(l => /LinkedIn Saturday results skipped — only 2 resolved/.test(l)) && /saturday results skipped/.test(sat2[0].sourceRef.reason), JSON.stringify(sat2))

  reset(); at('2026-09-26', '07:00')
  hist({ performance: fin(true) }); hist({ performance: fin(false) }); hist({ pair: 'GBPUSD', performance: fin(true) }); hist({ pair: 'AUDUSD', performance: fin(false) })
  await run(m => m.runSocialPlanner())
  const sat4 = drafts.filter(d => d.platform === 'linkedin')
  check('Saturday with 4 resolved calls → LinkedIn weekly_scorecard', sat4.length === 1 && sat4[0].contentType === 'weekly_scorecard' && sat4[0].pillar === 'accountability', JSON.stringify(sat4.map(d => d.contentType)))
  check('LinkedIn scorecard facts: rows + range, no aggregate', Object.keys(sat4[0].facts).sort().join(',') === 'rangeLabel,rows' && !/win|%|total/i.test(JSON.stringify(sat4[0].facts.rows)), JSON.stringify(sat4[0].facts))
  check('X weekly scorecard still drafted on Saturday alongside', drafts.some(d => d.contentType === 'weekly_scorecard' && !d.platform), JSON.stringify(drafts.map(d => `${d.platform || 'x'}:${d.contentType}`)))
}

// ── 7. The planner's one-line summary ─────────────────────────────────────────
{
  reset(); at('2026-09-22', '07:00')
  qrow({ content_type: 'bias_card' }); qrow({ content_type: 'news_reaction' })
  calendar = [cal('EUR', 120)]
  await run(m => m.runSocialPlanner())
  const line = plannerLine()
  check('one summary line per run with every lane', /^\[social planner\] bias:done news:1\/3 event:none-ahead\(USD\) rotation:skipped\(2 drafts\) li:li-edu:drafted\(topic: [^)]+\) ig:\S+ ig-story:.+$/.test(line), line)
  check('the summary names both Instagram lanes', / ig:/.test(line) && / ig-story:/.test(line), line)
  check('neither Instagram lane errored', !/ig:error/.test(line) && !/ig-story:error/.test(line), line)
  check('exactly one summary line', logs.filter(l => l.startsWith('[social planner]')).length === 1)
}

// ── 8. Which carousel Instagram gets today ────────────────────────────────────
// One carousel a day. called_it wins when it qualifies, a USD event ahead takes the slot next, and
// the weekday plan decides the rest — with macro_101 standing in whenever the day's own type has
// nothing real to say.
{
  const pick = async () => run(m => m.planIgCarousel(new FakeDate(), NOW.getTime()))
  const goodBias = () => hist({ trade_grade: 'A-', reasoning: 'The rate gap keeps widening. Specs are long euro.' })

  // Monday, a qualifying bias, nothing on the calendar.
  reset(); at('2026-09-21', '07:00'); goodBias()
  let plan = await pick()
  check('Monday with a qualifying bias → daily_brief', plan.type === 'daily_brief' && plan.facts.bias.pair === 'EURUSD', JSON.stringify(plan.type))
  check('daily_brief facts carry the bias, the calendar and the news lane', 'bias' in plan.facts && 'events' in plan.facts && 'news' in plan.facts, Object.keys(plan.facts).join(','))

  // Monday, but the day's bias is graded below B.
  reset(); at('2026-09-21', '07:00'); hist({ trade_grade: 'D' })
  plan = await pick()
  check('Monday without a qualifying bias → macro_101, with the reason', plan.type === 'macro_101' && /no qualifying bias/.test(plan.reason || ''), JSON.stringify(plan))

  // Tuesday teaches, whatever the bias looks like.
  reset(); at('2026-09-22', '07:00'); goodBias()
  plan = await pick()
  check('Tuesday → macro_101 even with a good bias', plan.type === 'macro_101', JSON.stringify(plan.type))

  // Saturday needs three resolved calls.
  reset(); at('2026-09-26', '07:00')
  for (const o of ['hit', 'miss', 'hit']) hist({ performance: { status: 'final', correct: o === 'hit' }, generated_at: iso(NOW.getTime() - 2 * 86400000) })
  plan = await pick()
  check('Saturday with 3 resolved calls → scorecard', plan.type === 'scorecard' && plan.facts.rows.length === 3, JSON.stringify(plan.type))

  reset(); at('2026-09-26', '07:00')
  hist({ performance: { status: 'final', correct: true }, generated_at: iso(NOW.getTime() - 2 * 86400000) })
  plan = await pick()
  check('Saturday with only 1 resolved call → macro_101, with the reason', plan.type === 'macro_101' && /only 1 resolved/.test(plan.reason || ''), JSON.stringify(plan))

  // A high-impact USD event ahead takes the slot on any day.
  reset(); at('2026-09-21', '07:00'); goodBias()
  calendar = [cal('USD', 120)]
  plan = await pick()
  check('a high-impact USD event ahead takes the day\'s slot', plan.type === 'event_explainer' && plan.facts.event.currency === 'USD', JSON.stringify(plan.type))
  check('the explainer carries that event\'s own time and numbers', plan.facts.event.title === 'CPI y/y' && plan.facts.event.forecast === '3.1%', JSON.stringify(plan.facts.event))

  // A non-USD event does not.
  reset(); at('2026-09-21', '07:00'); goodBias()
  calendar = [cal('EUR', 120)]
  plan = await pick()
  check('a EUR event does not take the slot', plan.type === 'daily_brief', JSON.stringify(plan.type))

  // called_it overrides everything when a resolved hit had a post before it.
  reset(); at('2026-09-21', '07:00'); goodBias()
  calendar = [cal('USD', 120)]
  hist({ id: 99, performance: { status: 'final', correct: true }, generated_at: iso(NOW.getTime() - 2 * 86400000) })
  qrow({
    id: 90, content_type: 'news_reaction', status: 'published',
    published_at: iso(NOW.getTime() - 2 * 86400000 - 3600000),
    source_ref: { facts: { marketTags: ['EUR', 'USD'] } },
  })
  plan = await pick()
  check('called_it overrides the day\'s slot when it qualifies', plan.type === 'called_it' && plan.facts.call.outcome === 'hit', JSON.stringify(plan.type))
  check('the called_it plan is marked as such in source_ref', plan.sourceRef?.calledIt === true, JSON.stringify(plan.sourceRef))

  // …but not twice in a week.
  snap.ig_called_it_week = { at: iso(NOW.getTime() - 3 * 86400000) }
  plan = await pick()
  check('called_it does not override again within the week', plan.type === 'event_explainer', JSON.stringify(plan.type))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
