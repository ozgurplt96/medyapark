-- =====================================================================
-- Sprint 02 — provenance backfill for LOCAL resets. Committed to Git.
-- ---------------------------------------------------------------------
-- WHY THIS FILE EXISTS
--   `supabase db reset` runs MIGRATIONS FIRST (against an empty database)
--   and loads seeds afterwards. The `update customers set
--   relationship_evidence = ...` inside
--   20260907160000_s02_organizations_and_contacts.sql is therefore a
--   no-op locally: at that moment `customers` has 0 rows. The company
--   data only arrives later, in seeds/20_company_data.sql.
--
--   In PRODUCTION the situation is reversed and correct: the forward
--   migration is applied to a table that already holds the 531 rows, so
--   the UPDATE inside the migration is the real one. This seed exists
--   purely so a LOCAL reset reproduces the same end state.
--
--   Runs at 40, i.e. after seeds/20_company_data.sql.
--
-- Mapping is fixed by CANONICAL_BLOCKER_RESOLUTION_S02_001. Exact-match
-- only: any other value stays NULL rather than being guessed at, and the
-- legacy `ilgili_kisi` column is never modified.
--
-- Idempotent.
-- =====================================================================

update public.customers
   set relationship_evidence = case trim(ilgili_kisi)
         when 'OSB / dış dizin kaydı'      then 'external_directory_only'
         when 'Geçmiş ilişki doğrulanmış'  then 'confirmed_historical'
         when 'Geçmişte gözlemlenmiş'      then 'observed_historical'
       end
 where relationship_evidence is null
   and trim(coalesce(ilgili_kisi,'')) in
       ('OSB / dış dizin kaydı','Geçmiş ilişki doğrulanmış','Geçmişte gözlemlenmiş');

do $seed$
declare
  v_mapped   bigint;
  v_unmapped bigint;
begin
  select count(*) filter (where relationship_evidence is not null),
         count(*) filter (where relationship_evidence is null)
    into v_mapped, v_unmapped
  from public.customers;

  raise notice 'S02 provenance backfill: % mapped, % left null', v_mapped, v_unmapped;
end
$seed$;
