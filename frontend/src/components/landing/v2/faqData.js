/* Single source of truth for the FAQ section AND the FAQPage structured data.
   Google penalises FAQ markup that does not match the visible text, so the
   schema is generated from this array rather than typed out a second time.

   ORDER MATTERS. The first three entries are rendered beside the pricing card
   (Plan.jsx) and the rest in the FAQ section (Faq.jsx), so every answer appears
   on the page exactly once. Keep the first three where they are.

   Facts here must match the engine: seven major pairs and gold, conviction on a
   40–92 scale that is not a probability, no win rate, no update interval (the
   cycle is an environment setting and can change without a deploy). */
export const FAQ = [
  {
    q: 'Is this a signals service?',
    a: "No. You don't get an entry price, a stop and a target to copy. You get the direction the macro evidence supports and the level where that reasoning breaks. Your entries and your risk stay yours.",
  },
  {
    q: 'Is this financial advice?',
    a: 'No. BiasForge is an educational macro research tool. Every decision on your account is yours.',
  },
  {
    q: 'How is this different from a free economic calendar?',
    a: "A calendar tells you an event is coming. It doesn't tell you what it means for direction, how it sits against positioning and rate differentials, or where a read based on it stops being valid. That's the part BiasForge does.",
  },
  {
    q: 'What markets are covered?',
    a: 'Seven major forex pairs — EUR/USD, GBP/USD, USD/JPY, USD/CAD, AUD/USD, NZD/USD and USD/CHF — plus gold (XAU/USD).',
  },
  {
    q: 'Do I need to know fundamentals already?',
    a: 'No. Every bias comes with its reasoning written out in plain English, so you can read why it leans a certain way — and disagree with it.',
  },
  {
    q: 'Does it work with my prop firm?',
    a: "Prop Firm Mode has preset rule sets for the major firms, and you can enter your own account size, daily drawdown and total drawdown if your firm isn't listed.",
  },
  {
    q: 'How is conviction calculated?',
    a: "Each pair is scored on macro, order flow and sentiment, and the engine measures how strongly those components agree on one direction. That agreement, adjusted for how much of the day's range is already used, becomes a score between 40 and 92 and a grade from A to D.",
  },
  {
    q: 'Is conviction a probability of profit?',
    a: 'No. It measures how much of the evidence agrees. Two pairs with the same score can behave very differently.',
  },
  {
    q: 'What is an invalidation level?',
    a: "The price at which the thesis is wrong. It is set from the pair's recent volatility when the bias opens, and it does not move to accommodate price.",
  },
  {
    q: 'What happens when a thesis becomes invalid?',
    a: 'The bias closes. The closure is recorded with its level and reason, and stays on the public record.',
  },
  {
    q: 'Why is there sometimes no directional call?',
    a: "When the components disagree, when the edge is below the engine's threshold, or when most of the day's range is already spent. A forced direction would be less useful than none.",
  },
  {
    q: 'Why not just use TradingView and an economic calendar?',
    a: "TradingView is where you analyse price. A calendar tells you when events happen. BiasForge sits between the two: it organises macro data, positioning, newsflow and cross-asset information into a directional thesis with an explicit invalidation. It complements your charting; it doesn't replace it.",
  },
  {
    q: 'Does BiasForge execute trades?',
    a: "No. It doesn't connect to your broker or place orders. Prop Firm Mode can check a planned trade against your remaining drawdown; the decision and the execution are yours.",
  },
  {
    q: 'How often is the data updated?',
    a: 'The engine updates through the trading session and re-reads sooner when a major headline lands. News is scored as it arrives, COT positioning updates weekly, and some government bond yields reach us with a one-to-two business-day lag.',
  },
  {
    q: 'Where does the data come from?',
    a: "A market-data provider for price, economic calendar feeds, news wires scored for macro impact, the CFTC's Commitments of Traders report, and government bond yields from official sources.",
  },
  {
    q: 'How does the public record work?',
    a: 'Every bias the engine closes is listed with its pair, direction, invalidation level, close date and closing reason, including the invalidated ones. Recording began in late August 2026, so the validation dataset is still being built and no win rate is published.',
  },
  {
    q: 'Does BiasForge guarantee returns?',
    a: 'No. It is decision support. Trading carries risk, and results depend on your own execution and risk management.',
  },
]
