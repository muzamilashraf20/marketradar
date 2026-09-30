import { useEffect } from 'react'
import '../styles/landing.css'
import Nav from '../components/landing/v2/Nav'
import Hero from '../components/landing/v2/Hero'
import Direction from '../components/landing/v2/Direction'
import Invalidation from '../components/landing/v2/Invalidation'
import Inside from '../components/landing/v2/Inside'
import NoCall from '../components/landing/v2/NoCall'
import Problem from '../components/landing/v2/Problem'
import PropFirmMode from '../components/landing/v2/PropFirmMode'
import TrackRecord from '../components/landing/v2/TrackRecord'
import Features from '../components/landing/v2/Features'
import Plan from '../components/landing/v2/Plan'
import About from '../components/landing/v2/About'
import Faq from '../components/landing/v2/Faq'
import CompassVsSignal from '../components/landing/v2/CompassVsSignal'
import Footer from '../components/landing/v2/Footer'

/* The landing page, built around the framework: Direction, Evidence,
   Invalidation.

   Order is the argument: what it is (hero) → the three questions (framework) →
   the one that makes it different (invalidation) → what it reads (how it works)
   → what it does when it has nothing to say (no call) → why that saves work
   (workflow) → the account it has to protect (prop firm) → the evidence it has
   been honest (record) → what else is inside → price → who → questions → ask.

   Several files kept their old names when their section changed job:
   Direction.jsx is the framework, Problem.jsx the workflow comparison,
   CompassVsSignal.jsx the closing CTA. Noise.jsx (the news wire) is no longer
   rendered; the file is kept for the cleanup review. */
export default function LandingV2() {
  // The scroll-entrance rules only hide things under .bf-js, which exists only
  // once React has mounted. A prerendered document read without JavaScript
  // therefore renders every element in its final, visible state.
  useEffect(() => {
    document.documentElement.classList.add('bf-js')
    return () => document.documentElement.classList.remove('bf-js')
  }, [])

  // Arriving from another page on a section link (/#pricing from the nav on
  // /about, say). The browser's own jump to the hash can run before the
  // section exists — it always does when the page is rendered client-side —
  // so once the page has mounted, go to the section. One instant jump, no
  // smooth scroll: this is a page load, not an in-page move.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (!id) return
    const raf = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' })
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="bf-landing min-h-screen overflow-x-hidden">
      <Nav />
      <main>
        <Hero />
        <Direction />
        <Invalidation />
        <Inside />
        <NoCall />
        <Problem />
        <PropFirmMode />
        <TrackRecord />
        <Features />
        <Plan />
        <About />
        <Faq />
        <CompassVsSignal />
      </main>
      <Footer />
    </div>
  )
}
