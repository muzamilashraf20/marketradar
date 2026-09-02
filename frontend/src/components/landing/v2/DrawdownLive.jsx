const money = n =>
  '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/* A worked example, and labelled as one.

   Drawdown is per-account: there is no live figure to show a visitor who has not
   connected an account, and inventing one would be a number with no source
   behind it. So this is stated as an example on a named rule set — $50,000, 5%
   daily, 10% total — which are the limits the preset actually encodes. Every
   figure below is arithmetic on those three numbers, nothing else.

   No profit appears anywhere in it. The bars measure loss used against the
   limit, which is the thing that ends a funded account. */
const ACCOUNT = 50000
const RULES = { dailyPct: 5, totalPct: 10 }
const MAX_DAILY = (ACCOUNT * RULES.dailyPct) / 100
const MAX_TOTAL = (ACCOUNT * RULES.totalPct) / 100

const BARS = [
  {
    key: 'daily',
    label: 'Daily drawdown',
    used: 890,
    max: MAX_DAILY,
    maxLabel: 'Max daily loss',
    note: 'Resets at the daily cut-off',
  },
  {
    key: 'total',
    label: 'Total drawdown',
    used: 1640,
    max: MAX_TOTAL,
    maxLabel: 'Max total loss',
    note: 'Runs for the life of the account',
  },
]

/* Under half the limit reads as room, past three quarters reads as a warning.
   The colour does the work a trader actually needs at a glance. */
const toneFor = pct =>
  pct >= 75
    ? { fill: 'bg-rose-400', text: 'text-rose-300' }
    : pct >= 50
      ? { fill: 'bg-yellow-400', text: 'text-yellow-300' }
      : { fill: 'bg-emerald-400', text: 'text-emerald-300' }

function Bar({ bar, index }) {
  const pct = Math.max(0, Math.min(100, (bar.used / bar.max) * 100))
  const tone = toneFor(pct)
  const remaining = bar.max - bar.used

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider bf-t3">{bar.label}</p>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="text-[12px] bf-t3">Loss used</span>
        <span className={`bf-mono text-[15px] font-bold tabular-nums ${tone.text}`}>
          {money(bar.used)}
        </span>
      </div>

      {/* The bar's resting width is its value; the class sweeps it out from zero
          on arrival. Transform only, so it costs no layout and the figures
          beside it cannot move. */}
      <div className="mt-2.5 h-2 rounded-full bg-slate-700/60 overflow-hidden" aria-hidden="true">
        <div
          className={`bf-bar h-full rounded-full ${tone.fill}`}
          style={{ '--w': `${pct}%`, '--d': `${index * 140}ms` }}
        />
      </div>

      <p className="mt-2.5 text-[10.5px] bf-t3 tabular-nums">
        {pct.toFixed(1)}% of {bar.maxLabel.toLowerCase()} · {bar.note}
      </p>

      <div className="mt-4 pt-3 bf-hairline-t grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10.5px] bf-t3">{bar.maxLabel}</p>
          <p className="bf-mono text-[13.5px] text-slate-200 mt-0.5 tabular-nums">{money(bar.max)}</p>
        </div>
        <div>
          <p className="text-[10.5px] bf-t3">Remaining</p>
          <p className="bf-mono text-[13.5px] text-emerald-300 mt-0.5 tabular-nums">{money(remaining)}</p>
        </div>
      </div>
    </div>
  )
}

/* Prop Firm Mode's drawdown panel, rendered rather than photographed.

   The crop this replaces was 92px tall on a 640px frame: two bars and six money
   figures at about a tenth of native size, which is why it read as a grey smear.
   Rendered, the same panel is legible at any width and the bars sweep out on
   arrival — the one thing a still could never show, the room closing. */
export default function DrawdownLive() {
  return (
    <div className="bf-card overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 flex-wrap px-4 pt-4 pb-3.5 bf-hairline-b">
        <div>
          <h3 className="text-[13.5px] font-medium text-slate-100 tracking-tight">Prop Firm Mode</h3>
          <p className="text-[11px] bf-t3 mt-0.5">Your funded account's limits, tracked against every trade</p>
        </div>
        <span className="bf-pill bf-hairline text-[9.5px] font-bold uppercase tracking-wider px-2 py-[3px] bf-t3">
          Example
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-2.5 p-3">
        {BARS.map((b, i) => <Bar key={b.key} bar={b} index={i} />)}
      </div>

      <p className="bf-hairline-t px-4 py-3 text-[10.5px] leading-relaxed bf-t3">
        Worked on a {money(ACCOUNT).replace('.00', '')} funded account with a {RULES.dailyPct}% daily
        and {RULES.totalPct}% total loss limit. Your own account size and drawdown limits go in the
        settings, or pick your prop firm's preset.
      </p>
    </div>
  )
}
