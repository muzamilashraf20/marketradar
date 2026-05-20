import { ArrowRight, Play, Activity, TrendingUp, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function HeroSection() {
  const navigate = useNavigate();

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
        {/* LEFT SIDE - Text */}
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-cyan-400 text-xs font-medium mb-5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            Built for funded & prop firm traders
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-4 text-white leading-[1.1]">
            Forge your edge.<br />
            Trade with <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">clarity.</span>
          </h1>

          <p className="text-slate-400 text-sm sm:text-base lg:text-lg mb-6 max-w-xl leading-relaxed">
            BiasForge turns macro data, news, and central bank signals into clear trading bias, 
            risk levels, and scenarios — so you stop guessing and start trading with confidence.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-black font-bold text-base hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 hover:scale-[1.02]"
            >
              Start Free Today
              <ArrowRight size={18} strokeWidth={2.5} />
            </button>

            <button
              onClick={() => scrollToSection('how-it-works')}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-medium hover:bg-white/10 transition-all flex items-center justify-center gap-2"
            >
              <Play size={18} className="text-cyan-400" />
              See How It Works
            </button>
          </div>

          <p className="mt-4 text-xs sm:text-sm text-slate-500">
            No credit card required · Compatible with all major prop firms
          </p>
        </div>

        {/* RIGHT SIDE - Fake Dashboard Card */}
        <div className="relative w-full max-w-md mx-auto">
          <div className="rounded-2xl bg-gradient-to-b from-slate-800 to-[#020617] border border-slate-700/60 p-1 shadow-2xl shadow-cyan-900/40">
            <div className="bg-[#020617] rounded-xl p-5 border border-white/5">
              {/* Header */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Daily AI Bias</p>
                  <p className="text-base font-semibold text-white flex items-center gap-2">
                    EUR/USD
                    <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-slate-800 text-slate-300">
                      Live
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1 text-emerald-400 font-semibold text-sm">
                    <TrendingUp size={16} /> Bullish
                  </div>
                  <p className="text-[11px] text-slate-400">Confidence: 78%</p>
                </div>
              </div>

              {/* Reasoning */}
              <div className="mb-4">
                <p className="text-[11px] text-slate-500 font-mono mb-1">AI REASONING</p>
                <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/60 text-[11px] text-slate-200 leading-relaxed">
                  ECB remains hawkish while US CPI misses forecast. 
                  Rate differentials and risk-on flows support upside 
                  continuation toward 1.0950 as long as 1.0820 holds.
                </div>
              </div>

              {/* Two small cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity size={14} className="text-emerald-400" />
                    <p className="text-[11px] text-slate-300">Prop Firm Risk</p>
                  </div>
                  <p className="text-xs text-slate-400 mb-1">Recommended risk</p>
                  <p className="text-sm font-semibold text-white">0.5% per trade</p>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={14} className="text-amber-300" />
                    <p className="text-[11px] text-slate-300">Invalidation</p>
                  </div>
                  <p className="text-xs text-slate-400 mb-1">Bias breaks if</p>
                  <p className="text-sm font-semibold text-white">Price below 1.0820</p>
                </div>
              </div>
            </div>
          </div>

          {/* Small floating stat card */}
          <div className="absolute -bottom-6 -right-4 bg-[#020617] border border-cyan-500/40 rounded-xl px-3 py-2 shadow-xl shadow-cyan-500/30 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
              <Activity size={16} className="text-cyan-400" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Signals processed</p>
              <p className="text-xs font-semibold text-white">12,450 / min</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}