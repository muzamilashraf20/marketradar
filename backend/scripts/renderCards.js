// Renders every social card kind and every bias_card layout with sample data.
//   node backend/scripts/renderCards.js
//
// Output goes to backend/scripts/out/ (gitignored) for eyeballing. Nothing is uploaded or posted.
// A render under 10KB is treated as a failure: satori can "succeed" with an almost blank canvas
// when markup is dropped, and that should not pass silently.

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderCard, buildCardTree, LAYOUT_COUNTS } from '../social/renderer.js'

const OUT = fileURLToPath(new URL('./out/', import.meta.url))
const MIN_BYTES = 10 * 1024
mkdirSync(OUT, { recursive: true })

let failed = 0
const fail = msg => { failed++; console.log(`FAIL  ${msg}`) }
const ok = msg => console.log(`OK    ${msg}`)

// Every string child in the tree satori will receive.
const textNodes = node => {
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap(textNodes)
  if (node?.props) return textNodes(node.props.children)
  return []
}

const DATE = '2026-09-21T07:00:00Z'
const bearish = {
  pair: 'EURUSD', direction: 'BEARISH', confidence: 78, grade: 'A-', date: DATE,
  driver: 'ECB dovish tilt vs a firm Fed keeps the rate gap widening in the dollar’s favour',
  // Present on purpose: the renderer must ignore these. If any of them shows up on a card, that is a bug.
  invalidation: '1.0850', stop: '1.0880', target: '1.0720',
}
const bullish = {
  pair: 'XAU/USD', direction: 'BULLISH', confidence: 84, grade: 'B', date: DATE,
  driver: 'Real yields rolling over while central-bank buying stays steady and the dollar loses momentum into the Fed',
}
// The live bug: this reached the card as "Canada&#39;s". Every character HTML cares about is here.
const ENTITY_DRIVER = 'Canada\'s CPI & the BoC\'s "soft" <b>tone</b>'
const entityCard = { pair: 'USDCAD', direction: 'BULLISH', confidence: 61, grade: 'C', date: DATE, driver: ENTITY_DRIVER }

// ── 1. What satori receives, checked directly ─────────────────────────────────
{
  const tree = buildCardTree('bias_card', entityCard, 0)
  const texts = textNodes(tree)
  if (texts.includes(ENTITY_DRIVER)) ok(`driver text node === raw string: ${JSON.stringify(ENTITY_DRIVER)}`)
  else fail(`driver text node missing or altered. Text nodes: ${JSON.stringify(texts)}`)

  const leaked = texts.filter(t => /&(#\d+|amp|lt|gt|quot|apos);/.test(t) || /⟦\d+⟧/.test(t))
  if (!leaked.length) ok('no entity or placeholder survives into any text node')
  else fail(`entities/placeholders reached satori: ${JSON.stringify(leaked)}`)

  // "<b>" must stay text: no element of type "b" may exist anywhere in the tree.
  const types = []
  const walk = n => { if (Array.isArray(n)) n.forEach(walk); else if (n?.type) { types.push(n.type); walk(n.props?.children) } }
  walk(tree)
  if (!types.includes('b')) ok('"<b>" in the driver did not become an element')
  else fail('"<b>" in the driver was parsed as markup')

  // The card reads six fields only.
  const all = texts.join(' ')
  const bearTexts = textNodes(buildCardTree('bias_card', bearish, 0)).join(' ')
  if (!/1\.08[5-8]0|1\.0720/.test(bearTexts)) ok('invalidation / stop / target never reach the card')
  else fail(`a level leaked onto the card: ${bearTexts}`)
  if (all.includes('MON 21 SEP 2026')) ok('date renders as "MON 21 SEP 2026"')
  else fail(`date missing: ${all}`)
}

// Apostrophes and ampersands in the other kinds too.
{
  const ev = textNodes(buildCardTree('event_preview', { dateLabel: 'Monday, 21 September', events: [{ time: '14:00', currency: 'GBP', title: 'BoE Governor\'s Speech & Q&A', impact: 'High' }] }))
  if (ev.includes('BoE Governor\'s Speech & Q&A')) ok('event title keeps \' and & literally')
  else fail(`event title altered: ${JSON.stringify(ev)}`)
  const sc = textNodes(buildCardTree('weekly_scorecard', { rangeLabel: '15 – 19 Sep', rows: [{ date: 'Mon <15>', pair: 'EURUSD', direction: 'BEARISH', outcome: 'hit' }] }))
  if (sc.includes('Mon <15>')) ok('scorecard row keeps < > literally')
  else fail(`scorecard row altered: ${JSON.stringify(sc)}`)
}

// ── 2. Renders ────────────────────────────────────────────────────────────────
const cards = [
  ...Array.from({ length: LAYOUT_COUNTS.bias_card }, (_, i) => ['bias_card', bullish, i, `bias_L${i}_bullish`]),
  ...Array.from({ length: LAYOUT_COUNTS.bias_card }, (_, i) => ['bias_card', bearish, i, `bias_L${i}_bearish`]),
  ['bias_card', entityCard, 0, 'bias_entities'],
  ['event_preview', {
    dateLabel: 'Monday, 21 September',
    events: [
      { time: '11:00', currency: 'GBP', title: 'BoE Governor\'s Speech & Q&A', forecast: '', previous: '', impact: 'High' },
      { time: '2026-09-21T12:30:00Z', currency: 'USD', title: 'Initial Jobless Claims', forecast: '236K', previous: '231K', impact: 'Medium' },
      { time: '12:30', currency: 'CAD', title: 'Canada\'s CPI m/m', forecast: '0.2%', previous: '0.4%', impact: 'High' },
    ],
  }, 0, 'event_preview'],
  ['weekly_scorecard', {
    rangeLabel: '15 – 19 September',
    rows: [
      { date: 'Mon 15', pair: 'EURUSD', direction: 'BEARISH', outcome: 'hit' },
      { date: 'Tue 16', pair: 'GBPUSD', direction: 'BULLISH', outcome: 'miss' },
      { date: 'Wed 17', pair: 'AUDUSD', direction: 'BEARISH', outcome: 'miss' },
      { date: 'Thu 18', pair: 'USDCAD', direction: 'BULLISH', outcome: 'open' },
    ],
  }, 0, 'weekly_scorecard'],
]

for (const [kind, data, layout, name] of cards) {
  const file = `${OUT}${name}.png`
  try {
    const t0 = Date.now()
    const png = await renderCard(kind, data, layout)
    writeFileSync(file, png)
    const kb = (png.length / 1024).toFixed(1)
    if (png.length > MIN_BYTES) ok(`${file}  ${kb} KB  ${Date.now() - t0}ms`)
    else fail(`${file} only ${kb} KB — near-empty render`)
  } catch (e) {
    fail(`${name}: ${e.message}`)
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
  try { await fn(); fail(`${name}: did not throw`) }
  catch (e) { ok(`${name} -> ${e.message}`) }
}

console.log(failed ? `\n${failed} failure(s)` : `\nall cards rendered → ${OUT}`)
process.exit(failed ? 1 : 0)
