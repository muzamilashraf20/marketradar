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
const PAD = 64
const FOOTER = 'biasforge.co · Educational macro analysis — not financial advice'
// Tuned for three lines of the ~34px driver type across the card's inner width.
const DRIVER_MAX = 140

export const LAYOUT_COUNTS = { bias_card: 3, event_preview: 1, weekly_scorecard: 1 }

// Read once at import; every render reuses the same buffers.
const FONTS = [
  { name: 'Inter', weight: 400, style: 'normal', data: readFileSync(new URL('./fonts/Inter-Regular.ttf', import.meta.url)) },
  { name: 'Inter', weight: 700, style: 'normal', data: readFileSync(new URL('./fonts/Inter-Bold.ttf', import.meta.url)) },
]

// ── Text: placeholders, not HTML escaping ─────────────────────────────────────
// satori-html does NOT decode entities: "Canada&#39;s" reaches satori as those literal characters
// and gets drawn that way. So dynamic text never goes into the markup at all. txt() drops an inert
// token (only ⟦, digits and ⟧ — nothing HTML can act on) and remembers the raw string; after
// parsing, fillText() swaps each token for its raw string in the node tree. Satori draws string
// children as text, never as markup, so a driver containing "<b>" shows the characters "<b>".
//
// The registry is module-level but only lives inside one synchronous build (markup -> parse ->
// fill happens before the first await in renderCard), so concurrent renders cannot mix it up.
let TEXTS = null
const TOKEN_RE = /⟦(\d+)⟧/g
const txt = v => {
  if (!TEXTS) throw new Error('renderer: txt() used outside a card build')
  TEXTS.push(String(v ?? ''))
  return `⟦${TEXTS.length - 1}⟧`
}
function fillText(node, texts) {
  if (typeof node === 'string') return node.replace(TOKEN_RE, (_, i) => texts[Number(i)] ?? '')
  if (Array.isArray(node)) return node.map(n => fillText(n, texts))
  if (node && typeof node === 'object' && node.props) {
    const { children } = node.props
    if (children !== undefined) node.props.children = fillText(children, texts)
  }
  return node
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const isBlank = v => v == null || (typeof v === 'string' && !v.trim())

function requireFields(kind, obj, fields, where = 'data') {
  if (!obj || typeof obj !== 'object') throw new Error(`renderCard(${kind}): ${where} must be an object`)
  const missing = fields.filter(f => isBlank(obj[f]))
  if (missing.length) throw new Error(`renderCard(${kind}): ${where} is missing required field(s): ${missing.join(', ')}`)
}

// The direction decides the card's accent colour, everywhere on it.
function directionTone(direction) {
  const d = String(direction).trim().toUpperCase()
  if (d === 'BULLISH' || d === 'LONG') return { word: d, color: EMERALD, rgb: '16,185,129', up: true }
  if (d === 'BEARISH' || d === 'SHORT') return { word: d, color: RED, rgb: '239,68,68', up: false }
  return { word: d, color: CYAN, rgb: '6,182,212', up: null }
}
const rgba = (rgb, a) => `rgba(${rgb},${a})`

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

// "MON 21 SEP 2026". A card without a date can be screenshotted and passed around as if current.
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
function cardDate(input) {
  let d = input ? new Date(input) : new Date()
  if (Number.isNaN(d.getTime())) d = new Date()
  return `${DAYS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

// ── SVG as images ─────────────────────────────────────────────────────────────
// Everything with gradients, patterns or arcs is drawn as an SVG data URI and placed with <img>:
// resvg rasterises it with full SVG support, which avoids satori-html's attribute handling of
// gradient elements entirely.
const svgUri = svg => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

const LOGO_URI = svgUri('<svg width="44" height="44" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bfg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#06b6d4"/><stop offset="1" stop-color="#10b981"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="url(#bfg)"/><polyline points="20.5,49 37.3,49 43.2,26 55.5,74.5 63.6,37.3 71.8,49 82.7,49" fill="none" stroke="#030712" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')

// Faint dot grid for depth, plus a soft accent glow centred where the eye should land first.
// The dots are the only texture: no lines, no curves, nothing that could be read as price data.
function backdropUri(tone, glowX, glowY) {
  const glow = tone ? `<radialGradient id="g" gradientUnits="userSpaceOnUse" cx="${glowX}" cy="${glowY}" r="640">
      <stop offset="0" stop-color="${tone.color}" stop-opacity="0.26"/>
      <stop offset="0.55" stop-color="${tone.color}" stop-opacity="0.07"/>
      <stop offset="1" stop-color="${tone.color}" stop-opacity="0"/>
    </radialGradient>` : ''
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
      <pattern id="d" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="#ffffff" fill-opacity="0.05"/></pattern>
      ${glow}
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}"/>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#d)"/>
    ${tone ? `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>` : ''}
  </svg>`)
}

// Semicircle gauge, the same shape as the dashboard's Macro Compass arcs. Drawn left to right over
// the top; the filled share is the confidence score.
function gaugeUri(value, tone, size, stroke) {
  const r = size / 2 - stroke / 2
  const cx = size / 2
  const cy = size / 2
  const h = cy + stroke / 2
  const start = `${cx - r} ${cy}`
  const bg = `<path d="M ${start} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${stroke}" stroke-linecap="round"/>`
  let fill = ''
  if (value > 0) {
    const theta = Math.PI - (value / 100) * Math.PI
    const ex = (cx + r * Math.cos(theta)).toFixed(2)
    const ey = (cy - r * Math.sin(theta)).toFixed(2)
    fill = `<path d="M ${start} A ${r} ${r} 0 0 1 ${ex} ${ey}" fill="none" stroke="${tone.color}" stroke-width="${stroke}" stroke-linecap="round"/>`
  }
  return { uri: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${h}" viewBox="0 0 ${size} ${h}">${bg}${fill}</svg>`), h }
}

// Direction glyph as SVG so it does not depend on the font having arrow characters.
function arrowUri(tone) {
  const path = tone.up === true ? 'M12 2 L22 13 H15.5 V22 H8.5 V13 H2 Z'
    : tone.up === false ? 'M12 22 L2 11 H8.5 V2 H15.5 V11 H22 Z'
    : 'M2 12 L9 5 V9 H15 V5 L22 12 L15 19 V15 H9 V19 Z'
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="${path}" fill="${tone.color}"/></svg>`)
}
const arrow = (tone, size) => `<img src="${arrowUri(tone)}" width="${size}" height="${size}" style="width:${size}px;height:${size}px"/>`

// ── Shared pieces ─────────────────────────────────────────────────────────────
const label = (text, color = MUTED, size = 22) =>
  `<div style="display:flex;font-size:${size}px;font-weight:700;letter-spacing:4px;color:${color}">${txt(String(text).toUpperCase())}</div>`

function chip(name, value, color = TEXT) {
  return `<div style="display:flex;align-items:center;gap:14px;padding:14px 24px;border-radius:999px;background:${PANEL};border:2px solid ${HAIRLINE}">
    <div style="display:flex;font-size:20px;font-weight:700;letter-spacing:3px;color:${MUTED}">${txt(name.toUpperCase())}</div>
    <div style="display:flex;font-size:30px;font-weight:700;color:${color}">${txt(value)}</div>
  </div>`
}

// Grade colour by tier: A-range cyan, B-range emerald, anything lower recedes.
function gradeTier(grade) {
  const g = String(grade).trim().toUpperCase()
  if (g.startsWith('A')) return { color: CYAN, rgb: '6,182,212' }
  if (g.startsWith('B')) return { color: EMERALD, rgb: '16,185,129' }
  return { color: MUTED, rgb: '156,163,175' }
}
function gradeChip(grade, size = 30) {
  const t = gradeTier(grade)
  return `<div style="display:flex;align-items:center;gap:14px;padding:14px 26px;border-radius:999px;background:${rgba(t.rgb, 0.12)};border:2px solid ${rgba(t.rgb, 0.4)}">
    <div style="display:flex;font-size:${Math.round(size * 0.62)}px;font-weight:700;letter-spacing:3px;color:${MUTED}">GRADE</div>
    <div style="display:flex;font-size:${size}px;font-weight:700;color:${t.color}">${txt(String(grade).trim())}</div>
  </div>`
}

function directionBadge(tone, size = 40) {
  const pad = Math.round(size * 0.45)
  return `<div style="display:flex;align-items:center;gap:${Math.round(size * 0.35)}px;padding:${Math.round(pad * 0.7)}px ${pad + 8}px;border-radius:999px;background:${rgba(tone.rgb, 0.15)};border:2px solid ${rgba(tone.rgb, 0.55)}">
    ${arrow(tone, Math.round(size * 1.05))}
    <div style="display:flex;font-size:${size}px;font-weight:700;letter-spacing:${Math.round(size * 0.08)}px;color:${tone.color}">${txt(tone.word)}</div>
  </div>`
}

function gauge(value, tone, size = 320) {
  const stroke = Math.round(size * 0.085)
  const g = gaugeUri(value, tone, size, stroke)
  const num = Math.round(size * 0.27)
  return `<div style="display:flex;flex-direction:column;align-items:center;width:${size}px">
    <div style="display:flex;position:relative;width:${size}px;height:${g.h}px">
      <img src="${g.uri}" width="${size}" height="${g.h}" style="position:absolute;top:0;left:0;width:${size}px;height:${g.h}px"/>
      <div style="display:flex;flex-direction:column;align-items:center;position:absolute;left:0;bottom:0;width:${size}px">
        <div style="display:flex;font-size:${num}px;font-weight:700;line-height:1;color:${TEXT}">${txt(value)}</div>
        <div style="display:flex;font-size:${Math.round(num * 0.28)}px;margin-top:6px;color:${MUTED}">/100</div>
      </div>
    </div>
    <div style="display:flex;font-size:18px;font-weight:700;letter-spacing:4px;margin-top:18px;color:${MUTED}">CONFIDENCE</div>
  </div>`
}

function driverPanel(driver, tone, size = 34) {
  return `<div style="display:flex;flex-direction:column;gap:14px;padding:30px 36px;border-radius:20px;background:rgba(255,255,255,0.03);border:1px solid ${HAIRLINE};border-left:5px solid ${tone.color}">
    <div style="display:flex;font-size:18px;font-weight:700;letter-spacing:4px;color:${tone.color}">DRIVER</div>
    <div style="display:flex;font-size:${size}px;line-height:1.38;color:${TEXT}">${txt(driver)}</div>
  </div>`
}

const wordmark = () => `<div style="display:flex;align-items:center;gap:16px">
  <img src="${LOGO_URI}" width="44" height="44" style="width:44px;height:44px"/>
  <div style="display:flex;font-size:32px;font-weight:700;color:${TEXT};letter-spacing:-0.5px">BiasForge</div>
</div>`

const footer = () => `<div style="display:flex;padding-top:24px;border-top:2px solid ${HAIRLINE};font-size:22px;color:${MUTED}">${txt(FOOTER)}</div>`

// Canvas: backdrop image underneath, then top bar / body / footer. `tone` turns on the accent
// glow and the thin accent frame; `date` puts the card's date in the top-right corner.
function frame(body, { tone = null, date = null, glowX = WIDTH / 2, glowY = 420 } = {}) {
  const edge = tone ? `border:2px solid ${rgba(tone.rgb, 0.45)};` : ''
  return `<div style="display:flex;position:relative;width:${WIDTH}px;height:${HEIGHT}px;background:${BG};font-family:Inter;color:${TEXT}">
    <img src="${backdropUri(tone, glowX, glowY)}" width="${WIDTH}" height="${HEIGHT}" style="position:absolute;top:0;left:0;width:${WIDTH}px;height:${HEIGHT}px"/>
    <div style="display:flex;flex-direction:column;position:absolute;top:0;left:0;width:${WIDTH}px;height:${HEIGHT}px;padding:${PAD}px;${edge}">
      <div style="display:flex;align-items:center;justify-content:space-between">
        ${wordmark()}
        ${date ? `<div style="display:flex;font-size:22px;font-weight:700;letter-spacing:4px;color:${MUTED}">${txt(date)}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;flex-grow:1;min-height:0;overflow:hidden;margin-top:40px;margin-bottom:32px">${body}</div>
      ${footer()}
    </div>
  </div>`
}

// ── bias_card ─────────────────────────────────────────────────────────────────
// Reads exactly six fields. Anything else on `data` (invalidation, stop, target, levels) is never
// touched, so it cannot leak onto the card no matter what the caller passes.
function biasCardFields(data) {
  requireFields('bias_card', data, ['pair', 'direction', 'confidence', 'grade', 'driver'])
  const { pair, direction, confidence, grade, driver, date } = data
  return {
    pair: formatPair(pair),
    tone: directionTone(direction),
    confidence: confidenceValue(confidence),
    grade: String(grade).trim(),
    driver: truncate(driver),
    date: cardDate(date),
  }
}

const biasLayouts = [
  // 0 — hero: the pair is the headline, conviction and grade sit beneath it, driver closes.
  {
    glow: { x: 360, y: 400 },
    body: f => `
      <div style="display:flex;flex-direction:column;flex-grow:1;justify-content:space-between">
        <div style="display:flex;flex-direction:column">
          ${label('Daily bias')}
          <div style="display:flex;font-size:178px;font-weight:700;letter-spacing:-6px;line-height:1;margin-top:22px;color:${TEXT}">${txt(f.pair)}</div>
          <div style="display:flex;margin-top:34px">${directionBadge(f.tone, 44)}</div>
        </div>
        <div style="display:flex;align-items:flex-end;justify-content:space-between">
          ${gauge(f.confidence, f.tone, 390)}
          <div style="display:flex;flex-direction:column;align-items:flex-end;padding-bottom:64px">
            ${gradeChip(f.grade, 38)}
          </div>
        </div>
        ${driverPanel(f.driver, f.tone, 34)}
      </div>`,
  },

  // 1 — split: the pair stacked base-over-quote in a tall left column, conviction in its own
  // full-height panel on the right, driver across the bottom.
  {
    glow: { x: 300, y: 520 },
    body: f => {
      const [base, quote] = f.pair.includes('/') ? f.pair.split('/') : [f.pair, '']
      return `
      <div style="display:flex;flex-direction:column;flex-grow:1">
        <div style="display:flex;flex-grow:1;align-items:stretch;gap:40px;margin-bottom:36px">
          <div style="display:flex;flex-direction:column;justify-content:center;flex-grow:1">
            ${label('Daily bias')}
            <div style="display:flex;font-size:210px;font-weight:700;letter-spacing:-8px;line-height:0.92;margin-top:26px;color:${TEXT}">${txt(base)}</div>
            ${quote ? `<div style="display:flex;font-size:210px;font-weight:700;letter-spacing:-8px;line-height:0.92;color:rgba(229,231,235,0.42)">${txt(quote)}</div>` : ''}
            <div style="display:flex;margin-top:44px">${directionBadge(f.tone, 40)}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:space-around;width:370px;border-radius:28px;background:rgba(2,6,23,0.72);border:1px solid ${rgba(f.tone.rgb, 0.35)}">
            ${gauge(f.confidence, f.tone, 300)}
            <div style="display:flex;width:290px;height:1px;background:${HAIRLINE}"></div>
            ${gradeChip(f.grade, 34)}
          </div>
        </div>
        ${driverPanel(f.driver, f.tone, 36)}
      </div>`
    },
  },

  // 2 — minimal: everything centred on one axis; the gauge is the centrepiece.
  {
    glow: { x: WIDTH / 2, y: 330 },
    body: f => `
      <div style="display:flex;flex-direction:column;flex-grow:1;justify-content:space-between;align-items:center">
        <div style="display:flex;flex-direction:column;align-items:center">
          ${label('Daily bias')}
          <div style="display:flex;font-size:150px;font-weight:700;letter-spacing:-5px;line-height:1;margin-top:22px;color:${TEXT}">${txt(f.pair)}</div>
          <div style="display:flex;align-items:center;gap:18px;margin-top:32px">
            ${directionBadge(f.tone, 36)}
            ${gradeChip(f.grade, 30)}
          </div>
        </div>
        ${gauge(f.confidence, f.tone, 360)}
        <div style="display:flex;width:${WIDTH - PAD * 2}px">${driverPanel(f.driver, f.tone, 34)}</div>
      </div>`,
  },
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
    !isBlank(ev.forecast) && `<div style="display:flex;gap:8px">Forecast <span style="color:${TEXT};font-weight:700">${txt(ev.forecast)}</span></div>`,
    !isBlank(ev.previous) && `<div style="display:flex;gap:8px">Previous <span style="color:${TEXT};font-weight:700">${txt(ev.previous)}</span></div>`,
  ].filter(Boolean)
  return `<div style="display:flex;align-items:center;gap:32px;padding:32px 36px;border-radius:20px;background:${PANEL};border:2px solid ${HAIRLINE};border-left:8px solid ${high ? CYAN : HAIRLINE}">
    <div style="display:flex;flex-direction:column;width:200px">
      <div style="display:flex;font-size:32px;font-weight:700;white-space:nowrap;color:${TEXT}">${txt(t.utc)}</div>
      ${t.pkt ? `<div style="display:flex;font-size:22px;margin-top:6px;color:${MUTED}">${txt(t.pkt)}</div>` : ''}
    </div>
    <div style="display:flex;padding:10px 18px;border-radius:12px;background:rgba(6,182,212,0.12);font-size:26px;font-weight:700;letter-spacing:2px;color:${CYAN}">${txt(String(ev.currency).toUpperCase())}</div>
    <div style="display:flex;flex-direction:column;flex:1">
      <div style="display:flex;font-size:32px;font-weight:700;line-height:1.25;color:${TEXT}">${txt(truncate(ev.title, 60))}</div>
      ${nums.length ? `<div style="display:flex;gap:28px;margin-top:10px;font-size:24px;color:${MUTED}">${nums.join('')}</div>` : ''}
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
    <div style="display:flex;font-size:72px;font-weight:700;letter-spacing:-2px;margin-top:20px;color:${TEXT}">${txt(data.dateLabel)}</div>
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
    <div style="display:flex;width:150px;font-size:26px;color:${MUTED}">${txt(row.date)}</div>
    <div style="display:flex;width:250px;font-size:38px;font-weight:700;color:${TEXT}">${txt(formatPair(row.pair))}</div>
    <div style="display:flex;flex:1;align-items:center;gap:12px">
      ${arrow(tone, 30)}
      <div style="display:flex;font-size:28px;font-weight:700;color:${tone.color}">${txt(tone.word)}</div>
    </div>
    <div style="display:flex;justify-content:center;width:150px;padding:12px 0;border-radius:12px;background:${o.bg};border:2px solid ${o.color};font-size:26px;font-weight:700;letter-spacing:3px;color:${o.color}">${txt(o.text)}</div>
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
    <div style="display:flex;font-size:72px;font-weight:700;letter-spacing:-2px;margin-top:20px;color:${TEXT}">${txt(data.rangeLabel)}</div>
    <div style="display:flex;font-size:28px;margin-top:16px;color:${MUTED}">Every call as it was made. Hits and misses alike.</div>
    <div style="display:flex;flex-direction:column;gap:14px;margin-top:36px">${rows.map(scorecardRow).join('')}</div>`
}

// ── Entry point ───────────────────────────────────────────────────────────────
function buildMarkup(kind, data, layoutIndex) {
  switch (kind) {
    case 'bias_card': {
      const n = LAYOUT_COUNTS.bias_card
      const layout = biasLayouts[((Math.trunc(Number(layoutIndex) || 0) % n) + n) % n]
      const f = biasCardFields(data)
      return frame(layout.body(f), { tone: f.tone, date: f.date, glowX: layout.glow.x, glowY: layout.glow.y })
    }
    case 'event_preview': return frame(eventPreview(data))
    case 'weekly_scorecard': return frame(weeklyScorecard(data))
    default: throw new Error(`renderCard: unknown kind "${kind}" (expected ${Object.keys(LAYOUT_COUNTS).join(', ')})`)
  }
}

// The exact node tree handed to satori, with every text node already holding its raw string.
// Exported so tests can check what satori is given, not just that a PNG came out.
export function buildCardTree(kind, data, layoutIndex = 0) {
  TEXTS = []
  try {
    const markup = buildMarkup(kind, data, layoutIndex)
    // satori-html's html() is a template tag; hand it the finished markup as a one-part template.
    const node = html(Object.assign([markup], { raw: [markup] }))
    return fillText(node, TEXTS)
  } finally {
    TEXTS = null
  }
}

export async function renderCard(kind, data, layoutIndex = 0) {
  const tree = buildCardTree(kind, data, layoutIndex)
  const svg = await satori(tree, { width: WIDTH, height: HEIGHT, fonts: FONTS })
  return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH }, font: { loadSystemFonts: false } }).render().asPng()
}
