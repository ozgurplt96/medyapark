-- =====================================================================
-- Sprint 02 — Organizations & Contacts Foundation
-- ---------------------------------------------------------------------
-- Canonical basis:
--   06_DATA_MODEL_AND_MIGRATION_SPEC_v1.0  §5 (customers as Organization
--   backing), §6 (contacts), §19 (RLS), §22 M2
--   09_V0_SPRINT_PLAN_v1.0                 Sprint 02
--   05_DECISION_LOG_v2.1                   D-212, D-227, D-228
--
-- No `organizations` table is created. Physical `customers` IS the
-- canonical Organization backing (D-212 / D-227). All 531 existing rows
-- are preserved; nothing is renamed, cleared or merged.
--
-- ADDITIVE ONLY (06 §1.1). Legacy `customers.ilgili_kisi` is preserved
-- untouched — see the blocker resolution below.
--
-- PRODUCTION NOTE (06 §1.5): local consolidated history, never db push-ed.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. CANONICAL_BLOCKER_RESOLUTION_S02_001   (user decision, 7 Sep 2026)
-- ---------------------------------------------------------------------
-- Canonical (03 §5, 06 §6, 09 Sprint 02) assumes `customers.ilgili_kisi`
-- is a flattened Contact source and asks for a "legacy contact candidate
-- backfill" from it.
--
-- Local preflight over all 531 rows disproves that premise. The column is
-- 100% populated but carries only THREE distinct Organization Memory
-- provenance labels, and zero person names:
--
--     OSB / dış dizin kaydı        435 rows   (0 of them have vergi_no)
--     Geçmiş ilişki doğrulanmış     83 rows   (42 have vergi_no)
--     Geçmişte gözlemlenmiş         13 rows
--
-- A literal backfill would fabricate 531 Contacts named
-- "OSB / dış dizin kaydı", violating BR-ID01, BR-HI01 and the Sprint 02
-- gate "no duplicate destructive backfill".
--
-- RESOLUTION: zero Contacts are backfilled from this column. The three
-- values move to a new, explicitly-named `relationship_evidence` column.
-- They are NOT interpreted as relationship_roles, entity_kind or
-- source_type. The legacy column itself stays physically untouched as raw
-- evidence. Full text:
--   .medyapark-context/decisions/CANONICAL_BLOCKER_RESOLUTION_S02_001.md


-- ---------------------------------------------------------------------
-- 1. customers — canonical Organization metadata   (06 §5.2)
-- ---------------------------------------------------------------------
alter table public.customers add column if not exists entity_kind          text;
alter table public.customers add column if not exists relationship_roles   jsonb   not null default '[]'::jsonb;
alter table public.customers add column if not exists active               boolean not null default true;
alter table public.customers add column if not exists source_type          text;
alter table public.customers add column if not exists source_ref           text;
-- Resolution S02_001 — not part of the frozen 06 §5.2 field list; added so
-- the provenance signal survives without being mislabelled as a Contact.
alter table public.customers add column if not exists relationship_evidence text;

comment on column public.customers.entity_kind is
  'legal_entity | brand | branch | venue | operator | other. NULL = not yet classified. Never inferred automatically (BR-ID04).';
comment on column public.customers.relationship_roles is
  'Standing, non-exclusive relationship roles (06 s5.2). Descriptive metadata, NOT the Work-level party role, which lives in work_parties (BR-ORG01).';
comment on column public.customers.active is
  'Soft archive seam. Organization hard-delete is not the default UI path (06 s5.3).';
comment on column public.customers.source_type is
  'Provenance of the row itself (direct_import / org_memory / manual / archive). Intentionally left NULL by Sprint 02 per resolution S02_001.';
comment on column public.customers.relationship_evidence is
  'What kind of evidence links Medyapark to this Organization: external_directory_only | confirmed_historical | observed_historical. Migrated from the legacy ilgili_kisi provenance labels (resolution S02_001). NOT a commercial role and NOT a Contact.';

do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_entity_kind_check') then
    alter table public.customers add constraint customers_entity_kind_check
      check (entity_kind is null or entity_kind in
             ('legal_entity','brand','branch','venue','operator','other'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'customers_relationship_evidence_check') then
    alter table public.customers add constraint customers_relationship_evidence_check
      check (relationship_evidence is null or relationship_evidence in
             ('external_directory_only','confirmed_historical','observed_historical'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'customers_relationship_roles_is_array') then
    alter table public.customers add constraint customers_relationship_roles_is_array
      check (jsonb_typeof(relationship_roles) = 'array');
  end if;
end
$mig$;


-- ---------------------------------------------------------------------
-- 2. Provenance migration — exact-match only   (resolution S02_001 §2.2)
-- ---------------------------------------------------------------------
-- Only the three known labels are mapped. Anything else stays NULL rather
-- than being guessed at, and ilgili_kisi is never modified.
update public.customers
   set relationship_evidence = case trim(ilgili_kisi)
         when 'OSB / dış dizin kaydı'      then 'external_directory_only'
         when 'Geçmiş ilişki doğrulanmış'  then 'confirmed_historical'
         when 'Geçmişte gözlemlenmiş'      then 'observed_historical'
       end
 where relationship_evidence is null
   and trim(coalesce(ilgili_kisi,'')) in
       ('OSB / dış dizin kaydı','Geçmiş ilişki doğrulanmış','Geçmişte gözlemlenmiş');


-- ---------------------------------------------------------------------
-- 3. contacts — real business people                        (06 §6)
-- ---------------------------------------------------------------------
-- Deliberately starts EMPTY. No backfill from ilgili_kisi (resolution
-- S02_001). Real Contacts are reconciled later from verified sources.
create table if not exists public.contacts (
  id           bigint generated by default as identity primary key,
  customer_id  bigint      references public.customers(id) on delete set null,
  name         text        not null,
  title        text,
  department   text,
  phone        text,
  email        text,
  notes        text,
  is_primary   boolean     not null default false,
  active       boolean     not null default true,
  source_type  text,
  source_ref   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

comment on table public.contacts is
  'Real business people (03 s5). A Contact is not an Organization and not an internal app user. Started empty in Sprint 02 per resolution S02_001.';
comment on column public.contacts.customer_id is
  'Owning Organization (physical customers). Nullable + ON DELETE SET NULL so archiving an Organization never destroys contact history.';

do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_name_not_blank') then
    alter table public.contacts add constraint contacts_name_not_blank
      check (length(trim(name)) > 0);
  end if;
end
$mig$;

create index if not exists contacts_customer_id_idx on public.contacts (customer_id);
create index if not exists contacts_active_idx      on public.contacts (active);

-- At most one primary Contact per Organization (07 §9.3 "primary badge").
create unique index if not exists contacts_one_primary_per_customer
  on public.contacts (customer_id) where is_primary and customer_id is not null;


-- ---------------------------------------------------------------------
-- 4. RLS — contacts is internal-only          (06 §19, Sprint 01 pattern)
-- ---------------------------------------------------------------------
alter table public.contacts enable row level security;

drop policy if exists contacts_internal on public.contacts;
create policy contacts_internal on public.contacts
  for all to authenticated
  using (public.is_internal()) with check (public.is_internal());

-- No anon policy of any kind: contacts are never public.
