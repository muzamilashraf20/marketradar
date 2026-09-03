import { useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const CACHE_KEY = 'bf_landing_news'

/* How many headlines the section shows. Four: enough for the stack to read as a
   feed rather than as a single pulled quote, few enough that every card stays at
   full size instead of shrinking to fit the section. */
export const NEWS_CARDS = 4

/* Baked into the page at build time, same as the compass and the record, so the
   headlines are in the static HTML for a crawler or a visitor with no JS. */
export const bakedNews = () =>
  (typeof globalThis !== 'undefined' ? globalThis.__BF_NEWS__ : null) || null

/* Two different kinds of untrusted text end up on this page through this feed.

   The headline is a third party's — a wire service wrote it and nobody here
   reviews it before it renders. The one-line read under it is model-generated.
   Neither can be allowed to put "signals", a guarantee or a claim about odds
   into the marketing copy, so an article tripping the screen is dropped rather
   than edited. We do not rewrite a publisher's headline to make it usable. */
const BANNED_IN_COPY =
  /\bsignals?\b|\bsetups?\b|\bstop[- ]?loss\b|\btake[- ]?profit\b|\bwin rate\b|\bguarantee\w*|\bproven\b|\brisk[- ]free\b|\bodds\b|\bprobabilit\w+|\bbuy now\b|\bsure thing\b/i

export const newsIsPublishable = a =>
  !!a?.title && !BANNED_IN_COPY.test(a.title) && !BANNED_IN_COPY.test(a.oneliner || '')

/* Only what the card renders. The feed carries a dozen more fields per article
   and none of them belong in the static HTML. */
export const trimArticle = a => ({
  title: a.title,
  source: a.source,
  category: a.category,
  impact: a.impact,
  oneliner: a.oneliner || '',
  marketTags: (a.marketTags || []).slice(0, 3),
  publishedAt: a.publishedAt,
})

/* Which headlines belong on a forex page.

   Two filters, because one in either direction was not enough.

   Requiring a macro tag alone was correct and useless: on a day the wires were
   full of earnings, one article out of forty-six qualified and the section sat
   there showing a single card. Blocking single-company stories alone let a
   Clippers suspension and a state supreme court petition through, because the
   feed files anything it cannot categorise as "General" with no tags at all.

   So a headline has to clear both. It must not look like a single-company story
   — an earnings beat, a merger, an activist stake, a chief executive leaving, a
   corporate credit blow-up — and it must carry something macro: a currency, a
   metal, energy, a central bank, rates, inflation, jobs, tariffs, or market-wide
   risk. Categories drift between scoring runs, so the tags do most of the work
   and the category is a second chance rather than the test.

   A ticker in the tags is the giveaway for the first half. AAPL, AVGO, LHX and
   SHEL all look like currency codes at a glance — three to five capitals — so
   the check is against the currency list, not against shape alone. */
const CORPORATE_CATEGORY =
  /earnings|guidance|m&a|merger|acquisition|activis|buyback|dividend|ipo|corporate|governance|leadership|credit|product|investment/i

const CURRENCY = /^(USD|EUR|GBP|JPY|CHF|AUD|NZD|CAD|CNY|XAU|XAG|DXY)$/i
const TICKER = /^[A-Z]{1,5}$/

const MACRO_CATEGORY =
  /^(fx|forex|currenc|central bank|monetary|trade|geopolit|inflation|econom|rates?|yields?|commodit|fiscal|tariff|market sentiment|policy)/i
const MACRO_TAG =
  /^(USD|EUR|GBP|JPY|CHF|AUD|NZD|CAD|CNY|XAU|XAG|DXY|Gold|Silver|Oil|Crude|Brent|WTI|Fed|ECB|BOE|BOJ|SNB|RBA|RBNZ|BOC|Rates?|Yields?|Inflation|CPI|NFP|Jobs|Labou?r|Growth|Recession|Tariffs?|Trade War|Equities|Volatility|Risk)\b/i

const bareTag = t => String(t).trim().replace(/[↑↓→←]/g, '')

const isSingleName = a =>
  CORPORATE_CATEGORY.test(a.category || '') ||
  (a.marketTags || []).some(t => {
    const s = bareTag(t)
    return TICKER.test(s) && !CURRENCY.test(s)
  })

const isMacro = a =>
  MACRO_CATEGORY.test(a.category || '') ||
  (a.marketTags || []).some(t => MACRO_TAG.test(bareTag(t)))

export const isRelevant = a => !isSingleName(a) && isMacro(a)

/* A currency, metal or central bank in the tags sorts to the front, so on a
   quiet day the forex story is still card one and market-wide risk fills in
   behind it. */
const FX_TAG = /^(USD|EUR|GBP|JPY|CHF|AUD|NZD|CAD|CNY|XAU|XAG|DXY|Gold|Silver|Oil|Crude|Brent|WTI|Fed|ECB|BOE|BOJ|SNB|RBA|RBNZ|BOC)\b/i
const isFx = a => (a.marketTags || []).some(t => FX_TAG.test(bareTag(t)))

export const rankNews = rows => [...rows.filter(isFx), ...rows.filter(a => !isFx(a))]

export const selectNews = articles =>
  rankNews((articles || []).filter(newsIsPublishable).filter(isRelevant))
    .slice(0, NEWS_CARDS)
    .map(trimArticle)

export const timeAgo = iso => {
  if (!iso) return ''
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(mins) || mins < 0) return ''
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const hrs = Math.round(mins / 60)
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`
}

/* The prerendered document is frozen at build time, so a relative age baked into
   it would keep claiming "12m ago" days later. The static render states the
   absolute time; the browser swaps in the relative form on mount. */
export const stamp = iso =>
  iso
    ? new Date(iso)
        .toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
        .replace(',', '') + ' UTC'
    : ''

export function useLandingNews() {
  const [articles, setArticles] = useState(() => bakedNews() || [])
  const [ready, setReady] = useState(() => !!bakedNews())

  useEffect(() => {
    let alive = true
    fetch(`${API_BASE}/api/news?minImpact=5&limit=50`)
      .then(r => r.json())
      .then(json => {
        if (!alive) return
        if (!json?.success || !Array.isArray(json.articles)) throw new Error('empty')
        const rows = selectNews(json.articles)
        if (!rows.length) throw new Error('nothing publishable')
        setArticles(rows)
        setReady(true)
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(rows)) } catch { /* private mode */ }
      })
      .catch(() => {
        /* The baked set is written at build time and is newer than any cache a
           previous visit left behind, so it wins whenever it exists. */
        if (!alive || bakedNews()) return setReady(true)
        try {
          const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
          if (Array.isArray(cached) && cached.length) setArticles(cached)
        } catch { /* nothing baked and no cache: the section hides itself */ }
        setReady(true)
      })
    return () => { alive = false }
  }, [])

  return { articles, ready }
}
