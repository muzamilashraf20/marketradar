import { useEffect, useRef } from 'react'

/* Scroll-triggered motion for the landing page.

   Attach the returned ref to an element. The hook drives one attribute on it,
   data-motion, and landing.css keys every animation off that attribute:

     (none)    — the element's final, static state. This is what the
                 prerendered HTML ships, what a visitor without JavaScript
                 sees, and what reduced motion keeps.
     'armed'   — the animation's start state (a bar at the bottom of its
                 scale, evidence rows not yet read).
     'play'    — animate to the final state, or run the loop.
     'paused'  — loops only: scrolled out of view, animation frozen.

   RULES THIS FOLLOWS
   · Nothing is hidden before JavaScript runs. Content is only moved to its
     start state after mount, and only when it is not on screen — so nothing a
     visitor is already looking at blinks out.
   · The one exception is the first moment after load (ENTRANCE_MS): content
     above the fold may play its entrance if the app mounted quickly enough
     that the move reads as the page arriving, not as it resetting.
   · A hidden tab gets nothing armed: IntersectionObserver does not deliver
     there, so an armed element could never be brought back.
   · Reduced motion: the attribute is never set. landing.css also scopes every
     rule to prefers-reduced-motion: no-preference, as a second line.

   `loop` elements (the invalidation demo, the data-flow diagram) run while in
   view and pause when they leave it, so nothing burns frames off-screen. */
const ENTRANCE_MS = 1500

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function useMotion({ loop = false, threshold = 0.3 } = {}) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el || reducedMotion() || typeof IntersectionObserver === 'undefined') return

    let io = null
    let raf1 = 0
    let raf2 = 0
    const set = state => { el.dataset.motion = state }

    // Two frames between armed and play, so the start state is committed and
    // the transition has something to run from.
    const play = () => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => set('play'))
      })
    }

    const start = () => {
      const r = el.getBoundingClientRect()
      const onScreen = r.top < window.innerHeight && r.bottom > 0

      if (loop) {
        io = new IntersectionObserver(entries => {
          for (const e of entries) set(e.isIntersecting ? 'play' : 'paused')
        }, { threshold })
        io.observe(el)
        return
      }

      if (onScreen) {
        // Already painted. Only replay it if we are still inside the entrance
        // window; otherwise leave the painted state exactly as it is.
        if (performance.now() > ENTRANCE_MS) return
        set('armed')
        play()
        return
      }

      set('armed')
      io = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting)) {
          play()
          io.disconnect()
        }
      }, { threshold, rootMargin: '0px 0px -10% 0px' })
      io.observe(el)
    }

    if (document.hidden) {
      const onVisible = () => {
        if (document.hidden) return
        document.removeEventListener('visibilitychange', onVisible)
        start()
      }
      document.addEventListener('visibilitychange', onVisible)
      return () => {
        document.removeEventListener('visibilitychange', onVisible)
        io?.disconnect()
      }
    }

    start()
    return () => {
      io?.disconnect()
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [loop, threshold])

  return ref
}
