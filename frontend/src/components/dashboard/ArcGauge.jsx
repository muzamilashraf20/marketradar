import { Clock } from 'lucide-react'

// Plain-SVG gauge, no dependencies. Two shapes:
//   variant="arc"  — semicircle, used for Prop Risk drawdown (default; unchanged)
//   variant="ring" — full circle, used for bias conviction. Matches the MacroCompass gauge
//                    geometry and 600ms sweep so the two read as the same instrument.
//
// `value == null` is NOT the same as 0. A missing score renders an explicit unscored state
// rather than an empty ring, because "we have not scored this" and "we scored this at zero
// conviction" are different claims and only one of them is ever true here.

/** Unscored placeholder. Same footprint as the ring so nothing shifts once a score lands. */
function UnscoredRing({ size, title }) {
  return (
    <div
      className="relative shrink-0 rounded-full border border-dashed border-white/15 flex items-center justify-center"
      style={{ width: size, height: size }}
      title={title}
      role="img"
      aria-label="Conviction not scored"
    >
      <Clock size={Math.round(size * 0.28)} className="text-slate-600" />
    </div>
  )
}

export default function ArcGauge({
  value = 0,          // 0..100 — or null/undefined for "not scored"
  label = '',         // big text under the arc (e.g. "SAFE")
  sub = '',           // small text under the label
  stroke = '#10b981', // accent colour — caller decides from status/grade
  size = 88,
  variant = 'arc',
  centerLabel,        // ring only: overrides the centred readout (defaults to the number)
  ariaLabel,
}) {
  const scored = value !== null && value !== undefined && value !== ''
  const pct = Math.max(0, Math.min(100, Number(value) || 0))

  // ── Ring ──────────────────────────────────────────────────────────────────
  if (variant === 'ring') {
    const ringStroke = Math.max(4, Math.round(size * 0.09))
    const r = (size - ringStroke) / 2
    const circ = 2 * Math.PI * r

    if (!scored) return <UnscoredRing size={size} title="Conviction not scored yet" />

    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="-rotate-90"
          role="img"
          aria-label={ariaLabel || `Conviction ${pct.toFixed(0)} out of 100`}
        >
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth={ringStroke}
          />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={stroke} strokeWidth={ringStroke} strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct / 100)}
            style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.22,1,0.36,1), stroke 300ms ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[13px] font-bold text-white tabular-nums">
            {centerLabel ?? pct.toFixed(0)}
          </span>
        </div>
      </div>
    )
  }

  // ── Arc (default) ─────────────────────────────────────────────────────────
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
        aria-label={ariaLabel || `${pct.toFixed(0)} percent of limit used`}
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
