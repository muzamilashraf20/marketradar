// Social card renderer: HTML string -> satori-html -> satori (SVG) -> resvg (PNG).
//
// No headless browser: satori + resvg run in-process in a few MB, which Railway can afford where
// Chromium cannot. The cost is that satori understands only a subset of CSS — flexbox but no
// grid, and every div with more than one child must say display:flex — so every layout here is
// flex columns and rows with inline styles and an explicit font-size on each text node.
//
// Public-copy rules also hold for images: a bias card shows direction and conviction only, never
// the invalidation level, a stop or a target (those are what Pro pays for), and the scorecard
// shows individual calls without any aggregate that would read as a performance claim.

import { readFileSync } from 'node:fs'
import satori from 'satori'
import { html } from 'satori-html'
import { Resvg } from '@resvg/resvg-js'

// ── Brand tokens ──────────────────────────────────────────────────────────────
const BG = '#030712'
const PANEL = '#020617'
const CYAN = '#06b6d4'
const EMERALD = '#10b981'
const RED = '#ef4444'
const TEXT = '#e5e7eb'
const MUTED = '#9ca3af'
const HAIRLINE = 'rgba(255,255,255,0.08)'

const WIDTH = 1080
const HEIGHT = 1350
const PAD = 72
const FOOTER = 'biasforge.co · Educational macro analysis — not financial advice'
const DRIVER_MAX = 110

export const LAYOUT_COUNTS = { bias_card: 3, event_preview: 1, weekly_scorecard: 1 }

// Read once at import; every render reuses the same buffers.
const FONTS = [
  { name: 'Inter', weight: 400, style: 'normal', data: readFileSync(new URL('./fonts/Inter-Regular.ttf', import.meta.url)) },
  { name: 'Inter', weight: 700, style: 'normal', data: readFileSync(new URL('./fonts/Inter-Bold.ttf', import.meta.url)) },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
// All data reaches the markup through esc(): a driver containing "<" or "&" must render as text,
// not break the parse.
const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const isBlank = v => v == null || (typeof v === 'string' && !v.trim())

function requireFields(kind, obj, fields, where = 'data') {
  if (!obj || typeof obj !== 'object') throw new Error(`renderCard(${kind}): ${where} must be an object`)
  const missing = fields.filter(f => isBlank(obj[f]))
  if (missing.length) throw new Error(`renderCard(${kind}): ${where} is missing required field(s): ${missing.join(', ')}`)
}

function directionTone(direction) {
  const d = String(direction).trim().toUpperCase()
  if (d === 'BULLISH' || d === 'LONG') return { word: d, color: EMERALD, up: true }
  if (d === 'BEARISH' || d === 'SHORT') return { word: d, color: RED, up: false }
  return { word: d, color: CYAN, up: null }
}

// "eurusd" -> "EUR/USD"; anything already slashed or not six letters is left as written.
function formatPair(pair) {
  const p = String(pair).trim().toUpperCase()
  return /^[A-Z]{6}$/.test(p) ? `${p.slice(0, 3)}/${p.slice(3)}` : p
}

// Cut on a word boundary so the card never ends mid-word, and drop dangling punctuation before
// the ellipsis.
function truncate(text, max = DRIVER_MAX) {
  const t = String(text).replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/, '') + '…'
}

// Confidence is a 0–100 strength score (engine range ~40–92), not a probability of winning.
// Shown as "/100" rather than "%" so it cannot be read as a win rate.
function confidenceValue(c) {
  const n = Number(c)
  if (!Number.isFinite(n)) throw new Error('renderCard(bias_card): confidence must be a number')
  return Math.max(0, Math.min(100, Math.round(n)))
}

const label = (text, color = MUTED, size = 22) =>
  `<div style="display:flex;font-size:${size}px;font-weight:700;letter-spacing:4px;color:${color}">${esc(String(text).toUpperCase())}</div>`

function chip(name, value, color = TEXT) {
  return `<div style="display:flex;align-items:center;gap:14px;padding:14px 24px;border-radius:999px;background:${PANEL};border:2px solid ${HAIRLINE}">
    <div style="display:flex;font-size:20px;font-weight:700;letter-spacing:3px;color:${MUTED}">${esc(name.toUpperCase())}</div>
    <div style="display:flex;font-size:30px;font-weight:700;color:${color}">${esc(value)}</div>
  </div>`
}

// Direction glyph drawn as SVG so it does not depend on the font having arrow characters.
function arrow(tone, size) {
  const path = tone.up === true ? 'M12 2 L22 13 H15.5 V22 H8.5 V13 H2 Z'
    : tone.up === false ? 'M12 22 L2 11 H8.5 V2 H15.5 V11 H22 Z'
    : 'M2 12 L9 5 V9 H15 V5 L22 12 L15 19 V15 H9 V19 Z'
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><path d="${path}" fill="${tone.color}"/></svg>`
}

const wordmark = () => `<div style="display:flex;align-items:center;gap:16px">
  <div style="display:flex;width:40px;height:40px;border-radius:10px;background-image:linear-gradient(135deg, ${CYAN}, ${EMERALD})"></div>
  <div style="display:flex;font-size:32px;font-weight:700;color:${TEXT};letter-spacing:-0.5px">BiasForge</div>
</div>`

const footer = () => `<div style="display:flex;padding-top:28px;border-top:2px solid ${HAIRLINE};font-size:22px;color:${MUTED}">${esc(FOOTER)}</div>`

// Shared frame: wordmark top-left, content fills the middle, footer pinned to the bottom.
const frame = body => `<div style="display:flex;flex-direction:column;width:${WIDTH}px;height:${HEIGHT}px;padding:${PAD}px;background:${BG};font-family:Inter;color:${TEXT}">
  ${wordmark()}
  <div style="display:flex;flex-direction:column;flex-grow:1;min-height:0;overflow:hidden;margin-top:48px;margin-bottom:40px">${body}</div>
  ${footer()}
</div>`

// ── bias_card ─────────────────────────────────────────────────────────────────
// Reads exactly five fields. Anything else on `data` (invalidation, stop, target, levels) is never
// touched, so it cannot leak onto the card no matter what the caller passes.
function biasCardFields(data) {
  requireFields('bias_card', data, ['pair', 'direction', 'confidence', 'grade', 'driver'])
  const { pair, direction, confidence, grade, driver } = data
  return {
    pair: formatPair(pair),
    tone: directionTone(direction),
    confidence: confidenceValue(confidence),
    grade: String(grade).trim(),
    driver: truncate(driver),
  }
}

const biasLayouts = [
  // 0 — hero: the pair dominates, arrow + direction beneath, chips, driver as the closing line.
  f => `
    ${label('Daily bias')}
    <div style="display:flex;flex-direction:column;flex-grow:1;justify-content:center">
      <div style="display:flex;font-size:176px;font-weight:700;letter-spacing:-6px;line-height:1;color:${TEXT}">${esc(f.pair)}</div>
      <div style="display:flex;align-items:center;gap:24px;margin-top:40px">
        ${arrow(f.tone, 96)}
        <div style="display:flex;font-size:84px;font-weight:700;color:${f.tone.color}">${esc(f.tone.word)}</div>
      </div>
      <div style="display:flex;gap:20px;margin-top:56px">
        ${chip('Grade', f.grade)}
        ${chip('Confidence', `${f.confidence}/100`)}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:16px;padding-top:36px;border-top:2px solid ${HAIRLINE}">
      ${label('Driver')}
      <div style="display:flex;font-size:36px;line-height:1.35;color:${TEXT}">${esc(f.driver)}</div>
    </div>`,

  // 1 — split: identity on the left, conviction as a meter on the right, driver in a panel.
  f => `
    <div style="display:flex;flex-grow:1;min-height:0;align-items:center;gap:48px">
      <div style="display:flex;flex-direction:column;flex-grow:1;justify-content:center">
        ${label('Daily bias')}
        <div style="display:flex;font-size:112px;font-weight:700;letter-spacing:-4px;line-height:1;margin-top:28px;color:${TEXT}">${esc(f.pair)}</div>
        <div style="display:flex;align-items:center;gap:18px;margin-top:36px">
          ${arrow(f.tone, 72)}
          <div style="display:flex;font-size:60px;font-weight:700;color:${f.tone.color}">${esc(f.tone.word)}</div>
        </div>
        <div style="display:flex;margin-top:44px">${chip('Grade', f.grade)}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;width:220px;padding:36px 0;border-radius:28px;background:${PANEL};border:2px solid ${HAIRLINE}">
        ${label('Confidence', MUTED, 18)}
        <div style="display:flex;font-size:72px;font-weight:700;margin-top:20px;color:${TEXT}">${f.confidence}</div>
        <div style="display:flex;font-size:22px;color:${MUTED}">/100</div>
        <div style="display:flex;flex-direction:column;justify-content:flex-end;height:400px;width:56px;margin-top:28px;border-radius:28px;background:${HAIRLINE}">
          <div style="display:flex;width:56px;height:${f.confidence}%;border-radius:28px;background:${f.tone.color}"></div>
        </div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:16px;margin-top:40px;padding:36px 40px;border-radius:24px;background:${PANEL};border:2px solid ${HAIRLINE}">
      ${label('Driver')}
      <div style="display:flex;font-size:36px;line-height:1.35;color:${TEXT}">${esc(f.driver)}</div>
    </div>`,

  // 2 — minimal: centred, the driver carries the card, chips recede to the bottom.
  f => `
    <div style="display:flex;flex-direction:column;flex-grow:1;align-items:center;justify-content:center;text-align:center">
      ${label('Daily bias')}
      <div style="display:flex;font-size:128px;font-weight:700;letter-spacing:-4px;line-height:1;margin-top:36px;color:${TEXT}">${esc(f.pair)}</div>
      <div style="display:flex;font-size:72px;font-weight:700;letter-spacing:6px;margin-top:28px;color:${f.tone.color}">${esc(f.tone.word)}</div>
      <div style="display:flex;width:120px;height:4px;margin-top:56px;border-radius:2px;background:${f.tone.color}"></div>
      <div style="display:flex;justify-content:center;max-width:860px;font-size:48px;line-height:1.3;margin-top:56px;color:${TEXT}">${esc(f.driver)}</div>
    </div>
    <div style="display:flex;justify-content:center;gap:20px">
      ${chip('Grade', f.grade)}
      ${chip('Confidence', `${f.confidence}/100`)}
    </div>`,
]

// ── event_preview ─────────────────────────────────────────────────────────────
const PKT_OFFSET_MIN = 5 * 60
const hhmm = mins => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

// Accepts "13:30" (taken as UTC) or anything Date can parse. Values like "All Day" or "Tentative"
// are shown as written with no PKT line rather than guessed.
function eventTimes(time) {
  const s = String(time ?? '').trim()
  let mins = null
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (m) mins = Number(m[1]) * 60 + Number(m[2])
  else if (s && !Number.isNaN(Date.parse(s))) {
    const d = new Date(s)
    mins = d.getUTCHours() * 60 + d.getUTCMinutes()
  }
  if (mins == null) return { utc: s || '—', pkt: null }
  return { utc: `${hhmm(mins)} UTC`, pkt: `${hhmm((mins + PKT_OFFSET_MIN) % 1440)} PKT` }
}

const isHighImpact = impact => /high|red/i.test(String(impact ?? '')) || Number(impact) === 3

function eventRow(ev) {
  const t = eventTimes(ev.time)
  const high = isHighImpact(ev.impact)
  const nums = [
    !isBlank(ev.forecast) && `Forecast <span style="color:${TEXT};font-weight:700">${esc(ev.forecast)}</span>`,
    !isBlank(ev.previous) && `Previous <span style="color:${TEXT};font-weight:700">${esc(ev.previous)}</span>`,
  ].filter(Boolean)
  return `<div style="display:flex;align-items:center;gap:32px;padding:32px 36px;border-radius:20px;background:${PANEL};border:2px solid ${HAIRLINE};border-left:8px solid ${high ? CYAN : HAIRLINE}">
    <div style="display:flex;flex-direction:column;width:200px">
      <div style="display:flex;font-size:32px;font-weight:700;white-space:nowrap;color:${TEXT}">${esc(t.utc)}</div>
      ${t.pkt ? `<div style="display:flex;font-size:22px;margin-top:6px;color:${MUTED}">${esc(t.pkt)}</div>` : ''}
    </div>
    <div style="display:flex;padding:10px 18px;border-radius:12px;background:rgba(6,182,212,0.12);font-size:26px;font-weight:700;letter-spacing:2px;color:${CYAN}">${esc(String(ev.currency).toUpperCase())}</div>
    <div style="display:flex;flex-direction:column;flex:1">
      <div style="display:flex;font-size:32px;font-weight:700;line-height:1.25;color:${TEXT}">${esc(truncate(ev.title, 60))}</div>
      ${nums.length ? `<div style="display:flex;gap:28px;margin-top:10px;font-size:24px;color:${MUTED}">${nums.map(n => `<div style="display:flex;gap:8px">${n}</div>`).join('')}</div>` : ''}
    </div>
  </div>`
}

function eventPreview(data) {
  requireFields('event_preview', data, ['dateLabel'])
  if (!Array.isArray(data.events) || !data.events.length) throw new Error('renderCard(event_preview): data.events must be a non-empty array')
  const events = data.events.slice(0, 4)
  events.forEach((ev, i) => requireFields('event_preview', ev, ['time', 'currency', 'title'], `events[${i}]`))
  return `
    ${label('Events to watch')}
    <div style="display:flex;font-size:72px;font-weight:700;letter-spacing:-2px;margin-top:20px;color:${TEXT}">${esc(data.dateLabel)}</div>
    <div style="display:flex;flex-direction:column;gap:24px;margin-top:56px">${events.map(eventRow).join('')}</div>`
}

// ── weekly_scorecard ──────────────────────────────────────────────────────────
// Every call is listed individually and at the same visual weight. No counts, totals or
// percentages: there is no audited track record, and a summary line would be a performance claim.
const OUTCOMES = {
  hit: { text: 'HIT', color: EMERALD, bg: 'rgba(16,185,129,0.14)' },
  miss: { text: 'MISS', color: RED, bg: 'rgba(239,68,68,0.14)' },
  open: { text: 'OPEN', color: MUTED, bg: 'rgba(156,163,175,0.14)' },
}

function scorecardRow(row) {
  const tone = directionTone(row.direction)
  const o = OUTCOMES[String(row.outcome).trim().toLowerCase()]
  return `<div style="display:flex;align-items:center;gap:28px;padding:16px 32px;border-radius:18px;background:${PANEL};border:2px solid ${HAIRLINE}">
    <div style="display:flex;width:150px;font-size:26px;color:${MUTED}">${esc(row.date)}</div>
    <div style="display:flex;width:250px;font-size:38px;font-weight:700;color:${TEXT}">${esc(formatPair(row.pair))}</div>
    <div style="display:flex;flex:1;align-items:center;gap:12px">
      ${arrow(tone, 30)}
      <div style="display:flex;font-size:28px;font-weight:700;color:${tone.color}">${esc(tone.word)}</div>
    </div>
    <div style="display:flex;justify-content:center;width:150px;padding:12px 0;border-radius:12px;background:${o.bg};border:2px solid ${o.color};font-size:26px;font-weight:700;letter-spacing:3px;color:${o.color}">${o.text}</div>
  </div>`
}

function weeklyScorecard(data) {
  requireFields('weekly_scorecard', data, ['rangeLabel'])
  if (!Array.isArray(data.rows) || !data.rows.length) throw new Error('renderCard(weekly_scorecard): data.rows must be a non-empty array')
  const rows = data.rows.slice(0, 7)
  rows.forEach((r, i) => {
    requireFields('weekly_scorecard', r, ['date', 'pair', 'direction', 'outcome'], `rows[${i}]`)
    if (!OUTCOMES[String(r.outcome).trim().toLowerCase()]) {
      throw new Error(`renderCard(weekly_scorecard): rows[${i}].outcome must be hit, miss or open (got "${r.outcome}")`)
    }
  })
  return `
    ${label('Weekly scorecard')}
    <div style="display:flex;font-size:72px;font-weight:700;letter-spacing:-2px;margin-top:20px;color:${TEXT}">${esc(data.rangeLabel)}</div>
    <div style="display:flex;font-size:28px;margin-top:16px;color:${MUTED}">Every call as it was made. Hits and misses alike.</div>
    <div style="display:flex;flex-direction:column;gap:14px;margin-top:36px">${rows.map(scorecardRow).join('')}</div>`
}

// ── Entry point ───────────────────────────────────────────────────────────────
function buildBody(kind, data, layoutIndex) {
  switch (kind) {
    case 'bias_card': {
      const n = LAYOUT_COUNTS.bias_card
      const i = ((Math.trunc(Number(layoutIndex) || 0) % n) + n) % n
      return biasLayouts[i](biasCardFields(data))
    }
    case 'event_preview': return eventPreview(data)
    case 'weekly_scorecard': return weeklyScorecard(data)
    default: throw new Error(`renderCard: unknown kind "${kind}" (expected ${Object.keys(LAYOUT_COUNTS).join(', ')})`)
  }
}

// satori-html's html() is a template tag; hand it the finished markup as a one-part template.
const toNode = markup => html(Object.assign([markup], { raw: [markup] }))

export async function renderCard(kind, data, layoutIndex = 0) {
  const markup = frame(buildBody(kind, data, layoutIndex))
  const svg = await satori(toNode(markup), { width: WIDTH, height: HEIGHT, fonts: FONTS })
  return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH }, font: { loadSystemFonts: false } }).render().asPng()
}
