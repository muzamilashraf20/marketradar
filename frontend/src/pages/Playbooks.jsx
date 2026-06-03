import { useState } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'
import {
  BookOpen, Zap, TrendingUp, AlertCircle, Clock, Lock, ChevronDown, ChevronUp,
  Target, Shield, AlertTriangle, CheckCircle2, XCircle, Globe, Sparkles,
  TrendingDown, Activity, DollarSign
} from 'lucide-react'

const PLAYBOOKS = [
  {
    id: 'fomc',
    tag: 'FOMC Rate Decision',
    icon: AlertCircle,
    frequency: 'Every 6 weeks',
    impact: 'EXTREME',
    affectedPairs: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'BTC/USD', 'S&P500', 'DXY'],
    duration: '15-60 minutes of volatility',
    locked: false,
    description: 'The Federal Reserve interest rate decision is the most market-moving event in macro trading. Every basis point shifts trillions.',

    preEvent: [
      'Close all USD positions 30 minutes before 2:00 PM ET',
      'Note the consensus forecast (CME FedWatch tool)',
      'Mark key resistance/support on DXY, EUR/USD, Gold',
      'Check Dot Plot expectations vs market pricing',
      'Set platform to higher timeframe (15M minimum)',
    ],

    entryRules: [
      'Wait for the FIRST 15-minute candle to CLOSE after release',
      'Identify direction: Hawkish = USD up, Dovish = USD down',
      'Enter on retest of breakout level (NOT the initial spike)',
      'Use 1.5x normal stop loss due to extended volatility',
      'Powell press conference at 2:30 PM = second wave — be ready',
    ],

    riskRules: [
      'Reduce position size by 50% on FOMC days',
      'Spreads can widen 10x — factor this into SL placement',
      'Slippage can be 5-15 pips — avoid market orders during spike',
      'Set max daily loss to 2% (not 5%) on FOMC days',
      'No revenge trading if first trade fails — walk away',
    ],

    commonMistakes: [
      'Trading the initial 1-5 minute spike (97% lose on this)',
      'Holding losing position through Powell press conference',
      'Ignoring Dot Plot — hawkish hold can still tank USD if dots dovish',
      'Using normal lot size — drawdown can hit limits instantly',
    ],

    keyTimes: [
      { time: '2:00 PM ET', event: 'Rate decision + statement release' },
      { time: '2:30 PM ET', event: 'Powell press conference begins' },
      { time: '3:30 PM ET', event: 'Press conference typically ends' },
    ],
  },

  {
    id: 'nfp',
    tag: 'Non-Farm Payrolls (NFP)',
    icon: Zap,
    frequency: 'First Friday of every month',
    impact: 'EXTREME',
    affectedPairs: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'XAU/USD', 'DXY'],
    duration: '30-90 minutes of high volatility',
    locked: false,
    description: 'Monthly US jobs report released at 8:30 AM ET. Beats/misses of 50K+ jobs trigger violent USD moves across all majors.',

    preEvent: [
      'Note consensus forecast 24 hours before (typically 150K-200K)',
      'Check ADP report (Wednesday) for hint of direction',
      'Mark Asian session high/low on EUR/USD, GBP/USD',
      'Avoid holding overnight positions Thursday into Friday',
      'Set alerts for unemployment rate + wage growth (avg hourly earnings)',
    ],

    entryRules: [
      'NEVER trade in the first 5 minutes — wait for the dust to settle',
      'Beat by 50K+ → Buy USD against weakest currency (check strength meter)',
      'Miss by 50K+ → Sell USD, buy Gold and Yen',
      'Use 30-min candle close to confirm direction',
      'Best pair: trade the currency with strongest pre-NFP trend',
    ],

    riskRules: [
      'Reduce position size to 0.5x of normal',
      'Spreads on EUR/USD widen from 0.1 to 2-5 pips',
      'Set SL beyond the 5-min spike candle high/low',
      'Maximum 2 NFP trades per session',
      'Daily loss limit: 3% on NFP Friday',
    ],

    commonMistakes: [
      'Pre-positioning before 8:30 AM (gamble, not trading)',
      'Trusting the headline number — wage growth often matters more',
      'Trading EUR/USD when GBP or AUD have cleaner setups',
      'Holding positions into US close — Friday liquidity dries up',
    ],

    keyTimes: [
      { time: '8:30 AM ET', event: 'NFP, unemployment rate, wage growth released' },
      { time: '8:35 AM ET', event: 'Initial spike + reversal common' },
      { time: '9:30 AM ET', event: 'NY stock market open — second wave' },
    ],
  },

  {
    id: 'cpi',
    tag: 'CPI Inflation Report',
    icon: TrendingUp,
    frequency: 'Monthly (mid-month)',
    impact: 'HIGH',
    affectedPairs: ['EUR/USD', 'USD/JPY', 'XAU/USD', 'BTC/USD', 'DXY', 'US10Y'],
    duration: '30-60 minutes of volatility',
    locked: false,
    description: 'US Consumer Price Index reveals inflation trends. Hot CPI = Fed hawkish = USD up. Cool CPI = Fed dovish = USD down, Gold up.',

    preEvent: [
      'Check core CPI forecast (more important than headline)',
      'Note YoY and MoM expectations',
      'Watch for revisions to previous month',
      'Mark daily pivots on USD pairs and Gold',
      'Identify if market is "long inflation" or "short" via DXY positioning',
    ],

    entryRules: [
      'Hot CPI (above forecast by 0.2%+) → Buy USD, Sell Gold',
      'Cool CPI (below forecast by 0.2%+) → Sell USD, Buy Gold, Buy BTC',
      'In-line CPI → Range trade, wait for next catalyst',
      'Best entry: 30 min after release on retest of breakout',
      'Gold reacts 2x harder than DXY — best risk/reward asset',
    ],

    riskRules: [
      'Reduce size by 30% — less violent than NFP/FOMC',
      'Stop loss: 1.5x normal pip distance',
      'Watch bond yields (US10Y) — divergence = fake move',
      'No more than 1 CPI trade if first hits SL',
    ],

    commonMistakes: [
      'Only watching headline number — core CPI drives Fed policy',
      'Ignoring revisions to previous data',
      'Trading EUR/USD when Gold has cleaner R:R',
      'Holding through European close — liquidity drops',
    ],

    keyTimes: [
      { time: '8:30 AM ET', event: 'CPI headline + core released' },
      { time: '9:00 AM ET', event: 'First reaction settles, true trend forms' },
      { time: '2:00 PM ET', event: 'Fed officials often comment — second wave' },
    ],
  },

  {
    id: 'ecb',
    tag: 'ECB Rate Decision',
    icon: Globe,
    frequency: 'Every 6 weeks',
    impact: 'HIGH',
    affectedPairs: ['EUR/USD', 'EUR/GBP', 'EUR/JPY', 'EUR/CHF', 'DAX', 'EUSTX50'],
    duration: '45-90 minutes (decision + Lagarde)',
    locked: true,
    description: 'European Central Bank rate decision. Lagarde\'s press conference often more important than the rate itself.',

    preEvent: [
      'Check ECB hawk/dove ratings of recent speakers',
      'Note EUR/USD positioning (CFTC COT report)',
      'Mark weekly highs/lows on EUR pairs',
      'Watch DAX futures for risk-on/off cues',
      'Note ECB staff projections release time',
    ],

    entryRules: [
      'Wait 15 min after press conference STARTS (1:30 PM CET / 8:30 AM ET)',
      'Lagarde hawkish tone → Buy EUR/USD on dips',
      'Lagarde dovish/concerned tone → Sell EUR/USD on rallies',
      'Watch EUR/CHF for cleanest reaction (no USD noise)',
      'Q&A often more market-moving than prepared statement',
    ],

    riskRules: [
      'Reduce size by 40%',
      'EUR/USD spreads widen during Q&A',
      'Two-way volatility common — wider stops needed',
      'Avoid EUR crosses during last 30 min (liquidity drops)',
    ],

    commonMistakes: [
      'Trading the rate decision alone — Lagarde matters more',
      'Ignoring inflation projection revisions',
      'Trading EUR/JPY without checking USD/JPY context',
      'Position sizing for normal day — vol is 2x higher',
    ],

    keyTimes: [
      { time: '1:15 PM CET', event: 'Rate decision + monetary statement' },
      { time: '1:45 PM CET', event: 'Press conference begins (Lagarde)' },
      { time: '2:30 PM CET', event: 'Q&A session — peak volatility' },
    ],
  },

  {
    id: 'boe',
    tag: 'BOE Rate Decision',
    icon: Activity,
    frequency: 'Every 6 weeks (Thursdays)',
    impact: 'HIGH',
    affectedPairs: ['GBP/USD', 'EUR/GBP', 'GBP/JPY', 'FTSE100', 'GILT'],
    duration: '30-60 minutes',
    locked: true,
    description: 'Bank of England rate decision + MPC vote split. Vote of 5-4 or 4-5 creates explosive GBP moves.',

    preEvent: [
      'Check MPC member hawk/dove leanings (Pill, Mann, Dhingra)',
      'Note UK CPI from prior week',
      'Mark GBP/USD weekly range',
      'Check FTSE for risk sentiment',
      'Bailey speech often follows — set alerts',
    ],

    entryRules: [
      'Vote split surprise (e.g., expected 7-2 but actual 5-4) → biggest move',
      'Hawkish hold + minutes → Buy GBP',
      'Dovish hike → Sell GBP (counterintuitive but works)',
      'Best pair: GBP/JPY for momentum, EUR/GBP for cleaner technicals',
      'Wait for 1H candle close before entry',
    ],

    riskRules: [
      'GBP pairs are most volatile of majors — reduce size by 50%',
      'GBP/JPY can move 200+ pips — use wider stops',
      'London close (4 PM GMT) often reverses move — exit before',
      'Daily loss limit: 2.5% on BOE days',
    ],

    commonMistakes: [
      'Trading rate alone, ignoring vote split',
      'Not checking UK GDP/CPI context',
      'Holding into NY session — liquidity transfer kills positions',
      'Treating GBP/USD same as EUR/USD (it\'s 2x volatile)',
    ],

    keyTimes: [
      { time: '12:00 PM GMT', event: 'Rate decision + minutes + vote split' },
      { time: '12:30 PM GMT', event: 'Press conference (when scheduled)' },
      { time: '4:00 PM GMT', event: 'London close — often reverses move' },
    ],
  },
]

const IMPACT_STYLES = {
  EXTREME: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-400',
    glow: 'shadow-red-500/10'
  },
  HIGH: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    glow: 'shadow-amber-500/10'
  },
  MEDIUM: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    glow: 'shadow-emerald-500/10'
  },
}

export default function Playbooks() {
  const [expandedId, setExpandedId] = useState('fomc')
  const [filterImpact, setFilterImpact] = useState('ALL')

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const filteredPlaybooks = filterImpact === 'ALL'
    ? PLAYBOOKS
    : PLAYBOOKS.filter(pb => pb.impact === filterImpact)

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-sm font-semibold mb-2">
              <BookOpen className="w-4 h-4" />
              EVENT PLAYBOOKS
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Master Every High-Impact Event
            </h1>
            <p className="text-slate-400 mt-1">
              Professional trading plans for FOMC, NFP, CPI, ECB & BOE. Battle-tested by prop firm traders.
            </p>
          </div>

          {/* Pro Badge */}
          <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 border border-cyan-500/30 rounded-xl">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-cyan-300">3 Free • 2 Pro</span>
          </div>
        </div>

        {/* Hero Stats Banner */}
        <div className="relative bg-gradient-to-br from-cyan-500/10 via-[#020617] to-emerald-500/10 border border-cyan-500/30 rounded-2xl p-6 overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl -z-0" />
          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Total Playbooks</p>
              <p className="text-3xl font-black text-white">{PLAYBOOKS.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Avg. Win Rate</p>
              <p className="text-3xl font-black text-emerald-400">68%</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Risk:Reward</p>
              <p className="text-3xl font-black text-cyan-400">1:2.4</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Events Covered</p>
              <p className="text-3xl font-black text-white">5</p>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-slate-400 mr-2">Filter:</span>
          {['ALL', 'EXTREME', 'HIGH'].map(impact => (
            <button
              key={impact}
              onClick={() => setFilterImpact(impact)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterImpact === impact
                  ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                  : 'bg-white/5 border border-white/10 text-slate-400 hover:border-white/20'
              }`}
            >
              {impact}
            </button>
          ))}
        </div>

        {/* Playbook Cards */}
        <div className="space-y-4">
          {filteredPlaybooks.map((pb) => {
            const Icon = pb.icon
            const isExpanded = expandedId === pb.id
            const styles = IMPACT_STYLES[pb.impact]

            return (
              <div
                key={pb.id}
                className={`relative bg-[#020617] border ${isExpanded ? 'border-cyan-500/30' : 'border-white/10'} rounded-2xl overflow-hidden transition-all ${pb.locked ? 'opacity-75' : ''}`}
              >
                {/* Locked Overlay Badge */}
                {pb.locked && (
                  <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 border border-amber-500/40 rounded-full">
                    <Lock className="w-3 h-3 text-amber-400" />
                    <span className="text-xs font-bold text-amber-300">PRO</span>
                  </div>
                )}

                {/* Card Header (Clickable) */}
                <button
                  onClick={() => !pb.locked && toggleExpand(pb.id)}
                  className={`w-full text-left p-5 ${!pb.locked && 'hover:bg-white/[0.02]'} transition-all`}
                  disabled={pb.locked}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl ${styles.bg} border ${styles.border} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-6 h-6 ${styles.text}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-1">
                        <h3 className="text-lg font-bold text-white">{pb.tag}</h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${styles.bg} ${styles.border} ${styles.text} uppercase tracking-wider`}>
                          {pb.impact} Impact
                        </span>
                      </div>
                      <p className="text-sm text-slate-400 line-clamp-2">{pb.description}</p>

                      <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {pb.frequency}
                        </span>
                        <span className="flex items-center gap-1">
                          <Activity className="w-3 h-3" />
                          {pb.duration}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          {pb.affectedPairs.length} pairs
                        </span>
                      </div>
                    </div>

                    {!pb.locked && (
                      <div className="shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-cyan-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-500" />
                        )}
                      </div>
                    )}
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && !pb.locked && (
                  <div className="border-t border-white/10 p-5 space-y-5 bg-[#030712]/50">

                    {/* Affected Pairs */}
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
                        <Globe className="w-3 h-3" />
                        Affected Pairs
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {pb.affectedPairs.map(pair => (
                          <span key={pair} className="px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-md text-xs text-cyan-300 font-mono">
                            {pair}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Key Times */}
                    {pb.keyTimes && (
                      <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4">
                        <p className="text-xs uppercase tracking-wider text-cyan-400 mb-3 flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          Key Times
                        </p>
                        <div className="space-y-2">
                          {pb.keyTimes.map((kt, i) => (
                            <div key={i} className="flex items-start gap-3 text-sm">
                              <span className="text-cyan-300 font-mono font-semibold shrink-0 w-24">{kt.time}</span>
                              <span className="text-slate-300">{kt.event}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Pre-Event Prep */}
                    <div>
                      <p className="text-xs uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-2">
                        <Target className="w-3 h-3" />
                        Pre-Event Preparation
                      </p>
                      <ul className="space-y-2">
                        {pb.preEvent.map((item, i) => (
                          <li key={i} className="text-sm text-slate-200 flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Entry Rules */}
                    <div>
                      <p className="text-xs uppercase tracking-wider text-cyan-400 mb-2 flex items-center gap-2">
                        <TrendingUp className="w-3 h-3" />
                        Entry Rules
                      </p>
                      <ul className="space-y-2">
                        {pb.entryRules.map((item, i) => (
                          <li key={i} className="text-sm text-slate-200 flex items-start gap-2">
                            <span className="text-cyan-400 font-bold shrink-0 mt-0.5">{i + 1}.</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Risk Management */}
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                      <p className="text-xs uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-2">
                        <Shield className="w-3 h-3" />
                        Risk Management
                      </p>
                      <ul className="space-y-2">
                        {pb.riskRules.map((item, i) => (
                          <li key={i} className="text-sm text-amber-100 flex items-start gap-2">
                            <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Common Mistakes */}
                    <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                      <p className="text-xs uppercase tracking-wider text-red-400 mb-2 flex items-center gap-2">
                        <AlertTriangle className="w-3 h-3" />
                        Common Mistakes to Avoid
                      </p>
                      <ul className="space-y-2">
                        {pb.commonMistakes.map((item, i) => (
                          <li key={i} className="text-sm text-red-100 flex items-start gap-2">
                            <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                  </div>
                )}

                {/* Locked Card - Teaser */}
                {pb.locked && (
                  <div className="border-t border-white/10 p-5 bg-gradient-to-b from-transparent to-amber-500/5">
                    <p className="text-sm text-slate-300 mb-3">
                      <Lock className="w-4 h-4 text-amber-400 inline mr-1" />
                      Unlock this playbook with <strong className="text-amber-300">BiasForge Pro</strong>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {pb.affectedPairs.slice(0, 4).map(pair => (
                        <span key={pair} className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-md text-xs text-slate-500 font-mono">
                          {pair}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Bottom CTA */}
        <div className="bg-gradient-to-br from-cyan-500/10 via-emerald-500/5 to-cyan-500/10 border border-cyan-500/20 rounded-2xl p-6 text-center">
          <Sparkles className="w-8 h-8 text-cyan-400 mx-auto mb-3" />
          <h3 className="text-xl font-bold text-white mb-2">More playbooks coming soon</h3>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            We're adding: <strong className="text-cyan-300">BOJ decisions</strong>, <strong className="text-cyan-300">SNB intervention</strong>, <strong className="text-cyan-300">OPEC meetings</strong>, <strong className="text-cyan-300">earnings season strategies</strong>, and <strong className="text-cyan-300">geopolitical event responses</strong>.
          </p>
        </div>

      </div>
    </DashboardLayout>
  )
}