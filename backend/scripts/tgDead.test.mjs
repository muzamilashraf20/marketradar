// Test vectors for lib/tgDead.js — which Telegram errors switch a subscriber off.
//   node backend/scripts/tgDead.test.mjs

import { deadChatReason } from '../lib/tgDead.js'

let pass = 0, fail = 0
function check(name, ok, detail = '') {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`)
}
const err = (error_code, description) => ({ ok: false, error_code, description })

check('403 blocked by the user → dead', deadChatReason(err(403, 'Forbidden: bot was blocked by the user')) === 'blocked the bot')
check('403 user is deactivated → dead', deadChatReason(err(403, 'Forbidden: user is deactivated')) === 'account deactivated')
check('403 bot was kicked → dead', deadChatReason(err(403, 'Forbidden: bot was kicked from the group chat')) === 'bot was kicked')
check('400 chat not found → dead', deadChatReason(err(400, 'Bad Request: chat not found')) === 'chat not found')

check('ok response → not dead', deadChatReason({ ok: true, result: {} }) === null)
check('429 rate limit → not dead', deadChatReason(err(429, 'Too Many Requests: retry after 5')) === null)
check('400 bad HTML → not dead', deadChatReason(err(400, "Bad Request: can't parse entities")) === null)
check('403 not enough rights (channel perms) → not dead', deadChatReason(err(403, 'Forbidden: bot is not a member of the channel chat')) === null)
check('500 → not dead', deadChatReason(err(500, 'Internal Server Error')) === null)
check('text match needs the right code (400 + "blocked") → not dead', deadChatReason(err(400, 'bot was blocked by the user')) === null)
check('null / garbage → not dead', deadChatReason(null) === null && deadChatReason({}) === null)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
