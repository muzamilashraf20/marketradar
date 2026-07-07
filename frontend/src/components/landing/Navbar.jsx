import { useState, useEffect } from "react";
import { Activity, Menu, X } from "lucide-react";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setMenuOpen(false);
  };

  const links = [
    { name: "Features", id: "features" },
    { name: "Pricing", id: "pricing" },
    { name: "FAQ", id: "faq" },
  ];

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-50 px-6 h-16 flex items-center justify-between transition-all duration-300 ${scrolled ? "bg-[#030712]/95 backdrop-blur-lg border-b border-cyan-500/10" : "bg-transparent"}`}>
        <a href="/landing" className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded-lg">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center">
            <Activity size={20} className="text-black" strokeWidth={3} />
          </div>
          <span className="text-2xl font-black tracking-tighter">
            Bias<span className="text-cyan-400">Forge</span>
          </span>
        </a>
        <div className="hidden md:flex items-center gap-10">
          {links.map((link) => (
            <button
              key={link.id}
              onClick={() => scrollToSection(link.id)}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded"
            >
              {link.name}
            </button>
          ))}
          <button
            onClick={() => window.location.href = '/login'}
            className="px-6 py-2.5 bg-white text-black font-bold rounded-xl hover:bg-cyan-400 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            Get Started
          </button>
        </div>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className="md:hidden text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded"
        >
          {menuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </nav>
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-[#030712] flex flex-col items-center justify-center md:hidden">
          <button
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="absolute top-5 right-6 text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded"
          >
            <X size={28} />
          </button>
          <a href="/landing" onClick={() => setMenuOpen(false)} className="absolute top-4 left-6 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded-lg">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center">
              <Activity size={18} className="text-black" strokeWidth={3} />
            </div>
            <span className="text-xl font-black tracking-tighter">
              Bias<span className="text-cyan-400">Forge</span>
            </span>
          </a>
          <div className="flex flex-col items-center gap-8">
            {links.map((link) => (
              <button
                key={link.id}
                onClick={() => scrollToSection(link.id)}
                className="text-3xl font-bold text-slate-300 hover:text-cyan-400 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded"
              >
                {link.name}
              </button>
            ))}
            <button
              onClick={() => window.location.href = '/login'}
              className="mt-4 px-10 py-4 bg-cyan-400 text-black font-black text-lg rounded-2xl hover:bg-white transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            >
              Get Started
            </button>
          </div>
        </div>
      )}
    </>
  );
}
