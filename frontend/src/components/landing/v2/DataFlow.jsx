/* Ported from the previous landing page's AIEngineSection. The geometry, the
   cyan glow and the converging dashed lines are unchanged — it is the most
   distinctive thing either page has. What changed:

     · "Cross-Asset Signals"      → "Cross-Asset Flows"   (we never say signals)
     · "Clear Daily Bias / one direction"
                                  → "Directional Bias / with invalidation level"
     · the two label greys were below AA on this background and now use the
       page's own text tokens
     · the hub ring pulsed by animating the circle's `r` attribute; it now
       scales by transform, so the page keeps to transform and opacity only */

const NODES = [
  { id: 'price',      lines: ['Price', 'Action'],      x: 90,  y: 80,  color: '#06b6d4', delay: '0s' },
  { id: 'currency',   lines: ['Currency', 'Strength'], x: 90,  y: 220, color: '#06b6d4', delay: '-0.6s' },
  { id: 'calendar',   lines: ['Economic', 'Calendar'], x: 90,  y: 360, color: '#06b6d4', delay: '-1.2s' },
  { id: 'news',       lines: ['Breaking', 'News'],     x: 265, y: 80,  color: '#10b981', delay: '-0.3s' },
  { id: 'position',   lines: ['Positioning', 'Data'],  x: 265, y: 220, color: '#10b981', delay: '-0.9s' },
  { id: 'crossasset', lines: ['Cross-Asset', 'Flows'], x: 265, y: 360, color: '#10b981', delay: '-1.5s' },
]

// Hub centre, hub radius, output box centre
const CX = 468, CY = 220, R = 56
const OUT_CX = 710, OUT_CY = 220

export default function DataFlow() {
  return (
    <div className="relative">
      {/* Background glow — the treatment that carried over from the old page. */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[320px] max-w-full bg-cyan-500/[0.06] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[240px] h-[240px] bg-emerald-500/[0.05] rounded-full blur-3xl pointer-events-none" />

      {/* Scrolls inside its own container on narrow screens; the page body never
          scrolls sideways. */}
      <div className="relative overflow-x-auto -mx-5 sm:-mx-8 px-5 sm:px-8">
        <div className="min-w-[580px]">
          <svg
            /* Cropped to the content. The node rows run y 56-384, so the original
               440-unit box carried 56 units of nothing at the top and the same at
               the bottom — about 150px of dead space at the width this renders at. */
            viewBox="0 36 800 368"
            width="100%"
            className="overflow-visible"
            role="img"
            aria-label="Six macro data sources — price action, currency strength, the economic calendar, breaking news, positioning data and cross-asset flows — converging into BiasForge and resolving into one directional bias with its invalidation level, the macro read forex and prop firm traders act on"
          >
            <defs>
              <style>{`
                .bf-flow { animation: bf-flow 2s linear infinite; }
                @keyframes bf-flow {
                  from { stroke-dashoffset: 20; }
                  to   { stroke-dashoffset: 0;  }
                }
                .bf-hub-ring {
                  transform-box: fill-box;
                  transform-origin: center;
                  animation: bf-hub-ring 2.8s ease-in-out infinite;
                }
                @keyframes bf-hub-ring {
                  0%, 100% { transform: scale(1);    opacity: 0.10; }
                  50%      { transform: scale(1.06); opacity: 0.25; }
                }
                @media (prefers-reduced-motion: reduce) {
                  .bf-flow     { animation: none; }
                  .bf-hub-ring { animation: none; opacity: 0.12; }
                }
              `}</style>

              <radialGradient id="bfhub" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#06b6d4" stopOpacity="0.28" />
                <stop offset="60%"  stopColor="#0891b2" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.04" />
              </radialGradient>

              <filter id="bfsoftglow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>

              <filter id="bfhubglow" x="-120%" y="-120%" width="340%" height="340%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* Pulsing outer ring */}
            <circle className="bf-hub-ring" cx={CX} cy={CY} r="66" fill="none" stroke="#06b6d4" strokeWidth="1.5" />

            {/* Hub glow, body and inner hairline */}
            <circle cx={CX} cy={CY} r={R + 14} fill="url(#bfhub)" filter="url(#bfhubglow)" />
            <circle cx={CX} cy={CY} r={R} fill="#05101e" stroke="#06b6d4" strokeWidth="1.5" />
            <circle cx={CX} cy={CY} r={R - 11} fill="none" stroke="#06b6d4" strokeWidth="0.5" strokeOpacity="0.25" />

            <text x={CX} y={CY - 9} textAnchor="middle" fill="#06b6d4" fontSize="11.5" fontWeight="700" fontFamily="'Courier New',monospace" letterSpacing="0.5">
              BiasForge
            </text>
            <text x={CX} y={CY + 7} textAnchor="middle" fill="#10b981" fontSize="9" fontWeight="700" fontFamily="'Courier New',monospace" letterSpacing="2">
              AI ENGINE
            </text>

            {/* Input nodes and their converging flow lines */}
            {NODES.map(node => {
              const startX = node.x + 70
              const endX = CX - R - 4
              const cpX = (startX + endX) / 2
              const d = `M ${startX} ${node.y} C ${cpX} ${node.y}, ${cpX} ${CY}, ${endX} ${CY}`

              return (
                <g key={node.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke={node.color}
                    strokeWidth="1.5"
                    strokeDasharray="6 4"
                    strokeOpacity="0.55"
                    className="bf-flow"
                    style={{ animationDelay: node.delay }}
                  />
                  <rect
                    x={node.x - 70} y={node.y - 24}
                    width="140" height="48" rx="10"
                    fill="#08111e" stroke={node.color} strokeWidth="1" strokeOpacity="0.35"
                  />
                  <circle cx={node.x - 51} cy={node.y} r="3.5" fill={node.color} opacity="0.75" />
                  <text x={node.x - 40} y={node.y - 5} fill="#cbd5e1" fontSize="11.5" fontWeight="600">
                    {node.lines[0]}
                  </text>
                  <text x={node.x - 40} y={node.y + 10} fill="#94a3b8" fontSize="10">
                    {node.lines[1]}
                  </text>
                </g>
              )
            })}

            {/* Output line, arrowhead and card */}
            <line
              x1={CX + R + 4} y1={CY} x2={OUT_CX - 86} y2={OUT_CY}
              stroke="#10b981" strokeWidth="1.5" strokeOpacity="0.5" strokeDasharray="5 3"
            />
            <polygon
              points={`${OUT_CX - 86},${OUT_CY - 5} ${OUT_CX - 74},${OUT_CY} ${OUT_CX - 86},${OUT_CY + 5}`}
              fill="#10b981" opacity="0.75"
            />
            <rect
              x={OUT_CX - 74} y={OUT_CY - 32}
              width="148" height="64" rx="12"
              fill="#04120e" stroke="#10b981" strokeWidth="1.5" strokeOpacity="0.55"
              filter="url(#bfsoftglow)"
            />
            <text x={OUT_CX} y={OUT_CY - 10} textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="700">
              Directional
            </text>
            <text x={OUT_CX} y={OUT_CY + 7} textAnchor="middle" fill="#10b981" fontSize="13" fontWeight="800">
              Bias ↗
            </text>
            <text x={OUT_CX} y={OUT_CY + 22} textAnchor="middle" fill="#7c8aa0" fontSize="8.5">
              with invalidation level
            </text>
          </svg>
        </div>
      </div>

      <p className="text-center text-[12px] bf-t3 mt-2 sm:hidden select-none">
        ← swipe to see full diagram →
      </p>

      <p className="text-center text-[14px] bf-t3 mt-6 max-w-xl mx-auto leading-relaxed">
        All sources processed simultaneously — no manual interpretation, no guesswork.
      </p>
    </div>
  )
}
