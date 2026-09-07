-- =====================================================================
-- Sprint 03 — Work backfill for LOCAL resets. Committed to Git.
-- ---------------------------------------------------------------------
-- Same ordering asymmetry as seeds/40 (see that file): `supabase db reset`
-- applies MIGRATIONS to an empty database and loads seeds afterwards, so
-- the work_parties backfill and the legacy phase mapping inside
-- 20260907180000_s03_work_and_entries.sql are no-ops locally. The jobs
-- rows only arrive later, in seeds/20_company_data.sql, still carrying
-- their legacy status values.
--
-- In PRODUCTION the forward migration runs against populated tables and
-- is the real one. This seed exists so a LOCAL reset reaches the same
-- end state.
--
-- Runs at 50, i.e. after seeds/20_company_data.sql.
--
-- The two steps MUST stay in this order: the work_parties backfill relies
-- on 'tasarim' still being present to exclude unreviewed legacy rows.
--
-- Idempotent.
-- =====================================================================

-- 1. Account parties from the legacy jobs.customer_id link, excluding
--    unreviewed legacy rows (06 §7.1 / BR-ID01).
insert into public.work_parties (job_id, customer_id, role)
select j.id, j.customer_id, 'account'
from public.jobs j
where j.customer_id is not null
  and j.status <> 'tasarim'
on conflict do nothing;

-- 2. Legacy phase mapping (06 §7.1).
update public.jobs set status = 'yayinda_aktif' where status = 'yayin';

update public.jobs
   set status           = 'yayinda_aktif',
       lifecycle_status = 'kapandi',
       closed_reason    = coalesce(closed_reason, 'tamamlandi')
 where status = 'arsiv';

-- 'tasarim' -> reviewed 7 Sep 2026 as legacy dev/test data.
update public.jobs
   set status           = 'temas_takip',
       lifecycle_status = coalesce(nullif(lifecycle_status,''), 'acik')
 where status = 'tasarim';

do $seed$
declare
  v_jobs    bigint;
  v_legacy  bigint;
  v_parties bigint;
begin
  select count(*) into v_jobs from public.jobs;
  select count(*) into v_legacy from public.jobs
   where status in ('tasarim','yayin','arsiv');
  select count(*) into v_parties from public.work_parties;

  raise notice 'S03 work backfill: % jobs, % legacy statuses left, % work_parties',
    v_jobs, v_legacy, v_parties;
end
$seed$;
