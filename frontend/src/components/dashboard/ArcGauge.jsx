// Semicircular arc gauge. No dependencies — plain SVG.
// Used for Prop Risk drawdown; sized to sit inside the existing stat-card footprint.
export default function ArcGauge({
  value = 0,          // 0..100, how much of the limit is consumed
  label = '',         // big text under the arc (e.g. "SAFE")
  sub = '',           // small text under the label
  stroke = '#10b981', // arc colour — caller decides from status
  size = 88,
}) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0))

  // Geometry: half-circle from left to right across the top.
  const w = 120, h = 66, cx = 60, cy = 60, r = 50
  const track = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`
  const len = Math.PI * r

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ width: size, height: (size * h) / w }}
        className="overflow-visible"
        role="img"
        aria-label={`${pct.toFixed(0)} percent of limit used`}
      >
        {/* track */}
        <path
          d={track}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* value */}
        <path
          d={track}
          fill="none"
          stroke={stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len - (len * pct) / 100}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.22,1,0.36,1), stroke 300ms ease' }}
        />
        {/* centre readout */}
        <text
          x={cx} y={cy - 12}
          textAnchor="middle"
          fill="#fff"
          style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}
        >
          {pct.toFixed(0)}%
        </text>
        <text
          x={cx} y={cy - 1}
          textAnchor="middle"
          fill="rgba(148,163,184,0.9)"
          style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.08em' }}
        >
          OF LIMIT
        </text>
      </svg>

      {label && (
        <p className="text-sm font-bold leading-none mt-0.5" style={{ color: stroke }}>
          {label}
        </p>
      )}
      {sub && <p className="text-[10px] text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}
