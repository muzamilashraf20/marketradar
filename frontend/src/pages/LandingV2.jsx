import { useEffect } from 'react'
import '../styles/landing.css'
import Nav from '../components/landing/v2/Nav'
import Hero from '../components/landing/v2/Hero'
import Problem from '../components/landing/v2/Problem'
import CompassVsSignal from '../components/landing/v2/CompassVsSignal'
import Features from '../components/landing/v2/Features'
import Direction from '../components/landing/v2/Direction'
import Noise from '../components/landing/v2/Noise'
import PropFirmMode from '../components/landing/v2/PropFirmMode'
import Inside from '../components/landing/v2/Inside'
import NoCall from '../components/landing/v2/NoCall'
import TrackRecord from '../components/landing/v2/TrackRecord'
import Plan from '../components/landing/v2/Plan'
import About from '../components/landing/v2/About'
import Faq from '../components/landing/v2/Faq'
import FinalCta from '../components/landing/v2/FinalCta'
import Footer from '../components/landing/v2/Footer'

export default function LandingV2() {
  // The scroll-entrance rules only hide things under .bf-js, which exists only
  // once React has mounted. A prerendered document read without JavaScript
  // therefore renders every element in its final, visible state.
  useEffect(() => {
    document.documentElement.classList.add('bf-js')
    return () => document.documentElement.classList.remove('bf-js')
  }, [])

  return (
    <div className="bf-landing min-h-screen overflow-x-hidden">
      <Nav />
      <main>
        <Hero />
        {/* The map of what the engine reads sits directly under the two live
            bias cards, so "trading without a map" lands against one. */}
        <Inside />
        <Problem />
        <Direction />
        {/* Where the Features nav link lands. It used to point at Direction,
            which showed one feature and left the rest to scrolling. */}
        <Features />
        <Noise />
        <PropFirmMode />
        <NoCall />
        {/* Individual past calls, pulled live. No aggregate anywhere in it. */}
        <TrackRecord />
        <Plan />
        <About />
        <Faq />
        {/* The closing argument, immediately before the closing ask. It reads
            better here than it did in the middle of the page: by this point the
            visitor has seen the bias card, the twelve panels and every closed
            call, so "signals make you dependent, a compass makes you sharp" is
            summing up what they have just been shown rather than asking them to
            accept the distinction before seeing any of it. */}
        <CompassVsSignal />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
