import { Scan, Cpu, Target, ArrowRight } from 'lucide-react'

const steps = [
  {
    number: '1',
    title: 'We Scan The Market',
    description: 'Real-time news, economic calendar, central bank speeches, COT data, and intermarket relationships are ingested every minute.',
  },
  {
    number: '2',
    title: 'AI Forges Your Bias',
    description: 'Our AI analyzes everything and generates a clear Bullish/Bearish bias with confidence score, scenarios, invalidation levels, and prop-firm risk suggestions.',
  },
  {
    number: '3',
    title: 'You Trade With Clarity',
    description: 'No more guessing. You get a complete playbook — when to enter, where to take profit, how much risk according to your funded account rules.',
  },
]

const icons = [
  <Scan size={24} className="text-cyan-400" />,
  <Cpu size={24} className="text-cyan-400" />,
  <Target size={24} className="text-cyan-400" />,
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-[#030712] py-24 px-6">
      <div className="max-w-6xl mx-auto">

        <div className="text-center mb-16">
          <p className="text-sm uppercase tracking-widest text-emerald-400 font-semibold mb-3">
            3 Simple Steps
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4">
            How BiasForge Works
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            From raw market chaos to clear, actionable trading bias in minutes.
          </p>
        </div>

        <div className="flex flex-col md:flex-row items-stretch gap-6">
          {steps.map((step, index) => (
            <div key={step.number} className="relative flex flex-col md:flex-1">
              <div className="group bg-slate-900/50 border border-white/10 hover:border-cyan-400/30 hover:-translate-y-1 transition-all duration-300 rounded-3xl p-8 h-full">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full border-2 border-cyan-400/50 flex items-center justify-center text-cyan-400 font-black text-lg">
                    {step.number}
                  </div>
                  <div className="p-2 rounded-lg bg-cyan-500/10">
                    {icons[index]}
                  </div>
                </div>
                <h3 className="text-white font-bold text-xl mb-3">
                  {step.title}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
              {index < steps.length - 1 && (
                <div className="hidden md:flex absolute -right-4 top-10 z-10 text-cyan-500/50">
                  <ArrowRight size={20} />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="text-center mt-16 flex flex-col items-center gap-4">
          <p className="text-slate-400 text-sm">
            Takes less than 60 seconds to get your daily edge.
          </p>
          
            
          <a href="#features" className="px-6 py-3 rounded-xl border border-cyan-500/30 text-cyan-400 text-sm font-semibold hover:bg-cyan-500/10 transition-all duration-200">
            See BiasForge In Action
          </a>
        </div>

      </div>
    </section>
  )
}