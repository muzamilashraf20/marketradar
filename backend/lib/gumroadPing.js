// ---------------------------------------------------------------------------
// Gumroad pings: what event a POST is, and how long a charge buys.
//
// Two kinds of POST reach /api/gumroad/webhook, with different shapes:
//   Ping format (Settings → Advanced → Ping, and the sale/refund/dispute/dispute_won resource
//     subscriptions): buyer is `email`; resource_name is 'sale' | 'refund' | 'dispute' |
//     'dispute_won'; refunded / disputed flags; sale_timestamp; recurrence.
//   Subscription format (cancellation / subscription_ended / subscription_updated /
//     subscription_restarted resource subscriptions): buyer is `user_email`, there is no
//     `email`, and the event is told by its fields (cancelled, ended_at/ended_reason, …).
// Everything arrives x-www-form-urlencoded, so booleans are the strings 'true' / 'false'.
// ---------------------------------------------------------------------------

const truthy = v => v === true || v === 'true'

// Months bought by one charge, by Gumroad's recurrence names. Unknown → null (caller decides).
const RECURRENCE_MONTHS = { monthly: 1, quarterly: 3, biannually: 6, yearly: 12, every_two_years: 24 }
export const GRACE_DAYS = 3

// { kind, event, email } — kind is one of:
//   'sale'          a charge (first or recurring): extend
//   'cancel'        cancellation: Pro runs to the paid-through date (cancelled_at), then lapses
//   'revoke'        refund, dispute or subscription end: drop to free now
//   'ignore'        test pings, dispute_won, subscription_updated, subscription_restarted: log only
export function classifyGumroadPing(body = {}) {
  const email = String(body.email || body.user_email || '').toLowerCase().trim() || null
  const rn = String(body.resource_name || '').toLowerCase()

  // test=true is a seller buying their own product to try the flow. It must never change a plan —
  // not upgrade, not extend, not revoke — whatever else the payload says. Checked first for that.
  if (truthy(body.test)) return { kind: 'ignore', event: 'test', email }

  if (rn === 'refund' || truthy(body.refunded)) return { kind: 'revoke', event: 'refund', email }
  if (rn === 'dispute' || truthy(body.disputed)) return { kind: 'revoke', event: 'dispute', email }
  if (rn === 'dispute_won' || truthy(body.dispute_won)) return { kind: 'ignore', event: 'dispute_won', email }
  if (rn === 'cancellation' || truthy(body.cancelled)) return { kind: 'cancel', event: 'cancellation', email }
  if (rn === 'subscription_ended' || body.ended_at || body.ended_reason) return { kind: 'revoke', event: 'subscription_ended', email }
  if (rn === 'subscription_updated' || body.effective_as_of) return { kind: 'ignore', event: 'subscription_updated', email }
  if (rn === 'subscription_restarted' || body.restarted_at) return { kind: 'ignore', event: 'subscription_restarted', email }
  return { kind: 'sale', event: 'sale', email }
}

// Add calendar months in UTC, clamping to the month's last day (Jan 31 + 1 month = Feb 28/29,
// not Mar 3).
function addMonthsUTC(ms, months) {
  const d = new Date(ms)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d.getTime()
}

// When a charge's access runs out: sale time + one billing period + GRACE_DAYS. Returns
// { expiresAt (ISO) | null, months, saleMs, saleTimeFallback }. null expiresAt = unknown
// recurrence; the caller must not invent a period. An unparseable sale_timestamp falls back to now.
export function gumroadExpiry(body = {}, now = Date.now()) {
  const months = RECURRENCE_MONTHS[String(body.recurrence || '').toLowerCase().trim()] ?? null
  const parsed = Date.parse(body.sale_timestamp)
  const saleMs = Number.isFinite(parsed) ? parsed : now
  if (!months) return { expiresAt: null, months: null, saleMs, saleTimeFallback: !Number.isFinite(parsed) }
  const end = addMonthsUTC(saleMs, months) + GRACE_DAYS * 86400e3
  return { expiresAt: new Date(end).toISOString(), months, saleMs, saleTimeFallback: !Number.isFinite(parsed) }
}

// The expires_at to write for a cancellation. Gumroad sends it when the buyer cancels, with
// cancelled_at = when the cancellation takes effect, i.e. the end of what they paid for. Access
// runs to exactly then (no grace: no renewal is coming). Returns undefined = leave the row alone:
// no row, a manual grant (Pro with NULL expiry), or an unparseable cancelled_at — in that last case
// the expiry the last charge set still ends access.
export function cancelExpiry(existing, cancelledAt) {
  if (!existing) return undefined
  if (existing.tier === 'pro' && !existing.expires_at) return undefined
  const t = Date.parse(cancelledAt)
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined
}

// The expires_at to write for a sale on an existing row. A charge only ever pushes expiry forward
// (pings can arrive late, out of order, or twice). A row that is Pro with NO expiry is a manual
// grant and keeps no expiry — returns undefined, meaning "leave the column alone".
export function nextExpiry(existing, computedIso) {
  if (!computedIso) return undefined
  if (existing?.tier === 'pro' && !existing.expires_at) return undefined
  const prev = Date.parse(existing?.expires_at)
  const next = Date.parse(computedIso)
  return Number.isFinite(prev) && prev > next ? existing.expires_at : computedIso
}
