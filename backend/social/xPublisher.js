// Posts one approved draft to X. Nothing in here decides WHETHER to post — that is the queue's job
// (kill switch, pacing, guardrails). This module only does it, or throws a message worth logging.
//
// OAuth 1.0a user context: the four X_* env vars must come from the same app, and the app needs
// Read and Write, or every post fails with a 401/403 that reads like a key problem.

import { TwitterApi } from 'twitter-api-v2'

// Link posts are reach-throttled and cost far more per post on the paid tiers, so the body never
// carries a URL. The link lives in the bio and in replies. Enforced here as well as in the
// guardrails: this is the last point before the post is public.
const URL_RE = /https?:\/\//i

const MEDIA_FETCH_TIMEOUT_MS = 20000
const MAX_IMAGE_BYTES = 5 * 1024 * 1024   // X still rejects images over 5MB

let cachedClient = null
function xClient() {
  if (cachedClient) return cachedClient
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = process.env
  const missing = Object.entries({ X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET })
    .filter(([, v]) => !v || !String(v).trim()).map(([k]) => k)
  if (missing.length) throw new Error(`X credentials missing: ${missing.join(', ')}`)
  cachedClient = new TwitterApi({
    appKey: X_API_KEY, appSecret: X_API_SECRET,
    accessToken: X_ACCESS_TOKEN, accessSecret: X_ACCESS_SECRET,
  })
  return cachedClient
}

// The library throws ApiResponseError with the status on .code and X's JSON on .data. Turn the
// common failures into a sentence that says what to do, since the caller only logs and DMs it.
function describe(e) {
  const status = e?.code
  const d = e?.data || {}
  const detail = d.detail || d.title || (Array.isArray(d.errors) ? d.errors.map(x => x.message || x.detail).filter(Boolean).join('; ') : '') || e?.message || 'unknown error'
  if (e?.isAuthError || status === 401) return `X auth rejected (401): ${detail}. Check the four X_* env vars come from the same app and it has Read+Write.`
  if (status === 403) {
    if (/duplicate/i.test(detail)) return `X refused a duplicate post (403): ${detail}`
    return `X refused the post (403): ${detail}. Usually the app's access level or a policy rule.`
  }
  if (e?.rateLimitError || status === 429) {
    const reset = e?.rateLimit?.reset ? new Date(e.rateLimit.reset * 1000).toISOString() : null
    return `X rate limit hit (429)${reset ? `, resets ${reset}` : ''}: ${detail}. On the free tier this is usually the monthly post cap.`
  }
  if (status === 402 || /payment|credit|quota|usage cap/i.test(detail)) return `X rejected the post for billing/credits (${status || '—'}): ${detail}`
  if (status >= 500) return `X server error (${status}): ${detail}. Transient — the row is left failed, retry manually.`
  return `X post failed${status ? ` (${status})` : ''}: ${detail}`
}

async function fetchImage(imageUrl) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), MEDIA_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(imageUrl, { signal: ctl.signal })
    if (!res.ok) throw new Error(`image fetch ${res.status} ${res.statusText}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) throw new Error('image fetch returned 0 bytes')
    if (buf.length > MAX_IMAGE_BYTES) throw new Error(`image is ${(buf.length / 1048576).toFixed(1)}MB, over X's 5MB limit`)
    return buf
  } finally { clearTimeout(timer) }
}

// Posts `text`, with the PNG at `imageUrl` attached when given. Returns { id } of the new post.
export async function publishToX({ text, imageUrl } = {}) {
  const body = String(text ?? '').trim()
  if (!body) throw new Error('publishToX: text is empty')
  if (URL_RE.test(body)) throw new Error('publishToX: refusing to post a link in the body — links belong in the bio or a reply')

  const client = xClient()
  let media_ids
  if (imageUrl) {
    // v2 chunked upload (the v1.1 media endpoint is on its way out). Returns the media id string.
    const buf = await fetchImage(imageUrl)
    try {
      const mediaId = await client.v2.uploadMedia(buf, { media_type: 'image/png', media_category: 'tweet_image' })
      media_ids = [mediaId]
    } catch (e) { throw new Error(`X media upload failed: ${describe(e)}`) }
  }

  try {
    const res = await client.v2.tweet(body, media_ids ? { media: { media_ids } } : undefined)
    const id = res?.data?.id
    if (!id) throw new Error(`X accepted the post but returned no id: ${JSON.stringify(res)?.slice(0, 200)}`)
    return { id }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('X ')) throw e
    throw new Error(describe(e))
  }
}
