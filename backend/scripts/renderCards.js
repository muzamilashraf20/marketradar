// Renders every social card kind, layout and format with sample data, and checks them.
//   node backend/scripts/renderCards.js
//
// Output goes to backend/scripts/out/v3/ (gitignored) for eyeballing. Nothing is uploaded or posted.
// Checks, per card: the PNG is over 10KB (satori can "succeed" with an almost blank canvas when markup
// is dropped) and has the right dimensions; for stories, no text lands inside Instagram's top or
// bottom 250px. Plus the escaping and field-isolation checks.

import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderCard, renderCardSvg, buildCardTree, cardSize, LAYOUT_COUNTS, STORY_SAFE_PX } from '../social/renderer.js'

const OUT = fileURLToPath(new URL('./out/v3/', import.meta.url))
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const MIN_BYTES = 10 * 1024

let failed = 0
const fail = msg => { failed++; console.log(`FAIL  ${msg}`) }
const ok = msg => console.log(`OK    ${msg}`)

const textNodes = node => {
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap(textNodes)
  if (node?.props) return textNodes(node.props.children)
  return []
}
// PNG width/height live in the IHDR chunk at bytes 16–23, big-endian.
const pngSize = buf => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) })

const DATE = '2026-09-22T07:00:00Z'
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
const ENTITY_DRIVER = 'Canada\'s CPI & the BoC\'s "soft" <b>tone</b>'
const entityCard = { pair: 'USDCAD', direction: 'BULLISH', confidence: 61, grade: 'C', date: DATE, driver: ENTITY_DRIVER }

const EVENTS = [
  { time: '12:30', currency: 'USD', title: 'CPI y/y', forecast: '3.1%', previous: '3.0%', impact: 'High' },
  { time: '12:30', currency: 'USD', title: 'Core CPI m/m', forecast: '0.3%', previous: '0.2%', impact: 'High' },
  { time: '14:00', currency: 'USD', title: 'Fed Chair Testimony', impact: 'High' },
  { time: '2026-09-22T18:00:00Z', currency: 'USD', title: 'FOMC Member Speaks', impact: 'Medium' },
]
const events = n => ({ dateLabel: 'Tuesday, 22 September', date: DATE, events: EVENTS.slice(0, n) })
const scorecard = {
  rangeLabel: '15 – 19 September', date: DATE,
  rows: [
    { date: 'Mon 15', pair: 'EURUSD', direction: 'BEARISH', outcome: 'hit' },
    { date: 'Mon 15', pair: 'XAUUSD', direction: 'BULLISH', outcome: 'hit' },
    { date: 'Tue 16', pair: 'GBPUSD', direction: 'BULLISH', outcome: 'miss' },
    { date: 'Tue 16', pair: 'USDJPY', direction: 'BEARISH', outcome: 'hit' },
    { date: 'Wed 17', pair: 'AUDUSD', direction: 'BEARISH', outcome: 'miss' },
    { date: 'Thu 18', pair: 'USDCAD', direction: 'BULLISH', outcome: 'open' },
    { date: 'Thu 18', pair: 'NZDUSD', direction: 'BEARISH', outcome: 'open' },
  ],
}
const news = {
  summary: 'A firmer US inflation print pushes back rate-cut hopes, lifting the dollar and pressuring gold as real yields climb.',
  assets: ['USD↑', 'Gold↓', 'EUR/USD↓', { label: 'US 2Y', dir: 'up' }],
  impactScore: 9, time: '12:30', date: DATE,
}

// ── Escaping and field isolation ──────────────────────────────────────────────
{
  const texts = textNodes(buildCardTree('bias_card', entityCard, { layoutIndex: 0 }))
  if (texts.includes(ENTITY_DRIVER)) ok(`driver text node === raw string: ${JSON.stringify(ENTITY_DRIVER)}`)
  else fail(`driver text node missing or altered: ${JSON.stringify(texts)}`)
  const leaked = texts.filter(t => /&(#\d+|amp|lt|gt|quot|apos);/.test(t) || /⟦\d+⟧/.test(t))
  if (!leaked.length) ok('no entity or placeholder survives into any text node')
  else fail(`entities/placeholders reached satori: ${JSON.stringify(leaked)}`)
  const types = []
  const walk = n => { if (Array.isArray(n)) n.forEach(walk); else if (n?.type) { types.push(n.type); walk(n.props?.children) } }
  walk(buildCardTree('bias_card', entityCard, { layoutIndex: 0 }))
  types.includes('b') ? fail('"<b>" in the driver was parsed as markup') : ok('"<b>" in the driver did not become an element')

  for (const fmt of ['post', 'story']) {
    const bearTexts = textNodes(buildCardTree('bias_card', bearish, { layoutIndex: 0, format: fmt })).join(' ')
    ;/1\.08[5-8]0|1\.0720/.test(bearTexts) ? fail(`a level leaked onto the ${fmt} card`) : ok(`${fmt}: invalidation / stop / target never reach the card`)
  }
  const ev = textNodes(buildCardTree('event_preview', { dateLabel: 'Mon', events: [{ time: '14:00', currency: 'GBP', title: 'BoE Governor\'s Speech & Q&A', impact: 'High' }] }))
  ev.includes('BoE Governor\'s Speech & Q&A') ? ok('event title keeps \' and & literally') : fail(`event title altered: ${JSON.stringify(ev)}`)
  const nf = textNodes(buildCardTree('news_flash', { summary: 'The BoC\'s "patient" line & a <soft> print', impactScore: 8 }))
  nf.includes('The BoC\'s "patient" line & a <soft> print') ? ok('news summary keeps \' " & < > literally') : fail(`news summary altered: ${JSON.stringify(nf)}`)
  const bearAll = textNodes(buildCardTree('bias_card', bearish, 0)).join(' ')
  ;/Engine v2|ENGINE V2/i.test(bearAll) && /PRICE/.test(bearAll) ? ok('engine strip lists the real inputs') : fail('engine strip missing')
  // No percentages or win rates anywhere on the scorecard.
  const sc = textNodes(buildCardTree('weekly_scorecard', scorecard, { format: 'story' })).join(' ')
  ;/%|win rate|total/i.test(sc) ? fail(`scorecard carries an aggregate: ${sc}`) : ok('scorecard has no totals, percentages or win rate')
}

// ── Renders ───────────────────────────────────────────────────────────────────
const cards = [
  ...Array.from({ length: LAYOUT_COUNTS.bias_card }, (_, i) => ['bias_card', bullish, i, 'post', `bias_L${i}_bullish_post`]),
  ...Array.from({ length: LAYOUT_COUNTS.bias_card }, (_, i) => ['bias_card', bearish, i, 'post', `bias_L${i}_bearish_post`]),
  ['bias_card', bearish, 0, 'story', 'bias_bearish_story'],
  ['bias_card', bullish, 0, 'story', 'bias_bullish_story'],
  ['bias_card', entityCard, 0, 'post', 'bias_entities_post'],
  ...[1, 2, 4].flatMap(n => [['event_preview', events(n), 0, 'post', `event_${n}_post`], ['event_preview', events(n), 0, 'story', `event_${n}_story`]]),
  ['weekly_scorecard', scorecard, 0, 'post', 'scorecard_post'],
  ['weekly_scorecard', scorecard, 0, 'story', 'scorecard_story'],
  ['news_flash', news, 0, 'post', 'news_post'],
  ['news_flash', news, 0, 'story', 'news_story'],
]

for (const [kind, data, layoutIndex, format, name] of cards) {
  const file = `${OUT}${name}.png`
  try {
    const t0 = Date.now()
    const png = await renderCard(kind, data, { layoutIndex, format })
    writeFileSync(file, png)
    const want = cardSize(format)
    const got = pngSize(png)
    const kb = (png.length / 1024).toFixed(1)
    if (png.length <= MIN_BYTES) fail(`${name}: only ${kb} KB — near-empty render`)
    else if (got.width !== want.width || got.height !== want.height) fail(`${name}: ${got.width}x${got.height}, expected ${want.width}x${want.height}`)
    else ok(`${file}  ${got.width}x${got.height}  ${kb} KB  ${Date.now() - t0}ms`)

    if (format === 'story') {
      // Where the text actually lands: the same layout as the PNG, with text as <text x y>.
      const svg = await renderCardSvg(kind, data, { layoutIndex, format })
      const bad = []
      let count = 0
      for (const m of svg.matchAll(/<text\b[^>]*\by="([\d.]+)"[^>]*\bfont-size="([\d.]+)"[^>]*>([^<]*)/g)) {
        count++
        const y = Number(m[1]), size = Number(m[2])
        const top = y - size, bottom = y + size * 0.3        // baseline y: ascender above, descender below
        if (top < STORY_SAFE_PX || bottom > want.height - STORY_SAFE_PX) bad.push(`"${m[3].slice(0, 30)}" at y=${y}`)
      }
      if (!count) fail(`${name}: no text elements found — the safe-zone check could not run`)
      else if (bad.length) fail(`${name}: ${bad.length} text node(s) inside the story safe zones: ${bad.slice(0, 5).join(', ')}`)
      else ok(`${name}: all ${count} text nodes clear of the top/bottom ${STORY_SAFE_PX}px`)
    }
  } catch (e) {
    fail(`${name}: ${e.message}`)
  }
}

// Bad input must throw a clear error rather than render a broken card.
const mustThrow = [
  ['unknown kind', () => renderCard('meme', {})],
  ['unknown format', () => renderCard('bias_card', bullish, { format: 'square' })],
  ['bias_card missing driver', () => renderCard('bias_card', { ...bullish, driver: '' })],
  ['scorecard bad outcome', () => renderCard('weekly_scorecard', { rangeLabel: 'x', rows: [{ date: 'Mon', pair: 'EURUSD', direction: 'LONG', outcome: 'win' }] })],
  ['event_preview no events', () => renderCard('event_preview', { dateLabel: 'Mon', events: [] })],
  ['news_flash missing summary', () => renderCard('news_flash', { impactScore: 9 })],
]
for (const [name, fn] of mustThrow) {
  try { await fn(); fail(`${name}: did not throw`) }
  catch (e) { ok(`${name} -> ${e.message}`) }
}

// Callers written before formats existed pass a bare layout index; that must still be a post.
{
  const png = await renderCard('bias_card', bullish, 1)
  const s = pngSize(png)
  s.width === 1080 && s.height === 1350 ? ok('renderCard(kind, data, 1) still renders a 1080x1350 post') : fail(`legacy call rendered ${s.width}x${s.height}`)
}

console.log(failed ? `\n${failed} failure(s)` : `\nall cards rendered → ${OUT}`)
process.exit(failed ? 1 : 0)
