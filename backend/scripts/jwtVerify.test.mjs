// Test vectors for lib/jwtVerify.js — local Supabase access-token verification. Real ES256 keys
// generated here, a fake JWKS endpoint, and a fake getUser() to prove when the fallback runs.
//   node backend/scripts/jwtVerify.test.mjs

import { webcrypto } from 'node:crypto'
import { createJwtVerifier } from '../lib/jwtVerify.js'

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`)
}

const SUPA = 'https://proj.supabase.co'
const ISS = `${SUPA}/auth/v1`
const NOW = Date.parse('2026-09-29T12:00:00Z')
const T = Math.floor(NOW / 1000)
const quiet = { log() {}, warn() {}, error() {} }
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')

async function makeKey(kid) {
  const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = { ...(await webcrypto.subtle.exportKey('jwk', kp.publicKey)), kid, alg: 'ES256', use: 'sig' }
  return { kid, jwk, priv: kp.privateKey }
}
async function sign(key, claims, header = {}) {
  const h = b64({ alg: 'ES256', typ: 'JWT', kid: key.kid, ...header })
  const p = b64(claims)
  const sig = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, Buffer.from(`${h}.${p}`))
  return `${h}.${p}.${Buffer.from(sig).toString('base64url')}`
}
const good = (extra = {}) => ({ sub: 'user-1', email: 'a@b.co', iss: ISS, aud: 'authenticated', role: 'authenticated', exp: T + 3600, iat: T, ...extra })

const k1 = await makeKey('kid-1')
const k2 = await makeKey('kid-2')      // rotated-in key
const kX = await makeKey('kid-1')      // attacker key reusing a real kid

function setup({ keys = [k1.jwk], jwksFails = false } = {}) {
  const env = { jwksCalls: 0, getUserCalls: 0, keys, jwksFails, now: NOW }
  const verifier = createJwtVerifier({
    supabaseUrl: SUPA,
    now: () => env.now,
    log: quiet,
    fetchImpl: async (url) => {
      env.jwksCalls++
      if (url !== `${ISS}/.well-known/jwks.json`) throw new Error(`unexpected url ${url}`)
      if (env.jwksFails) return { ok: false, status: 503, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => ({ keys: env.keys }) }
    },
    getUser: async (token) => { env.getUserCalls++; return token === 'SUPABASE-SAYS-OK' || String(token).includes('.') ? { id: 'from-getUser' } : null },
  })
  return { env, v: verifier }
}

// ── happy path ────────────────────────────────────────────────────────────────
{
  const { env, v } = setup()
  const u = await v.verify(await sign(k1, good()))
  check('valid ES256 token → user from claims', u?.id === 'user-1' && u.email === 'a@b.co' && u.verifiedBy === 'jwt', JSON.stringify(u))
  check('valid token → no getUser call', env.getUserCalls === 0)
  const t = await sign(k1, good({ sub: 'user-2' }))
  await v.verify(t); await v.verify(t); await v.verify(t)
  check('JWKS fetched once for many verifications', env.jwksCalls === 1, `jwksCalls=${env.jwksCalls}`)
  check('aud as array containing "authenticated" → ok', (await v.verify(await sign(k1, good({ aud: ['authenticated', 'x'] }))))?.id === 'user-1')
}

// ── rejections (never fall back) ──────────────────────────────────────────────
{
  const { env, v } = setup()
  const cases = [
    ['expired', good({ exp: T - 1 })],
    ['exp exactly now', good({ exp: T })],
    ['no exp', (() => { const c = good(); delete c.exp; return c })()],
    ['wrong iss (other project)', good({ iss: 'https://other.supabase.co/auth/v1' })],
    ['iss without /auth/v1', good({ iss: SUPA })],
    ['aud anon', good({ aud: 'anon' })],
    ['role anon', good({ role: 'anon' })],
    ['role service_role', good({ role: 'service_role' })],
    ['no sub', (() => { const c = good(); delete c.sub; return c })()],
  ]
  for (const [name, claims] of cases) check(`reject: ${name}`, (await v.verify(await sign(k1, claims))) === null)
  check('reject: signed by attacker key with a real kid', (await v.verify(await sign(kX, good()))) === null)
  const t = await sign(k1, good())
  const [h, p, s] = t.split('.')
  check('reject: payload tampered after signing', (await v.verify(`${h}.${b64(good({ sub: 'admin' }))}.${s}`)) === null)
  check('reject: garbage signature', (await v.verify(`${h}.${p}.${b64('nope')}`)) === null)
  check('reject: not a JWT', (await v.verify('abc')) === null)
  check('reject: undecodable parts', (await v.verify('%%%.%%%.%%%')) === null)
  check('reject: alg none', (await v.verify(`${b64({ alg: 'none', kid: 'kid-1' })}.${p}.`)) === null)
  check('reject: empty token', (await v.verify('')) === null)
  check('rejections never call getUser', env.getUserCalls === 0, `getUserCalls=${env.getUserCalls}`)
}

// ── fail-safe fallbacks to getUser ────────────────────────────────────────────
{
  const { env, v } = setup({ jwksFails: true })
  const u = await v.verify(await sign(k1, good()))
  check('JWKS unreachable → falls back to getUser', env.getUserCalls === 1 && u?.id === 'from-getUser', JSON.stringify(u))
}
{
  const { env, v } = setup()
  const hs = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(good())}.${b64('sig')}`
  const u = await v.verify(hs)
  check('HS256 (legacy secret) token → getUser decides', env.getUserCalls === 1 && u?.id === 'from-getUser')
  env.getUserCalls = 0
  const noKid = await sign(k1, good(), { kid: undefined })
  await v.verify(noKid)
  check('no kid → getUser decides', env.getUserCalls === 1)
}
{
  // Rotation: a token signed with kid-2 before our cache knows it → exactly one refetch, then local.
  const { env, v } = setup({ keys: [k1.jwk] })
  await v.verify(await sign(k1, good()))                     // warms the cache with kid-1 only
  env.keys = [k1.jwk, k2.jwk]                                // Supabase publishes kid-2
  env.now += 31 * 1000                                       // past the refetch throttle
  const u = await v.verify(await sign(k2, good({ sub: 'rotated' })))
  check('unknown kid → one JWKS refetch → verified locally', u?.id === 'rotated' && env.jwksCalls === 2 && env.getUserCalls === 0, `jwks=${env.jwksCalls} getUser=${env.getUserCalls}`)
}
{
  const { env, v } = setup({ keys: [k1.jwk] })
  await v.verify(await sign(k1, good()))
  env.now += 31 * 1000
  const junk = await makeKey('kid-junk')
  await v.verify(await sign(junk, good({ sub: 'j1' })))
  await v.verify(await sign(junk, good({ sub: 'j2' })))
  check('unknown kid still missing after refetch → getUser decides (fail safe)', env.getUserCalls === 2)
  check('junk kids refetch JWKS at most once per 30s', env.jwksCalls === 2, `jwksCalls=${env.jwksCalls}`)
}
{
  // Cached JWKS goes stale after 10 min → refetched.
  const { env, v } = setup()
  await v.verify(await sign(k1, good({ sub: 'a' })))
  env.now += 11 * 60 * 1000
  await v.verify(await sign(k1, good({ sub: 'b', exp: Math.floor(env.now / 1000) + 600 })))
  check('JWKS refetched after its 10-min TTL', env.jwksCalls === 2)
}
{
  // A verified token cached past its own exp must not keep passing.
  const { v, env } = setup()
  const t = await sign(k1, good({ exp: T + 5 }))
  check('short-lived token ok now', (await v.verify(t))?.id === 'user-1')
  env.now += 6 * 1000
  check('same token after exp → rejected (result cache honours exp)', (await v.verify(t)) === null)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
