// Test vectors for the data-phase budget timer.
//   node backend/scripts/withBudget.test.js
//
// Imports lib/withBudget.js directly, so these exercise the shipped function rather than a copy.
// Clock is scaled 100x down from production (200ms budget stands in for 20s) so the suite runs fast.
//
// The bug being pinned: an unarmed-timer version logged "exceeded budget" on every healthy run,
// because Promise.race settles once but the losing timer kept running and fired during the model
// call. The payload was fine; the warning was not.

import { withBudget } from '../lib/withBudget.js'

const BUDGET = 200
let pass = 0, fail = 0
const rows = []
function check(name, got, want, note) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  rows.push({ ok, name, got, want, note: note || '' })
}

// Capture warnings so the tests can assert on what was logged, not just what was returned.
const warnings = []
const realWarn = console.warn
console.warn = (...a) => { warnings.push(a.join(' ')) }
const budgetWarnings = () => warnings.filter(w => w.includes('exceeded')).length
const failWarnings = () => warnings.filter(w => w.includes('failed:')).length

const after = (ms, v) => new Promise(r => setTimeout(() => r(v), ms))
const rejectAfter = (ms, msg) => new Promise((_, rj) => setTimeout(() => rj(new Error(msg)), ms))

// ── 1. Fast fetch: the normal case, and the one that was polluting the logs ────
{
  warnings.length = 0
  const timings = {}
  const v = await withBudget(after(20, { real: 'yields 2Y 4.239%' }), BUDGET, 'yields', timings)
  check('fast fetch returns real data', v, { real: 'yields 2Y 4.239%' })
  check('fast fetch records its own elapsed', timings.yields < 100, true, `${timings.yields}ms`)
  check('fast fetch warns 0 times immediately', budgetWarnings(), 0)
  // Wait past the budget: the old code logged here, on every healthy run.
  await after(BUDGET + 120)
  check('fast fetch STILL warns 0 after the budget elapses', budgetWarnings(), 0, 'the regression')
  check('value unchanged after budget elapsed', v, { real: 'yields 2Y 4.239%' })
  check('timings unchanged after budget elapsed', timings.yields < 100, true)
}

// ── 2. Genuine timeout: the warning must survive ───────────────────────────────
{
  warnings.length = 0
  const timings = {}
  const v = await withBudget(after(BUDGET + 300, { real: 'too late' }), BUDGET, 'crossAsset', timings)
  check('slow fetch returns null', v, null)
  check('slow fetch warns exactly once', budgetWarnings(), 1, 'genuine timeout still reported')
  check('warning names the right source', warnings.some(w => w.includes('crossAsset')), true)
  check('slow fetch records ~the budget', timings.crossAsset >= BUDGET, true, `${timings.crossAsset}ms`)
  await after(400)
  check('slow fetch does not warn twice', budgetWarnings(), 1, 'late resolve is a no-op')
}

// ── 3. Rejected fetch: no phantom timeout warning 20s later ────────────────────
{
  warnings.length = 0
  const timings = {}
  const v = await withBudget(rejectAfter(20, 'ECONNREFUSED'), BUDGET, 'cot', timings)
  check('rejected fetch returns null', v, null)
  check('rejected fetch logs the failure', failWarnings(), 1)
  check('rejected fetch warns 0 budget warnings', budgetWarnings(), 0)
  await after(BUDGET + 120)
  check('rejected fetch STILL warns 0 after budget', budgetWarnings(), 0, 'finally disarms on reject too')
}

// ── 4. One slow source must not implicate the others ───────────────────────────
// The reported symptom was all seven firing together. This is the shape of a real data phase.
{
  warnings.length = 0
  const timings = {}
  const [pairs, crossAsset, yields, cot, leading] = await Promise.all([
    withBudget(after(30, ['EURUSD']), BUDGET, 'pairs', timings),
    withBudget(after(BUDGET + 300, 'late'), BUDGET, 'crossAsset', timings),   // the only slow one
    withBudget(after(15, { y2: 4.239 }), BUDGET, 'yields', timings),
    withBudget(after(10, { rows: 10 }), BUDGET, 'cot', timings),
    withBudget(after(25, { prints: 7 }), BUDGET, 'leadingIndicators', timings),
  ])
  check('slow source is null', crossAsset, null)
  check('fast sources keep their data', [pairs, yields, cot, leading], [['EURUSD'], { y2: 4.239 }, { rows: 10 }, { prints: 7 }])
  check('exactly ONE warning, not five', budgetWarnings(), 1)
  check('and it names only crossAsset', warnings.filter(w => w.includes('exceeded')).every(w => w.includes('crossAsset')), true)
  await after(400)
  check('still exactly one after everything settles', budgetWarnings(), 1)
}

console.warn = realWarn
const w = Math.max(...rows.map(r => r.name.length))
console.log('\nBUDGET TIMER')
console.log('─'.repeat(Math.min(110, w + 46)))
for (const r of rows) {
  console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name.padEnd(w)} → ${String(r.got).padEnd(10)} ${r.ok ? '' : `want ${r.want}  `}${r.note}`)
}
console.log(`\n${'═'.repeat(70)}`)
console.log(fail ? `❌ ${fail} FAILED, ${pass} passed` : `✅ all ${pass} vectors pass`)

// A pending timer keeps Node's event loop alive. If any timer were left armed, this process would
// hang here instead of exiting — so a clean exit is itself part of the assertion.
console.log('exiting immediately below = no timer left armed')
process.exitCode = fail ? 1 : 0
