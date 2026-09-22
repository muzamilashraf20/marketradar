// Test vectors for the social-post guardrails.
//   node backend/scripts/socialGuardrails.test.js
//
// Imports social/guardrails.js directly, so these exercise the shipped functions rather than a copy.
// Most cases assert that a rule fires; the "must NOT fire" cases matter just as much, because a
// checker that flags everything gets ignored.

import { validateSocialPost, similarityScore } from '../social/guardrails.js'

let pass = 0, fail = 0
function check(name, ok, detail) {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`)
}

const run = (text, opts) => {
  const { flags } = validateSocialPost(text, opts)
  return {
    hard: flags.filter(f => f.level === 'hard').map(f => f.code).sort(),
    soft: flags.filter(f => f.level === 'soft').map(f => f.code).sort(),
  }
}
const show = r => `hard=${JSON.stringify(r.hard)} soft=${JSON.stringify(r.soft)}`
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Rule fires (other flags allowed alongside it).
function expectHard(name, code, text, opts) {
  const r = run(text, opts)
  check(name, r.hard.includes(code), `expected hard '${code}', got ${show(r)}`)
}
function expectSoft(name, code, text, opts) {
  const r = run(text, opts)
  check(name, r.soft.includes(code), `expected soft '${code}', got ${show(r)}`)
}
// Exact flag set, for the cases that prove the checker is not over-firing.
function expectExactly(name, hard, soft, text, opts) {
  const r = run(text, opts)
  check(name, same(r.hard, hard) && same(r.soft, soft), `expected hard=${JSON.stringify(hard)} soft=${JSON.stringify(soft)}, got ${show(r)}`)
}

const X = { platform: 'x', contentType: 'post' }
const CARD = { platform: 'x', contentType: 'bias_card', facts: { pair: 'EUR/USD', invalidation: '1.0850' } }

// ── Clean ─────────────────────────────────────────────────────────────────────
expectExactly('clean X post has no flags at all', [], [],
  "EUR/USD leans bearish into today's ECB decision. Rate differentials still favor the dollar and positioning is stretched long euro. Full breakdown on the dashboard.", X)

// ── Hard rules ────────────────────────────────────────────────────────────────
expectHard('.ai domain', 'domain_ai', 'check biasforge.ai for more', X)
expectHard('competitor .ai domain', 'domain_ai', 'better than someothertool.ai', X)
expectHard('SL/TP levels', 'trade_levels', 'EURUSD long, SL 1.0820 TP 1.0950', X)
expectHard('entry zone', 'trade_levels', 'Gold entry zone is right here', X)

expectHard('invalidation level written as 1.085', 'invalidation', 'EUR/USD bearish while below 1.085 today', CARD)
expectHard('invalidation level written as 1.0850', 'invalidation', 'EUR/USD bearish while below 1.0850 today', CARD)
expectHard('invalidation level written as 1,0850', 'invalidation', 'EUR/USD bearish while below 1,0850 today', CARD)
expectHard('invalidation level written as 1.08500', 'invalidation', 'EUR/USD bearish while below 1.08500 today', CARD)
expectHard('invalidation level with thousands comma', 'invalidation', 'XAU/USD bid while above 2,345.50',
  { platform: 'x', contentType: 'bias_card', facts: { pair: 'XAU/USD', invalidation: 2345.5 } })
expectExactly('nearby numbers are NOT the invalidation level', [], [],
  'EUR/USD bearish, trading near 1.0851 after failing at 1.08 twice', CARD)
expectHard('word "invalidation"', 'invalidation', 'Our invalidation is clear on this one', X)
expectHard('word "invalidated"', 'invalidation', 'The idea gets invalidated above the high', X)

expectHard('real-time claim', 'realtime_claim', 'Real-time signals for every pair', X)
expectHard('every N minutes claim', 'realtime_claim', 'Bias updated every 5 minutes', X)
expectHard('guarantee', 'guarantee', 'guaranteed setups', X)
expectHard('risk-free', 'guarantee', 'a risk-free way to trade NFP', X)
expectHard('win rate claim', 'perf_claim', '82% win rate last month', X)
expectHard('accuracy claim', 'perf_claim', 'The engine hit 74 % accuracy on gold', X)
expectHard('banned phrase', 'banned_phrase', 'not a signal', X)
expectHard('banned phrase, odd case and spacing', 'banned_phrase', 'This is your Macro   Map for the week', X)
expectHard('X post with link', 'x_link', 'Read the full note at https://biasforge.co', X)
expectHard('X post with bare domain', 'x_link', 'More on biasforge.co', X)
expectExactly('link is fine on LinkedIn', [], [], 'Read the full note at https://biasforge.co', { platform: 'linkedin', contentType: 'post' })

const long300 = 'Dollar strength is the story this week. '.repeat(8).slice(0, 300)
check('300-char fixture is 300 chars', long300.length === 300, `got ${long300.length}`)
expectHard('X post of 300 chars', 'too_long', long300, X)
expectExactly('same 300 chars fine on Instagram', [], [], long300, { platform: 'instagram', contentType: 'post' })

expectHard('bias card missing its pair', 'missing_fact',
  'The euro looks heavy into the ECB meeting and the dollar has the rate edge.', CARD)
expectExactly('bias card naming its pair without the slash passes', [], [],
  'EURUSD looks heavy into the ECB meeting and the dollar has the rate edge.', CARD)

// ── Duplicates ────────────────────────────────────────────────────────────────
// 25 words; the reworded copy swaps two of them ("stretched"->"extended", "sellers"->"bears").
const past25 = 'The dollar is stretched after three straight sessions of gains while yields stall near the highs so we are watching whether sellers finally step in'
const reworded = 'The dollar is extended after three straight sessions of gains while yields stall near the highs so we are watching whether bears finally step in'
check('near-duplicate fixture is 25 words', past25.split(' ').length === 25, `got ${past25.split(' ').length}`)
const nearScore = similarityScore(reworded, past25)
check('near-duplicate similarityScore >= 0.35', nearScore >= 0.35, `score ${nearScore.toFixed(3)}`)
expectHard('near-duplicate of a past post', 'duplicate', reworded, { ...X, pastTexts: ['Something unrelated about gold.', past25] })

// Exactly one 7-word run in common ("have never been this long the yen"), otherwise different.
const pastCot = 'COT update: speculators have never been this long the yen since 2007.'
const runPost = 'Funds have never been this long the yen and nobody seems worried about it.'
const runScore = similarityScore(runPost, pastCot)
check('7-word-run fixture is below the similarity limit', runScore < 0.35, `score ${runScore.toFixed(3)}`)
expectHard('shared 7-word run with a past post', 'duplicate', runPost, { ...X, pastTexts: [pastCot] })

// Same topic (ECB day), genuinely different posts: must not be called duplicates.
const ecbA = 'ECB holds rates today. Markets price two more cuts this year, so any hawkish hint from Lagarde could squeeze euro shorts hard.'
const ecbB = 'Euro traders: the central bank decision lands at 13:15 GMT. Watch the press conference tone more than the headline number.'
const diffScore = similarityScore(ecbB, ecbA)
check('different same-topic posts score low', diffScore < 0.1, `score ${diffScore.toFixed(3)}`)
expectExactly('different same-topic posts are NOT duplicates', [], [], ecbB, { ...X, pastTexts: [ecbA] })

check('similarityScore is 0 under 3 words', similarityScore('gold up', 'gold up') === 0, 'expected 0')
check('similarityScore of identical text is 1', similarityScore(past25, past25) === 1, 'expected 1')
check('similarityScore survives null', similarityScore(null, undefined) === 0, 'expected 0')

// ── Soft rules ────────────────────────────────────────────────────────────────
expectExactly('"signal groups sell certainty" is soft signal_word only', [], ['signal_word'], 'signal groups sell certainty', X)
expectSoft('3 emojis', 'emoji_heavy', 'Gold bid into the Fed 🚀🔥📈', X)
expectExactly('1 emoji is fine', [], [], 'Gold bid into the Fed 📈', X)
expectExactly('one ZWJ emoji counts once', [], [], 'Desk is quiet today 👨‍💻', X)
expectSoft('same opener as a past post', 'same_opener', 'Gold is bid again into the close.', { ...X, pastTexts: ['GOLD, again, leads the metals.'] })
expectSoft('hashtag heavy', 'hashtag_heavy', 'NFP day #forex #trading', X)
expectExactly('one hashtag and "#1" are fine', [], [], 'The #1 mistake on NFP day #forex', X)
// Hashtag limits per platform: X >1, LinkedIn >3, Instagram >8.
const tags = n => `Rates still favour the dollar.\n\n${Array.from({ length: n }, (_, i) => `#tag${String.fromCharCode(97 + i)}`).join(' ')}`
const LI = { platform: 'linkedin', contentType: 'post' }
const IG = { platform: 'instagram', contentType: 'post' }
expectExactly('LinkedIn: 3 hashtags are fine', [], [], tags(3), LI)
expectSoft('LinkedIn: 4 hashtags → hashtag_heavy', 'hashtag_heavy', tags(4), LI)
expectExactly('Instagram: 8 hashtags are fine', [], [], tags(8), IG)
expectSoft('Instagram: 9 hashtags → hashtag_heavy', 'hashtag_heavy', tags(9), IG)
expectSoft('X is unchanged: 2 hashtags → hashtag_heavy', 'hashtag_heavy', tags(2), X)
{
  const r = validateSocialPost(tags(4), LI).flags.find(f => f.code === 'hashtag_heavy')
  check('LinkedIn hashtag message names its own limit', /keep it to 3 or fewer/.test(r?.msg || ''), r?.msg)
}
// Instagram length: Meta's 2200-character caption limit.
expectExactly('Instagram: 2200 chars is fine', [], [], 'a'.repeat(2200), IG)
expectHard('Instagram: 2201 chars → too_long', 'too_long', 'a'.repeat(2201), IG)

// ── Bad input ─────────────────────────────────────────────────────────────────
for (const [label, bad] of [['null', null], ['undefined', undefined], ['empty string', ''], ['whitespace', '   '], ['number', 42]]) {
  let r, threw = null
  try { r = run(bad, X) } catch (e) { threw = e }
  check(`${label} text -> hard 'empty', no crash`, !threw && same(r.hard, ['empty']) && same(r.soft, []), threw ? `threw ${threw.message}` : show(r))
}
{
  let r, threw = null
  try { r = run('Gold looks heavy into the weekend.', undefined) } catch (e) { threw = e }
  check('missing opts does not crash', !threw && same(r.hard, []), threw ? `threw ${threw.message}` : show(r))
}
{
  let r, threw = null
  try { r = run('Gold looks heavy into the weekend.', { platform: 'x', facts: null, pastTexts: [null, 7, 'x'] }) } catch (e) { threw = e }
  check('junk facts/pastTexts do not crash', !threw && same(r.hard, []), threw ? `threw ${threw.message}` : show(r))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
