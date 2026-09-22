// Posts one approved draft to Instagram (Instagram API with Instagram Login, graph.instagram.com).
// Like the X and LinkedIn publishers, this only DOES the post — whether to post (kill switch,
// pacing, guardrails) is the queue's decision.
//
// Flow, per Meta's content-publishing guide: create a media container → poll its status_code until
// FINISHED → media_publish with creation_id → read the permalink. Carousels add child containers
// (is_carousel_item) and a CAROUSEL parent. Verified against Meta's docs (September 2026):
//   publishing:  developers.facebook.com/docs/instagram-platform/content-publishing
//   media limits: .../instagram-platform/instagram-graph-api/reference/ig-user/media
//   refresh:     .../instagram-platform/reference/refresh_access_token
//   versions:    developers.facebook.com/docs/graph-api/changelog

import { createHash } from 'node:crypto'
import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'

// v25.0 is the version Meta's Instagram publishing guide is written against, and the Graph API
// changelog lists it as available until 29 July 2028. (v26.0, July 2026, is newer but its end date
// was still "TBD".) Move this forward before mid-2028.
export const IG_GRAPH_VERSION = 'v25.0'

const HOST = 'https://graph.instagram.com'
const URL_RE = /https?:\/\//i
const CARD_BG = [3, 7, 18]            // #030712 — the cards' own background
const JPEG_QUALITY = 92
const MAX_CAROUSEL = 10               // Meta: a carousel holds at most 10 items
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const RATIO_MIN = 4 / 5               // Meta: aspect ratio must be within 4:5 … 1.91:1
const RATIO_MAX = 1.91
const POLL_TIMEOUT_MS = 60000
const MEDIA_FETCH_TIMEOUT_MS = 20000

// ── PNG → JPEG ────────────────────────────────────────────────────────────────
// Instagram's content publishing accepts JPEG only ("JPEG is the only image format supported").
// JPEG has no alpha channel: an encoder given transparent pixels writes whatever colour sits under
// the alpha, usually black. So every pixel is composited over the card background first, and the
// result keeps the source dimensions exactly.
export function pngToJpeg(pngBuffer, { quality = JPEG_QUALITY, background = CARD_BG } = {}) {
  const png = PNG.sync.read(pngBuffer)
  const { width, height, data } = png
  const out = Buffer.alloc(width * height * 4)
  const [br, bg, bb] = background
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255
    out[i] = Math.round(data[i] * a + br * (1 - a))
    out[i + 1] = Math.round(data[i + 1] * a + bg * (1 - a))
    out[i + 2] = Math.round(data[i + 2] * a + bb * (1 - a))
    out[i + 3] = 255
  }
  const encoded = jpeg.encode({ data: out, width, height }, quality)
  return { buffer: encoded.data, width, height }
}

const isPng = b => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
const isJpeg = b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff

// ── Token ─────────────────────────────────────────────────────────────────────
// The live token is kept in app_state (via the injected load/save) so the daily refresh can replace
// it without anyone touching Railway. IG_ACCESS_TOKEN seeds it — and re-seeds it whenever the env
// value changes, so a token regenerated in the Meta dashboard and pasted into Railway always wins
// over the stored one.
const fingerprint = t => createHash('sha256').update(String(t)).digest('hex').slice(0, 16)

export function createIgTokenStore({ load, save, env = () => process.env.IG_ACCESS_TOKEN }) {
  async function current() {
    const envToken = String(env() || '').trim()
    const rec = await load()
    if (rec?.token && (!envToken || rec.seededFrom === fingerprint(envToken))) return rec
    if (!envToken) return rec?.token ? rec : null
    // First use, or the env token was replaced: start from the env token. Its age is unknown, so
    // refreshedAt is null and the next daily check will refresh it straight away.
    const seeded = { token: envToken, refreshedAt: null, expiresAt: null, seededFrom: fingerprint(envToken) }
    await save(seeded)
    return seeded
  }
  return {
    current,
    async token() {
      const rec = await current()
      if (!rec?.token) throw new Error('Instagram token missing — set IG_ACCESS_TOKEN')
      return rec.token
    },
    // Meta: the long-lived token must be at least 24 hours old and unexpired; the refreshed one is
    // valid for 60 days. Throws on failure — the caller decides how loudly to report it.
    async refresh({ fetchImpl = fetch, now = Date.now() } = {}) {
      const rec = await current()
      if (!rec?.token) throw new Error('Instagram token missing — set IG_ACCESS_TOKEN')
      const url = `${HOST}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(rec.token)}`
      const res = await fetchImpl(url)
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.access_token) throw igError(body, res.status, 'token refresh')
      const next = {
        token: body.access_token,
        refreshedAt: new Date(now).toISOString(),
        expiresAt: Number.isFinite(Number(body.expires_in)) ? new Date(now + Number(body.expires_in) * 1000).toISOString() : null,
        seededFrom: rec.seededFrom,
      }
      await save(next)
      return next
    },
  }
}

// Days until the stored token expires; null when the expiry is not known yet (a freshly seeded env
// token, before its first refresh).
export function igTokenStatus(rec, now = Date.now()) {
  if (!rec?.expiresAt) return null
  const msLeft = Date.parse(rec.expiresAt) - now
  if (!Number.isFinite(msLeft)) return null
  return { expiresAt: rec.expiresAt, daysLeft: Math.floor(msLeft / 86400000), expired: msLeft <= 0 }
}

// ── Errors ────────────────────────────────────────────────────────────────────
// Graph errors arrive as { error: { message, type, code, error_subcode } }. Code 190 is the standard
// OAuthException for an expired or invalid token; code 9 / subcode 2207042 is the publishing limit.
function igError(body, status, step) {
  const e = body?.error || {}
  if (e.code === 190 || status === 401) return new Error('Instagram token expired — regenerate it in the Meta app dashboard')
  if (e.error_subcode === 2207042) return new Error(`Instagram publishing limit reached — no more API posts allowed in the current 24h window (${e.message || 'code 9 / 2207042'})`)
  const codes = [e.code, e.error_subcode].filter(v => v != null).join('/')
  return new Error(`Instagram ${step} failed (${codes || status}): ${e.error_user_msg || e.message || 'no message'}`)
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function makeApi(token, fetchImpl) {
  const base = `${HOST}/${IG_GRAPH_VERSION}`
  return {
    async post(path, params, step) {
      const res = await fetchImpl(`${base}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ...params, access_token: token }).toString(),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.error) throw igError(body, res.status, step)
      return body
    },
    async get(path, fields, step) {
      const res = await fetchImpl(`${base}/${path}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.error) throw igError(body, res.status, step)
      return body
    },
  }
}

async function fetchBytes(url, fetchImpl) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), MEDIA_FETCH_TIMEOUT_MS)
  try {
    const res = await fetchImpl(url, { signal: ctl.signal })
    if (!res.ok) throw new Error(`image fetch ${res.status} ${res.statusText || ''}`.trim())
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) throw new Error('image fetch returned 0 bytes')
    return buf
  } finally { clearTimeout(timer) }
}

// Waits for a container to be ready. Backs off 1s, 2s, 4s… capped at 8s, up to 60s in total.
async function waitFinished(api, id, sleep, clock) {
  const start = clock()
  let delay = 1000
  for (;;) {
    const { status_code: code, status } = await api.get(id, 'status_code,status', 'container status')
    if (code === 'FINISHED' || code === 'PUBLISHED') return
    if (code === 'ERROR' || code === 'EXPIRED') throw new Error(`Instagram container ${id} ${code}: ${status || 'no detail'}`)
    if (clock() - start + delay > POLL_TIMEOUT_MS) {
      throw new Error(`Instagram container ${id} did not finish processing within ${POLL_TIMEOUT_MS / 1000}s (last status ${code || 'unknown'})`)
    }
    await sleep(delay)
    delay = Math.min(delay * 2, 8000)
  }
}

// ── Publish ───────────────────────────────────────────────────────────────────
// Posts `caption` with one image, or a carousel when several are given. Returns { id, permalink }.
// `deps` carries what the publisher cannot do by itself:
//   uploadJpeg(buffer, index) → public URL   (the caller stores JPEGs in the social-media bucket)
//   token()                   → access token (app_state first, env as fallback)
//   userId                    → IG_USER_ID
// plus fetchImpl / sleep / clock, injectable so tests neither hit Meta nor wait out real timers.
export async function publishToInstagram({ caption, imageUrls } = {}, deps = {}) {
  const {
    uploadJpeg, token: getToken, userId = process.env.IG_USER_ID,
    fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), clock = Date.now,
  } = deps
  const text = String(caption ?? '').trim()
  const urls = (Array.isArray(imageUrls) ? imageUrls : [imageUrls]).filter(Boolean)
  if (!urls.length) throw new Error('Instagram needs an image — this row has no card')
  if (urls.length > MAX_CAROUSEL) throw new Error(`Instagram carousels allow at most ${MAX_CAROUSEL} items (got ${urls.length})`)
  if (URL_RE.test(text)) throw new Error('publishToInstagram: refusing to post a link in the caption — links are not clickable there; use "link in bio"')
  if (!String(userId || '').trim()) throw new Error('Instagram credentials missing: IG_USER_ID')
  if (typeof uploadJpeg !== 'function' || typeof getToken !== 'function') throw new Error('publishToInstagram: uploadJpeg and token dependencies are required')

  // Convert every image before touching the API, so a bad image fails the post cleanly.
  const jpegs = []
  for (const [i, url] of urls.entries()) {
    const bytes = await fetchBytes(url, fetchImpl)
    let buffer, width, height
    if (isPng(bytes)) ({ buffer, width, height } = pngToJpeg(bytes))
    else if (isJpeg(bytes)) { const d = jpeg.decode(bytes, { useTArray: true }); ({ width, height } = d); buffer = bytes }
    else throw new Error(`image ${i + 1} is neither PNG nor JPEG`)
    if (buffer.length > MAX_IMAGE_BYTES) throw new Error(`image ${i + 1} is ${(buffer.length / 1048576).toFixed(1)}MB as JPEG, over Instagram's 8MB limit`)
    const ratio = width / height
    if (ratio < RATIO_MIN - 0.001 || ratio > RATIO_MAX + 0.001) throw new Error(`image ${i + 1} is ${width}x${height}; Instagram needs an aspect ratio between 4:5 and 1.91:1`)
    jpegs.push({ buffer, width, height, ratio })
  }
  // Meta crops every carousel item to the first item's ratio, so mixed ratios would be cut.
  if (jpegs.some(j => Math.abs(j.ratio - jpegs[0].ratio) > 0.001)) {
    throw new Error(`carousel images must share one aspect ratio (got ${jpegs.map(j => `${j.width}x${j.height}`).join(', ')})`)
  }
  const publicUrls = []
  for (const [i, j] of jpegs.entries()) publicUrls.push(await uploadJpeg(j.buffer, i))

  const api = makeApi(await getToken(), fetchImpl)
  const user = String(userId).trim()
  let creationId
  if (publicUrls.length === 1) {
    const { id } = await api.post(`${user}/media`, { image_url: publicUrls[0], caption: text }, 'media container')
    creationId = id
  } else {
    const children = []
    for (const url of publicUrls) {
      const { id } = await api.post(`${user}/media`, { image_url: url, is_carousel_item: 'true' }, 'carousel item container')
      await waitFinished(api, id, sleep, clock)
      children.push(id)
    }
    const { id } = await api.post(`${user}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption: text }, 'carousel container')
    creationId = id
  }
  await waitFinished(api, creationId, sleep, clock)

  const { id: mediaId } = await api.post(`${user}/media_publish`, { creation_id: creationId }, 'media_publish')
  if (!mediaId) throw new Error('Instagram published but returned no media id')
  // The post is live from here on. A failed permalink lookup must not turn it into a failure.
  let permalink = null
  try { permalink = (await api.get(mediaId, 'permalink', 'permalink')).permalink || null } catch { /* keep null */ }
  return { id: String(mediaId), permalink }
}
