// CHF SHADOW — "what would the engine have decided if CHF were in the rate cross-section?"
//
// Runs ENTIRELY OUTSIDE the engine. biasEngine.js is untouched by it (byte-identical to 8b7fec6):
// index.js calls runChfShadowAfter() only after runEngine() has returned, inside try/catch. The engine
// never sees CHF, never waits on the shadow, and a shadow error can only skip the shadow.
//
// Why a shadow: the SNB stopped publishing daily 2Y Confederation yields after 2025-07-31. The only
// free daily CHF government yield left is the SNB's 10-YEAR spot rate (RSS series R10) — a weaker
// proxy than GBP's 5Y — and adding ANY currency shifts the cross-sectional mean, which moves every
// currency's macro score. So: observe for ~2 weeks, then decide with evidence.
//
// Method (no model call — the shadow cannot re-run Sonnet):
//   1. Re-score the rate cross-section with CHF added (same method, same bands).
//   2. Each currency's shadow macro = the model's actual macro + (shadow rate score − actual rate score):
//      the model's ±1 nudge is kept, only the code-computed rate part moves. A currency that had NO
//      rate score before (CHF; or everyone, if CHF lifts an INSUFFICIENT cross-section) takes the shadow
//      rate score as-is. Clamped to the model's −5..+5.
//   3. Each pair: pairComposite → the engine's own decide() → computeConfidence, plus a mirror of the
//      conviction floor, compared with what actually ran.
//
// COPIES: computeMacroRateScores (+ its constants), pairComposite and computeConfidence are NOT
// exported by biasEngine.js, so exact copies live below. scripts/chfShadow.test.mjs cuts the originals
// out of biasEngine.js source and asserts these copies return identical results — if the engine's
// versions ever change, that test fails. decide / isInvalidated / CONFIG / REGIMES are the engine's
// own exports, used directly.

import { CONFIG, REGIMES, decide, isInvalidated } from './biasEngine.js'

// ── copies of biasEngine.js (8b7fec6) — keep in step; parity-tested ─────────────────────────────
const RATE_XSECTION = ['USD', 'EUR', 'JPY', 'CAD', 'AUD', 'GBP', 'NZD']
const RATE_LOOKBACK = 3
const RATE_MIN_XSECTION = 4
const RATE_FLOOR_BPS = 3.0
const RATE_SHADOW_FLOOR_BPS = 6.9
const RATE_MAX_STALE_SESSIONS = 3
const RATE_BANDS = [
  { max: 2, score: 0 }, { max: 4, score: 1 }, { max: 7, score: 2 },
  { max: 11, score: 3 }, { max: 16, score: 4 }, { max: Infinity, score: 5 },
]
function bandScore(devBps) {
  const s = RATE_BANDS.find((b) => Math.abs(devBps) < b.max).score
  return devBps < 0 ? -s : s
}
// The engine's computeMacroRateScores with the cross-section as a parameter (the engine's is fixed to
// RATE_XSECTION). With xsection = RATE_XSECTION it is the engine's function exactly.
function computeMacroRateScores(rates, xsection = RATE_XSECTION) {
  const changes = {}, dropped = {}
  for (const c of xsection) {
    const h = rates?.[c]?.history
    if (!Array.isArray(h) || h.length < RATE_LOOKBACK + 1) { dropped[c] = `history ${h?.length ?? 0}/${RATE_LOOKBACK + 1}`; continue }
    const ageDays = Math.floor((Date.now() - new Date(h[0].d + 'T00:00:00Z').getTime()) / 86400000)
    if (ageDays > RATE_MAX_STALE_SESSIONS + 4) { dropped[c] = `stale ${ageDays}d`; continue }
    changes[c] = +((h[0].v - h[RATE_LOOKBACK].v) * 100).toFixed(2)
  }
  const present = Object.keys(changes)
  const base = {
    scores: Object.fromEntries(xsection.map((c) => [c, null])),
    xsection: present, dropped, bps: changes,
    spread: null, mean: null, floor: null, shadow_floor: null,
  }
  if (present.length < RATE_MIN_XSECTION) {
    return { ...base, status: 'INSUFFICIENT', reason: `xsection ${present.length} < ${RATE_MIN_XSECTION}` }
  }
  const vals = present.map((c) => changes[c])
  const mean = vals.reduce((s, x) => s + x, 0) / vals.length
  const spread = +(Math.max(...vals) - Math.min(...vals)).toFixed(2)
  const shadow = spread < RATE_SHADOW_FLOOR_BPS ? 'WOULD_BLOCK' : 'WOULD_PASS'
  if (spread < RATE_FLOOR_BPS) {
    const scores = Object.fromEntries(xsection.map((c) => [c, present.includes(c) ? 0 : null]))
    return { ...base, scores, spread, mean: +mean.toFixed(2), status: 'FLOOR_FLAT', floor: 'BLOCKED', shadow_floor: shadow }
  }
  const scores = Object.fromEntries(
    xsection.map((c) => [c, present.includes(c) ? bandScore(+(changes[c] - mean).toFixed(2)) : null]),
  )
  return { ...base, scores, spread, mean: +mean.toFixed(2), status: 'OK', floor: 'PASSED', shadow_floor: shadow }
}
const MACRO_RATE_EXEMPT = new Set(['XAU'])
function pairComposite(scores, weights, base, quote, macroRate) {
  const legMacroNull = (c) => !MACRO_RATE_EXEMPT.has(c) && macroRate?.scores?.[c] == null
  const macroNull = legMacroNull(base) || legMacroNull(quote)
  const w = macroNull
    ? { w1: 0, w2: weights.w2 / (weights.w2 + weights.w3), w3: weights.w3 / (weights.w2 + weights.w3) }
    : weights
  const of = (c) => {
    const s = scores[c] || { macro: 0, orderflow: 0, sentiment: 0 }
    return w.w1 * (s.macro ?? 0) + w.w2 * (s.orderflow ?? 0) + w.w3 * (s.sentiment ?? 0)
  }
  const nulls = [base, quote].filter(legMacroNull)
  const sb = scores[base] || { macro: 0, orderflow: 0, sentiment: 0 }
  const sq = scores[quote] || { macro: 0, orderflow: 0, sentiment: 0 }
  const contrib = {
    m: +(w.w1 * ((sb.macro ?? 0) - (sq.macro ?? 0))).toFixed(3),
    o: +(w.w2 * ((sb.orderflow ?? 0) - (sq.orderflow ?? 0))).toFixed(3),
    s: +(w.w3 * ((sb.sentiment ?? 0) - (sq.sentiment ?? 0))).toFixed(3),
  }
  return { diff: of(base) - of(quote), basis: macroNull ? 'REDIST' : 'FULL', weights: w, nullLegs: nulls, contrib }
}
function computeConfidence({ diff, baseScores, quoteScores, adrUsedPct }) {
  const mag = Math.abs(diff)
  let conf = mag >= CONFIG.OPEN_THRESHOLD
    ? 60 + Math.min(28, (mag - CONFIG.OPEN_THRESHOLD) * 10.4)
    : 45 + (mag / CONFIG.OPEN_THRESHOLD) * 15
  const sign = diff > 0 ? 1 : diff < 0 ? -1 : 0
  const comps = ['macro', 'orderflow', 'sentiment']
  let agree = 0, against = 0
  if (sign !== 0) {
    for (const k of comps) {
      const net = (baseScores?.[k] ?? 0) - (quoteScores?.[k] ?? 0)
      if (net === 0) continue
      if (Math.sign(net) === sign) agree++; else against++
    }
    conf += agree * 4 - against * 6
  }
  const confidenceBeforeTiming = Math.max(40, Math.min(92, Math.round(conf)))
  const adr = adrUsedPct ?? 0
  let timing = 'FRESH'
  if (adr >= 80) { conf -= 12; timing = 'LATE' }
  else if (adr >= 60) { conf -= 6; timing = 'EXTENDED' }
  conf = Math.max(40, Math.min(92, Math.round(conf)))
  let grade
  if (conf >= 82 && timing === 'FRESH') grade = 'A'
  else if (conf >= 74) grade = timing === 'LATE' ? 'B' : 'A-'
  else if (conf >= 64) grade = timing === 'LATE' ? 'C' : 'B'
  else if (conf >= 55) grade = 'C'
  else grade = 'D'
  return { confidence: conf, confidenceBeforeTiming, grade, timing, agree, against }
}
// ── end of copies ─────────────────────────────────────────────────────────────────────────────────

const CLAMP = (x) => Math.max(-5, Math.min(5, x))

// Direction a pair holds AFTER an action, given its pre-run state.
export function resultingDirection(action, d, state) {
  if (action === 'OPEN' || action === 'FLIP') return d.direction
  if (action === 'CLOSE') return 'FLAT'
  if (action === 'HOLD') return state?.direction || 'FLAT'
  return 'FLAT'   // HOLD_FLAT
}

// Read-only mirror of runEngine's CONVICTION FLOOR (HOLD → CLOSE after two sub-floor runs).
function applyFloor(state, action, conf, price) {
  if (!state || state.direction === 'FLAT') return action
  if (action !== 'HOLD' && action !== 'HOLD_FLAT') return action
  if (conf.confidenceBeforeTiming >= CONFIG.MIN_HOLD_CONFIDENCE) return action
  const dir = state.direction
  const inProfit = state.entry_price == null ? false
    : dir === 'BUY' ? price > state.entry_price
    : dir === 'SELL' ? price < state.entry_price
    : false
  const breached = isInvalidated(dir, price, state.invalidation_level)
  if (inProfit && !breached) return action
  return (state.low_conf_streak ?? 0) + 1 >= 2 ? 'CLOSE' : action
}

// Pass-through wrapper for the feeds object handed to runEngine: records the rates and per-pair market
// the engine RECEIVED, returning the very same values (same references) — nothing is altered, added or
// awaited beyond the original call.
export function observeFeeds(feeds) {
  const seen = { rates: null, markets: {} }
  const wrapped = { ...feeds }
  if (typeof feeds.getRates === 'function') wrapped.getRates = async (...a) => { const r = await feeds.getRates(...a); seen.rates = r; return r }
  if (typeof feeds.getPairMarket === 'function') wrapped.getPairMarket = async (pair, ...a) => { const m = await feeds.getPairMarket(pair, ...a); seen.markets[pair] = m; return m }
  return { feeds: wrapped, seen }
}

/**
 * Core shadow — pure. Never touches the engine, the DB or the network.
 * @param chfRate    { value, date, history: [{d, v}] newest first } — SNB R10 (10y) daily
 * @param rates      the rates object the engine received (CHF is NOT in it)
 * @param macroRate  the engine's macro_rate result
 * @param scores     the model's per-currency scores the engine used
 * @param weights    regime weights
 * @param pairs      [{ pair, base, quote, state, market, actual: { diff, action, direction, grade, confidence, basis } }]
 */
export function runChfShadow({ chfRate, rates, macroRate, scores, weights, pairs }) {
  const xs = [...RATE_XSECTION, 'CHF']
  const shadowRate = computeMacroRateScores({ ...rates, CHF: chfRate }, xs)

  const currencies = new Set([...Object.keys(scores || {}), 'CHF'])
  const shift = {}
  const shadowScores = {}
  for (const c of currencies) {
    const s = scores?.[c] || { macro: 0, orderflow: 0, sentiment: 0 }
    const before = macroRate?.scores?.[c] ?? null
    const after = shadowRate.scores?.[c] ?? null
    let macro = s.macro ?? 0
    if (after != null && before != null) macro = CLAMP(macro + (after - before))
    else if (after != null) macro = CLAMP(after)
    shadowScores[c] = { ...s, macro }
    if (before !== after || (s.macro ?? 0) !== macro) shift[c] = { rate: [before, after], macro: [s.macro ?? 0, macro] }
  }

  const out = []
  for (const p of pairs) {
    const sp = pairComposite(shadowScores, weights, p.base, p.quote, shadowRate)
    const d = decide(p.state, sp.diff, p.market)
    const conf = computeConfidence({
      diff: sp.diff,
      baseScores: shadowScores[p.base],
      quoteScores: shadowScores[p.quote],
      adrUsedPct: (p.market.adrUsedPct ?? 0) * 100,
    })
    const action = applyFloor(p.state, d.action, conf, p.market.price)
    const direction = resultingDirection(action, d, p.state)
    const grade = direction === 'FLAT' ? null : conf.grade
    const actualGrade = p.actual.direction === 'FLAT' ? null : p.actual.grade
    const dirChanged = direction !== p.actual.direction
    const gradeChanged = !dirChanged && direction !== 'FLAT' && grade !== actualGrade
    out.push({
      pair: p.pair,
      price: p.market.price ?? null,
      actual: { diff: +(+p.actual.diff).toFixed(2), action: p.actual.action, direction: p.actual.direction, grade: actualGrade, basis: p.actual.basis ?? null },
      shadow: { diff: +sp.diff.toFixed(2), action, direction, grade, basis: sp.basis },
      changed: dirChanged ? 'direction' : gradeChanged ? 'grade' : null,
    })
  }

  const hist = chfRate?.history || []
  return {
    at: new Date().toISOString(),
    chf: {
      source: 'SNB R10 (10y spot, proxy)',
      level: chfRate?.value ?? null,
      date: chfRate?.date ?? null,
      bps3: shadowRate.bps?.CHF ?? null,
      dropped: shadowRate.dropped?.CHF ?? (hist.length ? null : 'no history'),
      rateScore: shadowRate.scores?.CHF ?? null,
      macro: shadowScores.CHF?.macro ?? null,
    },
    xsection: { actual: macroRate?.xsection?.length ?? 0, shadow: shadowRate.xsection.length, of: xs.length },
    mean: { actual: macroRate?.mean ?? null, shadow: shadowRate.mean ?? null },
    status: { actual: macroRate?.status ?? null, shadow: shadowRate.status },
    shift,
    pairs: out,
    changed: out.filter(x => x.changed).map(x => `${x.pair}:${x.changed}`),
  }
}

/**
 * After-run entry point used by index.js. Inputs are only what the engine already produced or received:
 * its return value, the pre-run bias_state_v2 rows, and the recorded feeds. Returns null (with a reason)
 * rather than guessing when an input is missing or the pre-run read is not trustworthy.
 */
export function runChfShadowAfter({ out, preStates, seen, chfRate, runStartedAt }) {
  if (!chfRate) return { skipped: 'no CHF rate' }
  if (!out?.results?.length || !out.scores || !seen?.rates) return { skipped: 'engine output incomplete' }
  const regime = Object.values(REGIMES).find(r => r.label === out.regime)
  if (!regime) return { skipped: `unknown regime ${out.regime}` }
  // The pre-run read is fired alongside the engine; if it somehow saw a row written by THIS run, the
  // baseline is not "pre-run" any more — skip rather than compare against the wrong state.
  const late = (preStates || []).find(s => s.updated_at && Date.parse(s.updated_at) >= runStartedAt)
  if (late) return { skipped: `pre-run state read raced the run (${late.pair})` }
  const byPair = new Map((preStates || []).map(s => [s.pair, s]))
  const pairs = []
  for (const r of out.results) {
    if (r.action === 'SKIP') continue
    const market = seen.markets[r.pair]
    if (!market) continue
    const state = byPair.get(r.pair) || null
    pairs.push({
      pair: r.pair, base: r.pair.slice(0, 3), quote: r.pair.slice(3, 6), state, market,
      actual: { diff: r.diff, action: r.action, direction: resultingDirection(r.action, { direction: r.direction }, state), grade: r.grade, confidence: r.confidence, basis: r.macro_basis },
    })
  }
  if (!pairs.length) return { skipped: 'no scored pairs' }
  return runChfShadow({ chfRate, rates: seen.rates, macroRate: out.macro_rate, scores: out.scores, weights: regime.weights, pairs })
}

// One compact block for the run log.
export function formatChfShadow(r) {
  if (!r || r.skipped) return `   [v2 chf-shadow] skipped: ${r?.skipped || 'no result'}`
  const f = (x) => (x == null ? 'null' : (x > 0 ? `+${x}` : `${x}`))
  const lines = []
  lines.push(`   [v2 chf-shadow] CHF ${r.chf.source}: level=${r.chf.level ?? 'n/a'} (${r.chf.date ?? 'n/a'}) bps3=${f(r.chf.bps3)}`
    + ` → rate=${f(r.chf.rateScore)} macro=${f(r.chf.macro)}${r.chf.dropped ? ` [dropped: ${r.chf.dropped}]` : ''}`
    + ` | xsection ${r.xsection.actual}→${r.xsection.shadow}/${r.xsection.of} mean ${r.mean.actual ?? 'n/a'}→${r.mean.shadow ?? 'n/a'}bps status ${r.status.actual}→${r.status.shadow}`)
  const sh = Object.entries(r.shift).map(([c, s]) => `${c} ${f(s.macro[0])}→${f(s.macro[1])}`).join(' ')
  lines.push(`   [v2 chf-shadow] macro shift: ${sh || 'none'}`)
  const pairTxt = r.pairs.map(p => {
    const a = `${p.actual.direction}${p.actual.grade ? ' ' + p.actual.grade : ''}`
    const s = `${p.shadow.direction}${p.shadow.grade ? ' ' + p.shadow.grade : ''}`
    return p.changed ? `${p.pair} ${a}→${s} (${p.changed}, diff ${f(p.actual.diff)}→${f(p.shadow.diff)})` : null
  }).filter(Boolean)
  lines.push(`   [v2 chf-shadow] ${pairTxt.length ? `WOULD CHANGE: ${pairTxt.join(' | ')}` : 'no pair decision would change'}`)
  return lines.join('\n')
}

// Exposed for the parity test only.
export const __copies = { computeMacroRateScores, pairComposite, computeConfidence, RATE_XSECTION }
