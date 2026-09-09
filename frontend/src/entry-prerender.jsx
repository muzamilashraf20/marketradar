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
import TermsPage from './pages/Terms'
import PrivacyPage from './pages/Privacy'
import RefundPage from './pages/Refund'
import ChangelogPage from './pages/Changelog'
import ContactPage from './pages/Contact'

/* Re-exported so the build script generates the FAQPage and SoftwareApplication
   schemas from the very same values the page renders. Google penalises FAQ
   markup that does not match the visible answers, and two hand-kept copies
   would drift on the first edit. */
export { FAQ } from './components/landing/v2/faqData'
export { PRICE_MONTHLY, PRICE_ANNUAL, GUMROAD_URL } from './components/landing/v2/Plan'

export function render({ events, calls }) {
  // The components read these off globalThis during their first render. The
  // compass and the news wire render a sample now and take no data at all —
  // see components/landing/v2/demoData.js.
  globalThis.__BF_EVENTS__ = events || null
  globalThis.__BF_CALLS__ = calls || null

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

/* The rest of the static routes, through the same pipeline. Left client-rendered,
   each of these was served app.html — a 2 kB shell carrying the LANDING page's
   title, description and canonical. Every one of them told Google it was a
   duplicate of /, and Google believed it: /terms, /contact and /changelog sat in
   "Discovered - currently not indexed", never crawled once.

   All five are presentational. Contact holds form state, but useState renders
   fine to a string and its fetch only runs on submit. Pricing is deliberately
   absent — it reads AuthContext, which has no provider here. */
const STATIC_PAGES = {
  terms: TermsPage,
  privacy: PrivacyPage,
  refund: RefundPage,
  changelog: ChangelogPage,
  contact: ContactPage,
}

export function renderStatic(name) {
  const Page = STATIC_PAGES[name]
  if (!Page) throw new Error(`entry-prerender: no component registered for "${name}"`)
  return renderToStaticMarkup(
    <MemoryRouter>
      <Page />
    </MemoryRouter>
  )
}
