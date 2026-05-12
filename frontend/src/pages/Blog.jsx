import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import SimplePageLayout from '../components/common/SimplePageLayout'

export default function Blog() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  const handleSubscribe = () => {
    if (!email) return
    setSubscribed(true)
  }

  return (
    <SimplePageLayout
      title="Blog"
      subtitle="Insights on forex, bias detection, prop firms, and trading psychology."
    >
      <div className="space-y-12">

        {/* Coming Soon Hero */}
        <div className="text-center py-12 px-6 rounded-2xl border border-white/10 bg-white/5">
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-8 h-8 text-cyan-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Coming Soon</h2>
          <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
            We are working on in-depth articles about market bias, funded trader strategies,
            and how to use BiasForge.ai to its fullest potential.
          </p>
        </div>

        {/* Topics Preview */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Topics We Will Cover</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              '📊 How to Read Market Bias Like a Pro',
              '🏦 Top 5 Prop Firms in 2026 Compared',
              '🧠 Trading Psychology: Controlling Emotions',
              '📰 How News Events Move Forex Markets',
              '📅 Using the Economic Calendar Effectively',
              '🔄 COT Report — What Smart Money Is Doing',
            ].map((topic) => (
              <div
                key={topic}
                className="p-4 rounded-xl border border-white/10 bg-white/5 text-slate-400 text-sm"
              >
                {topic}
              </div>
            ))}
          </div>
        </div>

        {/* Email Signup */}
        <div className="p-6 rounded-2xl border border-cyan-500/20 bg-cyan-500/5">
          <h2 className="text-lg font-semibold text-white mb-2">Get Notified When We Launch</h2>
          <p className="text-slate-400 text-sm mb-5">
            Be the first to read our articles. No spam — only quality content.
          </p>

          {subscribed ? (
            <div className="text-center py-4">
              <p className="text-cyan-400 font-semibold">✅ You are on the list!</p>
              <p className="text-slate-400 text-sm mt-1">We will notify you when the blog launches.</p>
            </div>
          ) : (
            <div className="flex gap-3 flex-col sm:flex-row">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 bg-[#030712] border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
              <button
                onClick={handleSubscribe}
                className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold px-6 py-3 rounded-lg text-sm transition-colors whitespace-nowrap"
              >
                Notify Me
              </button>
            </div>
          )}
        </div>

      </div>
    </SimplePageLayout>
  )
}