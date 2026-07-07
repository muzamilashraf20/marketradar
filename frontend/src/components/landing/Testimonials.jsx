import { Quote, ShieldCheck, Brain, Eye, ArrowRight } from 'lucide-react'
import RevealSection from './RevealSection'

const principles = [
  {
    icon: <Brain size={18} className="text-cyan-400" />,
    title: 'Reasoning, not signals',
    text: 'Every bias comes with the full AI reasoning, invalidation level, and a clear scenario — so you understand WHY, not just a direction to copy.',
  },
  {
    icon: <ShieldCheck size={18} className="text-emerald-400" />,
    title: 'Built for drawdown rules',
    text: 'Prop Firm Mode tracks your daily and total drawdown and tells you exactly how much you can risk right now. Most platforms ignore funded-account rules entirely.',
  },
  {
    icon: <Eye size={18} className="text-cyan-400" />,
    title: 'Macro clarity in one place',
    text: 'Live price, currency strength, calendar events, news scoring, and COT positioning — pulled together so you walk into the session with context instead of guesswork.',
  },
]

export default function Testimonials() {
  return (
    <section className="bg-[#020617] py-24 px-6">
      <RevealSection>
      <div className="max-w-6xl mx-auto">

        <div className="text-center mb-14">
          <p className="text-xs uppercase tracking-widest text-emerald-400 font-bold mb-3">
            Built in Public
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4 leading-tight">
            No Fake Reviews. Just the Tool.
          </h2>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto">
            BiasForge is early. We'd rather show you exactly how it thinks than fill this page with made-up testimonials.
          </p>
        </div>

        <div className="max-w-3xl mx-auto mb-14">
          <div className="relative bg-slate-900/40 border border-white/10 rounded-2xl p-8 md:p-10">
            <Quote size={28} className="text-cyan-500/30 mb-4" aria-hidden="true" />
            <p className="text-slate-200 text-lg leading-relaxed">
              I built BiasForge because I was tired of blowing daily limits on CPI and NFP days — forcing
              entries with no plan and no idea where I was wrong. I wanted one place that gives me the macro
              bias, the invalidation level, and how much I am actually allowed to risk under my prop firm
              rules. That is the whole tool. No gurus, no signals, no hype.
            </p>
            <div className="flex items-center gap-3 mt-6 pt-6 border-t border-white/5">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center text-black font-black text-sm shrink-0">
                BF
              </div>
              <div>
                <p className="text-white font-bold text-sm">The BiasForge Team</p>
                <p className="text-slate-500 text-xs">Founder · funded trader</p>
              </div>
            </div>
          </div>
        </div>

        {/* Principle cards — hover:shadow replaces hover:-translate-y-1 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {principles.map((p) => (
            <div
              key={p.title}
              className="group bg-slate-900/40 border border-white/10 hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-300 rounded-2xl p-6 flex flex-col gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                {p.icon}
              </div>
              <h3 className="text-white font-bold text-base">{p.title}</h3>
              <p className="text-slate-300 text-sm leading-relaxed">{p.text}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-slate-500 mt-12">
          No hype. No signals. Just macro clarity + risk discipline.
        </p>

        <div className="text-center mt-6">
          <a
            href="#pricing"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 text-black font-bold text-sm hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            Get Started <ArrowRight size={16} />
          </a>
        </div>

      </div>
      </RevealSection>
    </section>
  )
}
