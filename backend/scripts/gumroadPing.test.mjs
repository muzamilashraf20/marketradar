// Test vectors for lib/gumroadPing.js — which event a Gumroad POST is, and the expiry a charge buys.
//   node backend/scripts/gumroadPing.test.mjs

import { classifyGumroadPing, gumroadExpiry, nextExpiry, cancelExpiry, GRACE_DAYS } from '../lib/gumroadPing.js'

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`)
}
const is = (got, want) => [JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`]

// ── classify: Ping format (form-encoded strings) ─────────────────────────────
const sale = { email: ' Buyer@X.co ', resource_name: 'sale', refunded: 'false', disputed: 'false', recurrence: 'monthly', sale_timestamp: '2026-09-10T12:00:00Z' }
check('first sale → sale, email normalised', ...is(classifyGumroadPing(sale), { kind: 'sale', event: 'sale', email: 'buyer@x.co' }))
check('settings Ping without resource_name → sale', classifyGumroadPing({ email: 'a@b.co' }).kind === 'sale')
check('recurring charge → sale', classifyGumroadPing({ ...sale, is_recurring_charge: 'true' }).kind === 'sale')
check('refund resource → revoke', ...is(classifyGumroadPing({ ...sale, resource_name: 'refund', refunded: 'true' }), { kind: 'revoke', event: 'refund', email: 'buyer@x.co' }))
check('refunded flag on a sale ping → revoke', classifyGumroadPing({ ...sale, refunded: 'true' }).event === 'refund')
check('dispute resource → revoke', classifyGumroadPing({ ...sale, resource_name: 'dispute' }).event === 'dispute')
check('disputed flag → revoke', classifyGumroadPing({ ...sale, disputed: 'true' }).kind === 'revoke')
check('dispute_won → ignore', classifyGumroadPing({ ...sale, resource_name: 'dispute_won' }).kind === 'ignore')
check('"false" strings are not truthy', classifyGumroadPing({ email: 'a@b.co', refunded: 'false', disputed: 'false', cancelled: 'false' }).kind === 'sale')

// ── classify: subscription format (user_email, no resource_name) ──────────────
const subBase = { subscription_id: 's1', user_email: 'Sub@X.co', recurrence: 'monthly', charge_occurrence_count: '3' }
check('cancellation (user_email, cancelled=true) → cancel, not an immediate revoke',
  ...is(classifyGumroadPing({ ...subBase, cancelled: 'true', cancelled_at: '2026-10-01T00:00:00Z', cancelled_by_buyer: 'true' }), { kind: 'cancel', event: 'cancellation', email: 'sub@x.co' }))
check('subscription_ended → revoke', ...is(classifyGumroadPing({ ...subBase, ended_at: '2026-10-01T00:00:00Z', ended_reason: 'failed_payment' }), { kind: 'revoke', event: 'subscription_ended', email: 'sub@x.co' }))
check('subscription_updated → ignore', classifyGumroadPing({ ...subBase, type: 'upgrade', effective_as_of: '2026-10-01T00:00:00Z' }).event === 'subscription_updated')
check('subscription_restarted → ignore', classifyGumroadPing({ ...subBase, restarted_at: '2026-10-01T00:00:00Z' }).event === 'subscription_restarted')
check('explicit resource_name wins', classifyGumroadPing({ user_email: 'a@b.co', resource_name: 'cancellation' }).event === 'cancellation')
check('no email at all → email null', classifyGumroadPing({ resource_name: 'sale' }).email === null)

// ── expiry ────────────────────────────────────────────────────────────────────
const grace = GRACE_DAYS * 86400e3
check('grace is 3 days', GRACE_DAYS === 3)
check('monthly: +1 month +3 days', gumroadExpiry({ recurrence: 'monthly', sale_timestamp: '2026-09-10T12:00:00Z' }).expiresAt === new Date(Date.parse('2026-10-10T12:00:00Z') + grace).toISOString())
check('yearly: +1 year +3 days', gumroadExpiry({ recurrence: 'yearly', sale_timestamp: '2026-09-10T12:00:00Z' }).expiresAt === new Date(Date.parse('2027-09-10T12:00:00Z') + grace).toISOString())
check('Jan 31 monthly clamps to Feb 28, then grace', gumroadExpiry({ recurrence: 'monthly', sale_timestamp: '2027-01-31T08:00:00Z' }).expiresAt === new Date(Date.parse('2027-02-28T08:00:00Z') + grace).toISOString())
check('leap year: Feb 29 yearly → Feb 28', gumroadExpiry({ recurrence: 'yearly', sale_timestamp: '2028-02-29T00:00:00Z' }).expiresAt === new Date(Date.parse('2029-02-28T00:00:00Z') + grace).toISOString())
check('quarterly supported', gumroadExpiry({ recurrence: 'quarterly', sale_timestamp: '2026-01-15T00:00:00Z' }).months === 3)
check('recurrence case/space tolerant', gumroadExpiry({ recurrence: ' Monthly ', sale_timestamp: '2026-09-10T12:00:00Z' }).months === 1)
{
  const r = gumroadExpiry({ recurrence: '', sale_timestamp: '2026-09-10T12:00:00Z' })
  check('no recurrence → no expiry invented', r.expiresAt === null && r.months === null)
}
{
  const NOW = Date.parse('2026-09-27T00:00:00Z')
  const r = gumroadExpiry({ recurrence: 'monthly', sale_timestamp: 'not a date' }, NOW)
  check('bad sale_timestamp → timed from now, flagged', r.saleTimeFallback === true && r.expiresAt === new Date(Date.parse('2026-10-27T00:00:00Z') + grace).toISOString())
}

// ── nextExpiry: forward only, manual grants untouched ─────────────────────────
const A = '2026-10-13T12:00:00.000Z', B = '2026-11-13T12:00:00.000Z'
check('new row → computed', nextExpiry(null, A) === A)
check('free row with no expiry → computed', nextExpiry({ tier: 'free', expires_at: null }, A) === A)
check('recurring charge pushes forward', nextExpiry({ tier: 'pro', expires_at: A }, B) === B)
check('late / duplicate older ping never pulls back', nextExpiry({ tier: 'pro', expires_at: B }, A) === B)
check('same ping twice is idempotent', nextExpiry({ tier: 'pro', expires_at: A }, A) === A)
check('Pro with NULL expiry (manual grant) → left alone', nextExpiry({ tier: 'pro', expires_at: null }, A) === undefined)
check('unknown recurrence → left alone', nextExpiry({ tier: 'pro', expires_at: A }, null) === undefined)
check('lapsed row gets a fresh period', nextExpiry({ tier: 'free', expires_at: '2026-01-01T00:00:00Z' }, A) === A)

// ── cancelExpiry: Pro to the paid-through date ────────────────────────────────
const PAID = '2026-10-10T12:00:00Z'
check('cancel: expires at cancelled_at exactly (no grace)', cancelExpiry({ tier: 'pro', expires_at: '2026-10-13T12:00:00.000Z' }, PAID) === '2026-10-10T12:00:00.000Z')
check('cancel: tier is not touched here (stays pro until then)', cancelExpiry({ tier: 'pro', expires_at: A }, PAID) !== undefined)
check('cancel: manual grant (Pro, NULL expiry) left alone', cancelExpiry({ tier: 'pro', expires_at: null }, PAID) === undefined)
check('cancel: no row → nothing to change', cancelExpiry(null, PAID) === undefined)
check('cancel: unparseable cancelled_at → left alone', cancelExpiry({ tier: 'pro', expires_at: A }, 'soon') === undefined)
check('cancel: payment-failure cancel in the past → lapses now', Date.parse(cancelExpiry({ tier: 'pro', expires_at: A }, '2026-09-01T00:00:00Z')) < Date.parse('2026-09-27T00:00:00Z'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
