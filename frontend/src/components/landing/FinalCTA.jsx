import { ArrowRight, Sparkles } from 'lucide-react'
import RevealSection from './RevealSection'

export default function FinalCTA() {
  return (
    <section className="relative bg-[#030712] py-24 px-6 overflow-hidden">

      {/* Glow blobs */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-96 h-96 bg-cyan-500/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-80 h-80 bg-emerald-500/8 rounded-full blur-3xl pointer-events-none" />

      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      <div className="relative max-w-4xl mx-auto">

        {/* Vision / Mission block */}
        <RevealSection delay={0}>
        <div className="text-center mb-16 px-4">
          <p className="text-xs uppercase tracking-widest text-cyan-400 font-bold mb-5">
            Our Mission
          </p>
          <p className="text-2xl sm:text-3xl lg:text-4xl font-black text-white leading-tight mb-6">
            Make macro clarity accessible to every serious trader —{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
              not just the funds.
            </span>
          </p>
          <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            We believe most traders don't lose from a lack of discipline.
            They lose from a lack of direction. BiasForge exists to fix that.
          </p>
        </div>

        </RevealSection>

        {/* Divider */}
        <div className="w-24 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent mx-auto mb-16" />

        {/* CTA inner card */}
        <RevealSection delay={150}>
        <div className="bg-white/5 border border-white/10 backdrop-blur-sm rounded-3xl px-6 sm:px-8 py-16 flex flex-col items-center text-center gap-6">

          {/* Label — Sparkles are decorative */}
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-cyan-400" aria-hidden="true" />
            <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold">
              Ready to trade with clarity?
            </p>
            <Sparkles size={14} className="text-cyan-400" aria-hidden="true" />
          </div>

          {/* Heading */}
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight max-w-3xl">
            Stop guessing.{' '}
            <span className="bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              Start forging your edge.
            </span>
          </h2>

          {/* Subheading */}
          <p className="text-base sm:text-lg text-slate-300 max-w-2xl leading-relaxed">
            Join traders who use macro context, clear scenarios, and risk discipline to stay consistent on news days.
          </p>

          {/* Buttons */}
          <div className="flex flex-wrap gap-4 justify-center mt-2">
            <a
              href="#pricing"
              className="flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-black font-bold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            >
              Get Started <ArrowRight size={16} />
            </a>
            <a
              href="#features"
              className="px-8 py-4 rounded-xl border border-white/20 text-white font-semibold text-sm hover:bg-white/5 hover:border-white/30 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            >
              See Features
            </a>
          </div>

          {/* Trust line */}
          <p className="text-sm text-slate-400">
            Card or crypto · Cancel anytime · Built for serious traders
          </p>

        </div>
        </RevealSection>
      </div>
    </section>
  )
}
