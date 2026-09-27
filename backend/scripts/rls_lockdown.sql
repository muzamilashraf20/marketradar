-- RLS lockdown — close the anon-key read (and write) exposure found 2026-09-27.
--
-- Run in the Supabase SQL editor (project bmauebaqoucjpiapnora), in three steps:
--   STEP 1  pre-flight reads   — run, eyeball, nothing changes
--   STEP 2  the lockdown       — one transaction; any error rolls the whole thing back
--   STEP 3  verification reads — then run backend/scripts/rlsProbe.mjs again, expect PASS
--
-- The anon key ships in the client bundle, so with RLS off every one of these tables was
-- readable by anyone — and, under Supabase's default grants, very likely WRITABLE too
-- (e.g. `update user_plans set tier='pro'`). Enabling RLS with no policy closes both.
--
-- Who still has access afterwards:
--   backend (SUPABASE_SERVICE_KEY, role service_role) — BYPASSRLS, unaffected: engine, Telegram,
--     Resend, Gumroad webhook, /api/user/plan, journal, social queue all keep working.
--   frontend AuthContext.jsx — the ONLY client-side table read. It selects the logged-in user's
--     own user_plans row, which the one policy below allows. Nothing else in frontend/src calls
--     supabase.from(), .rpc() or .channel().
--   anon — nothing.


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 1 — PRE-FLIGHT (read-only)
-- ═════════════════════════════════════════════════════════════════════════════

-- 1a. Current RLS state of every public table. rls_on = false is the exposure.
select c.relname as table_name, c.relrowsecurity as rls_on, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by c.relname;

-- 1b. Policies that already exist. Anything here on the ten tables below is DROPPED by step 2
--     (a leftover "Enable read access for all users" policy would keep the table public even
--     with RLS on). If one of them is something you want kept, stop and say so first.
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public'
order by tablename, policyname;

-- 1c. Triggers on auth.users. If a signup trigger writes into user_plans and its function is
--     NOT security definer, RLS would make signups fail. Expected: no rows (the backend creates
--     the plan row itself in /api/user/plan). If a row shows security_definer = false, stop.
select t.tgname, p.proname, p.prosecdef as security_definer
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;

-- 1d. user_plans.user_id type (step 2 handles uuid or text; this is just to know).
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'user_plans' and column_name = 'user_id';


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 2 — LOCKDOWN (one transaction)
-- ═════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  -- Every table the code touches. All are backend-only except user_plans.
  -- trades / telegram_subscribers / email_subscribers / social_queue / release_actuals returned
  -- 0 rows to anon — that may be RLS or may just be emptiness, so they are locked here either way.
  tbls text[] := array[
    'user_plans', 'app_state', 'bias_state_v2', 'bias_history', 'bias_history_v2',
    'trades', 'telegram_subscribers', 'email_subscribers', 'social_queue', 'release_actuals'
  ];
  t text;
  pol record;
  uid_type text;
begin
  foreach t in array tbls loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'skip % (table does not exist)', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- Drop every existing policy so the only access is what this script defines.
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
      raise notice 'dropped policy % on %', pol.policyname, t;
    end loop;

    -- Belt and braces: even if RLS is switched off later, anon has no table privileges at all,
    -- and authenticated has none except SELECT on user_plans. service_role keeps its own grants.
    execute format('revoke all on table public.%I from anon', t);
    if t = 'user_plans' then
      execute format('revoke insert, update, delete, truncate, references, trigger on table public.%I from authenticated', t);
      execute format('grant select on table public.%I to authenticated', t);
    else
      execute format('revoke all on table public.%I from authenticated', t);
    end if;

    raise notice 'locked %', t;
  end loop;

  -- The one policy: a logged-in user reads their own plan row. No insert/update/delete policy
  -- for anyone — the Gumroad webhook and /api/user/plan write with the service key.
  -- (select auth.uid()) is evaluated once per query, not per row (Supabase advisor 0003).
  select data_type into uid_type from information_schema.columns
  where table_schema = 'public' and table_name = 'user_plans' and column_name = 'user_id';

  if uid_type = 'uuid' then
    create policy user_plans_select_own on public.user_plans
      for select to authenticated
      using (user_id = (select auth.uid()));
  else
    create policy user_plans_select_own on public.user_plans
      for select to authenticated
      using (user_id = (select auth.uid())::text);
  end if;
end $$;

commit;


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 3 — VERIFY (read-only)
-- ═════════════════════════════════════════════════════════════════════════════

-- 3a. Expect rls_on = true for all ten.
select c.relname as table_name, c.relrowsecurity as rls_on
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('user_plans', 'app_state', 'bias_state_v2', 'bias_history', 'bias_history_v2',
                    'trades', 'telegram_subscribers', 'email_subscribers', 'social_queue', 'release_actuals')
order by c.relname;

-- 3b. Expect exactly one row: user_plans / user_plans_select_own / SELECT / {authenticated}.
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('user_plans', 'app_state', 'bias_state_v2', 'bias_history', 'bias_history_v2',
                    'trades', 'telegram_subscribers', 'email_subscribers', 'social_queue', 'release_actuals');

-- 3c. Expect exactly one row: authenticated / user_plans / SELECT. Nothing for anon.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
  and table_name in ('user_plans', 'app_state', 'bias_state_v2', 'bias_history', 'bias_history_v2',
                     'trades', 'telegram_subscribers', 'email_subscribers', 'social_queue', 'release_actuals')
order by grantee, table_name, privilege_type;

-- 3d. Any OTHER public table still without RLS (tables the code doesn't reference — review each).
select c.relname as table_without_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
order by c.relname;


-- ── Emergency rollback (only if logged-in users suddenly can't load their plan) ──
-- The frontend falls back to the backend /api/user/plan, so this should never be needed.
--   drop policy if exists user_plans_select_own on public.user_plans;
--   alter table public.user_plans disable row level security;
-- Do NOT re-grant anon anything.
