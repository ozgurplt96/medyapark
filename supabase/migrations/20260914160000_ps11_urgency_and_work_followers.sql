-- Product Simplification Sprint 1.1 — Acil (urgency) + explicit Work following
--
-- Basis: PS1.1 brief §11 (Entry urgency), §15 (Work urgency), §16 (Work
-- follower relation), §31 (inspect first, smallest additive change), §32 (RLS).
--
-- Inspected before writing (PS1.1 §31): `information_schema.columns` carries
-- NO column matching urgent|acil|priority|oncelik|follow|takip|watch anywhere
-- in `public`, and zero tables matching follow|watch. None of the three
-- additions below duplicates an existing canonical field.
--
-- Additive only. No existing column, row, policy or index is modified.
-- `entries.assignee_id`, `entries.action_status` and `jobs.lifecycle_status`
-- are deliberately LEFT IN PLACE (PS1.1 §31) — the UX stops emphasising them,
-- the data model keeps them.

-- ---------------------------------------------------------------------
-- 1. Acil — ONE boolean, on purpose
-- ---------------------------------------------------------------------
-- Explicitly NOT a priority scale (PS1.1 §11, §15: no low/medium/high/
-- critical). A scale invites per-person interpretation and quickly stops
-- meaning anything; a single flag either is set or is not.
--
-- NOT NULL DEFAULT false means every existing row is immediately correct
-- without a backfill pass: nothing was urgent before, because the concept
-- did not exist.
alter table public.entries add column if not exists is_urgent boolean not null default false;
alter table public.jobs    add column if not exists is_urgent boolean not null default false;

comment on column public.entries.is_urgent is
  'Acil. A single boolean, never a priority scale. Feeds the Dikkat Gerekenler surface and the Acil filter.';
comment on column public.jobs.is_urgent is
  'Acil. A single boolean, never a priority scale. Badge on Pano/Liste plus the Acil filter.';

-- Partial indexes: the only question ever asked is "which ones ARE urgent",
-- and urgent rows are the small minority. Indexing the false rows would be
-- pure overhead.
create index if not exists entries_urgent_idx on public.entries(occurred_at desc) where is_urgent;
create index if not exists jobs_urgent_idx    on public.jobs(id)                  where is_urgent;

-- ---------------------------------------------------------------------
-- 2. Who am I? — resolve the caller's own team row
-- ---------------------------------------------------------------------
-- Needed so RLS can express "you may stop following on your own behalf"
-- without letting one person quietly unfollow someone else. Same shape as
-- the existing is_internal()/is_admin() helpers: STABLE, SECURITY DEFINER,
-- pinned search_path (so the function cannot be hijacked by a caller-set
-- search_path).
create or replace function public.current_team_id()
returns bigint
language sql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
  select t.id from public.team t
   where t.auth_user_id = auth.uid() and t.active
   limit 1;
$$;

revoke all on function public.current_team_id() from public, anon;
grant execute on function public.current_team_id() to authenticated;

comment on function public.current_team_id() is
  'The calling auth user''s active team row id, or NULL. Used by RLS to scope self-service actions such as unfollowing a Work.';

-- ---------------------------------------------------------------------
-- 3. work_followers — explicit, intentional Work following
-- ---------------------------------------------------------------------
-- Distinct from every existing mechanism (PS1.1 §16):
--   * jobs.assignee_id     - ONE optional owner (D-209). Many people may
--                            follow a Work; reusing that column would
--                            overwrite one person's ownership each time
--                            somebody else clicked Takibe Al.
--   * entry_relevance      - about a single Update, not a Work.
--   * created_by / history - accidents of who touched it, not intent.
--
-- What it is NOT, deliberately: no notification subscription, no watcher
-- settings, no digest preference, no private visibility. A row means only
-- "show this Work in my Takip Ettiğim İşler". Following NEVER affects who
-- can see a Work - `jobs` RLS does not consult this table.
create table if not exists public.work_followers (
  job_id     bigint      not null references public.jobs(id) on delete cascade,
  team_id    bigint      not null references public.team(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id, team_id)
);

-- The PK leads with job_id, so it cannot serve Panelim's actual question -
-- "which Works do I follow". Hence a team_id index.
create index if not exists work_followers_team_idx on public.work_followers(team_id);

alter table public.work_followers enable row level security;

drop policy if exists ps11_work_followers_read     on public.work_followers;
drop policy if exists ps11_work_followers_write    on public.work_followers;
drop policy if exists ps11_work_followers_unfollow on public.work_followers;
drop policy if exists ps11_work_followers_admin    on public.work_followers;

-- Read: company-wide, like every sibling coordination table. Seeing that a
-- colleague follows a Work is ordinary context, not sensitive.
create policy ps11_work_followers_read on public.work_followers
  for select to authenticated using (is_internal());

-- Write: any internal user may mark any internal colleague as interested.
-- PS1.1 §23 asks the New Work form for "Ilgili Workspace members", chosen
-- by whoever opens the Work - so this cannot be self-only.
--
-- This is NOT assigning work (§2.B): a follower row carries no due date,
-- no responsibility and no obligation. It mirrors entry_relevance exactly:
-- "this concerns you", never "this is your job". The asymmetry with DELETE
-- below is deliberate - being added costs you nothing, so anyone may add;
-- being removed hides a Work from your own list, so only you (or an admin)
-- may remove.
create policy ps11_work_followers_write on public.work_followers
  for insert to authenticated
  with check (is_internal() and exists (
    select 1 from public.team t where t.id = team_id and t.active));

-- No UPDATE policy: the row has no mutable field. Takibi Bırak is a delete.

-- Delete: your own row only - nobody else can quietly drop you, or be
-- dropped by you, from a Work they are following.
create policy ps11_work_followers_unfollow on public.work_followers
  for delete to authenticated
  using (is_internal() and team_id = current_team_id());

-- ...plus admin, for parity with every other s07_*_remove policy.
create policy ps11_work_followers_admin on public.work_followers
  for delete to authenticated using (is_admin());

comment on table public.work_followers is
  'Explicit, self-service Work following. Never a visibility gate: jobs RLS does not consult this table. Distinct from jobs.assignee_id (one owner) and entry_relevance (per-Update).';
