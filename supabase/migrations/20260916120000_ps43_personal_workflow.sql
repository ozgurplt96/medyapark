-- Product Simplification Sprint 4.3 — personal workflow & Update authorship
--
-- Two independent concerns, one migration:
--   A) Entry AUTHORSHIP rights  (§4, §5, §7)
--   B) PRIVATE personal calendar events (§17, §18)
--
-- No canonical semantics change. `entries` keeps one row per Update and one
-- id across an edit — this is NOT "edit = create replacement Entry" (§5).
-- Work phase values are NOT touched (§12 is display-only).

-- =====================================================================
-- A. Entry authorship
-- =====================================================================
--
-- BEFORE (measured this sprint):
--   entries         UPDATE -> is_internal()   ANY internal user could edit
--                                             ANY Entry, including another
--                                             person's and system-generated ones
--                   DELETE -> is_admin()      the AUTHOR could not remove
--                                             their own Update
--   entry_relevance DELETE -> is_admin()      `entry_save` deletes relevance
--                                             rows before re-inserting them on
--                                             edit; for a team_member that
--                                             DELETE silently affected 0 rows,
--                                             so editing tags could ADD a
--                                             person but never REMOVE one.
--                                             That last one is a latent bug the
--                                             §5 edit flow would have exposed.
--
-- AFTER: authorship is enforced server-side, not merely hidden in the UI
-- (08 §9 — UI hiding is not authorization).
--
-- Deliberately NOT author-only:
--   * admin keeps full capability (pre-existing, unchanged);
--   * an Entry's ASSIGNEE may still update it, because the legacy
--     "Tamamla" action (`entryDone` -> action_status='done') is performed by
--     the assignee, who is frequently not the author. Removing that would
--     break a working flow to satisfy a rule aimed at casual editing.
--
-- `source <> 'system'` is what protects machine-written history: `sysEntry()`
-- stamps `created_by_team_id` with whoever triggered it, so an author check
-- ALONE would have left system Entries editable by the person who caused them.

drop policy if exists "s07_entries_modify" on public.entries;
create policy "s43_entries_modify" on public.entries
  for update to authenticated
  using (
    public.is_admin()
    or (source <> 'system' and created_by_team_id = public.current_team_id())
    or assignee_id = public.current_team_id()
  )
  with check (
    public.is_admin()
    or (source <> 'system' and created_by_team_id = public.current_team_id())
    or assignee_id = public.current_team_id()
  );

drop policy if exists "s07_entries_remove" on public.entries;
create policy "s43_entries_remove" on public.entries
  for delete to authenticated
  using (
    public.is_admin()
    or (source <> 'system' and created_by_team_id = public.current_team_id())
  );

-- AUTHOR ATTRIBUTION on INSERT.
-- Found during S4.3 QA and verified by simulating a team_member session:
-- `s07_entries_write` was `with check (is_internal())`, so any internal user
-- could insert an Entry with ANOTHER person's `created_by_team_id`. That
-- quietly defeats the authorship rules above: the impersonated person would
-- inherit edit/delete rights over text they never wrote, and the real
-- creator would lose them.
--
-- Every app write path already stamps the caller (`sysEntry()` and
-- `entry_save` both use `ui._me.id`), so enforcing it breaks nothing. Admin
-- is exempt because backup RESTORE (`YEDEK_SIRA` includes `entries`,
-- admin-only) must replay the original authors.
--
-- NOT closed here, and documented as a blocker for the System Hareketleri
-- sprint: an internal user can still insert `source='system'` rows. That
-- cannot be prevented while `sysEntry()` runs client-side as the logged-in
-- user; it needs a SECURITY DEFINER write path.
drop policy if exists "s07_entries_write" on public.entries;
create policy "s43_entries_write" on public.entries
  for insert to authenticated
  with check (
    public.is_admin()
    or (public.is_internal() and created_by_team_id = public.current_team_id())
  );

-- Relevance rows follow the parent Entry's editability.
-- NOTE: `entry_relevance.entry_id` is already ON DELETE CASCADE, so removing
-- an Entry cannot leave orphan relevance rows (§7). This policy is about the
-- EDIT path (untag someone), not about cascade cleanup.
drop policy if exists "ps1_entry_relevance_remove" on public.entry_relevance;
create policy "s43_entry_relevance_remove" on public.entry_relevance
  for delete to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.entries e
      where e.id = entry_relevance.entry_id
        and e.source <> 'system'
        and e.created_by_team_id = public.current_team_id()
    )
  );

-- =====================================================================
-- B. personal_events — private personal calendar (§17, §18)
-- =====================================================================
--
-- These are PERSONAL PRODUCTIVITY items, not company business records.
-- "15:30 Dişçi" must never reach the Team feed, a Work timeline, Hafıza
-- activity or the shared İşler calendar.
--
-- WHY NOT an `entries` row with a private flag: `entries` is canonical
-- business memory and is Team-visible BY DESIGN (03 §3.4 — shared
-- visibility). Bolting a privacy flag onto it would mean every existing
-- entries reader (feed, Work timeline, org/person activity, calendar,
-- exports) becomes a potential leak the day someone forgets the filter.
-- A separate table makes the privacy boundary structural instead of
-- convention-based.
--
-- DATE/TIME SHAPE — deliberate departure from `entries.due_at`:
-- a dentist appointment at 15:30 is LOCAL WALL-CLOCK, not an instant.
-- Storing it as timestamptz would make it shift if the environment's
-- timezone ever differed. `date` + nullable `time` stores exactly what the
-- user typed, needs no conversion on read, and makes "is this today?" a
-- plain date comparison. This matches `work_operations.planned_date`
-- (date) rather than `entries.due_at` (timestamptz).

create table if not exists public.personal_events (
  id          bigint generated by default as identity primary key,
  team_id     bigint not null references public.team(id) on delete cascade,
  title       text   not null,
  event_date  date   not null,
  event_time  time   null,
  note        text   null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz null,
  constraint personal_events_title_not_blank check (length(btrim(title)) > 0)
);

comment on table public.personal_events is
  'Private per-user calendar items (S4.3 §17). NOT business memory: never '
  'surfaced in the Team feed, Work timeline, Hafiza activity or the shared '
  'Isler calendar. Visible only to the owning team member.';

create index if not exists personal_events_owner_date_idx
  on public.personal_events (team_id, event_date);

alter table public.personal_events enable row level security;

-- Privacy boundary (§18): owner-only, all four verbs.
-- Admin gets NO blanket visibility here. Elsewhere admin is broad because
-- those tables hold COMPANY records; these do not. An admin reading a
-- colleague's dentist appointment has no product justification, and
-- 03 §3.5 explicitly says not to add ACL reach without proven need.
create policy "s43_personal_events_read" on public.personal_events
  for select to authenticated
  using (team_id = public.current_team_id());

create policy "s43_personal_events_write" on public.personal_events
  for insert to authenticated
  with check (team_id = public.current_team_id());

create policy "s43_personal_events_modify" on public.personal_events
  for update to authenticated
  using (team_id = public.current_team_id())
  with check (team_id = public.current_team_id());

create policy "s43_personal_events_remove" on public.personal_events
  for delete to authenticated
  using (team_id = public.current_team_id());

-- ANON. Measured during S4.3 QA: Supabase's DEFAULT PRIVILEGES grant
-- `anon` full table privileges on every new public table (`entries` carries
-- the identical grant set). For company tables the repo convention is that
-- RLS - not grants - enforces access, and anon reads return [] because no
-- policy targets anon.
--
-- personal_events holds PRIVATE data, so it gets defence in depth: the anon
-- grant is revoked outright, making the boundary hold even if a permissive
-- policy were ever added by mistake. The app never reads this table as anon.
revoke all on public.personal_events from anon;
revoke all on sequence public.personal_events_id_seq from anon;

grant select, insert, update, delete on public.personal_events to authenticated;
grant usage, select on sequence public.personal_events_id_seq to authenticated;
