// Pure value/period parsing and the release-actuals acceptance gate.
//
// These live in their own module for one reason: they are the part of the pipeline that keeps
// being wrong in ways reading the code does not reveal. Every defect found so far — "55.6 percent"
// rejected outright, "68K" silently parsed as 68, "+44,000" rejected on its sign — was a real
// publisher string that looked fine until it was run. They were caught by test vectors, not review.
//
// index.js requires this, and so does scripts/releaseValue.test.mjs, so the vectors exercise the
// code that actually ships rather than a copy that can drift away from it.

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Parse an economic print ("227K", "-0.3%", "3.2", "1.25M") into a number. Returns null when the
// value isn't comparable — the caller must then report no surprise rather than guess one.
function parseEconNum(s) {
  if (s === null || s === undefined) return null
  const t = String(s).trim().replace(/[,%$]/g, '').replace(/[<>]/g, '')
  if (!t || t === '-') return null
  const m = t.match(/^(-?\d*\.?\d+)\s*([KkMmBbTt])?$/)
  if (!m) return null
  const n = parseFloat(m[1])
  if (isNaN(n)) return null
  const mult = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[(m[2] || '').toLowerCase()] || 1
  return n * mult
}

// Strip ONLY non-numeric unit words. Magnitude suffixes (K/M/B/T) must survive — parseEconNum
// applies their multiplier, and eating the "K" off the FF forecast "68K" would silently turn
// 68,000 into 68 and flip a miss into a beat. Word-form magnitudes ("42 thousand") are deliberately
// left unparseable: returning null makes the gate reject, which beats a silent 1000x error.
const RELEASE_UNIT_WORDS = /\s*(percentage points?|percent|points?|pts?|index|jobs)\.?$/i

function parseReleaseValue(v) {
  if (v === null || v === undefined) return null
  // Leading "+" too: publishers sign a gain explicitly ("+44,000"), and parseEconNum accepts a
  // leading "-" but not a "+". Stripping it is lossless — the sign is implied by the absence of "-".
  const stripped = String(v).trim().replace(/^\+/, '').replace(RELEASE_UNIT_WORDS, '').trim()
  return parseEconNum(stripped)
}

// Normalize whatever the model calls the period ("July 2026", "2026-07", "Jul 2026") to YYYY-MM.
function normalizePeriod(text) {
  const s = String(text || '').trim()
  let m = s.match(/(\d{4})[-/](\d{1,2})/)
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, '0')}`
  // Optional comma between month and year: "July, 2026" is as natural a phrasing as "July 2026",
  // and without this the period check rejects a result that is otherwise entirely correct.
  m = s.match(/([A-Za-z]{3,9})\.?,?\s+(\d{4})/)
  if (m) {
    const i = MONTH_NAMES.findIndex(n => n.toLowerCase().startsWith(m[1].toLowerCase().slice(0, 3)))
    if (i >= 0) return `${m[2]}-${String(i + 1).padStart(2, '0')}`
  }
  return null
}

// A monthly print published in month M covers month M-1.
function expectedPeriodFor(scheduledAt) {
  const d = new Date(scheduledAt)
  let y = d.getUTCFullYear(), m = d.getUTCMonth() - 1
  if (m < 0) { m = 11; y -= 1 }
  return { key: `${y}-${String(m + 1).padStart(2, '0')}`, name: MONTH_NAMES[m], year: y }
}

function nextReleaseAfter(scheduledAt) {
  const n = new Date(scheduledAt); n.setUTCMonth(n.getUTCMonth() + 1); return n.toISOString()
}

// ── The acceptance gate ──
// This is CODE, not prompt, on purpose. A stale answer satisfies every rule a guard prompt can
// state: the model really did retrieve that page and really can cite it. Only an independent check
// against the release we triggered on catches it, and it is anchored to that event's scheduled
// time rather than to "now" — tighter, and it means the same figure read three weeks later is
// still judged against the release it belongs to.
const RELEASE_DATE_TOLERANCE_DAYS = 3

function validateReleaseValue(rawValue, range) {
  const n = parseReleaseValue(rawValue)
  if (n === null) return { ok: false, reason: `unparseable value ${JSON.stringify(String(rawValue))}` }
  if (n < range[0] || n > range[1]) return { ok: false, reason: `value ${n} outside plausible range ${range[0]}..${range[1]}` }
  return { ok: true, numeric: n }
}

function validateReleaseResult(result, range, period, scheduledAt) {
  if (!result || result.status !== 'found') return { ok: false, reason: `model returned not-available: ${String(result?.reason || 'no reason').slice(0, 140)}` }
  const relD = new Date(result.release_date)
  if (isNaN(relD)) return { ok: false, reason: `unparseable release_date "${result.release_date}"` }
  const driftDays = Math.abs(relD.getTime() - new Date(scheduledAt).getTime()) / 86400000
  if (driftDays > RELEASE_DATE_TOLERANCE_DAYS) {
    return { ok: false, reason: `release_date ${result.release_date} is ${Math.round(driftDays)}d from the scheduled release ${String(scheduledAt).slice(0, 10)}` }
  }
  const got = normalizePeriod(result.reference_period)
  if (got !== period.key) return { ok: false, reason: `reference_period "${result.reference_period}" (${got || 'unparseable'}) is not the expected ${period.key}` }
  const v = validateReleaseValue(result.value, range)
  if (!v.ok) return v
  if (!/^https?:\/\//i.test(String(result.source_url || ''))) return { ok: false, reason: 'no usable source_url' }
  return { ok: true, numeric: v.numeric }
}

function surpriseOf(actualNum, forecastRaw) {
  const f = parseReleaseValue(forecastRaw)
  if (f === null || actualNum === null) return null
  return actualNum > f ? 'beat' : actualNum < f ? 'miss' : 'inline'
}

export {
  MONTH_NAMES, RELEASE_DATE_TOLERANCE_DAYS,
  parseEconNum, parseReleaseValue, normalizePeriod,
  expectedPeriodFor, nextReleaseAfter,
  validateReleaseValue, validateReleaseResult, surpriseOf,
}
