// Test vectors for the LinkedIn publisher.
//   node backend/scripts/linkedinPublisher.test.mjs
//
// global fetch is replaced with a recorder, so nothing reaches LinkedIn. What is checked: the
// little-text escaping (the one thing that silently breaks posts), the request shapes against
// LinkedIn's docs, and the error messages the queue will DM.

import {
  escapeLittleText, toLittleCommentary, publishToLinkedIn, linkedinTokenStatus, LINKEDIN_VERSION,
} from '../social/linkedinPublisher.js'

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`)
}
const same = (a, b) => a === b

// ── little text ───────────────────────────────────────────────────────────────
{
  const got = escapeLittleText('(Fed) [BoC] #CPI @user_name')
  const want = '\\(Fed\\) \\[BoC\\] \\#CPI \\@user\\_name'
  check('"(Fed) [BoC] #CPI @user_name" is escaped', same(got, want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)

  const all = '| { } @ [ ] ( ) < > # \\ * _ ~'
  const allWant = '\\| \\{ \\} \\@ \\[ \\] \\( \\) \\< \\> \\# \\\\ \\* \\_ \\~'
  check('every reserved character from the docs is escaped', same(escapeLittleText(all), allWant), JSON.stringify(escapeLittleText(all)))

  check('a backslash is escaped once, not twice', same(escapeLittleText('a\\b'), 'a\\\\b'), JSON.stringify(escapeLittleText('a\\b')))
  check('already-escaped-looking input is escaped again (text is text)', same(escapeLittleText('\\#'), '\\\\\\#'), JSON.stringify(escapeLittleText('\\#')))
  check('plain text, punctuation and emoji pass through', same(escapeLittleText('Gold is bid. Yields slip — 4.2%! 📉'), 'Gold is bid. Yields slip — 4.2%! 📉'))
  check('newlines are kept', same(escapeLittleText('one\n\ntwo'), 'one\n\ntwo'))
  check('null/undefined become empty', same(escapeLittleText(null), '') && same(escapeLittleText(undefined), ''))

  // Trailing hashtag line → real hashtags via the template; everything else escaped.
  const post = 'The rate gap (2Y) is doing the work.\n\nPositioning is stretched.\n\n#forex #macro #EUR_USD'
  const little = toLittleCommentary(post)
  check('trailing hashtag line becomes {hashtag|\\#|…} templates',
    little.endsWith('{hashtag|\\#|forex} {hashtag|\\#|macro} {hashtag|\\#|EUR\\_USD}'), JSON.stringify(little))
  check('body above the hashtags is still escaped', little.startsWith('The rate gap \\(2Y\\) is doing the work.'), JSON.stringify(little))
  check('a # in the middle of the text stays escaped text', toLittleCommentary('Watch #CPI today.') === 'Watch \\#CPI today.', JSON.stringify(toLittleCommentary('Watch #CPI today.')))
  check('a post that is only hashtags is escaped, not templated', toLittleCommentary('#forex') === '\\#forex', JSON.stringify(toLittleCommentary('#forex')))
  check('mixed last line is not treated as hashtags', toLittleCommentary('a\n\nsee #forex today').endsWith('see \\#forex today'), JSON.stringify(toLittleCommentary('a\n\nsee #forex today')))
}

// ── token status ──────────────────────────────────────────────────────────────
{
  const now = Date.parse('2026-09-21T12:00:00Z')
  process.env.LINKEDIN_TOKEN_EXPIRES = '2026-10-01'
  const s = linkedinTokenStatus(now)
  check('9.5 days before expiry → daysLeft 9, not expired', s.daysLeft === 9 && !s.expired, JSON.stringify(s))
  process.env.LINKEDIN_TOKEN_EXPIRES = '2026-09-21'
  check('on the expiry date → expired', linkedinTokenStatus(now).expired === true, JSON.stringify(linkedinTokenStatus(now)))
  process.env.LINKEDIN_TOKEN_EXPIRES = '2026-09-22'
  check('the day before → daysLeft 0, not yet expired', linkedinTokenStatus(now).daysLeft === 0 && !linkedinTokenStatus(now).expired, JSON.stringify(linkedinTokenStatus(now)))
  delete process.env.LINKEDIN_TOKEN_EXPIRES
  check('unset → null', linkedinTokenStatus(now) === null)
  process.env.LINKEDIN_TOKEN_EXPIRES = 'soon'
  check('malformed → null', linkedinTokenStatus(now) === null)
  delete process.env.LINKEDIN_TOKEN_EXPIRES
}

// ── HTTP flow, with fetch recorded ────────────────────────────────────────────
const realFetch = globalThis.fetch
let calls = []
let script = []   // responses to hand back, in order
const resp = (status, { json, headers = {}, text } = {}) => ({
  ok: status >= 200 && status < 300, status, statusText: `status ${status}`,
  headers: { get: k => headers[k.toLowerCase()] ?? null },
  json: async () => json,
  text: async () => text ?? (json ? JSON.stringify(json) : ''),
  arrayBuffer: async () => new Uint8Array(20000).fill(7).buffer,
})
globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); const r = script.shift(); if (!r) throw new Error(`unexpected fetch ${url}`); return r }
const noSleep = { sleep: async () => {} }
process.env.LINKEDIN_ACCESS_TOKEN = 'tok123'
process.env.LINKEDIN_MEMBER_ID = 'AbC_12'

{
  calls = []; script = [resp(201, { headers: { 'x-restli-id': 'urn:li:share:7000000000000000001' } })]
  const r = await publishToLinkedIn({ text: 'Rates (2Y) keep the dollar bid.' }, noSleep)
  const c = calls[0]
  const body = JSON.parse(c.init.body)
  check('text post: returns the x-restli-id', r.id === 'urn:li:share:7000000000000000001', JSON.stringify(r))
  check('text post: POST /rest/posts, not ugcPosts', c.url === 'https://api.linkedin.com/rest/posts' && c.init.method === 'POST', c.url)
  check(`headers: Bearer, LinkedIn-Version ${LINKEDIN_VERSION}, Rest.li 2.0.0`,
    c.init.headers.Authorization === 'Bearer tok123' && c.init.headers['LinkedIn-Version'] === LINKEDIN_VERSION && c.init.headers['X-Restli-Protocol-Version'] === '2.0.0', JSON.stringify(c.init.headers))
  check('body: person author, PUBLIC, MAIN_FEED, PUBLISHED',
    body.author === 'urn:li:person:AbC_12' && body.visibility === 'PUBLIC' && body.distribution.feedDistribution === 'MAIN_FEED' && body.lifecycleState === 'PUBLISHED', JSON.stringify(body))
  check('body: commentary is little-escaped', body.commentary === 'Rates \\(2Y\\) keep the dollar bid.', JSON.stringify(body.commentary))
  check('text post: no content block', body.content === undefined)
}

{
  calls = []
  script = [
    resp(200, { json: { value: { uploadUrl: 'https://www.linkedin.com/dms-uploads/XYZ/uploaded-image/0?x=1', image: 'urn:li:image:C4E10AQF' } } }),
    resp(200, { json: {} }),                                   // fetching our PNG from the bucket
    resp(201, {}),                                             // PUT to LinkedIn
    resp(201, { headers: { 'x-restli-id': 'urn:li:ugcPost:6999' } }),
  ]
  const r = await publishToLinkedIn({ text: 'Gold bid.', imageUrl: 'https://bucket.example/card.png' }, noSleep)
  const [init, png, put, post] = calls
  check('image post: returns the post id', r.id === 'urn:li:ugcPost:6999', JSON.stringify(r))
  check('image: initializeUpload for the person owner',
    init.url === 'https://api.linkedin.com/rest/images?action=initializeUpload' && JSON.parse(init.init.body).initializeUploadRequest.owner === 'urn:li:person:AbC_12', `${init.url} ${init.init.body}`)
  check('image: our PNG is fetched from the bucket', png.url === 'https://bucket.example/card.png')
  check('image: bytes PUT to the upload URL with the OAuth token',
    put.url.startsWith('https://www.linkedin.com/dms-uploads/') && put.init.method === 'PUT' && put.init.headers.Authorization === 'Bearer tok123' && put.init.body?.length === 20000, `${put.url} ${put.init.method}`)
  check('image: post references the image URN in content.media', JSON.parse(post.init.body).content.media.id === 'urn:li:image:C4E10AQF', post.init.body)
}

// Errors
{
  script = [resp(401, { json: { message: 'Invalid access token' } })]
  let e1; try { await publishToLinkedIn({ text: 'x' }, noSleep) } catch (e) { e1 = e.message }
  check('401 → "LinkedIn token expired or revoked — re-run the token script"', e1 === 'LinkedIn token expired or revoked — re-run the token script', e1)

  script = [resp(422, { json: { message: 'commentary: FIELD_LENGTH_TOO_LONG' } })]
  let e2; try { await publishToLinkedIn({ text: 'x' }, noSleep) } catch (e) { e2 = e.message }
  check('other errors carry status and LinkedIn\'s message', /\(422\)/.test(e2) && /FIELD_LENGTH_TOO_LONG/.test(e2), e2)

  script = [resp(403, { json: { message: 'Not enough permissions to access: images' } })]
  let e3; try { await publishToLinkedIn({ text: 'x', imageUrl: 'https://b/c.png' }, noSleep) } catch (e) { e3 = e.message }
  check('image-step errors are labelled', /image upload init failed \(403\)/.test(e3), e3)

  script = [resp(201, {})]
  let e4; try { await publishToLinkedIn({ text: 'x' }, noSleep) } catch (e) { e4 = e.message }
  check('201 without x-restli-id is an error, not a silent success', /no x-restli-id/.test(e4), e4)

  calls = []
  let e5; try { await publishToLinkedIn({ text: 'Read more at https://biasforge.co' }, noSleep) } catch (e) { e5 = e.message }
  check('a link in the body is refused before any request', /refusing to post a link/.test(e5) && calls.length === 0, `${e5} calls=${calls.length}`)

  delete process.env.LINKEDIN_MEMBER_ID
  let e6; try { await publishToLinkedIn({ text: 'x' }, noSleep) } catch (e) { e6 = e.message }
  check('missing member id is named', /LINKEDIN_MEMBER_ID/.test(e6), e6)
}

globalThis.fetch = realFetch
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
