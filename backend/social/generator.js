// Social post draft generator: FACTS -> Claude -> 3 variants -> guardrails -> best clean variant.
//
// Nothing here posts. The caller gets every variant with its flags, plus the one worth using
// (or failed: true). Two layers keep bad copy out: the system prompt tells the model the rules,
// and validateSocialPost checks every variant anyway, because the prompt alone is not a guarantee.
//
// The model only ever sees the facts it needs for the content type. A bias card's invalidation
// level is never sent to it, so it cannot leak what it was never told. The full facts still go to
// the guardrails so they can catch the level if it appears some other way.

import { BANNED_PHRASES, validateSocialPost } from './guardrails.js'

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1500

export const CONTENT_TYPES = ['bias_card', 'event_preview', 'weekly_scorecard', 'macro_insight', 'trader_pain', 'contrarian', 'build_log']

const SYSTEM_PROMPT = `You write social media posts for BiasForge (biasforge.co), a daily macro bias tool for funded and prop-firm forex and gold traders. You write as a trader talking to other traders.

VOICE
- Trader to trader. Plainspoken, sharp, short sentences.
- Say the thing. Do not build up to it, do not warm up, do not summarise at the end.
- No hype words. Never write "game-changer", "unlock", "level up", "next level", "insane", "massive", "revolutionary", "secret", "edge you've been missing".
- No rocket emojis. At most 1 emoji per post, and usually zero.
- At most 1 hashtag per post, and usually none.

FACTS ONLY
- NEVER invent numbers, win rates, accuracy figures, user counts, testimonials, quotes or outcomes.
- Use ONLY values present in the FACTS json. Every pair, number, time, date and result you write must come from FACTS. If FACTS does not contain it, do not say it.
- NEVER invent personal history. Do not write "I passed", "I blew my account", "my eval" or any first-person event as if it happened, unless FACTS or NOTES describe that exact event. A confession/story shape without a real story in FACTS or NOTES is written about a pattern traders share ("you", "most of us", "the trader who..."), not as something that happened to the writer.

PAID DETAILS NEVER APPEAR
- NEVER mention or imply an invalidation level, a stop, a stop loss, a target, a take profit, an entry price, SL or TP.
- The invalidation level is a paid feature and must never appear in public copy. Do not write the word "invalidation" in any form.
- Do not write price levels at all. Say the direction and the reasoning only.

CLAIMS
- NEVER claim real-time or live signals, or updates every few seconds or minutes. The bias is a daily read.
- Do not describe BiasForge as a signal service.
- No guarantees. Never write "guaranteed", "risk-free", "can't lose" or anything that promises an outcome.
- No financial advice framing: never tell the reader to buy, sell, enter, exit or size a position. No risk instructions either: no "size accordingly", "reduce size", "tighten stops", "manage risk" or similar.
- Never name competitors or any other trading tool, service or website.

DOMAIN AND LINKS
- The domain is biasforge.co. It is NEVER written as biasforge.ai, and no .ai domain appears anywhere.
- When PLATFORM is x: include no link, no URL and no domain at all, not even biasforge.co.

BANNED PHRASES
Never use any of these, in any casing or punctuation:
${BANNED_PHRASES.map(p => `- "${p}"`).join('\n')}

ORIGINALITY
- Do not reuse sentences, openers or distinctive phrasing from PAST POSTS.
- Do not start a variant with the same first word as any past post.

LENGTH
- X posts: hard maximum 260 characters per variant, counting spaces and punctuation.
- Instagram captions: maximum 2000 characters. LinkedIn posts: maximum 2800 characters.

OUTPUT
- Produce exactly 3 variants. Each must be a DIFFERENT shape, chosen from: one-liner, setup-then-punch, short list, question, number-led observation, confession/story.
- Only use number-led observation if FACTS contains a number you can lead with.
- Each variant starts with a different opening word.
- Make the lengths noticeably different. At least one variant must be under 100 characters.
- Output ONLY minified JSON in exactly this form: {"variants":[{"shape":"...","text":"..."}]}
- No preamble, no explanation, no markdown, no code fences.`

// What the model is asked to do per content type, and which facts it is allowed to see.
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj?.[k] !== undefined).map(k => [k, obj[k]]))
const pickEach = (arr, keys) => (Array.isArray(arr) ? arr.map(x => pick(x, keys)) : undefined)

const TASKS = {
  bias_card: {
    facts: f => pick(f, ['pair', 'direction', 'confidence', 'grade', 'reasoning']),
    brief: `Write a post about today's daily bias for one pair.
- State the pair, written as it appears in FACTS, and the direction.
- Give ONE macro driver, taken from FACTS.reasoning. One, not a list of everything.
- confidence is a 40-92 strength score for how well the inputs line up. It is NOT a win rate or a probability. Never write it as a percentage. You can leave it out.
- grade is the engine's setup grade, A best to D worst.`,
  },
  event_preview: {
    facts: f => ({ ...pick(f, ['dateLabel']), events: pickEach(f.events, ['time', 'currency', 'title', 'forecast', 'previous', 'impact']) }),
    brief: `Write a post about what is on the economic calendar today and which pairs it moves.
- Times in FACTS are UTC.
- You may quote forecast and previous values from FACTS. Label them plainly as forecast and previous so they cannot be read as results.
- Do NOT predict the number, and do not say whether it will beat or miss the forecast.`,
  },
  weekly_scorecard: {
    facts: f => ({ ...pick(f, ['rangeLabel']), rows: pickEach(f.rows, ['date', 'pair', 'direction', 'outcome']) }),
    brief: `Write an honest scoreboard post for the week's calls.
- Name the misses as plainly as the hits. Do not bury them, excuse them or spin them.
- NO aggregate anywhere: no percentage, no win rate, no hit count, no "X of Y", no totals. Talk about individual calls.
- outcome "open" means the call has not resolved yet.`,
  },
  macro_insight: {
    facts: f => pick(f, ['reasoning', 'events']),
    brief: `Write one evergreen macro idea explained simply, for example why real yields move gold or why rate differentials drive a currency pair.
- Educational. No call on any pair and no direction for today.
- FACTS is context for what is topical right now. Use it only if it helps; the idea must still make sense next month.`,
  },
  trader_pain: {
    facts: () => ({}),
    brief: `Write a sharp observation about how funded and prop-firm traders actually lose: revenge trading, overtrading on news days, chasing certainty, sizing up after a loss, breaking their own rules near a drawdown limit.
- Never insult or talk down to the reader. Write as someone who has made the mistake too.
- Do not pitch BiasForge.
- If NOTES are given, build on them.`,
  },
  contrarian: {
    facts: () => ({}),
    brief: `Write a contrarian take on how funded and prop-firm traders lose: push against something most trading content says (more setups, more screen time, more indicators, always be in a trade).
- Never insult or talk down to the reader. Write as someone who has made the mistake too.
- Do not pitch BiasForge.
- If NOTES are given, build on them.`,
  },
  build_log: {
    facts: f => f || {},
    brief: `Write a build-log post about what shipped in BiasForge, using FACTS and NOTES.
- Builder voice: specific about what changed and why it matters to a trader.
- No roadmap promises, no dates for future work, no "coming soon".`,
  },
}

function buildUserMessage({ contentType, platform, facts, notes, pastTexts }) {
  const task = TASKS[contentType]
  const parts = [
    `PLATFORM: ${platform}`,
    `CONTENT TYPE: ${contentType}`,
    `TASK:\n${task.brief}`,
    `FACTS:\n${JSON.stringify(task.facts(facts))}`,
  ]
  if (notes && String(notes).trim()) parts.push(`NOTES:\n${String(notes).trim()}`)
  parts.push(pastTexts.length
    ? `PAST POSTS (do not reuse their sentences, openers or phrasing):\n${pastTexts.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    : 'PAST POSTS: none')
  return parts.join('\n\n')
}

// Tolerates code fences and stray prose around the object. Returns null if nothing parses.
function parseVariants(raw) {
  let s = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  s = s.slice(start, end + 1)
  try {
    const obj = JSON.parse(s)
    if (!Array.isArray(obj?.variants)) return null
    const variants = obj.variants
      .filter(v => v && typeof v.text === 'string' && v.text.trim())
      .map(v => ({ shape: typeof v.shape === 'string' ? v.shape : 'unknown', text: v.text.trim() }))
    return variants.length ? variants : null
  } catch {
    return null
  }
}

async function callModel(anthropic, trackAI, user) {
  const m = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: user }],
  })
  if (typeof trackAI === 'function') {
    try { trackAI('social-generate', MODEL, m.usage) } catch {}
  }
  return (m.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
}

// One call, plus one more if the reply does not parse. Malformed JSON is usually a one-off.
async function generateVariants(anthropic, trackAI, user) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const variants = parseVariants(await callModel(anthropic, trackAI, user))
    if (variants) return variants
  }
  return null
}

const hardCount = v => v.flags.filter(f => f.level === 'hard').length
const softCount = v => v.flags.filter(f => f.level === 'soft').length

// Clean variants only; among those, fewest soft flags, earliest on a tie.
function choose(variants) {
  let best = null
  for (const v of variants) {
    if (hardCount(v)) continue
    if (!best || softCount(v) < softCount(best)) best = v
  }
  return best
}

// API errors (auth, rate limit, network) propagate to the caller. A reply that never parses, or
// variants that break a hard rule twice, come back as failed: true.
export async function generateDraft({ contentType, platform = 'x', facts = {}, notes = '', pastTexts = [], anthropic, trackAI } = {}) {
  if (!TASKS[contentType]) throw new Error(`generateDraft: unknown contentType "${contentType}" (expected ${CONTENT_TYPES.join(', ')})`)
  if (!anthropic?.messages?.create) throw new Error('generateDraft: an Anthropic client is required')

  const past = Array.isArray(pastTexts) ? pastTexts.filter(t => typeof t === 'string' && t.trim()) : []
  const safeFacts = facts && typeof facts === 'object' ? facts : {}
  const check = { platform, contentType, facts: safeFacts, pastTexts: past }
  const withFlags = vs => vs.map(v => ({ ...v, flags: validateSocialPost(v.text, check).flags }))

  const user = buildUserMessage({ contentType, platform, facts: safeFacts, notes, pastTexts: past })
  const first = await generateVariants(anthropic, trackAI, user)
  if (!first) return { variants: [], chosen: null, failed: true }

  let variants = withFlags(first)
  let chosen = choose(variants)
  if (chosen) return { variants, chosen, failed: false }

  // Every variant broke a hard rule. Tell the model exactly which ones and try once more.
  const broken = [...new Set(variants.flatMap(v => v.flags.filter(f => f.level === 'hard').map(f => `${f.code}: ${f.msg}`)))]
  const retryUser = `${user}\n\nYour previous attempt broke these rules. Every new variant must avoid all of them:\n${broken.map(b => `- ${b}`).join('\n')}`
  const second = await generateVariants(anthropic, trackAI, retryUser)
  if (!second) return { variants, chosen: null, failed: true }

  variants = withFlags(second)
  chosen = choose(variants)
  return { variants, chosen, failed: !chosen }
}
