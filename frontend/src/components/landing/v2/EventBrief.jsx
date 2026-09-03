import { Search } from 'lucide-react'
import { DEMO_BRIEF as B } from './demoData'

/* The event brief, rendered.

   This was the last screenshot on the page. It was a 952px modal the layout had
   to show at 460px wide, which put the reasoning at roughly half size — and the
   reasoning is the entire section. Anyone can say their engine declines to call
   a print; what makes it land is reading the argument for why, and that was the
   part the crop made illegible.

   Rendered, it is legible at any width, it carries no image weight, and it holds
   the same SAMPLE label as the other panels: this is one recorded brief, not a
   read on a print that is coming up. */
export default function EventBrief() {
  return (
    <div className="bf-card overflow-hidden">
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
          <span className="bf-pill bf-hairline text-[9.5px] font-bold uppercase tracking-wider px-2 py-[3px] bf-t3 shrink-0">
            Sample
          </span>
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
        {/* The verdict. Where a bias card carries a direction and a conviction
            ring, this carries a flat dash — the engine's way of saying it has
            nothing to publish, rendered as deliberately as a call would be. */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-start justify-between gap-4">
            <p className="text-[10px] font-bold uppercase tracking-wider bf-t3">Overall bias</p>
            <div className="text-right shrink-0">
              <span className="block w-8 h-[3px] rounded-full bg-slate-500 ml-auto" aria-hidden="true" />
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider bf-t3 max-w-[8rem]">
                {B.call}
              </p>
            </div>
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

          <p className="mt-3 text-[13.5px] leading-[1.7] text-yellow-200/80">{B.indicatorsLead}</p>
          <p className="mt-2.5 text-[13px] leading-[1.7] text-slate-400">{B.indicatorsDetail}</p>
        </div>
      </div>
    </div>
  )
}
