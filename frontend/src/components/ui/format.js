/* Display formatting shared by the design-system components.

   This is the one copy of the pair-precision rule. Older copies still live in
   MacroCompass, BiasMatrix, landing/v2 BiasCard, BiasShowcase and
   useBiasCalls; they move over here as each of those files is next touched. */

/* Quoting precision per pair — the convention the backend logs use. Levels
   arrive as raw floats from the engine's ATR maths (0.7028257142857143). */
export const pairDecimals = pair => {
  if (!pair) return 5
  if (pair.includes('JPY')) return 3
  if (pair === 'XAUUSD') return 2
  return 5
}

export const fmtLevel = (pair, v) => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(pairDecimals(pair)) : null
}

// 'GBPUSD' → 'GBP/USD'. Anything that is not a six-letter code passes through.
export const fmtPair = p => (p && p.length === 6 ? `${p.slice(0, 3)}/${p.slice(3)}` : p || '')
