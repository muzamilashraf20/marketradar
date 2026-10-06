/* MarketMovers: the people and themes whose headlines move currencies, matched
   by keyword against the news the app already fetches. No endpoint of its own.

   Copied from pages/Dashboard.jsx (the old Overview), which says it mirrors the
   backend's MOVERS_SRV list; keep the ids, keywords and assets in sync with it.
   Dashboard.jsx is now unused and goes in the cleanup phase, leaving this copy. */
export const MOVERS = [
  { id: 'trump', name: 'Donald Trump', kw: ['trump', 'tariff', 'tariffs', 'trade war', 'truth social', 'white house'], assets: ['USD', 'Gold', 'S&P500', 'Oil'] },
  { id: 'powell', name: 'Kevin Warsh', kw: ['warsh', 'federal reserve', 'fed chair', 'fomc', 'fed rate', 'fed policy'], assets: ['USD', 'Gold', 'Bonds'] },
  { id: 'lagarde', name: 'Christine Lagarde', kw: ['lagarde', 'ecb', 'european central bank'], assets: ['EUR', 'EUR/USD', 'DAX'] },
  { id: 'musk', name: 'Elon Musk', kw: ['elon musk', 'musk', 'tesla', 'spacex', 'doge '], assets: ['TSLA', 'BTC', 'DOGE'] },
  { id: 'bailey', name: 'Andrew Bailey', kw: ['bailey', 'bank of england', 'boe rate', 'boe governor'], assets: ['GBP', 'GBP/USD', 'FTSE'] },
  { id: 'ueda', name: 'Kazuo Ueda', kw: ['ueda', 'bank of japan', 'boj rate', 'boj governor'], assets: ['JPY', 'USD/JPY', 'Nikkei'] },
  { id: 'geo', name: 'Geopolitics', kw: ['war', 'sanction', 'sanctions', 'opec', 'ceasefire', 'invasion', 'missile', 'nuclear', 'middle east', 'conflict', 'airstrike', 'embargo', 'oil supply', 'strikes', 'iran'], assets: ['Gold', 'Oil', 'USD', 'Safe Havens'] },
]

export function matchMover(text) {
  const t = (text || '').toLowerCase()
  return MOVERS.find(m => m.kw.some(k => t.includes(k))) || null
}

/* The highest-impact headline that names a mover, from articles already sorted by impact. */
export function topMover(articles) {
  for (const a of articles || []) {
    const m = matchMover(`${a.title} ${a.summary || ''}`)
    if (m) return { ...m, article: a }
  }
  return null
}
