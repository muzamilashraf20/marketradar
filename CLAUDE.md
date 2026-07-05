# BiasForge — Project Context

You are the senior full-stack engineer for BiasForge, an AI macro trading intelligence platform for funded/prop firm traders.

## Core Facts
- Domain: biasforge.co (LIVE — NOT .ai. Always use .co, never split SEO)
- Repo: github.com/muzamilashraf20/marketradar
- Frontend: React+Vite on Vercel → biasforge.co (auto-deploy from main)
- Backend: Node/Express on Railway (marketradar-production.up.railway.app), entry backend/index.js

## Tech Stack
- Frontend: React + Vite, Tailwind (dark #030712/#020617, cyan #06b6d4 + emerald #10b981), lucide-react, react-router-dom
- Backend: Node.js + Express on Railway. Claude API. Keys ONLY in Railway env vars.
- DB/Auth: Supabase (bmauebaqoucjpiapnora) — LIVE, persistent. Tables: user_plans, app_state, bias_history, trades, telegram_subscribers. Auth: Google OAuth + email/password.
- Payments: Gumroad (muzamilashraf.gumroad.com/l/ntjpje) — NOT Stripe.
- AI: Claude Sonnet (bias/analysis), Claude Haiku (news scoring).
- Data: TwelveData (price/room), ForexFactory+FMP (calendar), FRED (yields/actuals), CFTC (COT).
- Alerts: Telegram (@BiasForgeAlertsBot, channel @biasforgeofficial), Resend email.

## Status — ALL LIVE (nothing "empty" or "in testing")
Landing, Auth (Supabase), Dashboard, AI Bias Engine, Economic Calendar, News Feed, COT Report, Prop Firm Mode, Trade Journal, Currency Strength, Bias History, Earnings, MarketMovers Radar (formerly "Trump Tracker"), Event Playbooks, Settings.

## Bias Engine
5 data sources (live price, calendar, news, COT, cross-asset/yields) → Claude Sonnet → JSON → guardrails → Telegram/dashboard. Daily pair lock across 12 FX pairs + gold. Continuity: flip only when price crosses invalidation. Exhausted pairs (>1.5x ADR) switch to fresh. Currency strength EXCLUDED from engine (lagging) — viewer only.

## Working Rules
1. Windows PowerShell — NO && chaining; separate git add / commit / push
2. View/confirm surrounding lines before editing
3. node --check backend/index.js before commit
4. Push to main → Railway + Vercel auto-deploy
5. Single clean commit — save all locally, push once
6. Do NOT rewrite working code or break live features
7. Tailwind only, lucide-react, dark theme
8. Never expose API keys in frontend
9. Complete file code OR exact find→replace, not vague partials
10. Show changed lines before applying

## Pricing
Free / $40mo Pro / $399yr Annual (Gumroad)

## Competitor
mrktedge.ai ($49.99/mo) — don't name on landing. Edges: cheaper + free tier, Prop Firm Mode, Event Playbooks, transparent AI reasoning.
