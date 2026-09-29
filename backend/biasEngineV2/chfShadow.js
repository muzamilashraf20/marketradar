// CHF SHADOW — "what would the engine have decided if CHF were in the rate cross-section?"
//
// Observation only. Nothing here is fed back into the run: no scores, no decisions, no state, no DB
// writes. The caller logs the result and banks it (index.js, app_state `chf_shadow_v2`) so that after
// ~2 weeks shadow USDCHF can be compared with real outcomes, along with how many OTHER pairs' decisions
// adding CHF would have changed.
//
// Why a shadow at all: the SNB stopped publishing daily 2Y Confederation yields after 2025-07-31. The
// only free daily CHF government yield left is the SNB's 10-YEAR spot rate (RSS series R10). That is a
// weaker proxy than GBP's 5Y — the Swiss 10Y trades with global duration, the 2Y sits on the policy
// rate — and adding ANY currency shifts the cross-sectional mean, which moves every currency's score.
//
// Method (no model call — the shadow cannot re-run Sonnet):
//   1. Re-run computeMacroRateScores over the live cross-section + CHF (same method, same bands).
//   2. Each currency's shadow macro = the model's actual macro score + (shadow rate score − actual rate
//      score): the model's ±1 nudge is kept, only the code-computed rate part moves. A currency that had
//      NO rate score before (CHF; or every currency if CHF lifts an INSUFFICIENT cross-section) takes the
//      shadow rate score as-is. Clamped to the model's −5..+5 scale.
//   3. Each pair: the engine's own pairComposite → decide → computeConfidence, plus a read-only mirror
//      of runEngine's conviction floor. Compare the resulting direction/grade with what actually ran.

const CLAMP = (x) => Math.max(-5, Math.min(5, x))

// Direction a pair holds AFTER an action, given its pre-run state.
export function resultingDirection(action, d, state) {
  if (action === 'OPEN' || action === 'FLIP') return d.direction
  if (action === 'CLOSE') return 'FLAT'
  if (action === 'HOLD') return state?.direction || 'FLAT'
  return 'FLAT'   // HOLD_FLAT
}

// Read-only mirror of runEngine's CONVICTION FLOOR (the HOLD → CLOSE rule). Keep in step with
// biasEngine.js runEngine; this copy exists only for the shadow and goes when the shadow does.
function applyFloor(state, action, conf, price, { CONFIG, isInvalidated }) {
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

/**
 * @param chfRate    { value, date, history: [{d, v}] newest first } — SNB R10 (10y) daily
 * @param rates      the live rates object the engine used (CHF is NOT in it)
 * @param macroRate  the live computeMacroRateScores result
 * @param scores     the model's per-currency { macro, orderflow, sentiment }
 * @param weights    regime weights
 * @param pairs      [{ pair, base, quote, state, market, actual: { diff, action, direction, grade, confidence } }]
 * @param h          engine helpers: { computeMacroRateScores, pairComposite, decide, computeConfidence,
 *                   isInvalidated, CONFIG, RATE_XSECTION }
 */
export function runChfShadow({ chfRate, rates, macroRate, scores, weights, pairs }, h) {
  const xs = [...h.RATE_XSECTION, 'CHF']
  const shadowRate = h.computeMacroRateScores({ ...rates, CHF: chfRate }, xs)

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
    const sp = h.pairComposite(shadowScores, weights, p.base, p.quote, shadowRate)
    const d = h.decide(p.state, sp.diff, p.market)
    const conf = h.computeConfidence({
      diff: sp.diff,
      baseScores: shadowScores[p.base],
      quoteScores: shadowScores[p.quote],
      adrUsedPct: (p.market.adrUsedPct ?? 0) * 100,
    })
    const action = applyFloor(p.state, d.action, conf, p.market.price, h)
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

// One compact block for the run log.
export function formatChfShadow(r) {
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
