import { Check, X, AlertTriangle, Crown } from 'lucide-react'

const rows = [
  {
    feature: 'Monthly Price',
    biasforge: { text: '$40/month', type: 'good' },
    others: { text: '$49–99/month', type: 'neutral' },
  },
  {
    feature: '7-Day Free Trial',
    biasforge: { text: 'Yes, Forever', type: 'good', icon: 'check' },
    others: { text: 'No', type: 'bad', icon: 'x' },
  },
  {
    feature: 'Prop Firm Risk Management',
    biasforge: { text: 'Built-in', type: 'good', icon: 'check', badge: 'EXCLUSIVE' },
    others: { text: 'Not Available', type: 'bad', icon: 'x' },
  },
  {
    feature: 'FOMC/NFP/CPI Playbooks',
    biasforge: { text: 'Pre-built', type: 'good', icon: 'check', badge: 'EXCLUSIVE' },
    others: { text: 'Not Included', type: 'bad', icon: 'x' },
  },
  {
    feature: 'AI Reasoning Visible',
    biasforge: { text: 'Full Transparency', type: 'good', icon: 'check' },
    others: { text: 'Limited', type: 'warn', icon: 'warn' },
  },
  {
    feature: 'Fundamental + Technical',
    biasforge: { text: 'AI Confluence Score', type: 'good', icon: 'check' },
    others: { text: 'Fundamental Only', type: 'bad', icon: 'x' },
  },
  {
    feature: 'Real-time Updates',
    biasforge: { text: 'Every 60 seconds', type: 'good', icon: 'check' },
    others: { text: 'Variable', type: 'warn', icon: 'warn' },
  },
  {
    feature: 'Asset Coverage',
    biasforge: { text: 'Forex, Indices, Crypto, Commodities', type: 'good', icon: 'check' },
    others: { text: 'Similar', type: 'neutral', icon: 'check' },
  },
  {
    feature: 'Customer Support',
    biasforge: { text: 'Discord + Email', type: 'good', icon: 'check' },
    others: { text: 'Email Only', type: 'neutral' },
  },
]

function Icon({ type }) {
  if (type === 'check') return <Check size={14} className="text-emerald-400 flex-shrink-0" />
  if (type === 'x') return <X size={14} className="text-red-400 flex-shrink-0" />
  if (type === 'warn') return <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
  return null
}

function CellText({ cell }) {
  const colorMap = {
    good: 'text-emerald-400',
    bad: 'text-red-400',
    warn: 'text-amber-400',
    neutral: 'text-slate-400',
  }
  return (
    <div className="flex items-center gap-2 justify-center flex-wrap">
      {cell.icon && <Icon type={cell.icon} />}
      <span className={`text-xs font-semibold ${colorMap[cell.type]}`}>{cell.text}</span>
      {cell.badge && (
        <span className="text-[9px] uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-bold">
          {cell.badge}
        </span>
      )}
    </div>
  )
}

export default function ComparisonTable() {
  return (
    <section className="bg-[#030712] py-24 px-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-widest text-cyan-400 font-bold mb-3">
            See The Difference
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4 leading-tight">
            BiasForge vs Other Platforms
          </h2>
          <p className="text-lg text-slate-400">
            Why serious traders are switching to BiasForge.
          </p>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl border border-white/5">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr>
                <th className="bg-slate-900/60 text-left px-6 py-4 text-sm font-semibold text-slate-400 w-[40%]">
                  Feature
                </th>
                <th className="bg-gradient-to-b from-cyan-500/10 to-emerald-500/5 border-x-2 border-cyan-500/30 px-6 py-4 text-center w-[30%]">
                  <div className="flex items-center justify-center gap-2">
                    <Crown size={14} className="text-cyan-400" />
                    <span className="text-cyan-400 font-black text-sm">BiasForge</span>
                  </div>
                  <div className="text-[10px] text-cyan-500/60 font-medium mt-0.5">RECOMMENDED</div>
                </th>
                <th className="bg-slate-900/30 px-6 py-4 text-center w-[30%]">
                  <span className="text-slate-500 font-semibold text-sm">Other Platforms</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.feature}
                  className={`border-t border-white/5 hover:bg-white/[0.02] transition-colors ${
                    index % 2 === 0 ? 'bg-slate-900/20' : 'bg-transparent'
                  }`}
                >
                  <td className="px-6 py-4 text-sm text-slate-300 font-medium">
                    {row.feature}
                  </td>
                  <td className="bg-gradient-to-b from-cyan-500/5 to-emerald-500/5 border-x-2 border-cyan-500/20 px-6 py-4 text-center">
                    <CellText cell={row.biasforge} />
                  </td>
                  <td className="bg-slate-900/20 px-6 py-4 text-center">
                    <CellText cell={row.others} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-12 flex flex-col items-center gap-4">
          <p className="text-slate-300 font-semibold text-base">
            Try BiasForge free for 7 days
          </p>
          
          <a href="#pricing" className="px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 text-black font-bold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-cyan-500/20">
            Start 7-Day Free Trial
          </a>
          <p className="text-xs text-slate-500">
            No credit card required • Cancel anytime
          </p>
        </div>

      </div>
    </section>
  )
}