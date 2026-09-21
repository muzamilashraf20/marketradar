// Posts one approved draft to the admin's personal LinkedIn profile. Like xPublisher, this only
// DOES the post — whether to post (kill switch, pacing, guardrails) is the queue's decision.
//
// Posts API (https://api.linkedin.com/rest/posts), not the legacy ugcPosts endpoint. An image goes
// through the Images API first: initializeUpload → PUT the bytes → reference the urn:li:image.
// Everything verified against LinkedIn's versioned docs (Marketing September 2026):
//   posts:        learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api
//   images:       .../shares/images-api   (upload step: .../shares/vector-asset-api#upload-the-image)
//   little text:  .../shares/little-text-format
//   versioning:   learn.microsoft.com/linkedin/marketing/versioning

// Versions are published monthly and supported for at least a year, then sunset. 202609 was the
// latest version on LinkedIn's versioning page as of 2026-09-16. Move this forward before
// September 2027 — a sunset version is rejected outright, and every post will fail.
export const LINKEDIN_VERSION = '202609'

const API = 'https://api.linkedin.com/rest'
const URL_RE = /https?:\/\//i
const MEDIA_FETCH_TIMEOUT_MS = 20000
// The Images API is asynchronous and a w_member_social token cannot GET /rest/images to poll for
// AVAILABLE (write-only permission, per the Images API docs). A short pause after the upload
// gives processing a head start before the post references the image.
const IMAGE_SETTLE_MS = 4000

// ── little text ───────────────────────────────────────────────────────────────
// `commentary` is parsed as LinkedIn's "little" format, where these characters are syntax
// (mentions, hashtags, templates, emphasis). The docs require every one of them to be
// backslash-escaped to be read as plain text, "even if those characters are not used in one of
// the supported elements". Unescaped, "(Fed)" or "@user_name" can break the post or render wrong.
// Backslash first, so the escapes added for the others are not themselves escaped again.
const LITTLE_RESERVED = ['\\', '|', '{', '}', '@', '[', ']', '(', ')', '<', '>', '#', '*', '_', '~']
const LITTLE_RE = new RegExp(`[${LITTLE_RESERVED.map(c => `\\${c}`).join('')}]`, 'g')

export function escapeLittleText(text) {
  return String(text ?? '').replace(LITTLE_RE, c => `\\${c}`)
}

// Escaping makes every '#' plain text, including the hashtags the writer is asked to put on the
// last line — which would then not be hashtags at all. So a final line made only of #words is sent
// as LinkedIn's hashtag template, {hashtag|\#|word}, and everything else is escaped as text.
export function toLittleCommentary(text) {
  const body = String(text ?? '').replace(/\s+$/, '')
  const lines = body.split('\n')
  const last = lines[lines.length - 1].trim()
  const tags = /^(#[A-Za-z0-9_]+)(\s+#[A-Za-z0-9_]+)*$/.test(last) ? last.split(/\s+/) : null
  if (!tags || lines.length < 2) return escapeLittleText(body)
  const rest = lines.slice(0, -1).join('\n').replace(/\s+$/, '')
  const templated = tags.map(t => `{hashtag|\\#|${escapeLittleText(t.slice(1))}}`).join(' ')
  return `${escapeLittleText(rest)}\n\n${templated}`
}

// ── token expiry ──────────────────────────────────────────────────────────────
// LINKEDIN_TOKEN_EXPIRES is a date, not a time, so the token is treated as dead from 00:00 UTC on
// that day — erring early is a warning, erring late is a failed post. null when the env is unset.
export function linkedinTokenStatus(now = Date.now()) {
  const raw = String(process.env.LINKEDIN_TOKEN_EXPIRES || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const expiresAt = Date.parse(`${raw}T00:00:00.000Z`)
  if (!Number.isFinite(expiresAt)) return null
  const msLeft = expiresAt - now
  return { expiresOn: raw, daysLeft: Math.floor(msLeft / 86400000), expired: msLeft <= 0 }
}

// ── HTTP ──────────────────────────────────────────────────────────────────────
function credentials() {
  const token = String(process.env.LINKEDIN_ACCESS_TOKEN || '').trim()
  const member = String(process.env.LINKEDIN_MEMBER_ID || '').trim()
  const missing = [!token && 'LINKEDIN_ACCESS_TOKEN', !member && 'LINKEDIN_MEMBER_ID'].filter(Boolean)
  if (missing.length) throw new Error(`LinkedIn credentials missing: ${missing.join(', ')}`)
  return { token, author: `urn:li:person:${member}` }
}

const apiHeaders = token => ({
  Authorization: `Bearer ${token}`,
  'LinkedIn-Version': LINKEDIN_VERSION,
  'X-Restli-Protocol-Version': '2.0.0',
  'Content-Type': 'application/json',
})

// One readable error per failure. 401 gets the fixed message because the fix is always the same.
async function fail(res, step) {
  if (res.status === 401) throw new Error('LinkedIn token expired or revoked — re-run the token script')
  let detail = ''
  try {
    const body = await res.text()
    try { const j = JSON.parse(body); detail = j.message || j.serviceErrorCode || body } catch { detail = body }
  } catch { /* no body */ }
  throw new Error(`LinkedIn ${step} failed (${res.status}): ${String(detail || res.statusText || 'no message').slice(0, 300)}`)
}

async function fetchImage(imageUrl) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), MEDIA_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(imageUrl, { signal: ctl.signal })
    if (!res.ok) throw new Error(`image fetch ${res.status} ${res.statusText}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) throw new Error('image fetch returned 0 bytes')
    return buf
  } finally { clearTimeout(timer) }
}

// Images API: declare the upload for this member, PUT the bytes to the URL LinkedIn hands back,
// return the image URN. The PUT carries the OAuth token — the image upload requires it (videos
// are the ones that must not send it).
async function uploadImage(token, author, imageUrl, sleep) {
  const init = await fetch(`${API}/images?action=initializeUpload`, {
    method: 'POST', headers: apiHeaders(token),
    body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
  })
  if (!init.ok) await fail(init, 'image upload init')
  const { value } = await init.json()
  if (!value?.uploadUrl || !value?.image) throw new Error(`LinkedIn image upload init returned no uploadUrl/image: ${JSON.stringify(value).slice(0, 200)}`)

  const bytes = await fetchImage(imageUrl)
  const put = await fetch(value.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: bytes })
  if (!put.ok) await fail(put, 'image upload')
  await sleep(IMAGE_SETTLE_MS)
  return value.image
}

// Posts `text` to the member's feed, with the PNG at `imageUrl` attached when given.
// Returns { id } — the post URN from the x-restli-id header (urn:li:share:… or urn:li:ugcPost:…).
// `sleep` is injectable so tests do not wait for the image settle delay.
export async function publishToLinkedIn({ text, imageUrl } = {}, { sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const body = String(text ?? '').trim()
  if (!body) throw new Error('publishToLinkedIn: text is empty')
  if (URL_RE.test(body)) throw new Error('publishToLinkedIn: refusing to post a link in the body — links belong in the comments or the profile')

  const { token, author } = credentials()
  const image = imageUrl ? await uploadImage(token, author, imageUrl, sleep) : null

  const post = {
    author,
    commentary: toLittleCommentary(body),
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
    ...(image ? { content: { media: { id: image, altText: 'BiasForge card' } } } : {}),
  }
  const res = await fetch(`${API}/posts`, { method: 'POST', headers: apiHeaders(token), body: JSON.stringify(post) })
  if (!res.ok) await fail(res, 'post')
  const id = res.headers.get('x-restli-id')
  if (!id) throw new Error(`LinkedIn accepted the post (${res.status}) but returned no x-restli-id`)
  return { id }
}
