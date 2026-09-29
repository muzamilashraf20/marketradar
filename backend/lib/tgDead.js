// Telegram Bot API errors that mean a chat will NEVER accept messages again from this bot, so the
// subscriber row should be switched off (not deleted — /start re-activates it). Everything else
// (rate limits, bad HTML, network, 5xx) is transient and must not touch the row.
//   403 "Forbidden: bot was blocked by the user"
//   403 "Forbidden: user is deactivated"
//   403 "Forbidden: bot was kicked from the ... chat"
//   400 "Bad Request: chat not found"
const DEAD = [
  { code: 403, re: /bot was blocked by the user/i, reason: 'blocked the bot' },
  { code: 403, re: /user is deactivated/i, reason: 'account deactivated' },
  { code: 403, re: /bot was kicked/i, reason: 'bot was kicked' },
  { code: 400, re: /chat not found/i, reason: 'chat not found' },
]

// `d` is the parsed Bot API response. Returns a short reason when the chat is dead, else null.
export function deadChatReason(d) {
  if (!d || d.ok) return null
  const hit = DEAD.find(x => x.code === d.error_code && x.re.test(String(d.description || '')))
  return hit ? hit.reason : null
}
