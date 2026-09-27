// Test vectors for lib/planAccess.js — the one Pro rule, the admin check, the rollout switch, the
// webhook secret compare, and the request resolver (against a fake Supabase, no network).
//   node backend/scripts/planAccess.test.mjs

import { hasPro, isAdminUser, gateMode, secretMatches, createAccessResolver } from '../lib/planAccess.js'

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`)
}

const NOW = Date.parse('2026-09-27T12:00:00Z')
const DAY = 86400e3

// ── hasPro ────────────────────────────────────────────────────────────────────
check('no row → not pro', hasPro(null, NOW) === false)
check('free → not pro', hasPro({ tier: 'free' }, NOW) === false)
check('pro, no expiry (Gumroad) → pro', hasPro({ tier: 'pro', expires_at: null }, NOW) === true)
check('pro, expiry ahead (crypto) → pro', hasPro({ tier: 'pro', expires_at: new Date(NOW + DAY).toISOString() }, NOW) === true)
check('pro, expiry passed → not pro', hasPro({ tier: 'pro', expires_at: new Date(NOW - 1).toISOString() }, NOW) === false)
check('pro, expiry exactly now → not pro', hasPro({ tier: 'pro', expires_at: new Date(NOW).toISOString() }, NOW) === false)
check('pro, unparseable expiry → pro (as the old expire-on-read)', hasPro({ tier: 'pro', expires_at: 'garbage' }, NOW) === true)
check('trial_start grants nothing', hasPro({ tier: 'free', trial_start: new Date(NOW).toISOString() }, NOW) === false)
check('tier match is exact', hasPro({ tier: 'PRO' }, NOW) === false)

// ── isAdminUser ───────────────────────────────────────────────────────────────
const ID = '1b2c3d4e-0000-4000-8000-000000000001'
check('unset list → nobody', isAdminUser({ id: ID }, {}) === false)
check('listed id → admin', isAdminUser({ id: ID }, { ADMIN_USER_IDS: ` other , ${ID.toUpperCase()} ` }) === true)
check('email is ignored', isAdminUser({ id: 'x', email: 'a@b.co', email_confirmed_at: 'now' }, { ADMIN_USER_IDS: 'a@b.co' }) === false)
check('no user → not admin', isAdminUser(null, { ADMIN_USER_IDS: ID }) === false)

// ── gateMode ──────────────────────────────────────────────────────────────────
check('unset → log', gateMode({}) === 'log')
check('"log" → log', gateMode({ PRO_GATE: 'log' }) === 'log')
check('"enforce" → enforce', gateMode({ PRO_GATE: ' Enforce ' }) === 'enforce')
check('typo → log (fails open to the old behaviour)', gateMode({ PRO_GATE: 'enforced' }) === 'log')

// ── secretMatches ─────────────────────────────────────────────────────────────
check('match', secretMatches('s3cret-value', 's3cret-value') === true)
check('mismatch', secretMatches('s3cret-valuX', 's3cret-value') === false)
check('different length', secretMatches('s3cret', 's3cret-value') === false)
check('missing given', secretMatches(undefined, 's3cret-value') === false)
check('array (?secret[]=) refused', secretMatches(['s3cret-value'], 's3cret-value') === false)
check('no expected secret → refuse everything', secretMatches('', '') === false && secretMatches('x', undefined) === false)

// ── createAccessResolver ──────────────────────────────────────────────────────
function fakeSupabase({ users = {}, rows = {}, rowError = false } = {}) {
  const calls = { getUser: 0, rows: 0 }
  return {
    calls,
    auth: { async getUser(token) { calls.getUser++; return users[token] ? { data: { user: users[token] }, error: null } : { data: { user: null }, error: { message: 'bad' } } } },
    from() {
      let uid
      const q = {
        select() { return q },
        eq(_c, v) { uid = v; return q },
        async maybeSingle() { calls.rows++; return rowError ? { data: null, error: { message: 'down' } } : { data: rows[uid] || null, error: null } },
      }
      return q
    },
  }
}
const req = token => ({ headers: token ? { authorization: `Bearer ${token}` } : {} })
let clock = NOW
const users = { tp: { id: 'u-pro' }, tf: { id: 'u-free' }, ta: { id: ID }, tx: { id: 'u-exp' } }
const rows = {
  'u-pro': { tier: 'pro', expires_at: null },
  'u-free': { tier: 'free', expires_at: null },
  'u-exp': { tier: 'pro', expires_at: new Date(NOW - DAY).toISOString() },
}
const sb = fakeSupabase({ users, rows })
const acc = createAccessResolver({ supabase: sb, env: { ADMIN_USER_IDS: ID }, now: () => clock, ttlMs: 60_000 })

{
  const a = await acc.resolve(req(null))
  check('no header → anonymous', a.user === null && a.pro === false)
  const b = await acc.resolve({ headers: { authorization: 'Basic tp' } })
  check('non-Bearer header → anonymous', b.user === null)
  const c = await acc.resolve(req('nope'))
  check('invalid token → anonymous', c.user === null && c.pro === false)
  const d = await acc.resolve(req('tp'))
  check('pro user → pro', d.user?.id === 'u-pro' && d.pro === true && d.admin === false)
  const e = await acc.resolve(req('tf'))
  check('free user → signed in, not pro', e.user?.id === 'u-free' && e.pro === false)
  const f = await acc.resolve(req('tx'))
  check('expired crypto user → not pro', f.pro === false)
  const g = await acc.resolve(req('ta'))
  check('admin with no plan row → pro', g.admin === true && g.pro === true && g.row === null)
}
{
  const before = { ...sb.calls }
  await acc.resolve(req('tp')); await acc.resolve(req('tp')); await acc.resolve(req('tp'))
  check('cached: repeat requests make no new lookups', sb.calls.getUser === before.getUser && sb.calls.rows === before.rows, JSON.stringify({ before, after: sb.calls }))
  clock += 61_000
  await acc.resolve(req('tp'))
  check('cache expires after ttl', sb.calls.getUser === before.getUser + 1 && sb.calls.rows === before.rows + 1)
}
{
  // A purchase: the row changes, the cache still says free, /api/user/plan calls remember().
  const primed = await acc.resolve(req('tf'))
  check('free user cached as not pro', primed.pro === false)
  rows['u-free'] = { tier: 'pro', expires_at: null }
  const stale = await acc.resolve(req('tf'))
  check('until remembered, the cached verdict stands', stale.pro === false)
  acc.remember('u-free', rows['u-free'])
  const fresh = await acc.resolve(req('tf'))
  check('remember() updates the verdict at once', fresh.pro === true)
}
{
  const down = createAccessResolver({ supabase: fakeSupabase({ users, rows, rowError: true }), env: { ADMIN_USER_IDS: ID }, now: () => clock })
  const a = await down.resolve(req('tp'))
  check('plan table error → unavailable, not pro', a.user?.id === 'u-pro' && a.unavailable === true && a.pro === false)
  const b = await down.resolve(req('ta'))
  check('plan table error → admin still pro', b.pro === true && b.unavailable === false)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
