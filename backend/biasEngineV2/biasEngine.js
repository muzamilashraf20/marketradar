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
const CONFIG = {
  OPEN_THRESHOLD: 2.5,     // |diff| needed to open a bias, and the far side needed to flip (dead-band edge)
  ATR_INVALIDATION_MULT: 1.5, // invalidation = entry ± m*ATR
  ADR_EXHAUSTION_PCT: 0.80,   // skip fresh opens if >80% of ADR already spent...
  ADR_EXHAUSTION_HIGH_ATR: 1.10, // ...but relax the cap when ATR week is hot (multiplier on the 0.80)
  PAIRS: ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "USDCAD", "AUDUSD", "NZDUSD", "USDCHF"],
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

// composite score per currency, using the active regime weights (done in CODE)
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
 * @param price  current price
 * @param atr    weekly ATR (price units)
 * @param adrUsedPct  fraction of ADR already spent today (0..1)
 * @param isHighAtrWeek boolean
 */
function decide(state, diff, price, atr, adrUsedPct, isHighAtrWeek) {
  const T = CONFIG.OPEN_THRESHOLD;

  // --- currently FLAT: consider opening ---
  if (!state || state.direction === "FLAT") {
    if (Math.abs(diff) < T) return { action: "HOLD_FLAT" };

    // ADR exhaustion filter (relaxed on hot-ATR weeks)
    const cap = CONFIG.ADR_EXHAUSTION_PCT * (isHighAtrWeek ? CONFIG.ADR_EXHAUSTION_HIGH_ATR : 1);
    if (adrUsedPct > cap) return { action: "HOLD_FLAT", reason: "adr_exhausted" };

    const direction = newDirection(diff);
    return { action: "OPEN", direction, invalidation: invalidationLevel(direction, price, atr) };
  }

  // --- currently in a BIAS: hold unless a trigger fires ---
  const dir = state.direction;

  // Trigger B: ATR price invalidation breached?
  const invalidated =
    (dir === "BUY"  && price <= state.invalidation_level) ||
    (dir === "SELL" && price >= state.invalidation_level);

  // Trigger A: score crossed the HARD opposite threshold (regime genuinely reversed)?
  const scoreFlipped =
    (dir === "BUY"  && diff <= -T) ||
    (dir === "SELL" && diff >= T);

  if (invalidated || scoreFlipped) {
    // If the score still supports the same side but price invalidated, go FLAT (don't force a flip).
    const stillSameSide = dir === newDirection(diff);
    if (invalidated && stillSameSide) {
      return { action: "CLOSE", reason: "atr_invalidation" }; // exit to flat, wait for re-setup
    }
    const direction = newDirection(diff);
    return {
      action: "FLIP",
      direction,
      invalidation: invalidationLevel(direction, price, atr),
      reason: invalidated ? "atr_invalidation" : "regime_reversal",
    };
  }

  // otherwise: HOLD (this is correct behaviour, e.g. NZDUSD for 2 days)
  return { action: "HOLD" };
}

function invalidationLevel(direction, price, atr) {
  const m = CONFIG.ATR_INVALIDATION_MULT;
  return direction === "BUY" ? price - m * atr : price + m * atr;
}

// ---------------------------------------------------------------------------
// 5. SUPABASE state — SHADOW tables. One row per pair in bias_state_v2 = current bias.
//    bias_history_v2 keeps every open/flip/close. See bias_state_v2.sql.
// ---------------------------------------------------------------------------
async function loadState(supabase, pair) {
  const { data } = await supabase.from("bias_state_v2").select("*").eq("pair", pair).maybeSingle();
  return data || null;
}
async function saveState(supabase, pair, obj) {
  await supabase.from("bias_state_v2").upsert({ pair, ...obj, updated_at: new Date().toISOString() });
  // also append to bias_history_v2 for the "Bias History" panel
  await supabase.from("bias_history_v2").insert({ pair, ...obj, created_at: new Date().toISOString() });
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

  const regime = detectRegime(calendar);

  const digest = await extractSignals({ cbText, newsItems }, onUsage);                                     // Haiku
  const scores = await scoreCurrencies({ regime, digest, marketData: { cot, riskBasket, yields } }, onUsage); // Sonnet 5
  const comp   = composite(scores, regime.weights);

  // XAU is scored as its own asset (macro=real-yields/Fed, orderflow=gold COT, sentiment=risk-off),
  // so the XAUUSD bias below is Score(XAU) − Score(USD), not just inverted USD.
  const xs = scores["XAU"] || { macro: 0, orderflow: 0, sentiment: 0 };
  console.log(`   [v2 xau] macro=${xs.macro} orderflow=${xs.orderflow} sentiment=${xs.sentiment} composite=${(comp["XAU"] ?? 0).toFixed(2)}`);

  const results = [];
  for (const pair of CONFIG.PAIRS) {
    const base = pair.slice(0, 3);
    const quote = pair.slice(3, 6);
    const diff = (comp[base] ?? 0) - (comp[quote] ?? 0);

    const market = await feeds.getPairMarket(pair);
    if (!market || market.price == null || market.atr == null) {
      results.push({ pair, diff: +diff.toFixed(2), action: "SKIP", reason: "no_market_data" });
      continue;
    }
    const { price, atr, adrUsedPct, isHighAtrWeek } = market;
    const state = await loadState(supabase, pair);
    const d = decide(state, diff, price, atr, adrUsedPct, isHighAtrWeek);

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
        opened_at: new Date().toISOString(),
        status: "running",
      });
    } else if (d.action === "CLOSE") {
      await saveState(supabase, pair, { direction: "FLAT", status: "closed", closed_reason: d.reason });
    } else {
      // HOLD / HOLD_FLAT — refresh running pips/MFE/MAE, keep bias
      if (state && state.direction !== "FLAT") await feeds.updateRunning?.(pair, price);
    }

    results.push({ pair, diff: +diff.toFixed(2), action: d.action, direction: d.direction || state?.direction || "FLAT" });
  }

  return { regime: regime.label, scores, results };
}

export {
  CONFIG, REGIMES, MODELS,
  detectRegime, composite, decide, invalidationLevel, pipFor,
  extractSignals, scoreCurrencies, writeThesis,
  runEngine,
};
