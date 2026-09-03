import { useEffect, useRef, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const CACHE_KEY = 'bf_landing_compass'
/* How many biases get a card in the hero.

   Two, not three. At the hero's panel width (~520px) three cards land at 160px
   each — legible, but too narrow to actually read the reasoning, which is the
   thing that distinguishes a bias from a signal. Two land at ~243px, the same
   width the dashboard uses, so the full card treatment stays intact. Coverage
   is communicated by the chip row underneath, not by cramming in more cards. */
export const CARDS = 2

/* Grade C and above. D is excluded and nothing else is.

   The B+ floor belongs to auto-posting on X and Telegram, where a weak public
   call is a permanent mark on the track record. This panel is a window into the
   dashboard rather than a promotion, and at a B floor it sat empty ~60% of the
   time — an empty hero does more damage than a C does.

   The same filter runs at build time in scripts/generate-blog.mjs, so the
   static HTML and the client agree on what is publishable. */
const PUBLISHABLE_GRADES = new Set(['A', 'A-', 'B', 'C'])
export const isPublishable = row =>
  row && row.confidence != null && PUBLISHABLE_GRADES.has(row.grade)

/* Bias values baked into the page at build time. Present on the prerendered
   document, absent on a client-only render. */
export const baked = () =>
  (typeof globalThis !== 'undefined' ? globalThis.__BF_COMPASS__ : null) || null

/* The thesis is model-generated prose. On the dashboard that is fine — it is the
   product, and the trader wants the engine's actual words. On the LANDING page
   it is marketing copy, and the copy rules are absolute: no "signals", no
   guarantee language, no claim about odds or profit.

   Nobody reviews these strings before they are published, and the engine has
   already produced "US macro signals too mixed" unprompted. So a thesis that
   trips any banned term is simply not quoted here — the card keeps its
   direction, conviction and invalidation level, which are the substance. We
   never rewrite the engine's reasoning to make it publishable. */
const BANNED_IN_COPY =
  /\bsignals?\b|\bsetups?\b|\bentry\b|\bentries\b|\bstop[- ]?loss\b|\btake[- ]?profit\b|\bwin rate\b|\bguarantee\w*|\bproven\b|\brisk[- ]free\b|\bodds\b|\bprobabilit\w+/i

/* The opening of the reasoning, never the whole read.

   line-clamp would have hidden the rest in CSS while leaving every word in the
   DOM and in the static HTML, which is not withholding it — it is decorating it.
   The cut happens here, at the first sentence boundary, so what the browser
   never receives cannot be read out of the source.

   One sentence is enough to show that the read is specific and that it is
   written rather than generated from a template, which is what this preview is
   for. The rest is the product. */
const PREVIEW_CHARS = 190

export const previewThesis = t => {
  if (!t) return null
  const clean = String(t).trim()
  if (clean.length <= PREVIEW_CHARS) return clean
  const cut = clean.slice(0, PREVIEW_CHARS)
  // Prefer a sentence end, fall back to a word boundary; never cut mid-word.
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '))
  if (stop > PREVIEW_CHARS * 0.5) return cut.slice(0, stop + 1)
  const space = cut.lastIndexOf(' ')
  return (space > 0 ? cut.slice(0, space) : cut).replace(/[,;:]$/, '') + '…'
}

export const publishableThesis = t =>
  t && !BANNED_IN_COPY.test(t) ? previewThesis(t) : null


/* Every publishable bias, highest conviction first. Deliberately NOT capped
   here: the header states how many biases are actually live, and capping at the
   card count would make it under-report. The hero takes the top CARDS of these
   and the rest fall into the chip row. */
export function selectRows(pairs) {
  return (pairs || [])
    .filter(isPublishable)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
}

/* Owned by a hook rather than by the card, because the hero has to know whether
   there is anything to show before it decides on a one- or two-column layout. */
export function useCompassData() {
  const [data, setData] = useState(baked)
  const [ready, setReady] = useState(() => !!baked())
  const [changedPairs, setChangedPairs] = useState([])
  const prev = useRef(baked())

  useEffect(() => {
    let alive = true

    // Anything cached from a previous visit paints instead, so a slow or failed
    // request never leaves the hero looking broken, empty or errored.
    const paintFromCache = () => {
      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
        if (!cached || !alive) return
        prev.current = cached
        setData(cached)
        setReady(true)
      } catch { /* private mode — leave the skeleton up */ }
    }

    fetch(`${API_BASE}/api/macro-compass`)
      .then(r => r.json())
      .then(json => {
        if (!alive) return
        if (!json?.success || !Array.isArray(json.pairs)) throw new Error('empty')

        const rows = selectRows(
          json.pairs.map(p => ({
            pair: p.pair,
            direction: p.direction,
            confidence: p.direction === 'FLAT' ? null : p.confidence,
            grade: p.direction === 'FLAT' ? null : p.grade,
            entryTiming: p.entryTiming,
            thesis: publishableThesis(p.thesis),
            // Whether the bias HAS a level, never the level itself. That number
            // is the product: it is the one thing a signal service does not
            // publish and the whole page is built on saying we do. Giving it
            // away live, to anyone, with no account, leaves nothing to buy.
            // Closed calls keep their exact levels in the record below — those
            // are proof, not something anyone can still trade.
            // The server sends this and withholds the level from callers it
            // cannot identify. The fallback derives it for a signed-in caller,
            // who still gets the number.
            hasInvalidation: p.hasInvalidation ?? p.invalidationLevel != null,
            isHeadline: p.isHeadline,
            updatedAt: p.updatedAt,
          }))
        )

        // Age is the newest ROW write across every live bias, not the response
        // timestamp — the latter is stamped per request and would read as fresh
        // even against a dead engine. Taken before the grade filter, so a run
        // that produced only weak reads still counts as the engine running.
        const lastRun =
          json.pairs.map(p => p.updatedAt).filter(Boolean).sort().pop() || null

        // Which pairs actually moved since whatever is on screen. Drives the
        // brief row flash, so a returning visitor can see the number is
        // genuinely changing rather than taking our word for it.
        const before = new Map((prev.current?.rows || []).map(r => [r.pair, r.confidence]))
        const changed = rows
          .filter(r => before.has(r.pair) && before.get(r.pair) !== r.confidence)
          .map(r => r.pair)

        // Names only, never a direction or a grade. Every pair that did not get a
        // card lands here — including publishable ones that simply were not in the
        // top two — so the chip row always accounts for the rest of the board.
        const carded = new Set(rows.slice(0, CARDS).map(r => r.pair))
        const alsoScoring = json.pairs.map(p => p.pair).filter(p => !carded.has(p))

        const next = { rows, activeCount: rows.length, scanned: json.pairs.length, alsoScoring, lastRun }
        prev.current = next
        setData(next)
        setChangedPairs(changed)
        setReady(true)
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)) } catch { /* private mode */ }
      })
      .catch(() => { if (alive) paintFromCache() })

    return () => { alive = false }
  }, [])

  const rows = data?.rows || []
  return {
    rows,
    lastRun: data?.lastRun || null,
    // How many pairs the engine scored this run, published or not. Lets the
    // panel say what it is holding back instead of just looking short.
    scanned: data?.scanned ?? 0,
    alsoScoring: data?.alsoScoring || [],
    ready,
    hasBias: rows.length > 0,
    changedPairs,
  }
}
