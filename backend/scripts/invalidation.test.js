// Test vectors for v2 pip sizing + invalidation level construction.
//   node backend/scripts/invalidation.test.js
//
// Imports biasEngineV2/biasEngine.js directly, so these exercise the shipped functions, not a copy.
//
// Three bugs being pinned:
//   1. pipFor listed JPY pairs one by one (`USDJPY: 0.01`), so any JPY CROSS fell through to the
//      0.0001 default — every level and pip figure on that cross out by a factor of 100.
//   2. invalidationLevel guarded PDL/PDH with `!= null`, but parseFloat on a malformed candle
//      returns NaN and `NaN != null` is TRUE, so it returned a NaN level. isInvalidated() reads a
//      non-finite level as "not breached" — such a bias could never be invalidated and ran forever.
//   3. The level was PDL/PDH ± a fixed 0.2 ADR cushion, so a bias opening next to yesterday's
//      extreme had its entire stop inside intrabar noise. 40% of biases opened under 0.25 ADR away
//      and were invalidated 53.2% of the time. MIN_INVALIDATION_ADR is the floor that fixes it.

import { CONFIG, pipFor, invalidationLevel, isInvalidated, inLevelBreakCooldown } from '../biasEngineV2/biasEngine.js'

let pass = 0, fail = 0
const rows = []
function check(name, got, want, note) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  rows.push({ ok, name, got, want, note: note || '' })
}

// Capture the fallback warning so we can assert it actually fires and names the pair.
const warnings = []
const realWarn = console.warn
console.warn = (...a) => { warnings.push(a.join(' ')) }

// ── pip sizing ──────────────────────────────────────────────────────────────
check('EURUSD pip', pipFor('EURUSD'), 0.0001)
check('GBPUSD pip', pipFor('GBPUSD'), 0.0001)
check('USDJPY pip', pipFor('USDJPY'), 0.01)
check('GBPJPY pip (cross)', pipFor('GBPJPY'), 0.01, 'was 0.0001 — 100x wrong')
check('EURJPY pip (cross)', pipFor('EURJPY'), 0.01, 'not in PAIRS today; must not break if added')
check('CADJPY pip (cross)', pipFor('CADJPY'), 0.01)
check('XAUUSD pip (override wins)', pipFor('XAUUSD'), 0.1)
check('unknown pair falls back', pipFor('ZZZZZZ'), 0.0001)
check('no JPY pair is left on the default', ['USDJPY', 'GBPJPY', 'EURJPY', 'AUDJPY', 'NZDJPY', 'CHFJPY', 'CADJPY'].every(p => pipFor(p) === 0.01), true)

// ── invalidation distance floor ─────────────────────────────────────────────
// GBPUSD-shaped: ADR 48 pips. Floor = 0.5 × 48 = 24 pips.
const near = { pair: 'GBPUSD', price: 1.3000, atr: 0.0048 * Math.sqrt(5), adr: 0.0048, pdl: 1.29970, pdh: 1.30030 }
const far = { pair: 'GBPUSD', price: 1.3000, atr: 0.0048 * Math.sqrt(5), adr: 0.0048, pdl: 1.2900, pdh: 1.3100 }
const pips = (a, b) => +(Math.abs(a - b) / 0.0001).toFixed(2)

check('BUY: PDL 3p away is pushed to the floor', pips(near.price, invalidationLevel('BUY', near)), 24)
check('SELL: PDH 3p away is pushed to the floor', pips(near.price, invalidationLevel('SELL', near)), 24)
check('BUY: distant PDL is KEPT, not tightened', invalidationLevel('BUY', far), 1.2900 - 0.2 * 0.0048)
check('SELL: distant PDH is KEPT, not tightened', invalidationLevel('SELL', far), 1.3100 + 0.2 * 0.0048)
check('floor never lands on the wrong side (BUY)', invalidationLevel('BUY', near) < near.price, true)
check('floor never lands on the wrong side (SELL)', invalidationLevel('SELL', near) > near.price, true)

// An inverted anchor (PDL above price) must still yield a level below price for a BUY.
const inverted = { pair: 'GBPUSD', price: 1.3000, atr: 0.0048 * Math.sqrt(5), adr: 0.0048, pdl: 1.3050, pdh: 1.2950 }
check('inverted PDL still gives a BUY level below price', invalidationLevel('BUY', inverted) < inverted.price, true)
check('inverted PDH still gives a SELL level above price', invalidationLevel('SELL', inverted) > inverted.price, true)

// JPY + gold scale through the same floor.
const jpy = { pair: 'USDJPY', price: 150.00, atr: 0.80 * Math.sqrt(5), adr: 0.80, pdl: 149.98, pdh: 150.02 }
check('USDJPY floor = 0.5 × 80 pips', +(Math.abs(jpy.price - invalidationLevel('BUY', jpy)) / 0.01).toFixed(2), 40)
const gold = { pair: 'XAUUSD', price: 3300, atr: 70 * Math.sqrt(5), adr: 70, pdl: 3299, pdh: 3301 }
check('XAUUSD floor = 0.5 × 700 pips', +(Math.abs(gold.price - invalidationLevel('BUY', gold)) / 0.1).toFixed(2), 350)

// ── non-finite anchor → ATR fallback, loudly ────────────────────────────────
warnings.length = 0
const bad = { pair: 'USDCAD', price: 1.3800, atr: 0.0050 * Math.sqrt(5), adr: 0.0050, pdl: NaN, pdh: NaN }
const badLevel = invalidationLevel('BUY', bad)
check('NaN PDL yields a FINITE level', Number.isFinite(badLevel), true, 'was NaN')
check('...and that level can actually invalidate', isInvalidated('BUY', badLevel - 0.0001, badLevel), true)
check('...via the ATR fallback distance', +(bad.price - badLevel).toFixed(8), +(CONFIG.ATR_INVALIDATION_MULT * bad.atr).toFixed(8))
check('fallback logs exactly one warning', warnings.length, 1)
check('...naming the pair', warnings[0].includes('USDCAD'), true)
check('...and the raw value', warnings[0].includes('NaN'), true)

warnings.length = 0
invalidationLevel('SELL', { ...bad, pdh: undefined })
check('undefined PDH also warns', warnings.length, 1)
check('...and says PDH, not PDL', warnings[0].includes('PDH'), true)

warnings.length = 0
invalidationLevel('BUY', far)
check('a healthy PDL logs nothing', warnings.length, 0)

// ── level-break cooldown ────────────────────────────────────────────────────
const now = Date.parse('2026-08-18T12:00:00Z')
const deadBuy = { status: 'closed', closed_reason: 'level_break', updated_at: '2026-08-18T10:00:00Z', entry_price: 1.30, invalidation_level: 1.29 }
const deadSell = { ...deadBuy, invalidation_level: 1.31 }
check('blocks same-direction re-entry inside the window', inLevelBreakCooldown(deadBuy, 'BUY', now), true)
check('allows the opposite direction', inLevelBreakCooldown(deadBuy, 'SELL', now), false)
check('infers SELL from a level above entry', inLevelBreakCooldown(deadSell, 'SELL', now), true)
check('expires after the window', inLevelBreakCooldown(deadBuy, 'BUY', now + (CONFIG.LEVEL_BREAK_COOLDOWN_H + 0.1) * 3600000), false)
check('ignores conviction_floor closes', inLevelBreakCooldown({ ...deadBuy, closed_reason: 'conviction_floor' }, 'BUY', now), false)
check('ignores a running bias', inLevelBreakCooldown({ ...deadBuy, status: 'running' }, 'BUY', now), false)
check('never blocks on a guess (no entry_price)', inLevelBreakCooldown({ ...deadBuy, entry_price: null }, 'BUY', now), false)
check('null state is safe', inLevelBreakCooldown(null, 'BUY', now), false)

console.warn = realWarn
const w = Math.max(...rows.map(r => r.name.length))
console.log('\nV2 PIP SIZING + INVALIDATION LEVEL')
console.log('─'.repeat(Math.min(110, w + 46)))
for (const r of rows) {
  console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name.padEnd(w)} → ${String(r.got).padEnd(10)} ${r.ok ? '' : `want ${r.want}  `}${r.note}`)
}
console.log(`\n${'═'.repeat(70)}`)
console.log(fail ? `❌ ${fail} FAILED, ${pass} passed` : `✅ all ${pass} vectors pass`)
process.exitCode = fail ? 1 : 0
