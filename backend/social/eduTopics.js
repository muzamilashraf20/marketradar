// Evergreen education topics for forex and prop-firm traders. Pure data, no dependencies — the
// LinkedIn planner rotates through it now, and the Instagram carousel step is meant to reuse it.
//
// Each topic: id (stable key, stored in the rotation history — never rename one), title (what the
// post is about), angle (the mechanism the post must explain, so the writer teaches the "how"
// rather than listing facts).
//
// 40 topics, not 24: the planner posts one a day Sunday–Friday, about 39 posts in any 45-day
// window, and no topic may repeat within 45 days. Fewer than ~39 topics makes that rule impossible.

export const EDU_TOPICS = [
  { id: 'rate-differentials', title: 'Rate differentials', angle: 'Why the gap between two countries\' interest rates pulls capital toward the higher-yielding currency, and why the direction of the gap matters more than its size.' },
  { id: 'real-yields', title: 'Real yields', angle: 'What a real yield is (nominal yield minus expected inflation) and why it, not the headline rate, drives currencies and gold.' },
  { id: 'risk-on-risk-off', title: 'Risk-on and risk-off', angle: 'How the market\'s appetite for risk moves money between currencies, and which currencies tend to gain when fear rises.' },
  { id: 'safe-havens', title: 'Safe-haven currencies', angle: 'Why some currencies are bought when markets are stressed, and why a safe haven is a behaviour, not a guarantee.' },
  { id: 'cot-positioning', title: 'Reading COT positioning', angle: 'What the Commitments of Traders report shows, why crowded positioning can unwind sharply, and why it is a slow, weekly signal.' },
  { id: 'reading-cpi', title: 'Reading a CPI release', angle: 'How markets compare the inflation print to expectations, why core matters, and why the surprise moves price more than the number itself.' },
  { id: 'nfp', title: 'Non-farm payrolls', angle: 'What the US jobs report measures, why revisions and wages matter alongside the headline, and why the first move is often unreliable.' },
  { id: 'forward-guidance', title: 'Central bank forward guidance', angle: 'How what a central bank says about the future moves markets before any rate changes, and why tone shifts can matter more than decisions.' },
  { id: 'carry-trade', title: 'The carry trade', angle: 'How traders earn the interest difference between two currencies, and why carry trades unwind violently when volatility spikes.' },
  { id: 'dxy', title: 'The dollar index (DXY)', angle: 'What the dollar index is made of, why it is weighted heavily toward the euro, and how to use it as context rather than a signal.' },
  { id: 'gold-vs-yields', title: 'Gold and yields', angle: 'Why gold, which pays no interest, competes with yielding assets, and why the relationship is with real yields rather than nominal ones.' },
  { id: 'news-day-risk-funded', title: 'News-day risk for funded accounts', angle: 'Why high-impact releases threaten drawdown rules through spikes and slippage, and how funded traders plan around them.' },
  { id: 'bias-vs-signal', title: 'Bias versus signal', angle: 'The difference between a directional view that frames the day and a trade trigger, and why confusing the two leads to forced trades.' },
  { id: 'confluence', title: 'Confluence', angle: 'Why several independent reasons pointing the same way make a view sturdier, and why correlated reasons only look like confluence.' },
  { id: 'adr', title: 'Average daily range', angle: 'What ADR measures, how it helps judge whether a move is stretched, and why it is a context tool rather than a target.' },
  { id: 'session-behaviour', title: 'Session behaviour', angle: 'How liquidity and volatility shift across the Asian, London and New York sessions, and why the same setup behaves differently in each.' },
  { id: 'drawdown-rules', title: 'Drawdown rules', angle: 'How daily and maximum drawdown limits work on funded accounts, and why the daily limit usually decides how a trader should size.' },
  { id: 'sizing-around-events', title: 'Position sizing around events', angle: 'Why the same stop distance carries more risk around a release, and how traders reduce size or stand aside instead of widening stops.' },
  { id: 'yield-curve', title: 'The yield curve', angle: 'What the difference between short and long bond yields says about growth and policy expectations, and why short-dated yields move currencies most.' },
  { id: 'inflation-expectations', title: 'Inflation expectations', angle: 'Why markets react to where inflation is expected to go rather than where it is, and how expectations feed into rate pricing.' },
  { id: 'rate-pricing', title: 'Market rate pricing', angle: 'How futures and swaps show what the market expects a central bank to do, and why moves happen when that pricing changes.' },
  { id: 'expectations-vs-actual', title: 'Consensus versus actual', angle: 'Why a data release is judged against the consensus forecast, and why a "good" number can still send a currency lower.' },
  { id: 'central-bank-divergence', title: 'Policy divergence', angle: 'Why two central banks moving in different directions creates some of the cleanest currency trends, and how divergence gets priced.' },
  { id: 'correlations', title: 'Currency correlations', angle: 'Why some pairs move together, how that hides doubled risk across positions, and why correlations change over time.' },
  { id: 'commodity-currencies', title: 'Commodity currencies', angle: 'Why the Australian, New Zealand and Canadian dollars often follow commodity prices and global growth, and when that link weakens.' },
  { id: 'jpy-dynamics', title: 'How the yen behaves', angle: 'Why the yen is tied to yield differentials and risk sentiment, and why its moves can be abrupt when positioning is one-sided.' },
  { id: 'liquidity-and-spreads', title: 'Liquidity and spreads', angle: 'Why spreads widen at session rollovers and around news, and how thin liquidity turns ordinary orders into slippage.' },
  { id: 'gaps-and-weekends', title: 'Weekend gaps', angle: 'Why price can open away from Friday\'s close, what that does to stops, and why many funded rules restrict weekend holding.' },
  { id: 'stop-placement', title: 'Where stops belong', angle: 'Why a stop should sit where the trade idea is proven wrong rather than at a round number of pips, and how that sets position size.' },
  { id: 'risk-reward', title: 'Risk and reward', angle: 'How the ratio between what a trade risks and what it aims for interacts with win rate, and why neither number means much alone.' },
  { id: 'expectancy', title: 'Expectancy', angle: 'How average win, average loss and win rate combine into whether a strategy makes money over many trades, explained without jargon.' },
  { id: 'revenge-trading', title: 'Revenge trading', angle: 'Why a loss pushes traders to size up and trade worse setups, and the simple rules that break the cycle before it hits a drawdown limit.' },
  { id: 'overtrading', title: 'Overtrading', angle: 'Why more trades usually means lower-quality trades, and how waiting for a clear bias and setup protects a funded account.' },
  { id: 'journaling', title: 'Why journaling works', angle: 'How recording the reason, context and outcome of each trade exposes patterns a trader cannot see in the moment.' },
  { id: 'trend-vs-range', title: 'Trend versus range', angle: 'How to tell whether a market is trending or ranging, and why strategies that work in one fail in the other.' },
  { id: 'higher-timeframe-context', title: 'Higher-timeframe context', angle: 'Why the daily and weekly picture frames intraday trades, and how ignoring it leads to trading against the larger flow.' },
  { id: 'macro-vs-technical', title: 'Macro and technicals together', angle: 'How the macro picture decides direction while technicals decide timing, and why using only one leaves a blind spot.' },
  { id: 'data-surprise-decay', title: 'How long a data surprise lasts', angle: 'Why the reaction to a release often fades or reverses, and what separates a lasting repricing from a knee-jerk move.' },
  { id: 'geopolitical-shocks', title: 'Geopolitical shocks', angle: 'How sudden political events move currencies through risk sentiment and safe-haven flows, and why the first reaction is often overdone.' },
  { id: 'prop-evaluation-mindset', title: 'The evaluation mindset', angle: 'Why passing a funded evaluation rewards consistency and rule-keeping over big wins, and how that changes day-to-day decisions.' },
]

export const EDU_TOPIC_IDS = EDU_TOPICS.map(t => t.id)

// No topic repeats within this many days.
export const EDU_REPEAT_DAYS = 45

// Picks the next topic. `history` is [{ id, date: 'YYYY-MM-DD' }]. Prefers topics never used, then
// the least recently used among those outside the 45-day window. If every topic was used inside
// the window (the list was trimmed below what the cadence needs), falls back to the least recently
// used overall and says so, rather than posting nothing.
export function pickEduTopic(history = [], today = new Date().toISOString().slice(0, 10), topics = EDU_TOPICS) {
  const lastUsed = new Map()
  for (const h of history) {
    if (!h?.id || !h?.date) continue
    if (!lastUsed.has(h.id) || h.date > lastUsed.get(h.id)) lastUsed.set(h.id, h.date)
  }
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - EDU_REPEAT_DAYS * 86400000).toISOString().slice(0, 10)
  const byAge = [...topics].sort((a, b) => (lastUsed.get(a.id) || '').localeCompare(lastUsed.get(b.id) || ''))
  const eligible = byAge.filter(t => !lastUsed.has(t.id) || lastUsed.get(t.id) <= cutoff)
  if (eligible.length) return { topic: eligible[0], relaxed: false }
  return { topic: byAge[0], relaxed: true }
}
