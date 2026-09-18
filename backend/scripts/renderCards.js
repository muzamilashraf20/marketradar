// Renders every social card kind and every bias_card layout with sample data.
//   node backend/scripts/renderCards.js
//
// Output goes to backend/scripts/out/ (gitignored) for eyeballing. Nothing is uploaded or posted.
// A render under 10KB is treated as a failure: satori can "succeed" with an almost blank canvas
// when markup is dropped, and that should not pass silently.

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderCard, LAYOUT_COUNTS } from '../social/renderer.js'

const OUT = fileURLToPath(new URL('./out/', import.meta.url))
const MIN_BYTES = 10 * 1024
mkdirSync(OUT, { recursive: true })

const bearish = {
  pair: 'EURUSD', direction: 'BEARISH', confidence: 78, grade: 'A-',
  driver: 'ECB dovish tilt vs a firm Fed keeps the rate gap widening in the dollar’s favour',
  // Present on purpose: the renderer must ignore these. If any of them shows up on a card, that is a bug.
  invalidation: '1.0850', stop: '1.0880', target: '1.0720',
}
const bullish = {
  pair: 'XAU/USD', direction: 'BULLISH', confidence: 84, grade: 'A',
  driver: 'Real yields rolling over while central-bank buying stays steady',
}
const longDriver = {
  pair: 'GBPJPY', direction: 'SHORT', confidence: 66, grade: 'B',
  driver: 'BoJ officials are openly preparing markets for another hike while UK services inflation cools faster than expected, and positioning in the cross is still heavily one-sided long',
}

const cards = [
  ...Array.from({ length: LAYOUT_COUNTS.bias_card }, (_, i) => ['bias_card', bearish, i, `bias_card_L${i}_bearish`]),
  ...Array.from({ length: LAYOUT_COUNTS.bias_card }, (_, i) => ['bias_card', bullish, i, `bias_card_L${i}_bullish`]),
  ...Array.from({ length: LAYOUT_COUNTS.bias_card }, (_, i) => ['bias_card', longDriver, i, `bias_card_L${i}_longdriver`]),
  ['event_preview', {
    dateLabel: 'Thursday, 18 September',
    events: [
      { time: '11:00', currency: 'GBP', title: 'BoE Interest Rate Decision', forecast: '4.00%', previous: '4.00%', impact: 'High' },
      { time: '2026-09-18T12:30:00Z', currency: 'USD', title: 'Initial Jobless Claims', forecast: '236K', previous: '231K', impact: 'Medium' },
      { time: '12:30', currency: 'USD', title: 'Philadelphia Fed Manufacturing Index', forecast: '-1.2', previous: '-0.3', impact: 'High' },
      { time: 'All Day', currency: 'JPY', title: 'Bank Holiday', impact: 'Low' },
    ],
  }, 0, 'event_preview'],
  ['weekly_scorecard', {
    rangeLabel: '15 – 19 September',
    rows: [
      { date: 'Mon 15', pair: 'EURUSD', direction: 'BEARISH', outcome: 'hit' },
      { date: 'Mon 15', pair: 'XAUUSD', direction: 'BULLISH', outcome: 'hit' },
      { date: 'Tue 16', pair: 'GBPUSD', direction: 'BULLISH', outcome: 'miss' },
      { date: 'Tue 16', pair: 'USDJPY', direction: 'BEARISH', outcome: 'hit' },
      { date: 'Wed 17', pair: 'AUDUSD', direction: 'BEARISH', outcome: 'miss' },
      { date: 'Thu 18', pair: 'USDCAD', direction: 'BULLISH', outcome: 'open' },
      { date: 'Thu 18', pair: 'NZDUSD', direction: 'BEARISH', outcome: 'open' },
    ],
  }, 0, 'weekly_scorecard'],
]

let failed = 0
for (const [kind, data, layout, name] of cards) {
  const file = `${OUT}${name}.png`
  try {
    const t0 = Date.now()
    const png = await renderCard(kind, data, layout)
    writeFileSync(file, png)
    const ok = png.length > MIN_BYTES
    if (!ok) failed++
    console.log(`${ok ? 'OK  ' : 'FAIL'}  ${file}  ${(png.length / 1024).toFixed(1)} KB  ${Date.now() - t0}ms`)
  } catch (e) {
    failed++
    console.log(`FAIL  ${name}: ${e.message}`)
  }
}

// Bad input must throw a clear error rather than render a broken card.
const mustThrow = [
  ['unknown kind', () => renderCard('meme', {})],
  ['bias_card missing driver', () => renderCard('bias_card', { ...bullish, driver: '' })],
  ['scorecard bad outcome', () => renderCard('weekly_scorecard', { rangeLabel: 'x', rows: [{ date: 'Mon', pair: 'EURUSD', direction: 'LONG', outcome: 'win' }] })],
  ['event_preview no events', () => renderCard('event_preview', { dateLabel: 'Mon', events: [] })],
]
for (const [name, fn] of mustThrow) {
  try { await fn(); failed++; console.log(`FAIL  ${name}: did not throw`) }
  catch (e) { console.log(`OK    ${name} -> ${e.message}`) }
}

console.log(failed ? `\n${failed} failure(s)` : '\nall cards rendered')
process.exit(failed ? 1 : 0)
