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
const CAROUSEL_MAX_TOKENS = 3000  // seven slides plus a caption, as JSON
const FACTCHECK_MODEL = 'claude-haiku-4-5-20251001'
const FACTCHECK_MAX_TOKENS = 800 // the per-entity evidence lines ran to ~370 tokens on a 3-event preview
const CAROUSEL_FACTCHECK_MAX_TOKENS = 2200 // one entry per slide plus the caption, each with evidence lines
// Posts built from opinion and notes only; there is nothing to check them against.
const NO_FACT_TYPES = new Set(['trader_pain', 'contrarian'])

export const CONTENT_TYPES = ['bias_card', 'event_preview', 'weekly_scorecard', 'macro_insight', 'news_reaction', 'education', 'trader_pain', 'contrarian', 'build_log']

// Shared rules first, then one PLATFORM RULES section chosen per platform (see PLATFORM_RULES).
// Everything that differs between X and LinkedIn — length, shapes, hashtags — lives in that section,
// so neither platform is told something that contradicts the other.
const BASE_RULES = `You write social media posts for BiasForge (biasforge.co), a daily macro bias tool for funded and prop-firm forex and gold traders. You write as a trader talking to other traders.

VOICE
- Trader to trader. Plainspoken, sharp, short sentences.
- Say the thing. Do not build up to it, do not warm up, do not summarise at the end.
- No hype words. Never write "game-changer", "unlock", "level up", "next level", "insane", "massive", "revolutionary", "secret", "edge you've been missing".
- No rocket emojis. At most 1 emoji per post, and usually zero.

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
- No link and no URL in the post body, on any platform.

BANNED PHRASES
Never use any of these, in any casing or punctuation:
${BANNED_PHRASES.map(p => `- "${p}"`).join('\n')}

ORIGINALITY
- Do not reuse sentences, openers or distinctive phrasing from PAST POSTS.
- Do not start a variant with the same first word as any past post.`

// Everything above holds for carousels too; only the output shape below is specific to the
// three-variants-of-one-post flow.
const BASE_PROMPT = `${BASE_RULES}

OUTPUT
- Produce exactly 3 variants. Each must be a DIFFERENT shape, chosen from the shapes listed in PLATFORM RULES.
- Only use number-led observation if FACTS contains a number you can lead with.
- Each variant starts with a different opening word.
- Output ONLY minified JSON in exactly this form: {"variants":[{"shape":"...","text":"..."}]}
- No preamble, no explanation, no markdown, no code fences.`

const PLATFORM_RULES = {
  // Unchanged X rules, moved here from the shared prompt.
  x: `PLATFORM RULES — X
- Hard maximum 260 characters per variant, counting spaces and punctuation.
- Shapes: one-liner, setup-then-punch, short list, question, number-led observation, confession/story.
- Make the lengths noticeably different. At least one variant must be under 100 characters.
- At most 1 hashtag per post, and usually none.
- Include no link, no URL and no domain at all, not even biasforge.co.`,

  linkedin: `PLATFORM RULES — LINKEDIN
- Each variant is 500 to 1300 characters, counting spaces and line breaks.
- The FIRST LINE must work on its own as the hook. LinkedIn cuts the post after roughly the first 200 characters behind "see more", so the first line has to earn the click by itself.
- Short paragraphs of 1 to 3 sentences, with a blank line between paragraphs. No walls of bullet points.
- Give more context than a tweet: explain the reasoning behind the read in plain language, the way one trader explains a view to another over coffee. Still no predictions and no targets — say what the facts show and why it matters, never what price will do next.
- Hashtags: at most 3, only if they are natural, and only on the very last line on their own — never inside a sentence.
- At most 1 emoji.
- No link, no URL and no domain in the body.
- Shapes: setup-then-punch, question-led, number-led observation, confession/story, explainer.`,

  // The caption sits under a card image that already shows the pair, direction and grade.
  instagram: `PLATFORM RULES — INSTAGRAM
- Each variant is 300 to 1200 characters, counting spaces and line breaks.
- The FIRST LINE is the hook. Instagram cuts the caption after roughly 125 characters behind "more", so the first line must stand on its own.
- Short lines and generous line breaks. Leave a blank line between each thought.
- The caption goes under a card image that already shows the pair, direction and grade. Use the caption for the reasoning behind the read, in plain language, trader to trader. No predictions and no targets.
- End with 5 to 8 relevant hashtags on their own final line, nowhere else.
- No links, no URLs and no domains in the caption — they are not clickable on Instagram. You may write "Link in bio" once if it fits.
- At most 1 emoji.
- Shapes: setup-then-punch, question-led, number-led observation, confession/story, explainer.`,
}

const systemFor = platform => `${BASE_PROMPT}\n\n${PLATFORM_RULES[platform] || PLATFORM_RULES.x}`

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
- NO aggregate anywhere: no percentage, no win rate, no totals, and no aggregate scoreboard phrasing — never a number applied to the calls as a whole ("five calls", "3 hits", "two misses", "X of Y", "4 for 5", "most landed", "the majority"), no streak, no record. Naming one call and its outcome is fine, including a miss ("GBPUSD on Friday did not hold"). Talk about individual calls.
- outcome "open" means the call has not resolved yet.
- When PLATFORM is linkedin, close with what the week taught — a lesson about process or reading the macro picture, not a claim about performance.`,
  },
  // LinkedIn only. Evergreen teaching: there are deliberately no FACTS to ground it, so it is checked
  // for invented specifics instead (see EDU_CHECK below).
  education: {
    facts: f => pick(f, ['topic', 'angle']),
    brief: `Write an educational post about FACTS.topic for forex and prop-firm traders.
- Explain HOW the mechanism works, in plain English. FACTS.angle says what the post must make clear.
- Define every technical term the first time you use it.
- End with how a trader actually uses it — in their analysis or their risk, not as a trade call.
- NO specific historical numbers, dates, years, named events, statistics or percentages. Explain the mechanism in general terms; the lesson must hold without them.
- No predictions about current markets, no mention of today's prices or today's bias.`,
  },
  macro_insight: {
    facts: f => pick(f, ['reasoning', 'events']),
    brief: `Write one evergreen macro idea explained simply, for example why real yields move gold or why rate differentials drive a currency pair.
- Educational. No call on any pair and no direction for today.
- FACTS is context for what is topical right now. Use it only if it helps; the idea must still make sense next month.`,
  },
  news_reaction: {
    // `source` is deliberately NOT sent to the writer. The post must not name the outlet that
    // carried the story, and the surest way to keep a name out of the copy is to withhold it.
    facts: f => ({
      ...pick(f, ['headline', 'instruments', 'marketTags', 'oneliner', 'impactScore', 'publishedAt']),
      ...(f.biasPair ? { todaysBias: pick(f, ['biasPair', 'biasDirection', 'biasReasoning']) } : {}),
    }),
    brief: `Write a fast take on a macro story that is breaking now.
- NOT a headline recap. Lead with what it means for FX: which currencies or assets it touches, and why — the mechanism, trader to trader.
- Paraphrase in your own words. Never copy or closely echo the headline wording.
- NEVER predict the next move and never name a price target. Do not say what will happen — say what it changes.
- Never name or tag an account, a publication, an analyst, a news outlet or a competitor. Attribute to the data and the event itself, not to a person or a brand.
- Name only the countries, central banks, data series and instruments that appear in FACTS.`,
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

async function callModel(anthropic, trackAI, user, system) {
  const m = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: 'user', content: user }],
  })
  if (typeof trackAI === 'function') {
    try { trackAI('social-generate', MODEL, m.usage) } catch {}
  }
  return (m.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
}

// One call, plus one more if the reply does not parse. Malformed JSON is usually a one-off.
async function generateVariants(anthropic, trackAI, user, system) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const variants = parseVariants(await callModel(anthropic, trackAI, user, system))
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

// ── Claim check for education posts ──────────────────────────────────────────
// Education posts have no FACTS to ground against — they explain mechanisms. What goes wrong there
// is different: an invented statistic, a misremembered date, or an explanation simplified until it
// is false. Two layers. The deterministic one catches specifics outright (a year, a bp/% figure,
// a calendar date) because the brief forbids them and a regex cannot be talked out of it. Haiku
// then judges what a regex cannot: whether the explanation is actually right.
const EDU_SPECIFIC_RES = [
  [/\b(19|20)\d{2}\b/, 'names a specific year'],
  // '%' is a non-word character, so it must not need a trailing \b (there is no word boundary
  // between '%' and the space after it — "9.1%" would slip through).
  [/\b\d+(\.\d+)?\s?(%|(bp|bps|basis points?|percent|per cent)\b)/i, 'quotes a specific figure'],
  [/\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\.?\s+\d{1,2}(st|nd|rd|th)?\b/i, 'names a specific date'],
]
export function eduSpecificClaims(text) {
  return EDU_SPECIFIC_RES.filter(([re]) => re.test(String(text || ''))).map(([re, why]) => `${why}: "${String(text).match(re)[0]}"`)
}

const EDU_CHECK_SYSTEM = `You review educational posts about forex and macro trading for accuracy. You are strict about correctness and relaxed about style.`

function eduCheckPrompt(facts, texts) {
  return `TOPIC: ${JSON.stringify(facts)}

DRAFTS:
${texts.map((t, i) => `[${i}] ${t}`).join('\n')}

For each draft, decide whether it is safe to publish as education. A draft FAILS if it contains any of:
- a specific number, percentage, basis-point figure or statistic
- a specific date, year or named historical event
- a statement about how markets or economics work that is wrong, or simplified so far that it becomes wrong
General explanations of mechanisms are fine. Opinion and framing are fine.
If a draft fails, give the issue in one short line quoting the problem.

Output ONLY minified JSON, no preamble, no code fences:
{"checks":[{"i":0,"grounded":true,"issue":null}]}
Use "grounded": true for a draft that passes and false for one that fails. One entry per draft, in order.`
}

// Returns one { grounded, issue } per text (null where the checker gave no answer), or null if the
// check could not run. Never throws: an API hiccup here must not block a draft.
async function factCheck(anthropic, trackAI, facts, texts, mode = 'grounding', maxTokens = FACTCHECK_MAX_TOKENS) {
  try {
    const edu = mode === 'education'
    const m = await anthropic.messages.create({
      model: FACTCHECK_MODEL,
      max_tokens: maxTokens,
      temperature: 0, // a checker should give the same answer every time
      system: edu ? EDU_CHECK_SYSTEM : FACTCHECK_SYSTEM,
      messages: [{ role: 'user', content: edu ? eduCheckPrompt(facts, texts) : factCheckPrompt(facts, texts) }],
    })
    if (typeof trackAI === 'function') {
      try { trackAI('social-factcheck', FACTCHECK_MODEL, m.usage) } catch {}
    }
    const checks = parseChecks((m.content || []).filter(b => b.type === 'text').map(b => b.text).join(''), texts.length)
    if (!checks) {
      console.warn(m.stop_reason === 'max_tokens'
        ? `[social] fact check hit max_tokens (${maxTokens}) before finishing; continuing without it`
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
    const edu = contentType === 'education'
    const checks = doFactCheck ? await factCheck(anthropic, trackAI, modelFacts, vs.map(v => v.text), edu ? 'education' : 'grounding') : null
    return vs.map((v, i) => {
      const flags = [...validateSocialPost(v.text, check).flags]
      // Education: a hard flag for every forbidden specific, whatever the model check says.
      if (edu) for (const why of eduSpecificClaims(v.text)) flags.push({ level: 'hard', code: 'claim_check', msg: why })
      let factcheck
      if (!doFactCheck) factcheck = { status: 'skipped', issue: null }
      else if (!checks || !checks[i]) factcheck = { status: 'unavailable', issue: null }
      else if (checks[i].grounded) factcheck = { status: 'grounded', issue: null }
      else {
        factcheck = { status: 'ungrounded', issue: checks[i].issue }
        flags.push({ level: 'hard', code: edu ? 'claim_check' : 'ungrounded', msg: checks[i].issue })
      }
      return { ...v, flags, factcheck }
    })
  }

  const user = buildUserMessage({ contentType, platform, facts: safeFacts, notes, pastTexts: past })
  const system = systemFor(platform)
  const first = await generateVariants(anthropic, trackAI, user, system)
  if (!first) return { variants: [], chosen: null, failed: true }

  let variants = await withFlags(first)
  let chosen = choose(variants)
  if (chosen) return { variants, chosen, failed: false }

  // Every variant broke a hard rule. Tell the model exactly which ones and try once more.
  const broken = [...new Set(variants.flatMap(v => v.flags.filter(f => f.level === 'hard').map(f => `${f.code}: ${f.msg}`)))]
  const retryUser = `${user}\n\nYour previous attempt broke these rules. Every new variant must avoid all of them:\n${broken.map(b => `- ${b}`).join('\n')}`
  const second = await generateVariants(anthropic, trackAI, retryUser, system)
  if (!second) return { variants, chosen: null, failed: true }

  variants = await withFlags(second)
  chosen = choose(variants)
  return { variants, chosen, failed: !chosen }
}

// ============================================================================
// 📚 INSTAGRAM CAROUSELS
// ============================================================================
// A carousel is a deck of slides plus one caption, written in a single model call and then checked
// the same way a post is: guardrails on every slide and on the caption, a Haiku fact check against
// the same FACTS the writer saw, and — for macro_101 — the stricter claim check that refuses
// invented specifics outright.
//
// The renderer owns the layouts (cover / concept / points / callout / cta); the model only fills
// them. It never picks a slide kind that does not exist, and it never supplies a number: every
// figure on a deck comes from FACTS, which the caller assembles.

export const CAROUSEL_TYPES = ['daily_brief', 'macro_101', 'event_explainer', 'scorecard', 'called_it']
// Meta's carousel limit. The renderer enforces it again at render time.
export const CAROUSEL_MAX_SLIDES = 10
const CAPTION_MIN = 300
const CAPTION_MAX = 900
const CAPTION_TAGS_MIN = 5
const CAPTION_TAGS_MAX = 8
// Field lengths the layouts can actually hold. Over-long text is not truncated silently — it is a
// hard flag, so the model rewrites it rather than the card cutting a sentence in half.
const SLIDE_LIMITS = { kicker: 30, label: 34, title: 80, paragraph: 240, point: 130, text: 200, line: 70 }
// Types with no FACTS to ground against are checked for invented specifics instead.
const CAROUSEL_EDU_TYPES = new Set(['macro_101'])

const CAROUSEL_RULES = `CAROUSEL RULES — INSTAGRAM
You write a deck of slides and one caption. The slides are drawn by our own card renderer, so you
fill fixed layouts; you never describe a design, a colour, an emoji or an image.

SLIDE KINDS — use only these, with exactly these fields:
- {"kind":"cover","kicker":"2-3 words","title":"the hook, max ${SLIDE_LIMITS.title} chars"}
- {"kind":"concept","label":"2-4 words","title":"max ${SLIDE_LIMITS.title} chars","paragraphs":["1 to 3 short paragraphs, each max ${SLIDE_LIMITS.paragraph} chars"]}
- {"kind":"points","label":"2-4 words","title":"max ${SLIDE_LIMITS.title} chars","points":["1 to 3 lines, each max ${SLIDE_LIMITS.point} chars"]}
- {"kind":"callout","label":"2-4 words","text":"ONE statement, max ${SLIDE_LIMITS.text} chars"}
- {"kind":"cta","line":"one line about what BiasForge does, max ${SLIDE_LIMITS.line} chars"}

DECK RULES
- The FIRST slide is always a cover. The LAST slide is always a cta. Never more than ${CAROUSEL_MAX_SLIDES} slides.
- One idea per slide. A slide is read in about two seconds on a phone.
- Write in sentences, not fragments. No bullet symbols, no numbering, no markdown, no emoji.
- The deck must make sense read straight through, and every middle slide must earn its place.
- Nothing on a slide may be a number that is not in FACTS.

CAPTION RULES
- ${CAPTION_MIN} to ${CAPTION_MAX} characters, counting spaces and line breaks.
- The FIRST LINE is the hook and must stand on its own: Instagram hides the rest behind "more".
- Short paragraphs with blank lines between them. The caption adds context — it does not repeat the slides line by line.
- The LAST line is ${CAPTION_TAGS_MIN} to ${CAPTION_TAGS_MAX} hashtags, all on that one line, and hashtags appear nowhere else.
- You may write "Save this" or "Share this with" AT MOST ONCE in the whole caption, or not at all.
- No links, no URLs and no domain names anywhere in the caption.

OUTPUT
- Output ONLY minified JSON in exactly this form: {"caption":"...","slides":[{"kind":"cover","kicker":"...","title":"..."}]}
- No preamble, no explanation, no markdown, no code fences.`

const carouselSystem = () => `${BASE_RULES}\n\n${CAROUSEL_RULES}`

// What the writer is asked for per type, and which facts it may see. `slides` is the allowed slide
// count; the checks below verify the deck's shape, never its wording.
const CAROUSEL_TASKS = {
  daily_brief: {
    slides: [6, 7],
    facts: f => ({
      ...pick(f, ['dateLabel']),
      bias: pick(f.bias || {}, ['pair', 'direction', 'confidence', 'grade', 'reasoning']),
      events: pickEach(f.events, ['time', 'currency', 'title', 'forecast', 'previous', 'impact']),
      // The raw headline is deliberately absent: the news slide is our paraphrase of what it means.
      news: pickEach(f.news, ['oneliner', 'marketTags', 'impactScore']),
      mover: f.mover ? pick(f.mover, ['label', 'assets']) : undefined,
    }),
    brief: `Write today's macro brief for Instagram.
Slide plan, in this order (drop a slide only when FACTS has nothing for it):
1. cover — the date and what today is about.
2. concept — today's bias: the pair, the direction, and the ONE driver from FACTS.bias.reasoning. confidence is a 40-92 strength score for how well the inputs agree, never a percentage and never a win rate.
3. concept — the news that matters and WHY it matters for FX. Paraphrase FACTS.news in your own words; never restate a headline and never name an outlet.
4. points — what is still ahead on the calendar today, from FACTS.events, with each time as it appears in FACTS (UTC). Never predict a number or say whether it beats the forecast.
5. concept — the market mover from FACTS.mover and which assets it touches.
6. callout — one honest line on what traders are watching from here. No prediction.
7. cta.`,
  },

  macro_101: {
    slides: [6, 8],
    facts: f => pick(f, ['topic', 'angle']),
    brief: `Teach one macro idea, FACTS.topic, to funded and prop-firm traders.
Slide plan, in this order:
1. cover — the idea as a question a trader would actually ask.
2-4. concept — build the mechanism one step at a time. FACTS.angle says what the deck must make clear. Define every technical term the first time you use it.
5. points — how traders use it, in their analysis or their risk, never as a trade call.
6. callout — the common mistake people make with this idea.
7. cta.
- NO specific historical numbers, dates, years, named events, statistics or percentages anywhere, including the caption. Explain the mechanism in general terms; the lesson must hold without them.
- No predictions about current markets, no mention of today's prices or today's bias.`,
  },

  event_explainer: {
    slides: [5, 7],
    facts: f => ({ ...pick(f, ['dateLabel']), event: pick(f.event || {}, ['time', 'currency', 'title', 'forecast', 'previous', 'impact']) }),
    brief: `Explain one high-impact event on today's calendar, FACTS.event.
Slide plan, in this order:
1. cover — the event and its time, exactly as FACTS gives it (UTC).
2. concept — what the release actually measures, in plain English.
3. points — which pairs and assets tend to react, and through what mechanism.
4. concept — what traders watch when it lands: the gap between the forecast and the release, and what separates a lasting repricing from a knee-jerk move.
5. callout — one honest line. Say plainly that this is not a prediction of the number or the direction.
6. cta.
- You may quote FACTS.event.forecast and FACTS.event.previous, labelled plainly as forecast and previous so they cannot be read as results.
- NEVER predict the number, the direction, or whether it beats or misses.`,
  },

  scorecard: {
    // Sized by the week, not fixed: every call needs its own line, three to a points slide.
    slides: f => scorecardSlideRange(f?.rows),
    facts: f => ({ ...pick(f, ['rangeLabel']), rows: pickEach(f.rows, ['date', 'pair', 'direction', 'outcome']) }),
    brief: `Show the week's calls, hits and misses alike, from FACTS.rows.
Slide plan:
1. cover — the week's range from FACTS.rangeLabel.
2. points — the calls in date order, at most three per slide, one honest line each: the date exactly as FACTS gives it (for example "Mon 21"), the pair, the direction, and how it resolved. EVERY row in FACTS.rows gets its own line; none may be left out, merged or summarised. Use as many points slides as that takes. A miss is written as plainly as a hit. Label and title each points slide by its day or days (for example "Wednesday"), never by how many calls it holds.
3. callout — one honest line about the week. A week is a small sample and says little either way. If it names a call, name it by pair and day.
4. cta.
- The caption describes only the rows in FACTS. Do not mention open calls unless a row's outcome is "open".
- NO aggregate anywhere, including the caption: no percentage, no win rate, no totals, and no aggregate scoreboard phrasing — never a number applied to the calls as a whole ("five calls", "3 hits", "two misses", "X of Y", "4 for 5", "most landed", "the majority"), no streak, no record. Naming one call and its outcome is fine, including a miss ("GBPUSD on Friday did not hold").
- outcome "open" means the call has not resolved yet. Say so; do not guess how it will end.`,
  },

  called_it: {
    slides: [5, 7],
    facts: f => ({
      call: pick(f.call || {}, ['pair', 'direction', 'publishedAt', 'reasoning', 'outcome']),
      priorPost: pick(f.priorPost || {}, ['contentType', 'publishedAt', 'subject']),
    }),
    brief: `Show one call that was published before the move and later recorded as a hit.
Slide plan:
1. cover — that we flagged this before the move. No boast beyond that.
2. concept — what we posted and when, using the exact date and time in FACTS.priorPost.publishedAt.
3. concept — what the reasoning said, from FACTS.call.reasoning.
4. concept — what the outcome was, stated plainly as the recorded outcome in FACTS.call.outcome and nothing more.
5. callout — that not every call lands, and that the misses are published every week in the scorecard.
6. cta.
- NEVER describe what the market did beyond the recorded outcome. No pips, no percentage, no "ran X", no size of move, no streak, no "again".
- Do not re-interpret, re-forecast or extend the call. It resolved; that is the whole story.
- No gloating. The honest line on slide 5 is not optional.`,
  },
}

// ── Parsing and shape checks ──────────────────────────────────────────────────
// Over-long text is kept (up to a sane ceiling) rather than cut, so deckFlags can flag it and the
// model rewrites it. Silently truncating would put half a sentence on a card.
const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max * 3)
const strList = (v, max, limit) => (Array.isArray(v) ? v : [v]).map(s => str(s, limit)).filter(Boolean).slice(0, max)

// Returns { caption, slides } with each slide reduced to the fields its layout reads, or null when
// nothing usable parsed.
function parseCarousel(raw) {
  const obj = parseLooseJson(raw)
  if (!obj || !Array.isArray(obj.slides)) return null
  const slides = []
  for (const s of obj.slides) {
    const kind = String(s?.kind || '').trim().toLowerCase()
    if (kind === 'cover') slides.push({ kind, kicker: str(s.kicker, SLIDE_LIMITS.kicker), title: str(s.title, SLIDE_LIMITS.title) })
    else if (kind === 'concept') slides.push({ kind, label: str(s.label, SLIDE_LIMITS.label), title: str(s.title, SLIDE_LIMITS.title), paragraphs: strList(s.paragraphs, 3, SLIDE_LIMITS.paragraph) })
    else if (kind === 'points') slides.push({ kind, label: str(s.label, SLIDE_LIMITS.label), title: str(s.title, SLIDE_LIMITS.title), points: strList(s.points, 3, SLIDE_LIMITS.point) })
    else if (kind === 'callout') slides.push({ kind, label: str(s.label, SLIDE_LIMITS.label), text: str(s.text, SLIDE_LIMITS.text) })
    else if (kind === 'cta') slides.push({ kind, line: str(s.line, SLIDE_LIMITS.line) })
    else slides.push({ kind: kind || 'unknown' })
  }
  const caption = String(obj.caption ?? '').trim()
  if (!slides.length || !caption) return null
  return { caption, slides }
}

// Everything a reader sees on one slide, as one string, for the guardrails and the fact check.
export function slideText(slide) {
  if (!slide || typeof slide !== 'object') return ''
  const parts = [slide.kicker, slide.label, slide.title, slide.text, slide.line, ...(slide.paragraphs || []), ...(slide.points || [])]
  return parts.filter(Boolean).join(' ').trim()
}

// Deck shape: the kinds that exist, the cover/cta bookends, the slide count, and every field within
// the length its layout can hold. All hard — a deck that fails here cannot be rendered as written.
function deckFlags(slides, [min, max]) {
  const out = []
  const hard = msg => out.push({ level: 'hard', code: 'deck_shape', msg })
  if (slides.length > CAROUSEL_MAX_SLIDES) hard(`${slides.length} slides; Instagram carousels hold at most ${CAROUSEL_MAX_SLIDES}`)
  else if (slides.length < min || slides.length > max) hard(`${slides.length} slides; this deck needs ${min}-${max}`)
  if (slides[0]?.kind !== 'cover') hard(`the first slide is "${slides[0]?.kind || 'missing'}"; it must be a cover`)
  if (slides[slides.length - 1]?.kind !== 'cta') hard(`the last slide is "${slides[slides.length - 1]?.kind || 'missing'}"; it must be a cta`)
  slides.forEach((s, i) => {
    const at = `slide ${i + 1}`
    if (!['cover', 'concept', 'points', 'callout', 'cta'].includes(s.kind)) { hard(`${at}: unknown kind "${s.kind}"`); return }
    if (s.kind === 'cover' && !s.title) hard(`${at}: the cover has no title`)
    if (s.kind === 'concept' && (!s.title || !s.paragraphs.length)) hard(`${at}: a concept slide needs a title and at least one paragraph`)
    if (s.kind === 'points' && (!s.title || !s.points.length)) hard(`${at}: a points slide needs a title and at least one point`)
    if (s.kind === 'callout' && !s.text) hard(`${at}: the callout has no text`)
    if (s.kind === 'cover' && i > 0) hard(`${at}: only the first slide may be a cover`)
    if (s.kind === 'cta' && i < slides.length - 1) hard(`${at}: only the last slide may be a cta`)
    for (const [field, limit] of Object.entries(SLIDE_LIMITS)) {
      for (const v of [s[field]].flat().filter(x => typeof x === 'string')) {
        if (v.length > limit) hard(`${at}: ${field} is ${v.length} chars, the layout holds ${limit}`)
      }
    }
  })
  return out
}

// The scorecard deck's slide range: cover + callout + cta, plus enough points slides for every call.
// The fewest is three calls to a slide; the most is one run of slides per day (a day's calls never
// need to share a slide with another day's). Capped at Instagram's limit.
export function scorecardSlideRange(rows) {
  const list = Array.isArray(rows) ? rows : []
  const perDay = new Map()
  for (const r of list) perDay.set(r?.date, (perDay.get(r?.date) || 0) + 1)
  const fewest = Math.max(1, Math.ceil(list.length / 3))
  const most = Math.max(fewest, [...perDay.values()].reduce((s, k) => s + Math.ceil(k / 3), 0))
  return [3 + fewest, Math.min(CAROUSEL_MAX_SLIDES, 3 + most)]
}

// Every call in FACTS.rows must appear on its own points line: its pair, its day and its direction.
// The fact check sees what is written, not what was left out, so an omitted call — the Monday that
// used to fall off — needs a check of its own. Returns hard flags naming each missing call.
export function scorecardCoverageFlags(slides, rows) {
  const lines = (Array.isArray(slides) ? slides : []).filter(s => s?.kind === 'points').flatMap(s => s.points || [])
  const used = new Set()
  const out = []
  for (const r of Array.isArray(rows) ? rows : []) {
    const pair = String(r?.pair || '').toUpperCase().replace(/[^A-Z]/g, '')
    const day = (String(r?.date || '').match(/\d+/) || [])[0]
    const dirRe = /BULL|BUY|LONG/i.test(r?.direction || '') ? /\b(bull\w*|buy|long)\b/i : /\b(bear\w*|sell|short)\b/i
    const i = lines.findIndex((line, n) => {
      if (used.has(n)) return false
      const flat = line.toUpperCase().replace(/[^A-Z]/g, '')
      const pairOk = flat.includes(pair) || (pair === 'XAUUSD' && flat.includes('GOLD'))
      return pairOk && (!day || new RegExp(`\\b${day}\\b`).test(line)) && dirRe.test(line)
    })
    if (i === -1) out.push({ level: 'hard', code: 'scorecard_coverage', msg: `the deck leaves out a call: ${r?.date} ${r?.pair} ${r?.direction} — every call in FACTS.rows needs its own line` })
    else used.add(i)
  }
  return out
}

// Caption rules specific to a carousel caption, on top of validateSocialPost.
export function captionFlags(caption) {
  const out = []
  const hard = (code, msg) => out.push({ level: 'hard', code, msg })
  const text = String(caption ?? '')
  const tagRe = /(?<![\p{L}\p{N}_&])#\p{L}[\p{L}\p{N}_]*/gu

  if (text.trim().length < CAPTION_MIN) hard('caption_length', `caption is ${text.trim().length} chars; the minimum is ${CAPTION_MIN}`)
  else if (text.length > CAPTION_MAX) hard('caption_length', `caption is ${text.length} chars; the maximum is ${CAPTION_MAX}`)

  const nonEmpty = text.split('\n').map(l => l.trim()).filter(Boolean)
  const last = nonEmpty[nonEmpty.length - 1] || ''
  const lastTags = (last.match(tagRe) || []).length
  const allTags = (text.match(tagRe) || []).length
  if (allTags !== lastTags) hard('caption_hashtags', `${allTags - lastTags} hashtag(s) outside the last line; they all belong on the final line`)
  else if (lastTags < CAPTION_TAGS_MIN || lastTags > CAPTION_TAGS_MAX) hard('caption_hashtags', `${lastTags} hashtag(s) on the last line; the caption needs ${CAPTION_TAGS_MIN}-${CAPTION_TAGS_MAX}`)

  // "Save this" / "share with" is fine once. Twice is the tone of an engagement-bait account.
  const asks = (text.match(/\b(save (this|it)|share (this|it) with|send (this|it) to)\b/gi) || []).length
  if (asks > 1) hard('caption_ask', `${asks} "save this" / "share with" asks; at most one`)

  // Instagram makes no link in a caption clickable, and the publisher refuses one outright.
  if (/https?:\/\//i.test(text) || /biasforge\.(co|ai)/i.test(text)) hard('caption_link', 'the caption contains a link or a domain; neither is clickable on Instagram — say "link in bio"')
  return out
}

// One call, plus one more if the reply does not parse.
async function generateDeck(anthropic, trackAI, user, system) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const m = await anthropic.messages.create({
      model: MODEL,
      max_tokens: CAROUSEL_MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: user }],
    })
    if (typeof trackAI === 'function') {
      try { trackAI('social-carousel', MODEL, m.usage) } catch {}
    }
    const deck = parseCarousel((m.content || []).filter(b => b.type === 'text').map(b => b.text).join(''))
    if (deck) return deck
  }
  return null
}

function carouselUserMessage({ carouselType, facts, topic, notes, pastTexts }) {
  const task = CAROUSEL_TASKS[carouselType]
  const modelFacts = task.facts(facts)
  const parts = [
    'PLATFORM: instagram (carousel)',
    `CAROUSEL TYPE: ${carouselType}`,
    `TASK:\n${task.brief}`,
    `FACTS:\n${JSON.stringify(modelFacts)}`,
  ]
  // A deck sized by its facts (the scorecard) states the count it will be held to.
  if (typeof task.slides === 'function') {
    const [min, max] = task.slides(facts)
    parts.push(`SLIDE COUNT: ${min === max ? `exactly ${min}` : `${min} to ${max}`} slides in total, cover and cta included.`)
  }
  if (topic?.title) parts.push(`TOPIC: ${topic.title}${topic.angle ? `\nANGLE: ${topic.angle}` : ''}`)
  if (notes && String(notes).trim()) parts.push(`NOTES:\n${String(notes).trim()}`)
  parts.push(pastTexts.length
    ? `PAST POSTS (do not reuse their sentences, openers or phrasing):\n${pastTexts.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    : 'PAST POSTS: none')
  return { user: parts.join('\n\n'), modelFacts }
}

// Checks a parsed deck and returns its flags. Exported so a deck edited in the Studio can be
// re-checked without another model call.
export function checkCarousel({ carouselType, slides, caption, facts = {}, pastTexts = [] }) {
  const task = CAROUSEL_TASKS[carouselType]
  if (!task) throw new Error(`checkCarousel: unknown carouselType "${carouselType}"`)
  const list = Array.isArray(slides) ? slides : []
  const range = typeof task.slides === 'function' ? task.slides(facts) : task.slides
  const flags = [...deckFlags(list, range), ...captionFlags(caption)]
  if (carouselType === 'scorecard') flags.push(...scorecardCoverageFlags(list, facts?.rows))
  const edu = CAROUSEL_EDU_TYPES.has(carouselType)

  // The caption is a post in its own right: full guardrails, including the duplicate check.
  for (const f of validateSocialPost(caption, { platform: 'instagram', contentType: carouselType, facts, pastTexts }).flags) {
    flags.push({ ...f, msg: `caption — ${f.msg}` })
  }
  // Every slide goes through the same guardrails (levels, guarantees, banned phrases, .ai domains).
  // No pastTexts there: a slide is a handful of words and would read as a duplicate of everything.
  list.forEach((s, i) => {
    const text = slideText(s)
    if (!text) return
    for (const f of validateSocialPost(text, { platform: 'instagram', contentType: carouselType, facts }).flags) {
      flags.push({ ...f, msg: `slide ${i + 1} — ${f.msg}` })
    }
    if (edu) for (const why of eduSpecificClaims(text)) flags.push({ level: 'hard', code: 'claim_check', msg: `slide ${i + 1} — ${why}` })
  })
  if (edu) for (const why of eduSpecificClaims(caption)) flags.push({ level: 'hard', code: 'claim_check', msg: `caption — ${why}` })
  return flags
}

// Writes one carousel: { slides, caption, flags, factcheck, failed }.
// `failed` means it must not be used — either nothing parsed, twice over, or a hard rule was broken
// twice over. Everything else comes back with its flags for the admin to see.
export async function generateCarousel({ carouselType, facts = {}, topic = null, notes = '', pastTexts = [], anthropic, trackAI } = {}) {
  const task = CAROUSEL_TASKS[carouselType]
  if (!task) throw new Error(`generateCarousel: unknown carouselType "${carouselType}" (expected ${CAROUSEL_TYPES.join(', ')})`)
  if (!anthropic?.messages?.create) throw new Error('generateCarousel: an Anthropic client is required')

  const safeFacts = facts && typeof facts === 'object' ? facts : {}
  const past = Array.isArray(pastTexts) ? pastTexts.filter(t => typeof t === 'string' && t.trim()) : []
  const { user, modelFacts } = carouselUserMessage({ carouselType, facts: safeFacts, topic, notes, pastTexts: past })
  const system = carouselSystem()
  const edu = CAROUSEL_EDU_TYPES.has(carouselType)
  const doFactCheck = Object.keys(modelFacts).length > 0

  const check = async deck => {
    const flags = checkCarousel({ carouselType, slides: deck.slides, caption: deck.caption, facts: safeFacts, pastTexts: past })
    // One check over the caption and every slide, against the same facts the writer saw.
    // The cta slide is left out: its job is to say what BiasForge does, which is never in a
    // carousel's FACTS, so the grounding check flagged it every time ("'daily macro bias' not
    // mentioned in FACTS"). It still goes through every guardrail in checkCarousel above.
    const checked = deck.slides.map((s, n) => ({ s, n })).filter(x => x.s.kind !== 'cta')
    const texts = [deck.caption, ...checked.map(x => slideText(x.s))]
    const checks = doFactCheck
      ? await factCheck(anthropic, trackAI, modelFacts, texts, edu ? 'education' : 'grounding', CAROUSEL_FACTCHECK_MAX_TOKENS)
      : null
    let factcheck = { status: doFactCheck ? 'unavailable' : 'skipped', issue: null }
    if (checks) {
      const bad = checks.map((c, i) => (c && !c.grounded ? { where: i === 0 ? 'caption' : `slide ${checked[i - 1].n + 1}`, issue: c.issue } : null)).filter(Boolean)
      if (bad.length) {
        factcheck = { status: 'ungrounded', issue: bad.map(b => `${b.where}: ${b.issue}`).join('; ') }
        for (const b of bad) flags.push({ level: 'hard', code: edu ? 'claim_check' : 'ungrounded', msg: `${b.where} — ${b.issue}` })
      } else if (checks.some(Boolean)) factcheck = { status: 'grounded', issue: null }
    }
    return { ...deck, flags, factcheck, failed: flags.some(f => f.level === 'hard') }
  }

  const first = await generateDeck(anthropic, trackAI, user, system)
  if (!first) {
    return {
      slides: [], caption: '', failed: true, factcheck: { status: 'skipped', issue: null },
      flags: [{ level: 'hard', code: 'unparseable', msg: 'the model reply could not be parsed as a carousel' }],
    }
  }

  const deck = await check(first)
  if (!deck.failed) return deck

  // Tell the model exactly which rules it broke and try once more.
  const hardOf = d => d.flags.filter(f => f.level === 'hard')
  const broken = [...new Set(hardOf(deck).map(f => `${f.code}: ${f.msg}`))]
  const retryUser = `${user}\n\nYour previous attempt broke these rules. The new deck must avoid all of them:\n${broken.map(b => `- ${b}`).join('\n')}`
  const second = await generateDeck(anthropic, trackAI, retryUser, system)
  if (!second) return deck
  const retried = await check(second)
  // Keep whichever deck is cleaner, so the admin sees the better of the two even when both failed.
  return !retried.failed || hardOf(retried).length < hardOf(deck).length ? retried : deck
}
