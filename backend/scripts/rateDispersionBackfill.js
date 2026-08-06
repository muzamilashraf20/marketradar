// ---------------------------------------------------------------------------
// STANDALONE rate-dispersion backfill — TEMPORARY, read-only, diagnostic.
//
// Imports NOTHING from the engine (no index.js, no biasEngineV2, not even axios).
// Writes NO cache, NO Supabase, NO engine state. Touches no env var. Pure function
// of public sovereign-yield statistics → dispersion stats on stdout / as JSON.
//
// Purpose: the v2 macro rework scores each currency's 2Y move as a DEVIATION from
// the G10 cross-sectional mean, gated by a minimum-dispersion floor. Both the floor
// (3bps) and the -5..+5 band edges are currently GUESSES. This measures the real
// historical distribution so they can be set from data instead.
//
// Cross-section mirrors the LIVE engine's set exactly — USD, EUR, JPY, CAD, AUD.
// GBP/CHF/NZD are excluded here because they are excluded live (no true daily 2Y
// source); calibrating on a wider set than the engine can score would bias the result.
//
// One bulk request per source (each serves full history in a single file), fetched
// sequentially with a gap. None of these are TwelveData, so the engine's credit
// limiter is unaffected.
// ---------------------------------------------------------------------------

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const LOOKBACK_SESSIONS = 3;   // matches the engine: today vs 3 trading sessions back
const MIN_XSECTION = 4;        // engine's freshCount floor
const FLOOR_BPS = 3.0;         // engine's guessed dispersion floor — the value under test

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { latin1 = false, json = false } = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (json) return res.json();
  if (latin1) return Buffer.from(await res.arrayBuffer()).toString('latin1');
  return res.text();
}

// split a CSV line on commas, stripping surrounding quotes (no embedded commas in these feeds)
const cells = (line) => line.split(',').map((s) => s.trim().replace(/^"|"$/g, '').trim());

// --- USD — US Treasury daily yield curve (keyless; FRED needs a key, this does not) ---
async function usd(years) {
  const rows = [];
  for (const y of years) {
    const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all`
      + `?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&_format=csv`;
    const txt = await get(url);
    const lines = txt.split(/\r?\n/).filter((l) => l.trim());
    const head = cells(lines[0]);
    const col = head.findIndex((h) => /^2\s*Yr$/i.test(h));
    if (col < 0) throw new Error('"2 Yr" column not found');
    for (const l of lines.slice(1)) {
      const c = cells(l);
      const m = (c[0] || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);   // MM/DD/YYYY
      const v = parseFloat(c[col]);
      if (m && !isNaN(v)) rows.push({ d: `${m[3]}-${m[1]}-${m[2]}`, v });
    }
    await sleep(1500);
  }
  return rows;
}

// --- EUR — ECB SDMX AAA yield curve, 2Y spot ---
async function eur(n) {
  const j = await get(
    `https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y?lastNObservations=${n}&format=jsondata`,
    { json: true },
  );
  const series = j?.dataSets?.[0]?.series;
  const k = series && Object.keys(series)[0];
  const obs = k ? series[k].observations : null;
  const times = j?.structure?.dimensions?.observation?.[0]?.values || [];
  if (!obs) throw new Error('no observations');
  return Object.entries(obs)
    .map(([i, v]) => ({ d: times[+i]?.id, v: v?.[0] }))
    .filter((o) => o.d && o.v != null)
    .map((o) => ({ d: o.d, v: +(+o.v).toFixed(4) }));
}

// --- CAD — Bank of Canada Valet, 2Y benchmark ---
async function cad(n) {
  const id = 'BD.CDN.2YR.DQ.YLD';
  const j = await get(`https://www.bankofcanada.ca/valet/observations/${id}/json?recent=${n}`, { json: true });
  return (j?.observations || [])
    .map((o) => ({ d: o.d, v: parseFloat(o[id]?.v) }))
    .filter((o) => o.d && !isNaN(o.v));
}

// --- JPY — MoF JGB full history (the live engine reads the month-to-date file, which
//     carries <4 rows early each month and so cannot yield a 3-session change) ---
async function jpy() {
  const txt = await get(
    'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv',
    { latin1: true },
  );
  const lines = txt.split(/\r?\n/);
  const hi = lines.findIndex((l) => /^Date,/i.test(l));
  if (hi < 0) throw new Error('header row not found');
  const col = cells(lines[hi]).findIndex((h) => /^2Y$/i.test(h));
  if (col < 0) throw new Error('"2Y" column not found');
  const rows = [];
  for (const l of lines.slice(hi + 1)) {
    const c = cells(l);
    const m = (c[0] || '').match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    const v = parseFloat(c[col]);                                   // MoF marks gaps with '-'
    if (m && !isNaN(v)) rows.push({ d: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, v });
  }
  return rows;
}

// --- AUD — RBA table F2, interpolated 2Y government bond yield ---
async function aud() {
  const txt = await get('https://www.rba.gov.au/statistics/tables/csv/f2-data.csv', { latin1: true });
  const lines = txt.split(/\r?\n/);
  const idRow = lines.findIndex((l) => /^Series ID,/i.test(l));
  if (idRow < 0) throw new Error('"Series ID" row not found');
  const col = cells(lines[idRow]).findIndex((h) => h === 'FCMYGBAG2D');
  if (col < 0) throw new Error('FCMYGBAG2D column not found');
  const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
  const rows = [];
  for (const l of lines.slice(idRow + 1)) {
    const c = cells(l);
    const m = (c[0] || '').match(/^(\d{2})-(\w{3})-(\d{4})$/);
    if (!m || !MON[m[2]]) continue;
    const v = parseFloat(c[col]);
    if (!isNaN(v)) rows.push({ d: `${m[3]}-${MON[m[2]]}-${m[1]}`, v });
  }
  return rows;
}

// --- stats helpers ---
const asc = (a) => [...a].sort((x, y) => x - y);
const pct = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))] : null);
const r1 = (n) => (n == null ? null : +n.toFixed(1));
// what percentile does `v` sit at within `sorted` (fraction of samples at or below v)
const pctOf = (sorted, v) => (sorted.length ? +((sorted.filter((x) => x <= v).length / sorted.length) * 100).toFixed(1) : null);

// The band edges currently GUESSED in the engine plan — reported here as hit-rates so the
// guess can be judged, NOT applied. Changing them is a separate, human-confirmed decision.
const GUESSED_BANDS = [
  { max: 2, score: 0 }, { max: 4, score: 1 }, { max: 7, score: 2 },
  { max: 11, score: 3 }, { max: 16, score: 4 }, { max: Infinity, score: 5 },
];
const bandOf = (absDev) => GUESSED_BANDS.find((b) => absDev < b.max).score;

export async function runBackfill({ obs = 400, exclude = [] } = {}) {
  const startedAt = new Date().toISOString();
  const thisYear = new Date().getUTCFullYear();

  const sources = [
    ['USD', () => usd([thisYear, thisYear - 1])],
    ['EUR', () => eur(obs)],
    ['CAD', () => cad(obs)],
    ['JPY', () => jpy()],
    ['AUD', () => aud()],
  ].filter(([c]) => !exclude.includes(c));

  const levels = {}, fetchLog = {};
  for (const [ccy, fn] of sources) {
    try {
      const rows = await fn();
      const byDate = new Map();
      for (const r of rows) byDate.set(r.d, r.v);            // dedupe, keep last
      const sorted = [...byDate.entries()].map(([d, v]) => ({ d, v })).sort((a, b) => (a.d < b.d ? 1 : -1)); // newest first
      levels[ccy] = sorted;
      fetchLog[ccy] = { ok: true, rows: sorted.length, newest: sorted[0]?.d ?? null, oldest: sorted[sorted.length - 1]?.d ?? null };
    } catch (e) {
      levels[ccy] = [];
      fetchLog[ccy] = { ok: false, error: e?.message || String(e) };
    }
    await sleep(1500);   // be polite; these are public statistical services
  }

  // Per-currency 3-session change (bps), indexed by the date it is observed ON.
  // Each currency uses its OWN session sequence, exactly as the engine will.
  const changes = {};
  for (const [ccy, series] of Object.entries(levels)) {
    const m = new Map();
    for (let i = 0; i + LOOKBACK_SESSIONS < series.length; i++) {
      m.set(series[i].d, +((series[i].v - series[i + LOOKBACK_SESSIONS].v) * 100).toFixed(2));
    }
    changes[ccy] = m;
  }

  // Cross-section per date, restricted to the window every source can cover.
  const allDates = new Set();
  for (const m of Object.values(changes)) for (const d of m.keys()) allDates.add(d);
  const dates = [...allDates].sort().reverse();

  const perDate = [], spreads = [], absDevs = [], counts = [];
  for (const d of dates) {
    const row = {};
    for (const [ccy, m] of Object.entries(changes)) if (m.has(d)) row[ccy] = m.get(d);
    const vals = Object.values(row);
    counts.push(vals.length);
    if (vals.length < MIN_XSECTION) { perDate.push({ d, n: vals.length, skipped: 'below_min_xsection' }); continue; }
    const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
    const spread = Math.max(...vals) - Math.min(...vals);
    const dev = Object.fromEntries(Object.entries(row).map(([c, v]) => [c, +(v - mean).toFixed(2)]));
    spreads.push(spread);
    for (const v of Object.values(dev)) absDevs.push(Math.abs(v));
    perDate.push({ d, n: vals.length, spread: +spread.toFixed(2), mean: +mean.toFixed(2), bps: row, dev, floor_blocks: spread < FLOOR_BPS });
  }

  const sSpread = asc(spreads), sDev = asc(absDevs);
  const scored = perDate.filter((r) => r.spread != null);
  const passFloor = scored.filter((r) => !r.floor_blocks);

  // What the GUESSED bands would actually produce downstream. This is the number that decides
  // whether OPEN_THRESHOLD 1.8 is reachable: macro contributes w1 x (score[base] - score[quote]).
  // Reported for judgement only — the bands are not changed here.
  const signedBand = (d) => (d < 0 ? -bandOf(Math.abs(d)) : bandOf(Math.abs(d)));
  const FULL_PAIRS = [['EUR', 'USD'], ['USD', 'JPY'], ['USD', 'CAD'], ['AUD', 'USD']];
  const macroSpreads = [], pairContrib = {};
  for (const [b, q] of FULL_PAIRS) pairContrib[`${b}${q}`] = [];
  for (const r of passFloor) {
    const sc = Object.fromEntries(Object.entries(r.dev).map(([c, v]) => [c, signedBand(v)]));
    const vals = Object.values(sc);
    macroSpreads.push(Math.max(...vals) - Math.min(...vals));
    for (const [b, q] of FULL_PAIRS) {
      if (sc[b] == null || sc[q] == null) continue;
      pairContrib[`${b}${q}`].push(Math.abs(sc[b] - sc[q]));
    }
  }
  const sMacro = asc(macroSpreads);
  const W1_EVENT = 0.60, W1_QUIET = 0.25;
  const contribStats = (arr, w1) => {
    const s = asc(arr.map((x) => +(x * w1).toFixed(2)));
    return {
      n: s.length, median: pct(s, 0.5), p75: pct(s, 0.75), p90: pct(s, 0.9), max: pct(s, 1),
      pct_ge_1_8: s.length ? +((s.filter((x) => x >= 1.8).length / s.length) * 100).toFixed(1) : null,
    };
  };

  // band hit-rate under the GUESSED edges, counted only on days that clear the floor
  const bandHits = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of passFloor) for (const v of Object.values(r.dev)) bandHits[bandOf(Math.abs(v))]++;
  const bandTotal = Object.values(bandHits).reduce((s, x) => s + x, 0) || 1;

  return {
    meta: {
      started_at: startedAt,
      lookback_sessions: LOOKBACK_SESSIONS,
      min_xsection: MIN_XSECTION,
      floor_bps_under_test: FLOOR_BPS,
      cross_section: Object.keys(levels),
      note: 'GBP/CHF/NZD excluded — no true daily 2Y source, so the live engine cannot score them either.',
    },
    sources: fetchLog,
    coverage: {
      dates_with_any_data: dates.length,
      dates_scored: scored.length,
      xsection_size_histogram: counts.reduce((a, n) => ((a[n] = (a[n] || 0) + 1), a), {}),
    },
    dispersion_bps: {
      n: sSpread.length,
      min: r1(pct(sSpread, 0)), p10: r1(pct(sSpread, 0.1)), p25: r1(pct(sSpread, 0.25)),
      median: r1(pct(sSpread, 0.5)),
      p75: r1(pct(sSpread, 0.75)), p90: r1(pct(sSpread, 0.9)), max: r1(pct(sSpread, 1)),
    },
    floor_verdict: {
      floor_bps: FLOOR_BPS,
      percentile_of_floor: pctOf(sSpread, FLOOR_BPS),
      days_blocked: scored.length - passFloor.length,
      days_scored: scored.length,
      pct_days_blocked: scored.length ? +(((scored.length - passFloor.length) / scored.length) * 100).toFixed(1) : null,
    },
    abs_deviation_bps: {
      n: sDev.length,
      median: r1(pct(sDev, 0.5)), p75: r1(pct(sDev, 0.75)),
      p90: r1(pct(sDev, 0.9)), p95: r1(pct(sDev, 0.95)), max: r1(pct(sDev, 1)),
    },
    guessed_band_hit_rate: Object.fromEntries(
      Object.entries(bandHits).map(([s, n]) => [`score_${s}`, `${n} (${((n / bandTotal) * 100).toFixed(1)}%)`]),
    ),
    // Downstream consequence of the guessed bands — does macro alone reach OPEN_THRESHOLD 1.8?
    macro_score_spread: {
      n: sMacro.length, median: pct(sMacro, 0.5), p75: pct(sMacro, 0.75), p90: pct(sMacro, 0.9), max: pct(sMacro, 1),
    },
    macro_contribution_event_heavy: {
      best_pair_of_day: contribStats(macroSpreads, W1_EVENT),
      per_pair: Object.fromEntries(Object.entries(pairContrib).map(([p, a]) => [p, contribStats(a, W1_EVENT)])),
    },
    macro_contribution_quiet: {
      best_pair_of_day: contribStats(macroSpreads, W1_QUIET),
      per_pair: Object.fromEntries(Object.entries(pairContrib).map(([p, a]) => [p, contribStats(a, W1_QUIET)])),
    },
    sample_recent: perDate.slice(0, 12),
  };
}
