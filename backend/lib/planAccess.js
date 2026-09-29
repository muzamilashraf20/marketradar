// ---------------------------------------------------------------------------
// Plan access: the ONE rule for "may this caller use Pro", and the admin check.
//
// Every server-side gate calls this, and /api/user/plan returns its verdict to the app as
// `pro`, so the browser shows exactly what the server enforces. Nothing else should look
// at user_plans.tier to decide access; adding a second copy of the rule is how the
// frontend and backend came to disagree about expiry in the first place.
// ---------------------------------------------------------------------------

import { createHash, timingSafeEqual } from 'node:crypto'

// A plan row grants Pro while tier is 'pro' and it has not run out. Gumroad subscriptions carry no
// expires_at (the webhook downgrades them on cancel); crypto plans do, and lapse on that date.
// An unparseable expires_at is treated as not expired, the same as the old expire-on-read check.
export function hasPro(row, now = Date.now()) {
  if (row?.tier !== 'pro') return false
  if (!row.expires_at) return true
  const t = Date.parse(row.expires_at)
  return !(Number.isFinite(t) && t <= now)
}

// Admin = a Supabase user id listed in ADMIN_USER_IDS (comma list). Unset → nobody. By id and never
// by email: /api/register creates accounts already confirmed, so an address proves nothing.
export function isAdminUser(user, env = process.env) {
  if (!user?.id) return false
  const ids = String(env.ADMIN_USER_IDS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return ids.includes(String(user.id).toLowerCase())
}

// PRO_GATE rollout switch. Anything but "enforce" (including unset) only logs who would be refused.
export function gateMode(env = process.env) {
  return String(env.PRO_GATE || '').trim().toLowerCase() === 'enforce' ? 'enforce' : 'log'
}

// Constant-time compare for shared secrets. Both sides are hashed first so a length difference
// cannot leak through timingSafeEqual's length check. No expected secret → nothing matches.
export function secretMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string' || !expected) return false
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

const bearer = req => {
  const h = req?.headers?.authorization
  if (typeof h !== 'string' || !h.startsWith('Bearer ')) return null
  return h.slice(7).trim() || null
}

// Resolves a request to { user, row, pro, admin, unavailable }. A dashboard load fires half a dozen
// gated requests at once, so the token → user and user → plan lookups are cached briefly.
// /api/user/plan calls remember() with the row it just read, so a fresh purchase is seen as soon as
// the app refetches its plan rather than after the cache runs out.
//
// verifyToken (optional): async (token) => user | null — the LOCAL JWT check (lib/jwtVerify.js).
// When given it is the default path; resolve(req, { strict: true }) always asks Supabase instead
// (uncached getUser) — for account changes that must honour a session revoked a minute ago.
export function createAccessResolver({ supabase, verifyToken = null, ttlMs = 60_000, env = process.env, now = () => Date.now() }) {
  const users = new Map()   // sha256(token) → { user, at }
  const rows = new Map()    // user id → { row, at }
  const fresh = e => e && now() - e.at < ttlMs
  const cap = m => { if (m.size > 5000) m.clear() }
  // The dashboard's parallel requests all miss together once the minute is up; they share ONE
  // lookup instead of each making its own Supabase call.
  const pending = new Map()
  const shared = (key, fn) => {
    if (pending.has(key)) return pending.get(key)
    const p = fn().finally(() => pending.delete(key))
    pending.set(key, p)
    return p
  }

  async function fullUser(token) {
    try {
      const { data, error } = await supabase.auth.getUser(token)
      return error ? null : (data?.user || null)
    } catch { return null }
  }

  async function userFor(token, strict = false) {
    const key = createHash('sha256').update(token).digest('hex')
    if (strict) return shared(`s:${key}`, () => fullUser(token))
    const hit = users.get(key)
    if (fresh(hit)) return hit.user
    return shared(`u:${key}`, async () => {
      const user = verifyToken ? await verifyToken(token) : await fullUser(token)
      if (user) { cap(users); users.set(key, { user, at: now() }) }
      return user
    })
  }

  async function rowFor(userId) {
    const hit = rows.get(userId)
    if (fresh(hit)) return { row: hit.row }
    return shared(`r:${userId}`, async () => {
      const { data, error } = await supabase.from('user_plans').select('tier,expires_at').eq('user_id', userId).maybeSingle()
      if (error) return { unavailable: true }
      cap(rows); rows.set(userId, { row: data || null, at: now() })
      return { row: data || null }
    })
  }

  return {
    async resolve(req, { strict = false } = {}) {
      const token = bearer(req)
      const user = token ? await userFor(token, strict) : null
      if (!user) return { user: null, row: null, pro: false, admin: false, unavailable: false }
      const admin = isAdminUser(user, env)
      let got
      try { got = await rowFor(user.id) } catch { got = { unavailable: true } }
      if (got.unavailable) return { user, row: null, pro: admin, admin, unavailable: !admin }
      return { user, row: got.row, pro: admin || hasPro(got.row, now()), admin, unavailable: false }
    },
    remember(userId, row) {
      if (!userId) return
      cap(rows); rows.set(userId, { row: row ? { tier: row.tier, expires_at: row.expires_at ?? null } : null, at: now() })
    },
  }
}
