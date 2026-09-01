/* eslint-disable react-refresh/only-export-components --
   This module is never loaded by the browser app, so it is not part of the fast
   refresh graph. It is compiled by a separate `vite build --ssr` pass and
   imported by the Node build script, and it deliberately exports functions and
   constants rather than components. */

/* SSR entry — built separately by `vite build --ssr` and imported by
   scripts/generate-blog.mjs at build time.

   Its only job is to turn the landing page into a string of static HTML so the
   copy, the FAQ answers and the current bias values are all present in the
   initial HTTP response. No hydration: the browser re-renders the same tree on
   mount and takes it from there. */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import LandingV2 from './pages/LandingV2'
import AboutPage from './pages/About'

/* Re-exported so the build script generates the FAQPage and SoftwareApplication
   schemas from the very same values the page renders. Google penalises FAQ
   markup that does not match the visible answers, and two hand-kept copies
   would drift on the first edit. */
export { FAQ } from './components/landing/v2/faqData'
export { PRICE_MONTHLY, PRICE_ANNUAL, GUMROAD_URL } from './components/landing/v2/Plan'

export function render({ compass, events }) {
  // The components read these off globalThis during their first render.
  globalThis.__BF_COMPASS__ = compass || null
  globalThis.__BF_EVENTS__ = events || null

  // The pricing section calls useNavigate for the crypto checkout's sign-in
  // redirect, and that throws outside a Router. MemoryRouter gives the static
  // render a router with no history and no URL bar to touch.
  return renderToStaticMarkup(
    <MemoryRouter>
      <LandingV2 />
    </MemoryRouter>
  )
}

/* /about, through the same pipeline. It carries no live data, so it takes no
   arguments — but it is the page that states what the company is and will not
   do, and leaving it client-rendered kept every word of that invisible to
   anything that does not run JavaScript. */
export function renderAbout() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AboutPage />
    </MemoryRouter>
  )
}
