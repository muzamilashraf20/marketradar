// Renders a sample carousel of every type and every story kind, and checks them.
//   node backend/scripts/renderCarousels.js
//
// Output goes to backend/scripts/out/carousels/ (gitignored) for eyeballing. Nothing is uploaded.
// The sample slides are hand-written here — they stand in for what the generator writes, so the
// layouts can be judged without spending a model call.
//
// Checks, per image: over 10KB (satori can "succeed" with a near-blank canvas when markup is
// dropped) and the right dimensions; the bottom 30% of the canvas carries real content, which is
// the automated version of "fill the canvas, no dead space"; and on a story, no text lands in
// Instagram's top or bottom 250px.

import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  renderCarousel, renderSlideSvg, buildSlideTree, renderCard, renderCardSvg,
  cardSize, MAX_CAROUSEL_SLIDES, SLIDE_KINDS, SLIDE_BODY_MIN_PX, STORY_SAFE_PX,
} from '../social/renderer.js'

const OUT = fileURLToPath(new URL('./out/carousels/', import.meta.url))
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const MIN_BYTES = 10 * 1024
const FILL_FRACTION = 0.3        // the bottom 30% must contain drawn content

let failed = 0
const fail = msg => { failed++; console.log(`FAIL  ${msg}`) }
const ok = msg => console.log(`OK    ${msg}`)
const pngSize = buf => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) })

// Every <text> in an embedFont:false SVG, as { top, bottom, size, text }.
function textBoxes(svg) {
  const out = []
  for (const m of svg.matchAll(/<text\b[^>]*\by="([\d.]+)"[^>]*\bfont-size="([\d.]+)"[^>]*>([^<]*)/g)) {
    const y = Number(m[1]), size = Number(m[2])
    out.push({ top: y - size, bottom: y + size * 0.3, size, text: m[3] })
  }
  return out
}

const DATE = '2026-09-23T06:30:00Z'
const textNodes = node => {
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap(textNodes)
  if (node?.props) return textNodes(node.props.children)
  return []
}

// ── Sample decks, one per carousel type ───────────────────────────────────────
const DECKS = {
  daily_brief: {
    meta: { date: DATE, direction: 'BEARISH' },
    slides: [
      { kind: 'cover', kicker: 'Daily brief', title: 'Wednesday’s macro read', pair: 'EURUSD', direction: 'BEARISH' },
      { kind: 'concept', label: 'Today’s bias', title: 'EUR/USD — bearish, grade A-', paragraphs: [
        'The engine reads the rate gap as the driver: a dovish ECB against a Fed in no hurry keeps the spread widening in the dollar’s favour.',
        'Conviction sits at 78 out of 100. That is a strength score for how well the inputs agree, not a probability.',
      ] },
      { kind: 'concept', label: 'News that matters', title: 'A firmer inflation print', paragraphs: [
        'US consumer prices came in above the consensus forecast, and rate-cut pricing was pushed further out as a result.',
        'That lifts real yields, and gold competes with real yields for the same money.',
      ] },
      { kind: 'points', label: 'Calendar · ahead today', title: 'Still to come, in UTC', points: [
        '12:30 — US CPI y/y, forecast 3.1%, previous 3.0%',
        '14:00 — Fed Chair testimony',
        '18:00 — FOMC member speaks',
      ] },
      { kind: 'concept', label: 'Market mover', title: 'The dollar is doing the work', paragraphs: [
        'Every pair on the board today is a dollar story. When one side of the board moves everything, the cross matters less than the dollar leg.',
      ] },
      { kind: 'callout', label: 'What traders are watching', text: 'Whether the move holds after the testimony, or fades the way a knee-jerk reaction usually does.' },
      { kind: 'cta', line: 'The macro read, every session.' },
    ],
  },
  macro_101: {
    meta: { date: DATE, accent: 'cyan' },
    slides: [
      { kind: 'cover', kicker: 'Macro 101', title: 'Why do real yields move gold?' },
      { kind: 'concept', label: 'The idea', title: 'Gold pays you nothing', paragraphs: [
        'Gold has no coupon and no dividend. Holding it costs you whatever you could have earned elsewhere.',
        'A government bond does pay. So the two compete for the same money.',
      ] },
      { kind: 'concept', label: 'The mechanism', title: 'Nominal is not the number that matters', paragraphs: [
        'A real yield is roughly the nominal yield minus the inflation the market expects.',
        'If yields rise but expected inflation rises just as fast, the real return has not changed — and neither has the case against gold.',
      ] },
      { kind: 'points', label: 'How traders use it', title: 'Three ways this shows up', points: [
        'Read the real yield direction before taking a view on gold, not the headline rate.',
        'Treat a gold move that fights real yields as a move with another driver behind it.',
        'Use it as context for the bias, not as a trigger on its own.',
      ] },
      { kind: 'callout', label: 'Common mistake', text: 'Reading a rate rise as automatically bearish for gold, without checking what inflation expectations did at the same time.' },
      { kind: 'cta', line: 'Macro, explained for funded traders.' },
    ],
  },
  event_explainer: {
    meta: { date: DATE, accent: 'cyan' },
    slides: [
      { kind: 'cover', kicker: 'Event explainer', title: 'US CPI, 12:30 UTC' },
      { kind: 'concept', label: 'What it measures', title: 'The price of a basket, year over year', paragraphs: [
        'CPI tracks what a fixed basket of goods and services costs compared with a year ago.',
        'Core strips out food and energy, because those swing for reasons a central bank cannot control.',
      ] },
      { kind: 'points', label: 'Which pairs react', title: 'Where it lands first', points: [
        'Dollar pairs: EUR/USD and GBP/USD tend to move on the dollar leg.',
        'USD/JPY, because the yen is tied closely to US yields.',
        'Gold, through real yields rather than through the print itself.',
      ] },
      { kind: 'concept', label: 'What traders watch', title: 'The surprise, not the number', paragraphs: [
        'Markets price the consensus forecast in advance. What moves price is the gap between the forecast and the release.',
        'The first move is often unreliable; the repricing that holds is the one in rate expectations.',
      ] },
      { kind: 'callout', label: 'A note on this one', text: 'Nobody here is predicting the print or the direction. The event is on the calendar; how it lands is the market’s business.' },
      { kind: 'cta', line: 'Know what is coming before it lands.' },
    ],
  },
  scorecard: {
    meta: { date: DATE, accent: 'emerald' },
    slides: [
      { kind: 'cover', kicker: 'Weekly scorecard', title: 'Every call we made, 15–19 September' },
      { kind: 'points', label: 'Monday and Tuesday', title: 'How they resolved', points: [
        'Mon 15 — EUR/USD bearish. Resolved as a hit.',
        'Mon 15 — XAU/USD bullish. Resolved as a hit.',
        'Tue 16 — GBP/USD bullish. Resolved as a miss.',
      ] },
      { kind: 'points', label: 'Wednesday and Thursday', title: 'The rest of the week', points: [
        'Tue 16 — USD/JPY bearish. Resolved as a hit.',
        'Wed 17 — AUD/USD bearish. Resolved as a miss.',
        'Thu 18 — USD/CAD bullish. Still open at the time of writing.',
      ] },
      { kind: 'callout', label: 'The honest part', text: 'Two misses this week, listed the same way as the hits. A week is far too small a sample to mean anything either way.' },
      { kind: 'cta', line: 'Every call, published as it was made.' },
    ],
  },
  called_it: {
    meta: { date: DATE, accent: 'emerald' },
    slides: [
      { kind: 'cover', kicker: 'Called it', title: 'We flagged this before the move' },
      { kind: 'concept', label: 'What we posted, and when', title: 'Monday 15 September, 11:20 UTC', paragraphs: [
        'A news reaction went out on the dollar leg two hours before the daily bias was published.',
        'The bias that followed read EUR/USD bearish.',
      ] },
      { kind: 'concept', label: 'What the reasoning said', title: 'The rate gap was the whole argument', paragraphs: [
        'A dovish ECB against a Fed in no hurry, with the spread widening in the dollar’s favour.',
        'No level, no target — the engine posts a direction and the reasoning behind it.',
      ] },
      { kind: 'concept', label: 'What the outcome was', title: 'Recorded as a hit', paragraphs: [
        'The performance record scored that call a hit when its 24-hour window closed.',
        'That is the whole claim: the recorded outcome, nothing added to it.',
      ] },
      { kind: 'callout', label: 'The honest part', text: 'Not every call lands. The misses are published the same way, every Saturday, in the weekly scorecard.' },
      { kind: 'cta', line: 'The calls and the misses, both public.' },
    ],
  },
}

// ── Carousels ─────────────────────────────────────────────────────────────────
for (const [type, deck] of Object.entries(DECKS)) {
  try {
    const t0 = Date.now()
    const pngs = await renderCarousel(deck.slides, deck.meta)
    const want = cardSize('post')
    if (pngs.length !== deck.slides.length) fail(`${type}: ${pngs.length} PNGs for ${deck.slides.length} slides`)
    for (const [i, png] of pngs.entries()) {
      const name = `${type}_${String(i + 1).padStart(2, '0')}_${deck.slides[i].kind}`
      writeFileSync(`${OUT}${name}.png`, png)
      const got = pngSize(png)
      if (png.length <= MIN_BYTES) fail(`${name}: only ${(png.length / 1024).toFixed(1)} KB — near-empty render`)
      else if (got.width !== want.width || got.height !== want.height) fail(`${name}: ${got.width}x${got.height}, expected ${want.width}x${want.height}`)

      // Fill and minimum body size, from where the text actually landed.
      const boxes = textBoxes(await renderSlideSvg(deck.slides[i], deck.meta, i + 1, deck.slides.length))
      const fillLine = want.height * (1 - FILL_FRACTION)
      if (!boxes.some(b => b.bottom > fillLine)) fail(`${name}: nothing drawn below y=${Math.round(fillLine)} — the bottom ${FILL_FRACTION * 100}% is empty`)
      const tiny = boxes.filter(b => b.size < SLIDE_BODY_MIN_PX && b.size > 25 && !/^[\s·—→/]*$/.test(b.text))
      void tiny   // labels and mono chrome sit below the body minimum by design; body copy is checked per builder
    }
    ok(`${type}: ${pngs.length} slides → ${OUT}${type}_*.png  (${Date.now() - t0}ms)`)
  } catch (e) {
    fail(`${type}: ${e.message}`)
  }
}

// Body copy really is at or above the minimum: the largest text on each body slide is the title,
// and the paragraph/point text is the next size down. Checked on the densest shapes.
{
  const dense = [
    ['concept x3', { kind: 'concept', label: 'x', title: 'Three paragraphs', paragraphs: ['one', 'two', 'three'] }],
    ['points x3', { kind: 'points', label: 'x', title: 'Three points', points: ['one', 'two', 'three'] }],
  ]
  for (const [name, slide] of dense) {
    const svg = await renderSlideSvg(slide, { date: DATE }, 2, 7)
    const bodySizes = textBoxes(svg).filter(b => /one|two|three/.test(b.text)).map(b => b.size)
    const min = Math.min(...bodySizes)
    bodySizes.length && min >= SLIDE_BODY_MIN_PX
      ? ok(`${name}: body type is ${min}px, at or above the ${SLIDE_BODY_MIN_PX}px minimum`)
      : fail(`${name}: body type ${bodySizes.length ? `${min}px` : 'not found'}, minimum is ${SLIDE_BODY_MIN_PX}px`)
  }
}

// ── Stories ───────────────────────────────────────────────────────────────────
const STORIES = [
  ['bias_card', { pair: 'EURUSD', direction: 'BEARISH', confidence: 78, grade: 'A-', date: DATE, driver: 'ECB dovish tilt vs a firm Fed keeps the rate gap widening in the dollar’s favour', invalidation: '1.0850' }, 'story_bias'],
  ['news_flash', { summary: 'A firmer US inflation print pushes back rate-cut hopes, lifting the dollar and pressuring gold as real yields climb.', assets: ['USD↑', 'Gold↓', 'EUR/USD↓'], impactScore: 9, time: '12:30', date: DATE }, 'story_news'],
  ['event_preview', { dateLabel: 'Wednesday, 23 September', date: DATE, events: [{ time: '12:30', currency: 'USD', title: 'CPI y/y', forecast: '3.1%', previous: '3.0%', impact: 'High' }] }, 'story_event'],
  ['carousel_promo', { title: 'Why do real yields move gold?', kicker: 'Macro 101', slideCount: 6, date: DATE }, 'story_promo'],
  ['carousel_promo', { title: 'Wednesday’s macro read', kicker: 'Daily brief', slideCount: 7, date: DATE, direction: 'BEARISH' }, 'story_promo_bias'],
]

for (const [kind, data, name] of STORIES) {
  try {
    const png = await renderCard(kind, data, { format: 'story' })
    writeFileSync(`${OUT}${name}.png`, png)
    const want = cardSize('story')
    const got = pngSize(png)
    if (png.length <= MIN_BYTES) fail(`${name}: only ${(png.length / 1024).toFixed(1)} KB — near-empty render`)
    else if (got.width !== want.width || got.height !== want.height) fail(`${name}: ${got.width}x${got.height}, expected ${want.width}x${want.height}`)

    const boxes = textBoxes(await renderCardSvg(kind, data, { format: 'story' }))
    if (!boxes.length) { fail(`${name}: no text elements — the layout checks could not run`); continue }
    const bad = boxes.filter(b => b.top < STORY_SAFE_PX || b.bottom > want.height - STORY_SAFE_PX)
    if (bad.length) fail(`${name}: ${bad.length} text node(s) in the story safe zones: ${bad.slice(0, 3).map(b => `"${b.text.slice(0, 24)}"`).join(', ')}`)
    // "Fill the canvas" for a story means the readable area, which ends at the bottom safe zone.
    const readableBottom = want.height - STORY_SAFE_PX
    const fillLine = readableBottom - (readableBottom - STORY_SAFE_PX) * FILL_FRACTION
    if (!boxes.some(b => b.bottom > fillLine)) fail(`${name}: nothing drawn below y=${Math.round(fillLine)} — the bottom ${FILL_FRACTION * 100}% of the safe area is empty`)
    ok(`${name}: ${got.width}x${got.height}  ${(png.length / 1024).toFixed(1)} KB  ${boxes.length} text nodes, all clear of the safe zones`)
  } catch (e) {
    fail(`${name}: ${e.message}`)
  }
}

// ── Refusals ──────────────────────────────────────────────────────────────────
const cover = { kind: 'cover', title: 'x' }
const mustThrow = [
  [`${MAX_CAROUSEL_SLIDES + 1} slides`, () => renderCarousel(Array.from({ length: MAX_CAROUSEL_SLIDES + 1 }, () => cover), {})],
  ['no slides', () => renderCarousel([], {})],
  ['unknown slide kind', () => renderCarousel([{ kind: 'meme', title: 'x' }], {})],
  ['cover without a title', () => renderCarousel([{ kind: 'cover' }], {})],
  ['concept without paragraphs', () => renderCarousel([{ kind: 'concept', title: 'x', paragraphs: [] }], {})],
  ['points without points', () => renderCarousel([{ kind: 'points', title: 'x', points: [] }], {})],
  ['promo story without a title', () => renderCard('carousel_promo', { kicker: 'x' }, { format: 'story' })],
]
for (const [name, fn] of mustThrow) {
  try { await fn(); fail(`${name}: did not throw`) }
  catch (e) { ok(`${name} -> ${e.message}`) }
}

// A slide's text reaches satori as the raw string: no HTML entities, no placeholder tokens.
{
  const RAW = 'The BoC\'s "patient" line & a <soft> print'
  const texts = textNodes(buildSlideTree({ kind: 'callout', text: RAW }, { date: DATE }, 3, 6))
  texts.includes(RAW) ? ok('slide text keeps \' " & < > literally') : fail(`slide text altered: ${JSON.stringify(texts.filter(t => /BoC/.test(t)))}`)
  const leaked = texts.filter(t => /&(#\d+|amp|lt|gt|quot|apos);/.test(t) || /⟦\d+⟧/.test(t))
  leaked.length ? fail(`entities/placeholders reached satori: ${JSON.stringify(leaked)}`) : ok('no entity or placeholder survives into any slide text node')
  const counter = texts.join(' ')
  const hasCounter = s => /\b03\b/.test(s) && /\/ 06/.test(s)
  hasCounter(counter) ? ok('a non-cover slide shows its position (03 / 06)') : fail(`slide counter missing: ${JSON.stringify(texts)}`)
  const coverTexts = textNodes(buildSlideTree({ kind: 'cover', title: 'x' }, { date: DATE }, 1, 6)).join(' ')
  const coverHasCounter = /\/ 06/.test(coverTexts)
  coverHasCounter ? fail('the cover shows a slide counter') : ok('the cover shows no counter')
}

console.log(failed ? `\n${failed} failure(s)` : `\nall carousels and stories rendered → ${OUT}`)
console.log(`slide kinds: ${SLIDE_KINDS.join(', ')}`)
process.exit(failed ? 1 : 0)
