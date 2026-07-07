import { useState, useEffect } from 'react';
import { ArrowRight, Play, TrendingUp, LineChart, Globe, Calendar, Newspaper, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import RevealSection from './RevealSection';

const biasSources = [
  { icon: <LineChart size={13} className="text-cyan-400 shrink-0" />, label: 'Live Price' },
  { icon: <Globe size={13} className="text-cyan-400 shrink-0" />, label: 'Currency Strength' },
  { icon: <Calendar size={13} className="text-cyan-400 shrink-0" />, label: 'Economic Calendar' },
  { icon: <Newspaper size={13} className="text-cyan-400 shrink-0" />, label: 'News Scoring' },
  { icon: <BarChart3 size={13} className="text-cyan-400 shrink-0" />, label: 'COT Positioning' },
]

export default function HeroSection() {
  const navigate = useNavigate();
  // Confidence bar fills from 0 → 72% on mount
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setBarWidth(62), 150);
    return () => clearTimeout(t);
  }, []);

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative w-full min-h-[90vh] flex flex-col items-center justify-center pt-24 pb-16 px-6 overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-cyan-500/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/2 right-1/4 w-[300px] h-[250px] bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-6xl mx-auto w-full grid lg:grid-cols-2 gap-12 items-center relative z-10">

        {/* LEFT SIDE — Text */}
        <RevealSection delay={0}>
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-cyan-400 text-xs font-medium mb-5">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            Built for every serious trader
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-4 text-white leading-[1.1]">
            Forge your edge.<br />
            Trade with <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">clarity.</span>
          </h1>

          <p className="text-slate-300 text-sm sm:text-base lg:text-lg mb-5 max-w-xl leading-relaxed">
            BiasForge turns macro data, news, and central bank signals into a clear daily trading bias
            with reasoning, scenarios, and risk levels — so you stop guessing and trade with direction.
          </p>

          {/* 5-source pill strip */}
          <div className="flex flex-wrap items-center gap-2 mb-6 w-full justify-center lg:justify-start">
            <span className="text-xs font-semibold text-slate-500 shrink-0">Bias built from →</span>
            {biasSources.map((s) => (
              <span
                key={s.label}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs font-medium text-slate-300"
              >
                {s.icon}
                {s.label}
              </span>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-black font-bold text-base transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 hover:shadow-xl hover:shadow-cyan-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            >
              Get Started Free
              <ArrowRight size={18} strokeWidth={2.5} />
            </button>

            <button
              onClick={() => scrollToSection('how-it-works')}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-medium hover:bg-white/10 transition-all flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            >
              <Play size={18} className="text-cyan-400" />
              See How It Works
            </button>
          </div>

          <p className="mt-4 text-xs sm:text-sm text-slate-500">
            Free plan available · Card or crypto to upgrade · Cancel anytime
          </p>
        </div>
        </RevealSection>

        {/* RIGHT SIDE — Static bias demo card */}
        <RevealSection delay={150}>
        <div className="w-full max-w-md mx-auto">
          <div className="rounded-2xl bg-gradient-to-b from-slate-800 to-[#020617] border border-slate-700/60 p-1 shadow-2xl shadow-cyan-900/40">
            <div className="bg-[#020617] rounded-xl p-5 border border-white/5">

              {/* Card header */}
              <div className="flex items-start justify-between mb-4 pb-3 border-b border-white/10">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Daily AI Bias</p>
                  <p className="text-[11px] font-black text-emerald-400 tracking-widest uppercase">BUY</p>
                  <p className="text-xl font-black text-white tracking-tight">XAUUSD</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-black tracking-wide">
                    <TrendingUp size={12} strokeWidth={2.5} />
                    BULLISH
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Updated 2h ago
                  </span>
                </div>
              </div>

              {/* Confidence + Grade */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-400">Confidence</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">62%</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 font-bold">
                      Grade C
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>

              {/* AI Reasoning */}
              <div className="mb-3">
                <p className="text-[10px] text-slate-500 font-mono mb-1.5 uppercase tracking-widest">AI Reasoning</p>
                <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/60 text-[11px] text-slate-200 leading-relaxed">
                  Macro favors USD strength; gold pressured by firm yields.
                </div>
              </div>

              {/* Entry quality */}
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                FRESH entry
              </div>

            </div>
          </div>
        </div>
        </RevealSection>

      </div>
    </section>
  );
}
