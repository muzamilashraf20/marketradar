// Test vectors for the outcome / scorecard data layer.
//   node backend/scripts/scorecard.test.mjs
//
// What matters here, in order:
//   1. the Bias History banner is computed from exactly the rows the modal lists — a visible loss
//      always counts, so a set containing a wrong call can never read 100%.
//   2. the same bias recorded twice (bias_history #269/#270, 2026-09-24) is one call everywhere:
//      it is not inserted twice, and rows that already exist are collapsed on read.
//   3. the scorecard's calls span every trading day of the week (Mon/Wed/Thu/Fri here), bucketed on
//      the 17:00 New York roll, with nothing truncated.
//   4. a scorecard never counts: "three calls, one miss" is a hard flag, and a deck that leaves out
//      a call is a hard flag.
//
// index.js cannot be imported (it boots the server against the LIVE database), so the pieces under
// test are read out of it as source and run against fakes, the way the other social tests do it.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validateSocialPost, scorecardTally } from '../social/guardrails.js'
import { checkCarousel, scorecardSlideRange } from '../social/generator.js'
import { renderCard, SCORECARD_MAX_ROWS } from '../social/renderer.js'

const src = readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8')
const cut = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a + 1)
  if (a === -1 || b === -1 || b <= a) throw new Error(`index.js extraction failed at "${from}" — did the section move?`)
  return src.slice(a, b)
}
const summarySrc = cut('// Collapse bias_history rows that record the SAME', '// 🎯 Bias performance — every bias scored')
const callsSrc = cut('function scorecardOutcome', 'async function socialScorecardRows')
const factsSrc = cut('function scorecardFacts', '// ── LinkedIn education')
const publishSrc = cut('let publishTodayBiasChain', 'async function publishTodayBiasNow')
const saveSrc = cut('async function saveBiasHistory', '// Telegram + Email alert')
for (const [name, text] of [['dedupeBiasRows', summarySrc], ['biasPerformanceSummary', summarySrc], ['scorecardCalls', callsSrc], ['fxTradingDay', callsSrc], ['publishTodayBias', publishSrc], ['maybeSingle', saveSrc]]) {
  if (!text.includes(name)) throw new Error(`extraction sanity check failed: ${name} not found`)
}
const { dedupeBiasRows, biasPerformanceSummary, scorecardCalls, scorecardFacts } = new Function(
  `${summarySrc}\n${callsSrc}\n${factsSrc}\nreturn { dedupeBiasRows, biasPerformanceSummary, scorecardCalls, scorecardFacts }`)()

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`)
}
const hardCodes = flags => flags.filter(f => f.level === 'hard').map(f => f.code)

// The live 7D window as it stood on 2026-09-26: bias_history #263–#271, performance as persisted.
const perf = (pips, correct) => ({ status: 'final', pips, correct, mfePips: 0, maePips: 0 })
const LIVE = [
  { id: 263, engine: 'v2', pair: 'USDCAD', direction: 'Bullish', confidence: 83, trade_grade: 'A', generated_at: '2026-09-20T22:53:45.142+00:00', performance: perf(44.6, true) },
  { id: 264, engine: 'v2', pair: 'GBPUSD', direction: 'Bearish', confidence: 87, trade_grade: 'A', generated_at: '2026-09-21T06:47:35.447+00:00', performance: perf(5.9, true) },
  { id: 265, engine: 'v2', pair: 'USDCAD', direction: 'Bullish', confidence: 82, trade_grade: 'A', generated_at: '2026-09-23T03:11:54.977+00:00', performance: perf(19.7, true) },
  { id: 266, engine: 'v2', pair: 'XAUUSD', direction: 'Bearish', confidence: 64, trade_grade: 'B', generated_at: '2026-09-23T04:55:32.908+00:00', performance: perf(547.7, true) },
  { id: 267, engine: 'v2', pair: 'USDCAD', direction: 'Bullish', confidence: 76, trade_grade: 'A-', generated_at: '2026-09-23T06:52:00.672+00:00', performance: perf(23, true) },
  { id: 268, engine: 'v2', pair: 'GBPUSD', direction: 'Bearish', confidence: 58, trade_grade: 'C', generated_at: '2026-09-23T13:15:30.804+00:00', performance: perf(48.8, true) },
  { id: 269, engine: 'v2', pair: 'USDCAD', direction: 'Bullish', confidence: 78, trade_grade: 'A-', generated_at: '2026-09-24T11:56:47.024+00:00', performance: perf(30, true) },
  { id: 270, engine: 'v2', pair: 'USDCAD', direction: 'Bullish', confidence: 78, trade_grade: 'A-', generated_at: '2026-09-24T11:56:47.024+00:00', performance: perf(30, true) },
  { id: 271, engine: 'v2', pair: 'GBPUSD', direction: 'Bearish', confidence: 78, trade_grade: 'A-', generated_at: '2026-09-24T23:57:22.951+00:00', performance: perf(-32.6, false) },
]

// ── 1. The banner counts what the list shows ─────────────────────────────────
{
  const listed = dedupeBiasRows([...LIVE].reverse())
  const s = biasPerformanceSummary(listed)
  check('live 7D: the A- GBPUSD loss is counted — no longer 100%', s.winRate !== 100 && s.scored - s.wins === 1, JSON.stringify(s))
  check('live 7D: every listed resolved row is counted (8 after the duplicate, 7 correct)', s.scored === listed.length && s.scored === 8 && s.wins === 7 && s.winRate === 87.5, JSON.stringify(s))

  for (const grade of ['A+', 'A', 'A-', 'B', 'C', 'D', '-', null]) {
    const set = [
      { id: 1, engine: 'v2', pair: 'EURUSD', direction: 'Bullish', trade_grade: 'A', confidence: 80, generated_at: '2026-09-21T08:00:00Z', performance: perf(12, true) },
      { id: 2, engine: 'v2', pair: 'GBPUSD', direction: 'Bearish', trade_grade: grade, confidence: 40, generated_at: '2026-09-22T08:00:00Z', performance: perf(-9, false) },
    ]
    const r = biasPerformanceSummary(set)
    check(`one wrong call (grade ${grade}) in the set → never 100%`, r.winRate !== 100 && r.scored === 2, JSON.stringify(r))
  }
  const live = biasPerformanceSummary([{ id: 1, performance: { status: 'live', pips: 4, correct: null, mfePips: 5, maePips: 1 } }])
  check('a live (unresolved) row shows but carries no verdict', live.scored === 0 && live.live === 1 && live.winRate === null, JSON.stringify(live))
}

// ── 2. Duplicates ─────────────────────────────────────────────────────────────
{
  const two = [LIVE[7], LIVE[6]]
  const d = dedupeBiasRows(two)
  check('two identical rows for the same bias/time → one row', d.length === 1 && d[0].id === 269, JSON.stringify(d.map(r => r.id)))
  check('two identical rows → one scorecard call', scorecardCalls(two).length === 1, JSON.stringify(scorecardCalls(two)))
  check('two identical rows → counted once in the banner', biasPerformanceSummary(dedupeBiasRows(two)).scored === 1)
  const unscored = { ...LIVE[6], id: 250, performance: null }
  check('dedupe keeps the finally-scored twin over an unscored one', dedupeBiasRows([unscored, LIVE[7]])[0].id === 270)
  const differentTime = [LIVE[4], LIVE[6]]
  check('same pair and direction at a different time is NOT a duplicate', dedupeBiasRows(differentTime).length === 2)
}

// The write side: two overlapping publishes insert once.
{
  const inserted = []
  let lastTodaysBiasKey = ''
  const publishTodayBiasNow = async result => {
    const key = `${result.direction} ${result.pair}`.toUpperCase()
    if (key !== lastTodaysBiasKey) {
      await new Promise(r => setTimeout(r, 20))    // the insert's round trip — the race window
      inserted.push(key)
      lastTodaysBiasKey = key
    }
    return result
  }
  const publishTodayBias = new Function('publishTodayBiasNow', `${publishSrc}\nreturn publishTodayBias`)(publishTodayBiasNow)
  const bias = { direction: 'Bullish', pair: 'USDCAD' }
  await Promise.all([publishTodayBias(bias), publishTodayBias(bias)])
  check('two concurrent publishes of the same bias → one history insert', inserted.length === 1, JSON.stringify(inserted))
  let threw = false
  const failing = new Function('publishTodayBiasNow', `${publishSrc}\nreturn publishTodayBias`)(async () => { throw new Error('boom') })
  try { await failing(bias) } catch { threw = true }
  check('a failed publish still rejects to its caller', threw)
}

// saveBiasHistory refuses to insert a snapshot that is already recorded.
{
  const fakeSupabase = (existing, inserts) => ({ from: () => {
    const b = {
      select: () => b, eq: () => b, limit: () => b,
      maybeSingle: async () => ({ data: existing, error: null }),
      insert: row => { inserts.push(row); return { select: () => ({ single: async () => ({ data: { id: 999 }, error: null }) }) } },
    }
    return b
  } })
  const make = sb => new Function('supabase', `${saveSrc}\nreturn saveBiasHistory`)(sb)
  const result = { engine: 'v2', pair: 'USDCAD', direction: 'Bullish', confidence: 78, tradeGrade: 'A-', reasoning: 'x', generatedAt: '2026-09-24T11:56:47.024Z' }
  const log = console.log; console.log = () => {}
  const i1 = []; const r1 = await make(fakeSupabase({ id: 269 }, i1))(result, 'BEARISH GBPUSD')
  const i2 = []; const r2 = await make(fakeSupabase(null, i2))(result, 'BEARISH GBPUSD')
  console.log = log
  check('saveBiasHistory: an already-recorded snapshot is not inserted again, existing id returned', i1.length === 0 && r1 === 269, JSON.stringify({ i1, r1 }))
  check('saveBiasHistory: a new snapshot is inserted', i2.length === 1 && r2 === 999 && i2[0].generated_at === result.generatedAt, JSON.stringify({ i2, r2 }))
}

// ── 3. FACTS span every trading day ───────────────────────────────────────────
{
  const calls = scorecardCalls(LIVE)
  const days = [...new Set(calls.map(c => c.date))]
  check('live week: calls on Mon, Wed, Thu and Fri', JSON.stringify(days) === JSON.stringify(['Mon 21', 'Wed 23', 'Thu 24', 'Fri 25']), JSON.stringify(calls))
  check('Sun 22:53 UTC (after the Sunday open) is Monday\'s call', calls[0].date === 'Mon 21' && calls[0].pair === 'USDCAD')
  check('Thu 23:57 UTC (after the 17:00 NY roll) is Friday\'s call', calls[calls.length - 1].date === 'Fri 25' && calls[calls.length - 1].outcome === 'miss')
  const wedUsdcad = calls.filter(c => c.date === 'Wed 23' && c.pair === 'USDCAD')
  check('a pair re-published the same day in the same direction is one call', wedUsdcad.length === 1, JSON.stringify(wedUsdcad))
  check('live week: one call per pair per day (7 calls)', calls.length === 7, JSON.stringify(calls))

  const facts = scorecardFacts(calls, new Date('2026-09-26T09:00:00Z'))
  check('scorecardFacts keeps every call (no truncation)', facts.rows.length === calls.length && facts.rows[0].date === 'Mon 21', JSON.stringify(facts))
  const busy = Array.from({ length: 11 }, (_, i) => ({ date: `Mon ${i}`, pair: 'EURUSD', direction: 'BULLISH', outcome: 'hit' }))
  check('scorecardFacts keeps a busy week whole (11 calls)', scorecardFacts(busy).rows.length === 11)

  // Mon/Wed/Thu/Fri with nothing on Tuesday, in UTC terms near both edges of the day.
  const synth = [
    ['2026-09-21T09:00:00Z', 'EURUSD', 'Bullish', true], ['2026-09-23T20:59:00Z', 'GBPUSD', 'Bearish', false],
    ['2026-09-24T12:00:00Z', 'USDJPY', 'Bullish', true], ['2026-09-25T15:00:00Z', 'AUDUSD', 'Bearish', true],
  ].map(([t, pair, direction, ok], i) => ({ id: i + 1, engine: 'v2', pair, direction, generated_at: t, performance: perf(ok ? 5 : -5, ok) }))
  check('FACTS spanning Mon/Wed/Thu/Fri → calls on all four days', scorecardCalls(synth).map(c => c.date).join(',') === 'Mon 21,Wed 23,Thu 24,Fri 25', JSON.stringify(scorecardCalls(synth)))

  const flip = [
    { id: 1, engine: 'v2', pair: 'EURUSD', direction: 'Bearish', generated_at: '2026-09-22T07:00:00Z', performance: perf(-12, false) },
    { id: 2, engine: 'v2', pair: 'EURUSD', direction: 'Bullish', generated_at: '2026-09-22T14:00:00Z', performance: perf(20, true) },
  ]
  const flipped = scorecardCalls(flip)
  check('a genuine same-day flip keeps both resolved legs — the missed first leg is not erased', flipped.length === 2 && flipped[0].outcome === 'miss' && flipped[1].outcome === 'hit', JSON.stringify(flipped))
  const unscored = [{ id: 1, engine: 'v2', pair: 'EURUSD', direction: 'Bearish', generated_at: '2026-09-22T07:00:00Z', performance: { status: 'error' } }]
  check('a row with no verdict is not a call', scorecardCalls(unscored).length === 0)
}

// ── 4. No counting, and no call left out ──────────────────────────────────────
{
  const rows = scorecardCalls(LIVE)
  const facts = { rangeLabel: '20 September – 26 September', rows }
  const line = r => `${r.date} — ${r.pair.slice(0, 3)}/${r.pair.slice(3)} ${r.direction.toLowerCase()}. ${r.outcome === 'miss' ? 'Resolved as a miss.' : 'Resolved as a hit.'}`
  const [min] = scorecardSlideRange(rows)
  const points = []
  for (let i = 0; i < rows.length; i += 3) points.push({ kind: 'points', label: 'The calls', title: 'How they resolved', points: rows.slice(i, i + 3).map(line) })
  const deck = [
    { kind: 'cover', kicker: 'Weekly scorecard', title: 'Every call, 20 to 26 September' },
    ...points,
    { kind: 'callout', label: 'The honest part', text: 'The misses are listed the same way as the hits. A week is far too small a sample to mean anything.' },
    { kind: 'cta', line: 'Every call, published as it was made.' },
  ]
  const CAPTION = `Every call from the week, as it was made.\n\nThe misses sit next to the hits, because a scorecard that hides them is not one.\n\nA week is a small sample. It says little either way, and it is not a record.\n\nNothing here is a trade call. It is what the engine said and how each call resolved.\n\n#forex #trading #macro #propfirm #fundedtrader`
  const clean = checkCarousel({ carouselType: 'scorecard', slides: deck, caption: CAPTION, facts })
  check(`a full scorecard deck (${deck.length} slides, needs ≥${min}) passes with no hard flags`, !hardCodes(clean).length, JSON.stringify(clean))

  const tallied = deck.map((s, i) => (s.kind === 'callout' ? { ...s, text: 'Three calls, one miss. A week is a small sample.' } : s))
  const t = checkCarousel({ carouselType: 'scorecard', slides: tallied, caption: CAPTION, facts })
  check('"three calls, one miss" on a slide → hard flag', t.some(f => f.level === 'hard' && f.code === 'tally' && /^slide \d+ —/.test(f.msg)), JSON.stringify(t))

  const missing = deck.map(s => (s.kind === 'points' && s.points.some(p => p.startsWith('Mon 21')) ? { ...s, points: s.points.filter(p => !p.startsWith('Mon 21')) } : s))
  const m = checkCarousel({ carouselType: 'scorecard', slides: missing, caption: CAPTION, facts })
  check('a deck that leaves out Monday → hard scorecard_coverage flag', m.filter(f => f.code === 'scorecard_coverage').length === 2, JSON.stringify(m.filter(f => f.code === 'scorecard_coverage')))
  const [lo, hi] = scorecardSlideRange(rows)
  check('slide range grows with the week (7 calls over 4 days → 6-7 slides)', lo === 6 && hi === 7, `${lo}-${hi}`)

  for (const text of ['Three calls, one miss.', 'Four hits this week.', 'Two losing calls, both on GBP/USD.', 'Went 4 for 5.', 'Three of four landed.', 'A 5-1 week.', 'No misses since Monday — a clean sweep.', 'One call went against us.',
    // Phrasings the live regeneration on 2026-09-26 produced before the rule covered them.
    'Three separate sessions, same read, same result.', 'USDCAD bullish twice on Monday and Wednesday.', 'A week that was mostly clean.', 'Two pairs, two directions', 'GBPUSD bearish across three sessions',
    'USDCAD bullish ran Monday, Wednesday and Thursday. Every one of those hit.', "Most of it moved with the bias. One didn't.", 'One miss is on the board this week.']) {
    check(`tally: "${text}" is a hard flag on a scorecard`, hardCodes(validateSocialPost(text, { platform: 'x', contentType: 'weekly_scorecard' }).flags).includes('tally'), JSON.stringify(scorecardTally(text)))
  }
  for (const text of ['Fri 25 — GBP/USD bearish. Resolved as a miss.', 'Mon 21 USDCAD bullish: hit.', 'Wednesday 23 September, gold bearish, resolved as a hit.', 'A week is a small sample and says little either way.', 'Each call is scored over its own 24-hour window.', '20 September – 26 September', 'Mon 21 — USDCAD — Bullish — Hit', 'Most traders judge a week by its outcome.']) {
    check(`no tally: "${text}"`, scorecardTally(text) === null, JSON.stringify(scorecardTally(text)))
  }
  check('tally rule is scoped to scorecards', !hardCodes(validateSocialPost('Three things traders get wrong about CPI.', { platform: 'x', contentType: 'education' }).flags).includes('tally'))
}

// ── Renderer: never drops a call ──────────────────────────────────────────────
{
  const rows = n => Array.from({ length: n }, (_, i) => ({ date: 'Mon 21', pair: 'EURUSD', direction: 'BULLISH', outcome: 'hit' }))
  const png = await renderCard('weekly_scorecard', { rangeLabel: 'x', rows: rows(SCORECARD_MAX_ROWS) })
  check(`the card renders ${SCORECARD_MAX_ROWS} calls`, png.length > 10 * 1024)
  let threw = null
  try { await renderCard('weekly_scorecard', { rangeLabel: 'x', rows: rows(SCORECARD_MAX_ROWS + 1) }) } catch (e) { threw = e }
  check(`the card refuses ${SCORECARD_MAX_ROWS + 1} calls rather than dropping one`, !!threw && /will not drop/.test(threw.message), threw?.message)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
