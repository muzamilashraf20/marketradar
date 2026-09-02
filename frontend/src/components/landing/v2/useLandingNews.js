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

   The feed covers markets generally and scores impact honestly, which is how an
   activist stake in Deutsche Telekom and a casino operator's going-concern
   warning both arrive at 8/10. Correct scores, wrong page. A first pass at this
   matched any tag containing "bond" or "gold" and let both of those straight
   through — so the test is now the tag's leading symbol against a fixed list of
   currencies, metals, energy and rates, plus a small set of genuinely macro
   categories. "Policy" is not on that list: it was carrying healthcare and data
   centres.

   Nothing is re-scored and nothing is invented. Anything that fails is simply
   not shown, and if that leaves nothing the panel does not render — the section
   keeps its copy either way. Two real macro headlines beat four with two
   earnings stories among them. */
const MACRO_CATEGORY = /^(fx|forex|currenc|central bank|monetary|trade policy|geopolit|inflation|econom|rates?|yields?|commodit|fiscal|tariff)/i
const MACRO_TAG =
  /^(USD|EUR|GBP|JPY|CHF|AUD|NZD|CAD|XAU|XAG|DXY|Gold|Silver|Oil|Crude|Brent|WTI|Yields?|Rates?|Bonds?|Tariffs?|Fed|ECB|BOE|BOJ|SNB|RBA|RBNZ|BOC|Inflation|CPI|NFP)\b/i

const isMacro = a =>
  MACRO_CATEGORY.test(a.category || '') ||
  (a.marketTags || []).some(t => MACRO_TAG.test(String(t).trim()))

export const selectNews = articles =>
  (articles || []).filter(newsIsPublishable).filter(isMacro).slice(0, NEWS_CARDS).map(trimArticle)

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
    fetch(`${API_BASE}/api/news?minImpact=6&limit=12`)
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
