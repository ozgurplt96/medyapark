-- =====================================================================
-- Sprint 03 — Work + Entry Core
-- ---------------------------------------------------------------------
-- Canonical basis:
--   06_DATA_MODEL_AND_MIGRATION_SPEC_v1.0  §7 (jobs as Work), §8
--   (work_parties), §9 (entries), §14/§15 (embedded contract/accounting),
--   §19 (RLS), §22 M3
--   09_V0_SPRINT_PLAN_v1.0                 Sprint 03
--   05_DECISION_LOG_v2.1                   D-204, D-206..D-209, D-224,
--                                          D-227, D-228, D-229
--
-- No `work_items` table (D-224). Physical `jobs` IS the canonical Work
-- backing and keeps its name (D-227). No tickets/tasks/activities/
-- comments tables (D-204/D-228) — Entry covers all four.
--
-- ADDITIVE ONLY (06 §1.1). Legacy jobs.mecra_id / supplier_id / note are
-- preserved untouched as compatibility fields (08 §7).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. jobs — Work lifecycle, contract and accounting        (06 §7.2)
-- ---------------------------------------------------------------------
alter table public.jobs add column if not exists lifecycle_status        text not null default 'acik';
alter table public.jobs add column if not exists closed_reason           text;
alter table public.jobs add column if not exists primary_contact_id      bigint;
alter table public.jobs add column if not exists contract_status         text not null default 'missing';
alter table public.jobs add column if not exists contract_url            text;
alter table public.jobs add column if not exists contract_signed_at      date;
alter table public.jobs add column if not exists contract_start_date     date;
alter table public.jobs add column if not exists contract_end_date       date;
alter table public.jobs add column if not exists contract_note           text;
alter table public.jobs add column if not exists accounting_status       text not null default 'yok';
alter table public.jobs add column if not exists accounting_amount       numeric(14,2);
alter table public.jobs add column if not exists accounting_note         text;
alter table public.jobs add column if not exists accounting_sent_at      timestamptz;
alter table public.jobs add column if not exists accounting_processed_at timestamptz;

comment on column public.jobs.status is
  'Canonical Work PHASE (06 s7.1): temas_takip | teklif | baski | montaj | yayinda_aktif. Not a state machine - it may be skipped or moved backwards (BR-W02), and it never overrides a subdomain status (BR-W03).';
comment on column public.jobs.lifecycle_status is
  'Work lifecycle, independent of phase (D-207): acik | bekliyor | kapandi.';
comment on column public.jobs.closed_reason is
  'Only meaningful when lifecycle_status = kapandi: tamamlandi | kaybedildi | iptal.';
comment on column public.jobs.assignee_id is
  'Optional Work owner (D-209). NOT a replacement for per-action assignment, which lives on entries.assignee_id.';
comment on column public.jobs.accounting_status is
  'Handoff state only (06 s15). Work kapandi/tamamlandi does NOT imply accounting processed (BR-W04).';

do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_primary_contact_id_fkey') then
    alter table public.jobs add constraint jobs_primary_contact_id_fkey
      foreign key (primary_contact_id) references public.contacts(id) on delete set null;
  end if;

  -- The baseline already ships a jobs_status_check that allows ONLY the
  -- legacy values (tasarim, baski, montaj, yayin, arsiv). It must be
  -- REPLACED, not skipped: leaving it in place would reject every
  -- canonical phase and make the mapping below fail outright.
  --
  -- The replacement is a WIDENING (canonical set PLUS legacy), never a
  -- narrowing, so it cannot reject an existing row. Legacy values stay
  -- permitted because seeds/20_company_data.sql replays a dump that still
  -- contains them; tightened to canonical-only after the pilot.
  alter table public.jobs drop constraint if exists jobs_status_check;
  alter table public.jobs add constraint jobs_status_check
    check (status in ('temas_takip','teklif','baski','montaj','yayinda_aktif',
                      'tasarim','yayin','arsiv'));

  if not exists (select 1 from pg_constraint where conname = 'jobs_lifecycle_status_check') then
    alter table public.jobs add constraint jobs_lifecycle_status_check
      check (lifecycle_status in ('acik','bekliyor','kapandi'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'jobs_closed_reason_check') then
    alter table public.jobs add constraint jobs_closed_reason_check
      check (closed_reason is null or closed_reason in ('tamamlandi','kaybedildi','iptal'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'jobs_contract_status_check') then
    alter table public.jobs add constraint jobs_contract_status_check
      check (contract_status in ('missing','pending','signed'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'jobs_accounting_status_check') then
    alter table public.jobs add constraint jobs_accounting_status_check
      check (accounting_status in ('yok','hazir','gonderildi','islendi'));
  end if;
end
$mig$;


-- ---------------------------------------------------------------------
-- 2. work_parties — Work-level Organization roles            (06 §8)
-- ---------------------------------------------------------------------
create table if not exists public.work_parties (
  id          bigint generated by default as identity primary key,
  job_id      bigint      not null references public.jobs(id)      on delete cascade,
  customer_id bigint               references public.customers(id) on delete set null,
  role        text        not null,
  note        text,
  created_at  timestamptz not null default now()
);

comment on table public.work_parties is
  'Party roles for a specific Work. Authoritative for that Work (BR-ORG01); the standing customers.relationship_roles list does not override it.';

do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'work_parties_role_check') then
    alter table public.work_parties add constraint work_parties_role_check
      check (role in ('account','advertiser','agency','bill_to','supplier','operator','other'));
  end if;
end
$mig$;

create index if not exists work_parties_job_id_idx      on public.work_parties (job_id);
create index if not exists work_parties_customer_id_idx on public.work_parties (customer_id);
create unique index if not exists work_parties_unique_role
  on public.work_parties (job_id, customer_id, role) where customer_id is not null;


-- ---------------------------------------------------------------------
-- 3. entries — the single coordination primitive             (06 §9)
-- ---------------------------------------------------------------------
-- action_status IS NULL  -> ordinary Entry (update / note / comment)
-- action_status NOT NULL -> actionable Entry (what a "task" would be)
-- source = 'system'      -> system-generated event (BR-E03)
create table if not exists public.entries (
  id                 bigint      generated by default as identity primary key,
  job_id             bigint      references public.jobs(id)      on delete set null,
  customer_id        bigint      references public.customers(id) on delete set null,
  contact_id         bigint      references public.contacts(id)  on delete set null,
  body               text        not null,
  action_status      text,
  assignee_id        bigint      references public.team(id)      on delete set null,
  due_at             timestamptz,
  completed_at       timestamptz,
  source             text        not null default 'manual',
  source_ref         text,
  attachments        jsonb       not null default '[]'::jsonb,
  occurred_at        timestamptz not null default now(),
  created_by_team_id bigint      references public.team(id)      on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz
);

comment on table public.entries is
  'The only coordination primitive (D-204). Task = actionable Entry, comment = ordinary Entry, activity = meaningful Entry, ticket/inbox = a view over Entries. Business timeline only - technical CRUD audit stays in activity_log (BR-AUD01).';
comment on column public.entries.action_status is
  'NULL = ordinary Entry. open | done | cancelled = actionable Entry (BR-E02).';
comment on column public.entries.source is
  'manual | system | email | whatsapp | web. Seam for future external ingestion (01 §16); V0 writes manual and system only.';

do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'entries_body_not_blank') then
    alter table public.entries add constraint entries_body_not_blank
      check (length(trim(body)) > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'entries_action_status_check') then
    alter table public.entries add constraint entries_action_status_check
      check (action_status is null or action_status in ('open','done','cancelled'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'entries_attachments_is_array') then
    alter table public.entries add constraint entries_attachments_is_array
      check (jsonb_typeof(attachments) = 'array');
  end if;
end
$mig$;

create index if not exists entries_job_id_idx      on public.entries (job_id);
create index if not exists entries_customer_id_idx on public.entries (customer_id);
create index if not exists entries_occurred_at_idx on public.entries (occurred_at desc);
-- Drives "Bana Düşenler" / "Bekleyenler" without scanning the whole table.
create index if not exists entries_open_actions_idx
  on public.entries (assignee_id, due_at) where action_status = 'open';


-- ---------------------------------------------------------------------
-- 4. work_parties backfill  — BEFORE the status mapping      (06 §8)
-- ---------------------------------------------------------------------
-- Order matters. jobs.status = 'tasarim' marks a legacy row that 06 §7.1
-- says a human must review, so its customer link is NOT yet trustworthy
-- evidence of a commercial relationship. Backfilling first, while that
-- marker still exists, lets us exclude exactly those rows and avoids
-- inventing an 'account' party for an unreviewed record (BR-ID01).
insert into public.work_parties (job_id, customer_id, role)
select j.id, j.customer_id, 'account'
from public.jobs j
where j.customer_id is not null
  and j.status <> 'tasarim'
on conflict do nothing;


-- ---------------------------------------------------------------------
-- 5. Legacy phase mapping                                  (06 §7.1)
-- ---------------------------------------------------------------------
--   baski   -> baski            (unchanged)
--   montaj  -> montaj           (unchanged)
--   yayin   -> yayinda_aktif
--   arsiv   -> yayinda_aktif + lifecycle kapandi / tamamlandi
--   tasarim -> reviewed case; see below
update public.jobs set status = 'yayinda_aktif' where status = 'yayin';

update public.jobs
   set status           = 'yayinda_aktif',
       lifecycle_status = 'kapandi',
       closed_reason    = coalesce(closed_reason, 'tamamlandi')
 where status = 'arsiv';

-- 'tasarim' — human review completed 7 Sep 2026.
-- The only such row locally is jobs.id=4 "Tüyap Afiş Planlaması", linked
-- to an external_directory_only Organization with no bookings. Classified
-- by the user as legacy dev/test data: map to temas_takip / acik, preserve
-- the row, do NOT infer a real customer relationship from it, and flag it
-- for Sprint 07 pilot-data reconciliation.
update public.jobs
   set status           = 'temas_takip',
       lifecycle_status = coalesce(nullif(lifecycle_status,''), 'acik')
 where status = 'tasarim';

-- New Work now starts at the canonical first phase instead of 'tasarim'.
alter table public.jobs alter column status set default 'temas_takip';


-- ---------------------------------------------------------------------
-- 6. RLS — Work children are internal-only     (06 §19, S01 pattern)
-- ---------------------------------------------------------------------
alter table public.work_parties enable row level security;
alter table public.entries      enable row level security;

drop policy if exists work_parties_internal on public.work_parties;
create policy work_parties_internal on public.work_parties
  for all to authenticated
  using (public.is_internal()) with check (public.is_internal());

drop policy if exists entries_internal on public.entries;
create policy entries_internal on public.entries
  for all to authenticated
  using (public.is_internal()) with check (public.is_internal());

-- No anon policy on either table: Work coordination is never public.
