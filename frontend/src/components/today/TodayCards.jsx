import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Compass, CalendarDays, Newspaper, ShieldCheck, Clock3, History, Radar, RefreshCw, Target,
} from 'lucide-react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import DirectionBadge from '../ui/DirectionBadge'
import StatusBadge from '../ui/StatusBadge'
import ConvictionMeter from '../ui/ConvictionMeter'
import LevelRow from '../ui/LevelRow'
import { CHIP_BASE, CHIP_SIZE, TIMING_STYLE, FOCUS_RING, gradeStyle, statusFromOutcome, statusStyle } from '../ui/styles'
import { fmtPair } from '../ui/format'
import { openSessions, nextOpening, closesAt, isForexClosed } from '../../lib/sessions'
import { topMover } from '../../lib/movers'
import { ago, countdown, localDayTime, localTime, pairCurrencies } from './todayData'

/* ── The card shell ──────────────────────────────────────────────────────────
   Every Today card is this: a title, a link to the page it summarises, and a
   body that is the skeleton, the error, or the content. The body's minimum
   height is fixed per card and shared by all three states, and the content
   clamps its text, so nothing on the page moves when data arrives (CLS 0). */
export function TodayCard({ id, title, icon: Icon, to, linkLabel, status, onRetry, body, skeleton, className = '', children }) {
  const headingId = `today-${id}`
  return (
    <Card as="section" padding="none" aria-labelledby={headingId} aria-busy={status === 'loading' || undefined} className={`flex flex-col min-w-0 ${className}`}>
      <header className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-white/[0.06]">
        <h2 id={headingId} className="flex items-center gap-2 text-3xs font-semibold uppercase tracking-wider text-bf-muted">
          {Icon && <Icon size={14} className="text-bf-accent" aria-hidden="true" />}
          {title}
        </h2>
        {to && (
          <Link to={to} className={`inline-flex items-center gap-1 py-3 -my-3 text-[12px] text-bf-text-2 hover:text-bf-text rounded ${FOCUS_RING}`}>
            {linkLabel}
            <ArrowRight size={12} aria-hidden="true" />
          </Link>
        )}
      </header>
      <div className={`flex-1 flex flex-col px-4 sm:px-5 py-4 ${body}`}>
        {/* Keyed by state: the skeleton, the error and the content are different elements, so
            swapping one for another is not read as anything moving. The body's min-height (per
            card, the same in all three states) is what keeps the card itself still. */}
        <div key={status} className="flex-1 flex flex-col">
          {status === 'loading' ? skeleton
            : status === 'error' ? <CardError onRetry={onRetry} />
            : children}
        </div>
      </div>
    </Card>
  )
}

function CardError({ onRetry }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center" role="alert">
      <p className="text-sm text-bf-text-2">Couldn&rsquo;t load</p>
      <Button size="md" variant="secondary" onClick={onRetry} iconLeft={<RefreshCw size={13} aria-hidden="true" />}>
        Retry
      </Button>
    </div>
  )
}

const Bone = ({ className = '' }) => (
  <div className={`rounded bg-white/[0.06] animate-pulse motion-reduce:animate-none ${className}`} aria-hidden="true" />
)
const Rows = ({ n, h }) => (
  <div className="space-y-2.5" aria-hidden="true">
    {Array.from({ length: n }, (_, i) => <Bone key={i} className={h} />)}
  </div>
)

/* ── 1. Headline bias ─────────────────────────────────────────────────────── */
export function HeadlineCard({ q, now, className }) {
  const b = q.data
  const marketClosed = !!b && (b.marketClosed || isForexClosed(new Date(now)))
  const ageMins = b?.generatedAt ? (now - new Date(b.generatedAt).getTime()) / 60000 : null
  // Stale on the backend's own flag or its threshold — never on a closed market, which is idle on purpose.
  const stale = !!b && !marketClosed && (b.stale || (ageMins != null && ageMins >= b.staleAfterMins))
  const side = b?.direction === 'SELL' ? 'above' : 'below'

  return (
    <TodayCard
      id="bias" title="Today’s headline bias" icon={Target} to="/bias" linkLabel="Full read"
      status={q.status} onRetry={q.retry} className={className}
      body="min-h-[420px] sm:min-h-[300px] md:min-h-[292px] lg:min-h-[236px]"
      skeleton={
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]" aria-hidden="true">
          <div className="space-y-4"><Bone className="h-7 w-48" /><Bone className="h-10 w-full" /><Bone className="h-14 w-full" /></div>
          <div className="space-y-3"><Bone className="h-20 w-full" /><Bone className="h-4 w-40" /></div>
        </div>
      }
    >
      {b && !b.has ? (
        <div className="flex-1 flex flex-col justify-center gap-2">
          <p className="text-base font-semibold text-bf-text">No pair clears the bar right now.</p>
          <p className="text-sm text-bf-text-2 max-w-prose">
            {b.reason || 'When the macro evidence is not strong enough, the engine holds rather than publishing a read it does not have.'}
          </p>
          {marketClosed && <StatusBadge status="market_closed" size="sm" className="self-start" />}
        </div>
      ) : b && (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xl font-bold tracking-tight text-bf-text tabular-nums">{fmtPair(b.pair)}</span>
              <DirectionBadge direction={b.direction} variant="text" size="lg" />
              {b.entryTiming && (
                <span className={`${CHIP_BASE} ${CHIP_SIZE.sm} ${TIMING_STYLE[b.entryTiming] || TIMING_STYLE.FRESH}`}>{b.entryTiming}</span>
              )}
              {marketClosed && <StatusBadge status="market_closed" size="sm" describe />}
              {stale && <StatusBadge status="stale" size="sm" describe />}
            </div>
            <ConvictionMeter value={b.confidence} grade={b.grade} size="md" scale className="mt-4 max-w-md" />
            {b.thesis && <p className="mt-4 text-sm leading-relaxed text-bf-text-2 line-clamp-3">{b.thesis}</p>}
          </div>
          <div className="min-w-0 flex flex-col gap-3">
            <Card tone="invalidation" padding="sm">
              <LevelRow pair={b.pair} value={b.invalidation} note={b.invalidation != null ? `Wrong ${side} this level.` : undefined} />
            </Card>
            {b.generatedAt && (
              <p className="text-[12px] text-bf-muted tabular-nums">
                Generated {ago(b.generatedAt, now)} ({localTime(b.generatedAt)})
              </p>
            )}
          </div>
        </div>
      )}
    </TodayCard>
  )
}

/* ── 2. Compass ───────────────────────────────────────────────────────────── */
export function CompassCard({ q }) {
  const pairs = q.data?.pairs || []
  return (
    <TodayCard
      id="compass" title="Compass" icon={Compass} to="/bias" linkLabel="All pairs"
      status={q.status} onRetry={q.retry} body="min-h-[384px]"
      skeleton={<Rows n={8} h="h-[31px]" />}
    >
      <ul className="divide-y divide-white/[0.05]" aria-label="Seven major pairs and gold">
        {pairs.map(p => {
          const scored = p.direction !== 'FLAT' && typeof p.confidence === 'number'
          return (
            <li key={p.pair}>
              <Link
                to="/bias"
                className={`grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 h-[40px] -mx-2 px-2 rounded-md hover:bg-white/[0.03] ${FOCUS_RING}`}
              >
                <span className="text-sm font-semibold text-bf-text tabular-nums">{fmtPair(p.pair)}</span>
                <DirectionBadge direction={p.direction === 'BUY' || p.direction === 'SELL' ? p.direction : 'FLAT'} size="sm" className="justify-self-start" />
                {scored && p.grade ? (
                  <span className="flex items-center gap-2">
                    <span className="text-[12px] text-bf-muted tabular-nums" aria-label={`Conviction ${p.confidence}`}>{p.confidence}</span>
                    <span className={`${CHIP_BASE} ${CHIP_SIZE.sm} ${gradeStyle(p.grade).chip}`} aria-label={`Grade ${p.grade}`}>{p.grade}</span>
                  </span>
                ) : <span className="text-[12px] text-bf-muted">—</span>}
              </Link>
            </li>
          )
        })}
      </ul>
      {q.data?.marketClosed && <p className="mt-3 text-[12px] text-bf-muted">Market closed: the last scores before the weekend.</p>}
    </TodayCard>
  )
}

/* ── 3. Next high-impact events ───────────────────────────────────────────── */
export function EventsCard({ q, now, pair }) {
  const mine = pairCurrencies(pair)
  const upcoming = (q.data || []).filter(e => new Date(e.date).getTime() >= now).slice(0, 3)
  return (
    <TodayCard
      id="events" title="Next high-impact events" icon={CalendarDays} to="/calendar" linkLabel="Calendar"
      status={q.status} onRetry={q.retry} body="min-h-[216px]"
      skeleton={<Rows n={3} h="h-[54px]" />}
    >
      {upcoming.length === 0 ? (
        <p className="flex-1 flex items-center text-sm text-bf-text-2">No high-impact events left in the calendar feed.</p>
      ) : (
        <ul className="space-y-2">
          {upcoming.map(e => {
            const touches = mine.includes(e.currency)
            return (
              <li
                key={`${e.date}-${e.currency}-${e.title}`}
                className={`grid grid-cols-[1fr_auto] items-center gap-3 h-[54px] px-3 rounded-lg border ${
                  touches ? 'border-bf-accent/40 bg-bf-accent/[0.06]' : 'border-white/[0.06] bg-white/[0.02]'
                }`}
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[13px] text-bf-text">
                    <span className="bf-mono text-[11px] font-bold text-bf-accent-soft shrink-0">{e.currency}</span>
                    <span className="truncate">{e.title}</span>
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-bf-muted tabular-nums truncate">
                    {localDayTime(e.date, now)}{touches && <span className="text-bf-accent-soft"> · touches {fmtPair(pair)}</span>}
                  </p>
                </div>
                <span className="text-[12px] font-semibold text-bf-text-2 tabular-nums whitespace-nowrap">{countdown(e.date, now)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </TodayCard>
  )
}

/* ── 4. Top scored news ───────────────────────────────────────────────────── */
export function NewsCard({ q }) {
  const top = (q.data || []).slice(0, 3)
  return (
    <TodayCard
      id="news" title="Top scored news" icon={Newspaper} to="/news" linkLabel="Live news"
      status={q.status} onRetry={q.retry} body="min-h-[272px]"
      skeleton={<Rows n={3} h="h-[72px]" />}
    >
      {top.length === 0 ? (
        <p className="flex-1 flex items-center text-sm text-bf-text-2">No scored headlines yet.</p>
      ) : (
        <ul className="space-y-3">
          {top.map(a => (
            <li key={a.url || a.title} className="h-[72px]">
              <p className="flex items-center gap-2 text-[11px] text-bf-muted">
                {typeof a.impact === 'number' && (
                  <span className="bf-mono font-bold text-bf-text-2" aria-label={`Impact ${a.impact} of 10`}>Impact {a.impact}</span>
                )}
                {a.source && <span className="truncate">· {a.source}</span>}
              </p>
              <p className="mt-0.5 text-[13.5px] font-medium text-bf-text line-clamp-1">{a.title}</p>
              {(a.oneliner || a.summary) && (
                <p className="mt-0.5 text-[12.5px] leading-snug text-bf-text-2 line-clamp-1">{a.oneliner || a.summary}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </TodayCard>
  )
}

/* ── 5. Prop firm status ──────────────────────────────────────────────────── */
// The figures Prop Firm Mode saves on this device; the maths is PropFirm.jsx's own.
const PROP_KEY = 'biasforge_propfirm_settings'
function readProp() {
  try {
    const s = JSON.parse(localStorage.getItem(PROP_KEY) || 'null')
    const account = Number(s?.accountSize), dailyPct = Number(s?.dailyDrawdownPercent), totalPct = Number(s?.totalDrawdownPercent)
    if (!(account > 0) || !(dailyPct > 0) || !(totalPct > 0)) return null
    const maxDaily = (account * dailyPct) / 100
    const maxTotal = (account * totalPct) / 100
    const dailyUsed = Math.abs(Math.min(Number(s.currentDailyPnl) || 0, 0))
    const totalUsed = Math.abs(Math.min(Number(s.currentTotalPnl) || 0, 0))
    return {
      account,
      rows: [
        { label: 'Daily drawdown', used: dailyUsed, max: maxDaily },
        { label: 'Total drawdown', used: totalUsed, max: maxTotal },
      ],
    }
  } catch {
    return null
  }
}
const money = n => `$${Math.round(n).toLocaleString('en-US')}`
// Under 50% of a limit is room, 50–80% caution, over 80% danger — the zones Prop Firm Mode uses.
const zone = pct => (pct > 80 ? { bar: 'bg-bf-bear', text: 'text-bf-bear-soft' } : pct >= 50 ? { bar: 'bg-bf-warn', text: 'text-bf-warn-soft' } : { bar: 'bg-bf-bull', text: 'text-bf-bull-soft' })

export function PropFirmCard() {
  const [prop] = useState(readProp)
  return (
    <TodayCard id="prop" title="Prop firm status" icon={ShieldCheck} to="/prop-firm" linkLabel="Prop Firm Mode" status="ok" body="min-h-[164px]">
      {!prop ? (
        <div className="flex-1 flex flex-col items-start justify-center gap-3">
          <p className="text-sm text-bf-text-2 max-w-sm">
            Track daily and total drawdown against your firm&rsquo;s limits, and check a trade before you take it.
          </p>
          <Button size="md" variant="secondary" href="/prop-firm">Set up Prop Firm Mode</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {prop.rows.map(r => {
            const pct = Math.min(100, (r.used / r.max) * 100)
            const z = zone(pct)
            return (
              <div key={r.label}>
                <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className="text-bf-text-2">{r.label}</span>
                  <span className="tabular-nums text-bf-muted">
                    <span className={`font-semibold ${z.text}`}>{money(r.used)}</span> of {money(r.max)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden" role="img" aria-label={`${r.label}: ${Math.round(pct)} percent of the limit used`}>
                  <div className={`h-full rounded-full ${z.bar}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
          <p className="text-[11.5px] text-bf-muted">{money(prop.account)} account · figures saved in Prop Firm Mode on this device</p>
        </div>
      )}
    </TodayCard>
  )
}

/* ── 6. Sessions now ──────────────────────────────────────────────────────── */
export function SessionsStrip({ now, className = '' }) {
  const at = new Date(now)
  const closed = isForexClosed(at)
  const open = closed ? [] : openSessions(at)
  const next = nextOpening(at)
  return (
    <Card as="section" padding="none" aria-label="Sessions now" className={`px-4 sm:px-5 py-3.5 min-h-[64px] flex flex-wrap items-center gap-x-5 gap-y-2 ${className}`}>
      <span className="flex items-center gap-2 text-3xs font-semibold uppercase tracking-wider text-bf-muted">
        <Clock3 size={14} className="text-bf-accent" aria-hidden="true" />
        Sessions now
      </span>
      <span className="flex flex-wrap items-center gap-2 text-[13px]">
        {closed ? (
          <span className="text-bf-text-2">Forex market closed for the weekend</span>
        ) : open.length === 0 ? (
          <span className="text-bf-text-2">Between sessions</span>
        ) : open.map(s => {
          const end = closesAt(s, at)
          return (
            <span key={s.id} className={`${CHIP_BASE} ${CHIP_SIZE.sm} bg-bf-accent/10 text-bf-accent-soft border-bf-accent/25`}>
              <span className="w-1.5 h-1.5 rounded-full bg-bf-accent" aria-hidden="true" />
              {s.name}{end ? ` · until ${localTime(end)}` : ''}
            </span>
          )
        })}
      </span>
      {next && (
        <span className="text-[12.5px] text-bf-text-2 tabular-nums sm:ml-auto">
          Next: {next.marketReopens ? 'market reopens' : `${next.name} opens`} {localDayTime(next.at, now)} · {countdown(next.at, now)}
        </span>
      )}
    </Card>
  )
}

/* ── 7. Latest closed calls ───────────────────────────────────────────────── */
const shortDate = iso => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '')
export function ClosedCallsCard({ q }) {
  const calls = q.data || []
  return (
    <TodayCard
      id="calls" title="Latest closed calls" icon={History} to="/bias/history" linkLabel="Bias History"
      status={q.status} onRetry={q.retry} body="min-h-[216px]"
      skeleton={<Rows n={3} h="h-[54px]" />}
    >
      {calls.length === 0 ? (
        <p className="flex-1 flex items-center text-sm text-bf-text-2">No closed calls on record yet.</p>
      ) : (
        <ul className="space-y-2">
          {calls.map(c => {
            const status = statusFromOutcome(c.outcome)
            return (
              <li key={`${c.pair}-${c.closedAt}`} className="h-[54px] px-3 rounded-lg border border-white/[0.06] bg-white/[0.02] flex flex-col justify-center">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <DirectionBadge direction={c.direction} size="sm" />
                    <span className="text-[13px] font-semibold text-bf-text tabular-nums">{fmtPair(c.pair)}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={status} size="sm" />
                    <span className="text-[11.5px] text-bf-muted tabular-nums">{shortDate(c.closedAt)}</span>
                  </span>
                </div>
                <p className="mt-0.5 text-[11.5px] text-bf-muted truncate">{statusStyle(status).note}</p>
              </li>
            )
          })}
        </ul>
      )}
    </TodayCard>
  )
}

/* ── 8. MarketMovers (from the news already loaded for card 4) ────────────── */
export function MoversCard({ q }) {
  const m = topMover(q.data)
  return (
    <TodayCard
      id="movers" title="MarketMovers" icon={Radar} to="/market-movers" linkLabel="Radar"
      status={q.status} onRetry={q.retry} body="min-h-[216px]"
      skeleton={<div className="space-y-3"><Bone className="h-5 w-40" /><Bone className="h-12 w-full" /><Bone className="h-6 w-56" /></div>}
    >
      {!m ? (
        <p className="flex-1 flex items-center text-sm text-bf-text-2">No market mover in today&rsquo;s top headlines.</p>
      ) : (
        <div>
          <p className="text-sm font-semibold text-bf-text">{m.name}</p>
          <p className="mt-1.5 text-[13px] leading-snug text-bf-text-2 line-clamp-2">{m.article.title}</p>
          <p className="mt-3 flex flex-wrap gap-1.5" aria-label="Assets it moves">
            {m.assets.map(x => (
              <span key={x} className={`${CHIP_BASE} ${CHIP_SIZE.sm} bg-white/[0.03] text-bf-text-2 border-white/10`}>{x}</span>
            ))}
          </p>
        </div>
      )}
    </TodayCard>
  )
}
