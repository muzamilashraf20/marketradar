// Social post draft generator: FACTS -> Claude -> 3 variants -> guardrails -> best clean variant.
//
// Nothing here posts. The caller gets every variant with its flags, plus the one worth using
// (or failed: true). Three layers keep bad copy out: the system prompt tells the model the rules,
// validateSocialPost checks every variant anyway because the prompt alone is not a guarantee, and
// a Haiku fact check catches wrong attribution ("German PMIs" when the facts say eurozone) that
// no regex can see.
//
// The model only ever sees the facts it needs for the content type. A bias card's invalidation
// level is never sent to it, so it cannot leak what it was never told. The full facts still go to
// the guardrails so they can catch the level if it appears some other way.

import { BANNED_PHRASES, validateSocialPost } from './guardrails.js'

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1500
const FACTCHECK_MODEL = 'claude-haiku-4-5-20251001'
const FACTCHECK_MAX_TOKENS = 800 // the per-entity evidence lines ran to ~370 tokens on a 3-event preview
// Posts built from opinion and notes only; there is nothing to check them against.
const NO_FACT_TYPES = new Set(['trader_pain', 'contrarian'])

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

GROUNDING
- Every country, currency, data series and instrument you name must appear in the FACTS json. If the facts say "eurozone PMIs" do not write "German PMIs". If the facts say "German 2Y yield" do not generalise it to "German data" or attach it to a different country.
- If you are unsure which entity a driver refers to, describe it the way the facts describe it, or leave it out. A vaguer post is better than a wrong one.
- Do not combine two separate data points into one claim.

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

// Second opinion on attribution. The regex guardrails check rules; they cannot tell that "German
// PMIs" is wrong when the facts say eurozone PMIs. A cheap Haiku pass compares each variant
// against the same facts the writer saw.
const FACTCHECK_SYSTEM = `You check social media drafts for a forex and gold macro analysis company against the source FACTS they were written from. You are strict about attribution and relaxed about wording.`

function factCheckPrompt(facts, texts) {
  return `FACTS:
${JSON.stringify(facts)}

DRAFTS:
${texts.map((t, i) => `[${i}] ${t}`).join('\n')}

For each draft, answer whether every factual claim in it (country, currency, data series, direction, instrument, number, time) is directly supported by the FACTS.

Method: for each draft, go through every named country or region, currency, data series, instrument and direction. Find where the FACTS mention it and compare the qualifiers word by word. The claim is supported only if the FACTS attach the same qualifier to the same thing.
- A region and a country inside it are different entities. A series in one country is not the same series in another.
- Different maturities, series or directions are different claims: "2Y" is not "10Y", "CPI" is not "PCE", "UK" is not "eurozone", "net long" is not "net short".
- A qualifier that sits on one item in the FACTS cannot be moved to another item in the draft.

- Wording differences are fine. Wrong or invented attribution is not: naming a different country, currency, data series or instrument than the FACTS do, or stating something the FACTS do not contain.
- Combining two separate facts into one claim the FACTS do not make is not grounded.
- Simple conclusions that follow directly from the FACTS are grounded (for example, that two events share a time, or that an event moves pairs in its own currency).
- Opinion, tone and framing ("the rate gap is doing the work") are not factual claims; do not flag them.
- If a draft is not grounded, give the issue in one short line naming the wrong claim and what the FACTS say instead.

Before deciding, fill "evidence" for the draft: one short string per named country or region, currency, data series or instrument, in the form "draft phrase => exact FACTS phrase => SAME" or "draft phrase => exact FACTS phrase => DIFFERENT", or "draft phrase => none" when the FACTS do not mention it.
- Copy the FACTS phrase with its own qualifier.
- SAME only if both sides name the same country or region, the same series and the same direction. Otherwise DIFFERENT, even if the words look similar. "Canadian jobs data => weak North American jobs data" would be DIFFERENT: a region is not one country in it.
- Keep each string under 14 words.
If any evidence string is DIFFERENT or "=> none", grounded is false.

Output ONLY minified JSON, no preamble, no code fences:
{"checks":[{"i":0,"evidence":["draft phrase => facts phrase => SAME"],"grounded":true,"issue":null}]}
One entry per draft, in order.`
}

// Haiku sometimes drops the final closing brace, so a few closers are tried before giving up.
function parseLooseJson(raw) {
  const s = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  const start = s.indexOf('{')
  if (start === -1) return null
  const body = s.slice(start)
  for (const tail of ['', '}', ']}', '}]}']) {
    try { return JSON.parse(body + tail) } catch {}
  }
  return null
}

// The per-entity SAME/DIFFERENT lines decide, not only the overall verdict: Haiku has written
// "German PMIs slipped => soft eurozone PMIs" and still answered grounded: true.
function parseChecks(raw, n) {
  const obj = parseLooseJson(raw)
  if (!Array.isArray(obj?.checks)) return null
  const out = new Array(n).fill(null)
  for (const c of obj.checks) {
    const i = Number(c?.i)
    if (!Number.isInteger(i) || i < 0 || i >= n || typeof c.grounded !== 'boolean') continue
    const bad = (Array.isArray(c.evidence) ? c.evidence : [])
      .map(String)
      .filter(e => /=>\s*DIFFERENT\s*$/i.test(e) || /=>\s*none\s*$/i.test(e))
    if (c.grounded && !bad.length) out[i] = { grounded: true, issue: null }
    else out[i] = { grounded: false, issue: String(c.issue || '').trim() || `not supported by the facts: ${bad.join('; ')}` }
  }
  return out
}

// Returns one { grounded, issue } per text (null where the checker gave no answer), or null if the
// check could not run. Never throws: an API hiccup here must not block a draft.
async function factCheck(anthropic, trackAI, facts, texts) {
  try {
    const m = await anthropic.messages.create({
      model: FACTCHECK_MODEL,
      max_tokens: FACTCHECK_MAX_TOKENS,
      temperature: 0, // a checker should give the same answer every time
      system: FACTCHECK_SYSTEM,
      messages: [{ role: 'user', content: factCheckPrompt(facts, texts) }],
    })
    if (typeof trackAI === 'function') {
      try { trackAI('social-factcheck', FACTCHECK_MODEL, m.usage) } catch {}
    }
    const checks = parseChecks((m.content || []).filter(b => b.type === 'text').map(b => b.text).join(''), texts.length)
    if (!checks) {
      console.warn(m.stop_reason === 'max_tokens'
        ? `[social] fact check hit max_tokens (${FACTCHECK_MAX_TOKENS}) before finishing; continuing without it`
        : '[social] fact check returned unparseable JSON; continuing without it')
    }
    return checks
  } catch (e) {
    console.warn(`[social] fact check failed; continuing without it: ${e?.message || e}`)
    return null
  }
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
  // The checker sees the same trimmed facts the writer saw, so it cannot "ground" a claim in a
  // field (like invalidation) that was deliberately kept out of the prompt.
  const modelFacts = TASKS[contentType].facts(safeFacts)
  const doFactCheck = !NO_FACT_TYPES.has(contentType) && Object.keys(modelFacts).length > 0

  // Each variant gets factcheck: { status: grounded | ungrounded | skipped | unavailable, issue }.
  // Only 'ungrounded' adds a flag; a check that could not run never blocks the draft.
  const withFlags = async vs => {
    const checks = doFactCheck ? await factCheck(anthropic, trackAI, modelFacts, vs.map(v => v.text)) : null
    return vs.map((v, i) => {
      const flags = [...validateSocialPost(v.text, check).flags]
      let factcheck
      if (!doFactCheck) factcheck = { status: 'skipped', issue: null }
      else if (!checks || !checks[i]) factcheck = { status: 'unavailable', issue: null }
      else if (checks[i].grounded) factcheck = { status: 'grounded', issue: null }
      else {
        factcheck = { status: 'ungrounded', issue: checks[i].issue }
        flags.push({ level: 'hard', code: 'ungrounded', msg: checks[i].issue })
      }
      return { ...v, flags, factcheck }
    })
  }

  const user = buildUserMessage({ contentType, platform, facts: safeFacts, notes, pastTexts: past })
  const first = await generateVariants(anthropic, trackAI, user)
  if (!first) return { variants: [], chosen: null, failed: true }

  let variants = await withFlags(first)
  let chosen = choose(variants)
  if (chosen) return { variants, chosen, failed: false }

  // Every variant broke a hard rule. Tell the model exactly which ones and try once more.
  const broken = [...new Set(variants.flatMap(v => v.flags.filter(f => f.level === 'hard').map(f => `${f.code}: ${f.msg}`)))]
  const retryUser = `${user}\n\nYour previous attempt broke these rules. Every new variant must avoid all of them:\n${broken.map(b => `- ${b}`).join('\n')}`
  const second = await generateVariants(anthropic, trackAI, retryUser)
  if (!second) return { variants, chosen: null, failed: true }

  variants = await withFlags(second)
  chosen = choose(variants)
  return { variants, chosen, failed: !chosen }
}
