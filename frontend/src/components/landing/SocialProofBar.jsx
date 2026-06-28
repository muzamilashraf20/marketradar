import RevealSection from './RevealSection'

const badges = [
  'FTMO-ready',
  'MyFundedFX-ready',
  'TFT-ready',
  '5ers-ready',
  'Risk-aware',
  'Macro-first',
]

export default function SocialProofBar() {
  return (
    <section className="bg-[#030712] border-y border-cyan-500/10 py-8 px-6">
      <RevealSection>
      <div className="max-w-5xl mx-auto flex flex-col items-center gap-6">

        <p className="text-slate-400 text-sm font-medium tracking-widest uppercase text-center">
          Built by a trader, for traders
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          {badges.map(badge => (
            <span
              key={badge}
              className="px-4 py-2 rounded-full text-xs font-semibold text-cyan-400 border border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-400/40 transition-all duration-300 cursor-default tracking-wide"
            >
              {badge}
            </span>
          ))}
        </div>

        <div className="w-24 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

      </div>
      </RevealSection>
    </section>
  )
}