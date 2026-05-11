import { Quote, Star } from 'lucide-react'

const testimonials = [
  {
    quote: "On CPI days I used to overtrade and blow my daily limit. Now BiasForge gives me the bias, invalidation level, and a clear scenario — I stop forcing entries and actually protect my drawdown.",
    name: "Adeel K.",
    label: "FTMO Funded Trader",
    stars: 5,
  },
  {
    quote: "The Prop Firm Mode is genuinely different. It tells me exactly how much I can risk based on my current drawdown. No other platform does this. It saved my $100K account on NFP week.",
    name: "Sarah M.",
    label: "Prop Firm Trader",
    stars: 5,
  },
  {
    quote: "I was copying Telegram signals blindly. BiasForge showed me the full AI reasoning behind every call — now I understand WHY I'm taking a trade, not just what direction. Game changer.",
    name: "Hassan R.",
    label: "FX Swing Trader",
    stars: 5,
  },
]

function Stars({ count }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={12}
          className={i < count ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}
        />
      ))}
    </div>
  )
}

export default function Testimonials() {
  return (
    <section className="bg-[#020617] py-24 px-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-14">
          <p className="text-xs uppercase tracking-widest text-emerald-400 font-bold mb-3">
            Real Trader Results
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4 leading-tight">
            Loved by Funded Traders
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Clarity beats guesswork. Here's what early users are saying.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="group bg-slate-900/40 border border-white/10 hover:border-cyan-500/30 hover:-translate-y-1 transition-all duration-300 rounded-2xl p-6 flex flex-col gap-4"
            >
              {/* Quote icon */}
              <Quote size={20} className="text-cyan-500/30" />

              {/* Stars */}
              <Stars count={t.stars} />

              {/* Quote text */}
              <p className="text-slate-300 text-sm leading-relaxed flex-1">
                "{t.quote}"
              </p>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <div>
                  <p className="text-white font-bold text-sm">{t.name}</p>
                  <p className="text-slate-500 text-xs">{t.label}</p>
                </div>
                <span className="bg-white/5 border border-white/10 text-slate-300 text-[10px] uppercase tracking-wider rounded-full px-2 py-1">
                  Verified Beta
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom trust line */}
        <p className="text-center text-sm text-slate-500 mt-12">
          No hype. No signals. Just macro clarity + risk discipline.
        </p>

        {/* CTA */}
        <div className="text-center mt-6">
          <a href="#pricing" className="inline-block px-8 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 text-black font-bold text-sm hover:opacity-90 transition-opacity">
            Start Free
          </a>
        </div>

      </div>
    </section>
  )
}