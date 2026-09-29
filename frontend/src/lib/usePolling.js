import { useEffect, useRef } from 'react'

// Run `fn` now and every `ms` while the tab is visible. Hidden tabs don't poll at all; when the tab
// comes back, `fn` runs straight away if the last run is older than `ms`. `deps` restart the cycle
// (e.g. a session token that resolves after first paint).
export function usePolling(fn, ms, deps = []) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let timer = null
    let last = 0
    const run = () => { last = Date.now(); fnRef.current() }
    const start = () => { if (!timer) timer = setInterval(run, ms) }
    const stop = () => { if (timer) { clearInterval(timer); timer = null } }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - last >= ms) run()
        start()
      } else stop()
    }

    run()
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps])
}
