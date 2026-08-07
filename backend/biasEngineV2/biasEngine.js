// biasEngine.js  (ESM — backend is "type":"module")
// BiasForge v2 engine — regime detection, composite() scoring, decide() hysteresis,
// model routing, main loop. The LOGIC (routing, regime, hysteresis, per-pair state)
// is the part that fixes v1's single-global-bias bugs and is unchanged from the spec.
//
// Wiring vs the reference skeleton:
//   - ESM imports (backend package.json is "type":"module")
//   - MODELS use the doc-confirmed ids (see below)
//   - callJSON disables adaptive thinking (Sonnet 5 runs it by default when omitted;
//     we want deterministic JSON, not thinking tokens)
//   - loadState/saveState target the SHADOW tables bias_state_v2 / bias_history_v2
//   - feeds.* + market access are injected by the caller (see backend/index.js buildV2Feeds)

import Anthropic from "@anthropic-ai/sdk";
import {
  CURRENCIES,
  EXTRACTION_SYSTEM, extractionUser,
  SCORING_SYSTEM, scoringUser,
  THESIS_SYSTEM, thesisUser,
} from "./prompts.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- model ids (confirmed against Anthropic model docs, 2026-07) -------------
//   Haiku 4.5  → claude-haiku-4-5  (full id claude-haiku-4-5-20251001, already used elsewhere)
//   Sonnet 5   → claude-sonnet-5   (bare id — NO date suffix)
const MODELS = {
  EXTRACTION: "claude-haiku-4-5-20251001", // cheap extraction
  SCORING:    "claude-sonnet-5",            // reasoning / judgment  (the engine's brain)
  THESIS:     "claude-sonnet-5",            // only runs on OPEN/FLIP
};

// --- tunable config ----------------------------------------------------------
// Gold disabled from v2 OUTPUT for launch — unreliable direction in headline-driven chop (real yields
// vs safe-haven vs oil/inflation conflict). Gold price still feeds cross-asset / COT / yields as an
// INPUT. Flip V2_GOLD_ENABLED to true post-launch to restore, after the gold-specific rework.
const V2_GOLD_ENABLED = false;
const V2_ALL_PAIRS = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "USDCAD", "AUDUSD", "NZDUSD", "USDCHF"];
const CONFIG = {
  OPEN_THRESHOLD: 1.8,     // |diff| needed to open a bias, and the far side needed to flip (dead-band edge).
                           // Reverted 1.0→1.8: the collapsed diffs were an INPUT bug (USD was being scored
                           // off UUP, a dollar ETF — circular, so USD pinned near 0 and shrank every
                           // composite), not a scale problem. With the yields direction now off the US2Y
                           // 3-session change, 1.8 is the right dead-band again.
                           // computeConfidence is anchored on this — its slope is re-scaled to match.
  ATR_INVALIDATION_MULT: 1.5, // FALLBACK only (when PDH/PDL unavailable): entry ± m*ATR
  INVALIDATION_ATR_BUFFER: 0, // no cushion — invalidation sits exactly at PDL/PDH (tighter, reacts faster)
  ADR_EXHAUSTION_PCT: 0.80,   // skip fresh opens if >80% of ADR already spent...
  ADR_EXHAUSTION_HIGH_ATR: 1.10, // ...but relax the cap when ATR week is hot (multiplier on the 0.80)
  MIN_HOLD_CONFIDENCE: 55,    // conviction FLOOR for an ALREADY-OPEN bias, set at the Grade-C line (55) —
                              // a held bias below Grade C (i.e. Grade D) has no real edge, so go FLAT
                              // instead of showing a confusing sub-C directional card.
                              // HELD biases only — opens/flips stay gated on OPEN_THRESHOLD alone.
  PAIRS: V2_ALL_PAIRS.filter(p => V2_GOLD_ENABLED || p !== "XAUUSD"),
  // pip size per pair for MFE/MAE + invalidation reporting
  PIP: { XAUUSD: 0.1, USDJPY: 0.01, default: 0.0001 },
};

// Regime weight vectors
const REGIMES = {
  eventHeavy: { label: "event-heavy", weights: { w1: 0.60, w2: 0.20, w3: 0.20 } },
  quiet:      { label: "quiet",       weights: { w1: 0.25, w2: 0.40, w3: 0.35 } },
};

// ---------------------------------------------------------------------------
// 1. REGIME DETECTION — from the ForexFactory calendar
// ---------------------------------------------------------------------------
function detectRegime(calendarEventsThisWeek) {
  // High-impact fundamental drivers we care about
  const HIGH_IMPACT = /CPI|Non-?Farm|NFP|FOMC|Rate Decision|ECB|BOE|Payrolls|PCE|GDP/i;
  const hasHighImpact = (calendarEventsThisWeek || []).some(
    (e) => e.impact === "high" && HIGH_IMPACT.test(e.title || "")
  );
  return hasHighImpact ? REGIMES.eventHeavy : REGIMES.quiet;
}

// ---------------------------------------------------------------------------
// 2. HELPERS for calling the API (with prompt caching on the stable system block)
// ---------------------------------------------------------------------------
// Extract the JSON substring from a model response that may include preamble/markdown
// (e.g. "Looking at the data... { ... }"). Picks whichever of {..} or [..] appears first
// as the JSON root, and trims everything before/after it.
function extractJSON(text) {
  if (!text) return "";
  const cleaned = text.replace(/```json|```/g, "").trim();
  const oi = cleaned.indexOf("{"), oj = cleaned.lastIndexOf("}");
  const ai = cleaned.indexOf("["), aj = cleaned.lastIndexOf("]");
  let start = -1, end = -1;
  if (oi !== -1 && (ai === -1 || oi < ai)) { start = oi; end = oj; }   // object root
  else if (ai !== -1) { start = ai; end = aj; }                         // array root
  return (start !== -1 && end > start) ? cleaned.slice(start, end + 1) : cleaned;
}

// Calls a model and returns { parsed, model }. Robust to preamble: extract the JSON, and on
// parse failure retry the SAME call ONCE with a stricter instruction. If it still fails, log
// the raw output and return parsed:null (never throws) so the stage degrades gracefully
// instead of 500-ing the whole run.
async function callJSON({ model, system, user, maxTokens = 1500, label, onUsage }) {
  const run = async (sys) => {
    const res = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      // Sonnet 5 runs adaptive thinking when `thinking` is omitted — disable it so this
      // stays a deterministic JSON scorer (no thinking tokens, no latency). Haiku accepts it too.
      thinking: { type: "disabled" },
      // cache_control marks the system block as cacheable → ~10% input cost on repeat runs
      system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });
    onUsage?.(label, model, res.usage);   // bill BOTH attempts if a retry happens
    return res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  };

  const t1 = await run(system);
  try { return { parsed: JSON.parse(extractJSON(t1)), model }; }
  catch (e1) { console.warn(`⚠️ [v2 ${label}] JSON parse failed (try 1): ${e1.message} — retrying stricter`); }

  const strict = system + "\n\nReturn ONLY valid JSON. No preamble, no explanation, no markdown fences.";
  const t2 = await run(strict);
  try { return { parsed: JSON.parse(extractJSON(t2)), model }; }
  catch (e2) {
    console.error(`⚠️ [v2 ${label}] JSON parse failed after retry: ${e2.message}. Raw output:\n${(t2 || "").slice(0, 800)}`);
    return { parsed: null, model };   // graceful skip — caller supplies a safe default
  }
}

// ---------------------------------------------------------------------------
// 3. PIPELINE STAGES
// ---------------------------------------------------------------------------
async function extractSignals({ cbText, newsItems }, onUsage) {
  const { parsed } = await callJSON({
    model: MODELS.EXTRACTION,
    system: EXTRACTION_SYSTEM,
    user: extractionUser({ cbText, newsItems }),
    label: "v2-extraction",
    onUsage,
  });
  return parsed ?? {};   // empty digest → scoring still runs on COT / risk basket
}

async function scoreCurrencies({ regime, digest, marketData }, onUsage) {
  const { parsed } = await callJSON({
    model: MODELS.SCORING,
    system: SCORING_SYSTEM,
    user: scoringUser({ regime, digest, marketData }),
    label: "v2-scoring",
    onUsage,
  });
  return (parsed && parsed.currencies) ? parsed.currencies : {};   // {} → composite all 0 → all HOLD_FLAT (no bias change)
}

async function writeThesis(args, onUsage) {
  const { parsed } = await callJSON({
    model: MODELS.THESIS,
    system: THESIS_SYSTEM,
    user: thesisUser(args),
    maxTokens: 400,
    label: "v2-thesis",
    onUsage,
  });
  return parsed ?? { thesis: "", invalidation_text: "" };
}

// ---------------------------------------------------------------------------
// 3b. CROSS-SECTIONAL MACRO RATE SCORE — computed in CODE, not by the model.
//
// The old design asked the model to score each currency's OWN 2Y change. G10 yields move together,
// so on a global bond rally every currency scored the same sign and `diff = base - quote` annihilated
// the signal. Rate differentials are inherently RELATIVE, so the score is now each currency's
// 3-session change expressed as a DEVIATION from the cross-sectional mean.
//
// Two distinct failure modes, deliberately NOT collapsed into one:
//   freshCount < MIN  → the cross-section cannot be computed → macro is UNKNOWN → null
//                       (callers drop macro's weight and redistribute; no phantom neutral leg)
//   spread < FLOOR    → the cross-section WAS computed and says no differential exists → a real
//                       measurement of "flat" → 0, macro keeps its weight and contributes nothing
// ---------------------------------------------------------------------------
const RATE_XSECTION = ["USD", "EUR", "JPY", "CAD", "AUD"];  // GBP/CHF/NZD have no true daily 2Y source
const RATE_LOOKBACK = 3;          // sessions
const RATE_MIN_XSECTION = 4;      // below this the mean is meaningless → null, not 0
const RATE_FLOOR_BPS = 3.0;       // measured at the 2.5th pct of 19 months of history — near-inert by design
const RATE_SHADOW_FLOOR_BPS = 6.9;// p25: logged only, never applied — evidence for a later floor decision
const RATE_MAX_STALE_SESSIONS = 3;// a currency whose newest print is older than this leaves the cross-section
// GUESS — not calibrated against outcomes. Edges were back-solved from "what macro spread clears
// OPEN_THRESHOLD 1.8", then sanity-checked against 19 months of history (score 0 lands on 36.7% of
// currency-days, ±1 on 30.1%, ±2 on 22.0%, ±3 on 8.3%, ±4/±5 on 2.9%). Do not treat as empirical.
const RATE_BANDS = [
  { max: 2, score: 0 }, { max: 4, score: 1 }, { max: 7, score: 2 },
  { max: 11, score: 3 }, { max: 16, score: 4 }, { max: Infinity, score: 5 },
];
function bandScore(devBps) {
  const s = RATE_BANDS.find((b) => Math.abs(devBps) < b.max).score;
  return devBps < 0 ? -s : s;
}

function computeMacroRateScores(rates) {
  const changes = {}, dropped = {};
  for (const c of RATE_XSECTION) {
    const h = rates?.[c]?.history;
    if (!Array.isArray(h) || h.length < RATE_LOOKBACK + 1) { dropped[c] = `history ${h?.length ?? 0}/${RATE_LOOKBACK + 1}`; continue; }
    // Staleness: the cross-section must be CONTEMPORANEOUS. Comparing one currency's week-old change
    // against another's same-day change is not a cross-section, so a lagging source is dropped, not
    // stretched. (AUD/RBA publishes ~6 business days late and is expected to fail this.)
    const ageDays = Math.floor((Date.now() - new Date(h[0].d + "T00:00:00Z").getTime()) / 86400000);
    if (ageDays > RATE_MAX_STALE_SESSIONS + 4) { dropped[c] = `stale ${ageDays}d`; continue; }
    changes[c] = +((h[0].v - h[RATE_LOOKBACK].v) * 100).toFixed(2);
  }

  const present = Object.keys(changes);
  const base = {
    scores: Object.fromEntries(RATE_XSECTION.map((c) => [c, null])),
    xsection: present, dropped, bps: changes,
    spread: null, mean: null, floor: null, shadow_floor: null,
  };
  if (present.length < RATE_MIN_XSECTION) {
    return { ...base, status: "INSUFFICIENT", reason: `xsection ${present.length} < ${RATE_MIN_XSECTION}` };
  }

  const vals = present.map((c) => changes[c]);
  const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
  const spread = +(Math.max(...vals) - Math.min(...vals)).toFixed(2);
  const shadow = spread < RATE_SHADOW_FLOOR_BPS ? "WOULD_BLOCK" : "WOULD_PASS";
  if (spread < RATE_FLOOR_BPS) {
    // measured flat → 0 for everyone IN the cross-section (weight retained), null for those outside
    const scores = Object.fromEntries(RATE_XSECTION.map((c) => [c, present.includes(c) ? 0 : null]));
    return { ...base, scores, spread, mean: +mean.toFixed(2), status: "FLOOR_FLAT", floor: "BLOCKED", shadow_floor: shadow };
  }
  const scores = Object.fromEntries(
    RATE_XSECTION.map((c) => [c, present.includes(c) ? bandScore(+(changes[c] - mean).toFixed(2)) : null]),
  );
  return { ...base, scores, spread, mean: +mean.toFixed(2), status: "OK", floor: "PASSED", shadow_floor: shadow };
}

// Composite for ONE pair. When either leg's macro is null the macro weight is removed and
// redistributed proportionally across orderflow/sentiment — for BOTH legs, so the two composites
// stay on the same basis and subtracting them remains meaningful. Weights always re-normalise to 1,
// so a redistributed composite sits on the same -5..+5 scale and OPEN_THRESHOLD keeps its meaning.
function pairComposite(scores, weights, base, quote, macroRate) {
  const macroNull = macroRate?.scores?.[base] == null || macroRate?.scores?.[quote] == null;
  const w = macroNull
    ? { w1: 0, w2: weights.w2 / (weights.w2 + weights.w3), w3: weights.w3 / (weights.w2 + weights.w3) }
    : weights;
  const of = (c) => {
    const s = scores[c] || { macro: 0, orderflow: 0, sentiment: 0 };
    return w.w1 * (s.macro ?? 0) + w.w2 * (s.orderflow ?? 0) + w.w3 * (s.sentiment ?? 0);
  };
  const nulls = [base, quote].filter((c) => macroRate?.scores?.[c] == null);
  // Decompose the diff into per-component contributions. diff === m + o + s exactly, because the
  // composite is linear in the scores. Recorded so that when a bias later resolves, WHICH component
  // actually drove it is answerable — USDCAD and EURUSD have near-identical leg divergence (4.30 vs
  // 4.17bps) yet wildly different threshold-hit rates, so the deciding factor is not macro and
  // cannot be recovered after the fact without this.
  const sb = scores[base] || { macro: 0, orderflow: 0, sentiment: 0 };
  const sq = scores[quote] || { macro: 0, orderflow: 0, sentiment: 0 };
  const contrib = {
    m: +(w.w1 * ((sb.macro ?? 0) - (sq.macro ?? 0))).toFixed(3),
    o: +(w.w2 * ((sb.orderflow ?? 0) - (sq.orderflow ?? 0))).toFixed(3),
    s: +(w.w3 * ((sb.sentiment ?? 0) - (sq.sentiment ?? 0))).toFixed(3),
  };
  return { diff: of(base) - of(quote), basis: macroNull ? "REDIST" : "FULL", weights: w, nullLegs: nulls, contrib };
}

// composite score per currency, using the active regime weights (done in CODE).
// Kept for the XAU diagnostic line and any non-pair reporting; pair decisions use pairComposite.
function composite(scores, weights) {
  const out = {};
  for (const c of CURRENCIES) {
    const s = scores[c] || { macro: 0, orderflow: 0, sentiment: 0 };
    out[c] = weights.w1 * s.macro + weights.w2 * s.orderflow + weights.w3 * s.sentiment;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. THE DECISION FUNCTION — this is where whipsaw and stuck-bias are fixed.
//    Per-pair, independent. Two flip triggers: score hysteresis OR ATR invalidation.
// ---------------------------------------------------------------------------
function pipFor(pair) {
  return CONFIG.PIP[pair] ?? CONFIG.PIP.default;
}

function newDirection(diff) {
  return diff > 0 ? "BUY" : "SELL";
}

/**
 * @param state  existing bias state for this pair, or null if flat
 * @param diff   score(base) - score(quote)
 * @param market { price, atr(weekly), adr(daily), pdh, pdl, adrUsedPct, isHighAtrWeek }
 */
function decide(state, diff, market) {
  const { price, adrUsedPct, isHighAtrWeek } = market;
  const T = CONFIG.OPEN_THRESHOLD;

  // --- currently FLAT: consider opening ---
  if (!state || state.direction === "FLAT") {
    if (Math.abs(diff) < T) return { action: "HOLD_FLAT" };

    // ADR exhaustion filter (relaxed on hot-ATR weeks)
    const cap = CONFIG.ADR_EXHAUSTION_PCT * (isHighAtrWeek ? CONFIG.ADR_EXHAUSTION_HIGH_ATR : 1);
    if (adrUsedPct > cap) return { action: "HOLD_FLAT", reason: "adr_exhausted" };

    const direction = newDirection(diff);
    return { action: "OPEN", direction, invalidation: invalidationLevel(direction, market) };
  }

  // --- currently in a BIAS: hold unless a trigger fires ---
  const dir = state.direction;

  // Trigger B: price broke the PDL (BUY) / PDH (SELL) invalidation level?
  const invalidated =
    (dir === "BUY"  && price <= state.invalidation_level) ||
    (dir === "SELL" && price >= state.invalidation_level);

  // Trigger A: score crossed the HARD opposite threshold (regime genuinely reversed)?
  const scoreFlipped =
    (dir === "BUY"  && diff <= -T) ||
    (dir === "SELL" && diff >= T);

  if (invalidated || scoreFlipped) {
    // If the score still supports the same side but price broke the level, go FLAT (don't force a flip).
    const stillSameSide = dir === newDirection(diff);
    if (invalidated && stillSameSide) {
      return { action: "CLOSE", reason: "level_break" }; // exit to flat, wait for re-setup
    }
    const direction = newDirection(diff);
    return {
      action: "FLIP",
      direction,
      invalidation: invalidationLevel(direction, market),
      reason: invalidated ? "level_break" : "regime_reversal",
    };
  }

  // otherwise: HOLD (this is correct behaviour, e.g. NZDUSD for 2 days)
  return { action: "HOLD" };
}

// Hybrid PDH/PDL invalidation: a BUY dies below the Previous Day Low, a SELL dies above the
// Previous Day High, with a small buffer (× daily ATR) so a wick/stop-hunt through the level
// doesn't falsely invalidate — only a genuine break past PDL/PDH does. Falls back to ATR-distance
// only when PDH/PDL are unavailable.
function invalidationLevel(direction, market) {
  const { price, atr, adr, pdh, pdl } = market;
  const buffer = CONFIG.INVALIDATION_ATR_BUFFER * (adr ?? atr ?? 0);
  if (direction === "BUY") return (pdl != null) ? pdl - buffer : price - CONFIG.ATR_INVALIDATION_MULT * atr;
  return (pdh != null) ? pdh + buffer : price + CONFIG.ATR_INVALIDATION_MULT * atr;
}

// ---------------------------------------------------------------------------
// 5. SUPABASE state — SHADOW tables. One row per pair in bias_state_v2 = current bias.
//    bias_history_v2 keeps every open/flip/close. See bias_state_v2.sql.
// ---------------------------------------------------------------------------
async function loadState(supabase, pair) {
  const { data, error } = await supabase.from("bias_state_v2").select("*").eq("pair", pair).maybeSingle();
  // supabase-js returns { data, error } — it does NOT throw. Log so a missing table can't fail silently.
  if (error) console.error(`⚠️ [v2 db] loadState(${pair}) failed: ${error.message}${error.code ? ` (${error.code})` : ""}`);
  return data || null;
}
// ---------------------------------------------------------------------------
// 5b. CONFIDENCE + GRADE — deterministic, derived from data we already have.
//     This is SIGNAL STRENGTH, not a win rate: how much of the evidence lines up
//     behind the direction, and whether the entry is still fresh.
//       |diff|      — how far past the 1.8 open threshold the score sits
//       alignment   — do macro / orderflow / sentiment agree in sign, or fight each other
//       adrUsedPct  — a bias found after the day's range is spent is a worse entry
//                     (expects 0..100 here; getPairMarket returns a 0..1 fraction, so the
//                      call site scales it — see runEngine)
//     Recomputed every run (including HOLD) so a decaying bias visibly loses conviction
//     instead of sitting at its opening number until it flips.
// ---------------------------------------------------------------------------
function computeConfidence({ diff, baseScores, quoteScores, adrUsedPct }) {
  const mag = Math.abs(diff);
  // 1.8 (threshold) → 60, 4.5+ → 88. Below threshold decays toward 45.
  let conf = mag >= CONFIG.OPEN_THRESHOLD
    ? 60 + Math.min(28, (mag - CONFIG.OPEN_THRESHOLD) * 10.4)
    : 45 + (mag / CONFIG.OPEN_THRESHOLD) * 15;
  // Component alignment: count how many of the three components point the same way as `diff`.
  const sign = diff > 0 ? 1 : diff < 0 ? -1 : 0;
  const comps = ["macro", "orderflow", "sentiment"];
  let agree = 0, against = 0;
  if (sign !== 0) {
    for (const k of comps) {
      const net = (baseScores?.[k] ?? 0) - (quoteScores?.[k] ?? 0);
      if (net === 0) continue;
      if (Math.sign(net) === sign) agree++; else against++;
    }
    conf += agree * 4 - against * 6;   // conflict costs more than agreement pays
  }
  // Entry timing — the day's range is largely spent, so the edge is worse.
  const adr = adrUsedPct ?? 0;
  let timing = "FRESH";
  if (adr >= 80) { conf -= 12; timing = "LATE"; }
  else if (adr >= 60) { conf -= 6; timing = "EXTENDED"; }
  conf = Math.max(40, Math.min(92, Math.round(conf)));
  // Grade folds conviction and timing together — an A needs both.
  let grade;
  if (conf >= 82 && timing === "FRESH") grade = "A";
  else if (conf >= 74) grade = timing === "LATE" ? "B" : "A-";
  else if (conf >= 64) grade = timing === "LATE" ? "C" : "B";
  else if (conf >= 55) grade = "C";
  else grade = "D";
  return { confidence: conf, grade, timing, agree, against };
}
async function saveState(supabase, pair, obj) {
  const { error: e1 } = await supabase.from("bias_state_v2").upsert({ pair, ...obj, updated_at: new Date().toISOString() });
  if (e1) console.error(`⚠️ [v2 db] saveState upsert bias_state_v2(${pair}) failed: ${e1.message}${e1.code ? ` (${e1.code})` : ""}`);
  // also append to bias_history_v2 for the "Bias History" panel
  const { error: e2 } = await supabase.from("bias_history_v2").insert({ pair, ...obj, created_at: new Date().toISOString() });
  if (e2) console.error(`⚠️ [v2 db] saveState insert bias_history_v2(${pair}) failed: ${e2.message}${e2.code ? ` (${e2.code})` : ""}`);
}

// ---------------------------------------------------------------------------
// 6. MAIN LOOP — run this from a cron (e.g. every 30 min) or the shadow endpoint.
//    feeds = data-access layer injected by the caller. onUsage = optional cost hook.
// ---------------------------------------------------------------------------
async function runEngine({ supabase, feeds, onUsage }) {
  const calendar    = await feeds.getCalendarThisWeek();     // [{title, impact}]
  const cbText      = await feeds.getCentralBankText();      // raw string
  const newsItems   = await feeds.getNewsHeadlines();        // [string]
  const cot         = await feeds.getCOT();                  // { USD:{net, change}, ..., XAU:{...} }
  const riskBasket  = await feeds.getRiskBasket();           // { vix, gold, dxy, spx, jpy, chf }
  const yields      = await feeds.getYields?.();             // { y2, y10 } — real-rate proxy for XAU macro
  const rates       = await feeds.getRates?.();              // { USD:{value,change}, EUR:{...}, CAD:{...} } — 2Y govt yields

  const regime = detectRegime(calendar);

  // Cross-sectional macro rate scores are computed HERE, in code, before the model runs — the model
  // receives them as a given and may only nudge by ±1 for CB stance / data surprises. Asking it to
  // do the cross-sectional maths is what produced the all-zero collapse this replaces.
  const macroRate = computeMacroRateScores(rates);
  const warnings = [];

  // Observability is not optional here: the live cross-section is only 4 currencies deep against a
  // MIN of 4, so ONE source failing nulls macro for every pair. That must never happen quietly.
  console.log(`   [v2 macro] regime=${regime.label} status=${macroRate.status} xsection=${macroRate.xsection.length}/${RATE_XSECTION.length}`
    + ` spread=${macroRate.spread ?? "n/a"}bps floor=${RATE_FLOOR_BPS}:${macroRate.floor ?? "n/a"}`
    + ` shadow_floor=${RATE_SHADOW_FLOOR_BPS}:${macroRate.shadow_floor ?? "n/a"}`
    + `${Object.keys(macroRate.dropped).length ? ` dropped={${Object.entries(macroRate.dropped).map(([c, r]) => `${c}:${r}`).join(" ")}}` : ""}`);
  console.log(`   [v2 macro] bps=${JSON.stringify(macroRate.bps)} mean=${macroRate.mean ?? "n/a"} scores=${JSON.stringify(macroRate.scores)}`);
  if (macroRate.status === "INSUFFICIENT") {
    const msg = `[v2 macro] DEGRADED — ${macroRate.reason} → macro NULL for ALL pairs this run (dropped: ${Object.keys(macroRate.dropped).join(", ") || "none"})`;
    console.error(`🚨 ${msg}`);
    warnings.push(msg);
  }

  const digest = await extractSignals({ cbText, newsItems }, onUsage);                                     // Haiku
  const scores = await scoreCurrencies({ regime, digest, marketData: { cot, riskBasket, yields, rates, macroRate } }, onUsage); // Sonnet 5
  const comp   = composite(scores, regime.weights);

  // XAU is scored as its own asset (macro=real-yields/Fed, orderflow=gold COT, sentiment=risk-off),
  // so the XAUUSD bias below is Score(XAU) − Score(USD), not just inverted USD.
  const xs = scores["XAU"] || { macro: 0, orderflow: 0, sentiment: 0 };
  console.log(`   [v2 xau] macro=${xs.macro} orderflow=${xs.orderflow} sentiment=${xs.sentiment} composite=${(comp["XAU"] ?? 0).toFixed(2)}`);

  const results = [];
  for (const pair of CONFIG.PAIRS) {
    const base = pair.slice(0, 3);
    const quote = pair.slice(3, 6);
    const pc = pairComposite(scores, regime.weights, base, quote, macroRate);
    const diff = pc.diff;
    // Marks whether this pair's diff includes macro or is orderflow+sentiment only, so later
    // before/after comparisons stay apples-to-apples.
    console.log(`   [v2 diff] ${pair} diff=${diff >= 0 ? "+" : ""}${diff.toFixed(2)} macro=${pc.basis}${pc.basis === "REDIST" ? `(null:${pc.nullLegs.join(",")})` : ""}`
      + ` w=${pc.weights.w1.toFixed(2)}/${pc.weights.w2.toFixed(2)}/${pc.weights.w3.toFixed(2)}`);

    const market = await feeds.getPairMarket(pair);
    if (!market || market.price == null || market.atr == null) {
      results.push({ pair, diff: +diff.toFixed(2), action: "SKIP", reason: "no_market_data", macro_basis: pc.basis });
      continue;
    }
    const { price, atr } = market;
    const state = await loadState(supabase, pair);
    const d = decide(state, diff, market);
    const conf = computeConfidence({
      diff,
      baseScores: scores[base],
      quoteScores: scores[quote],
      // getPairMarket returns a 0..1 FRACTION; computeConfidence's thresholds are 0..100.
      adrUsedPct: (market.adrUsedPct ?? 0) * 100,
    });

    // CONVICTION FLOOR — an already-open bias whose refreshed conviction has decayed below the floor
    // is closed to FLAT. Applied only to HELD biases: opens and flips keep their OPEN_THRESHOLD gate,
    // and the invalidation/flip triggers in decide() are untouched. Turning the HOLD into a CLOSE here
    // (rather than closing it inline) reuses the existing close path — same history row, same result.
    if (state && state.direction !== "FLAT" && (d.action === "HOLD" || d.action === "HOLD_FLAT")
        && conf.confidence < CONFIG.MIN_HOLD_CONFIDENCE) {
      console.log(`   [v2 floor] ${pair} conviction ${conf.confidence} < ${CONFIG.MIN_HOLD_CONFIDENCE} → CLOSE to FLAT`);
      d.action = "CLOSE";
      d.reason = "conviction_floor";
    }

    if (d.action === "OPEN" || d.action === "FLIP") {
      const thesis = await writeThesis({                                    // Sonnet 5, only on change
        pair,
        direction: d.direction,
        scores: { base: scores[base], quote: scores[quote] },
        invalidationLevel: d.invalidation,
        drivers: { regime: regime.label, diff: diff.toFixed(2) },
      }, onUsage);
      await saveState(supabase, pair, {
        direction: d.direction,
        invalidation_level: d.invalidation,
        thesis: thesis.thesis,
        invalidation_text: thesis.invalidation_text,
        entry_price: price,
        atr_at_entry: atr,
        diff_at_entry: diff,
        regime: regime.label,
        confidence: conf.confidence,
        grade: conf.grade,
        entry_timing: conf.timing,
        opened_at: new Date().toISOString(),
        status: "running",
      });
    } else if (d.action === "CLOSE") {
      await saveState(supabase, pair, { direction: "FLAT", status: "closed", closed_reason: d.reason, confidence: null, grade: null });
    } else {
      // HOLD / HOLD_FLAT — keep the bias, but refresh conviction so a decaying thesis shows it.
      // This is a state refresh, NOT a bias change: no history row, no thesis call.
      if (state && state.direction !== "FLAT") {
        await feeds.updateRunning?.(pair, price);

        // TRAILING (ratchet) invalidation. Pehle invalidation sirf OPEN/FLIP pe set hoti thi aur HOLD pe
        // kabhi refresh nahi hoti — toh multi-day bias apne open-din ka PDL/PDH pakde rakhti thi, current
        // daily structure se door drift kar jaati (stale + too loose dikhti). Ab aaj ke PDL/PDH se recompute
        // karo, par level sirf FAVOURABLE direction mein move karo (BUY = upar, SELL = neeche) aur sirf tab
        // jab wo price ke sahi side rahe. Kabhi loosen nahi, risk widen nahi, khud ko instant-invalidate nahi.
        const freshInval = invalidationLevel(state.direction, market);
        let ratchetInval = state.invalidation_level;
        if (freshInval != null) {
          if (state.direction === "BUY" && freshInval < price && (ratchetInval == null || freshInval > ratchetInval)) {
            ratchetInval = freshInval;
          } else if (state.direction === "SELL" && freshInval > price && (ratchetInval == null || freshInval < ratchetInval)) {
            ratchetInval = freshInval;
          }
        }
        const invalMoved = ratchetInval != null && ratchetInval !== state.invalidation_level;

        // Number aur prose ko in-sync rakho — card kabhi aisa level na dikhaye jo apni text se disagree kare.
        // Sirf tab overwrite karo jab level actually move hua; warna original AI-written reasoning rehne do.
        const dp = pair.includes("JPY") ? 3 : pair === "XAUUSD" ? 2 : 5;
        const invalText = invalMoved
          ? `A daily close ${state.direction === "BUY" ? "below" : "above"} ${ratchetInval.toFixed(dp)} would break the ${state.direction === "BUY" ? "bullish" : "bearish"} structure and invalidate this bias.`
          : state.invalidation_text;

        const patch = { confidence: conf.confidence, grade: conf.grade, entry_timing: conf.timing, updated_at: new Date().toISOString() };
        if (ratchetInval != null) patch.invalidation_level = ratchetInval;
        if (invalMoved) patch.invalidation_text = invalText;

        const { error } = await supabase.from("bias_state_v2")
          .update(patch)
          .eq("pair", pair);
        if (error) console.error(`⚠️ [v2 db] confidence refresh(${pair}) failed: ${error.message}`);
        if (invalMoved) console.log(`   [v2 trail] ${pair} invalidation ${state.direction === "BUY" ? "↑" : "↓"} ${Number(state.invalidation_level).toFixed(dp)} → ${ratchetInval.toFixed(dp)}`);
      }
    }

    // When a bias ENDS — CLOSE, or a FLIP which closes the prior direction — capture how it actually
    // did. bias_history_v2 has no mfe/mae columns and bias_state_v2's row is overwritten on the next
    // transition, so these numbers cannot be reconstructed after the fact. `state` here is still the
    // PRE-run state (saveState above doesn't reassign it), which is exactly the bias being ended.
    // NOTE: mfe/mae are as of the last HOLD refresh, so an excursion between runs is not captured.
    let outcome = null;
    if ((d.action === "CLOSE" || d.action === "FLIP") && state?.direction && state.direction !== "FLAT") {
      const dir = state.direction === "BUY" ? 1 : -1;
      outcome = {
        pair, ended_by: d.action, closed_reason: d.reason || null, direction: state.direction,
        entry_price: state.entry_price ?? null, exit_price: price,
        realized_pips: state.entry_price != null ? +(((price - state.entry_price) * dir) / pipFor(pair)).toFixed(1) : null,
        mfe: state.mfe ?? null, mae: state.mae ?? null,
        diff_at_entry: state.diff_at_entry ?? null, grade_at_entry: state.grade ?? null,
        macro_basis_now: pc.basis,
        opened_at: state.opened_at ?? null,
        held_hours: state.opened_at ? +((Date.now() - new Date(state.opened_at).getTime()) / 3600000).toFixed(1) : null,
      };
      console.log(`   [v2 outcome] ${pair} ${state.direction} ended_by=${d.action}${d.reason ? `/${d.reason}` : ""}`
        + ` realized=${outcome.realized_pips}p mfe=${outcome.mfe} mae=${outcome.mae} held=${outcome.held_hours}h`);
    }

    results.push({ pair, diff: +diff.toFixed(2), action: d.action, direction: d.direction || state?.direction || "FLAT", reason: d.reason, invalidation: d.invalidation, confidence: conf.confidence, grade: conf.grade, macro_basis: pc.basis, contrib: pc.contrib, outcome });
  }

  // macro_rate + warnings ride out in the response so a degraded cross-section is visible from the
  // shadow endpoint without needing log access — that gap is exactly how this went unnoticed before.
  return { regime: regime.label, scores, results, macro_rate: macroRate, warnings };
}

export {
  CONFIG, REGIMES, MODELS,
  detectRegime, composite, decide, invalidationLevel, pipFor,
  extractSignals, scoreCurrencies, writeThesis,
  runEngine,
};
