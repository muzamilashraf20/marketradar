import { Search, ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from 'lucide-react'
import { DEMO_BRIEF as B } from './demoData'
import DemoTag from './DemoTag'
import { useMotion } from './useMotion'

/* The event brief, rendered — with the evidence balance that makes "no call"
   visible rather than asserted.

   EVIDENCE BALANCE. Three component vectors — macro, flow, sentiment — each
   drawn from a centre line toward BUY or SELL, then a horizontal meter from
   SELL to BUY with a shaded no-call zone in the middle; the needle is where the
   three net out. Statically (no JavaScript, reduced motion, or before the brief
   is scrolled to) every vector is at full length and the needle rests inside
   the zone — the engine's actual answer. With motion, on arrival, macro's
   vector grows and pushes the needle toward BUY, flow's and sentiment's grow in
   turn and pull it back toward SELL, it swings with shrinking amplitude and
   settles inside the zone; only then does "No directional call" resolve in,
   and the beat/miss chips slide in from opposite sides, their arrows nudging
   once. Timing lives in landing.css (bf-vec-* / bf-bal-* / bf-resolve /
   bf-chip-* / bf-arrow-*).

   Everything here is demo data and labelled as such. */
export default function EventBrief() {
  const motion = useMotion()

  return (
    <div ref={motion} className="bf-card bf-grid-card relative overflow-hidden">
      <div className="px-4 sm:px-5 pt-4 pb-3.5 bf-hairline-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
              Event brief
            </p>
            <h3 className="mt-1.5 text-[17px] sm:text-[19px] font-semibold text-slate-100 tracking-tight">
              {B.event}
            </h3>
          </div>
          <DemoTag />
        </div>

        <div className="mt-2.5 flex items-center gap-x-4 gap-y-1 flex-wrap text-[12px]">
          <span className="bf-mono font-bold text-cyan-400">{B.currency}</span>
          <span className="font-semibold text-rose-400">{B.impact}</span>
          <span className="bf-t3">
            Forecast <span className="bf-mono text-slate-300">{B.forecast}</span>
          </span>
          <span className="bf-t3">
            Previous <span className="bf-mono text-slate-300">{B.previous}</span>
          </span>
        </div>
      </div>

      <div className="p-3 space-y-2.5">
        {/* Evidence balance */}
        <div className="rounded-xl border border-white/[0.06] bg-bf-bg/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-wider bf-t3">Evidence balance</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider bf-t3 bf-mono">{B.currency}</p>
          </div>

          {/* The three components, each its own vector from the centre line:
              right for buy, left for sell, length for relative weight. */}
          <ul className="mt-3 space-y-1.5" aria-label="Component vectors">
            {B.vectors.map((v, i) => {
              const buy = v.leans === 'BUY'
              return (
                <li key={v.label} className="grid grid-cols-[4.75rem_1fr_3.25rem] items-center gap-2 text-[11px]">
                  <span className="font-medium text-slate-300">{v.label}</span>
                  <span className="relative h-2" aria-hidden="true">
                    <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/[0.08]" />
                    <span className="absolute left-1/2 top-0 bottom-0 w-px -ml-px bg-white/20" />
                    <span
                      className={`bf-vec absolute top-0 bottom-0 rounded-full ${buy ? 'bf-vec-buy left-1/2 bg-bf-bull/70' : 'bf-vec-sell right-1/2 bg-bf-bear/70'}`}
                      style={{ width: `${v.weight / 2}%`, '--i': i }}
                    />
                  </span>
                  <span className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wider text-[10px] ${buy ? 'justify-end text-bf-bull-soft' : 'justify-start text-bf-bear-soft'}`}>
                    {buy ? <>Buy <ArrowRight size={11} strokeWidth={2.5} aria-hidden="true" /></> : <><ArrowLeft size={11} strokeWidth={2.5} aria-hidden="true" /> Sell</>}
                  </span>
                </li>
              )
            })}
          </ul>

          <div
            className="relative mt-3 h-9"
            role="img"
            aria-label="Evidence balance: macro pushes toward buy, flow and sentiment each pull toward sell; the net sits inside the no-call zone"
          >
            {/* Track */}
            <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/[0.08]" />
            {/* No-call zone: the band the net has to clear before a direction is called */}
            <div className="absolute inset-y-0 left-[38%] right-[38%] rounded-md border border-dashed border-slate-500/40 bg-slate-400/[0.08]" />
            {/* Ticks */}
            {[0, 25, 50, 75, 100].map(t => (
              <span key={t} className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-white/15" style={{ left: `${t}%` }} aria-hidden="true" />
            ))}
            {/* Needle. The wrapper spans the whole track, so translateX(%) moves
                it by a share of the track's width. Rests inside the zone. */}
            <div className="bf-bal-needle absolute inset-0" aria-hidden="true">
              <span className="absolute left-1/2 top-0 bottom-0 w-[2px] -ml-px rounded-full bg-bf-accent-soft" />
              <span className="absolute left-1/2 -top-1 h-2 w-2 -ml-1 rotate-45 bg-bf-accent-soft" />
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider">
            <span className="text-bf-bear-soft">Sell</span>
            <span className="bf-t3">No-call zone</span>
            <span className="text-bf-bull-soft">Buy</span>
          </div>
        </div>

        {/* The verdict, resolved once the needle settles */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[10px] font-bold uppercase tracking-wider bf-t3">Overall bias</p>
            <p className="bf-resolve relative overflow-hidden text-[12px] font-bold uppercase tracking-[0.18em] text-slate-200">
              {B.call}
            </p>
          </div>

          <p className="mt-2 text-[17px] sm:text-[19px] font-semibold text-slate-100 leading-snug max-w-[32ch]">
            {B.verdict}
          </p>

          <p className="mt-3.5 text-[13px] leading-[1.7] text-slate-400">{B.reasoning}</p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider bf-t3">
              <Search size={12} className="text-cyan-400 shrink-0" aria-hidden="true" strokeWidth={2} />
              Leading indicators
            </p>
            <span className="text-[10px] font-bold px-2 py-[3px] rounded border bg-yellow-500/10 text-yellow-300 border-yellow-500/25">
              {B.indicatorsVerdict}
            </span>
          </div>

          {/* One lead each way — the split, shown rather than described. */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="bf-chip-beat inline-flex items-center gap-1.5 rounded-chip border border-bf-bull/25 bg-bf-bull/10 px-2 py-1 text-[11px] font-semibold text-bf-bull-soft">
              <ArrowUp size={12} strokeWidth={2.5} className="bf-arrow-beat shrink-0" aria-hidden="true" />
              Beat · {B.leadBeat}
            </span>
            <span className="bf-chip-miss inline-flex items-center gap-1.5 rounded-chip border border-bf-bear/25 bg-bf-bear/10 px-2 py-1 text-[11px] font-semibold text-bf-bear-soft">
              <ArrowDown size={12} strokeWidth={2.5} className="bf-arrow-miss shrink-0" aria-hidden="true" />
              Miss · {B.leadMiss}
            </span>
          </div>

          <p className="mt-3 text-[13.5px] leading-[1.7] text-yellow-200/80">{B.indicatorsLead}</p>
        </div>
      </div>
    </div>
  )
}
