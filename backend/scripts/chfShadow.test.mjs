// Test vectors for biasEngineV2/chfShadow.js — the CHF shadow, which runs OUTSIDE the engine.
//   node backend/scripts/chfShadow.test.mjs
//
// 1. PARITY: the shadow carries copies of three engine functions biasEngine.js does not export. The
//    originals are cut out of biasEngine.js SOURCE and evaluated here; the copies must return identical
//    results on many inputs. If the engine's versions ever change, this fails.
// 2. Behaviour of the shadow itself (shift maths, REDIST→FULL, change detection, stale CHF, no mutation).
// 3. observeFeeds is a pure pass-through; runChfShadowAfter skips instead of guessing.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { CONFIG, REGIMES } from '../biasEngineV2/biasEngine.js'
import { runChfShadow, runChfShadowAfter, formatChfShadow, resultingDirection, observeFeeds, __copies } from '../biasEngineV2/chfShadow.js'

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`)
}

// ── 1. parity with the engine's own source ────────────────────────────────────────
const src = readFileSync(fileURLToPath(new URL('../biasEngineV2/biasEngine.js', import.meta.url)), 'utf8')
const cut = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); if (a < 0 || b < 0) throw new Error(`cut failed: ${from}`); return src.slice(a, b) }
const engineFns = new Function('CONFIG', `
  ${cut('const RATE_XSECTION', '// Composite for ONE pair.')}
  ${cut('const MACRO_RATE_EXEMPT', '// composite score per currency')}
  ${cut('function computeConfidence(', 'async function saveState(')}
  return { computeMacroRateScores, pairComposite, computeConfidence, RATE_XSECTION }`)(CONFIG)

check('RATE_XSECTION copy === engine', isDeepStrictEqual(__copies.RATE_XSECTION, engineFns.RATE_XSECTION), JSON.stringify(engineFns.RATE_XSECTION))

let seed = 7
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
const days = (() => { const out = []; const d = new Date(); while (out.length < 8) { if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1) } return out })()
const randRates = () => {
  const r = {}
  for (const c of engineFns.RATE_XSECTION) {
    if (rnd() < 0.08) continue                                         // sometimes missing
    const stale = rnd() < 0.05
    let lvl = 1 + rnd() * 4
    r[c] = { value: lvl, history: days.map((d, i) => ({ d: stale ? '2025-07-0' + (i + 1) : d, v: +(lvl -= (rnd() - 0.5) * 0.12).toFixed(3) })) }
  }
  return r
}
let parity = true, n = 0
for (let i = 0; i < 400; i++) {
  const rates = randRates()
  const a = engineFns.computeMacroRateScores(rates), b = __copies.computeMacroRateScores(rates)
  if (!isDeepStrictEqual(a, b)) { parity = false; console.log('      rates mismatch', JSON.stringify(a), JSON.stringify(b)); break }
  const scores = {}
  for (const c of ['USD', 'EUR', 'JPY', 'CAD', 'AUD', 'GBP', 'NZD', 'CHF', 'XAU']) scores[c] = { macro: Math.round(rnd() * 10 - 5), orderflow: Math.round(rnd() * 10 - 5), sentiment: Math.round(rnd() * 10 - 5) }
  const w = Object.values(REGIMES)[i % Object.keys(REGIMES).length].weights
  for (const pair of ['EURUSD', 'USDCHF', 'XAUUSD', 'NZDUSD', 'USDJPY']) {
    const [bq, qq] = [pair.slice(0, 3), pair.slice(3)]
    const pa = engineFns.pairComposite(scores, w, bq, qq, a), pb = __copies.pairComposite(scores, w, bq, qq, b)
    if (!isDeepStrictEqual(pa, pb)) { parity = false; console.log('      composite mismatch', pair); break }
    const args = { diff: pa.diff, baseScores: scores[bq], quoteScores: scores[qq], adrUsedPct: rnd() * 100 }
    if (!isDeepStrictEqual(engineFns.computeConfidence(args), __copies.computeConfidence(args))) { parity = false; console.log('      confidence mismatch', pair); break }
    n++
  }
  if (!parity) break
}
check(`copies return identical results to the engine source (${n} composite/confidence + 400 rate cases)`, parity)

// ── 2. shadow behaviour ────────────────────────────────────────────────────────────
const series = (level, bps) => ({ value: level, change: 0, date: days[0], history: days.map((d, i) => ({ d, v: +(level - (i >= 3 ? bps / 100 : (bps / 100) * (i / 3))).toFixed(4) })) })
const rates = { USD: series(3.5, 10), EUR: series(2, 2), JPY: series(0.8, 0), CAD: series(2.7, 4), AUD: series(3.6, 6), GBP: series(3.9, 8), NZD: series(3.2, -2) }
const macroRate = __copies.computeMacroRateScores(rates)
const weights = REGIMES.eventHeavy.weights
const nudges = { USD: 0, EUR: 1, JPY: 0, CAD: -1, AUD: 0, GBP: 0, NZD: 0 }
const scores = {}
for (const c of __copies.RATE_XSECTION) scores[c] = { macro: (macroRate.scores[c] ?? 0) + nudges[c], orderflow: 1, sentiment: 0 }
scores.CHF = { macro: 0, orderflow: -1, sentiment: 1 }
scores.XAU = { macro: 1, orderflow: 0, sentiment: 1 }
const market = (price) => ({ price, atr: 0.01, adr: 0.006, pdh: price + 0.004, pdl: price - 0.004, adrUsedPct: 0.3, isHighAtrWeek: false })
function actualFor(pair, state, mkt) {
  const base = pair.slice(0, 3), quote = pair.slice(3, 6)
  const pc = __copies.pairComposite(scores, weights, base, quote, macroRate)
  return { pair, base, quote, state, market: mkt, actual: { diff: pc.diff, action: 'HOLD_FLAT', direction: 'FLAT', grade: null, basis: pc.basis } }
}
{
  const chf = series(0.65, 12)
  const pairs = ['EURUSD', 'USDCHF', 'USDJPY', 'NZDUSD'].map(p => actualFor(p, null, market(1.1)))
  const before = JSON.stringify({ rates, macroRate, scores, pairs })
  const r = runChfShadow({ chfRate: chf, rates, macroRate, scores, weights, pairs })
  check('inputs are not mutated', JSON.stringify({ rates, macroRate, scores, pairs }) === before)
  check('CHF joins: xsection 7 → 8 of 8', r.xsection.actual === 7 && r.xsection.shadow === 8 && r.xsection.of === 8)
  const sh = __copies.computeMacroRateScores({ ...rates, CHF: chf }, [...__copies.RATE_XSECTION, 'CHF'])
  let exact = true
  for (const c of __copies.RATE_XSECTION) {
    const want = Math.max(-5, Math.min(5, scores[c].macro + (sh.scores[c] - macroRate.scores[c])))
    if ((r.shift[c] ? r.shift[c].macro[1] : scores[c].macro) !== want) exact = false
  }
  check('each currency shifts by exactly its rate-score delta (model nudge kept)', exact)
  check('CHF shadow macro = its rate score', r.chf.macro === sh.scores.CHF)
  const u = r.pairs.find(p => p.pair === 'USDCHF')
  check('USDCHF actual REDIST → shadow FULL', u.actual.basis === 'REDIST' && u.shadow.basis === 'FULL')
  check('log block has three lines', formatChfShadow(r).split('\n').length === 3)
}
{
  const old = { value: 0.6, change: 0, date: '2025-07-31', history: [0, 1, 2, 3, 4].map(i => ({ d: `2025-07-${31 - i}`, v: 0.6 })) }
  const r = runChfShadow({ chfRate: old, rates, macroRate, scores, weights, pairs: ['EURUSD', 'USDCHF'].map(p => actualFor(p, null, market(1.1))) })
  check('stale CHF → dropped, no shifts', r.chf.rateScore === null && /stale/.test(r.chf.dropped || '') && Object.keys(r.shift).length === 0)
}
check('resultingDirection: OPEN/CLOSE/HOLD/HOLD_FLAT', resultingDirection('OPEN', { direction: 'BUY' }, null) === 'BUY'
  && resultingDirection('CLOSE', {}, { direction: 'SELL' }) === 'FLAT'
  && resultingDirection('HOLD', {}, { direction: 'SELL' }) === 'SELL'
  && resultingDirection('HOLD_FLAT', {}, null) === 'FLAT')

// ── 3. observeFeeds is a pass-through; runChfShadowAfter skips instead of guessing ──
{
  const R = { USD: { value: 1 } }, M = { price: 1.1 }
  const orig = { getRates: async () => R, getPairMarket: async (p) => (p === 'EURUSD' ? M : null), updateRunning: async () => 'x', other: 42 }
  const { feeds, seen } = observeFeeds(orig)
  const r1 = await feeds.getRates(), m1 = await feeds.getPairMarket('EURUSD'), m2 = await feeds.getPairMarket('GBPUSD')
  check('observeFeeds returns the SAME references', r1 === R && m1 === M && m2 === null)
  check('observeFeeds records what the engine received', seen.rates === R && seen.markets.EURUSD === M && seen.markets.GBPUSD === null)
  check('observeFeeds keeps every other feed untouched', feeds.updateRunning === orig.updateRunning && feeds.other === 42)
  const noRates = observeFeeds({ getPairMarket: orig.getPairMarket })
  check('observeFeeds does not invent a missing getRates', noRates.feeds.getRates === undefined)
  let threw = false
  try { await observeFeeds({ getRates: async () => { throw new Error('boom') } }).feeds.getRates() } catch (e) { threw = e.message === 'boom' }
  check('observeFeeds propagates the original error unchanged', threw)
}
{
  const out = { regime: REGIMES.eventHeavy.label, scores, macro_rate: macroRate, results: [{ pair: 'EURUSD', action: 'HOLD', direction: 'SELL', diff: -1, grade: 'B', confidence: 66, macro_basis: 'FULL' }] }
  const seen = { rates, markets: { EURUSD: market(1.1) } }
  const t0 = Date.now()
  check('skip: no CHF rate', runChfShadowAfter({ out, preStates: [], seen, chfRate: null, runStartedAt: t0 }).skipped === 'no CHF rate')
  check('skip: pre-run read raced the run', /raced/.test(runChfShadowAfter({ out, preStates: [{ pair: 'EURUSD', updated_at: new Date(t0 + 5).toISOString() }], seen, chfRate: series(0.65, 4), runStartedAt: t0 }).skipped || ''))
  check('skip: unknown regime', /unknown regime/.test(runChfShadowAfter({ out: { ...out, regime: 'nope' }, preStates: [], seen, chfRate: series(0.65, 4), runStartedAt: t0 }).skipped || ''))
  const ok = runChfShadowAfter({ out, preStates: [{ pair: 'EURUSD', direction: 'SELL', status: 'running', updated_at: new Date(t0 - 1000).toISOString() }], seen, chfRate: series(0.65, 4), runStartedAt: t0 })
  check('after-run: HOLD keeps the pre-run direction as "actual"', ok.pairs?.[0]?.actual.direction === 'SELL', JSON.stringify(ok))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
