// Test vectors for the release-actuals value parser and acceptance gate.
//   node backend/scripts/releaseValue.test.js
//
// Every string marked LIVE below was actually returned by the search in production or observed on
// the ForexFactory feed — these are not invented cases. Three defects were found this way that
// reading the code did not reveal, so this table runs before any change to the parsing or gating
// path ships. It requires lib/releaseValue.js directly, so it exercises the shipped code.

import {
  parseReleaseValue, normalizePeriod, expectedPeriodFor,
  validateReleaseValue, validateReleaseResult, surpriseOf,
} from '../lib/releaseValue.js'

let pass = 0, fail = 0
const rows = []
function check(group, input, got, want, note) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  rows.push({ group, ok, input, got, want, note: note || '' })
}
function table(group) {
  const rs = rows.filter(r => r.group === group)
  const w = Math.max(...rs.map(r => String(r.input).length), 5)
  console.log(`\n${group}`)
  console.log('─'.repeat(Math.min(110, w + 60)))
  for (const r of rs) {
    console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${String(r.input).padEnd(w)} → ${String(r.got).padEnd(12)} ${r.ok ? '' : `want ${r.want}  `}${r.note}`)
  }
}

// Per-series plausibility ranges. Units differ per series on purpose — there is no shared
// assumption to get wrong: ADP is a count of jobs, the ISM family are diffusion indexes, CPI/PPI
// are percent changes.
const RANGE = {
  ADP: [-2_000_000, 2_000_000],
  ISM_MFG: [25, 80],
  ISM_SVC: [25, 80],
  ISM_MFG_PRICES: [25, 80],
  ISM_SVC_PRICES: [25, 80],
  // Prospective only — CPI/PPI are on FRED and are NOT searched. Kept here so the gate mechanism
  // is proven against percent-shaped series before anything like this is ever added.
  CPI_MM: [-3, 3],
  CPI_YY: [-5, 20],
}

// ── 1. Value parsing ───────────────────────────────────────────────────────────
const G1 = '1. VALUE PARSING — publisher strings → number'
check(G1, '"+0.3%"', parseReleaseValue('+0.3%'), 0.3, 'percent, signed')
check(G1, '"0.3 percent"', parseReleaseValue('0.3 percent'), 0.3, 'percent, word form')
check(G1, '"-0.1%"', parseReleaseValue('-0.1%'), -0.1, 'percent, negative')
check(G1, '"55.6 percent"', parseReleaseValue('55.6 percent'), 55.6, 'LIVE — ISM probe; bug #1')
check(G1, '"315.664"', parseReleaseValue('315.664'), 315.664, 'CPI index level — parses; range gate rejects it')
check(G1, '"+44,000"', parseReleaseValue('+44,000'), 44000, 'LIVE — ADP sweep; bug #3')
check(G1, '"-32,000"', parseReleaseValue('-32,000'), -32000, 'LIVE — the stale ADP print')
check(G1, '"68K"', parseReleaseValue('68K'), 68000, 'LIVE — FF forecast; bug #2 (was 68)')
check(G1, '"98K"', parseReleaseValue('98K'), 98000, 'LIVE — FF previous')
check(G1, '"54.0"', parseReleaseValue('54.0'), 54, 'LIVE — FF ISM forecast')
check(G1, '"70.0"', parseReleaseValue('70.0'), 70, 'LIVE — FF ISM prices forecast')
check(G1, '"42,000 jobs"', parseReleaseValue('42,000 jobs'), 42000, 'unit word stripped')
check(G1, '"53.3 index"', parseReleaseValue('53.3 index'), 53.3, 'unit word stripped')
check(G1, '"-0.4 percentage points"', parseReleaseValue('-0.4 percentage points'), -0.4, 'multiword unit')
check(G1, '"42 thousand"', parseReleaseValue('42 thousand'), null, 'word-form magnitude → REJECT, not 42')
check(G1, '"1.2 million"', parseReleaseValue('1.2 million'), null, 'word-form magnitude → REJECT')
check(G1, '"1.25M"', parseReleaseValue('1.25M'), 1250000, 'letter magnitude survives')
check(G1, '"n/a"', parseReleaseValue('n/a'), null, '')
check(G1, '""', parseReleaseValue(''), null, '')
check(G1, '"—"', parseReleaseValue('—'), null, '')
check(G1, 'null', parseReleaseValue(null), null, '')

// ── 2. Range gate per series ───────────────────────────────────────────────────
const G2 = '2. RANGE GATE — same value, different series'
const rg = (v, s) => { const r = validateReleaseValue(v, RANGE[s]); return r.ok ? r.numeric : 'REJECT' }
check(G2, '"70.0" as ISM_MFG_PRICES', rg('70.0', 'ISM_MFG_PRICES'), 70, 'in [25,80]')
check(G2, '"73.0" as ISM_SVC_PRICES', rg('73.0', 'ISM_SVC_PRICES'), 73, 'in [25,80]')
check(G2, '"55.6 percent" as ISM_MFG', rg('55.6 percent', 'ISM_MFG'), 55.6, 'in [25,80]')
check(G2, '"315.664" as ISM_MFG_PRICES', rg('315.664', 'ISM_MFG_PRICES'), 'REJECT', 'index level, not a PMI')
check(G2, '"12.0" as ISM_MFG_PRICES', rg('12.0', 'ISM_MFG_PRICES'), 'REJECT', 'below floor')
check(G2, '"315.664" as CPI_MM', rg('315.664', 'CPI_MM'), 'REJECT', 'THE index-vs-percent trap')
check(G2, '"+0.3%" as CPI_MM', rg('+0.3%', 'CPI_MM'), 0.3, 'in [-3,+3]')
check(G2, '"-0.1%" as CPI_MM', rg('-0.1%', 'CPI_MM'), -0.1, 'in [-3,+3]')
check(G2, '"4.2%" as CPI_MM', rg('4.2%', 'CPI_MM'), 'REJECT', 'y/y figure in an m/m slot')
check(G2, '"4.2%" as CPI_YY', rg('4.2%', 'CPI_YY'), 4.2, 'in [-5,+20]')
check(G2, '"315.664" as CPI_YY', rg('315.664', 'CPI_YY'), 'REJECT', 'index level')
check(G2, '"+44,000" as ADP', rg('+44,000', 'ADP'), 44000, 'thousands scale')
check(G2, '"55.6" as ADP', rg('55.6', 'ADP'), 55.6, 'in range — range alone cannot catch this')

// ── 3. Full acceptance gate ────────────────────────────────────────────────────
const G3 = '3. ACCEPTANCE GATE — full result objects'
const ADP_SCHED = '2026-08-05T12:15:00Z'
const ISM_SCHED = '2026-08-03T14:00:00Z'
const adpPeriod = expectedPeriodFor(ADP_SCHED)
const ismPeriod = expectedPeriodFor(ISM_SCHED)
const gate = (r, series, period, sched) => { const v = validateReleaseResult(r, RANGE[series], period, sched); return v.ok ? v.numeric : 'REJECT' }
const URL = 'https://example.gov/release'

check(G3, 'ADP stale Nov-2025 (LIVE)', gate({ status: 'found', value: '-32,000', reference_period: 'November 2025', release_date: '2025-12-03', source_url: URL }, 'ADP', adpPeriod, ADP_SCHED), 'REJECT', 'the case this gate exists for')
check(G3, 'ADP correct July-2026', gate({ status: 'found', value: '+44,000', reference_period: 'July 2026', release_date: '2026-08-05', source_url: URL }, 'ADP', adpPeriod, ADP_SCHED), 44000, 'LIVE value')
check(G3, 'ADP period as "2026-07"', gate({ status: 'found', value: '+44,000', reference_period: '2026-07', release_date: '2026-08-05', source_url: URL }, 'ADP', adpPeriod, ADP_SCHED), 44000, 'numeric period form')
check(G3, 'ADP right month, revision +21d', gate({ status: 'found', value: '+50,000', reference_period: 'July 2026', release_date: '2026-08-26', source_url: URL }, 'ADP', adpPeriod, ADP_SCHED), 'REJECT', 'want the initial print')
check(G3, 'ADP no source_url', gate({ status: 'found', value: '+44,000', reference_period: 'July 2026', release_date: '2026-08-05', source_url: '' }, 'ADP', adpPeriod, ADP_SCHED), 'REJECT', '')
check(G3, 'ADP model said not-available', gate({ status: 'not available', reason: 'no page found' }, 'ADP', adpPeriod, ADP_SCHED), 'REJECT', '')
check(G3, 'ISM headline 55.6 percent', gate({ status: 'found', value: '55.6 percent', reference_period: 'July 2026', release_date: '2026-08-03', source_url: URL }, 'ISM_MFG', ismPeriod, ISM_SCHED), 55.6, 'LIVE value')
check(G3, 'ISM prices 70.4', gate({ status: 'found', value: '70.4', reference_period: 'July 2026', release_date: '2026-08-03', source_url: URL }, 'ISM_MFG_PRICES', ismPeriod, ISM_SCHED), 70.4, 'Phase 2 companion')
check(G3, 'ISM prices given the headline', gate({ status: 'found', value: '55.6', reference_period: 'July 2026', release_date: '2026-08-03', source_url: URL }, 'ISM_MFG_PRICES', ismPeriod, ISM_SCHED), 55.6, 'both in [25,80] — range CANNOT separate these')
check(G3, 'ISM wrong month (June)', gate({ status: 'found', value: '53.0', reference_period: 'June 2026', release_date: '2026-08-03', source_url: URL }, 'ISM_MFG', ismPeriod, ISM_SCHED), 'REJECT', '')

// ── 4. Surprise ────────────────────────────────────────────────────────────────
const G4 = '4. SURPRISE — actual vs the FF forecast'
check(G4, 'ADP 44,000 vs 68K', surpriseOf(44000, '68K'), 'miss', 'LIVE — must not be "beat"')
check(G4, 'ADP -32,000 vs 68K', surpriseOf(-32000, '68K'), 'miss', '')
check(G4, 'ADP 70,000 vs 68K', surpriseOf(70000, '68K'), 'beat', '')
check(G4, 'ADP 68,000 vs 68K', surpriseOf(68000, '68K'), 'inline', '')
check(G4, 'ISM 55.6 vs 54.0', surpriseOf(55.6, '54.0'), 'beat', 'LIVE')
check(G4, 'ISM prices 70.4 vs 70.0', surpriseOf(70.4, '70.0'), 'beat', 'LIVE forecast')
check(G4, 'CPI m/m 0.3 vs "+0.2%"', surpriseOf(0.3, '+0.2%'), 'beat', 'signed forecast')
check(G4, 'forecast missing', surpriseOf(44000, null), null, 'no forecast → no surprise, never a guess')
check(G4, 'forecast unparseable', surpriseOf(44000, '42 thousand'), null, '')

// ── 5. Period normalization ────────────────────────────────────────────────────
const G5 = '5. PERIOD NORMALIZATION'
for (const [s, want] of [['July 2026', '2026-07'], ['2026-07', '2026-07'], ['Jul 2026', '2026-07'], ['July, 2026', '2026-07'], ['2026/7', '2026-07'], ['November 2025', '2025-11'], ['Q3 2026', null], ['', null]]) {
  check(G5, JSON.stringify(s), normalizePeriod(s), want, '')
}
check(G5, 'period for a 2026-08-05 release', expectedPeriodFor(ADP_SCHED).key, '2026-07', 'monthly → prior month')
check(G5, 'period for a 2026-01-05 release', expectedPeriodFor('2026-01-05T12:15:00Z').key, '2025-12', 'year rollover')

for (const g of [G1, G2, G3, G4, G5]) table(g)
console.log(`\n${'═'.repeat(70)}`)
console.log(fail ? `❌ ${fail} FAILED, ${pass} passed` : `✅ all ${pass} vectors pass`)
process.exit(fail ? 1 : 0)
