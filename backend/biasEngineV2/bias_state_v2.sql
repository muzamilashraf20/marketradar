-- BiasForge v2 — per-pair bias state + history (SHADOW MODE)
-- Namespaced *_v2 to stay fully isolated from the LIVE `bias_history` table
-- (which has a different schema and feeds /api/bias-history + /api/bias-performance).
-- Run this in the Supabase SQL editor (project bmauebaqoucjpiapnora).
--
-- One row per pair in bias_state_v2 = the CURRENT live bias (replaces the single global bias).
-- bias_history_v2 keeps every open/flip/close for the "Bias History" panel.

create table if not exists bias_state_v2 (
  pair                text primary key,             -- 'XAUUSD', 'EURUSD', ...
  direction           text not null default 'FLAT', -- 'BUY' | 'SELL' | 'FLAT'
  invalidation_level  numeric,                       -- ATR-based price level; bias dies if breached
  invalidation_text   text,
  thesis              text,
  entry_price         numeric,
  atr_at_entry        numeric,
  diff_at_entry       numeric,                        -- score(base) - score(quote) at open
  regime              text,                           -- 'event-heavy' | 'quiet'
  status              text default 'running',         -- 'running' | 'closed'
  closed_reason       text,
  mfe                 numeric default 0,              -- max favourable excursion (pips)
  mae                 numeric default 0,              -- max adverse excursion (pips)
  confidence          integer,                        -- 40..92 signal strength (NOT a win rate)
  grade               text,                           -- A | A- | B | C | D
  entry_timing        text,                           -- FRESH | EXTENDED | LATE
  opened_at           timestamptz,
  updated_at          timestamptz default now()
);

-- MIGRATION (2026-08-17) — consecutive-run counter for the conviction floor. The floor no longer
-- closes a held bias on a single sub-floor tick; it needs two runs in a row (and only when price
-- is not already proving the bias right). Existing rows start at 0.
alter table bias_state_v2 add column if not exists low_conf_streak int not null default 0;

create table if not exists bias_history_v2 (
  id                  bigint generated always as identity primary key,
  pair                text not null,
  direction           text not null,
  invalidation_level  numeric,
  invalidation_text   text,
  thesis              text,
  entry_price         numeric,
  atr_at_entry        numeric,
  diff_at_entry       numeric,
  regime              text,
  status              text,
  closed_reason       text,
  confidence          integer,                        -- 40..92 signal strength (NOT a win rate)
  grade               text,                           -- A | A- | B | C | D
  entry_timing        text,                           -- FRESH | EXTENDED | LATE
  created_at          timestamptz default now()
);

create index if not exists bias_history_v2_pair_idx on bias_history_v2 (pair, created_at desc);

-- MIGRATION (2026-08-27) — outcome columns on bias_history_v2. Until now the history table recorded
-- only how a bias LOOKED at each transition (direction, thesis, grade, entry_price) and nothing about
-- how it actually PERFORMED. runEngine() computed an `outcome` object on every CLOSE/FLIP —
-- exit price, realized pips, MFE/MAE, hold time — and then console.logged it and threw it away.
-- bias_state_v2's row is overwritten on the next transition, so once a bias ended those numbers were
-- gone for good and the track record could not be reconstructed after the fact. These columns give the
-- engine somewhere to persist that outcome row.
alter table bias_history_v2 add column if not exists exit_price    numeric;
alter table bias_history_v2 add column if not exists realized_pips numeric;
alter table bias_history_v2 add column if not exists mfe           numeric;
alter table bias_history_v2 add column if not exists mae           numeric;
alter table bias_history_v2 add column if not exists held_hours    numeric;
alter table bias_history_v2 add column if not exists ended_by      text;
