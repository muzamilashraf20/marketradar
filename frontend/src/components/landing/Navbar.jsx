import { useState, useEffect } from 'react';
import { Activity, Menu, X } from 'lucide-react';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      window.scrollTo({
        top: element.offsetTop - 80,
        behavior: 'smooth'
      });
    }
    setMenuOpen(false);
  };

  const links = [
    { name: 'Features', id: 'features' },
    { name: 'Pricing', id: 'pricing' },
    { name: 'FAQ', id: 'faq' },
  ];

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 px-6 h-16 flex items-center justify-between transition-all duration-300 ${
      scrolled 
        ? 'bg-[#030712]/95 backdrop-blur-lg border-b border-cyan-500/10' 
        : 'bg-transparent'
    }`}>
      
      {/* Logo */}
      <a href="/" className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center">
          <Activity size={20} className="text-black" strokeWidth={3} />
        </div>
        <span className="text-2xl font-black tracking-tighter">
          Bias<span className="text-cyan-400">Forge</span>
        </span>
      </a>

      {/* Desktop Menu */}
      <div className="hidden md:flex items-center gap-10">
        {links.map((link) => (
          <button
            key={link.id}
            onClick={() => scrollToSection(link.id)}
            className="text-slate-400 hover:text-white transition-colors"
          >
            {link.name}
          </button>
        ))}
        <button className="px-6 py-2.5 bg-white text-black font-bold rounded-xl hover:bg-cyan-400 transition-all">
          Start Free
        </button>
      </div>

      {/* Mobile Menu Button */}
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="md:hidden text-white"
      >
        {menuOpen ? <X size={28} /> : <Menu size={28} />}
      </button>
    </nav>
  );
}