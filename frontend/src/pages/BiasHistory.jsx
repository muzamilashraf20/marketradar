import { useMemo, useState } from 'react'
import { History, RefreshCw } from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import DirectionBadge from '../components/ui/DirectionBadge'
import StatusBadge from '../components/ui/StatusBadge'
import { FOCUS_RING, statusFromOutcome, statusStyle } from '../components/ui/styles'
import { fmtPair, fmtLevel } from '../components/ui/format'
import { useLiveData } from '../lib/useLiveData'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'
// The most /api/bias-calls returns in one response. It takes no offset, so there is no "load more".
const MAX = 60

/* Bias History: the engine's closed-call record.

   SOURCE. /api/bias-calls — the same record the landing page shows six of. It
   returns the newest closed calls, up to 60, with the total count; it has no
   offset or date parameter, so calls older than the newest 60 are not reachable
   from here. It carries pair, direction, invalidation level, close reason and
   the open/close times — not the conviction a call had (adding that needs a
   backend change and is listed for later).

   WHAT IS NOT HERE, ON PURPOSE. No win rate, no "correct / wrong", no accuracy
   summary. The engine records why a call closed — the level broke, conviction
   fell under the floor, or the regime turned — not whether it was right, and a
   record started in late August 2026 is far too short to rate anything. */
async function loadRecord() {
  const res = await fetch(`${API}/api/bias-calls?limit=${MAX}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const d = await res.json()
  if (!d.success || !Array.isArray(d.calls)) throw new Error(d.error || 'bias-calls failed')
  return { calls: d.calls, total: Number.isFinite(d.total) ? d.total : d.calls.length }
}

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'invalidated', label: 'Invalidated' },
  { id: 'closed', label: 'Closed' },
  { id: 'regime_flip', label: 'Regime flip' },
]

const when = iso => (iso
  ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—')
function held(openedAt, closedAt) {
  if (!openedAt || !closedAt) return null
  const mins = Math.max(0, Math.round((new Date(closedAt) - new Date(openedAt)) / 60000))
  const h = Math.floor(mins / 60), d = Math.floor(h / 24)
  return d > 0 ? `${d}d ${h % 24}h` : h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`
}

export default function BiasHistory() {
  const q = useLiveData(loadRecord, 15 * 60 * 1000)
  const [pair, setPair] = useState('all')
  const [status, setStatus] = useState('all')

  const calls = useMemo(() => q.data?.calls || [], [q.data])
  const pairs = useMemo(() => [...new Set(calls.map(c => c.pair))].sort(), [calls])
  const shown = calls.filter(c =>
    (pair === 'all' || c.pair === pair) && (status === 'all' || statusFromOutcome(c.outcome) === status))

  return (
    <DashboardLayout title="Bias History" subtitle="Every closed call and why it closed">
      <div className="max-w-5xl space-y-5">

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[13px] text-bf-text-2">
            Pair
            <select
              value={pair}
              onChange={e => setPair(e.target.value)}
              className={`h-10 rounded-lg border border-white/10 bg-bf-surface px-3 text-[13px] text-bf-text ${FOCUS_RING}`}
            >
              <option value="all">All pairs</option>
              {pairs.map(p => <option key={p} value={p}>{fmtPair(p)}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatus(f.id)}
                aria-pressed={status === f.id}
                className={`h-10 px-3.5 rounded-lg border text-[13px] transition-colors ${FOCUS_RING} ${
                  status === f.id ? 'border-bf-accent/40 bg-bf-accent/10 text-bf-text' : 'border-white/10 text-bf-text-2 hover:text-bf-text'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {q.status === 'ok' && (
          <p className="text-[12.5px] text-bf-muted">
            {q.data.total > calls.length
              ? `The ${calls.length} most recent of ${q.data.total} closed calls.`
              : `All ${calls.length} closed calls on record.`}
            {' '}Recording began in late August 2026. Times are in your local time.
          </p>
        )}

        {q.status === 'loading' && (
          <ul className="space-y-2" aria-label="Loading the record">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="h-[84px] rounded-card border border-white/[0.06] bg-white/[0.02] animate-pulse motion-reduce:animate-none" />
            ))}
          </ul>
        )}

        {q.status === 'error' && (
          <Card padding="lg" className="flex flex-col items-center gap-3 text-center" role="alert">
            <p className="text-sm text-bf-text-2">Couldn&rsquo;t load the record</p>
            <Button size="md" variant="secondary" onClick={q.retry} iconLeft={<RefreshCw size={13} aria-hidden="true" />}>Retry</Button>
          </Card>
        )}

        {q.status === 'ok' && shown.length === 0 && (
          <Card padding="lg" className="flex items-center gap-3">
            <History size={16} className="text-bf-muted shrink-0" aria-hidden="true" />
            <p className="text-sm text-bf-text-2">
              {calls.length === 0 ? 'No closed calls on record yet.' : 'No closed calls match these filters.'}
            </p>
          </Card>
        )}

        {q.status === 'ok' && shown.length > 0 && (
          <ul className="space-y-2">
            {shown.map((c, i) => <Row key={`${c.pair}-${c.closedAt}-${i}`} c={c} i={i} />)}
          </ul>
        )}
      </div>
    </DashboardLayout>
  )
}

/* One closed call. Focusable, like the landing record's cards: Tab lands on it,
   the ring shows, and a screen reader hears the pair, direction, status and
   close date (its label) followed by the close reason (its description). The
   reason is also printed on the row, so it is readable without hovering. */
function Row({ c, i }) {
  const status = statusFromOutcome(c.outcome)
  const s = statusStyle(status)
  const reasonId = `bh-reason-${i}`
  const level = fmtLevel(c.pair, c.invalidationLevel)
  const duration = held(c.openedAt, c.closedAt)
  return (
    <li
      tabIndex={0}
      aria-label={`${c.direction} ${fmtPair(c.pair)}, ${s.label}, closed ${when(c.closedAt)}`}
      aria-describedby={reasonId}
      className={`rounded-card border border-white/[0.06] bg-white/[0.02] px-4 py-3 outline-none ${FOCUS_RING}`}
    >
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto] sm:items-center">
        <div className="flex items-center gap-2.5 min-w-0">
          <DirectionBadge direction={c.direction} size="sm" />
          <span className="text-sm font-semibold text-bf-text tabular-nums">{fmtPair(c.pair)}</span>
          <StatusBadge status={status} size="sm" />
        </div>
        <p id={reasonId} className="text-[12.5px] leading-snug text-bf-text-2 min-w-0">{s.note}</p>
        <div className="text-[12px] text-bf-muted tabular-nums sm:text-right">
          {level && <p>Level <span className="text-bf-text-2">{level}</span></p>}
          <p>
            {when(c.openedAt)} → {when(c.closedAt)}
            {duration && <span className="text-bf-muted"> · {duration}</span>}
          </p>
        </div>
      </div>
    </li>
  )
}
