/* BiasForge design system — static class maps.

   Every variant is a complete, literal class string. Tailwind only ships the
   classes it can find written out in source, so anything assembled at runtime
   (`text-${tone}-400`) is purged from the production build and renders
   unstyled. Add a variant by adding a full string here, never by templating.

   This file holds no components so it can be imported from anywhere, including
   non-React modules, without tripping fast refresh. */

/* ───────── Interaction ───────── */

// Keyboard focus only. A mouse click does not paint the ring.
export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bf-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bf-bg'

/* ───────── Surfaces ───────── */

export const CARD_BASE = 'rounded-card border'

// A card's tone says what it is holding, not how important it looks.
export const CARD_TONE = {
  default:      'bg-bf-surface border-bf-border shadow-card',
  // The dashboard's existing quiet panel — for cards sitting inside a card.
  subtle:       'bg-white/[0.02] border-white/[0.06]',
  // The one headline bias. The only place the glow is used.
  headline:     'bg-bf-accent/[0.05] border-bf-accent/30 shadow-glow',
  invalidation: 'bg-bf-bear/[0.05] border-bf-bear/20',
  // Data states. A panel in one of these still has a shape and a sentence —
  // never a blank box.
  loading:      'bg-bf-surface border-bf-border',
  empty:        'bg-transparent border-dashed border-white/10',
  error:        'bg-bf-bear/[0.04] border-bf-bear/20',
  stale:        'bg-bf-warn/[0.04] border-bf-warn/20',
}

export const CARD_PADDING = {
  none: '',
  sm:   'p-3',
  md:   'p-4 sm:p-5',
  lg:   'p-5 sm:p-6',
}

export const CARD_INTERACTIVE = 'transition-colors duration-150 hover:border-white/15'

/* ───────── Chips ───────── */

export const CHIP_BASE =
  'inline-flex items-center gap-1 rounded-chip border font-semibold uppercase tracking-wider whitespace-nowrap leading-none'

export const CHIP_SIZE = {
  sm: 'px-1.5 py-1 text-3xs',
  md: 'px-2 py-1 text-2xs',
}

/* ───────── Buttons ─────────
   Pill-shaped to match the landing page's existing CTAs. md and lg clear a
   40px / 48px tap target; sm is for dense rows on desktop. */

export const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap select-none transition-colors duration-150'

export const BUTTON_VARIANT = {
  primary:   'bg-bf-accent text-bf-bg hover:bg-bf-accent-soft',
  secondary: 'border border-bf-border bg-white/[0.02] text-bf-text hover:border-slate-600 hover:bg-white/[0.05]',
  ghost:     'text-bf-text-2 hover:text-bf-text hover:bg-white/[0.05]',
}

export const BUTTON_SIZE = {
  sm: 'h-8 px-3.5 text-xs',
  md: 'h-10 px-5 text-sm',
  lg: 'h-12 px-6 text-[15px]',
}

export const BUTTON_DISABLED = 'opacity-50 cursor-not-allowed pointer-events-none'

/* ───────── Section headers ───────── */

export const SECTION_TITLE_SIZE = {
  md: 'text-xl sm:text-2xl',
  lg: 'text-2xl sm:text-4xl',
}

/* ───────── Level rows ─────────
   Invalidation is the one level drawn in red: it is the price where the
   thesis is wrong. Any other level is neutral. */

export const LEVEL_TONE = {
  invalidation: 'text-bf-bear-soft',
  neutral:      'text-bf-text',
}

export const LEVEL_SIZE = {
  sm: { label: 'text-3xs', value: 'text-sm' },
  md: { label: 'text-2xs', value: 'text-base' },
  lg: { label: 'text-2xs', value: 'text-2xl' },
}

/* ───────── Direction ─────────
   BUY and SELL come straight from the engine. FLAT is not an error or a
   missing value — it is the engine declining to lean, and it is labelled as
   such. */

export const DIRECTION_STYLE = {
  BUY: {
    label: 'Buy',
    text:  'text-bf-bull-soft',
    chip:  'bg-bf-bull/10 text-bf-bull-soft border-bf-bull/25',
  },
  SELL: {
    label: 'Sell',
    text:  'text-bf-bear-soft',
    chip:  'bg-bf-bear/10 text-bf-bear-soft border-bf-bear/25',
  },
  FLAT: {
    label: 'No call',
    text:  'text-bf-text-2',
    chip:  'bg-white/[0.03] text-bf-text-2 border-white/10',
  },
}

export const directionStyle = d => DIRECTION_STYLE[d] || DIRECTION_STYLE.FLAT

export const DIRECTION_TEXT_SIZE = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-2xl sm:text-3xl',
}

/* ───────── Status ─────────
   One map for every state a bias, or the data behind it, can be in.

   The three closed states are the engine's three closed_reason values, kept
   apart on purpose. Only level_break means price proved the thesis wrong; the
   other two are withdrawals. No state here means "won" or "held", because the
   engine never records one. */

export const STATUS_STYLE = {
  // Bias lifecycle
  active: {
    label: 'Active',
    dot:   'bg-bf-accent',
    chip:  'bg-bf-accent/10 text-bf-accent-soft border-bf-accent/25',
    note:  'The thesis is live. Its invalidation level has not been crossed.',
  },
  invalidated: {
    label: 'Invalidated',
    dot:   'bg-bf-bear',
    chip:  'bg-bf-bear/10 text-bf-bear-soft border-bf-bear/25',
    note:  'Price crossed the invalidation level. The thesis was wrong.',
  },
  closed: {
    label: 'Closed',
    dot:   'bg-slate-400',
    chip:  'bg-white/[0.04] text-slate-300 border-white/10',
    note:  'Withdrawn. Conviction fell below the floor before the level was crossed.',
  },
  regime_flip: {
    label: 'Regime flip',
    dot:   'bg-bf-warn',
    chip:  'bg-bf-warn/10 text-bf-warn-soft border-bf-warn/25',
    note:  'Closed because the macro regime changed underneath it.',
  },
  no_call: {
    label: 'No call',
    dot:   'bg-slate-500',
    chip:  'bg-white/[0.03] text-bf-text-2 border-white/10',
    note:  'Evidence is mixed. No directional thesis is being forced.',
  },
  // Data freshness
  stale: {
    label: 'Stale',
    dot:   'bg-bf-warn',
    chip:  'bg-bf-warn/10 text-bf-warn-soft border-bf-warn/25',
    note:  'This has not refreshed on schedule. Treat it as out of date.',
  },
  market_closed: {
    label: 'Market closed',
    dot:   'bg-slate-500',
    chip:  'bg-white/[0.03] text-bf-text-2 border-white/10',
    note:  'The forex market is shut. Values are as of the close.',
  },
  pending: {
    label: 'Scoring',
    dot:   'bg-slate-500',
    chip:  'bg-white/[0.03] text-bf-muted border-white/10',
    note:  'The engine has not scored this yet.',
  },
}

export const statusStyle = s => STATUS_STYLE[s] || STATUS_STYLE.closed

// bias_history_v2.closed_reason → status key.
export const OUTCOME_STATUS = {
  level_break:      'invalidated',
  conviction_floor: 'closed',
  regime_reversal:  'regime_flip',
}

// A closure the engine did not label is shown as plain "Closed" — never as a
// harsher or kinder outcome than the one recorded.
export const statusFromOutcome = outcome => OUTCOME_STATUS[outcome] || 'closed'

/* ───────── Conviction ─────────
   Mirrors backend/biasEngineV2/biasEngine.js. The engine clamps confidence to
   40..92 and grades it at 55 / 64 / 74 / 82, with timing folded into the
   grade. Update these alongside the engine, never instead of it. */

export const CONVICTION_MIN = 40
export const CONVICTION_MAX = 92
// MIN_HOLD_CONFIDENCE — an open bias below this for two runs goes flat.
export const CONVICTION_FLOOR = 55
export const GRADE_LINES = [55, 64, 74, 82]

export const CONVICTION_NOTE =
  'Conviction measures agreement among the underlying evidence. It is not a probability of profit.'
export const CONVICTION_SCALE_NOTE =
  `Scored ${CONVICTION_MIN}–${CONVICTION_MAX}. The grade also reflects entry timing, so two biases with the same score can grade differently.`

// Grade drives the accent, not direction: a weak BUY and a weak SELL read as
// equally weak. Same colours the Macro Compass already uses.
export const GRADE_STYLE = {
  'A':  { ring: '#10b981', bar: 'bg-bf-bull',   chip: 'bg-bf-bull/15 text-emerald-300 border-bf-bull/25' },
  'A-': { ring: '#10b981', bar: 'bg-bf-bull',   chip: 'bg-bf-bull/15 text-emerald-300 border-bf-bull/25' },
  'B':  { ring: '#06b6d4', bar: 'bg-bf-accent', chip: 'bg-bf-accent/15 text-cyan-300 border-bf-accent/25' },
  'C':  { ring: '#eab308', bar: 'bg-yellow-500', chip: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25' },
  'D':  { ring: '#64748b', bar: 'bg-slate-500', chip: 'bg-slate-500/15 text-slate-400 border-slate-500/25' },
}

export const gradeStyle = g => GRADE_STYLE[g] || GRADE_STYLE.D

export const TIMING_STYLE = {
  FRESH:    'bg-bf-bull/10 text-bf-bull-soft border-bf-bull/20',
  EXTENDED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  LATE:     'bg-bf-bear/10 text-bf-bear-soft border-bf-bear/20',
}
