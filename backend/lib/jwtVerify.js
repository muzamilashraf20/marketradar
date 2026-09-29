// Local verification of Supabase access tokens.
//
// supabase.auth.getUser(token) is a network round trip to Supabase Auth on every call (~200ms from
// Railway). The project signs access tokens with an asymmetric key (ES256, published in its JWKS),
// so a token can be verified here instead. The rules, in order:
//
//   1. Structure: three base64url parts, JSON header + payload.                    else → REJECT
//   2. Signature against the project's JWKS key for the token's `kid`.             bad  → REJECT
//   3. Claims: exp in the future, iss === `${SUPABASE_URL}/auth/v1`,
//      aud contains "authenticated", role === "authenticated", sub present.       else → REJECT
//
// Fail SAFE, never open. Anything that is not a verdict about the token itself falls back to the
// full getUser() check — the JWKS cannot be fetched, the key is not in it even after one refetch,
// the algorithm is symmetric (HS*, a legacy-secret token), or WebCrypto throws. A token is never
// accepted without either a verified signature or Supabase's own answer.
//
// JWKS cached 10 min. An unknown `kid` triggers ONE refetch (throttled to one per 30s, so a stream
// of junk kids cannot turn into a JWKS request per call). Verified results are cached per token
// until the token expires (at most 10 min), so a dashboard's parallel requests verify once.

import { webcrypto, createHash } from 'node:crypto'

const subtle = webcrypto.subtle
const ALGS = {
  ES256: { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' },
  RS256: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
}

const b64urlBytes = (s) => Buffer.from(s, 'base64url')
const b64urlJson = (s) => JSON.parse(b64urlBytes(s).toString('utf8'))

// Why a token was rejected vs why local verification could not decide.
class Rejected extends Error {}
class Undecided extends Error {}

export function createJwtVerifier({
  supabaseUrl,
  getUser,                          // async (token) => user | null — the full Supabase check
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  jwksTtlMs = 10 * 60 * 1000,
  refetchGapMs = 30 * 1000,
  log = console,
}) {
  const base = String(supabaseUrl || '').replace(/\/+$/, '')
  const issuer = `${base}/auth/v1`
  const jwksUrl = `${base}/auth/v1/.well-known/jwks.json`

  let jwks = { keys: [], at: 0 }
  let lastFetchAt = 0
  let inflight = null
  const keyCache = new Map()        // kid → CryptoKey
  const results = new Map()         // sha256(token) → { user, until }
  const stats = { local: 0, fallback: 0, rejected: 0 }

  async function loadJwks() {
    if (inflight) return inflight
    inflight = (async () => {
      lastFetchAt = now()
      const r = await fetchImpl(jwksUrl, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) throw new Error(`JWKS HTTP ${r.status}`)
      const d = await r.json()
      if (!Array.isArray(d?.keys)) throw new Error('JWKS has no keys array')
      jwks = { keys: d.keys, at: now() }
      keyCache.clear()
      return jwks
    })().finally(() => { inflight = null })
    return inflight
  }

  async function keyFor(kid, alg) {
    const fresh = now() - jwks.at < jwksTtlMs
    let jwk = fresh ? jwks.keys.find(k => k.kid === kid) : null
    if (!jwk) {
      // Stale cache, or a kid we have never seen (key rotation): one refetch, throttled.
      if (!fresh || now() - lastFetchAt >= refetchGapMs) {
        try { await loadJwks() } catch (e) { throw new Undecided(`JWKS unavailable: ${e?.message}`) }
      }
      jwk = jwks.keys.find(k => k.kid === kid)
    }
    if (!jwk) throw new Undecided(`kid ${kid} not in JWKS`)
    if (keyCache.has(kid)) return keyCache.get(kid)
    const { hash, ...importAlg } = ALGS[alg]
    const params = alg === 'RS256' ? { ...importAlg, hash } : importAlg
    const key = await subtle.importKey('jwk', jwk, params, false, ['verify'])
    keyCache.set(kid, key)
    return key
  }

  async function verifyLocal(token) {
    const parts = String(token).split('.')
    if (parts.length !== 3) throw new Rejected('malformed token')
    let header, payload
    try { header = b64urlJson(parts[0]); payload = b64urlJson(parts[1]) } catch { throw new Rejected('malformed token') }

    const alg = header?.alg
    if (!alg || String(alg).startsWith('HS')) throw new Undecided(`symmetric alg ${alg || 'none'}`)
    if (!ALGS[alg]) throw new Rejected(`unsupported alg ${alg}`)
    if (!header.kid) throw new Undecided('no kid')

    let ok
    try {
      const key = await keyFor(header.kid, alg)
      const verifyAlg = alg === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' }
      ok = await subtle.verify(verifyAlg, key, b64urlBytes(parts[2]), Buffer.from(`${parts[0]}.${parts[1]}`))
    } catch (e) {
      if (e instanceof Undecided) throw e
      throw new Undecided(`verify error: ${e?.message}`)
    }
    if (!ok) throw new Rejected('bad signature')

    const t = Math.floor(now() / 1000)
    if (typeof payload.exp !== 'number' || payload.exp <= t) throw new Rejected('expired')
    if (payload.iss !== issuer) throw new Rejected(`iss ${payload.iss}`)
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (!aud.includes('authenticated')) throw new Rejected(`aud ${payload.aud}`)
    if (payload.role !== 'authenticated') throw new Rejected(`role ${payload.role}`)
    if (!payload.sub) throw new Rejected('no sub')

    return {
      user: {
        id: payload.sub,
        email: payload.email || null,
        phone: payload.phone || null,
        role: payload.role,
        aud: payload.aud,
        app_metadata: payload.app_metadata || {},
        user_metadata: payload.user_metadata || {},
        is_anonymous: !!payload.is_anonymous,
        verifiedBy: 'jwt',
      },
      exp: payload.exp,
    }
  }

  // Returns the user for a valid token, or null. Never throws.
  async function verify(token) {
    if (!token) return null
    const key = createHash('sha256').update(token).digest('hex')
    const hit = results.get(key)
    if (hit && hit.until > now()) return hit.user

    try {
      const { user, exp } = await verifyLocal(token)
      stats.local++
      if (results.size > 5000) results.clear()
      results.set(key, { user, until: Math.min(exp * 1000, now() + 10 * 60 * 1000) })
      return user
    } catch (e) {
      if (e instanceof Rejected) { stats.rejected++; return null }
      // Undecided (or anything unexpected): Supabase decides. Not cached — the next call retries local.
      stats.fallback++
      if (stats.fallback <= 5 || stats.fallback % 100 === 0) log.warn(`🔐 [jwt] local verify undecided (${e?.message}) → full getUser (fallbacks so far: ${stats.fallback})`)
      try { return (await getUser(token)) || null } catch { return null }
    }
  }

  return { verify, stats: () => ({ ...stats, jwksKeys: jwks.keys.length, jwksAgeMs: jwks.at ? now() - jwks.at : null }) }
}
