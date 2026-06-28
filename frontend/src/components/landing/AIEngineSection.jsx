import RevealSection from './RevealSection'

const NODES = [
  { id: 'price',      lines: ['Price', 'Action'],        x: 90,  y: 80,  color: '#06b6d4', delay: '0s' },
  { id: 'currency',   lines: ['Currency', 'Strength'],   x: 90,  y: 220, color: '#06b6d4', delay: '-0.6s' },
  { id: 'calendar',   lines: ['Economic', 'Calendar'],   x: 90,  y: 360, color: '#06b6d4', delay: '-1.2s' },
  { id: 'news',       lines: ['Breaking', 'News'],       x: 265, y: 80,  color: '#10b981', delay: '-0.3s' },
  { id: 'position',   lines: ['Positioning', 'Data'],    x: 265, y: 220, color: '#10b981', delay: '-0.9s' },
  { id: 'crossasset', lines: ['Cross-Asset', 'Signals'], x: 265, y: 360, color: '#10b981', delay: '-1.5s' },
]

// Hub center, hub radius, output box center
const CX = 468, CY = 220, R = 56
const OUT_CX = 710, OUT_CY = 220

export default function AIEngineSection() {
  return (
    <section className="relative bg-[#030712] py-20 px-4 sm:px-6 overflow-hidden">

      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[320px] bg-cyan-500/6 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[240px] h-[240px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-5xl mx-auto">

        {/* Header */}
        <RevealSection delay={0}>
        <div className="text-center mb-14">
          <p className="text-xs uppercase tracking-widest text-cyan-400 font-bold mb-3">
            Under The Hood
          </p>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4 leading-tight">
            One bias.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
              Every source.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
            BiasForge's AI engine ingests multiple streams of macro intelligence
            simultaneously — and converges them into a single, clear trading direction.
          </p>
        </div>

        </RevealSection>

        {/* Graph — horizontally scrollable on narrow screens */}
        <RevealSection delay={150}>
        <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
          <div className="min-w-[580px]">
            <svg
              viewBox="0 0 800 440"
              width="100%"
              className="overflow-visible"
              role="img"
              aria-label="BiasForge AI engine diagram: six macro data sources flow into a central AI hub, producing one clear daily bias"
            >
              <defs>
                <style>{`
                  .ai-flow {
                    animation: aiflow 2s linear infinite;
                  }
                  @keyframes aiflow {
                    from { stroke-dashoffset: 20; }
                    to   { stroke-dashoffset: 0;  }
                  }
                  .hub-ring {
                    animation: hubring 2.8s ease-in-out infinite;
                  }
                  @keyframes hubring {
                    0%,100% { r: 66; opacity: 0.10; }
                    50%      { r: 76; opacity: 0.25; }
                  }
                  @media (prefers-reduced-motion: reduce) {
                    .ai-flow  { animation: none; }
                    .hub-ring { animation: none; opacity: 0.12; }
                  }
                `}</style>

                <radialGradient id="aihub" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor="#06b6d4" stopOpacity="0.28" />
                  <stop offset="60%"  stopColor="#0891b2" stopOpacity="0.14" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.04" />
                </radialGradient>

                <linearGradient id="aiout" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%"   stopColor="#10b981" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.08" />
                </linearGradient>

                {/* Soft glow for lines / nodes */}
                <filter id="softglow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>

                {/* Stronger glow for hub */}
                <filter id="hubglow" x="-120%" y="-120%" width="340%" height="340%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* ── Pulsing outer ring ── */}
              <circle
                className="hub-ring"
                cx={CX} cy={CY} r="66"
                fill="none"
                stroke="#06b6d4"
                strokeWidth="1.5"
              />

              {/* ── Hub glow layer ── */}
              <circle cx={CX} cy={CY} r={R + 14} fill="url(#aihub)" filter="url(#hubglow)" />

              {/* ── Hub main circle ── */}
              <circle cx={CX} cy={CY} r={R} fill="#05101e" stroke="#06b6d4" strokeWidth="1.5" />
              <circle cx={CX} cy={CY} r={R - 11} fill="none" stroke="#06b6d4" strokeWidth="0.5" strokeOpacity="0.25" />

              {/* Hub label */}
              <text x={CX} y={CY - 9} textAnchor="middle" fill="#06b6d4" fontSize="11.5" fontWeight="700" fontFamily="'Courier New',monospace" letterSpacing="0.5">
                BiasForge
              </text>
              <text x={CX} y={CY + 7} textAnchor="middle" fill="#10b981" fontSize="9" fontWeight="700" fontFamily="'Courier New',monospace" letterSpacing="2">
                AI ENGINE
              </text>

              {/* ── Input nodes + flow lines ── */}
              {NODES.map((node) => {
                const startX = node.x + 70
                const endX   = CX - R - 4
                const cpX    = (startX + endX) / 2
                const d      = `M ${startX} ${node.y} C ${cpX} ${node.y}, ${cpX} ${CY}, ${endX} ${CY}`

                return (
                  <g key={node.id}>
                    {/* Animated dashed flow line */}
                    <path
                      d={d}
                      fill="none"
                      stroke={node.color}
                      strokeWidth="1.5"
                      strokeDasharray="6 4"
                      strokeOpacity="0.55"
                      className="ai-flow"
                      style={{ animationDelay: node.delay }}
                    />

                    {/* Node card */}
                    <rect
                      x={node.x - 70} y={node.y - 24}
                      width="140" height="48"
                      rx="10"
                      fill="#08111e"
                      stroke={node.color}
                      strokeWidth="1"
                      strokeOpacity="0.35"
                    />

                    {/* Accent dot */}
                    <circle cx={node.x - 51} cy={node.y} r="3.5" fill={node.color} opacity="0.75" />

                    {/* Label lines */}
                    <text x={node.x - 40} y={node.y - 5} fill="#cbd5e1" fontSize="11.5" fontWeight="600">
                      {node.lines[0]}
                    </text>
                    <text x={node.x - 40} y={node.y + 10} fill="#64748b" fontSize="10">
                      {node.lines[1]}
                    </text>
                  </g>
                )
              })}

              {/* ── Output line + arrowhead ── */}
              <line
                x1={CX + R + 4} y1={CY}
                x2={OUT_CX - 86} y2={OUT_CY}
                stroke="#10b981"
                strokeWidth="1.5"
                strokeOpacity="0.5"
                strokeDasharray="5 3"
              />
              <polygon
                points={`${OUT_CX - 86},${OUT_CY - 5} ${OUT_CX - 74},${OUT_CY} ${OUT_CX - 86},${OUT_CY + 5}`}
                fill="#10b981"
                opacity="0.75"
              />

              {/* ── Output box ── */}
              <rect
                x={OUT_CX - 74} y={OUT_CY - 32}
                width="148" height="64"
                rx="12"
                fill="#04120e"
                stroke="#10b981"
                strokeWidth="1.5"
                strokeOpacity="0.55"
                filter="url(#softglow)"
              />
              <text x={OUT_CX} y={OUT_CY - 10} textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="700">
                Clear Daily
              </text>
              <text x={OUT_CX} y={OUT_CY + 7} textAnchor="middle" fill="#10b981" fontSize="13" fontWeight="800">
                Bias ↗
              </text>
              <text x={OUT_CX} y={OUT_CY + 22} textAnchor="middle" fill="#475569" fontSize="9">
                one direction
              </text>
            </svg>
          </div>
        </div>

        {/* Mobile scroll hint */}
        <p className="text-center text-xs text-slate-600 mt-2 sm:hidden select-none">
          ← swipe to see full diagram →
        </p>

        </RevealSection>

        {/* Footer tagline */}
        <p className="text-center text-sm text-slate-500 mt-10 max-w-xl mx-auto leading-relaxed">
          All sources processed simultaneously — no manual interpretation, no guesswork.
        </p>

      </div>
    </section>
  )
}
