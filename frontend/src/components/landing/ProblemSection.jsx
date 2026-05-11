import { BookX, Clock, Users } from 'lucide-react'

const problems = [
  {
    icon: <BookX size={28} className="text-red-400" />,
    title: 'Information Overload',
    text: 'Hundreds of headlines, mixed central bank signals, and contradicting tweets. You have the data, but zero clarity on direction.',
  },
  {
    icon: <Clock size={28} className="text-red-400" />,
    title: 'The Late Entry Trap',
    text: 'By the time you figure out the bias, the move has already happened. You enter at the top, and get chopped out in the pullback.',
  },
  {
    icon: <Users size={28} className="text-red-400" />,
    title: 'Blind Signal Dependency',
    text: "Copying Telegram signals without knowing the 'WHY'. When the trade goes wrong, you don't know whether to hold, hedge, or cut.",
  },
]

export default function ProblemSection() {
  return (
    <section className="bg-[#020617] py-24 px-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center">
          <p className="text-xs tracking-widest text-red-400 font-semibold mb-3 uppercase">
            The Funded Trader's Trap
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-6 leading-tight">
            Why 87% of traders fail on news days
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Trading fundamentals without an AI edge usually leads to one thing: a blown funded account.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
          {problems.map((problem) => (
            <div
              key={problem.title}
              className="bg-slate-900/40 border border-red-500/10 hover:border-red-500/30 transition-colors duration-300 p-8 rounded-2xl"
            >
              <div className="mb-4">{problem.icon}</div>
              <h3 className="text-white font-bold text-lg mb-3">
                {problem.title}
              </h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                {problem.text}
              </p>
            </div>
          ))}
        </div>

        {/* Bottom transition text */}
        <p className="text-center text-sm text-slate-500 font-medium mt-16">
          There is a better way to trade the news.
        </p>

      </div>
    </section>
  )
}