import Navbar from '../components/landing/Navbar';
import HeroSection from '../components/landing/HeroSection';

export default function LandingPage() {
  return (
    <div className="bg-[#030712] text-white min-h-screen overflow-x-hidden pt-16">
      <Navbar />
      <HeroSection />
    </div>
  );
}