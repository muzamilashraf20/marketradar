import { useCallback, useEffect, useRef, useState } from 'react'
import { usePolling } from './usePolling'

/* One endpoint's data for one card: loading → ok | error, with a retry.

   Each card on Today owns one of these, so one failing endpoint costs one card
   its content and nothing else. A background refresh that fails keeps the last
   good data on screen rather than replacing it with an error; only a card that
   never loaded shows "Couldn't load". `load` resolves to the data or throws. */
export function useLiveData(load, pollMs) {
  const [state, setState] = useState({ status: 'loading', data: null })
  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load })

  const run = useCallback(() => {
    loadRef.current()
      .then(data => setState({ status: 'ok', data }))
      .catch(() => setState(s => (s.status === 'ok' ? s : { status: 'error', data: null })))
  }, [])

  usePolling(run, pollMs)

  const retry = useCallback(() => {
    setState({ status: 'loading', data: null })
    run()
  }, [run])

  return { ...state, retry }
}

/* A clock for countdowns and "x min ago" — ticks every `ms`. */
export function useNow(ms = 30 * 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
