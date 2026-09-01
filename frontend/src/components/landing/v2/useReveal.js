import { useEffect, useRef } from 'react'

const STAGGER_MS = 80

/* Scroll-triggered entrances.

   Attach the returned ref to a section; every descendant marked
   `data-reveal` rises and fades in when the section enters the viewport,
   staggered ~80ms in document order, once each.

   Three things this deliberately does NOT do:

   · It never arms an element that is already on screen at load. Arming
     everything would hide content the prerendered HTML has already painted,
     then fade it back in — a flash on exactly the content above the fold.
   · It never runs without the .bf-js class, which React adds on mount. With
     JavaScript disabled the hiding rule does not exist, so nothing can be
     left stuck invisible.
   · It animates transform and opacity only, and reserves no space of its
     own, so it cannot contribute layout shift. */
export function useReveal({ threshold = 0.15 } = {}) {
  const ref = useRef(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return

    const targets = [...root.querySelectorAll('[data-reveal]')]
    if (!targets.length) return

    let io = null

    const arm = () => {
      // Anything already in view stays exactly as the server rendered it.
      const belowFold = targets.filter(
        el => el.getBoundingClientRect().top > window.innerHeight
      )
      if (!belowFold.length) return

      belowFold.forEach((el, i) => {
        el.style.setProperty('--d', `${i * STAGGER_MS}ms`)
        el.classList.add('bf-armed')
      })

      io = new IntersectionObserver(
        entries => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue
            // Fire once, then stop watching — scrolling back up must not replay it.
            belowFold.forEach(el => el.classList.add('is-in'))
            io.disconnect()
          }
        },
        { threshold, rootMargin: '0px 0px -8% 0px' }
      )
      io.observe(root)
    }

    // A hidden document does not deliver IntersectionObserver callbacks, so
    // arming now would hide this content with nothing able to bring it back —
    // a page opened in a background tab would surface with blank sections.
    // Wait for the document to actually be visible before hiding anything.
    if (document.hidden) {
      const onVisible = () => {
        if (document.hidden) return
        document.removeEventListener('visibilitychange', onVisible)
        arm()
      }
      document.addEventListener('visibilitychange', onVisible)
      return () => {
        document.removeEventListener('visibilitychange', onVisible)
        io?.disconnect()
      }
    }

    arm()
    return () => io?.disconnect()
  }, [threshold])

  return ref
}
