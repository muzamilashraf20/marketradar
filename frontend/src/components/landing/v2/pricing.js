/* The one plan, in one place: the landing's pricing section, the in-app
   checkout screen (/subscribe) and the prerender (structured data) all read
   these. Change a price here and every figure that depends on it follows. */

// One Gumroad product, "BiasForge Pro": a membership with Monthly ($40, Gumroad's default) and
// Yearly ($399), chosen on Gumroad's own page. The same link serves both periods.
export const GUMROAD_URL = 'https://biasforge.gumroad.com/l/ntjpje'
export const PRICE_MONTHLY = 40
export const PRICE_ANNUAL = 399
export const ANNUAL_PER_MONTH = (PRICE_ANNUAL / 12).toFixed(2)   // 33.25
export const ANNUAL_SAVING = PRICE_MONTHLY * 12 - PRICE_ANNUAL     // 81

export const INCLUDED = [
  'Macro bias and invalidation level for seven major pairs and gold',
  'Prop Firm Mode with live drawdown tracking',
  'Economic calendar with directional context',
  'Impact-scored live news',
  'COT positioning and currency strength',
  'Trade journal',
]
