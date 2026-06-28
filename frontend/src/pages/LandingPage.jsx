import Navbar from '../components/landing/Navbar'
import HeroSection from '../components/landing/HeroSection'
import SocialProofBar from '../components/landing/SocialProofBar'
import ProblemSection from '../components/landing/ProblemSection'
import SolutionSection from '../components/landing/SolutionSection'
import HowItWorks from '../components/landing/HowItWorks'
import AIEngineSection from '../components/landing/AIEngineSection'
import FeaturesGrid from '../components/landing/FeaturesGrid'
import PropFirmSection from '../components/landing/PropFirmSection'
import ComparisonTable from '../components/landing/ComparisonTable'
import Testimonials from '../components/landing/Testimonials'
import PricingSection from '../components/landing/PricingSection'
import FAQSection from '../components/landing/FAQSection'
import FinalCTA from '../components/landing/FinalCTA'
import Footer from '../components/landing/Footer'

export default function LandingPage() {
  return (
    <div className="bg-[#030712] text-white min-h-screen overflow-x-hidden pt-16">
      <Navbar />
      <HeroSection />
      <SocialProofBar />
      <ProblemSection />
      <SolutionSection />
      <HowItWorks />
      <AIEngineSection />
      <FeaturesGrid />
      <PropFirmSection />
      <ComparisonTable />
      <Testimonials />
      <PricingSection />
      <FAQSection />
      <FinalCTA />
      <Footer />
    </div>
  )
}