import { useEffect, useRef } from 'react'

/* A number that counts up with its panel's motion.

   The element renders its FINAL formatted value — that is what the prerendered
   HTML carries and what a visitor without JavaScript, or with reduced motion,
   sees. The hook never changes React state; it writes the element's text
   directly, and only while its host panel is animating:

     host data-motion='armed' → shows format(0)
     host data-motion='play'  → counts from 0 to the value (ease-out), then the
                                exact final text

   The host is the nearest ancestor with class `bf-motion-host` (the element
   useMotion drives). It is found by class, not by attribute, because the
   attribute is set by the host's own effect, which runs after this one. */
export function useCountUp(value, format, { duration = 1100, delay = 150 } = {}) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    const host = el?.closest('.bf-motion-host')
    if (!el || !host || typeof MutationObserver === 'undefined') return

    const final = format(value)
    let raf = 0
    let timer = 0

    const run = () => {
      const start = performance.now() + delay
      const tick = now => {
        const t = Math.min(1, Math.max(0, (now - start) / duration))
        const eased = 1 - Math.pow(1 - t, 3)
        el.textContent = t >= 1 ? final : format(value * eased)
        if (t < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }

    const sync = () => {
      const state = host.dataset.motion
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      if (state === 'armed') el.textContent = format(0)
      else if (state === 'play') run()
      else el.textContent = final
    }

    const mo = new MutationObserver(sync)
    mo.observe(host, { attributes: true, attributeFilter: ['data-motion'] })
    sync()
    return () => {
      mo.disconnect()
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      el.textContent = final
    }
  }, [value, format, duration, delay])

  return ref
}
