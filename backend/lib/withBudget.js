// Per-input time budget for the calendar brief's data-fetch phase.
//
// The brief is user-facing — a modal spins while it runs — and several inputs can block far longer
// than a person will wait: tdAcquire() holds a caller until the TwelveData credit budget frees up
// (minutes on a busy minute), and the FF/CFTC fetches carry 12s timeouts with retries. So every
// input gets a hard budget, and a timed-out input is simply "not available" — the same contract the
// prompt already has for a failed fetch.
//
// The losing promise is deliberately NOT cancelled: it keeps running and warms the shared cache for
// the next request. Only the TIMER is cancelled, which is a different thing and the point of this
// module — an earlier version left the timer armed, so on every healthy run all seven timers fired
// during the (~75s) model call and logged "exceeded 20s budget" for data that had arrived in 1.8s.
// The payload was never affected, but the warning became indistinguishable from a real timeout,
// which is exactly when you need to trust it.

export function withBudget(promise, ms, label, timings) {
  const t = Date.now()
  const stamp = (v) => { if (timings) timings[label] = Date.now() - t; return v }

  let settled = false
  let timer = null

  // Marking `settled` on the fetch itself, not after the race, closes the window where a timer
  // scheduled for this same tick could still log. Promise callbacks are microtasks and setTimeout
  // is a macrotask, so this always wins — clearTimeout below is the belt, this is the braces.
  const guarded = promise.then(
    (v) => { settled = true; return v },
    (e) => { settled = true; throw e },
  )

  const budget = new Promise((resolve) => {
    timer = setTimeout(() => {
      if (settled) return          // lost the race: say nothing, touch nothing
      settled = true
      console.warn(`⏱️ [brief] ${label} exceeded ${ms / 1000}s budget — treating as not available`)
      resolve(null)
    }, ms)
  })

  return Promise.race([guarded, budget])
    .then(stamp)
    .catch((e) => { console.warn(`⚠️ [brief] ${label} failed: ${e?.message}`); return stamp(null) })
    // finally, so a rejected fetch disarms the timer too — otherwise a failed input would still
    // emit a phantom timeout warning 20s later.
    .finally(() => { if (timer) clearTimeout(timer) })
}
