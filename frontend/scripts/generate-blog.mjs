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
import { fileURLToPath } from 'node:url';
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

// Non-blog routes for the sitemap — keep roughly in sync with the app.
const STATIC_ROUTES = [
  { loc: '/',          changefreq: 'daily',   priority: '1.0' },
  { loc: '/pricing',   changefreq: 'weekly',  priority: '0.9' },
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
function renderPost(post) {
  const url = `${SITE_URL}/blog/${post.slug}`;
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
  itemListElement: [
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
    ${post.html}
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
    url: `${SITE_URL}/blog/${p.slug}`, datePublished: p.date,
    author: { '@type': 'Person', name: AUTHOR },
  })),
})}`;

  const list = posts.length ? `
<ul class="post-list">
  ${posts.map(p => `
  <li>
    <p class="meta">${p.category ? `<span>${esc(p.category)}</span>` : ''}<span class="muted">${fmtDate(p.date)}</span><span class="muted">${p.readMins} min</span></p>
    <h2><a href="${SITE_URL}/blog/${p.slug}">${esc(p.title)}</a></h2>
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
    ...posts.map(p => ({ loc: `${SITE_URL}/blog/${p.slug}`, lastmod: p.updated || p.date, changefreq: 'monthly', priority: '0.7' })),
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
${posts.map(p => `- [${p.title}](${SITE_URL}/blog/${p.slug}): ${p.description}`).join('\n')}
`;
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

function run() {
  console.log('› Generating static blog…');
  if (!fs.existsSync(DIST)) {
    console.error('  ✗ dist/ not found — run `vite build` first.');
    process.exit(1);
  }
  const posts = loadPosts();
  fs.mkdirSync(OUT_BLOG, { recursive: true });

  for (const p of posts) {
    const dir = path.join(OUT_BLOG, p.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), renderPost(p));
    console.log(`  ✓ /blog/${p.slug}`);
  }

  fs.writeFileSync(path.join(OUT_BLOG, 'index.html'), renderIndex(posts));
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), renderSitemap(posts));
  fs.writeFileSync(path.join(DIST, 'llms.txt'), renderLlms(posts));

  console.log(`  ✓ /blog (index), sitemap.xml, llms.txt`);
  console.log(`› Done — ${posts.length} post(s).`);
}

run();
