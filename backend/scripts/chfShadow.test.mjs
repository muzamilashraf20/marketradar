// Test vectors for biasEngineV2/chfShadow.js, driven through the engine's REAL pure helpers
// (computeMacroRateScores, pairComposite, decide, computeConfidence, isInvalidated, CONFIG).
//   node backend/scripts/chfShadow.test.mjs

import {
  computeMacroRateScores, pairComposite, decide, computeConfidence, isInvalidated, CONFIG, RATE_XSECTION, REGIMES,
} from '../biasEngineV2/biasEngine.js'
import { runChfShadow, formatChfShadow, resultingDirection } from '../biasEngineV2/chfShadow.js'

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`)
}
const H = { computeMacroRateScores, pairComposite, decide, computeConfidence, isInvalidated, CONFIG, RATE_XSECTION }

// Fresh dates, newest first: today, then previous weekdays.
const days = (() => { const out = []; const d = new Date(); while (out.length < 8) { if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1) } return out })()
// A series whose 3-session change is `bps` (history[0] − history[3]).
const series = (level, bps) => ({ value: level, change: 0, date: days[0], history: days.map((d, i) => ({ d, v: +(level - (i >= 3 ? bps / 100 : (bps / 100) * (i / 3))).toFixed(4) })) })

const rates = {
  USD: series(3.50, 10), EUR: series(2.00, 2), JPY: series(0.80, 0), CAD: series(2.70, 4),
  AUD: series(3.60, 6), GBP: series(3.90, 8), NZD: series(3.20, -2),
}
const macroRate = computeMacroRateScores(rates)
const weights = REGIMES.eventHeavy.weights

// Model scores: macro = the code rate score + a ±1 nudge on some, to prove the nudge is preserved.
const nudges = { USD: 0, EUR: 1, JPY: 0, CAD: -1, AUD: 0, GBP: 0, NZD: 0 }
const scores = {}
for (const c of RATE_XSECTION) scores[c] = { macro: (macroRate.scores[c] ?? 0) + nudges[c], orderflow: 1, sentiment: 0 }
scores.CHF = { macro: 0, orderflow: -1, sentiment: 1 }   // CHF macro: model's own guess (rate was null)
scores.XAU = { macro: 1, orderflow: 0, sentiment: 1 }

const market = (price) => ({ price, atr: 0.01, adr: 0.006, pdh: price + 0.004, pdl: price - 0.004, adrUsedPct: 0.3, isHighAtrWeek: false })
function actualFor(pair, state, mkt) {
  const base = pair.slice(0, 3), quote = pair.slice(3, 6)
  const pc = pairComposite(scores, weights, base, quote, macroRate)
  const d = decide(state, pc.diff, mkt)
  const conf = computeConfidence({ diff: pc.diff, baseScores: scores[base], quoteScores: scores[quote], adrUsedPct: mkt.adrUsedPct * 100 })
  return { pair, base, quote, state, market: mkt, actual: { diff: pc.diff, action: d.action, direction: resultingDirection(d.action, d, state), grade: conf.grade, confidence: conf.confidence, basis: pc.basis } }
}

// ── 1. basic shadow: CHF joins, shifts are exactly the rate-score deltas ─────────
{
  const chf = series(0.65, 12)   // strong CHF yield rise vs the pack
  const pairs = ['EURUSD', 'USDCHF', 'USDJPY', 'NZDUSD'].map(p => actualFor(p, null, market(1.1)))
  const snapshot = JSON.stringify({ rates, macroRate, scores, pairs })
  const r = runChfShadow({ chfRate: chf, rates, macroRate, scores, weights, pairs }, H)

  check('inputs are not mutated (rates, macroRate, scores, pairs)', JSON.stringify({ rates, macroRate, scores, pairs }) === snapshot)
  check('CHF gets a rate score in the shadow', typeof r.chf.rateScore === 'number', JSON.stringify(r.chf))
  check('shadow cross-section is live + CHF', r.xsection.actual === 7 && r.xsection.shadow === 8 && r.xsection.of === 8, JSON.stringify(r.xsection))
  check('CHF bps3 = 12', r.chf.bps3 === 12, String(r.chf.bps3))
  const sh = computeMacroRateScores({ ...rates, CHF: chf }, [...RATE_XSECTION, 'CHF'])
  let exact = true
  for (const c of RATE_XSECTION) {
    const want = Math.max(-5, Math.min(5, scores[c].macro + (sh.scores[c] - macroRate.scores[c])))
    const got = r.shift[c] ? r.shift[c].macro[1] : scores[c].macro
    if (got !== want) { exact = false; console.log(`      ${c}: want ${want} got ${got}`) }
  }
  check('every currency shifts by exactly its rate-score delta, nudge kept', exact)
  check('CHF shadow macro = its shadow rate score', r.chf.macro === sh.scores.CHF)
  const usdchf = r.pairs.find(p => p.pair === 'USDCHF')
  check('USDCHF actual is REDIST, shadow is FULL', usdchf.actual.basis === 'REDIST' && usdchf.shadow.basis === 'FULL', JSON.stringify(usdchf))
  check('mean moves once CHF joins', r.mean.actual !== r.mean.shadow, JSON.stringify(r.mean))
  const txt = formatChfShadow(r)
  check('log block has the three lines', txt.split('\n').length === 3 && /\[v2 chf-shadow\] CHF SNB R10/.test(txt) && /macro shift:/.test(txt))
  console.log(txt)
}

// ── 2. a decision change is detected and reported ───────────────────────────────
{
  // Make USD's shadow score fall hard vs CHF: the shadow diff for USDCHF should cross the threshold.
  const chf = series(0.65, 40)
  const pairs = [actualFor('USDCHF', null, market(0.83))]
  const r = runChfShadow({ chfRate: chf, rates, macroRate, scores, weights, pairs }, H)
  const p = r.pairs[0]
  const expectDir = Math.abs(p.shadow.diff) >= CONFIG.OPEN_THRESHOLD ? (p.shadow.diff > 0 ? 'BUY' : 'SELL') : 'FLAT'
  check('shadow direction follows the engine\'s own decide() on the shadow diff', p.shadow.direction === expectDir, JSON.stringify(p))
  check('changed flag set iff direction differs', (p.changed === 'direction') === (p.shadow.direction !== p.actual.direction), JSON.stringify(p))
  check('changed list mirrors pairs', r.changed.length === r.pairs.filter(x => x.changed).length)
}

// ── 3. a HELD bias: the floor mirror and HOLD direction ───────────────────────────
{
  const state = { direction: 'SELL', status: 'running', entry_price: 1.10, invalidation_level: 1.12, low_conf_streak: 1 }
  const pairs = [actualFor('EURUSD', state, market(1.105))]   // price above entry → SELL not in profit
  const r = runChfShadow({ chfRate: series(0.65, 0), rates, macroRate, scores, weights, pairs }, H)
  const p = r.pairs[0]
  check('held pair resolves to HOLD/CLOSE/FLIP only', ['HOLD', 'CLOSE', 'FLIP'].includes(p.shadow.action), JSON.stringify(p))
  check('HOLD keeps the held direction', p.shadow.action !== 'HOLD' || p.shadow.direction === 'SELL')
}

// ── 4. stale / missing CHF data → CHF dropped, nothing changes ─────────────────
{
  const old = { value: 0.6, change: 0, date: '2025-07-31', history: [0, 1, 2, 3, 4].map(i => ({ d: `2025-07-${31 - i}`, v: 0.6 })) }
  const pairs = ['EURUSD', 'USDCHF'].map(p => actualFor(p, null, market(1.1)))
  const r = runChfShadow({ chfRate: old, rates, macroRate, scores, weights, pairs }, H)
  check('stale CHF is dropped from the shadow cross-section', r.chf.rateScore === null && /stale/.test(r.chf.dropped || ''), JSON.stringify(r.chf))
  check('stale CHF → no currency shifts', Object.keys(r.shift).length === 0, JSON.stringify(r.shift))
  check('stale CHF → no decision changes', r.changed.length === 0, JSON.stringify(r.changed))
}

// ── 5. resultingDirection ─────────────────────────────────────────────────────────
check('OPEN → new direction', resultingDirection('OPEN', { direction: 'BUY' }, null) === 'BUY')
check('CLOSE → FLAT', resultingDirection('CLOSE', {}, { direction: 'SELL' }) === 'FLAT')
check('HOLD → held direction', resultingDirection('HOLD', {}, { direction: 'SELL' }) === 'SELL')
check('HOLD_FLAT → FLAT', resultingDirection('HOLD_FLAT', {}, null) === 'FLAT')

// ── 6. the live engine default is untouched ──────────────────────────────────────
{
  const a = computeMacroRateScores(rates)
  const b = computeMacroRateScores(rates, RATE_XSECTION)
  check('computeMacroRateScores default === explicit live cross-section', JSON.stringify(a) === JSON.stringify(b))
  check('live result has no CHF key', !('CHF' in a.scores))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
