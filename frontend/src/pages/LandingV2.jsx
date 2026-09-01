import { useEffect } from 'react'
import '../styles/landing.css'
import Nav from '../components/landing/v2/Nav'
import Hero from '../components/landing/v2/Hero'
import Direction from '../components/landing/v2/Direction'
import Noise from '../components/landing/v2/Noise'
import PropFirmMode from '../components/landing/v2/PropFirmMode'
import Inside from '../components/landing/v2/Inside'
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
        <Direction />
        <Noise />
        <PropFirmMode />
        <Inside />
        {/* Shell only — flag defaults to off until there is enough recorded data. */}
        <TrackRecord />
        <Plan />
        <About />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
