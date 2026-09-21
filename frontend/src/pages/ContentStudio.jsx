/* Content Studio — the admin's view of the social queue.
 *
 * Everything here is a thin shell over routes that already exist: the same approve/skip the Telegram
 * buttons call, the same guardrails on save. Nothing on this page can publish; Approve only marks a
 * row approved, and the publisher still decides whether anything goes out.
 *
 * Tailwind class strings are written out in full per variant — interpolated names get purged. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import {
  Megaphone, Loader2, RefreshCw, Check, SkipForward, Save, RotateCcw,
  ExternalLink, ChevronDown, ChevronRight, AlertTriangle, Info, Image as ImageIcon,
} from 'lucide-react'
import DashboardLayout from '../components/layout/DashboardLayout'
import { authedFetch } from '../lib/authFetch'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'
// Per-platform character limits for the live counter.
const LIMITS = { x: 260, linkedin: 1300 }
const PLATFORM_LABEL = { x: 'X', linkedin: 'LinkedIn' }
const PLATFORM_STYLES = {
  x: 'bg-white/5 text-slate-200 border-white/15',
  linkedin: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
}
const POLL_MS = 30000

const CONTENT_TYPES = [
  'bias_card', 'event_preview', 'news_reaction', 'weekly_scorecard',
  'macro_insight', 'trader_pain', 'contrarian', 'build_log',
]

const STATUS_STYLES = {
  draft: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  approved: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  publishing: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  published: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  failed: 'bg-red-500/15 text-red-300 border-red-500/30',
  skipped: 'bg-white/5 text-slate-500 border-white/10',
}

const fmtTime = iso => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const fmtDay = iso => new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

function StatusBadge({ status }) {
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_STYLES[status] || STATUS_STYLES.skipped}`}>
      {status}
    </span>
  )
}

function FlagBadges({ flags }) {
  if (!flags?.length) return <span className="text-[11px] text-emerald-400/80">no flags</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((f, i) => (
        <span
          key={i}
          title={f.msg}
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
            f.level === 'hard'
              ? 'bg-red-500/15 text-red-300 border-red-500/30'
              : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
          }`}
        >
          {f.level === 'hard' ? '⛔' : '⚠'} {f.code}
        </span>
      ))}
    </div>
  )
}

function FactsBlock({ sourceRef }) {
  const [open, setOpen] = useState(false)
  const facts = sourceRef?.facts
  if (!facts || !Object.keys(facts).length) return null
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        FACTS it was written from
      </button>
      {open && (
        <pre className="mt-2 p-3 rounded-lg bg-[#030712] border border-white/10 text-[11px] leading-relaxed text-slate-400 overflow-x-auto whitespace-pre-wrap break-words">
          {JSON.stringify(facts, null, 2)}
        </pre>
      )}
    </div>
  )
}

function QueueRow({ row, highlight, onChanged, registerRef }) {
  const [text, setText] = useState(row.text || '')
  const [flags, setFlags] = useState(row.source_ref?.chosen?.flags || [])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => { setText(row.text || '') }, [row.text])

  const isDraft = row.status === 'draft'
  const hardFlags = flags.filter(f => f.level === 'hard')
  const limit = LIMITS[row.platform] || null
  const overLimit = !!limit && text.length > limit
  const dirty = text !== (row.text || '')

  const call = async (path, init, label) => {
    setBusy(label); setError(''); setNote('')
    try {
      const res = await authedFetch(`${API_BASE}/api/admin/social/queue/${row.id}${path}`, init)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || `${label} failed`)
        if (data.flags) setFlags(data.flags)
        return null
      }
      return data
    } catch (e) {
      setError(e?.message || 'Network error')
      return null
    } finally { setBusy('') }
  }

  const save = async () => {
    const data = await call('', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    }, 'save')
    if (!data) return
    setFlags(data.flags || [])
    setNote(data.flags?.some(f => f.level === 'hard') ? '' : 'Saved')
    onChanged(data.row)
  }
  const approve = async () => { const d = await call('/approve', { method: 'POST' }, 'approve'); if (d) onChanged(d.row) }
  const skip = async () => { const d = await call('/skip', { method: 'POST' }, 'skip'); if (d) onChanged(d.row) }
  const retry = async () => { const d = await call('/retry', { method: 'POST' }, 'retry'); if (d) onChanged(d.row) }

  return (
    <div
      ref={el => registerRef(row.id, el)}
      className={`rounded-xl border p-4 transition-colors ${
        highlight ? 'bg-cyan-500/[0.06] border-cyan-500/40' : 'bg-[#020617] border-white/10'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${PLATFORM_STYLES[row.platform] || PLATFORM_STYLES.x}`}>
          {PLATFORM_LABEL[row.platform] || row.platform}
        </span>
        <StatusBadge status={row.status} />
        <span className="text-sm font-semibold text-white">{row.content_type}</span>
        {row.pillar && <span className="text-[11px] text-slate-500">· {row.pillar}</span>}
        <span className="text-[11px] text-slate-600">· {fmtTime(row.created_at)}</span>
        <span className="text-[11px] text-slate-600">· #{row.id}</span>
        {row.regen_count > 0 && <span className="text-[11px] text-slate-600">· regen {row.regen_count}</span>}
      </div>

      {row.image_url && (
        <a href={row.image_url} target="_blank" rel="noreferrer" className="block mb-3">
          <img
            src={row.image_url}
            alt="card preview"
            loading="lazy"
            className="w-32 rounded-lg border border-white/10 hover:border-cyan-500/40 transition-colors"
          />
        </a>
      )}

      {isDraft ? (
        <>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={row.platform === 'linkedin' ? 12 : 4}
            className="w-full px-3 py-2.5 rounded-lg bg-[#030712] border border-white/10 text-sm text-slate-200 leading-relaxed focus:outline-none focus:border-cyan-500/50 resize-y"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className={`text-[11px] font-semibold ${overLimit ? 'text-red-400' : 'text-slate-500'}`}>
              {text.length}{limit ? ` / ${limit}` : ''} chars{overLimit ? ` — over the ${PLATFORM_LABEL[row.platform] || ''} limit` : ''}
            </span>
            {dirty && <span className="text-[11px] text-amber-400">unsaved</span>}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{row.text}</p>
      )}

      <div className="mt-3"><FlagBadges flags={flags} /></div>

      {hardFlags.length > 0 && isDraft && (
        <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle size={13} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-red-300 leading-relaxed">
            Approve will refuse while this stands: {hardFlags.map(f => f.msg).join(' · ')}
          </p>
        </div>
      )}

      {row.error && (
        <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle size={13} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-red-300 leading-relaxed break-words">{row.error}</p>
        </div>
      )}

      <FactsBlock sourceRef={row.source_ref} />

      {(error || note) && (
        <p className={`mt-2 text-[11px] ${error ? 'text-red-400' : 'text-emerald-400'}`}>{error || note}</p>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {isDraft && (
          <>
            <button
              onClick={save}
              disabled={!!busy || !dirty}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold text-slate-300 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
            </button>
            <button
              onClick={approve}
              disabled={!!busy || dirty}
              title={dirty ? 'Save your edit first' : ''}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {busy === 'approve' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Approve
            </button>
            <button
              onClick={skip}
              disabled={!!busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold text-slate-400 hover:bg-white/10 disabled:opacity-40 transition-colors"
            >
              {busy === 'skip' ? <Loader2 size={13} className="animate-spin" /> : <SkipForward size={13} />} Skip
            </button>
          </>
        )}
        {row.status === 'failed' && (
          <button
            onClick={retry}
            disabled={!!busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 disabled:opacity-40 transition-colors"
          >
            {busy === 'retry' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Retry
          </button>
        )}
        {row.status === 'published' && row.external_id && (
          <a
            href={row.platform === 'linkedin' ? `https://www.linkedin.com/feed/update/${row.external_id}` : `https://x.com/MuzamilAshraf_1/status/${row.external_id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 transition-colors"
          >
            <ExternalLink size={13} /> View on {PLATFORM_LABEL[row.platform] || 'X'}
          </a>
        )}
      </div>
    </div>
  )
}

export default function ContentStudio() {
  const [params] = useSearchParams()
  const focusId = Number(params.get('draft')) || null

  const [who, setWho] = useState(null)          // null = still checking
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [contentType, setContentType] = useState('bias_card')
  const [platform, setPlatform] = useState('x')
  const [notes, setNotes] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState(null)    // { kind: 'info' | 'error', text }
  const rowRefs = useRef({})
  const scrolledTo = useRef(false)

  const registerRef = useCallback((id, el) => { rowRefs.current[id] = el }, [])

  useEffect(() => {
    let alive = true
    authedFetch(`${API_BASE}/api/admin/whoami`)
      .then(r => r.json())
      .then(d => { if (alive) setWho(d) })
      .catch(() => { if (alive) setWho({ admin: false }) })
    return () => { alive = false }
  }, [])

  const loadQueue = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await authedFetch(`${API_BASE}/api/admin/social/queue?days=14`)
      const data = await res.json()
      if (res.ok) setRows(data.rows || [])
    } catch { /* keep what is on screen */ } finally {
      setRefreshing(false); setLoading(false)
    }
  }, [])

  useEffect(() => { if (who?.admin) loadQueue() }, [who, loadQueue])

  // Poll only while the tab is visible — a background tab does not need to keep the queue warm.
  useEffect(() => {
    if (!who?.admin) return
    let timer = null
    const start = () => { stop(); timer = setInterval(loadQueue, POLL_MS) }
    const stop = () => { if (timer) { clearInterval(timer); timer = null } }
    const onVisibility = () => { if (document.hidden) stop(); else { loadQueue(); start() } }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [who, loadQueue])

  // Scroll to the row Telegram linked to, once, after it first renders.
  useEffect(() => {
    if (!focusId || scrolledTo.current || !rows.length) return
    const el = rowRefs.current[focusId]
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); scrolledTo.current = true }
  }, [rows, focusId])

  const onChanged = useCallback(updated => {
    setRows(rs => rs.map(r => (r.id === updated.id ? { ...r, ...updated } : r)))
  }, [])

  const generate = async () => {
    setGenerating(true); setGenMsg(null)
    try {
      const res = await authedFetch(`${API_BASE}/api/admin/social/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType, notes, platform }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setGenMsg({ kind: 'info', text: `Drafted #${data.row?.id} — check Telegram too.` })
        setNotes('')
        loadQueue()
      } else {
        // A refusal here is usually the system working: no events today, everything blocked by the
        // guardrails. Shown as information, not as a failure.
        setGenMsg({ kind: res.status >= 500 ? 'error' : 'info', text: data.error || 'Could not generate a draft' })
      }
    } catch (e) {
      setGenMsg({ kind: 'error', text: e?.message || 'Network error' })
    } finally { setGenerating(false) }
  }

  const grouped = useMemo(() => {
    const out = []
    for (const row of rows) {
      const day = fmtDay(row.created_at)
      const last = out[out.length - 1]
      if (last && last.day === day) last.rows.push(row)
      else out.push({ day, rows: [row] })
    }
    return out
  }, [rows])

  if (who === null) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-32">
          <Loader2 size={20} className="animate-spin text-cyan-400" />
        </div>
      </DashboardLayout>
    )
  }
  if (!who.admin) return <Navigate to="/dashboard" replace />

  const autopilotOn = who.autopilot === 'on'
  // LinkedIn tokens are renewed by hand about every 60 days. null = LINKEDIN_TOKEN_EXPIRES not set.
  const liDays = who.linkedinTokenDaysLeft
  const liExpired = who.linkedinTokenExpired === true
  const liWarn = liExpired || (typeof liDays === 'number' && liDays <= 10)

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        <div className="flex flex-wrap items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center shrink-0">
            <Megaphone size={17} className="text-black" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-white tracking-tight">Content Studio</h1>
            <p className="text-[11px] text-slate-500">Drafts wait here until you approve them.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
              autopilotOn
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
            }`}>
              Autopilot {autopilotOn ? 'ON' : 'OFF'}
            </span>
            <span className="text-[11px] text-slate-500">
              X {who.dailyCap}/day · {who.minGapMin}min gap · LinkedIn {who.linkedinDailyCap ?? 1}/day
            </span>
            <button
              onClick={loadQueue}
              className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {liWarn && (
          <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border ${
            liExpired
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-amber-500/10 border-amber-500/30'
          }`}>
            <AlertTriangle size={15} className={`mt-0.5 shrink-0 ${liExpired ? 'text-red-400' : 'text-amber-400'}`} />
            <div>
              <p className={`text-sm font-semibold ${liExpired ? 'text-red-300' : 'text-amber-300'}`}>
                {liExpired
                  ? 'LinkedIn token has expired — LinkedIn posts will fail.'
                  : `LinkedIn token expires in ${liDays} day${liDays === 1 ? '' : 's'}.`}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Re-run the LinkedIn token script, then update LINKEDIN_ACCESS_TOKEN and LINKEDIN_TOKEN_EXPIRES on Railway.</p>
            </div>
          </div>
        )}

        <div className="rounded-xl bg-[#020617] border border-white/10 p-4">
          <h2 className="text-sm font-bold text-white mb-3">New draft</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value)}
              aria-label="Platform"
              className="px-3 py-2 rounded-lg bg-[#030712] border border-white/10 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="x">X</option>
              <option value="linkedin">LinkedIn</option>
            </select>
            <select
              value={contentType}
              onChange={e => setContentType(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[#030712] border border-white/10 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50"
            >
              {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes for the writer"
              className="flex-1 px-3 py-2 rounded-lg bg-[#030712] border border-white/10 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
            />
            <button
              onClick={generate}
              disabled={generating}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-sm font-semibold text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />}
              {generating ? 'Writing…' : 'Generate'}
            </button>
          </div>
          {genMsg && (
            <div className={`mt-3 flex items-start gap-2 px-3 py-2 rounded-lg border ${
              genMsg.kind === 'error'
                ? 'bg-red-500/10 border-red-500/20'
                : 'bg-white/5 border-white/10'
            }`}>
              {genMsg.kind === 'error'
                ? <AlertTriangle size={13} className="text-red-400 mt-0.5 shrink-0" />
                : <Info size={13} className="text-cyan-400 mt-0.5 shrink-0" />}
              <p className={`text-[11px] leading-relaxed ${genMsg.kind === 'error' ? 'text-red-300' : 'text-slate-300'}`}>
                {genMsg.text}
              </p>
            </div>
          )}
          {generating && <p className="mt-2 text-[11px] text-slate-500">Writing three variants and fact-checking them — this takes 10–20 seconds.</p>}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={18} className="animate-spin text-cyan-400" />
          </div>
        ) : !rows.length ? (
          <div className="rounded-xl bg-[#020617] border border-white/10 p-10 text-center">
            <ImageIcon size={22} className="mx-auto text-slate-700 mb-3" />
            <p className="text-sm text-slate-400">Nothing in the queue from the last 14 days.</p>
            <p className="text-[11px] text-slate-600 mt-1">Drafts appear here automatically, or generate one above.</p>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.day} className="space-y-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{group.day}</h3>
              {group.rows.map(row => (
                <QueueRow
                  key={row.id}
                  row={row}
                  highlight={row.id === focusId}
                  onChanged={onChanged}
                  registerRef={registerRef}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </DashboardLayout>
  )
}
