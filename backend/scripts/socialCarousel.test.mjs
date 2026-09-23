// Test vectors for the Instagram content system.
//   node backend/scripts/socialCarousel.test.mjs
//
// What matters here, in order:
//   1. macro_101 cannot smuggle a specific number, year or date onto a slide or into the caption.
//   2. called_it is built from a verified outcome or not at all — never from a miss, never from an
//      unresolved call, and never twice in a week.
//   3. the story lane has its own cap, which neither limits nor is limited by the feed.
//   4. a deck can never exceed Instagram's 10 slides.
//   5. Instagram's topic rotation does not repeat a topic within 60 days, and is separate from
//      LinkedIn's.
//
// index.js cannot be imported (it boots the server against the LIVE database), so the pieces under
// test are read out of it as source and run against fakes, the way the other social tests do it.
// The extraction is asserted below, so this file cannot silently end up testing nothing.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { generateCarousel, checkCarousel, captionFlags, slideText, CAROUSEL_MAX_SLIDES } from '../social/generator.js'
import { pickEduTopic, EDU_TOPICS, EDU_REPEAT_DAYS } from '../social/eduTopics.js'
import { renderCarousel, MAX_CAROUSEL_SLIDES } from '../social/renderer.js'

const src = readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8')
const cut = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a + 1)
  if (a === -1 || b === -1 || b <= a) throw new Error(`index.js extraction failed at "${from}" — did the section move?`)
  return src.slice(a, b)
}
const igConstSrc = cut('const IG_EDU_ROTATION_KEY', 'const loadRenderer')
const storySrc = cut('// One story: render the card', '// ── Facts for each carousel type')
const rotationSrc = cut("// Instagram's own topic rotation", '// ── called_it')
const calledItSrc = cut('// ── called_it ─', '// ── Planner ─')
const outcomeSrc = cut('function scorecardOutcome', 'async function socialScorecardRows')
for (const [name, text] of [['createStoryDraft', storySrc], ['calledItCandidate', calledItSrc], ['draftMacro101', rotationSrc], ['IG_STORY_TYPES', igConstSrc]]) {
  if (!text.includes(name)) throw new Error(`extraction sanity check failed: ${name} not found`)
}

const REAL = { log: console.log, warn: console.warn, error: console.error }
let pass = 0, fail = 0
function check(name, ok, detail = '') {
  ok ? pass++ : fail++
  REAL.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`)
}
const quiet = () => { console.log = () => {}; console.warn = () => {}; console.error = () => {} }
const loud = () => { console.log = REAL.log; console.warn = REAL.warn; console.error = REAL.error }
const hardCodes = flags => flags.filter(f => f.level === 'hard').map(f => f.code)

// ── A valid deck and caption, to vary from ────────────────────────────────────
const CAPTION = `Gold does not pay you a thing, and that is exactly why it watches real yields.

When the return on a bond after inflation rises, the cost of holding something that pays nothing rises with it. That is the mechanism, and it runs in both directions.

Nothing here is a trade call. It is the context the daily read is built on.

#forex #trading #macro #gold #propfirm`

const DECK = [
  { kind: 'cover', kicker: 'Macro 101', title: 'Why do real yields move gold?' },
  { kind: 'concept', label: 'The idea', title: 'Gold pays you nothing', paragraphs: ['Gold has no coupon. Holding it costs whatever you could have earned elsewhere.'] },
  { kind: 'concept', label: 'The mechanism', title: 'Nominal is not the number that matters', paragraphs: ['A real yield is the nominal yield minus the inflation the market expects.'] },
  { kind: 'points', label: 'How traders use it', title: 'Three ways this shows up', points: ['Read the real yield direction first.', 'Treat a move that fights it as one with another driver.', 'Use it as context, never as a trigger.'] },
  { kind: 'callout', label: 'Common mistake', text: 'Reading a rate rise as bearish for gold without checking what inflation expectations did at the same time.' },
  { kind: 'cta', line: 'Macro, explained for funded traders.' },
]
const deckWith = (i, patch) => DECK.map((s, n) => (n === i ? { ...s, ...patch } : s))

// A fake Anthropic that returns whatever deck the test hands it, and passes every Haiku check.
function fakeAnthropic(deck, caption = CAPTION, { haiku = null, calls = [] } = {}) {
  return { messages: { create: async p => {
    calls.push(p)
    if (p.model.includes('haiku')) {
      const n = (p.messages[0].content.match(/^\[\d+\]/gm) || []).length
      const checks = haiku ? haiku(n) : Array.from({ length: n }, (_, i) => ({ i, grounded: true, issue: null }))
      return { content: [{ type: 'text', text: JSON.stringify({ checks }) }], usage: {} }
    }
    return { content: [{ type: 'text', text: JSON.stringify({ caption, slides: deck }) }], usage: {} }
  } } }
}

// ── 1. macro_101 claim check ──────────────────────────────────────────────────
{
  const BAD = 'In 2022 the Fed hiked 425bp and real yields tore higher, so gold fell all year.'
  const calls = []
  quiet()
  const r = await generateCarousel({
    carouselType: 'macro_101',
    facts: { topic: 'Real yields', angle: 'Why real yields, not nominal ones, drive gold.' },
    anthropic: fakeAnthropic(deckWith(2, { paragraphs: [BAD] }), CAPTION, { calls }),
  })
  loud()
  const claim = r.flags.filter(f => f.code === 'claim_check')
  check('macro_101: "in 2022 the Fed hiked 425bp" on a slide → hard claim_check flag',
    claim.some(f => f.level === 'hard' && /year/.test(f.msg)) && claim.some(f => /425bp/.test(f.msg)), JSON.stringify(claim))
  check('macro_101: the flag names the slide it came from', claim.some(f => /^slide 3 —/.test(f.msg)), JSON.stringify(claim.map(f => f.msg)))
  check('macro_101: a deck with an invented specific is failed, not returned as usable', r.failed === true, JSON.stringify(r.flags))
  check('macro_101: the checker used the accuracy prompt, not the FACTS grounding prompt',
    calls.some(c => c.model.includes('haiku') && /review educational posts/.test(c.system)), calls.find(c => c.model.includes('haiku'))?.system)

  // Same rule in the caption.
  quiet()
  const r2 = await generateCarousel({
    carouselType: 'macro_101',
    facts: { topic: 'Real yields', angle: 'x' },
    anthropic: fakeAnthropic(DECK, `${CAPTION.replace('#forex', 'Back in 2019 this was obvious.\n\n#forex')}`),
  })
  loud()
  check('macro_101: a specific year in the caption is caught too', r2.flags.some(f => f.code === 'claim_check' && /^caption —/.test(f.msg)), JSON.stringify(r2.flags.map(f => f.msg)))

  // The clean deck passes.
  quiet()
  const r3 = await generateCarousel({ carouselType: 'macro_101', facts: { topic: 'Real yields', angle: 'x' }, anthropic: fakeAnthropic(DECK) })
  loud()
  check('macro_101: a clean mechanism deck passes', !r3.failed && r3.slides.length === 6 && r3.caption === CAPTION, JSON.stringify(r3.flags))
  check('macro_101: slides come back in order, cover first and cta last',
    r3.slides[0].kind === 'cover' && r3.slides[5].kind === 'cta', r3.slides.map(s => s.kind).join(','))
}

// ── 2. Deck and caption shape ─────────────────────────────────────────────────
{
  const facts = { topic: 'Real yields' }
  const flags = n => checkCarousel({ carouselType: 'macro_101', slides: n.slides || DECK, caption: n.caption || CAPTION, facts })

  check('a deck over 10 slides is refused', hardCodes(checkCarousel({
    carouselType: 'macro_101', caption: CAPTION, facts,
    slides: [DECK[0], ...Array.from({ length: 12 }, () => DECK[1]), DECK[5]],
  })).includes('deck_shape'))
  check('the refusal says it is Instagram\'s limit', checkCarousel({
    carouselType: 'macro_101', caption: CAPTION, facts,
    slides: [DECK[0], ...Array.from({ length: 12 }, () => DECK[1]), DECK[5]],
  }).some(f => new RegExp(`at most ${CAROUSEL_MAX_SLIDES}`).test(f.msg)))
  check('a deck that does not start with a cover is refused', flags({ slides: DECK.slice(1) }).some(f => /must be a cover/.test(f.msg)))
  check('a deck that does not end with a cta is refused', flags({ slides: DECK.slice(0, 5) }).some(f => /must be a cta/.test(f.msg)))
  check('a concept slide with no paragraphs is refused', flags({ slides: deckWith(1, { paragraphs: [] }) }).some(f => /at least one paragraph/.test(f.msg)))
  check('text longer than its layout holds is refused', flags({ slides: deckWith(4, { text: 'x'.repeat(260) }) }).some(f => /the layout holds/.test(f.msg)))
  check('a clean deck has no hard flags', !flags({}).some(f => f.level === 'hard'), JSON.stringify(flags({})))

  // Caption rules.
  const cap = c => captionFlags(c).map(f => f.code)
  check('a caption under 300 chars is refused', cap('Too short.\n\n#a #b #c #d #e').includes('caption_length'))
  check('a caption over 900 chars is refused', cap(`${'word '.repeat(200)}\n#a #b #c #d #e`).includes('caption_length'))
  check('4 hashtags is refused, 5 is fine', cap(CAPTION.replace(' #propfirm', '')).includes('caption_hashtags') && !cap(CAPTION).includes('caption_hashtags'))
  check('9 hashtags is refused', cap(CAPTION.replace('#propfirm', '#propfirm #a #b #c #d')).includes('caption_hashtags'))
  check('a hashtag off the last line is refused', cap(CAPTION.replace('Gold does not', '#gold Gold does not')).includes('caption_hashtags'))
  check('"save this" twice is refused, once is fine',
    cap(CAPTION.replace('Nothing here', 'Save this. Share this with a trader who needs it. Nothing here')).includes('caption_ask')
    && !cap(CAPTION.replace('Nothing here', 'Save this for the next print. Nothing here')).includes('caption_ask'))
  check('a link or domain in the caption is refused', cap(CAPTION.replace('Nothing here', 'Read more at biasforge.co. Nothing here')).includes('caption_link'))

  // The guardrails that apply to every post apply to slides as well.
  const levels = checkCarousel({ carouselType: 'macro_101', caption: CAPTION, facts, slides: deckWith(4, { text: 'Put your stop loss below the low and target the next high.' }) })
  check('a slide carrying trade levels is a hard flag on that slide', levels.some(f => f.level === 'hard' && f.code === 'trade_levels' && /^slide 5 —/.test(f.msg)), JSON.stringify(levels.map(f => f.msg)))
  check('slideText joins everything a reader sees on a slide',
    slideText(DECK[3]).includes('Three ways this shows up') && slideText(DECK[3]).includes('Read the real yield direction first.'), slideText(DECK[3]))
}

// The renderer refuses an over-long deck too, so neither layer relies on the other.
{
  let threw = null
  try { await renderCarousel(Array.from({ length: MAX_CAROUSEL_SLIDES + 1 }, () => DECK[0]), {}) } catch (e) { threw = e }
  check(`the renderer refuses ${MAX_CAROUSEL_SLIDES + 1} slides`, !!threw && /at most 10/.test(threw.message), threw?.message)
}

// ── 3. called_it ──────────────────────────────────────────────────────────────
// Every case is the same deck of fakes with one thing changed, so what decides is visible.
const DAY = 86400000
function calledItModule({ biasRows, queueRows, lastRun = null, now }) {
  const table = t => (t === 'bias_history' ? biasRows : queueRows)
  const supabase = { from(t) {
    const st = { filters: [] }
    const run = () => ({ data: table(t).filter(r => st.filters.every(f => f(r))), error: null })
    const b = {
      select() { return b },
      eq(k, v) { st.filters.push(r => r[k] === v); return b },
      in(k, vs) { st.filters.push(r => vs.includes(r[k])); return b },
      gte(k, v) { st.filters.push(r => r[k] >= v); return b },
      order() { return b },
      limit() { return b },
      maybeSingle: async () => { const r = run(); return { data: r.data[0] ?? null, error: null } },
      then(res, rej) { return Promise.resolve(run()).then(res, rej) },
    }
    return b
  } }
  const v2LoadSnapshot = async () => lastRun
  return new Function('supabase', 'v2LoadSnapshot', 'Date',
    `${outcomeSrc}\n${igConstSrc}\n${calledItSrc}\nreturn calledItCandidate`)(supabase, v2LoadSnapshot, class extends Date {
      constructor(...a) { super(...(a.length ? a : [now])) }
      static now() { return now }
      static parse(s) { return Date.parse(s) }
    })
}

{
  const now = Date.parse('2026-09-23T12:00:00Z')
  const bias = (over = {}) => ({
    id: 1, engine: 'v2', pair: 'EURUSD', direction: 'BEARISH', reasoning: 'A dovish ECB against a firm Fed.',
    generated_at: new Date(now - 2 * DAY).toISOString(), performance: { status: 'final', correct: true }, ...over,
  })
  const post = (over = {}) => ({
    id: 90, platform: 'x', content_type: 'news_reaction', status: 'published',
    published_at: new Date(now - 2 * DAY - 3 * 3600000).toISOString(),
    source_ref: { facts: { marketTags: ['EUR', 'USD'], headline: 'ECB speech' } }, ...over,
  })

  const ok = await calledItModule({ biasRows: [bias()], queueRows: [post()], now })(now)
  check('called_it: a resolved hit with a news post 3h before it qualifies', !!ok.candidate && ok.candidate.call.outcome === 'hit' && ok.candidate.priorPost.contentType === 'news_reaction', JSON.stringify(ok))
  check('called_it: the candidate carries the prior post\'s exact publish time', ok.candidate?.priorPost.publishedAt === post().published_at, JSON.stringify(ok.candidate?.priorPost))
  check('called_it: the candidate carries the reasoning, not a rewrite of it', ok.candidate?.call.reasoning === 'A dovish ECB against a firm Fed.')

  const miss = await calledItModule({ biasRows: [bias({ performance: { status: 'final', correct: false } })], queueRows: [post()], now })(now)
  check('called_it: a MISS never qualifies', miss.candidate === null && /no resolved hit/.test(miss.why), JSON.stringify(miss))

  const open = await calledItModule({ biasRows: [bias({ performance: { status: 'live' } })], queueRows: [post()], now })(now)
  check('called_it: an UNRESOLVED call never qualifies', open.candidate === null && /no resolved hit/.test(open.why), JSON.stringify(open))

  const noPerf = await calledItModule({ biasRows: [bias({ performance: null })], queueRows: [post()], now })(now)
  check('called_it: a call with no performance record never qualifies', noPerf.candidate === null, JSON.stringify(noPerf))

  const ranThisWeek = await calledItModule({ biasRows: [bias()], queueRows: [post()], lastRun: { at: new Date(now - 3 * DAY).toISOString() }, now })(now)
  check('called_it: one already ran 3 days ago → refused', ranThisWeek.candidate === null && /one a week/.test(ranThisWeek.why), JSON.stringify(ranThisWeek))

  const ranLastWeek = await calledItModule({ biasRows: [bias()], queueRows: [post()], lastRun: { at: new Date(now - 8 * DAY).toISOString() }, now })(now)
  check('called_it: one that ran 8 days ago does not block a new one', !!ranLastWeek.candidate, JSON.stringify(ranLastWeek))

  const noPost = await calledItModule({ biasRows: [bias()], queueRows: [], now })(now)
  check('called_it: a hit with nothing posted before it does not qualify', noPost.candidate === null && /none had a news or event post/.test(noPost.why), JSON.stringify(noPost))

  const afterCall = await calledItModule({ biasRows: [bias()], queueRows: [post({ published_at: new Date(now - DAY).toISOString() })], now })(now)
  check('called_it: a post published AFTER the call does not count', afterCall.candidate === null, JSON.stringify(afterCall))

  const tooEarly = await calledItModule({ biasRows: [bias()], queueRows: [post({ published_at: new Date(now - 4 * DAY).toISOString() })], now })(now)
  check('called_it: a post more than 24h before the call does not count', tooEarly.candidate === null, JSON.stringify(tooEarly))

  const otherPair = await calledItModule({ biasRows: [bias()], queueRows: [post({ source_ref: { facts: { marketTags: ['JPY'] } } })], now })(now)
  check('called_it: a post about a different currency does not count', otherPair.candidate === null, JSON.stringify(otherPair))

  const eventRow = await calledItModule({ biasRows: [bias()], queueRows: [post({ content_type: 'event_preview', source_ref: { facts: { events: [{ currency: 'USD', title: 'CPI' }] } } })], now })(now)
  check('called_it: an event_preview about USD counts for a EUR/USD call', !!eventRow.candidate && eventRow.candidate.priorPost.contentType === 'event_preview', JSON.stringify(eventRow))

  const stale = await calledItModule({ biasRows: [bias({ generated_at: new Date(now - 9 * DAY).toISOString() })], queueRows: [post({ published_at: new Date(now - 9 * DAY - 3600000).toISOString() })], now })(now)
  check('called_it: a hit older than the 5-day window is out of scope', stale.candidate === null, JSON.stringify(stale))
}

// ── 4. The story lane's own cap ───────────────────────────────────────────────
function storyModule({ storiesToday = [], cap = null, adminChat = '111' } = {}) {
  const inserted = []
  const dms = []
  const supabase = { from: () => ({
    insert(payload) {
      const row = { id: 500 + inserted.length, ...payload }
      inserted.push(row)
      return { select: () => ({ single: async () => ({ data: row, error: null }) }) }
    },
    update() { return { eq: async () => ({ error: null }) } },
  }) }
  if (cap == null) delete process.env.IG_STORY_DAILY_CAP
  else process.env.IG_STORY_DAILY_CAP = String(cap)
  const mod = new Function(
    'supabase', 'v2AdminChat', 'igRowsToday', 'igStoryDailyCap', 'loadRenderer', 'socialUploadPng',
    'socialDraftMessage', 'sendTGPhoto', 'socialKeyboard',
    `${igConstSrc}\n${storySrc}\nreturn createStoryDraft`,
  )(
    supabase,
    () => adminChat,
    async () => storiesToday,
    () => Number(process.env.IG_STORY_DAILY_CAP) || 3,
    async () => ({ renderCard: async () => Buffer.from('png') }),
    async () => ({ path: 'cards/ig/story.png', url: 'https://x.supabase.co/story.png' }),
    () => 'draft message',
    async (chat, buf, caption) => { dms.push({ chat, caption }); return 42 },
    id => ({ inline_keyboard: [[{ text: 'ok', callback_data: `sq:ap:${id}` }]] }),
  )
  return { createStoryDraft: mod, inserted, dms }
}

{
  const story = { storyType: 'bias_story', cardKind: 'bias_card', cardData: { pair: 'EURUSD', direction: 'BEARISH', confidence: 78, grade: 'A-', driver: 'x' }, pillar: 'daily_bias' }

  quiet()
  const a = storyModule({ storiesToday: [] })
  const row = await a.createStoryDraft(story)
  loud()
  check('story: a draft is queued as format "story" on instagram', row?.format === 'story' && row.platform === 'instagram' && row.content_type === 'bias_story', JSON.stringify(row && { f: row.format, p: row.platform, c: row.content_type }))
  check('story: the row carries no caption text', row?.text === '', JSON.stringify(row?.text))
  check('story: the card is DM\'d to the admin', a.dms.length === 1 && a.dms[0].chat === '111', JSON.stringify(a.dms))

  quiet()
  const b = storyModule({ storiesToday: [{ id: 1 }, { id: 2 }, { id: 3 }] })
  const capped = await b.createStoryDraft(story)
  loud()
  check('story: the 4th story of the day is refused by the default cap of 3', capped === null && b.inserted.length === 0)

  quiet()
  const c = storyModule({ storiesToday: [{ id: 1 }, { id: 2 }, { id: 3 }], cap: 5 })
  const raised = await c.createStoryDraft(story)
  loud()
  check('story: IG_STORY_DAILY_CAP=5 lets the 4th through', raised !== null && c.inserted.length === 1)

  // The story cap counts stories only: a day full of feed rows is irrelevant to it, because
  // igRowsToday('story') is what the gate reads.
  quiet()
  const d = storyModule({ storiesToday: [] })
  const withFeed = await d.createStoryDraft(story)
  loud()
  check('story: feed posts do not count against the story cap', withFeed !== null)
  check('story: the gate reads the story lane, not the whole platform', /igRowsToday\('story'/.test(storySrc), storySrc.slice(0, 200))

  quiet()
  const e = storyModule({ storiesToday: [] })
  let threw = null
  try { await e.createStoryDraft({ ...story, storyType: 'meme_story' }) } catch (err) { threw = err }
  loud()
  check('story: an unknown story type is refused', !!threw && /unknown storyType/.test(threw.message), threw?.message)
}

// ── 5. Instagram's topic rotation ─────────────────────────────────────────────
function rotationModule({ history = [], drafted = true } = {}) {
  const saved = []
  const carousels = []
  const mod = new Function(
    'v2LoadSnapshot', 'v2SaveSnapshot', 'pickEduTopic', 'utcDay', 'createCarouselDraft',
    `${igConstSrc}\n${rotationSrc}\nreturn { draftMacro101, pickIgTopic }`,
  )(
    async key => (key === 'ig_edu_rotation' ? { history } : null),
    (k, v) => saved.push({ key: k, value: v }),
    pickEduTopic,
    () => '2026-09-23',
    async args => { carousels.push(args); return drafted ? { id: 777 } : null },
  )
  return { ...mod, saved, carousels }
}

{
  const day = n => new Date(Date.parse('2026-09-23T00:00:00Z') - n * DAY).toISOString().slice(0, 10)
  // Every topic but one used inside the 60-day window: the one outside it is what comes next.
  const history = EDU_TOPICS.map((t, i) => ({ id: t.id, date: i === 7 ? day(61) : day(10 + (i % 40)) }))

  quiet()
  const m = rotationModule({ history })
  const { topic } = await m.pickIgTopic()
  loud()
  check('rotation: a topic used 61 days ago is eligible again', topic.id === EDU_TOPICS[7].id, topic.id)

  // Every topic used inside the window: the lane still posts, on the least recently used topic,
  // rather than going quiet. (pickEduTopic says so with relaxed:true, which the caller logs.)
  const allRecent = EDU_TOPICS.map((t, i) => ({ id: t.id, date: day(i === 3 ? 44 : 30) }))
  quiet()
  const m2 = rotationModule({ history: allRecent })
  const r2 = await m2.pickIgTopic()
  loud()
  check('rotation: with every topic inside the window, the least recently used one is picked anyway',
    r2.topic.id === EDU_TOPICS[3].id && pickEduTopic(allRecent, '2026-09-23', EDU_TOPICS, 60).relaxed === true, r2.topic.id)
  check('rotation: 60 days, not LinkedIn\'s 45 — a topic used 50 days ago is still blocked',
    pickEduTopic(EDU_TOPICS.map(t => ({ id: t.id, date: day(50) })), '2026-09-23', EDU_TOPICS, 60).relaxed === true
    && pickEduTopic(EDU_TOPICS.map(t => ({ id: t.id, date: day(50) })), '2026-09-23', EDU_TOPICS, EDU_REPEAT_DAYS).relaxed === false)

  quiet()
  const m3 = rotationModule({ history: [] })
  const r3 = await m3.draftMacro101()
  loud()
  check('rotation: a drafted deck advances the history under the ig key', m3.saved.length === 1 && m3.saved[0].key === 'ig_edu_rotation' && m3.saved[0].value.history.at(-1).id === r3.topic.id, JSON.stringify(m3.saved))
  check('rotation: the ig key is not LinkedIn\'s', m3.saved[0].key !== 'li_edu_rotation' && /ig_edu_rotation/.test(igConstSrc))
  check('rotation: the deck is written as macro_101, with the topic as its facts',
    m3.carousels[0]?.carouselType === 'macro_101' && m3.carousels[0].facts.topic === r3.topic.title && m3.carousels[0].facts.angle === r3.topic.angle, JSON.stringify(m3.carousels[0]))

  quiet()
  const m4 = rotationModule({ history: [], drafted: false })
  await m4.draftMacro101()
  loud()
  check('rotation: a blocked deck does NOT burn the topic', m4.saved.length === 0)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
