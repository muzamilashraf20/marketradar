import { useEffect, useState } from 'react'
import { RefreshCw, Loader2, Compass, ChevronDown, AlertCircle, Clock } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'

// Grade drives the accent colour, not direction — direction is already obvious from BUY/SELL.
// This way a weak BUY and a weak SELL read as equally weak at a glance.
const GRADE_STYLE = {
  'A':  { ring: '#10b981', text: 'text-emerald-400', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  'A-': { ring: '#10b981', text: 'text-emerald-400', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  'B':  { ring: '#06b6d4', text: 'text-cyan-400',    chip: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25' },
  'C':  { ring: '#eab308', text: 'text-yellow-400',  chip: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25' },
  'D':  { ring: '#64748b', text: 'text-slate-400',   chip: 'bg-slate-500/15 text-slate-400 border-slate-500/25' },
}
const gradeStyle = g => GRADE_STYLE[g] || GRADE_STYLE.D

const TIMING_STYLE = {
  FRESH:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  EXTENDED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  LATE:     'bg-red-500/10 text-red-400 border-red-500/20',
}

// A bias older than this is called out. The engine refreshes conviction on every run, so a row that
// hasn't moved in hours means the engine isn't running — not that the view is merely unchanged.
// Silence there is indistinguishable from a dead cron, and on a trading panel that has to be visible.
const STALE_AFTER_MIN = 6 * 60

const ageMinsOf = iso => (iso ? (Date.now() - new Date(iso).getTime()) / 60000 : null)

// Invalidation levels arrive as raw floats (ATR maths), e.g. 0.7028257142857143. Round to the
// pair's real quoting precision — same convention the backend logs use.
const fmtLevel = (pair, v) => {
  if (v == null) return null
  const dp = pair.includes('JPY') ? 3 : pair === 'XAUUSD' ? 2 : 5
  return Number(v).toFixed(dp)
}

function timeAgo(iso) {
  if (!iso) return null
  const mins = Math.round(ageMinsOf(iso))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

/** Placeholder for the gauge slot when a pair has no conviction score yet. Same footprint as the
 *  gauge so rows don't shift once scoring lands. */
function PendingGauge({ size = 56 }) {
  return (
    <div
      className="relative shrink-0 rounded-full border border-dashed border-white/15 flex items-center justify-center"
      style={{ width: size, height: size }}
      title="Conviction not scored yet"
    >
      <Clock size={15} className="text-slate-600" />
    </div>
  )
}

/** Radial conviction gauge. The arc is the score; the number is the score. No decoration. */
function Gauge({ value, color, size = 56, stroke = 5 }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value ?? 0)) / 100
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[13px] font-bold text-white tabular-nums">{value ?? '–'}</span>
      </div>
    </div>
  )
}

function PairCard({ p, expanded, onToggle }) {
  const gs = gradeStyle(p.grade)
  const isBuy = p.direction === 'BUY'
  const isFlat = p.direction === 'FLAT'
  const scored = p.confidence != null
  const age = ageMinsOf(p.updatedAt)
  const stale = age != null && age > STALE_AFTER_MIN
  const level = fmtLevel(p.pair, p.invalidationLevel)

  return (
    <div
      className={`snap-start shrink-0 w-[230px] sm:w-[250px] rounded-xl border p-3 flex flex-col transition-colors ${
        p.isHeadline
          ? 'bg-cyan-500/[0.07] border-cyan-500/30'
          : 'bg-white/[0.02] border-white/5 hover:border-white/10'
      }`}
    >
      {/* Pair + today badge */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[13px] font-bold text-white tracking-tight">{p.pair}</span>
        {p.isHeadline && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            Today
          </span>
        )}
      </div>

      {/* Gauge + direction */}
      <div className="flex items-center gap-3">
        {scored ? <Gauge value={p.confidence} color={isFlat ? '#64748b' : gs.ring} size={50} /> : <PendingGauge size={50} />}
        <div className="min-w-0">
          <p className={`text-[15px] font-bold leading-none ${
            isFlat ? 'text-slate-400' : isBuy ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {isFlat ? 'NO BIAS' : p.direction}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {scored && p.grade && !isFlat && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${gs.chip}`}>{p.grade}</span>
            )}
            {!scored && !isFlat && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-white/[0.03] text-slate-500 border-white/10">
                Scoring pending
              </span>
            )}
            {p.entryTiming && !isFlat && scored && (
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${TIMING_STYLE[p.entryTiming] || TIMING_STYLE.FRESH}`}>
                {p.entryTiming}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Age */}
      {p.updatedAt && !isFlat && (
        <p className={`text-[9.5px] mt-2 ${stale ? 'text-amber-400/80' : 'text-slate-600'}`}>{timeAgo(p.updatedAt)}</p>
      )}

      {/* A flat pair still needs to say something — otherwise the card reads as a loading failure.
          noBiasReason is the engine's real per-pair read (range spent / how far short of threshold);
          it's null until the backend's first v2 run of the boot, so keep the generic line as fallback. */}
      {isFlat && (
        <p className="text-[11px] leading-snug text-slate-500 mt-2">
          {p.noBiasReason || 'Signals too close to call — neither side has the edge.'}
        </p>
      )}

      {/* Thesis — clamped, expands on demand */}
      {p.thesis && !isFlat && (
        <p className={`text-[11px] leading-snug text-slate-400 mt-2 ${expanded ? '' : 'line-clamp-3'}`}>
          {p.thesis}
        </p>
      )}

      {expanded && level && (
        <div className="mt-2 p-2 rounded-lg bg-red-500/[0.06] border border-red-500/15">
          <p className="text-[10.5px] font-semibold text-red-300">Invalidates at {level}</p>
          {p.invalidationText && (
            <p className="text-[10px] text-slate-400 leading-snug mt-0.5">{p.invalidationText}</p>
          )}
        </div>
      )}

      {!isFlat && (p.thesis || level) && (
        <button
          onClick={onToggle}
          className="mt-auto pt-2 text-[10px] font-semibold text-cyan-400/80 hover:text-cyan-300 flex items-center gap-1 self-start"
          aria-expanded={expanded}
        >
          {expanded ? 'Less' : 'Details'}
          <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  )
}

export default function MacroCompass() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openPair, setOpenPair] = useState(null)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API_BASE}/api/macro-compass`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to load')
      setData(json)
    } catch (e) {
      setError(e.message || 'Could not load the compass')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 5 * 60 * 1000)   // engine writes at most every 2h; 5min keeps it fresh cheaply
    return () => clearInterval(t)
  }, [])

  const active = (data?.pairs || []).filter(p => p.direction !== 'FLAT')
  const flat = (data?.pairs || []).filter(p => p.direction === 'FLAT')

  // Data age = the most recent row write, NOT data.updatedAt — that is stamped when the request is
  // served, so it always reads "just now" and would present days-old biases as current.
  const lastRun = (data?.pairs || [])
    .map(p => p.updatedAt)
    .filter(Boolean)
    .sort()
    .pop() || null
  const engineStale = (ageMinsOf(lastRun) ?? 0) > STALE_AFTER_MIN
  const unscored = active.filter(p => p.confidence == null).length

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 sm:p-5 min-w-0 max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Compass size={15} className="text-cyan-400 shrink-0" />
            Macro Compass
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">Where the fundamentals point today</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="shrink-0 p-2 rounded-lg bg-white/[0.03] border border-white/5 text-slate-400 hover:text-white hover:border-white/10 transition-colors disabled:opacity-50"
          aria-label="Refresh compass"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Meta strip */}
      {data && !error && (
        <div className="flex items-center gap-2 flex-wrap mb-3 text-[10px] font-medium uppercase tracking-wider text-slate-500">
          <span>{active.length} active bias{active.length === 1 ? '' : 'es'}</span>
          {data.regime && (<><span className="text-slate-700">·</span><span>{data.regime} regime</span></>)}
          {lastRun && (
            <>
              <span className="text-slate-700">·</span>
              <span className={`normal-case tracking-normal ${engineStale ? 'text-amber-400' : ''}`}>
                engine last ran {timeAgo(lastRun)}
              </span>
            </>
          )}
        </div>
      )}

      {/* Degraded banner — the panel is built on conviction, so say plainly when conviction is
          missing or the engine has gone quiet rather than rendering confident-looking empty rings. */}
      {data && !error && (engineStale || unscored > 0) && (
        <div className="flex items-start gap-2 p-2.5 mb-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/15">
          <Clock size={13} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-200/90 leading-snug">
            {engineStale
              ? `These biases haven't been refreshed in ${timeAgo(lastRun)?.replace(' ago', '')} — the scoring engine may not be running. Treat the directions below as historical until it catches up.`
              : `${unscored} pair${unscored === 1 ? '' : 's'} not scored for conviction yet — direction is live, strength lands on the next engine pass.`}
          </p>
        </div>
      )}

      {/* States */}
      {loading && !data && (
        <div className="flex items-center justify-center gap-2 py-10 text-slate-500 text-sm">
          <Loader2 size={15} className="animate-spin" /> Reading the macro…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/[0.06] border border-red-500/15">
          <AlertCircle size={14} className="text-red-400 shrink-0 mt-px" />
          <p className="text-[12px] text-red-300">{error}</p>
        </div>
      )}

      {data && !error && active.length === 0 && flat.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-slate-400">No conviction anywhere right now.</p>
          <p className="text-[11.5px] text-slate-500 mt-1">
            Signals are conflicted or too weak to call — that is itself the read.
          </p>
        </div>
      )}

      {/* Pairs — every pair rides the same scroller. FLAT ones sort last but stay full cards:
          "no bias" is a real read the engine made, not an absence of one, and hiding it in a
          footnote made a deliberate call look like missing data. */}
      {data && !error && (active.length > 0 || flat.length > 0) && (
        <div className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1
                        [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5
                        [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
          {[...active, ...flat].map(p => (
            <PairCard
              key={p.pair}
              p={p}
              expanded={openPair === p.pair}
              onToggle={() => setOpenPair(openPair === p.pair ? null : p.pair)}
            />
          ))}
        </div>
      )}

      <p className="text-[10px] text-slate-600 mt-4 leading-relaxed">
        Conviction reflects how much of the macro evidence lines up behind the direction, and how much
        of the daily range is still unspent. It is not a probability of profit.
      </p>
    </div>
  )
}