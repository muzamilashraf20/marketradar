/**
 * BiasForge — Static Blog Generator
 * -------------------------------------------------------------
 * Runs AFTER `vite build`. Reads markdown posts from /content/blog,
 * emits fully prerendered, crawlable HTML into /dist/blog/<slug>/,
 * a static /dist/blog/index.html listing, an updated sitemap.xml,
 * and an llms.txt for AI answer engines.
 *
 * Why static (not SPA): these pages are pure server-served HTML with
 * real content + JSON-LD in the initial response — exactly what Google,
 * Bing, GPTBot, ClaudeBot and PerplexityBot need. No JS execution
 * required to read the article. The React app is untouched.
 *
 * Add a post = drop a .md file in /content/blog. That's the whole flow.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ----------------------------- CONFIG ----------------------------- */
// Single source of truth for the canonical host. The whole site
// canonicalizes to www — keep this consistent. To ever flip the entire
// site to non-www, change this one line (and Vercel primary domain).
const SITE_URL   = 'https://www.biasforge.co';
const BRAND      = 'BiasForge';
const SECTION    = 'Macro Journal';
const AUTHOR     = 'Muzamil Ashraf';
const APP_URL    = `${SITE_URL}/login`;
const X_URL      = 'https://x.com/BiasForgeai';
const DEFAULT_OG = `${SITE_URL}/og-image.png`;
const LOGO_URL   = `${SITE_URL}/og-image.png`;

const DIST        = path.resolve(__dirname, '..', 'dist');
const CONTENT_DIR = path.resolve(__dirname, '..', 'content', 'blog');
const OUT_BLOG    = path.join(DIST, 'blog');

/* ------------------------- LANDING PRERENDER ----------------------- */
// The React landing page rendered to static HTML at build time. Without this,
// the initial response for / is an empty <div id="root"> and every word of the
// page — headline, section copy, FAQ answers — is invisible to anything that
// does not execute JavaScript.
const SSR_ENTRY   = path.resolve(__dirname, '..', 'dist-ssr', 'entry-prerender.js');
const API_BASE    = process.env.VITE_API_URL || 'https://marketradar-production.up.railway.app';
// Last known good bias values. Lets a build survive the API being down without
// falling back to an empty compass. Regenerated on every successful build.
const SNAPSHOT    = path.resolve(__dirname, '.landing-snapshot.json');
// How many biases get a card in the hero. Mirrors CARDS in useCompassData.js.
const COMPASS_CARDS = 2;
// Grade C and above; D excluded. Mirrors PUBLISHABLE_GRADES in useCompassData.js
// — the two must stay in step or the static HTML and the client disagree about
// what is publishable.
const PUBLISHABLE_GRADES = new Set(['A', 'A-', 'B', 'C']);
// Mirrors BANNED_IN_COPY in useCompassData.js. The thesis is model-generated and
// unreviewed; on the landing page it is marketing copy, so one that trips a
// banned term is not quoted. See the note there for why.
const BANNED_IN_COPY =
  /\bsignals?\b|\bsetups?\b|\bentry\b|\bentries\b|\bstop[- ]?loss\b|\btake[- ]?profit\b|\bwin rate\b|\bguarantee\w*|\bproven\b|\brisk[- ]free\b|\bodds\b|\bprobabilit\w+/i;
const publishableThesis = t => (t && !BANNED_IN_COPY.test(t) ? t : null);

// Non-blog routes for the sitemap — keep roughly in sync with the app.
const STATIC_ROUTES = [
  { loc: '/',          changefreq: 'daily',   priority: '1.0' },
  { loc: '/pricing',   changefreq: 'weekly',  priority: '0.9' },
  { loc: '/about',     changefreq: 'monthly', priority: '0.7' },
  { loc: '/blog',      changefreq: 'daily',   priority: '0.8' },
  { loc: '/changelog', changefreq: 'weekly',  priority: '0.6' },
  { loc: '/contact',   changefreq: 'monthly', priority: '0.5' },
  { loc: '/login',     changefreq: 'monthly', priority: '0.4' },
  { loc: '/terms',     changefreq: 'yearly',  priority: '0.3' },
  { loc: '/privacy',   changefreq: 'yearly',  priority: '0.3' },
  { loc: '/refund',    changefreq: 'yearly',  priority: '0.3' },
];

/* ----------------------------- HELPERS ----------------------------- */
marked.setOptions({ gfm: true, breaks: false });

const esc = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const slugify = (s = '') =>
  String(s)
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

// version-robust heading anchors (marked API differs across versions)
const addHeadingIds = (html) =>
  html.replace(/<h([2-4])>([\s\S]*?)<\/h\1>/gi, (m, lvl, inner) => {
    const id = slugify(inner.replace(/<[^>]+>/g, ''));
    return `<h${lvl} id="${id}">${inner}</h${lvl}>`;
  });

const readingTime = (md) => {
  const words = md.replace(/[#>*`_\-\[\]()!]/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
};

const fmtDate = (iso) => {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

// Posts flagged `topLevel: true` live at the site root (/<slug>) instead of
// /blog/<slug> — used for evergreen landing pages we refresh in place, where
// a short URL carries the target keyword on its own.
const postUrl = (p) => (p.topLevel ? `${SITE_URL}/${p.slug}` : `${SITE_URL}/blog/${p.slug}`);

// guard JSON-LD against </script> breakouts
const jsonld = (obj) =>
  `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

/* ------------------------------ STYLES ----------------------------- */
const STYLES = `
:root{
  --bg:#030712; --surface:#0a1322; --surface-2:#0d1a2e;
  --border:rgba(148,163,184,.14); --border-strong:rgba(148,163,184,.24);
  --text:#c8d3e0; --strong:#f1f5f9; --muted:#7c8aa0;
  --cyan:#06b6d4; --emerald:#10b981;
  --serif:"Iowan Old Style","Charter","Palatino",Georgia,"Times New Roman",serif;
  --sans:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --mono:"JetBrains Mono","SF Mono",ui-monospace,Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;background:
    radial-gradient(1200px 600px at 50% -200px,rgba(6,182,212,.06),transparent 60%),
    var(--bg);
  color:var(--text);font-family:var(--serif);font-size:18px;line-height:1.75;
  -webkit-font-smoothing:antialiased;
}
a{color:var(--cyan);text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:3px}
:focus-visible{outline:2px solid var(--cyan);outline-offset:3px;border-radius:3px}
img{max-width:100%;height:auto;border-radius:10px}

/* scroll progress — signature accent, degrades to nothing without JS */
#bar{position:fixed;top:0;left:0;height:2px;width:0;
  background:linear-gradient(90deg,var(--cyan),var(--emerald));z-index:50;transition:width .1s linear}

.wrap{max-width:720px;margin:0 auto;padding:0 22px}
.site-header{border-bottom:1px solid var(--border);position:sticky;top:0;
  background:rgba(3,7,18,.82);backdrop-filter:blur(10px);z-index:40}
.site-header .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
.brand{font-family:var(--mono);font-weight:700;letter-spacing:.02em;color:var(--strong);font-size:15px}
.brand b{color:var(--cyan)}
.brand span{color:var(--muted);font-weight:400}
.nav a{font-family:var(--mono);font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-left:20px}
.nav a:hover{color:var(--strong);text-decoration:none}
.nav a.cta{color:var(--cyan)}

main{padding:56px 0 40px}
.eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--cyan);display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 18px}
.eyebrow .sep{width:1px;height:11px;background:var(--border-strong)}
.eyebrow .muted{color:var(--muted)}

h1{font-family:var(--sans);font-weight:800;letter-spacing:-.02em;color:var(--strong);
  font-size:clamp(30px,5.4vw,44px);line-height:1.12;margin:0 0 20px}
/* the desk rule — signature hairline under the headline */
.rule{height:1px;background:linear-gradient(90deg,var(--cyan),transparent);margin:0 0 34px}

article h2{font-family:var(--sans);font-weight:750;color:var(--strong);letter-spacing:-.01em;
  font-size:26px;line-height:1.25;margin:52px 0 14px;padding-left:14px;
  border-left:2px solid var(--cyan)}
article h3{font-family:var(--sans);font-weight:700;color:var(--strong);font-size:20px;margin:36px 0 10px}
article p{margin:0 0 22px}
article ul,article ol{margin:0 0 22px;padding-left:22px}
article li{margin:0 0 9px}
article strong{color:var(--strong);font-weight:600}
article a{border-bottom:1px solid rgba(6,182,212,.4)}
article a:hover{text-decoration:none;border-bottom-color:var(--cyan)}

blockquote{margin:28px 0;padding:14px 20px;border-left:3px solid var(--emerald);
  background:var(--surface);border-radius:0 10px 10px 0;color:var(--strong);font-style:italic}
blockquote p:last-child{margin:0}

code{font-family:var(--mono);font-size:.86em;background:var(--surface);
  border:1px solid var(--border);border-radius:5px;padding:2px 6px;color:#a5e8f5}
pre{background:var(--surface);border:1px solid var(--border);border-radius:10px;
  padding:18px;overflow:auto;margin:0 0 24px}
pre code{background:none;border:0;padding:0}

table{width:100%;border-collapse:collapse;margin:26px 0;font-family:var(--sans);font-size:15.5px}
th,td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--border);vertical-align:top}
thead th{font-family:var(--mono);font-size:12px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--cyan);border-bottom:1px solid var(--border-strong)}
tbody tr:hover{background:var(--surface)}

hr{border:0;border-top:1px solid var(--border);margin:44px 0}

/* freshness stamp — update-in-place pages live or die on this signal */
.updated{font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--emerald);display:inline-flex;align-items:center;gap:7px;
  border:1px solid rgba(16,185,129,.28);background:rgba(16,185,129,.07);
  border-radius:999px;padding:5px 12px;margin:0 0 22px}
.updated .dot{width:6px;height:6px;border-radius:50%;background:var(--emerald)}

/* weekly events block */
.events{margin:36px 0 8px}
.events-head{font-family:var(--mono);font-size:12px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--muted);border-bottom:1px solid var(--border-strong);padding-bottom:10px;margin:0 0 22px}
.events-head b{color:var(--strong);font-weight:600}
.ev{border:1px solid var(--border);border-radius:14px;background:var(--surface);
  padding:20px 22px;margin:0 0 16px}
.ev-top{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin:0 0 6px}
.ev-name{font-family:var(--sans);font-weight:700;color:var(--strong);font-size:18.5px;line-height:1.3}
.ev-tag{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;
  border-radius:4px;padding:3px 7px;border:1px solid currentColor;white-space:nowrap}
.ev-tag.high{color:#f0806a}
.ev-tag.medium{color:var(--cyan)}
.ev-tag.backdrop{color:var(--muted)}
.ev-when{font-family:var(--mono);font-size:12.5px;color:var(--cyan);margin:0 0 14px}
.ev-row{font-family:var(--sans);font-size:15.5px;line-height:1.6;margin:0 0 9px;
  display:grid;grid-template-columns:104px 1fr;gap:12px}
.ev-row:last-child{margin:0}
.ev-k{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;
  color:var(--muted);padding-top:4px}
.ev-row.compass .ev-k{color:var(--emerald)}
@media (max-width:560px){
  .ev{padding:17px 16px}
  .ev-row{grid-template-columns:1fr;gap:2px}
  .ev-k{padding-top:0}
}

/* FAQ */
.faq{margin:48px 0 0;border-top:1px solid var(--border);padding-top:8px}
.faq h2{border:0;padding:0;margin:28px 0 18px}
.faq details{border-bottom:1px solid var(--border);padding:6px 0}
.faq summary{font-family:var(--sans);font-weight:600;color:var(--strong);cursor:pointer;
  list-style:none;padding:12px 0;font-size:17px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";float:right;color:var(--cyan);font-family:var(--mono)}
.faq details[open] summary::after{content:"–"}
.faq details p{margin:0 0 16px}

/* end CTA */
.cta-box{margin:56px 0 0;padding:28px;border:1px solid var(--border-strong);border-radius:16px;
  background:linear-gradient(180deg,var(--surface-2),var(--surface));text-align:center}
.cta-box .k{font-family:var(--mono);font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--emerald);margin:0 0 8px}
.cta-box h3{font-family:var(--sans);color:var(--strong);font-size:22px;margin:0 0 8px;border:0;padding:0}
.cta-box p{color:var(--muted);font-size:15.5px;margin:0 0 20px}
.btn{display:inline-block;font-family:var(--sans);font-weight:700;font-size:15px;
  padding:12px 26px;border-radius:10px;color:#031018;
  background:linear-gradient(90deg,var(--cyan),var(--emerald))}
.btn:hover{text-decoration:none;filter:brightness(1.06)}

/* index listing */
.lead{color:var(--muted);font-family:var(--sans);font-size:17px;max-width:600px;margin:0 0 40px}
.post-list{list-style:none;padding:0;margin:0}
.post-list li{border-top:1px solid var(--border);padding:26px 0}
.post-list li:last-child{border-bottom:1px solid var(--border)}
.post-list .meta{font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--cyan);margin:0 0 8px;display:flex;gap:10px;flex-wrap:wrap}
.post-list .meta .muted{color:var(--muted)}
.post-list h2{font-family:var(--sans);font-weight:750;color:var(--strong);font-size:23px;line-height:1.25;margin:0 0 8px;border:0;padding:0}
.post-list h2 a{color:var(--strong)}
.post-list h2 a:hover{color:var(--cyan);text-decoration:none}
.post-list p{color:var(--muted);font-family:var(--sans);font-size:15.5px;margin:0}
.empty{color:var(--muted);font-family:var(--sans);padding:40px 0}

footer{border-top:1px solid var(--border);margin-top:64px}
footer .wrap{padding:32px 22px 48px}
.foot-links{font-family:var(--mono);font-size:12.5px;letter-spacing:.05em;text-transform:uppercase;display:flex;gap:18px;flex-wrap:wrap;margin:0 0 16px}
.foot-links a{color:var(--muted)}
.foot-links a:hover{color:var(--strong);text-decoration:none}
.disclaimer{color:var(--muted);font-family:var(--sans);font-size:13px;line-height:1.6;margin:0}

@media (max-width:560px){
  body{font-size:17px}
  main{padding:40px 0 32px}
  .nav a:not(.cta){display:none}
}
@media (prefers-reduced-motion:reduce){#bar{transition:none}}
`;

/* ---------------------------- FRAGMENTS ---------------------------- */
const header = () => `
<header class="site-header"><div class="wrap">
  <a class="brand" href="${SITE_URL}/"><b>Bias</b>Forge <span>/ ${SECTION}</span></a>
  <nav class="nav">
    <a href="${SITE_URL}/blog">Journal</a>
    <a href="${SITE_URL}/pricing">Pricing</a>
    <a class="cta" href="${APP_URL}">Open app →</a>
  </nav>
</div></header>`;

const footer = () => `
<footer><div class="wrap">
  <div class="foot-links">
    <a href="${SITE_URL}/">BiasForge</a>
    <a href="${SITE_URL}/blog">Journal</a>
    <a href="${SITE_URL}/pricing">Pricing</a>
    <a href="${X_URL}" rel="noopener">X</a>
  </div>
  <p class="disclaimer">© ${new Date().getFullYear()} ${BRAND}. Educational content on macro and markets —
  not financial advice, and not a recommendation to buy or sell any instrument. Trade your own plan.</p>
</div></footer>`;

const ctaBox = () => `
<div class="cta-box">
  <p class="k">Compass, not a signal button</p>
  <h3>See the bias behind the move</h3>
  <p>BiasForge builds a fundamental read for every major pair from live price, the calendar, news, COT positioning and cross-asset flows — so you know why price is moving before you trade it.</p>
  <a class="btn" href="${APP_URL}">Try BiasForge</a>
</div>`;

const shell = ({ head, body }) => `<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="theme-color" content="#030712"/>
<link rel="icon" type="image/svg+xml" href="/favicon.svg"/>
${head}
<style>${STYLES}</style>
</head><body>
<div id="bar"></div>
${header()}
${body}
${footer()}
<script>
(function(){var b=document.getElementById('bar');if(!b)return;
function u(){var h=document.documentElement,m=(h.scrollHeight-h.clientHeight)||1;
b.style.width=(h.scrollTop/m*100)+'%';}
addEventListener('scroll',u,{passive:true});u();})();
</script>
</body></html>`;

/* ------------------------------ RENDER ----------------------------- */
// Renders the `events:` frontmatter array into the article, swapped in wherever
// the markdown contains an <!-- EVENTS --> marker. Weekly refresh = edit the
// array in frontmatter; the prose around it stays evergreen.
function renderEvents(post) {
  const events = Array.isArray(post.events) ? post.events : [];
  if (!events.length) return '';

  const row = (k, v, cls = '') =>
    v ? `<p class="ev-row ${cls}"><span class="ev-k">${k}</span><span>${esc(v)}</span></p>` : '';

  return `
<section class="events">
  ${post.weekOf ? `<p class="events-head">Week of <b>${esc(post.weekOf)}</b> — all times ET</p>` : ''}
  ${events.map(e => {
    const impact = String(e.impact || 'high').toLowerCase();
    return `
  <div class="ev">
    <div class="ev-top">
      <span class="ev-name">${esc(e.name)}</span>
      <span class="ev-tag ${impact}">${esc(impact === 'backdrop' ? 'backdrop' : impact + ' impact')}</span>
    </div>
    ${e.when ? `<p class="ev-when">${esc(e.when)}</p>` : ''}
    ${row('What', e.what)}
    ${row('Watch', e.watch)}
    ${row('Compass', e.compass, 'compass')}
  </div>`;
  }).join('')}
</section>`;
}

function renderPost(post) {
  const url = postUrl(post);
  const og  = post.ogImage ? (post.ogImage.startsWith('http') ? post.ogImage : SITE_URL + post.ogImage) : DEFAULT_OG;
  const tags = Array.isArray(post.tags) ? post.tags : [];

  const head = `
<title>${esc(post.title)} — ${BRAND}</title>
<meta name="description" content="${esc(post.description)}"/>
${tags.length ? `<meta name="keywords" content="${esc(tags.join(', '))}"/>` : ''}
<link rel="canonical" href="${url}"/>
<meta property="og:type" content="article"/>
<meta property="og:title" content="${esc(post.title)}"/>
<meta property="og:description" content="${esc(post.description)}"/>
<meta property="og:url" content="${url}"/>
<meta property="og:image" content="${og}"/>
<meta property="og:site_name" content="${BRAND}"/>
<meta property="article:published_time" content="${post.date}"/>
<meta property="article:author" content="${esc(AUTHOR)}"/>
${post.category ? `<meta property="article:section" content="${esc(post.category)}"/>` : ''}
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:site" content="@BiasForgeai"/>
<meta name="twitter:title" content="${esc(post.title)}"/>
<meta name="twitter:description" content="${esc(post.description)}"/>
<meta name="twitter:image" content="${og}"/>
${jsonld({
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: post.title,
  description: post.description,
  image: og,
  datePublished: post.date,
  dateModified: post.updated || post.date,
  author: { '@type': 'Person', name: AUTHOR, url: X_URL },
  publisher: { '@type': 'Organization', name: BRAND, url: SITE_URL, logo: { '@type': 'ImageObject', url: LOGO_URL } },
  mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  ...(tags.length ? { keywords: tags.join(', ') } : {}),
  ...(post.category ? { articleSection: post.category } : {}),
})}
${jsonld({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: post.topLevel
    ? [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' },
        { '@type': 'ListItem', position: 2, name: post.title, item: url },
      ]
    : [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' },
        { '@type': 'ListItem', position: 2, name: SECTION, item: SITE_URL + '/blog' },
        { '@type': 'ListItem', position: 3, name: post.title, item: url },
      ],
})}
${post.faq && post.faq.length ? jsonld({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: post.faq.map(f => ({
    '@type': 'Question', name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}) : ''}`;

  const faqHtml = (post.faq && post.faq.length) ? `
<section class="faq">
  <h2>Frequently asked</h2>
  ${post.faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}
</section>` : '';

  // Swap the <!-- EVENTS --> marker for the rendered events block. marked may
  // wrap a lone comment in a <p>, so tolerate that.
  const articleHtml = post.html.replace(
    /<p>\s*<!--\s*EVENTS\s*-->\s*<\/p>|<!--\s*EVENTS\s*-->/,
    () => renderEvents(post)
  );

  const updatedStamp = post.updated
    ? `<p class="updated"><span class="dot"></span>Updated ${fmtDate(post.updated)}</p>`
    : '';

  const body = `
<main><div class="wrap">
  <article>
    <p class="eyebrow">
      ${post.category ? `<span>${esc(post.category)}</span><span class="sep"></span>` : ''}
      <span class="muted">${fmtDate(post.date)}</span><span class="sep"></span>
      <span class="muted">${post.readMins} min read</span>
    </p>
    <h1>${esc(post.title)}</h1>
    <div class="rule"></div>
    ${updatedStamp}
    ${articleHtml}
    ${faqHtml}
    ${ctaBox()}
  </article>
</div></main>`;

  return shell({ head, body });
}

function renderIndex(posts) {
  const url = `${SITE_URL}/blog`;
  const head = `
<title>${SECTION} — Macro & Markets Education | ${BRAND}</title>
<meta name="description" content="Clear, no-hype writing on market bias, fundamental analysis, prop firm rules, the economic calendar and COT positioning — for every serious trader, funded or live."/>
<link rel="canonical" href="${url}"/>
<meta property="og:type" content="website"/>
<meta property="og:title" content="${SECTION} — ${BRAND}"/>
<meta property="og:description" content="Macro and markets education for serious traders."/>
<meta property="og:url" content="${url}"/>
<meta property="og:image" content="${DEFAULT_OG}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:site" content="@BiasForgeai"/>
${jsonld({
  '@context': 'https://schema.org', '@type': 'Organization',
  name: BRAND, url: SITE_URL, logo: LOGO_URL, sameAs: [X_URL],
})}
${jsonld({
  '@context': 'https://schema.org', '@type': 'Blog',
  name: `${BRAND} ${SECTION}`, url,
  blogPost: posts.map(p => ({
    '@type': 'BlogPosting', headline: p.title, description: p.description,
    url: postUrl(p), datePublished: p.date,
    author: { '@type': 'Person', name: AUTHOR },
  })),
})}`;

  const list = posts.length ? `
<ul class="post-list">
  ${posts.map(p => `
  <li>
    <p class="meta">${p.category ? `<span>${esc(p.category)}</span>` : ''}<span class="muted">${fmtDate(p.date)}</span><span class="muted">${p.readMins} min</span></p>
    <h2><a href="${postUrl(p)}">${esc(p.title)}</a></h2>
    <p>${esc(p.description)}</p>
  </li>`).join('')}
</ul>` : `<p class="empty">New pieces are on the way.</p>`;

  const body = `
<main><div class="wrap">
  <p class="eyebrow"><span>${BRAND} ${SECTION}</span></p>
  <h1>Macro clarity, written down.</h1>
  <div class="rule"></div>
  <p class="lead">No signals, no hype. Just how markets actually move — bias, fundamentals, prop firm mechanics, and the data behind the tape. For every serious trader.</p>
  ${list}
</div></main>`;

  return shell({ head, body });
}

/* ------------------------------ SITEMAP ---------------------------- */
function renderSitemap(posts) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ...STATIC_ROUTES.map(r => ({ loc: SITE_URL + r.loc, lastmod: today, changefreq: r.changefreq, priority: r.priority })),
    // Update-in-place pages refresh weekly and sit at the root — crawl them harder.
    ...posts.map(p => ({
      loc: postUrl(p),
      lastmod: p.updated || p.date,
      changefreq: p.topLevel ? 'weekly'  : 'monthly',
      priority:   p.topLevel ? '0.9'     : '0.7',
    })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
}

function renderLlms(posts) {
  return `# ${BRAND}

> AI-powered macro trading intelligence. BiasForge builds a fundamental directional bias for every major FX pair and gold from five live data sources — price action, the economic calendar, breaking news, COT positioning, and cross-asset flows — so traders know why price is moving before they execute. A compass for direction, not a signal button.

## Product
- Home: ${SITE_URL}/
- Pricing: ${SITE_URL}/pricing

## ${SECTION} (education)
${posts.map(p => `- [${p.title}](${postUrl(p)}): ${p.description}`).join('\n')}
`;
}

/* --------------------- LANDING PRERENDER (build) -------------------- */

const LANDING_TITLE = 'Macro Bias for Forex & Prop Firm Traders | BiasForge';
const LANDING_DESC  =
  "Directional macro bias for every major forex pair, with the invalidation level where it's wrong. Built for prop firm and funded traders.";

async function getJson(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// Shaped exactly as LiveCompass expects, so the same code path renders on the
// server and in the browser.
//
// The Grade B floor is applied HERE as well as in useCompassData.js. Filtering
// only on the client would still bake a C or D into the static HTML, which is
// what a crawler and a JavaScript-disabled visitor read. Keep the two in step.
function shapeCompass(json) {
  if (!json?.success || !Array.isArray(json.pairs) || !json.pairs.length) return null;
  const rows = json.pairs
    .filter(p => p.direction !== 'FLAT' && p.confidence != null && PUBLISHABLE_GRADES.has(p.grade))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    // Not capped: the panel header states how many biases are live, and capping
    // to the card count would make it under-report.
    .map(p => ({
      pair: p.pair,
      direction: p.direction,
      confidence: p.confidence,
      grade: p.grade,
      entryTiming: p.entryTiming,
      thesis: publishableThesis(p.thesis),
      invalidationLevel: p.invalidationLevel,
      isHeadline: p.isHeadline,
      updatedAt: p.updatedAt,
    }));
  // Engine freshness is taken across every live bias, not just the strong ones —
  // a run that produced only weak reads still ran.
  const lastRun = json.pairs.map(p => p.updatedAt).filter(Boolean).sort().pop() || null;
  // An empty row set is a legitimate result, not a failure: the hero drops the
  // compass. Returned rather than null so it is not mistaken for a failed fetch
  // and quietly replaced with the previous build's snapshot.
  // Every pair that did not get a card, including publishable ones outside the
  // top two, so the chip row always accounts for the rest of the board.
  const carded = new Set(rows.slice(0, COMPASS_CARDS).map(r => r.pair));
  const alsoScoring = json.pairs.map(p => p.pair).filter(p => !carded.has(p));
  return { rows, activeCount: rows.length, scanned: json.pairs.length, alsoScoring, lastRun };
}

function shapeEvents(json) {
  if (!Array.isArray(json)) return null;
  const now = Date.now();
  const upcoming = json
    .filter(e => e?.title && new Date(e.date).getTime() > now)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const high = upcoming.filter(e => e.impact === 'High');
  const take = (high.length ? high : upcoming).slice(0, 3);
  return take.length ? take.map(({ title, country, date, impact }) => ({ title, country, date, impact })) : null;
}

/* The four headlines the news section renders, screened the same way the client
   screens them.

   Two kinds of untrusted text arrive through this feed: the headline, written by
   a wire service, and the one-line read under it, written by the model. Neither
   is reviewed before it renders, so anything tripping the banned terms is
   dropped rather than edited — the same rule the bias thesis follows. This
   mirrors selectNews() in useLandingNews.js; the static HTML and the client have
   to agree on what is publishable. */
const NEWS_BANNED =
  /\bsignals?\b|\bsetups?\b|\bstop[- ]?loss\b|\btake[- ]?profit\b|\bwin rate\b|\bguarantee\w*|\bproven\b|\brisk[- ]free\b|\bodds\b|\bprobabilit\w+|\bbuy now\b|\bsure thing\b/i;

function shapeNews(json) {
  if (!json?.success || !Array.isArray(json.articles)) return null;
  /* Mirrors isRelevant()/rankNews() in useLandingNews.js — see the long note
     there for why it takes two passes. The two have to agree or the static HTML
     and the client render different headlines. */
  const CORPORATE_CATEGORY =
    /earnings|guidance|m&a|merger|acquisition|activis|buyback|dividend|ipo|corporate|governance|leadership|credit|product|investment/i;
  const CURRENCY = /^(USD|EUR|GBP|JPY|CHF|AUD|NZD|CAD|CNY|XAU|XAG|DXY)$/i;
  const TICKER = /^[A-Z]{1,5}$/;
  const MACRO_CATEGORY =
    /^(fx|forex|currenc|central bank|monetary|trade|geopolit|inflation|econom|rates?|yields?|commodit|fiscal|tariff|market sentiment|policy)/i;
  const MACRO_TAG =
    /^(USD|EUR|GBP|JPY|CHF|AUD|NZD|CAD|CNY|XAU|XAG|DXY|Gold|Silver|Oil|Crude|Brent|WTI|Fed|ECB|BOE|BOJ|SNB|RBA|RBNZ|BOC|Rates?|Yields?|Inflation|CPI|NFP|Jobs|Labou?r|Growth|Recession|Tariffs?|Trade War|Equities|Volatility|Risk)\b/i;
  const FX_TAG =
    /^(USD|EUR|GBP|JPY|CHF|AUD|NZD|CAD|CNY|XAU|XAG|DXY|Gold|Silver|Oil|Crude|Brent|WTI|Fed|ECB|BOE|BOJ|SNB|RBA|RBNZ|BOC)\b/i;
  const bareTag = t => String(t).trim().replace(/[↑↓→←]/g, '');
  const isSingleName = a =>
    CORPORATE_CATEGORY.test(a.category || '') ||
    (a.marketTags || []).some(t => { const x = bareTag(t); return TICKER.test(x) && !CURRENCY.test(x); });
  const isMacro = a =>
    MACRO_CATEGORY.test(a.category || '') || (a.marketTags || []).some(t => MACRO_TAG.test(bareTag(t)));
  const isFx = a => (a.marketTags || []).some(t => FX_TAG.test(bareTag(t)));

  const clean = json.articles
    .filter(a => a?.title && !NEWS_BANNED.test(a.title) && !NEWS_BANNED.test(a.oneliner || ''))
    .filter(a => !isSingleName(a) && isMacro(a));
  const rows = [...clean.filter(isFx), ...clean.filter(a => !isFx(a))]
    .slice(0, 4)
    .map(({ title, source, category, impact, oneliner, marketTags, publishedAt }) => ({
      title, source, category, impact,
      oneliner: oneliner || '',
      marketTags: (marketTags || []).slice(0, 3),
      publishedAt,
    }));
  return rows.length ? rows : null;
}

async function loadLiveData() {
  let compass = null;
  let events = null;
  let calls = null;
  let news = null;
  try {
    const [c, e, k, n] = await Promise.allSettled([
      getJson(`${API_BASE}/api/macro-compass`),
      getJson(`${API_BASE}/api/calendar`),
      getJson(`${API_BASE}/api/bias-calls`),
      // Slowest endpoint on the API: cold, it fetches five RSS feeds and scores
      // anything unseen before it answers. 12s was not enough and the section
      // silently baked empty.
      getJson(`${API_BASE}/api/news?minImpact=5&limit=50`, 45000),
    ]);
    if (c.status === 'fulfilled') compass = shapeCompass(c.value);
    if (e.status === 'fulfilled') events = shapeEvents(e.value);
    if (k.status === 'fulfilled' && k.value?.success && Array.isArray(k.value.calls)) calls = k.value.calls;
    if (n.status === 'fulfilled') news = shapeNews(n.value);
  } catch { /* fall through to the snapshot */ }

  // Whatever came back gets banked; whatever did not falls back to the last
  // build's values. A build must never publish an empty compass just because
  // the API blipped during CI.
  let snap = {};
  try { snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')); } catch { /* first build */ }

  const out = {
    compass: compass || snap.compass || null,
    events: events || snap.events || null,
    calls: calls || snap.calls || null,
    news: news || snap.news || null,
  };
  if (compass || events || calls || news) {
    try { fs.writeFileSync(SNAPSHOT, JSON.stringify(out, null, 2)); } catch { /* read-only CI fs */ }
  }
  return { ...out, fresh: { compass: !!compass, events: !!events, calls: !!calls, news: !!news } };
}

// JSON destined for an inline <script>. Escaping "<" is what stops a string in
// the data from closing the script tag early.
const inlineJson = (v) => JSON.stringify(v ?? null).replace(/</g, '\\u003c');

function landingSchemas({ FAQ, PRICE_MONTHLY, PRICE_ANNUAL }) {
  const software = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: BRAND,
    description: LANDING_DESC,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    url: `${SITE_URL}/`,
    offers: [
      { '@type': 'Offer', price: String(PRICE_MONTHLY), priceCurrency: 'USD', name: 'Pro (monthly)', category: 'Subscription' },
      { '@type': 'Offer', price: String(PRICE_ANNUAL), priceCurrency: 'USD', name: 'Pro (annual)', category: 'Subscription' },
    ],
  };

  // Generated from the same array the page renders, so the two cannot diverge.
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND,
    url: `${SITE_URL}/`,
    logo: LOGO_URL,
    sameAs: [X_URL, 'https://t.me/biasforgeofficial'],
  };

  return [software, faq, org].map(jsonld).join('\n    ');
}

// Attribute values get the apostrophe escaped too, so a value is safe inside
// either quote style. esc() alone leaves ' untouched.
const escAttr = (s = '') => esc(s).replace(/'/g, '&#39;');

// Swap the value of a <meta> tag if it exists, append it to <head> if it does not.
//
// The quote character is captured and back-referenced rather than matched with a
// [^"'] class: an apostrophe inside the existing value (…where it's wrong…) ended
// the class early, so the replacement landed mid-sentence and left the tail of the
// old value dangling after it.
//
// The replacement is a function, not a template string, because $&, $` and $' in
// the new copy would otherwise be interpreted as replacement patterns.
function setMeta(html, attr, name, content) {
  const re = new RegExp(`(<meta\\s+${attr}=["']${name}["']\\s+content=)(["'])[\\s\\S]*?\\2`, 'i');
  if (re.test(html)) return html.replace(re, (_m, pre, q) => `${pre}${q}${escAttr(content)}${q}`);
  return html.replace('</head>', `  <meta ${attr}="${name}" content="${escAttr(content)}" />\n  </head>`);
}

async function prerenderLanding() {
  const shell = path.join(DIST, 'index.html');
  if (!fs.existsSync(shell)) {
    console.error('  ✗ dist/index.html not found — run `vite build` first.');
    process.exit(1);
  }
  if (!fs.existsSync(SSR_ENTRY)) {
    console.error(`  ✗ ${path.relative(process.cwd(), SSR_ENTRY)} not found — run the --ssr build first.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(shell, 'utf8');

  // Every route other than / keeps the plain SPA shell. Vercel checks the
  // filesystem before rewrites, so / is served this prerendered index.html
  // while /pricing, /dashboard and the rest rewrite to app.html — which means
  // no app route ever ships a flash of landing copy it then throws away.
  fs.writeFileSync(path.join(DIST, 'app.html'), raw);

  const mod = await import(pathToFileURL(SSR_ENTRY).href);
  const { compass, events, calls, news, fresh } = await loadLiveData();

  const markup = mod.render({ compass, events, calls, news });

  let html = raw
    .replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${esc(LANDING_TITLE)}</title>`)
    .replace(
      /<link\s+rel=["']canonical["']\s+href=["'][^"']*["']\s*\/?>/i,
      () => `<link rel="canonical" href="${SITE_URL}/" />`
    );

  html = setMeta(html, 'name', 'description', LANDING_DESC);
  html = setMeta(html, 'property', 'og:title', LANDING_TITLE);
  html = setMeta(html, 'property', 'og:description', LANDING_DESC);
  html = setMeta(html, 'property', 'og:url', `${SITE_URL}/`);
  html = setMeta(html, 'name', 'twitter:title', LANDING_TITLE);
  html = setMeta(html, 'name', 'twitter:description', LANDING_DESC);

  html = html.replace('</head>', `  ${landingSchemas(mod)}\n  </head>`);

  // The markup goes inside #root; the data goes in ahead of the module bundle so
  // the browser's first render already has the same values the HTML was built
  // with, and never flashes a skeleton over real numbers.
  const data =
    `<script>window.__BF_COMPASS__=${inlineJson(compass)};` +
    `window.__BF_EVENTS__=${inlineJson(events)};` +
    `window.__BF_CALLS__=${inlineJson(calls)};` +
    `window.__BF_NEWS__=${inlineJson(news)};</script>`;

  const rootRe = /<div id="root">\s*<\/div>/i;
  if (!rootRe.test(html)) {
    console.error('  ✗ could not find <div id="root"></div> in dist/index.html — prerender aborted.');
    process.exit(1);
  }
  html = html.replace(rootRe, `<div id="root">${markup}</div>\n    ${data}`);

  fs.writeFileSync(shell, html);

  // ── /about, same pipeline ──
  // Vercel checks the filesystem before rewrites, so dist/about/index.html is
  // served directly and the SPA route never runs for a cold visit.
  const aboutTitle = 'About BiasForge | Macro Research for Forex Traders';
  const aboutDesc =
    'BiasForge is an independent macro research tool for forex, prop firm and funded traders — one directional read per pair, with the invalidation level where it stops being valid.';

  let aboutHtml = raw
    .replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${esc(aboutTitle)}</title>`)
    .replace(
      /<link\s+rel=["']canonical["']\s+href=["'][^"']*["']\s*\/?>/i,
      () => `<link rel="canonical" href="${SITE_URL}/about" />`
    );
  aboutHtml = setMeta(aboutHtml, 'name', 'description', aboutDesc);
  aboutHtml = setMeta(aboutHtml, 'property', 'og:title', aboutTitle);
  aboutHtml = setMeta(aboutHtml, 'property', 'og:description', aboutDesc);
  aboutHtml = setMeta(aboutHtml, 'property', 'og:url', `${SITE_URL}/about`);
  aboutHtml = setMeta(aboutHtml, 'name', 'twitter:title', aboutTitle);
  aboutHtml = setMeta(aboutHtml, 'name', 'twitter:description', aboutDesc);
  aboutHtml = aboutHtml.replace(rootRe, `<div id="root">${mod.renderAbout()}</div>`);

  const aboutDir = path.join(DIST, 'about');
  fs.mkdirSync(aboutDir, { recursive: true });
  fs.writeFileSync(path.join(aboutDir, 'index.html'), aboutHtml);

  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`  ✓ / prerendered (${kb} kB)`);
  const strong = compass?.rows?.length ?? 0;
  console.log(`      bias data: ${fresh.compass ? 'live' : compass ? 'snapshot' : 'NONE'}` +
              ` · biases baked: ${strong}${strong === 0 ? ' (compass hidden)' : ''}` +
              ` · events: ${fresh.events ? 'live' : events ? 'snapshot' : 'NONE'}` +
              ` · closed calls baked: ${calls?.length ?? 0}` +
              ` · news baked: ${news?.length ?? 0}`);
  console.log(`  ✓ /about prerendered (${(Buffer.byteLength(aboutHtml) / 1024).toFixed(1)} kB)`);
  console.log('  ✓ app.html (SPA shell for every non-root route)');
}

/* ------------------------------- BUILD ----------------------------- */
function loadPosts() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs.readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('_'))
    .map(f => {
      const raw = fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8');
      const { data, content } = matter(raw);
      if (!data.title || !data.description || !data.date) {
        console.warn(`  ! skipped ${f} — missing title/description/date`);
        return null;
      }
      if (data.draft) { console.warn(`  · draft ${f} — skipped`); return null; }
      const slug = data.slug || f.replace(/\.md$/, '');
      return {
        ...data,
        slug,
        readMins: readingTime(content),
        html: addHeadingIds(marked.parse(content)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

async function run() {
  console.log('› Generating static blog…');
  if (!fs.existsSync(DIST)) {
    console.error('  ✗ dist/ not found — run `vite build` first.');
    process.exit(1);
  }
  const posts = loadPosts();
  fs.mkdirSync(OUT_BLOG, { recursive: true });

  for (const p of posts) {
    // topLevel posts land at dist/<slug>/, everything else at dist/blog/<slug>/.
    // Vercel checks the filesystem before the SPA rewrite, so these win over
    // the React catch-all and are served as real prerendered HTML.
    const dir = p.topLevel ? path.join(DIST, p.slug) : path.join(OUT_BLOG, p.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), renderPost(p));
    console.log(`  ✓ ${p.topLevel ? '' : '/blog'}/${p.slug}`);
  }

  fs.writeFileSync(path.join(OUT_BLOG, 'index.html'), renderIndex(posts));
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), renderSitemap(posts));
  fs.writeFileSync(path.join(DIST, 'llms.txt'), renderLlms(posts));

  console.log(`  ✓ /blog (index), sitemap.xml, llms.txt`);

  console.log('› Prerendering the landing page…');
  await prerenderLanding();

  console.log(`› Done — ${posts.length} post(s).`);
}

run().catch(e => { console.error('  ✗ build failed:', e); process.exit(1); });
