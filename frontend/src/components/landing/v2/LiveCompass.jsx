import BiasCard from './BiasCard'
import DemoTag from './DemoTag'
import EmptyState from '../../ui/EmptyState'
import { fmtPair } from '../../ui/format'
import { CARDS } from './useCompassData'

/* What the engine covers. A fact about the product, not demo data — it mirrors
   V2_ALL_PAIRS in backend/biasEngineV2/biasEngine.js. Update both together. */
const COVERAGE = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD', 'AUDUSD', 'NZDUSD', 'USDCHF', 'XAUUSD']

/* The hero's compass panel. Presentational: the hero owns the rows.

   Every card in it is demo data and the header says so. There is no
   timestamp anywhere on the panel, so nothing in it can read as a live run.

   No overflow-hidden on the frame: the conviction tooltip opens upward out of
   the card, and a clipping ancestor would cut it off. */
export default function LiveCompass({ rows, ready }) {
  const shown = rows.slice(0, CARDS)
  const empty = ready && shown.length === 0

  return (
    <div className="bf-card min-w-0 shadow-[0_24px_70px_-30px_rgba(0,0,0,0.95)]">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3.5 bf-hairline-b">
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-medium text-bf-text tracking-tight">Macro compass</h2>
          <p className="text-2xs text-bf-muted mt-0.5">How a bias reads in the dashboard</p>
        </div>
        <DemoTag />
      </div>

      {empty ? (
        <div className="p-3">
          <EmptyState
            title="No pair clears the bar."
            message="When the macro evidence is not strong enough, the engine holds rather than publishing a read it does not have."
          />
        </div>
      ) : (
        <ul className={`grid gap-2.5 p-3 ${shown.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
          {shown.map(row => <BiasCard key={row.pair} row={row} />)}
        </ul>
      )}

      <div className="bf-hairline-t px-4 py-3.5">
        <p className="text-2xs text-bf-muted">Coverage: seven major pairs and gold.</p>
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Covered pairs">
          {COVERAGE.map(pair => (
            <li key={pair} className="bf-pill bf-hairline px-2 py-[3px] text-[10.5px] tabular-nums text-bf-text-2">
              {fmtPair(pair)}
            </li>
          ))}
        </ul>
      </div>

      <p className="bf-hairline-t px-4 py-3 text-2xs leading-relaxed text-bf-muted">
        Conviction is scored 40–92 and measures how much of the evidence agrees. It is not a
        probability of profit.
      </p>
    </div>
  )
}
