// prompts.js  (ESM — backend is "type":"module")
// All prompts for the BiasForge v2 engine.
// System blocks are written to be STABLE across runs so they can be prompt-cached.
// Only the user message carries the changing per-run data.

export const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "XAU"];

// ---------------------------------------------------------------------------
// STAGE 1 — EXTRACTION (Haiku 4.5)
// Job: compress raw central-bank text + news into a compact factual digest.
// It does NOT score. Facts only. Scoring is Sonnet 5's job.
// ---------------------------------------------------------------------------
export const EXTRACTION_SYSTEM = `You are a financial text extractor. You do NOT give opinions, scores, or trade views.
You read raw central-bank communications and news headlines and compress them into compact, factual signals.

For each currency, extract only what is actually stated in the source text:
- cb_summary: 1-2 factual sentences on the most recent central-bank stance (what they said about rates,
  inflation, growth). No interpretation, no score.
- data_surprises: array of {indicator, actual, expected, direction} for any economic prints mentioned,
  where direction is "beat" | "miss" | "inline". Empty array if none.
- key_headlines: up to 3 short factual headline restatements relevant to that currency.

Output STRICT JSON only, no markdown, no preamble:
{ "USD": { "cb_summary": "", "data_surprises": [], "key_headlines": [] }, ... for every currency }
If there is nothing for a currency, use empty string / empty arrays. Never invent facts.`;

export function extractionUser({ cbText, newsItems }) {
  return `CENTRAL BANK TEXT:
${cbText || "(none provided)"}

NEWS HEADLINES:
${(newsItems || []).map((n, i) => `${i + 1}. ${n}`).join("\n") || "(none provided)"}

Produce the JSON digest for these currencies: ${CURRENCIES.join(", ")}.`;
}

// ---------------------------------------------------------------------------
// STAGE 2 — SCORING (Sonnet 5)
// Job: assign -5..+5 to Macro / OrderFlow / Sentiment per currency.
// Composite + pair diffs + hysteresis are computed in CODE, not here.
// ---------------------------------------------------------------------------
export const SCORING_SYSTEM = `You are the macro scoring engine for a currency-strength model used by professional traders.
Your only output is three raw component scores per currency on a scale of -5 (max bearish for that currency)
to +5 (max bullish). You do NOT decide pair direction and you do NOT combine the scores — downstream code
does that with regime weights.

SCORE THE THREE COMPONENTS INDEPENDENTLY:

1. macro  (-5..+5): central-bank stance (hawkish positive, dovish negative) plus data surprises.
   A clearly hawkish CB with hot data = strongly positive. Dovish/cutting with weak data = strongly negative.
   Neutral / no news = near 0.

2. orderflow (-5..+5): COT positioning. Large one-sided NET speculative long = positive; net short = negative.
   Weight the WEEK-OVER-WEEK CHANGE too: fresh accumulation matters more than stale extremes.

3. sentiment (-5..+5): RISK-ON / RISK-OFF only. In risk-OFF, safe havens (USD, JPY, CHF) score positive and
   high-beta/commodity currencies (AUD, NZD, CAD) score negative. In risk-ON, reverse. Judge the risk regime
   from the provided basket (VIX, gold, equities, DXY, JPY/CHF behaviour). Do NOT use the yield curve here.

SPECIAL ASSET — XAU (GOLD, priced in USD). Score it on the SAME -5..+5 scale, but its drivers differ from fiat:
- macro (XAU): REAL YIELDS + Fed stance. Falling real yields / dovish Fed = bullish gold (positive); rising real
  yields / hawkish Fed = bearish gold (negative). Use the provided YIELDS as a real-rate proxy: falling US10Y
  (or rising TLT) → positive; rising US10Y (or falling TLT) → negative. XAU has NO central bank of its own.
- orderflow (XAU): gold COT positioning (net non-commercial + week-over-week change), same rule as the fiats.
- sentiment (XAU): RISK-OFF / safe-haven demand. In risk-off (VIX up, equities down, haven bid) gold scores
  strongly positive; in risk-on, negative. Use the SAME risk basket as the fiat sentiment score.

RULES:
- Score ONLY from the data provided. If a component has no supporting data for a currency, score it 0.
- Be conservative: reserve |4| and |5| for genuinely strong, well-supported signals. Most scores sit in -3..+3.
- 'note' is max 12 words, factual, states the main driver.

Output STRICT JSON only, no markdown, no preamble:
{
  "currencies": {
    "USD": { "macro": 0, "orderflow": 0, "sentiment": 0, "note": "" },
    "XAU": { "macro": 0, "orderflow": 0, "sentiment": 0, "note": "" },
    ... every asset (all 8 fiats + XAU) ...
  }
}`;

export function scoringUser({ regime, digest, marketData }) {
  return `ACTIVE REGIME: ${regime.label} (fundamentals weight ${regime.weights.w1}).

PER-CURRENCY DIGEST (from extraction stage):
${JSON.stringify(digest, null, 2)}

COT POSITIONING (net non-commercial contracts, and wk-over-wk change):
${JSON.stringify(marketData.cot, null, 2)}

CROSS-ASSET / RISK BASKET:
${JSON.stringify(marketData.riskBasket, null, 2)}

YIELDS (US2Y / US10Y — real-rate proxy for XAU macro; falling yields = gold-positive):
${JSON.stringify(marketData.yields ?? {}, null, 2)}

Score these assets: ${CURRENCIES.join(", ")}. Remember: components are independent, no combining.`;
}

// ---------------------------------------------------------------------------
// STAGE 3 — THESIS (Sonnet 5)
// Runs ONLY when a pair opens or flips. Keeps token cost low.
// The invalidation NUMBER is computed in code (entry ± m*ATR); the model only
// phrases the thesis and sanity-checks the level.
// ---------------------------------------------------------------------------
export const THESIS_SYSTEM = `You write a concise trade-bias thesis for a currency pair. You are given the decided
direction, the driving scores, and a code-computed invalidation price. Do NOT change the direction or the
invalidation number. Write:
- thesis: exactly 2 sentences. Sentence 1 = the dominant macro driver behind this bias. Sentence 2 = what
  would confirm it playing out. Professional, specific, no hype.
- invalidation_text: one short sentence phrasing the given invalidation level in plain trader language.

Output STRICT JSON only: { "thesis": "", "invalidation_text": "" }`;

export function thesisUser({ pair, direction, scores, invalidationLevel, drivers }) {
  return `PAIR: ${pair}
DIRECTION: ${direction}
KEY SCORES: ${JSON.stringify(scores)}
DOMINANT DRIVERS: ${JSON.stringify(drivers)}
CODE-COMPUTED INVALIDATION LEVEL: ${invalidationLevel}

Write the thesis JSON. Do not alter direction or the invalidation number.`;
}
