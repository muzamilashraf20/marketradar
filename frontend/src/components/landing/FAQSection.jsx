import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import RevealSection from './RevealSection'

const faqs = [
  {
    q: 'What exactly is BiasForge?',
    a: 'BiasForge is an AI-powered macro and fundamentals dashboard. It ingests news, economic calendar data, central bank speeches, positioning data and more, then generates a clear bullish/bearish bias with confidence, scenarios, and invalidation levels — built specifically for active traders.',
  },
  {
    q: 'What data does BiasForge use to generate a bias?',
    a: 'Every bias is forged from five live data sources: (1) Live price action — real-time structure and momentum; (2) Currency strength — cross-pair relative strength to confirm or contradict directional bias; (3) Economic calendar — high-impact event pre-analysis and historical price reactions; (4) Breaking-news scoring — AI-scored market-moving headlines with asset-specific sentiment; and (5) CFTC/COT institutional positioning — net-long/short data showing where large speculators are positioned. All five are weighted and fused into a single directional bias with a confidence score.',
  },
  {
    q: 'How is this different from trading signals or copy trading?',
    a: "BiasForge never tells you 'Buy here, Sell there'. Instead, it explains the macro context, likely direction, and risk parameters so you can execute your own trades with understanding. You stay in control, with the AI as your macro assistant.",
  },
  {
    q: 'Do I need an economics degree to use this?',
    a: 'No. BiasForge is built for traders, not economists. Everything is explained in simple language with clear bias labels, levels, and risk notes — so you can trade the news without memorising textbooks.',
  },
  {
    q: 'Which prop firms does this work with?',
    a: 'BiasForge is prop-firm agnostic. It works with FTMO, MyFundedFX, The Funded Trader, The 5%ers, Topstep, and any other firm that has drawdown rules. You just plug in your account size and limits — Prop Firm Mode does the rest.',
  },
  {
    q: 'Can I cancel anytime?',
    a: "Yes. You can cancel your subscription at any time from your account dashboard. Your plan will remain active until the end of the current billing period and you won't be charged again.",
  },
  {
    q: 'What markets do you cover?',
    a: 'We cover major FX pairs, indices, gold, oil, and top crypto majors. Coverage will keep expanding over time, and Pro/Elite users get early access to new markets.',
  },
]

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(0)

  const toggle = (index) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section id="faq" className="bg-[#020617] py-24 px-6">
      <RevealSection>
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-widest text-cyan-400 font-bold mb-3">
            FAQ
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-4 leading-tight">
            Questions? We've Got Answers.
          </h2>
          <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto">
            If you still can't find what you're looking for, you can always reach us on Discord or email.
          </p>
        </div>

        {/* Accordion */}
        <div className="flex flex-col gap-3">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index
            return (
              <div
                key={index}
                className="bg-slate-900/50 border border-white/10 rounded-2xl overflow-hidden"
              >
                <button
                  onClick={() => toggle(index)}
                  className="w-full flex items-center justify-between p-5 text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-inset rounded-2xl"
                >
                  <span className={`text-sm sm:text-base font-semibold transition-colors duration-200 ${isOpen ? 'text-cyan-400' : 'text-white group-hover:text-cyan-400'}`}>
                    {faq.q}
                  </span>
                  <ChevronDown
                    size={18}
                    className={`text-slate-400 flex-shrink-0 ml-4 transition-transform duration-300 ${isOpen ? 'rotate-180 text-cyan-400' : ''}`}
                  />
                </button>

                {/* Smooth max-height transition */}
                <div
                  className="overflow-hidden transition-all duration-300 ease-in-out"
                  style={{
                    maxHeight: isOpen ? '400px' : '0px',
                    opacity: isOpen ? 1 : 0,
                  }}
                >
                  <div className="px-5 pb-5">
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Bottom */}
        <div className="text-center mt-10 flex flex-col items-center gap-4">
          <p className="text-sm text-slate-500">
            Still unsure if BiasForge is right for you? Start free and decide from the inside.
          </p>
          <a
            href="#pricing"
            className="px-6 py-2.5 rounded-xl border border-white/15 text-slate-300 text-sm font-semibold hover:border-cyan-500/30 hover:text-cyan-400 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            Start Free
          </a>
        </div>

      </div>
      </RevealSection>
    </section>
  )
}
