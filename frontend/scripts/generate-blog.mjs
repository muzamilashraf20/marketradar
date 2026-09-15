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

// Non-blog routes for the sitemap — keep roughly in sync with the app.
//
// `lastmod` is the date the page actually last changed; bump it when you edit
// the page. `null` means the build fills it in, and only two routes earn that:
// / rebakes its data every build, and /blog follows its newest post. Stamping
// today's date on all ten was telling Google the refund policy changes daily,
// and a sitemap that visibly lies about lastmod gets its lastmod discounted
// everywhere — including on the pages where it is true.
const STATIC_ROUTES = [
  { loc: '/',          changefreq: 'daily',   priority: '1.0', lastmod: null },
  { loc: '/pricing',   changefreq: 'weekly',  priority: '0.9', lastmod: '2026-09-01' },
  { loc: '/about',     changefreq: 'monthly', priority: '0.7', lastmod: '2026-09-01' },
  { loc: '/blog',      changefreq: 'daily',   priority: '0.8', lastmod: null },
  { loc: '/changelog', changefreq: 'weekly',  priority: '0.6', lastmod: '2026-07-22' },
  { loc: '/contact',   changefreq: 'monthly', priority: '0.5', lastmod: '2026-09-02' },
  { loc: '/login',     changefreq: 'monthly', priority: '0.4', lastmod: '2026-07-07' },
  { loc: '/terms',     changefreq: 'yearly',  priority: '0.3', lastmod: '2026-07-27' },
  { loc: '/privacy',   changefreq: 'yearly',  priority: '0.3', lastmod: '2026-07-27' },
  { loc: '/refund',    changefreq: 'yearly',  priority: '0.3', lastmod: '2026-05-31' },
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
.ev-figs{list-style:none;margin:0 0 15px;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.ev-figs li{font-family:var(--mono);font-size:12px;line-height:1.45;color:var(--text);
  background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:4px 9px}
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

/* --------------------- AUTO EVENT BLOCK (live calendar) ------------------- */
/* A post carrying `autoEvents: true` builds its event block from the live
   calendar at build time instead of from hand-written frontmatter. That is the
   whole point of it: the page cannot drift out of date between manual edits,
   because there are no manual edits.

   Two things here are deliberately NOT generated:

   - The facts. Release names, dates, times, forecast and previous come straight
     off /api/calendar. Nothing in this file writes a number.
   - The prose. Each release family carries evergreen copy written once, below.
     CPI behaves the same way every month; only the figures change, and those
     come from the feed. No model runs at build time, so this page cannot invent
     a date, a consensus, or a central bank meeting that is not happening.

   Feed limitation worth knowing: ForexFactory publishes roughly a week ahead,
   so the back half of a ten-day window is usually empty, and by Friday the feed
   has little left in it at all. Releases known months ahead — a Fed or a BOJ
   meeting — go in `pinnedEvents:` frontmatter and merge in by date. A pin
   expires on its own date exactly like a feed row, so a forgotten one drops off
   the page instead of going stale in public. */

const AUTO_EVENT_DAYS = 10;
const ET = 'America/New_York';
const DAY_MS = 86400000;

const REGION = {
  USD: 'US', EUR: 'Euro area', GBP: 'UK', JPY: 'Japan', AUD: 'Australia',
  CAD: 'Canada', CHF: 'Swiss', NZD: 'New Zealand', CNY: 'China',
};

/* Release families. First match wins, so these run specific to general, and the
   last entry is the catch-all. `label` gets appended to the region to title the
   card: "US inflation (CPI)". */
const EVENT_KB = [
  {
    family: 'jobs',
    re: /(non-?farm|payroll|employment change|unemployment (rate|claims)|average hourly|claimant count|jobless|jobs report|adp)/i,
    label: 'jobs data',
    what: 'The labour market read. Employment is half of the dual mandate most major central banks work to, which makes it a direct input into the rate path — and the rate path is what prices a currency.',
    watch: 'The deviation from consensus matters more than the headline count, and the unemployment rate can override the jobs figure entirely when the two disagree. Wage growth inside the report is the inflation link, so a soft headline with hot earnings is not the dovish print it looks like.',
    compass: 'This moves the dollar, gold and the indices together rather than one pair in isolation. Let the first spike resolve, then work from the reaction high or low it prints. That extreme is the invalidation: if price reclaims it, the read taken off the release is wrong and the position is done.',
  },
  {
    family: 'cpi',
    re: /\bcpi\b|consumer price|inflation rate|core inflation|\brpi\b|\bhicp\b/i,
    label: 'inflation (CPI)',
    what: 'The headline inflation print. Of everything on the calendar, this is the release that most reliably repositions rate expectations.',
    watch: 'Core is the number that moves policy — the headline carries food and energy noise the central bank looks through. Month-on-month tells you the current run rate; year-on-year tells you the trend, and the two can point opposite ways in the same release. The surprise against forecast is the move, not the level.',
    compass: 'A hot print pushes the rate path higher and typically bids the currency while pressuring gold; a cool one does the reverse. Both are conditional, not predictions. Size for a two-way spike, then take direction from where price settles once the first minute is over — and mark that settle level, because losing it means the read has failed.',
  },
  {
    family: 'ppi',
    re: /\bppi\b|producer price|factory gate/i,
    label: 'producer prices (PPI)',
    what: 'Inflation measured at the factory gate rather than the till. It feeds into consumer prices with a lag, and it usually lands just ahead of CPI.',
    watch: 'Treat it as the warm-up act. It rarely repositions a currency on its own, but a big surprise shifts how the market frames the CPI print that follows, and several PPI components feed directly into the inflation gauge the central bank actually targets.',
    compass: 'Context rather than a standalone read. A bias built on PPI alone is invalidated the moment CPI disagrees with it, which is an argument for smaller size into it — not a tighter stop.',
  },
  {
    family: 'rate',
    re: /(rate decision|rate statement|federal funds|main refinancing|official bank rate|policy rate|cash rate|overnight rate|interest rate|monetary policy|press conference|fomc|\bmpc\b|rate vote|policy report|deposit facility)/i,
    label: 'rate decision',
    what: 'The central bank sets policy and — the part that actually matters — signals what it expects to do next.',
    watch: 'The decision itself is usually the smaller half of the move, because it is normally priced in well ahead. What repositions the currency is the statement language, any shift in the projected path, and the press conference, which regularly moves price further than the release did.',
    compass: 'Rate expectations are the dominant driver of currency pricing, so this resets the working read on the whole currency, not just one pair. Mark the range price held going in. The side that breaks and holds is the read; a move back inside that range says it is wrong.',
  },
  {
    family: 'gdp',
    re: /\bgdp\b|gross domestic/i,
    label: 'GDP',
    what: 'The broadest measure of output. Backward-looking by design — it describes a quarter that has already finished.',
    watch: 'Because it is old news by the time it prints, it moves markets mainly when it misses badly enough to change the growth story, or when a revision rewrites what the market thought it knew. The composition matters: consumption-led growth reads very differently from inventory-led growth.',
    compass: 'A slower burn than CPI or a rate decision. It shapes the medium-term read on a currency rather than handing you a level to work from in the next hour, and a strong number inside a weakening trend is more often a fade than a reversal.',
  },
  {
    family: 'retail',
    re: /retail sales|consumer spending/i,
    label: 'retail sales',
    what: 'The monthly read on consumer demand — the single largest component of most developed economies.',
    watch: 'The control group, which strips out autos, fuel and building materials, is the number economists actually track, and it often diverges from the headline. Revisions to the prior month can be large enough to matter more than the new print.',
    compass: 'Feeds the growth half of the story rather than the inflation half, so it moves a currency less than CPI and more than a survey. Useful as confirmation of a read you already hold; thin as the sole basis for one.',
  },
  {
    family: 'pmi',
    re: /\bpmi\b|\bism\b|purchasing managers|business activity|manufacturing index/i,
    label: 'PMI survey',
    what: 'A survey of purchasing managers, and one of the earliest reads on where an economy is heading rather than where it has been.',
    watch: 'The 50 line separates expansion from contraction. Inside the report, the employment and prices-paid components often move markets more than the headline index does, because those are the two channels that touch policy.',
    compass: 'Directionally supportive or corrective rather than decisive on its own. Best used to set up how you read the hard data that follows it, not as a reason to hold a position through that data.',
  },
  {
    family: 'sentiment',
    re: /(consumer (sentiment|confidence)|\bzew\b|\bifo\b|sentix|business confidence|\btankan\b)/i,
    label: 'confidence survey',
    what: 'A sentiment read: how households or businesses say they feel about conditions ahead.',
    watch: 'Soft data, so it moves price less than a hard release. The inflation-expectations component inside these surveys is the exception — central banks watch it closely, and a jump there can carry more weight than the headline index.',
    compass: 'Rarely worth taking a position into. Treat it as texture around a read that already has a level behind it.',
  },
  {
    family: 'other',
    re: /.*/,
    label: 'high-impact release',
    what: 'A release the calendar flags as high impact for this currency.',
    watch: 'The deviation from consensus is what moves price — the market has already priced the forecast. Check the forecast and previous below, and confirm the exact slot on the live calendar before you take size into it.',
    compass: 'Know the time, size for the spike, and have the level that tells you the read has failed before the number prints — not after.',
  },
];

const kbFor = (title) => EVENT_KB.find(k => k.re.test(String(title || ''))) || EVENT_KB[EVENT_KB.length - 1];

// Everything on this page is stamped in ET, because that is the clock the US
// calendar runs on and the one this audience already has on their charts.
const etParts = (iso) => {
  const d = new Date(iso);
  return {
    day:  d.toLocaleDateString('en-US', { timeZone: ET, weekday: 'long', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit' }),
    key:  d.toLocaleDateString('en-CA', { timeZone: ET }),   // YYYY-MM-DD, for bucketing
  };
};

// The feed writes "-" for a figure it does not have. Printing "forecast -" is
// worse than printing nothing at all.
const figures = (e) => [
  e.forecast && e.forecast !== '-' ? `forecast ${e.forecast}` : '',
  e.previous && e.previous !== '-' ? `previous ${e.previous}` : '',
].filter(Boolean).join(' · ');

/* The window label — "September 9-19, 2026". */
function autoRangeLabel(days = AUTO_EVENT_DAYS) {
  const a = new Date(), b = new Date(Date.now() + days * DAY_MS);
  const p = (d, o) => d.toLocaleDateString('en-US', { timeZone: ET, ...o });
  const year = p(b, { year: 'numeric' });
  return p(a, { month: 'numeric' }) === p(b, { month: 'numeric' })
    ? `${p(a, { month: 'long' })} ${p(a, { day: 'numeric' })}–${p(b, { day: 'numeric' })}, ${year}`
    : `${p(a, { month: 'long', day: 'numeric' })} – ${p(b, { month: 'long', day: 'numeric' })}, ${year}`;
}

/* Label for a recap block: the span the events themselves cover. */
function recapRangeLabel(events) {
  if (!events.length) return autoRangeLabel();
  const p = (ms, o) => new Date(ms).toLocaleDateString('en-US', { timeZone: ET, ...o });
  const a = events[0]._at, b = events[events.length - 1]._at;
  const year = p(b, { year: 'numeric' });
  return p(a, { month: 'numeric' }) === p(b, { month: 'numeric' })
    ? `${p(a, { month: 'long' })} ${p(a, { day: 'numeric' })}–${p(b, { day: 'numeric' })}, ${year}`
    : `${p(a, { month: 'long', day: 'numeric' })} – ${p(b, { month: 'long', day: 'numeric' })}, ${year}`;
}

/* Feed rows + pins, into the event array `renderEvents` already knows how to draw.
   Returns a mode alongside them, because this page has two honest states.

   The vendor feed carries the CURRENT week and nothing else — ForexFactory's
   nextweek.json has been a 404 for as long as this has been wired, and the FMP
   source that would reach further is down. So from Friday evening through
   Sunday the forward window is genuinely empty, every single week. That is
   roughly two days in seven, on the page we most want found.

   Rather than publish a shrug, an empty forward window falls back to the week
   that just finished: same releases, same figures, described as what they are.
   Someone searching this on a Saturday is planning the week ahead, and what
   just printed is exactly the context they carry into it. */
function buildAutoEvents(calendar, pinned = [], days = AUTO_EVENT_DAYS) {
  const now = Date.now(), until = now + days * DAY_MS;
  const future = (t) => Number.isFinite(t) && t > now && t <= until;

  const high = (Array.isArray(calendar) ? calendar : [])
    .filter(e => e?.title && e?.date && e.impact === 'High');

  let mode = 'upcoming';
  let rows = high
    .filter(e => future(new Date(e.date).getTime()))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!rows.length) {
    mode = 'recap';
    const since = now - 7 * DAY_MS;
    rows = high
      .filter(e => { const t = new Date(e.date).getTime(); return t <= now && t > since; })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  // One release is often four rows in the feed — US CPI arrives as CPI m/m, CPI
  // y/y, Core CPI m/m and Core CPI y/y stamped at the same minute. Four cards
  // for one print is exactly what makes a generated page read like a scraper,
  // so rows of the same currency and family that land close together share a
  // card carrying all of their figures.
  //
  // "Close together" is a time window, not a calendar day. Bucketing by ET day
  // split the BOJ in two: its decision lands at 10:30 PM ET and its press
  // conference at 1:30 AM, either side of midnight, so one event printed as
  // two cards on two days. A decision and its press conference are always
  // within a few hours; the next release of the same family is days away.
  const SAME_RELEASE_MS = 6 * 60 * 60 * 1000;
  const buckets = [];
  for (const e of rows) {
    const kb = kbFor(e.title), t = new Date(e.date).getTime();
    const b = buckets.find(x => x.country === e.country && x.kb.family === kb.family && t - x.start <= SAME_RELEASE_MS);
    if (b) b.rows.push(e);
    else buckets.push({ kb, country: e.country, start: t, rows: [e] });
  }

  const fromFeed = buckets.map(({ kb, country, rows }) => {
    const first = etParts(rows[0].date);
    const spread = new Set(rows.map(r => etParts(r.date).time)).size > 1;
    return {
      _at: new Date(rows[0].date).getTime(),
      name: `${REGION[country] || country} ${kb.label}`,
      when: `${first.day} — ${first.time} ET${spread ? ', with follow-ons after' : ''}`,
      impact: 'high',
      lines: rows.map(r => {
        const fig = figures(r);
        return `${spread ? etParts(r.date).time + ' — ' : ''}${r.title}${fig ? ` (${fig})` : ''}`;
      }),
      // `what` describes the release and reads the same either way. `watch`
      // and `compass` tell you how to trade into it, which is the wrong tense
      // for something that has already printed.
      what: kb.what,
      ...(mode === 'recap' ? {} : { watch: kb.watch, compass: kb.compass }),
    };
  });

  // A pin only needs `name` and `date`; anything else it carries overrides the
  // family copy matched off its name.
  const fromPins = (Array.isArray(pinned) ? pinned : [])
    .filter(p => p?.name && p?.date && future(new Date(p.date).getTime()))
    .map(p => {
      const kb = kbFor(p.name), at = etParts(p.date);
      return {
        _at: new Date(p.date).getTime(),
        name: p.name,
        when: p.when || `${at.day} — ${at.time} ET`,
        impact: p.impact || 'high',
        lines: Array.isArray(p.lines) ? p.lines : [],
        what: p.what || kb.what, watch: p.watch || kb.watch, compass: p.compass || kb.compass,
      };
    });

  return { mode, events: [...fromFeed, ...fromPins].sort((a, b) => a._at - b._at) };
}

/* ------------------------------ RENDER ----------------------------- */
// Renders a post's event array into the article, swapped in wherever the
// markdown contains an <!-- EVENTS --> marker. The prose around it stays
// evergreen either way. Where the array comes from depends on the post:
// `autoEvents: true` builds it from the live calendar at build time, otherwise
// it is the hand-written `events:` frontmatter.
function renderEvents(post) {
  const events = Array.isArray(post.events) ? post.events : [];
  // An auto page can legitimately come up empty — the feed runs about a week
  // ahead, so a Friday build sees very little. Say that plainly and point at the
  // live calendar. A silent gap where the events used to be reads as broken.
  if (!events.length) {
    if (!post.autoEvents) return '';
    return `
<section class="events">
  <p class="events-head"><b>${esc(post._range)}</b> — high-impact releases, all times ET</p>
  <div class="ev">
    <div class="ev-top"><span class="ev-name">Nothing high-impact scheduled yet</span></div>
    <p class="ev-row"><span class="ev-k">Note</span><span>The calendar publishes about a week ahead, so the next window has not filled in yet. This page refreshes daily — the releases appear here as they are scheduled. The <a href="/calendar">live economic calendar</a> in-app is always the source of truth.</span></p>
  </div>
</section>`;
  }

  const row = (k, v, cls = '') =>
    v ? `<p class="ev-row ${cls}"><span class="ev-k">${k}</span><span>${esc(v)}</span></p>` : '';

  // The window label is computed for an auto post and hand-written for the rest,
  // so a stale `weekOf:` can never outlive the events it was describing.
  const head = post.autoEvents
    ? (post._mode === 'recap'
        ? `<b>${esc(post._range)}</b> — already released, all times ET`
        : `<b>${esc(post._range)}</b> — high-impact releases, all times ET`)
    : post.weekOf ? `Week of <b>${esc(post.weekOf)}</b> — all times ET` : '';

  const recapNote = post._mode === 'recap' ? `
  <div class="ev">
    <div class="ev-top"><span class="ev-name">Next week&#39;s schedule is not out yet</span></div>
    <p class="ev-row"><span class="ev-k">Note</span><span>The economic calendar publishes the coming week over the weekend, so the releases below are the ones that have just printed rather than the ones ahead — the context you carry into next week. This page rebuilds daily, so the forward schedule appears here as soon as it is out, and the <a href="/calendar">live calendar</a> in-app carries the actual figures.</span></p>
  </div>` : '';

  return `
<section class="events">
  ${head ? `<p class="events-head">${head}</p>` : ''}${recapNote}
  ${events.map(e => {
    const impact = String(e.impact || 'high').toLowerCase();
    return `
  <div class="ev">
    <div class="ev-top">
      <span class="ev-name">${esc(e.name)}</span>
      <span class="ev-tag ${impact}">${esc(impact === 'backdrop' ? 'backdrop' : impact + ' impact')}</span>
    </div>
    ${e.when ? `<p class="ev-when">${esc(e.when)}</p>` : ''}
    ${Array.isArray(e.lines) && e.lines.length
      ? `<ul class="ev-figs">${e.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
      : ''}
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

  // One date per card, so it has to be the one that means something. A post
  // that has been refreshed says so; one that has not shows when it went up.
  const cardDate = (p) => (p.updated && p.updated !== p.date)
    ? `Updated ${fmtDate(p.updated)}`
    : fmtDate(p.date);

  const list = posts.length ? `
<ul class="post-list">
  ${posts.map(p => `
  <li>
    <p class="meta">${p.category ? `<span>${esc(p.category)}</span>` : ''}<span class="muted">${cardDate(p)}</span><span class="muted">${p.readMins} min</span></p>
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
  // The listing prints each post's refresh date where it has one, so the index
  // really does change when one moves — and posts is sorted by that same date.
  const newestPost = posts.length ? (posts[0].updated || posts[0].date) : today;
  const urls = [
    ...STATIC_ROUTES.map(r => ({
      loc: SITE_URL + r.loc,
      lastmod: r.lastmod || (r.loc === '/blog' ? newestPost : today),
      changefreq: r.changefreq,
      priority: r.priority,
    })),
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

/* Routes prerendered to real HTML with their own title, description and
   canonical. Anything not listed here falls through to app.html — fine for the
   authenticated app, wrong for a page meant to be found. /pricing stays off the
   list for now: it reads AuthContext, which has no provider in the SSR pass. */
const PRERENDER_PAGES = [
  {
    path: 'about',
    title: 'About BiasForge | Macro Research for Forex Traders',
    desc: 'BiasForge is an independent macro research tool for forex, prop firm and funded traders — one directional read per pair, with the invalidation level where it stops being valid.',
  },
  {
    path: 'terms',
    title: 'Terms of Service | BiasForge',
    desc: 'The terms covering use of BiasForge — subscriptions, acceptable use, and the limits of what the product is. Educational macro research, not financial advice.',
  },
  {
    path: 'privacy',
    title: 'Privacy Policy | BiasForge',
    desc: 'What BiasForge collects, why it collects it, and what happens to it — accounts, payments and analytics, in plain language.',
  },
  {
    path: 'refund',
    title: 'Refund Policy | BiasForge',
    desc: 'How refunds work on a BiasForge subscription: what qualifies, the window you have, and how to ask for one.',
  },
  {
    path: 'changelog',
    title: 'Changelog | BiasForge',
    desc: 'What shipped and when — every meaningful change to the bias engine, the dashboard and the prop firm tools.',
  },
  {
    path: 'contact',
    title: 'Contact BiasForge',
    desc: 'Questions about your account, billing, or a bug you have hit. Built by one funded trader, and answered by the same one.',
  },
];

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


async function loadLiveData() {
  let events = null;
  let calls = null;
  let calendarRaw = null;
  try {
    // The compass and the news feed are no longer baked. The landing page
    // renders a sample for both — see components/landing/v2/demoData.js — so
    // there is nothing to fetch here and nothing that can go stale between
    // builds. It also takes the slowest call in the build out of the build.
    //
    // The closed-call record still is baked. Those are the engine's real past
    // calls and they are the one thing on the page that has to be true.
    const [e, k] = await Promise.allSettled([
      getJson(`${API_BASE}/api/calendar`),
      getJson(`${API_BASE}/api/bias-calls`),
    ]);
    if (e.status === 'fulfilled') {
      // Kept whole as well as shaped: the hero wants three rows, the weekly page
      // wants the window. One fetch, two consumers.
      calendarRaw = Array.isArray(e.value) ? e.value : null;
      events = shapeEvents(e.value);
    }
    if (k.status === 'fulfilled' && k.value?.success && Array.isArray(k.value.calls)) calls = k.value.calls;
  } catch { /* fall through to the snapshot */ }

  // Whatever came back gets banked; whatever did not falls back to the last
  // build's values. A build must never publish an empty compass just because
  // the API blipped during CI.
  let snap = {};
  try { snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')); } catch { /* first build */ }

  const out = {
    events: events || snap.events || null,
    calls: calls || snap.calls || null,
    // Banking the calendar is safe in a way banking a price is not: the weekly
    // page only ever renders events still in the future, so a snapshot from a
    // failed build degrades to fewer cards — never to wrong ones.
    calendarRaw: calendarRaw || snap.calendarRaw || null,
  };
  if (events || calls || calendarRaw) {
    try { fs.writeFileSync(SNAPSHOT, JSON.stringify(out, null, 2)); } catch { /* read-only CI fs */ }
  }
  return { ...out, fresh: { events: !!events, calls: !!calls, calendar: !!calendarRaw } };
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

async function prerenderLanding({ events, calls, fresh }) {
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
  // app.html is the shell every non-prerendered route falls back to, so it must
  // not carry the landing page's identity. A canonical pointing at / served on
  // /pricing and every app route is a duplicate-of-homepage signal, and no
  // canonical at all is strictly better than a wrong one — the SPA sets its own
  // title on mount. `raw` itself is left alone: the prerenders below rewrite
  // that canonical rather than drop it.
  fs.writeFileSync(path.join(DIST, 'app.html'), raw
    .replace(/[ \t]*<link\s+rel=["']canonical["'][^>]*>\s*\n?/i, '')
    .replace(/[ \t]*<meta\s+property=["']og:url["'][^>]*>\s*\n?/i, ''));

  const mod = await import(pathToFileURL(SSR_ENTRY).href);

  const markup = mod.render({ events, calls });

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
    `<script>window.__BF_EVENTS__=${inlineJson(events)};` +
    `window.__BF_CALLS__=${inlineJson(calls)};</script>`;

  const rootRe = /<div id="root">\s*<\/div>/i;
  if (!rootRe.test(html)) {
    console.error('  ✗ could not find <div id="root"></div> in dist/index.html — prerender aborted.');
    process.exit(1);
  }
  html = html.replace(rootRe, `<div id="root">${markup}</div>\n    ${data}`);

  fs.writeFileSync(shell, html);

  // ── the static routes, same pipeline ──
  // Vercel checks the filesystem before rewrites, so dist/<path>/index.html is
  // served directly and the SPA route never runs for a cold visit. Every page
  // not in this list falls back to app.html, which is why the list matters: a
  // route serving the shell has no content and no identity of its own.
  for (const p of PRERENDER_PAGES) {
    let html = raw
      .replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${esc(p.title)}</title>`)
      .replace(
        /<link\s+rel=["']canonical["']\s+href=["'][^"']*["']\s*\/?>/i,
        () => `<link rel="canonical" href="${SITE_URL}/${p.path}" />`
      );
    html = setMeta(html, 'name', 'description', p.desc);
    html = setMeta(html, 'property', 'og:title', p.title);
    html = setMeta(html, 'property', 'og:description', p.desc);
    html = setMeta(html, 'property', 'og:url', `${SITE_URL}/${p.path}`);
    html = setMeta(html, 'name', 'twitter:title', p.title);
    html = setMeta(html, 'name', 'twitter:description', p.desc);

    const markup = p.path === 'about' ? mod.renderAbout() : mod.renderStatic(p.path);
    html = html.replace(rootRe, `<div id="root">${markup}</div>`);

    const dir = path.join(DIST, p.path);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    console.log(`  ✓ /${p.path} prerendered (${(Buffer.byteLength(html) / 1024).toFixed(1)} kB)`);
  }

  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`  ✓ / prerendered (${kb} kB)`);
  console.log(`      bias + news: sample (not fetched)` +
              ` · events: ${fresh.events ? 'live' : events ? 'snapshot' : 'NONE'}` +
              ` · closed calls baked: ${calls?.length ?? 0}`);
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
  // One fetch per build. The landing hero wants three rows out of it; the auto
  // pages want the whole window.
  const live = await loadLiveData();
  const posts = loadPosts();

  // Pages flagged `autoEvents:` take their event list from that calendar rather
  // than from frontmatter, which is what stops them ageing between edits. The
  // `updated` stamp is set from the build for the same reason: the window really
  // does move every day, so the date is earned rather than asserted.
  const buildDay = new Date().toISOString().slice(0, 10);
  for (const p of posts) {
    if (!p.autoEvents) continue;
    // Number.isFinite, not `||`: a deliberate 0 is a valid window and must not
    // be silently promoted back to the default.
    const n = Number(p.autoEventDays);
    const days = Number.isFinite(n) && n >= 0 ? n : AUTO_EVENT_DAYS;
    const built = buildAutoEvents(live.calendarRaw, p.pinnedEvents, days);
    p.events = built.events;
    p._mode = built.mode;
    // A recap covers the week behind it, so it must not wear the label of the
    // window ahead.
    p._range = built.mode === 'recap' ? recapRangeLabel(built.events) : autoRangeLabel(days);
    p.updated = buildDay;
    const src = live.fresh.calendar ? 'live' : live.calendarRaw ? 'snapshot' : 'NONE';
    console.log(`  · ${p.slug}: ${p.events.length} event(s), ${built.mode}, ${days}d window, calendar ${src}`);
    if (!p.events.length) console.warn(`  ! ${p.slug} has nothing on either side — page will render the placeholder`);
  }

  // Sorted by the date each card displays, not by publish date — loadPosts()
  // cannot do this, because the auto pages only get their `updated` stamp above.
  const shownDate = (p) => p.updated || p.date;
  posts.sort((a, b) => (shownDate(a) < shownDate(b) ? 1 : -1));

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
  await prerenderLanding(live);

  console.log(`› Done — ${posts.length} post(s).`);
}

run().catch(e => { console.error('  ✗ build failed:', e); process.exit(1); });
