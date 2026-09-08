-- =====================================================================
-- Upstream reconciliation backfill for LOCAL resets. Committed to Git.
-- ---------------------------------------------------------------------
-- Same ordering asymmetry as seeds/40 and seeds/50: `supabase db reset`
-- applies MIGRATIONS to an empty database and loads seeds afterwards, so
-- the team/jobs backfills inside 20260908140000_s07r_upstream_compat.sql
-- are no-ops locally. In PRODUCTION the forward migration runs against
-- populated tables and is the real one.
--
-- Runs at 97: AFTER seeds/95_local_private_identity.sql, which is where
-- the real admin team row is created. At 60 that row did not exist yet.
-- Idempotent.
-- =====================================================================

-- Keep the LEGACY seviye column consistent with the canonical role, so
-- any upstream screen still reading it shows the truth. app_role remains
-- the only authority (D-203).
update public.team
   set seviye = case when app_role = 'admin' then 'yonetici' else 'uye' end
 where seviye is distinct from (case when app_role = 'admin' then 'yonetici' else 'uye' end);

-- Translate any upstream marketing sub-state into canonical phase +
-- lifecycle (see the migration header for the fixed mapping).
update public.jobs set status = 'teklif'
 where durum = 'teklif' and status = 'temas_takip';
update public.jobs set lifecycle_status = 'bekliyor'
 where durum = 'beklemede' and lifecycle_status = 'acik';
update public.jobs
   set lifecycle_status = 'kapandi',
       closed_reason    = coalesce(closed_reason, 'kaybedildi')
 where durum = 'kaybedildi' and lifecycle_status <> 'kapandi';

do $seed$
declare v_admin int; v_member int; v_durum int;
begin
  select count(*) filter (where seviye='yonetici'), count(*) filter (where seviye='uye')
    into v_admin, v_member from public.team;
  select count(*) into v_durum from public.jobs where durum is not null;
  raise notice 'upstream compat backfill: seviye yonetici=% uye=% · jobs.durum set on % row(s)',
    v_admin, v_member, v_durum;
end
$seed$;
