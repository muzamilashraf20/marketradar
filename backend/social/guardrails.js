// Guardrails for public social copy (X / Instagram / LinkedIn).
//
// Pure functions, no dependencies, no I/O. Every generated post passes through validateSocialPost
// before a human (or a future auto-poster) sees it. 'hard' flags mean the post must not go out as
// written; 'soft' flags mean it can, but someone should look first.
//
// The rules protect three things: the accounts themselves (platform spam/finance policies), the
// paid product (levels and invalidation are what Pro users pay for), and credibility (no invented
// numbers, no promises, no copy that reads like every other signal group).

// Phrases that have been used so often in our own copy they now read as filler, or that frame the
// product the way a signal seller would. Matched case-insensitively with whitespace collapsed.
export const BANNED_PHRASES = [
  'a compass, not a signal button',
  'not a signal',
  'direction and invalidation',
  'a line in the sand',
  'the whole game',
  'macro map',
]

const MAX_LENGTH = { x: 270, instagram: 2200, linkedin: 2800 }   // Instagram: Meta's 2200-character caption limit
// Unknown platforms get X's rule, the strictest.
const HASHTAG_MAX = { x: 1, linkedin: 3, instagram: 8 }
const SIMILARITY_LIMIT = 0.35
const SHARED_RUN_WORDS = 6

// Lowercase, drop apostrophes (so "can't" stays one word), turn every other non-letter/digit into
// a space, and split. Used by every word-level comparison so they all agree on what a word is.
function words(text) {
  return String(text)
    .toLowerCase()
    .replace(/['‘’`]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function shingles(ws, n) {
  const set = new Set()
  for (let i = 0; i + n <= ws.length; i++) set.add(ws.slice(i, i + n).join(' '))
  return set
}

// Jaccard similarity over word 3-grams. 0 when either side is too short to have a 3-gram, so a
// one-line reply can never be called a duplicate of anything by this measure alone.
export function similarityScore(a, b) {
  const wa = words(a ?? '')
  const wb = words(b ?? '')
  if (wa.length < 3 || wb.length < 3) return 0
  const sa = shingles(wa, 3)
  const sb = shingles(wb, 3)
  let shared = 0
  for (const s of sa) if (sb.has(s)) shared++
  return shared / (sa.size + sb.size - shared)
}

function hasSharedRun(a, b, n) {
  const sb = shingles(words(b), n)
  if (!sb.size) return false
  for (const s of shingles(words(a), n)) if (sb.has(s)) return true
  return false
}

function decimalsOf(s) {
  const m = s.match(/\.(\d+)$/)
  return m ? m[1].length : 0
}

// Every way a number written in the text could be read. "1,0850" is ambiguous (European decimal
// or a thousands separator), so both readings are returned rather than guessing.
function numberReadings(raw) {
  const out = []
  const plain = raw.replace(/,/g, '')
  out.push({ value: parseFloat(plain), dp: decimalsOf(plain) })
  if (!raw.includes('.') && (raw.match(/,/g) || []).length === 1) {
    const asDecimal = raw.replace(',', '.')
    out.push({ value: parseFloat(asDecimal), dp: decimalsOf(asDecimal) })
  }
  return out.filter(r => Number.isFinite(r.value))
}

// True when the text contains the invalidation level in any common spelling: trailing zeros
// dropped or added (1.085 / 1.08500), comma decimal (1,0850), thousands commas (2,345.50).
// Both sides are rounded to the larger decimal count and must then match exactly.
function mentionsLevel(text, level) {
  const target = String(level).trim().replace(/,/g, '')
  const value = parseFloat(target)
  if (!Number.isFinite(value)) return false
  const dpTarget = decimalsOf(target)
  for (const raw of String(text).match(/\d+(?:[.,]\d+)*/g) || []) {
    for (const r of numberReadings(raw)) {
      const dp = Math.max(dpTarget, r.dp)
      if (r.value.toFixed(dp) === value.toFixed(dp)) return true
    }
  }
  return false
}

// Counts emoji as the reader sees them: a ZWJ family or a flag is one emoji, not four code points.
function countEmoji(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    let n = 0
    for (const { segment } of new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)) {
      if (/\p{Extended_Pictographic}/u.test(segment)) n++
    }
    return n
  }
  return (text.match(/\p{Extended_Pictographic}/gu) || []).length
}

const anyMatch = (text, patterns) => patterns.some(re => re.test(text))

export function validateSocialPost(text, opts) {
  const flags = []
  const hard = (code, msg) => flags.push({ level: 'hard', code, msg })
  const soft = (code, msg) => flags.push({ level: 'soft', code, msg })

  // Nothing to post is a generator failure, not a post. Stop here so no other rule runs on junk.
  if (typeof text !== 'string' || !text.trim()) {
    hard('empty', 'Post text is empty or not a string')
    return { flags }
  }

  const o = opts && typeof opts === 'object' ? opts : {}
  const platform = typeof o.platform === 'string' ? o.platform.toLowerCase() : ''
  const contentType = typeof o.contentType === 'string' ? o.contentType : ''
  const facts = o.facts && typeof o.facts === 'object' ? o.facts : {}
  const pastTexts = Array.isArray(o.pastTexts) ? o.pastTexts.filter(p => typeof p === 'string' && p.trim()) : []

  // The domain is biasforge.co. Any .ai domain either sends traffic to the wrong site (splitting
  // SEO) or names a competitor, and the model has hallucinated "biasforge.ai" before.
  if (anyMatch(text, [/biasforge\.ai/i, /\b[a-z0-9-]+\.ai\b/i])) {
    hard('domain_ai', 'Mentions a .ai domain; the only domain is biasforge.co')
  }

  // Entries, stops and targets turn a post into trade advice (a platform-policy and regulatory
  // problem) and give away for free what the paid dashboard exists to provide.
  if (anyMatch(text, [/\b(SL|TP)\b/i, /stop[-\s]?loss/i, /take[-\s]?profit/i, /\bentry (price|at|zone)\b/i])) {
    hard('trade_levels', 'Contains trade levels (SL/TP/entry)')
  }

  // Invalidation is the single most valuable number in a bias card and it is Pro-only. Public
  // copy must never carry it, neither by name nor by value in any spelling.
  if (/invalidat/i.test(text)) {
    hard('invalidation', 'Mentions invalidation; that is a paid-only detail')
  } else if (facts.invalidation != null && facts.invalidation !== '' && mentionsLevel(text, facts.invalidation)) {
    hard('invalidation', `Contains the invalidation level (${facts.invalidation})`)
  }

  // The engine runs on a schedule, not tick by tick. Claiming otherwise is false advertising and
  // is exactly the language that gets finance accounts reported as signal spam.
  if (anyMatch(text, [/real[-\s]?time signal/i, /live signals?/i, /every \d+ (seconds|minutes)/i])) {
    hard('realtime_claim', 'Claims real-time or live signals')
  }

  // Nothing about trading is guaranteed. Promises are the fastest route to an account ban and
  // to a refund dispute.
  if (anyMatch(text, [/guarantee/i, /risk[-\s]?free/i, /can'?t lose/i])) {
    hard('guarantee', 'Promises an outcome (guarantee / risk-free / can\'t lose)')
  }

  // There is no audited track record. Any percentage win rate or return in generated copy is a
  // number the model made up.
  if (anyMatch(text, [/\d+\s?%\s?(win|accura|profit|return|success)/i, /\b\d+\s?%\s?win[-\s]?rate/i])) {
    hard('perf_claim', 'Contains a performance percentage we cannot back up')
  }

  // Worn-out house phrases. Repeating them makes every post sound like the last one.
  const flat = text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ')
  const banned = BANNED_PHRASES.filter(p => flat.includes(p))
  if (banned.length) hard('banned_phrase', `Uses banned phrase(s): ${banned.map(p => `"${p}"`).join(', ')}`)

  // X throttles reach on posts with outbound links. The link goes in the bio or a reply instead.
  if (platform === 'x' && anyMatch(text, [/https?:\/\//i, /biasforge\.co/i])) {
    hard('x_link', 'X post contains a link; links go in a reply or the bio')
  }

  // Over the platform limit the post is rejected or truncated mid-sentence. X is capped at 270,
  // not 280, to leave room for the weighted counting X applies to emoji and CJK.
  const max = MAX_LENGTH[platform]
  if (max && text.length > max) hard('too_long', `${text.length} chars; ${platform} limit is ${max}`)

  // A bias card that never names its pair is a generation error, and the reader cannot tell what
  // the post is about.
  if (contentType === 'bias_card' && typeof facts.pair === 'string' && facts.pair.trim()) {
    const norm = s => s.toLowerCase().replace(/\//g, '')
    if (!norm(text).includes(norm(facts.pair.trim()))) {
      hard('missing_fact', `Bias card does not mention its pair (${facts.pair})`)
    }
  }

  // Near-identical posts get downranked by every platform and look automated to followers.
  // Two checks: overall shingle overlap catches rewording, the shared run catches a recycled
  // sentence dropped into otherwise new copy.
  for (let i = 0; i < pastTexts.length; i++) {
    const score = similarityScore(text, pastTexts[i])
    if (score >= SIMILARITY_LIMIT) {
      hard('duplicate', `Too similar to past post #${i} (similarity ${score.toFixed(2)})`)
      break
    }
    if (hasSharedRun(text, pastTexts[i], SHARED_RUN_WORDS)) {
      hard('duplicate', `Shares a run of ${SHARED_RUN_WORDS}+ words with past post #${i}`)
      break
    }
  }

  // "Signal" is fine when we are contrasting ourselves with signal groups, but it is also how
  // the product gets mis-described. Worth a human look.
  if (/\bsignals?\b/i.test(text)) soft('signal_word', 'Uses the word "signal"; check the framing')

  // Emoji-stacked finance posts read as pump-and-dump. One is fine.
  const emoji = countEmoji(text)
  if (emoji > 1) soft('emoji_heavy', `${emoji} emoji; keep it to one`)

  // Starting every post with the same word makes the feed look templated.
  const first = words(text)[0]
  if (first && pastTexts.some(p => words(p)[0] === first)) {
    soft('same_opener', `Opens with "${first}" like a recent post`)
  }

  // Hashtag stacking reads as spam, but where the line sits depends on the platform: one on X,
  // a few on LinkedIn, and on Instagram a handful is simply how posts get found.
  const tags = (text.match(/(?<![\p{L}\p{N}_&])#\p{L}[\p{L}\p{N}_]*/gu) || []).length
  const maxTags = HASHTAG_MAX[platform] ?? HASHTAG_MAX.x
  if (tags > maxTags) soft('hashtag_heavy', `${tags} hashtags; keep it to ${maxTags === 1 ? 'one' : `${maxTags} or fewer`}`)

  return { flags }
}
