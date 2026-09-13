-- Product Simplification Sprint 1 — Entry <-> Team relevance
--
-- Canonical basis: SCHEMA_IMPACT_REVIEW.md §5.2 (required for V0 by explicit
-- product-owner decision), 06_DATA_MODEL_AND_MIGRATION_SPEC §9 (entries stays
-- the single coordination primitive), D-204 (no Ticket/Task/Message entity).
--
-- WHAT THIS IS: relevance/mention metadata only. A row means exactly
-- "show this Entry with elevated priority in this person's Panelim".
--
-- WHAT THIS IS NOT, deliberately (SCHEMA_IMPACT_REVIEW §5.2 boundary):
--   * not a read receipt      -> no read_at / seen_at column
--   * not a visibility gate   -> never consulted by entries' own RLS;
--                                an Entry with relevance rows stays fully
--                                company-visible to every internal user
--   * not a notification queue-> no delivery state, no e-mail side effect
--   * not a priority field    -> no severity/rank column
--
-- RESPONSIBILITY vs RELEVANCE (sprint instruction §9): entries.assignee_id
-- continues to mean "this action is YOURS". This table means "you should
-- especially NOTICE this". They are independent: a relevance row creates no
-- action, and an assignment creates no relevance row.
--
-- Additive only. No existing row, column, policy or index is touched.

create table if not exists public.entry_relevance (
  entry_id   bigint      not null references public.entries(id) on delete cascade,
  team_id    bigint      not null references public.team(id)    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, team_id)
);

-- Panelim asks "which Entries are relevant to ME", i.e. filters on team_id.
-- The composite PK leads with entry_id, so it cannot serve that query.
create index if not exists entry_relevance_team_idx
  on public.entry_relevance(team_id);

alter table public.entry_relevance enable row level security;

-- Policy shape is copied verbatim from the sibling coordination tables
-- (s07_work_parties_* / s07_entries_*): internal users read and write,
-- only admin deletes standalone rows. Deleting the parent Entry cascades.
drop policy if exists ps1_entry_relevance_read   on public.entry_relevance;
drop policy if exists ps1_entry_relevance_write  on public.entry_relevance;
drop policy if exists ps1_entry_relevance_remove on public.entry_relevance;

create policy ps1_entry_relevance_read on public.entry_relevance
  for select to authenticated using (is_internal());

create policy ps1_entry_relevance_write on public.entry_relevance
  for insert to authenticated with check (is_internal());

-- No UPDATE policy: a relevance row has no mutable field. Correcting a
-- mistake means removing the row and adding the right one.
--
-- DELETE is admin-only, matching the sibling tables' s07_*_remove shape
-- exactly (SCHEMA_IMPACT_REVIEW §5.2). Sprint 1's UI never deletes a
-- relevance row: tags are set once, at Entry creation, and disappear with
-- the parent Entry via ON DELETE CASCADE. Least privilege until an edit
-- surface actually exists.
create policy ps1_entry_relevance_remove on public.entry_relevance
  for delete to authenticated using (is_admin());

comment on table public.entry_relevance is
  'Relevance/mention metadata for entries. Never a visibility gate: entries stay company-visible regardless. Distinct from entries.assignee_id, which is action responsibility.';
