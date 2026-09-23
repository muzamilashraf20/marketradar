// Test vectors for the Instagram publisher.
//   node backend/scripts/instagramPublisher.test.mjs
//
// A fake Graph API stands in for Meta, so nothing is posted. The JPEG check uses a real rendered
// card, because the thing that matters is what our actual PNGs turn into.

import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'
import { renderCard } from '../social/renderer.js'
import { pngToJpeg, publishToInstagram, publishStory, createIgTokenStore, igTokenStatus, IG_GRAPH_VERSION } from '../social/instagramPublisher.js'

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`)
}

// ── PNG → JPEG ────────────────────────────────────────────────────────────────
{
  const png = await renderCard('bias_card', { pair: 'EURUSD', direction: 'BEARISH', confidence: 78, grade: 'A-', driver: 'Rate gap widening in the dollar\'s favour', date: '2026-09-22' }, 0)
  const { buffer, width, height } = pngToJpeg(png)
  check('output starts with the JPEG magic bytes', buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff, buffer.slice(0, 4).toString('hex'))
  const decoded = jpeg.decode(buffer, { useTArray: true })
  check('JPEG decodes and keeps 1080x1350', decoded.width === 1080 && decoded.height === 1350 && width === 1080 && height === 1350, `${decoded.width}x${decoded.height}`)

  // Corners and the empty background must be the card colour (#030712), not black.
  const px = (x, y) => { const i = (y * decoded.width + x) * 4; return [decoded.data[i], decoded.data[i + 1], decoded.data[i + 2]] }
  const near = (a, b, tol = 10) => a.every((v, i) => Math.abs(v - b[i]) <= tol)
  const samples = [[5, 5], [1074, 5], [5, 1344], [1074, 1344], [540, 1340]]
  check('corners and bottom edge are the card background, not black', samples.every(([x, y]) => !near(px(x, y), [0, 0, 0], 1)), JSON.stringify(samples.map(([x, y]) => px(x, y))))
  check('file size well under Instagram\'s 8MB', buffer.length < 8 * 1024 * 1024 && buffer.length > 20000, `${buffer.length} bytes`)

  // A PNG with real transparency: fully transparent pixels must become the background colour.
  const t = new PNG({ width: 40, height: 50 })
  for (let i = 0; i < t.data.length; i += 4) { t.data[i] = 255; t.data[i + 1] = 255; t.data[i + 2] = 255; t.data[i + 3] = 0 }
  for (let i = 0; i < 40 * 4 * 10; i += 4) { t.data[i + 3] = 255 }    // top 10 rows opaque white
  const tj = jpeg.decode(pngToJpeg(PNG.sync.write(t)).buffer, { useTArray: true })
  const at = (x, y) => { const i = (y * tj.width + x) * 4; return [tj.data[i], tj.data[i + 1], tj.data[i + 2]] }
  check('transparent pixels flatten onto #030712, not black', near(at(20, 40), [3, 7, 18], 6), JSON.stringify(at(20, 40)))
  check('opaque pixels keep their colour', near(at(20, 3), [255, 255, 255], 6), JSON.stringify(at(20, 3)))
  check('dimensions preserved for a non-card PNG too', tj.width === 40 && tj.height === 50)
}

// ── Fake Graph API ────────────────────────────────────────────────────────────
const CARD = await renderCard('bias_card', { pair: 'XAUUSD', direction: 'BULLISH', confidence: 84, grade: 'B', driver: 'Real yields rolling over', date: '2026-09-22' }, 1)
let calls = [], uploads = [], statusScript = [], graphError = null, nextId = 1
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, statusText: '', json: async () => body, arrayBuffer: async () => CARD.buffer.slice(CARD.byteOffset, CARD.byteOffset + CARD.byteLength) })
const fakeFetch = async (url, init = {}) => {
  const u = String(url)
  calls.push({ url: u, method: init.method || 'GET', body: init.body ? Object.fromEntries(new URLSearchParams(init.body)) : null })
  if (u.startsWith('https://bucket.example/')) return json(200, {})
  if (graphError && !u.includes('refresh_access_token')) return json(graphError.status, { error: graphError.error })
  if (u.includes('/media_publish')) return json(200, { id: 'MEDIA_900' })
  if (u.endsWith('/media')) return json(200, { id: `C${nextId++}` })
  if (u.includes('fields=status_code')) return json(200, statusScript.length ? statusScript.shift() : { status_code: 'FINISHED' })
  if (u.includes('fields=permalink')) return json(200, { permalink: 'https://www.instagram.com/p/ABC123/' })
  if (u.includes('refresh_access_token')) return json(200, { access_token: 'REFRESHED_TOKEN', token_type: 'bearer', expires_in: 5184000 })
  throw new Error(`unexpected fetch ${u}`)
}
let clockMs = 0
const deps = extra => ({
  userId: '1789', token: async () => 'TOKEN_A', fetchImpl: fakeFetch,
  uploadJpeg: async (buf, i) => { uploads.push({ bytes: buf.length, jpeg: buf[0] === 0xff && buf[1] === 0xd8 }); return `https://bucket.example/social-media/cards/ig/x-${i}.jpg` },
  sleep: async ms => { clockMs += ms }, clock: () => clockMs, ...extra,
})
const reset = () => { calls = []; uploads = []; statusScript = []; graphError = null; nextId = 1; clockMs = 0 }
const graph = c => c.url.startsWith('https://graph.instagram.com/')

// Single image happy path.
{
  reset()
  statusScript = [{ status_code: 'IN_PROGRESS' }, { status_code: 'FINISHED' }]
  const r = await publishToInstagram({ caption: 'EUR/USD leans lower.\n\n#forex', imageUrls: ['https://bucket.example/card.png'] }, deps())
  const create = calls.find(c => c.url.endsWith('/1789/media'))
  const publish = calls.find(c => c.url.endsWith('/1789/media_publish'))
  check('returns { id, permalink }', r.id === 'MEDIA_900' && r.permalink === 'https://www.instagram.com/p/ABC123/', JSON.stringify(r))
  check(`calls go to graph.instagram.com/${IG_GRAPH_VERSION}`, calls.filter(graph).every(c => c.url.startsWith(`https://graph.instagram.com/${IG_GRAPH_VERSION}/`)), calls.filter(graph).map(c => c.url).join(' '))
  check('the PNG card is uploaded as a JPEG before the container', uploads.length === 1 && uploads[0].jpeg, JSON.stringify(uploads))
  check('container created with the JPEG url and the caption', create?.body?.image_url === 'https://bucket.example/social-media/cards/ig/x-0.jpg' && create.body.caption.startsWith('EUR/USD leans lower.') && create.body.access_token === 'TOKEN_A', JSON.stringify(create?.body))
  check('status polled until FINISHED, then published with creation_id', calls.filter(c => c.url.includes('status_code')).length === 2 && publish?.body?.creation_id === 'C1', JSON.stringify(publish?.body))
  check('backoff waited between polls', clockMs >= 1000, `${clockMs}ms`)
}

// Carousel limits and shape.
{
  reset()
  let e; try { await publishToInstagram({ caption: 'x', imageUrls: Array.from({ length: 11 }, (_, i) => `https://bucket.example/${i}.png`) }, deps()) } catch (err) { e = err.message }
  check('carousel with 11 images → refused before any request', /at most 10 items \(got 11\)/.test(e || '') && calls.length === 0, `${e} calls=${calls.length}`)

  reset()
  const r = await publishToInstagram({ caption: 'Three views.', imageUrls: ['https://bucket.example/a.png', 'https://bucket.example/b.png', 'https://bucket.example/c.png'] }, deps())
  const items = calls.filter(c => c.url.endsWith('/media') && c.body?.is_carousel_item === 'true')
  const parent = calls.find(c => c.url.endsWith('/media') && c.body?.media_type === 'CAROUSEL')
  check('carousel: one child container per image, flagged is_carousel_item', items.length === 3 && items.every(c => !c.body.caption), JSON.stringify(items.map(c => c.body)))
  check('carousel: CAROUSEL parent lists the children and carries the caption', parent?.body?.children === 'C1,C2,C3' && parent.body.caption === 'Three views.', JSON.stringify(parent?.body))
  check('carousel: the parent is what gets published', calls.find(c => c.url.endsWith('/media_publish'))?.body?.creation_id === 'C4' && r.id === 'MEDIA_900')
}

// Container never finishes → timeout, no publish call.
{
  reset()
  statusScript = Array.from({ length: 50 }, () => ({ status_code: 'IN_PROGRESS' }))
  let e; try { await publishToInstagram({ caption: 'x', imageUrls: ['https://bucket.example/card.png'] }, deps()) } catch (err) { e = err.message }
  check('stuck container → timeout error naming the container', /did not finish processing within 60s/.test(e || '') && /IN_PROGRESS/.test(e), e)
  check('stuck container → media_publish never called', !calls.some(c => c.url.includes('media_publish')))
  check('timeout respects ~60s of backoff', clockMs <= 60000 && clockMs >= 30000, `${clockMs}ms`)

  reset()
  statusScript = [{ status_code: 'ERROR', status: 'Error: Media upload has failed with error code 2207004' }]
  let e2; try { await publishToInstagram({ caption: 'x', imageUrls: ['https://bucket.example/card.png'] }, deps()) } catch (err) { e2 = err.message }
  check('container ERROR → error with Meta\'s status, no publish', /ERROR: Error: Media upload/.test(e2 || '') && !calls.some(c => c.url.includes('media_publish')), e2)
}

// Readable errors.
{
  reset(); graphError = { status: 400, error: { message: 'Error validating access token: Session has expired', type: 'OAuthException', code: 190 } }
  let e1; try { await publishToInstagram({ caption: 'x', imageUrls: ['https://bucket.example/card.png'] }, deps()) } catch (err) { e1 = err.message }
  check('code 190 → "Instagram token expired — regenerate it in the Meta app dashboard"', e1 === 'Instagram token expired — regenerate it in the Meta app dashboard', e1)

  reset(); graphError = { status: 400, error: { message: 'You reached maximum number of posts...', code: 9, error_subcode: 2207042 } }
  let e2; try { await publishToInstagram({ caption: 'x', imageUrls: ['https://bucket.example/card.png'] }, deps()) } catch (err) { e2 = err.message }
  check('code 9 / 2207042 → publishing limit message', /publishing limit reached/.test(e2 || ''), e2)

  reset(); graphError = { status: 400, error: { message: 'The submitted image with aspect ratio 0.5 cannot be published.', code: 36003, error_subcode: 2207009 } }
  let e3; try { await publishToInstagram({ caption: 'x', imageUrls: ['https://bucket.example/card.png'] }, deps()) } catch (err) { e3 = err.message }
  check('other errors carry codes and Meta\'s message', /\(36003\/2207009\)/.test(e3 || '') && /aspect ratio 0\.5/.test(e3), e3)

  reset()
  let e4; try { await publishToInstagram({ caption: 'Read more https://biasforge.co', imageUrls: ['https://bucket.example/card.png'] }, deps()) } catch (err) { e4 = err.message }
  check('a link in the caption is refused before any request', /refusing to post a link/.test(e4 || '') && calls.length === 0, e4)

  reset()
  let e5; try { await publishToInstagram({ caption: 'x', imageUrls: [] }, deps()) } catch (err) { e5 = err.message }
  check('no image → refused', /needs an image/.test(e5 || ''), e5)

  reset()
  const wide = new PNG({ width: 1000, height: 300 }); wide.data.fill(255)
  const wideBuf = PNG.sync.write(wide)
  const wideFetch = async (u, i) => (String(u).startsWith('https://bucket.example/wide') ? json(200, {}) && { ok: true, status: 200, arrayBuffer: async () => wideBuf.buffer.slice(wideBuf.byteOffset, wideBuf.byteOffset + wideBuf.byteLength) } : fakeFetch(u, i))
  let e6; try { await publishToInstagram({ caption: 'x', imageUrls: ['https://bucket.example/wide.png'] }, deps({ fetchImpl: wideFetch })) } catch (err) { e6 = err.message }
  check('aspect ratio outside 4:5–1.91:1 → refused before any Graph call', /aspect ratio between 4:5 and 1\.91:1/.test(e6 || '') && !calls.some(graph), e6)
}

// ── Token store ───────────────────────────────────────────────────────────────
{
  let stored = null
  const saves = []
  const store = createIgTokenStore({ load: async () => stored, save: async v => { stored = v; saves.push(v) }, env: () => 'ENV_TOKEN_1' })
  check('first use seeds from IG_ACCESS_TOKEN', (await store.token()) === 'ENV_TOKEN_1' && stored?.token === 'ENV_TOKEN_1' && stored.refreshedAt === null)

  reset()
  const now = Date.parse('2026-09-22T09:00:00Z')
  const next = await store.refresh({ fetchImpl: fakeFetch, now })
  const refreshCall = calls.find(c => c.url.includes('refresh_access_token'))
  check('refresh calls graph.instagram.com/refresh_access_token with grant_type=ig_refresh_token', refreshCall?.url.startsWith('https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=ENV_TOKEN_1'), refreshCall?.url)
  check('refresh saves the new token and expiry to app_state', stored.token === 'REFRESHED_TOKEN' && stored.refreshedAt === '2026-09-22T09:00:00.000Z' && stored.expiresAt === '2026-11-21T09:00:00.000Z', JSON.stringify(stored))
  check('igTokenStatus reads the saved expiry', igTokenStatus(stored, now)?.daysLeft === 60, JSON.stringify(igTokenStatus(stored, now)))

  // The publisher uses the refreshed token, not the env one.
  reset()
  await publishToInstagram({ caption: 'x', imageUrls: ['https://bucket.example/card.png'] }, deps({ token: store.token }))
  check('publisher uses the refreshed token from app_state', calls.filter(graph).every(c => (c.body?.access_token || new URL(c.url).searchParams.get('access_token')) === 'REFRESHED_TOKEN'), calls.filter(graph).map(c => c.body?.access_token || new URL(c.url).searchParams.get('access_token')).join(','))

  // A token regenerated in the Meta dashboard and pasted into Railway replaces the stored one.
  const store2 = createIgTokenStore({ load: async () => stored, save: async v => { stored = v }, env: () => 'ENV_TOKEN_2' })
  check('changed IG_ACCESS_TOKEN re-seeds over the stored token', (await store2.token()) === 'ENV_TOKEN_2' && stored.refreshedAt === null)

  // Refresh failure throws with Meta's message and leaves the stored token alone.
  const before = { ...stored }
  const badFetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'Token is too new to refresh', code: 100 } }) })
  let e; try { await store2.refresh({ fetchImpl: badFetch }) } catch (err) { e = err.message }
  check('refresh failure throws Meta\'s message and keeps the stored token', /Token is too new to refresh/.test(e || '') && stored.token === before.token, e)

  const s3 = createIgTokenStore({ load: async () => null, save: async () => {}, env: () => '' })
  let e3; try { await s3.token() } catch (err) { e3 = err.message }
  check('no token anywhere → clear error', /IG_ACCESS_TOKEN/.test(e3 || ''), e3)
  check('igTokenStatus is null before the expiry is known', igTokenStatus({ token: 't', expiresAt: null }) === null)
}

// ── Stories ───────────────────────────────────────────────────────────────────
// Per Meta's IG User Media reference (Image Story Containers, read September 2026): a story is
// image_url + media_type=STORIES, no caption field, and the 4:5…1.91:1 feed ratio rule does not
// apply to it.
const STORY_CARD = await renderCard('bias_card', { pair: 'EURUSD', direction: 'BEARISH', confidence: 78, grade: 'A-', driver: 'Rate gap widening', date: '2026-09-22' }, { format: 'story' })
{
  reset()
  // The fake fetch hands back the feed card by default; a story needs the 9:16 one.
  const storyFetch = async (url, init) => (String(url).startsWith('https://bucket.example/story')
    ? { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => STORY_CARD.buffer.slice(STORY_CARD.byteOffset, STORY_CARD.byteOffset + STORY_CARD.byteLength) }
    : fakeFetch(url, init))
  statusScript = [{ status_code: 'IN_PROGRESS' }, { status_code: 'FINISHED' }]
  const r = await publishStory({ imageUrl: 'https://bucket.example/story.png' }, deps({ fetchImpl: storyFetch }))
  const create = calls.find(c => c.url.endsWith('/1789/media'))
  const publish = calls.find(c => c.url.endsWith('/1789/media_publish'))
  check('story: returns { id, permalink, story: true }', r.id === 'MEDIA_900' && r.story === true && r.permalink === 'https://www.instagram.com/p/ABC123/', JSON.stringify(r))
  check('story: container is media_type=STORIES with the image url', create?.body?.media_type === 'STORIES' && create.body.image_url === 'https://bucket.example/social-media/cards/ig/x-0.jpg', JSON.stringify(create?.body))
  check('story: no caption is sent — a story has no caption field', !('caption' in (create?.body || {})), JSON.stringify(create?.body))
  check('story: the 9:16 card is accepted, converted to JPEG first', uploads.length === 1 && uploads[0].jpeg, JSON.stringify(uploads))
  check('story: polled to FINISHED, then published with creation_id', calls.filter(c => c.url.includes('status_code')).length === 2 && publish?.body?.creation_id === 'C1', JSON.stringify(publish?.body))

  // A feed-shaped card in a story is Instagram's business (it crops), not an error — but it warns.
  reset()
  const warned = []
  const realWarn = console.warn
  console.warn = (...a) => warned.push(a.join(' '))
  await publishStory({ imageUrl: 'https://bucket.example/card.png' }, deps())
  console.warn = realWarn
  check('story: a non-9:16 image still posts, with a warning about cropping', warned.some(w => /recommends 9:16/.test(w)) && calls.some(c => c.url.endsWith('/media_publish')), warned.join(' | '))

  // The things that must fail before any request.
  reset()
  let e1; try { await publishStory({}, deps()) } catch (err) { e1 = err.message }
  check('story: no image → refused before any request', /needs an image/.test(e1 || '') && calls.length === 0, e1)
  reset()
  let e2; try { await publishStory({ imageUrl: 'https://bucket.example/story.png' }, deps({ userId: '' })) } catch (err) { e2 = err.message }
  check('story: no IG_USER_ID → clear error, no request', /IG_USER_ID/.test(e2 || '') && calls.length === 0, e2)

  // A Graph refusal (e.g. an account type that cannot publish stories) surfaces as a clear error
  // rather than a silent success — the queue stores it on the row.
  reset()
  graphError = { status: 400, error: { message: 'Unsupported post request', code: 100, error_subcode: 33 } }
  let e3; try { await publishStory({ imageUrl: 'https://bucket.example/story.png' }, deps()) } catch (err) { e3 = err.message }
  check('story: a Graph refusal becomes a clear error naming the step', /story container failed \(100\/33\)/.test(e3 || '') && !calls.some(c => c.url.includes('media_publish')), e3)

  reset()
  graphError = { status: 401, error: { message: 'expired', code: 190 } }
  let e4; try { await publishStory({ imageUrl: 'https://bucket.example/story.png' }, deps()) } catch (err) { e4 = err.message }
  check('story: an expired token says so plainly', /token expired/.test(e4 || ''), e4)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
