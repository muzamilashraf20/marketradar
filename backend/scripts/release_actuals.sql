-- release_actuals — banked actuals for proprietary releases no free API carries.
--
-- Run this ONCE in the Supabase SQL editor (project bmauebaqoucjpiapnora).
-- Until it exists the backend logs one warning, disables the searches, and the calendar brief
-- falls back to the FRED path exactly as it did before this feature — nothing breaks.
--
-- One row per RELEASE, keyed by series + the period it describes. The row is created when the
-- event first appears on the calendar (carrying the forecast, which only the FF feed has and only
-- for the current week) and the actual is filled in afterwards by the sweeper.

create table if not exists public.release_actuals (
  release_key      text primary key,          -- "ADP:2026-07"  (series_id + reference_period)
  series_id        text        not null,      -- ADP | ISM_MFG | ISM_SVC
  reference_period text        not null,      -- "2026-07" — the month the figure DESCRIBES
  scheduled_at     timestamptz not null,      -- calendar release time; the write gate anchors to this
  next_release_at  timestamptz not null,      -- when the next print is due; drives the read-side gate
  forecast         text,                      -- from the ForexFactory feed, at row-creation time
  previous         text,
  actual           text,                      -- from the search, only once the gate passes
  surprise         text,                      -- beat | miss | inline | null
  source_url       text,
  release_date     date,                      -- what the model said; the gate validates it
  status           text        not null default 'pending',   -- pending | found | not_available
  attempts         int         not null default 0,
  reject_reason    text,                      -- why the gate refused; makes a silent gate visible
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- The sweeper's hot query: pending rows under the attempt cap.
create index if not exists release_actuals_pending_idx
  on public.release_actuals (status, attempts);

-- The brief's hot query: newest found row per series.
create index if not exists release_actuals_lookup_idx
  on public.release_actuals (status, series_id, scheduled_at desc);

create or replace function public.release_actuals_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists release_actuals_touch_trg on public.release_actuals;
create trigger release_actuals_touch_trg
  before update on public.release_actuals
  for each row execute function public.release_actuals_touch();

-- Server-side only: the backend uses the service key, and nothing in the frontend reads this.
alter table public.release_actuals enable row level security;

-- ── Useful checks once it is live ────────────────────────────────────────────
-- What has been banked, and what got refused:
--   select release_key, status, attempts, forecast, actual, surprise, release_date, reject_reason
--   from release_actuals order by scheduled_at desc limit 20;
--
-- Force a re-search of one release (e.g. after widening the gate):
--   update release_actuals set status='pending', attempts=0, reject_reason=null
--   where release_key = 'ADP:2026-07';
