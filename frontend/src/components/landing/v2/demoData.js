/* The sample dashboard the landing page shows.

   WHY THIS IS NOT LIVE DATA
   -------------------------
   It used to be. The hero, the bias card and the news wire all rendered the
   real engine output, baked at build time and refreshed on load. That made the
   page credible and it also made it free: two current biases with their
   invalidation levels, refreshed continuously, to anyone with the URL and no
   account. Withholding the level fixed the giveaway and left a locked box,
   which sells worse than showing the thing.

   A sample shows the whole card — direction, conviction, the reasoning, the
   invalidation level — precisely because none of it is actionable. Nobody can
   trade a level from a pair that is not being quoted right now.

   WHY EVERY PANEL SAYS "DEMO DATA"
   -----------------------------
   These numbers are illustrative, not a read on the market as it stands. Any
   panel rendering them says so on its face, and none of them claims to be live
   or to have come from a recent engine run. A demo labelled as a demo is
   ordinary marketing; the same demo captioned "live from the app" is a
   fabricated record of what the engine is currently saying, and a visitor
   deciding whether to pay would be deciding on it.

   WHAT IS STILL REAL
   ------------------
   The closed-call record. Those are the engine's actual past calls with their
   actual invalidation levels, pulled live from /api/bias-calls. They are the
   one thing on this page that has to be true, they cost nothing to publish
   because a closed level cannot be traded, and inventing them would be
   inventing a track record. See TrackRecord.jsx. */

export const DEMO_NOTE = 'Demo data — not the current market read.'

/* Shaped like the rows /api/macro-compass returns, so the cards render through
   the same components with no demo-specific branches.

   One bias and one no call, on purpose. A no call is a real engine output —
   the pair stays flat when its components disagree — and showing it beside a
   bias is the fastest way to say the product does not force a direction.

   `components` mirrors the engine's per-pair breakdown (macro, order flow,
   sentiment) as agree/disagree with the net direction. No component values are
   shown: on a sample they would be numbers with no scale behind them.
   The no-call reason is the backend's own wording for that case.

   THE DEMO PAIRS are deliberately different pairs, directions and scores, so
   the page does not read as one call repeated:
     hero         XAU/USD BUY   84 A   (A needs 82+ and FRESH timing)
     hero         EUR/USD no call
     framework    USD/JPY SELL  67 B   (64–73, not LATE)
     invalidation AUD/USD SELL  (the card shows no score)
   Grades follow the engine's lines — 55 / 64 / 74 / 82, timing folded in —
   see computeConfidence in backend/biasEngineV2/biasEngine.js.

   Levels were set from real prices when written (late September 2026), rounded,
   and placed on the side the engine would put them: below price for a BUY,
   above for a SELL. Gold ~4188. USD/JPY: the engine's own USD/JPY BUY closed on
   a level break at 156.720 on 28 Sep, so price was trading below that; the SELL
   level sits above the recent highs. AUD/USD: the engine's SELLs at 0.71815 and
   0.71467 were both broken by price rising through them (18 and 21 Sep), which
   is exactly the move the invalidation section draws. They are illustrative and
   will drift from the market; every panel says "Demo data". Theses name only
   standing macro relationships — no dates, events or data prints that could
   turn out false. */
export const DEMO_BIASES = [
  {
    pair: 'XAUUSD',
    direction: 'BUY',
    confidence: 84,
    grade: 'A',
    entryTiming: 'FRESH',
    thesis:
      'Softer real yields and a weaker dollar are supporting gold, and positioning has room to extend before it looks stretched.',
    invalidationLevel: 4128.5,
    hasInvalidation: true,
    isHeadline: true,
    components: [
      { label: 'Macro', agrees: true },
      { label: 'Flow', agrees: true },
      { label: 'Sentiment', agrees: true },
    ],
  },
  {
    pair: 'EURUSD',
    direction: 'FLAT',
    confidence: null,
    grade: null,
    entryTiming: null,
    thesis: null,
    invalidationLevel: null,
    hasInvalidation: false,
    isHeadline: false,
    noBiasReason: 'Components disagree — macro points one way, flow and sentiment the other. No clean read.',
    components: [
      { label: 'Macro', leans: 'BUY' },
      { label: 'Flow', leans: 'SELL' },
      { label: 'Sentiment', leans: 'SELL' },
    ],
  },
]

/* The framework section's annotated card. */
export const DEMO_SHOWCASE = {
  pair: 'USDJPY',
  direction: 'SELL',
  confidence: 67,
  grade: 'B',
  entryTiming: 'EXTENDED',
  thesis:
    'The rate differential that has carried the dollar against the yen is narrowing as the Bank of Japan normalises policy, and sentiment leans the same way even though flow has yet to follow.',
  invalidationLevel: 157.6,
  hasInvalidation: true,
  isHeadline: true,
  components: [
    { label: 'Macro', agrees: true },
    { label: 'Flow', agrees: false },
    { label: 'Sentiment', agrees: true },
  ],
}

/* The invalidation section's bias: a SELL, so it is wrong above its level and
   the demo chart shows price rising through it. */
export const DEMO_INVALIDATION = {
  pair: 'AUDUSD',
  direction: 'SELL',
  thesis:
    'A patient Reserve Bank of Australia, softer Chinese demand for Australian exports and fragile risk appetite leave the Australian dollar exposed against the US dollar.',
  invalidationLevel: 0.7147,
}

/* Named but never given a direction or a grade, the same as the live panel did:
   the chip row says what else the engine covers, not what it thinks. */
export const DEMO_ALSO_SCORING = ['EURUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCHF', 'XAUUSD']

export const DEMO_EVENT = {
  title: 'BOE Gov Bailey Speaks',
  country: 'GBP',
  impact: 'High',
}

/* Written to read like the feed: a wire headline, the one-line macro read the
   scorer attaches, its source, category and asset tags. No publisher is
   credited with a story they did not run — the sources here are the desks the
   engine actually reads, and the headlines are composed for the sample. */
export const DEMO_NEWS = [
  {
    title: 'Dollar firms as traders trim Fed cut bets after hot services print',
    source: 'Wire',
    category: 'Rates',
    impact: 8,
    oneliner: 'A hotter services read pushes the first cut further out and puts a bid under the dollar.',
    marketTags: ['USD↑', 'Rates↑'],
  },
  {
    title: 'Sterling slips as UK wage growth cools for a third month',
    source: 'Wire',
    category: 'Economic',
    impact: 7,
    oneliner: 'Cooling pay growth clears the way for the Bank of England and weighs on the pound.',
    marketTags: ['GBP↓'],
  },
  {
    title: 'Gold holds gains as real yields ease and central bank buying continues',
    source: 'Wire',
    category: 'Commodities',
    impact: 7,
    oneliner: 'Softer real yields and steady official demand keep the metal supported on dips.',
    marketTags: ['XAU↑', 'Yields↓'],
  },
  {
    title: 'Crude drifts lower on demand concerns ahead of the OPEC+ meeting',
    source: 'Wire',
    category: 'Commodities',
    impact: 6,
    oneliner: 'Softer crude removes a support from the Canadian dollar into the meeting.',
    marketTags: ['Oil↓', 'CAD↓'],
  },
]

/* The event brief behind the no-call section.

   Modelled on the engine's brief for an ISM Manufacturing PMI print it declined
   to call, cut down to the four parts the section needs: the event, the verdict,
   one short thesis and the leading-indicators line. No month or year appears in
   it — it is demo data and labelled as such, so nothing in it should read as a
   dated record of a specific release. */
export const DEMO_BRIEF = {
  event: 'ISM Manufacturing PMI',
  currency: 'USD',
  impact: 'High impact',
  forecast: '55.2',
  previous: '55.6',
  verdict: 'mixed — insufficient directional edge into the print',
  call: 'No directional call',
  reasoning:
    'The forecast of 55.2 against a prior 55.6 implies a modest pullback that stays in expansionary territory. Leading indicators are split, so there is no clean directional lean.',
  indicatorsVerdict: 'mixed',
  /* The three component vectors behind the balance, as the engine splits them.
     `weight` is a relative bar length only — no value is printed, because on a
     sample it would be a number with no scale behind it. They net out just
     right of centre (60 − 35 − 20 = +5), which is where the needle rests. */
  vectors: [
    { label: 'Macro', leans: 'BUY', weight: 60 },
    { label: 'Flow', leans: 'SELL', weight: 35 },
    { label: 'Sentiment', leans: 'SELL', weight: 20 },
  ],
  // Generic labels for the two leads that disagree. No figures, no dates.
  leadBeat: 'manufacturing lead',
  leadMiss: 'services lead',
  indicatorsLead:
    'The data points both ways — some leads argue for a beat, others for a miss. This is a real split in the evidence, not missing data, so no directional call is made.',
}
