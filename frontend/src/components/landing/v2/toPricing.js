/* Where the Pro CTA goes: the pricing section. There is no free plan, so the
   first step for a new visitor is choosing a billing period, not signing in.

   The href is root-relative ("/#pricing"), so from any page that is not the
   landing (/about reuses the nav) it is an ordinary link: the landing loads and
   the browser lands on the section. On the landing itself the click is taken
   over and the page scrolls there — smoothly, or in one jump when the visitor
   asks for reduced motion — and the hash is recorded so Back returns to where
   they were. A modified click (new tab, new window) is left to the browser. */
export const PRICING_HREF = '/#pricing'

export function toPricing(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  if (window.location.pathname !== '/') return
  const el = document.getElementById('pricing')
  if (!el) return
  e.preventDefault()
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  if (window.location.hash !== '#pricing') window.history.pushState(null, '', '#pricing')
}
