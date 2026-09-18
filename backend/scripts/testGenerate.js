// Generates social post drafts with sample facts and prints them with their guardrail flags.
//   node backend/scripts/testGenerate.js <contentType>
//
// Calls Anthropic (real tokens: a Sonnet draft call plus a Haiku fact check, doubled if the retry
// fires) and nothing else: no DB, no posting.
// Reads ANTHROPIC_API_KEY from backend/.env, the same variable index.js uses.

import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { generateDraft, CONTENT_TYPES } from '../social/generator.js'

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })

const contentType = process.argv[2]
if (!CONTENT_TYPES.includes(contentType)) {
  console.error(`usage: node backend/scripts/testGenerate.js <${CONTENT_TYPES.join('|')}>`)
  process.exit(2)
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set (expected in backend/.env)')
  process.exit(2)
}

const SAMPLES = {
  bias_card: {
    facts: {
      pair: 'EUR/USD', direction: 'BEARISH', confidence: 78, grade: 'A-',
      reasoning: 'US 2Y yields holding near 4.2% while German 2Y slipped after soft eurozone PMIs; the rate gap keeps widening in the dollar\'s favour. ECB speakers leaning dovish ahead of October. Speculators still net long euro per COT, so positioning has room to unwind.',
      // Must never reach the model or the post. The guardrails get it so they can catch a leak.
      invalidation: '1.0850',
    },
  },
  event_preview: {
    facts: {
      dateLabel: 'Thursday, 18 September',
      events: [
        { time: '11:00', currency: 'GBP', title: 'BoE Interest Rate Decision', forecast: '4.00%', previous: '4.00%', impact: 'High' },
        { time: '12:30', currency: 'USD', title: 'Initial Jobless Claims', forecast: '236K', previous: '231K', impact: 'Medium' },
        { time: '12:30', currency: 'USD', title: 'Philadelphia Fed Manufacturing Index', forecast: '-1.2', previous: '-0.3', impact: 'High' },
      ],
    },
  },
  weekly_scorecard: {
    facts: {
      rangeLabel: '15 – 19 September',
      rows: [
        { date: 'Mon 15', pair: 'EUR/USD', direction: 'BEARISH', outcome: 'hit' },
        { date: 'Tue 16', pair: 'GBP/USD', direction: 'BULLISH', outcome: 'miss' },
        { date: 'Wed 17', pair: 'AUD/USD', direction: 'BEARISH', outcome: 'miss' },
        { date: 'Thu 18', pair: 'XAU/USD', direction: 'BULLISH', outcome: 'open' },
      ],
    },
  },
  macro_insight: {
    facts: {
      reasoning: 'Gold firm as US 10Y real yields slip back toward 1.9%; Fed pricing shifted dovish after soft retail sales.',
      events: [{ time: '18:00', currency: 'USD', title: 'FOMC Statement', impact: 'High' }],
    },
  },
  trader_pain: { notes: 'The day after a max-loss day is where most evaluations actually die.' },
  contrarian: { notes: 'Fewer trades on news days is the edge nobody wants to hear about.' },
  build_log: {
    facts: { shipped: 'Economic calendar now shows the actual release value within a minute of the print, pulled from official sources, with the forecast beside it.' },
  },
}

const PAST_TEXTS = [
  'Dollar bid again. Rate differentials are doing the heavy lifting while everyone argues about the Fed.',
  'Most blown evaluations are not bad analysis. They are one oversized trade after a red day.',
  'NFP week. Trade less, not more. The first move is usually the wrong one.',
]

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const usage = []
const trackAI = (label, model, u) => usage.push(`${label} ${model} in=${u?.input_tokens} out=${u?.output_tokens}`)

const sample = SAMPLES[contentType]
const t0 = Date.now()
const result = await generateDraft({ contentType, platform: 'x', facts: sample.facts || {}, notes: sample.notes || '', pastTexts: PAST_TEXTS, anthropic, trackAI })

console.log(`\n=== ${contentType} (platform x) — ${Date.now() - t0}ms, ${usage.length} model call(s) ===`)
usage.forEach(u => console.log(`  ${u}`))
result.variants.forEach((v, i) => {
  console.log(`\n[${i}] shape: ${v.shape} | ${v.text.length} chars`)
  console.log(`    ${v.text.replace(/\n/g, '\n    ')}`)
  console.log(`    flags: ${v.flags.length ? v.flags.map(f => `${f.level}:${f.code}`).join(', ') : 'none'}`)
  console.log(`    fact check: ${v.factcheck?.status ?? 'n/a'}${v.factcheck?.issue ? ` — ${v.factcheck.issue}` : ''}`)
})
const idx = result.chosen ? result.variants.indexOf(result.chosen) : -1
console.log(`\nchosen: ${idx >= 0 ? `[${idx}] ${result.chosen.shape}` : 'none'} | failed: ${result.failed}`)

// For bias cards, independently scan for anything that looks like a price level.
if (contentType === 'bias_card') {
  const levels = result.variants.flatMap(v => (v.text.match(/\b\d{1,5}[.,]\d{2,5}\b/g) || []).map(n => `[${result.variants.indexOf(v)}] ${n}`))
  console.log(`price-level scan: ${levels.length ? `FOUND ${levels.join(', ')}` : 'no price-like numbers in any variant'}`)
}
