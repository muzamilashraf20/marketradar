// Social card renderer: HTML string -> satori-html -> satori (SVG) -> resvg (PNG).
//
// No headless browser: satori + resvg run in-process in a few MB, which Railway can afford where
// Chromium cannot. The cost is that satori understands only a subset of CSS — flexbox but no grid,
// no CSS filter/blur, and every div with more than one child must say display:flex. So:
//   · glow comes from box-shadow (satori turns it into an SVG filter) and radial gradients;
//   · anything with gradients, patterns, arcs or blur is drawn as an SVG data URI and placed with
//     <img>, which resvg rasterises with full SVG support.
//
// Visual language: "macro engine HUD" — deep #030712 base, cyan/emerald nebula glows plus the card's
// accent colour, a faint grid and scanlines, glass panels with HUD corner brackets, neon arc gauges.
// Readability first: body text always sits on a glass panel, never on the textured background.
//
// Public-copy rules also hold for images: a bias card shows direction and conviction only, never the
// invalidation level, a stop or a target (those are what Pro pays for), and the scorecard shows
// individual calls without any aggregate that would read as a performance claim. Empty space is
// filled only with true elements (engine inputs, session times, the gauge) — never invented numbers,
// charts or price lines.

import { readFileSync } from 'node:fs'
import satori from 'satori'
import { html } from 'satori-html'
import { Resvg } from '@resvg/resvg-js'

// ── Brand tokens ──────────────────────────────────────────────────────────────
const BG = '#030712'
const CYAN = '#06b6d4'
const EMERALD = '#10b981'
const RED = '#ef4444'
const AMBER = '#f59e0b'
const TEXT = '#e5e7eb'
const MUTED = '#94a3b8'          // on the dark panels this is ~7:1 contrast
const DIM = '#64748b'
const HAIRLINE = 'rgba(255,255,255,0.08)'
const RGB = { [CYAN]: '6,182,212', [EMERALD]: '16,185,129', [RED]: '239,68,68', [AMBER]: '245,158,11', [MUTED]: '148,163,184' }
const rgba = (hex, a) => `rgba(${RGB[hex] || '148,163,184'},${a})`

const FORMATS = {
  post: { w: 1080, h: 1350, safeTop: 0, safeBottom: 0 },
  // Instagram draws its own UI over the top and bottom 250px of a story; nothing readable goes there.
  story: { w: 1080, h: 1920, safeTop: 250, safeBottom: 250 },
}
export const STORY_SAFE_PX = 250
const PAD = 56
const FOOTER = 'biasforge.co · Educational macro analysis — not financial advice'
const DRIVER_MAX = 140
// Real facts about the engine, used as honest filler: the v2 bias engine reads these five inputs.
const ENGINE_INPUTS = ['PRICE', 'CALENDAR', 'NEWS', 'COT', 'YIELDS']
// Standard FX session windows in UTC (approximate, as commonly quoted).
const SESSIONS = [
  { name: 'ASIA', from: 0, to: 9 },
  { name: 'LONDON', from: 7, to: 16 },
  { name: 'NEW YORK', from: 12, to: 21 },
]

export const LAYOUT_COUNTS = { bias_card: 3, event_preview: 1, weekly_scorecard: 1, news_flash: 1 }

// Read once at import; every render reuses the same buffers.
const FONTS = [
  { name: 'Inter', weight: 400, style: 'normal', data: readFileSync(new URL('./fonts/Inter-Regular.ttf', import.meta.url)) },
  { name: 'Inter', weight: 700, style: 'normal', data: readFileSync(new URL('./fonts/Inter-Bold.ttf', import.meta.url)) },
  { name: 'JetBrains Mono', weight: 400, style: 'normal', data: readFileSync(new URL('./fonts/JetBrainsMono-Regular.ttf', import.meta.url)) },
  { name: 'JetBrains Mono', weight: 700, style: 'normal', data: readFileSync(new URL('./fonts/JetBrainsMono-Bold.ttf', import.meta.url)) },
]
const MONO = "font-family:'JetBrains Mono'"

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

// "MON 21 SEP 2026". A card without a date can be screenshotted and passed around as if current.
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
function cardDate(input) {
  let d = input ? new Date(input) : new Date()
  if (Number.isNaN(d.getTime())) d = new Date()
  return `${DAYS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

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
  if (mins == null) return { utc: s || '—', pkt: null, mins: null }
  return { utc: `${hhmm(mins)} UTC`, pkt: `${hhmm((mins + PKT_OFFSET_MIN) % 1440)} PKT`, mins }
}
const isHighImpact = impact => /high|red/i.test(String(impact ?? '')) || Number(impact) === 3

// ── SVG as images ─────────────────────────────────────────────────────────────
const svgUri = svg => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
const img = (uri, w, h, extra = '') => `<img src="${uri}" width="${w}" height="${h}" style="width:${w}px;height:${h}px;${extra}"/>`

const LOGO_URI = svgUri('<svg width="44" height="44" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bfg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#06b6d4"/><stop offset="1" stop-color="#10b981"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="url(#bfg)"/><polyline points="20.5,49 37.3,49 43.2,26 55.5,74.5 63.6,37.3 71.8,49 82.7,49" fill="none" stroke="#030712" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')

// The whole background in one SVG: base, nebula glows (cyan, emerald, and the accent where the eye
// should land), a flat grid faded toward the edges, scanlines, and a vignette. No lines or curves
// that could be read as price data.
function backdropUri(w, h, accent, glowX, glowY) {
  const ac = accent || CYAN
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="nc" gradientUnits="userSpaceOnUse" cx="${w * 0.12}" cy="${h * 0.08}" r="${w * 0.75}"><stop offset="0" stop-color="${CYAN}" stop-opacity="0.20"/><stop offset="1" stop-color="${CYAN}" stop-opacity="0"/></radialGradient>
    <radialGradient id="ne" gradientUnits="userSpaceOnUse" cx="${w * 0.92}" cy="${h * 0.9}" r="${w * 0.8}"><stop offset="0" stop-color="${EMERALD}" stop-opacity="0.16"/><stop offset="1" stop-color="${EMERALD}" stop-opacity="0"/></radialGradient>
    <radialGradient id="na" gradientUnits="userSpaceOnUse" cx="${glowX}" cy="${glowY}" r="${w * 0.62}"><stop offset="0" stop-color="${ac}" stop-opacity="0.30"/><stop offset="0.5" stop-color="${ac}" stop-opacity="0.08"/><stop offset="1" stop-color="${ac}" stop-opacity="0"/></radialGradient>
    <pattern id="grid" width="54" height="54" patternUnits="userSpaceOnUse"><path d="M54 0H0V54" fill="none" stroke="#ffffff" stroke-opacity="0.055" stroke-width="1"/></pattern>
    <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#ffffff" fill-opacity="0.025"/></pattern>
    <radialGradient id="gm" cx="0.5" cy="0.45" r="0.7"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <mask id="fade"><rect width="${w}" height="${h}" fill="url(#gm)"/></mask>
    <radialGradient id="vig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="${BG}"/>
  <rect width="${w}" height="${h}" fill="url(#nc)"/>
  <rect width="${w}" height="${h}" fill="url(#ne)"/>
  <rect width="${w}" height="${h}" fill="url(#na)"/>
  <rect width="${w}" height="${h}" fill="url(#grid)" mask="url(#fade)"/>
  <rect width="${w}" height="${h}" fill="url(#scan)"/>
  <rect width="${w}" height="${h}" fill="url(#vig)"/>
</svg>`)
}

// Decoration for the story's top and bottom zones, where Instagram draws its UI: concentric HUD
// rings and a sweep line. Graphics only — no text lives in those zones.
function storyRingsUri(w, h, accent) {
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <g fill="none" stroke="${accent}" stroke-opacity="0.18">
    <circle cx="${w / 2}" cy="${h / 2}" r="${h * 0.46}" stroke-width="1.5"/>
    <circle cx="${w / 2}" cy="${h / 2}" r="${h * 0.34}" stroke-width="1" stroke-dasharray="4 10"/>
    <circle cx="${w / 2}" cy="${h / 2}" r="${h * 0.22}" stroke-width="1"/>
  </g>
  <line x1="${w * 0.08}" y1="${h / 2}" x2="${w * 0.92}" y2="${h / 2}" stroke="${accent}" stroke-opacity="0.25" stroke-width="1"/>
</svg>`)
}

// Semicircle gauge with tick marks and a glowing fill, like the dashboard's Macro Compass arcs.
function gaugeUri(value, accent, size) {
  const stroke = Math.round(size * 0.075)
  const r = size / 2 - stroke / 2 - 4
  const cx = size / 2, cy = size / 2
  const h = Math.round(cy + stroke / 2 + 6)
  const pt = (v, rr) => { const t = Math.PI - (v / 100) * Math.PI; return [(cx + rr * Math.cos(t)).toFixed(2), (cy - rr * Math.sin(t)).toFixed(2)] }
  const [sx, sy] = pt(0, r)
  const [ex, ey] = pt(100, r)
  let ticks = ''
  for (let v = 0; v <= 100; v += 5) {
    const major = v % 25 === 0
    const r1 = r - stroke / 2 - 8
    const r2 = r1 - (major ? 18 : 9)
    const [x1, y1] = pt(v, r1), [x2, y2] = pt(v, r2)
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${v <= value ? accent : '#ffffff'}" stroke-opacity="${v <= value ? (major ? 0.9 : 0.55) : 0.16}" stroke-width="${major ? 3 : 2}" stroke-linecap="round"/>`
  }
  let fill = ''
  if (value > 0) {
    const [fx, fy] = pt(value, r)
    const d = `M ${sx} ${sy} A ${r} ${r} 0 0 1 ${fx} ${fy}`
    fill = `<path d="${d}" fill="none" stroke="${accent}" stroke-width="${stroke}" stroke-linecap="round" filter="url(#glow)" stroke-opacity="0.9"/>
      <path d="${d}" fill="none" stroke="${accent}" stroke-width="${stroke}" stroke-linecap="round"/>
      <circle cx="${fx}" cy="${fy}" r="${stroke * 0.36}" fill="#ffffff" fill-opacity="0.9"/>`
  }
  return { h, uri: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${h}" viewBox="0 0 ${size} ${h}">
    <defs><filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${Math.round(stroke * 0.55)}"/></filter></defs>
    <path d="M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}" fill="none" stroke="#ffffff" stroke-opacity="0.07" stroke-width="${stroke}" stroke-linecap="round"/>
    ${ticks}${fill}
  </svg>`) }
}

// Direction glyph as SVG so it does not depend on the font having arrow characters.
function arrowUri(color, up) {
  const path = up === true ? 'M12 2 L22 13 H15.5 V22 H8.5 V13 H2 Z'
    : up === false ? 'M12 22 L2 11 H8.5 V2 H15.5 V11 H22 Z'
    : 'M2 12 L9 5 V9 H15 V5 L22 12 L15 19 V15 H9 V19 Z'
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="${path}" fill="${color}"/></svg>`)
}
const arrow = (color, up, size) => img(arrowUri(color, up), size, size)

// Concentric "pulse" rings for the news card's HIGH IMPACT marker.
function pulseUri(color, size) {
  const c = size / 2
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${size * 0.06}"/></filter></defs>
    <circle cx="${c}" cy="${c}" r="${size * 0.46}" fill="none" stroke="${color}" stroke-opacity="0.22" stroke-width="2"/>
    <circle cx="${c}" cy="${c}" r="${size * 0.32}" fill="none" stroke="${color}" stroke-opacity="0.45" stroke-width="2"/>
    <circle cx="${c}" cy="${c}" r="${size * 0.16}" fill="${color}" filter="url(#g)"/>
    <circle cx="${c}" cy="${c}" r="${size * 0.12}" fill="${color}"/>
  </svg>`)
}

// ── HUD building blocks ───────────────────────────────────────────────────────
const mono = (text, color = MUTED, size = 20, spacing = 4, weight = 400) =>
  `<div style="display:flex;${MONO};font-size:${size}px;font-weight:${weight};letter-spacing:${spacing}px;color:${color}">${txt(String(text).toUpperCase())}</div>`

// Four L-shaped corner brackets, absolutely placed inside a position:relative panel.
function brackets(color, len = 22, weight = 2) {
  const s = `position:absolute;width:${len}px;height:${len}px`
  const c = rgba(color, 0.9)
  return `<div style="display:flex;${s};top:-1px;left:-1px;border-top:${weight}px solid ${c};border-left:${weight}px solid ${c};border-top-left-radius:6px"></div>
    <div style="display:flex;${s};top:-1px;right:-1px;border-top:${weight}px solid ${c};border-right:${weight}px solid ${c};border-top-right-radius:6px"></div>
    <div style="display:flex;${s};bottom:-1px;left:-1px;border-bottom:${weight}px solid ${c};border-left:${weight}px solid ${c};border-bottom-left-radius:6px"></div>
    <div style="display:flex;${s};bottom:-1px;right:-1px;border-bottom:${weight}px solid ${c};border-right:${weight}px solid ${c};border-bottom-right-radius:6px"></div>`
}

// Glass panel: translucent fill over a dark backing (so text contrast holds whatever the backdrop
// does), a thin accent border, a soft accent glow, optional HUD brackets.
function glass(inner, { accent = CYAN, pad = '28px 32px', dir = 'column', gap = 14, extra = '', bracket = true, glow = 0.22, radius = 18 } = {}) {
  return `<div style="display:flex;position:relative;flex-direction:${dir};gap:${gap}px;padding:${pad};border-radius:${radius}px;background-color:rgba(3,7,18,0.66);background-image:linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));border:1px solid ${rgba(accent, 0.35)};box-shadow:0 0 36px ${rgba(accent, glow)};${extra}">
    ${inner}
    ${bracket ? brackets(accent) : ''}
  </div>`
}

// Thin neon rule with glow.
const neonLine = (accent, width = '100%') => `<div style="display:flex;width:${width};height:2px;border-radius:1px;background:${accent};box-shadow:0 0 12px ${rgba(accent, 0.8)}"></div>`

function directionBadge(tone, size = 40) {
  const pad = Math.round(size * 0.42)
  return `<div style="display:flex;align-items:center;gap:${Math.round(size * 0.34)}px;padding:${Math.round(pad * 0.7)}px ${pad + 10}px;border-radius:999px;background:${rgba(tone.color, 0.16)};border:2px solid ${rgba(tone.color, 0.7)};box-shadow:0 0 30px ${rgba(tone.color, 0.5)}">
    ${arrow(tone.color, tone.up, Math.round(size * 1.05))}
    <div style="display:flex;font-size:${size}px;font-weight:700;letter-spacing:${Math.round(size * 0.08)}px;color:${tone.color}">${txt(tone.word)}</div>
  </div>`
}

// Grade colour by tier: A-range cyan, B-range emerald, anything lower recedes.
function gradeTier(grade) {
  const g = String(grade).trim().toUpperCase()
  if (g.startsWith('A')) return CYAN
  if (g.startsWith('B')) return EMERALD
  return MUTED
}
function gradeChip(grade, size = 34) {
  const c = gradeTier(grade)
  return `<div style="display:flex;align-items:center;gap:16px;padding:14px 26px;border-radius:14px;background:${rgba(c, 0.12)};border:1px solid ${rgba(c, 0.5)};box-shadow:0 0 22px ${rgba(c, 0.25)}">
    ${mono('Grade', MUTED, Math.round(size * 0.5), 4)}
    <div style="display:flex;font-size:${size}px;font-weight:700;color:${c}">${txt(String(grade).trim())}</div>
  </div>`
}

function gauge(value, accent, size = 360, label = true) {
  const g = gaugeUri(value, accent, size)
  const num = Math.round(size * 0.24)
  return `<div style="display:flex;flex-direction:column;align-items:center;width:${size}px">
    <div style="display:flex;position:relative;width:${size}px;height:${g.h}px">
      ${img(g.uri, size, g.h, 'position:absolute;top:0;left:0')}
      <div style="display:flex;flex-direction:column;align-items:center;position:absolute;left:0;bottom:${Math.round(size * 0.02)}px;width:${size}px">
        <div style="display:flex;font-size:${num}px;font-weight:700;line-height:1;color:${TEXT}">${txt(value)}</div>
        <div style="display:flex;${MONO};font-size:${Math.round(num * 0.26)}px;margin-top:6px;color:${MUTED}">/100</div>
      </div>
    </div>
    ${label ? `<div style="display:flex;margin-top:16px">${mono('Confidence', MUTED, 18, 5)}</div>` : ''}
  </div>`
}

// "ENGINE v2 · INPUTS: …" — the five things the engine actually reads. True filler, not decoration.
function engineStrip(accent, { compact = false } = {}) {
  const chips = ENGINE_INPUTS.map(i => `<div style="display:flex;align-items:center;gap:10px;padding:${compact ? '8px 14px' : '10px 16px'};border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid ${HAIRLINE}">
      <div style="display:flex;width:8px;height:8px;border-radius:4px;background:${accent};box-shadow:0 0 8px ${rgba(accent, 0.9)}"></div>
      ${mono(i, TEXT, compact ? 16 : 18, 2)}
    </div>`).join('')
  return glass(`
    <div style="display:flex;align-items:center;justify-content:space-between">
      ${mono('Engine v2', accent, compact ? 18 : 20, 5, 700)}
      ${mono('Inputs', DIM, compact ? 16 : 18, 5)}
    </div>
    <div style="display:flex;justify-content:space-between;gap:10px">${chips}</div>`,
  { accent, pad: compact ? '18px 22px' : '22px 26px', gap: compact ? 12 : 16, bracket: false, glow: 0.12 })
}

// A 24-hour UTC timeline with the three main FX sessions drawn to scale, and optional markers
// (event times). All of it is fixed, true information.
function sessionStrip(accent, markersMins = [], width = 968) {
  const inner = width - 52
  const x = h => Math.round((h / 24) * inner)
  const bands = SESSIONS.map((s, i) => `<div style="display:flex;position:absolute;left:${x(s.from)}px;top:${6 + i * 22}px;width:${x(s.to) - x(s.from)}px;height:16px;border-radius:8px;background:${rgba(i === 1 ? EMERALD : CYAN, 0.28)};border:1px solid ${rgba(i === 1 ? EMERALD : CYAN, 0.55)}"></div>`).join('')
  const names = SESSIONS.map((s, i) => `<div style="display:flex;position:absolute;left:${x(s.from) + 10}px;top:${4 + i * 22}px;${MONO};font-size:13px;letter-spacing:2px;color:${TEXT}">${txt(`${s.name} ${String(s.from).padStart(2, '0')}–${String(s.to).padStart(2, '0')}`)}</div>`).join('')
  const marks = markersMins.filter(m => Number.isFinite(m)).map(m => `<div style="display:flex;position:absolute;left:${Math.round((m / 1440) * inner) - 1}px;top:0px;width:3px;height:74px;border-radius:2px;background:${accent};box-shadow:0 0 12px ${rgba(accent, 0.95)}"></div>`).join('')
  const scale = [0, 6, 12, 18, 24].map(h => `<div style="display:flex;position:absolute;left:${Math.max(0, x(h) - (h === 24 ? 34 : h === 0 ? 0 : 16))}px;top:80px;${MONO};font-size:14px;color:${DIM}">${txt(`${String(h).padStart(2, '0')}:00`)}</div>`).join('')
  return glass(`
    <div style="display:flex;align-items:center;justify-content:space-between">
      ${mono('Sessions · UTC', MUTED, 18, 4)}
      ${markersMins.length ? `<div style="display:flex;align-items:center;gap:8px"><div style="display:flex;width:12px;height:12px;border-radius:2px;background:${accent}"></div>${mono('Event', MUTED, 16, 3)}</div>` : '<div style="display:flex"></div>'}
    </div>
    <div style="display:flex;position:relative;width:${inner}px;height:100px">${bands}${names}${marks}${scale}</div>`,
  { accent, pad: '20px 26px', gap: 12, bracket: false, glow: 0.1 })
}

const wordmark = () => `<div style="display:flex;align-items:center;gap:16px">
  ${img(LOGO_URI, 44, 44)}
  <div style="display:flex;font-size:32px;font-weight:700;color:${TEXT};letter-spacing:-0.5px">BiasForge</div>
</div>`

const topBar = (date, accent) => `<div style="display:flex;align-items:center;justify-content:space-between">
  ${wordmark()}
  <div style="display:flex;align-items:center;gap:14px">
    <div style="display:flex;width:10px;height:10px;border-radius:5px;background:${accent};box-shadow:0 0 10px ${rgba(accent, 0.9)}"></div>
    ${mono(date, MUTED, 22, 4)}
  </div>
</div>`

const footer = () => `<div style="display:flex;padding-top:22px;border-top:1px solid ${HAIRLINE};font-size:22px;color:${MUTED}">${txt(FOOTER)}</div>`

// Canvas. The backdrop covers the whole canvas; the content frame is inset by the format's safe
// zones, so on a story everything readable lands between y=250 and y=1670.
function frame(body, { fmt, accent, glowX, glowY, date }) {
  const { w, h, safeTop, safeBottom } = FORMATS[fmt]
  const top = safeTop ? safeTop + 16 : 0
  const bottom = safeBottom ? safeBottom + 16 : 0
  const innerH = h - top - bottom
  const rings = safeTop
    ? `${img(storyRingsUri(w, safeTop), w, safeTop, 'position:absolute;top:0;left:0')}${img(storyRingsUri(w, safeBottom), w, safeBottom, 'position:absolute;bottom:0;left:0')}`
    : ''
  return `<div style="display:flex;position:relative;width:${w}px;height:${h}px;background:${BG};font-family:Inter;color:${TEXT}">
    ${img(backdropUri(w, h, accent, glowX, glowY), w, h, 'position:absolute;top:0;left:0')}
    ${rings}
    <div style="display:flex;flex-direction:column;position:absolute;top:${top}px;left:0;width:${w}px;height:${innerH}px;padding:${PAD}px;border:${safeTop ? 0 : 2}px solid ${rgba(accent, 0.4)}">
      ${topBar(date, accent)}
      <div style="display:flex;flex-direction:column;flex-grow:1;min-height:0;overflow:hidden;margin-top:34px;margin-bottom:28px">${body}</div>
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

const driverPanel = (f, size = 34) => glass(`
  <div style="display:flex;align-items:center;gap:14px">${neonLine(f.tone.color, '28px')}${mono('Driver', f.tone.color, 18, 5, 700)}</div>
  <div style="display:flex;font-size:${size}px;line-height:1.38;color:${TEXT}">${txt(f.driver)}</div>`,
{ accent: f.tone.color, pad: '28px 34px' })

const biasLayouts = {
  // 0 — hero: the pair is the headline, gauge and grade beneath, driver and engine strip close.
  0: f => ({
    glow: [340, 380],
    body: `
      <div style="display:flex;flex-direction:column;flex-grow:1;justify-content:space-between">
        <div style="display:flex;flex-direction:column">
          <div style="display:flex;align-items:center;gap:14px">${neonLine(f.tone.color, '40px')}${mono('Engine read · Daily bias', MUTED, 20, 5)}</div>
          <div style="display:flex;font-size:180px;font-weight:700;letter-spacing:-6px;line-height:1;margin-top:18px;color:${TEXT}">${txt(f.pair)}</div>
          <div style="display:flex;margin-top:28px">${directionBadge(f.tone, 44)}</div>
        </div>
        <div style="display:flex;align-items:flex-end;justify-content:space-between">
          ${gauge(f.confidence, f.tone.color, 430)}
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:18px;padding-bottom:44px">${gradeChip(f.grade, 40)}</div>
        </div>
        ${driverPanel(f, 34)}
        ${engineStrip(f.tone.color, { compact: true })}
      </div>`,
  }),

  // 1 — split: the pair stacked base-over-quote on the left, conviction panel on the right.
  1: f => {
    const [base, quote] = f.pair.includes('/') ? f.pair.split('/') : [f.pair, '']
    return {
      glow: [300, 520],
      body: `
        <div style="display:flex;flex-direction:column;flex-grow:1">
          <div style="display:flex;flex-grow:1;align-items:center;gap:34px;margin-bottom:26px">
            <div style="display:flex;flex-direction:column;justify-content:center;flex-grow:1">
              <div style="display:flex;align-items:center;gap:14px">${neonLine(f.tone.color, '40px')}${mono('Engine read', MUTED, 20, 5)}</div>
              <div style="display:flex;font-size:200px;font-weight:700;letter-spacing:-8px;line-height:0.92;margin-top:22px;color:${TEXT}">${txt(base)}</div>
              ${quote ? `<div style="display:flex;font-size:200px;font-weight:700;letter-spacing:-8px;line-height:0.92;color:rgba(229,231,235,0.42)">${txt(quote)}</div>` : ''}
              <div style="display:flex;margin-top:36px">${directionBadge(f.tone, 38)}</div>
            </div>
            ${glass(`
              ${gauge(f.confidence, f.tone.color, 320)}
              <div style="display:flex;width:280px;height:1px;background:${HAIRLINE}"></div>
              ${gradeChip(f.grade, 34)}`,
            { accent: f.tone.color, pad: '44px 28px', gap: 40, extra: 'width:370px;align-items:center;justify-content:center' })}
          </div>
          <div style="display:flex;flex-direction:column;gap:22px">
            ${driverPanel(f, 34)}
            ${engineStrip(f.tone.color, { compact: true })}
          </div>
        </div>`,
    }
  },

  // 2 — minimal: everything on one axis; the gauge is the centrepiece.
  2: f => ({
    glow: [540, 330],
    body: `
      <div style="display:flex;flex-direction:column;flex-grow:1;justify-content:space-between;align-items:center">
        <div style="display:flex;flex-direction:column;align-items:center">
          ${mono('Engine read · Daily bias', MUTED, 20, 5)}
          <div style="display:flex;font-size:150px;font-weight:700;letter-spacing:-5px;line-height:1;margin-top:18px;color:${TEXT}">${txt(f.pair)}</div>
          <div style="display:flex;align-items:center;gap:18px;margin-top:26px">${directionBadge(f.tone, 36)}${gradeChip(f.grade, 32)}</div>
        </div>
        ${gauge(f.confidence, f.tone.color, 440)}
        <div style="display:flex;flex-direction:column;gap:22px;width:968px">
          ${driverPanel(f, 34)}
          ${engineStrip(f.tone.color, { compact: true })}
        </div>
      </div>`,
  }),
}

// Story: re-composed vertically — gauge centred and large, everything stacked, sessions strip added.
const biasStory = f => ({
  glow: [540, 700],
  body: `
    <div style="display:flex;flex-direction:column;flex-grow:1;justify-content:space-between;align-items:center">
      <div style="display:flex;flex-direction:column;align-items:center">
        ${mono('Engine read · Daily bias', MUTED, 22, 5)}
        <div style="display:flex;font-size:170px;font-weight:700;letter-spacing:-6px;line-height:1;margin-top:18px;color:${TEXT}">${txt(f.pair)}</div>
        <div style="display:flex;align-items:center;gap:18px;margin-top:26px">${directionBadge(f.tone, 40)}${gradeChip(f.grade, 34)}</div>
      </div>
      ${gauge(f.confidence, f.tone.color, 440)}
      <div style="display:flex;flex-direction:column;gap:22px;width:968px">
        ${driverPanel(f, 36)}
        ${engineStrip(f.tone.color, { compact: true })}
      </div>
    </div>`,
})

// ── event_preview ─────────────────────────────────────────────────────────────
function impactBars(impact, accent) {
  const level = isHighImpact(impact) ? 3 : /med/i.test(String(impact ?? '')) || Number(impact) === 2 ? 2 : 1
  return `<div style="display:flex;align-items:flex-end;gap:5px">${[1, 2, 3].map(i => `<div style="display:flex;width:9px;height:${8 + i * 7}px;border-radius:2px;background:${i <= level ? accent : 'rgba(255,255,255,0.12)'};${i <= level ? `box-shadow:0 0 8px ${rgba(accent, 0.8)}` : ''}"></div>`).join('')}</div>`
}

function currencyChip(ccy, size = 26) {
  return `<div style="display:flex;padding:8px 16px;border-radius:10px;background:${rgba(CYAN, 0.14)};border:1px solid ${rgba(CYAN, 0.5)};${MONO};font-size:${size}px;font-weight:700;letter-spacing:2px;color:${CYAN}">${txt(String(ccy).toUpperCase())}</div>`
}

const numBox = (label, value, big = false) => `<div style="display:flex;flex-direction:column;gap:8px;padding:${big ? '18px 24px' : '10px 16px'};border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid ${HAIRLINE}">
  ${mono(label, DIM, big ? 16 : 14, 3)}
  <div style="display:flex;${MONO};font-size:${big ? 40 : 26}px;font-weight:700;color:${TEXT}">${txt(value)}</div>
</div>`

function eventRow(ev, accent) {
  const t = eventTimes(ev.time)
  const nums = [!isBlank(ev.forecast) && numBox('Forecast', ev.forecast), !isBlank(ev.previous) && numBox('Previous', ev.previous)].filter(Boolean)
  return glass(`
    <div style="display:flex;flex-direction:column;width:190px">
      <div style="display:flex;${MONO};font-size:30px;font-weight:700;white-space:nowrap;color:${TEXT}">${txt(t.utc)}</div>
      ${t.pkt ? `<div style="display:flex;${MONO};font-size:18px;margin-top:6px;color:${MUTED}">${txt(t.pkt)}</div>` : ''}
    </div>
    <div style="display:flex;flex-direction:column;flex:1;gap:12px">
      <div style="display:flex;align-items:center;gap:14px">${currencyChip(ev.currency, 22)}${impactBars(ev.impact, isHighImpact(ev.impact) ? accent : MUTED)}</div>
      <div style="display:flex;font-size:30px;font-weight:700;line-height:1.22;color:${TEXT}">${txt(truncate(ev.title, 60))}</div>
    </div>
    ${nums.length ? `<div style="display:flex;gap:10px">${nums.join('')}</div>` : ''}`,
  { accent: isHighImpact(ev.impact) ? accent : MUTED, dir: 'row', pad: '24px 26px', gap: 22, extra: 'align-items:center', glow: isHighImpact(ev.impact) ? 0.2 : 0.06 })
}

// One event: a full hero panel — time, currency, title, impact, forecast/previous — large enough to
// carry the card, instead of one row and a blank lower half.
function eventHero(ev, accent, story) {
  const t = eventTimes(ev.time)
  const nums = [!isBlank(ev.forecast) && numBox('Forecast', ev.forecast, true), !isBlank(ev.previous) && numBox('Previous', ev.previous, true)].filter(Boolean)
  return glass(`
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:16px">${currencyChip(ev.currency, 30)}${impactBars(ev.impact, isHighImpact(ev.impact) ? accent : MUTED)}</div>
      ${mono(isHighImpact(ev.impact) ? 'High impact' : String(ev.impact || '').toUpperCase(), isHighImpact(ev.impact) ? accent : MUTED, 18, 4, 700)}
    </div>
    <div style="display:flex;font-size:${story ? 64 : 58}px;font-weight:700;line-height:1.12;letter-spacing:-1px;color:${TEXT}">${txt(truncate(ev.title, 70))}</div>
    ${neonLine(accent)}
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px">
      <div style="display:flex;flex-direction:column">
        ${mono('Release', DIM, 16, 4)}
        <div style="display:flex;${MONO};font-size:${story ? 76 : 68}px;font-weight:700;line-height:1.05;color:${TEXT}">${txt(t.utc)}</div>
        ${t.pkt ? `<div style="display:flex;${MONO};font-size:26px;margin-top:6px;color:${MUTED}">${txt(t.pkt)}</div>` : ''}
      </div>
      ${nums.length ? `<div style="display:flex;gap:14px">${nums.join('')}</div>` : ''}
    </div>`,
  { accent, pad: '36px 40px', gap: 26, glow: 0.28 })
}

function eventPreview(data, fmt) {
  requireFields('event_preview', data, ['dateLabel'])
  if (!Array.isArray(data.events) || !data.events.length) throw new Error('renderCard(event_preview): data.events must be a non-empty array')
  const events = data.events.slice(0, 4)
  events.forEach((ev, i) => requireFields('event_preview', ev, ['time', 'currency', 'title'], `events[${i}]`))
  const story = fmt === 'story'
  const accent = CYAN
  const markers = events.map(e => eventTimes(e.time).mins).filter(m => m != null)
  const main = events.length === 1
    ? eventHero(events[0], accent, story)
    : `<div style="display:flex;flex-direction:column;gap:${story ? 20 : 16}px">${events.map(e => eventRow(e, accent)).join('')}</div>`
  return {
    glow: [540, 420], accent,
    body: `
      <div style="display:flex;flex-direction:column;flex-grow:1;justify-content:space-between">
        <div style="display:flex;flex-direction:column">
          <div style="display:flex;align-items:center;gap:14px">${neonLine(accent, '40px')}${mono('Calendar · Events to watch', MUTED, 20, 5)}</div>
          <div style="display:flex;font-size:${story ? 76 : 66}px;font-weight:700;letter-spacing:-2px;margin-top:16px;color:${TEXT}">${txt(data.dateLabel)}</div>
        </div>
        ${main}
        ${sessionStrip(accent, markers)}
        ${engineStrip(accent, { compact: true })}
      </div>`,
  }
}

// ── weekly_scorecard ──────────────────────────────────────────────────────────
// Every call is listed individually and at the same visual weight. No counts, totals or
// percentages: there is no audited track record, and a summary line would be a performance claim.
const OUTCOMES = {
  hit: { text: 'HIT', color: EMERALD },
  miss: { text: 'MISS', color: RED },
  open: { text: 'OPEN', color: MUTED },
}

function scorecardRow(row, story) {
  const tone = directionTone(row.direction)
  const o = OUTCOMES[String(row.outcome).trim().toLowerCase()]
  // Hit and miss badges are the same size, weight and glow — only the colour differs.
  return glass(`
    <div style="display:flex;width:140px;${MONO};font-size:${story ? 24 : 22}px;color:${MUTED}">${txt(row.date)}</div>
    <div style="display:flex;width:240px;font-size:${story ? 40 : 36}px;font-weight:700;color:${TEXT}">${txt(formatPair(row.pair))}</div>
    <div style="display:flex;flex:1;align-items:center;gap:12px">
      ${arrow(tone.color, tone.up, 28)}
      <div style="display:flex;font-size:26px;font-weight:700;color:${tone.color}">${txt(tone.word)}</div>
    </div>
    <div style="display:flex;justify-content:center;width:150px;padding:12px 0;border-radius:10px;background:${rgba(o.color, 0.14)};border:1px solid ${rgba(o.color, 0.7)};box-shadow:0 0 16px ${rgba(o.color, 0.35)};${MONO};font-size:24px;font-weight:700;letter-spacing:4px;color:${o.color}">${txt(o.text)}</div>`,
  { accent: o.color === MUTED ? MUTED : o.color, dir: 'row', pad: story ? '20px 26px' : '14px 24px', gap: 22, extra: 'align-items:center', bracket: false, glow: 0.08 })
}

function weeklyScorecard(data, fmt) {
  requireFields('weekly_scorecard', data, ['rangeLabel'])
  if (!Array.isArray(data.rows) || !data.rows.length) throw new Error('renderCard(weekly_scorecard): data.rows must be a non-empty array')
  const rows = data.rows.slice(0, 7)
  rows.forEach((r, i) => {
    requireFields('weekly_scorecard', r, ['date', 'pair', 'direction', 'outcome'], `rows[${i}]`)
    if (!OUTCOMES[String(r.outcome).trim().toLowerCase()]) {
      throw new Error(`renderCard(weekly_scorecard): rows[${i}].outcome must be hit, miss or open (got "${r.outcome}")`)
    }
  })
  const story = fmt === 'story'
  const accent = EMERALD
  return {
    glow: [540, 520], accent,
    body: `
      <div style="display:flex;flex-direction:column;flex-grow:1;justify-content:space-between">
        <div style="display:flex;flex-direction:column">
          <div style="display:flex;align-items:center;gap:14px">${neonLine(accent, '40px')}${mono('Weekly scorecard · Every call', MUTED, 20, 5)}</div>
          <div style="display:flex;font-size:${story ? 76 : 66}px;font-weight:700;letter-spacing:-2px;margin-top:16px;color:${TEXT}">${txt(data.rangeLabel)}</div>
          <div style="display:flex;font-size:26px;margin-top:12px;color:${MUTED}">Every call as it was made. Hits and misses alike.</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:${story ? 16 : 12}px">${rows.map(r => scorecardRow(r, story)).join('')}</div>
        ${engineStrip(accent, { compact: true })}
      </div>`,
  }
}

// ── news_flash ────────────────────────────────────────────────────────────────
// data { summary, assets[], impactScore, time }. `summary` is our own paraphrase from the generator,
// never the raw headline. Assets may be strings like "USD↑" / "Gold↓" or { label, dir }.
function parseAsset(a) {
  if (a && typeof a === 'object') return { label: String(a.label ?? a.symbol ?? '').trim(), dir: a.dir === 'up' || a.dir === 'down' ? a.dir : null }
  const s = String(a ?? '').trim()
  const dir = /[↑▲]|\bup\b/i.test(s) ? 'up' : /[↓▼]|\bdown\b/i.test(s) ? 'down' : null
  return { label: s.replace(/[↑↓▲▼]/g, '').replace(/\b(up|down)\b/i, '').trim(), dir }
}

function assetChip(a, size = 30) {
  const c = a.dir === 'up' ? EMERALD : a.dir === 'down' ? RED : MUTED
  return `<div style="display:flex;align-items:center;gap:12px;padding:14px 22px;border-radius:14px;background:${rgba(c, 0.12)};border:1px solid ${rgba(c, 0.55)};box-shadow:0 0 18px ${rgba(c, 0.22)}">
    ${a.dir ? arrow(c, a.dir === 'up', Math.round(size * 0.9)) : ''}
    <div style="display:flex;${MONO};font-size:${size}px;font-weight:700;letter-spacing:1px;color:${TEXT}">${txt(a.label)}</div>
  </div>`
}

function newsFlash(data, fmt) {
  requireFields('news_flash', data, ['summary', 'impactScore'])
  const score = Number(data.impactScore)
  if (!Number.isFinite(score)) throw new Error('renderCard(news_flash): impactScore must be a number')
  const assets = (Array.isArray(data.assets) ? data.assets : []).map(parseAsset).filter(a => a.label).slice(0, 5)
  const t = data.time ? eventTimes(data.time) : null
  const story = fmt === 'story'
  const accent = AMBER
  return {
    glow: [540, 460], accent,
    body: `
      <div style="display:flex;flex-direction:column;flex-grow:1;justify-content:space-between">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:18px">
            ${img(pulseUri(accent, 64), 64, 64)}
            <div style="display:flex;flex-direction:column">
              ${mono('High impact', accent, 30, 6, 700)}
              ${mono('Macro news · Engine watch', MUTED, 16, 4)}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end">
            ${mono('Impact', DIM, 16, 4)}
            <div style="display:flex;${MONO};font-size:56px;font-weight:700;line-height:1;color:${accent}">${txt(`${Math.round(score)}/10`)}</div>
          </div>
        </div>
        ${glass(`
          <div style="display:flex;align-items:center;gap:14px">${neonLine(accent, '28px')}${mono('What it means', accent, 18, 5, 700)}</div>
          <div style="display:flex;font-size:${story ? 58 : 52}px;font-weight:700;line-height:1.2;letter-spacing:-0.5px;color:${TEXT}">${txt(truncate(data.summary, story ? 200 : 170))}</div>`,
        { accent, pad: '38px 40px', gap: 22, glow: 0.3 })}
        ${assets.length ? `<div style="display:flex;flex-direction:column;gap:16px">
          ${mono('Assets in play', MUTED, 18, 5)}
          <div style="display:flex;flex-wrap:wrap;gap:14px">${assets.map(a => assetChip(a, story ? 32 : 30)).join('')}</div>
        </div>` : ''}
        ${t ? glass(`
          <div style="display:flex;align-items:center;justify-content:space-between">
            ${mono('Time', DIM, 18, 4)}
            <div style="display:flex;align-items:baseline;gap:22px">
              <div style="display:flex;${MONO};font-size:40px;font-weight:700;color:${TEXT}">${txt(t.utc)}</div>
              ${t.pkt ? `<div style="display:flex;${MONO};font-size:26px;color:${MUTED}">${txt(t.pkt)}</div>` : ''}
            </div>
          </div>`, { accent, pad: '20px 28px', bracket: false, glow: 0.1 }) : ''}
        ${story && t?.mins != null ? sessionStrip(accent, [t.mins]) : ''}
        ${engineStrip(accent, { compact: true })}
      </div>`,
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
function buildMarkup(kind, data, layoutIndex, fmt) {
  if (!FORMATS[fmt]) throw new Error(`renderCard: unknown format "${fmt}" (expected post or story)`)
  const { w } = FORMATS[fmt]
  switch (kind) {
    case 'bias_card': {
      const f = biasCardFields(data)
      const n = LAYOUT_COUNTS.bias_card
      const layout = fmt === 'story' ? biasStory(f) : biasLayouts[((Math.trunc(Number(layoutIndex) || 0) % n) + n) % n](f)
      return frame(layout.body, { fmt, accent: f.tone.color, glowX: layout.glow[0], glowY: layout.glow[1] + (fmt === 'story' ? 250 : 0), date: f.date })
    }
    case 'event_preview':
    case 'weekly_scorecard':
    case 'news_flash': {
      const build = { event_preview: eventPreview, weekly_scorecard: weeklyScorecard, news_flash: newsFlash }[kind]
      const out = build(data, fmt)
      return frame(out.body, { fmt, accent: out.accent, glowX: out.glow[0], glowY: out.glow[1] + (fmt === 'story' ? 250 : 0), date: cardDate(data.date) })
    }
    default: throw new Error(`renderCard: unknown kind "${kind}" (expected ${Object.keys(LAYOUT_COUNTS).join(', ')})`)
  }
  void w
}

// Third argument: { layoutIndex, format } — or a bare number, for callers written before formats
// existed (renderCard(kind, data, 2) still means layout 2 as a post).
function normaliseOpts(opts) {
  if (typeof opts === 'number' || opts == null) return { layoutIndex: Number(opts) || 0, format: 'post' }
  return { layoutIndex: Number(opts.layoutIndex) || 0, format: opts.format || 'post' }
}

// The exact node tree handed to satori, with every text node already holding its raw string.
// Exported so tests can check what satori is given, not just that a PNG came out.
export function buildCardTree(kind, data, opts = {}) {
  const { layoutIndex, format } = normaliseOpts(opts)
  TEXTS = []
  try {
    const markup = buildMarkup(kind, data, layoutIndex, format)
    // satori-html's html() is a template tag; hand it the finished markup as a one-part template.
    const node = html(Object.assign([markup], { raw: [markup] }))
    return fillText(node, TEXTS)
  } finally {
    TEXTS = null
  }
}

export function cardSize(format = 'post') {
  const f = FORMATS[format]
  if (!f) throw new Error(`unknown format "${format}"`)
  return { width: f.w, height: f.h }
}

// SVG with text left as <text x y> elements instead of glyph paths — same layout as the PNG, but
// readable, so tests can check where every piece of text actually lands (the story safe zones).
export async function renderCardSvg(kind, data, opts = {}) {
  const { format } = normaliseOpts(opts)
  const tree = buildCardTree(kind, data, opts)
  const { width, height } = cardSize(format)
  return satori(tree, { width, height, fonts: FONTS, embedFont: false })
}

export async function renderCard(kind, data, opts = {}) {
  const { format } = normaliseOpts(opts)
  const tree = buildCardTree(kind, data, opts)
  const { width, height } = cardSize(format)
  const svg = await satori(tree, { width, height, fonts: FONTS })
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } }).render().asPng()
}
