/* "Waiting for your payment…" survives a reload.

   Card checkout opens Gumroad in another tab and crypto leaves the site, so the
   subscribe screen marks when the wait began. Kept per tab (sessionStorage):
   it is this tab's checkout, and it ends with the tab. */
const KEY = 'bf_pay_wait'
export const PAY_WAIT_MS = 15 * 60 * 1000
export const PAY_POLL_MS = 10 * 1000

export function readPayWait() {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || 'null')
    return Number.isFinite(v?.at) ? v.at : null
  } catch {
    return null
  }
}

export function savePayWait(at) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ at })) } catch { /* storage blocked */ }
}

export function clearPayWait() {
  try { sessionStorage.removeItem(KEY) } catch { /* storage blocked */ }
}
