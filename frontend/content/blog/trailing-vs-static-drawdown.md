---
title: "Trailing vs. Static Drawdown: The Rule That Fails Most Funded Traders"
description: "More prop firm accounts die to a misunderstood drawdown than to bad trading. Here's exactly how static, end-of-day trailing, and intraday trailing drawdown work — with the math and how to survive each."
slug: "trailing-vs-static-drawdown"
date: "2026-07-21"
category: "Prop Firm"
tags: ["trailing drawdown", "static drawdown", "prop firm", "funded trading", "drawdown"]
ogImage: "/og-image.png"
draft: false
faq:
  - q: "What is the difference between static and trailing drawdown?"
    a: "A static drawdown fixes your maximum-loss floor at the starting balance — on a $100k account with a 10% limit, you fail at $90k no matter how high the account climbs first. A trailing drawdown moves that floor upward as your account makes new highs, so the level that fails you rises with your profits. Static gives you a fixed cushion; trailing keeps shrinking your room every time you reach a new peak."
  - q: "How is trailing drawdown calculated?"
    a: "It's measured from your account's highest point — the high-water mark — rather than from the starting balance. Firms trail one of two ways: end-of-day (balance-based), which only ratchets up on your closed-trade balance at the daily close, or intraday (equity-based), which ratchets up on peak equity including floating profit. Equity-based is stricter because an unrealized profit spike can raise your floor even if you never close the trade."
  - q: "Does trailing drawdown stop trailing?"
    a: "At many firms, yes. A common structure freezes the trailing drawdown once the account has gained enough that the trailing floor reaches the initial balance — after that the drawdown becomes static at your starting deposit. On a $100k account with a 10% trail, the floor typically trails up until the account reaches about $110k, then locks at $100k. Rules vary by firm, so you must confirm whether and when yours freezes."
  - q: "Which is harder, trailing or static drawdown?"
    a: "Trailing is harder, because it punishes giving back profit. Under a static drawdown, banking gains only adds cushion. Under a trailing drawdown, unrealized or realized gains raise the floor, so a normal pullback after a strong run can breach the limit while your account is still above its starting balance. Traders fail trailing-drawdown accounts 'in profit' constantly — which is why knowing your type is non-negotiable."
---

Ask any experienced funded trader what actually ends most challenges, and they won't say bad entries. They'll say the drawdown — specifically, not understanding it. A trader can pick good trades all week and still blow the account by giving back profit they didn't realize was raising the very floor that failed them.

Drawdown is the most important rule in funded trading and the one most people read past in ten seconds. The word looks simple. The mechanics are not, and the gap between "I have a 10% drawdown" and "I know exactly where my line is right now" is where accounts die. This is the deep dive that closes that gap. It pairs with the broader [prop firm challenge guide](/blog/how-prop-firm-challenges-work) — but here we go all the way down on the one rule that matters most.

## What drawdown actually measures

Your maximum drawdown is the **hard floor** on your account — the lowest your balance or equity is allowed to reach before the account is failed. Cross it, even for a moment on some firms, and the attempt is over regardless of how well you'd been trading.

Everything hinges on one question: *is that floor fixed, or does it move?* That single distinction splits into three models, and they behave completely differently.

## The three models, side by side

| Model | Where the floor sits | Moves up when... |
|---|---|---|
| Static | Fixed at starting balance − limit | Never — it's locked |
| Trailing (end-of-day) | Below your highest *closed* balance | Your balance closes a day at a new high |
| Trailing (intraday / equity) | Below your highest *equity* | Equity hits a new peak, including floating profit |

Same headline number — "10% max drawdown" — three very different risk realities. Read on for exactly how each one treats you.

## Static drawdown: the honest one

A **static** drawdown fixes the floor at your starting balance minus the limit. On a $100k account with a 10% max drawdown, your line is **$90k, permanently.** It never moves.

This is the friendliest model, because profit is pure cushion. Take the account to $108k and pull back — you still have all the way down to $90k before there's a problem. Banking gains only ever helps you. If your firm offers static, your job is simple: keep equity above one fixed number you can write on a sticky note.

## Trailing drawdown: the floor that chases you

A **trailing** drawdown starts at that same $90k but then *follows your account upward* as it makes new highs. This is where traders get ambushed, so here's the mechanic in slow motion.

You start at $100k, floor at $90k. The account climbs to $105k. The trailing floor ratchets up by the same $5k — now it sits at **$95k**. The account reaches $108k; the floor trails to **$98k**. The floor never falls back down; it only ever ratchets up to track your high-water mark. Your cushion isn't measured from your starting balance anymore — it's measured from your *best* moment.

> Here's the trap in numbers. You take $100k up to $106k — up 6%, feeling untouchable. Your trailing floor has climbed to $96k. Then a normal losing run pulls you back to $97k. On a *static* account you'd have massive room — you're still above your start. On a *trailing* account you're now $1k from failure, "in profit," having never done anything reckless. The profit you gave back is exactly what tightened the noose. This is how good traders blow trailing accounts while their balance is still green.

## End-of-day vs. intraday: the sub-distinction that bites

Not all trailing drawdowns trail the same way, and the difference is real money.

**End-of-day (balance-based) trailing** only ratchets up on your *closed* balance at the daily reset. Floating profit on an open trade doesn't count. If you spike to +$4k unrealized midday but close the day at +$1k, the floor trails from the $1k, not the $4k. More forgiving.

**Intraday (equity-based) trailing** ratchets up on peak *equity*, floating profit included. That midday +$4k spike raises your floor immediately — even though you never closed the trade and never actually banked it. Let a winner run to +$4k, then watch it retrace to +$500, and on an equity-trailing account you've permanently raised your floor by the peak while keeping almost none of the gain. This is the strictest common model, and it punishes letting winners round-trip.

## Does it ever stop trailing?

Often, yes — and knowing when is a genuine edge. A widespread structure **freezes** the trailing drawdown once the account has gained enough that the trailing floor climbs back up to your **initial balance**. After that point, the drawdown converts to static at your starting deposit.

On a $100k account with a 10% trail, the floor trails upward until the account reaches roughly **$110k**; at that point the floor locks at **$100k** and stops moving. Cross that threshold and the pressure changes character entirely — from then on you simply can't go below your starting balance, and every dollar above it is free cushion again.

That reframes the early game: the hardest, most dangerous stretch of a trailing challenge is the *beginning*, before you've banked enough to lock the floor at breakeven. Get through that zone and the account gets structurally safer. (Firms differ on the exact freeze point — some never freeze — so confirm yours.)

## How to trade under each model

1. **Find out which model you have — and the sub-type.** Static, end-of-day trailing, or intraday trailing? This changes everything downstream.
2. **Compute your floor in real dollars, live.** Not "10%." The actual number, updated as the account moves. On a trailing account, recompute it at every new high.
3. **On intraday trailing, protect floating profit.** Don't let big winners round-trip to nothing — consider partials or trailing stops, because the peak is quietly setting your floor.
4. **Respect the danger zone.** Early in a trailing challenge, before the floor freezes at breakeven, keep risk smallest. That's when a drawdown breach is easiest.
5. **Bank toward the freeze.** If your firm freezes the trail at the initial balance, getting the account above that threshold is a real milestone — it converts your hardest rule into your easiest.

## The bottom line

A drawdown limit is not one rule — it's three, and they demand different behavior. Static rewards banking profit with pure cushion. Trailing punishes giving it back. Intraday trailing punishes even *unrealized* gains that round-trip. Same 10% on the tin, three different games.

Before you take a single trade on a funded account, answer two questions: which model is this, and where — in real dollars, right now — is my floor? Traders who can answer those instantly rarely breach drawdown. Traders who can't are the reason the failure statistics look the way they do. Know your line, and the rule that fails most funded traders becomes the one you simply never touch.
