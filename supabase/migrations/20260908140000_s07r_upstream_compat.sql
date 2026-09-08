-- =====================================================================
-- Upstream reconciliation — compatibility schema for origin/main @ 482cf76
-- ---------------------------------------------------------------------
-- Halil built these directly in PRODUCTION, outside Git. Verified
-- read-only on 8 Eylül 2026 via PostgREST column probes
-- (LOCAL_DEV_SETUP §3.2):
--
--   team.seviye              EXISTS in production
--   team.unvan               EXISTS in production
--   team.notlar              EXISTS in production
--   jobs.durum               EXISTS in production
--   public.bildirimler       EXISTS in production
--   public.aboneler          EXISTS in production
--   products.ikon            already present in our baseline
--
-- This migration reproduces them LOCALLY so upstream's code paths run.
-- Production is NOT altered by this file.
--
-- CANONICAL BOUNDARY
--   * team.seviye is LEGACY COMPATIBILITY DATA ONLY. It is never an
--     authorization authority — team.app_role is (D-203), and RLS is the
--     final enforcement. The panel resolves every permission check from
--     app_role and writes only app_role.
--   * jobs.durum is retained so upstream's marketing sub-state is not
--     silently dropped, but it is NOT a second workflow model. Canonical
--     position is phase (jobs.status) + lifecycle (jobs.lifecycle_status).
--     'pazarlama' is NOT added as a phase and cannot be written: the
--     canonical CHECK constraint rejects it.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. team — profile fields + legacy level
-- ---------------------------------------------------------------------
alter table public.team add column if not exists unvan  text;
alter table public.team add column if not exists notlar text;
alter table public.team add column if not exists seviye text;

comment on column public.team.unvan is
  'Free-text job title shown on the team profile card. Display only - never an authorization input.';
comment on column public.team.notlar is
  'Personal scratch notebook on the team profile. Not a business timeline; that is entries (BR-AUD01).';
comment on column public.team.seviye is
  'LEGACY upstream level (uye | yonetici). Compatibility data only. NOT an authorization authority - app_role is (D-203) and RLS is final.';

do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'team_seviye_check') then
    alter table public.team add constraint team_seviye_check
      check (seviye is null or seviye in ('uye','yonetici'));
  end if;
end
$mig$;

-- Keep the legacy column consistent with the canonical role so upstream
-- screens that still READ it show the truth. app_role stays the source.
update public.team
   set seviye = case when app_role = 'admin' then 'yonetici' else 'uye' end
 where seviye is distinct from (case when app_role = 'admin' then 'yonetici' else 'uye' end);


-- ---------------------------------------------------------------------
-- 2. jobs.durum — upstream marketing sub-state, kept as compatibility
-- ---------------------------------------------------------------------
alter table public.jobs add column if not exists durum text;

comment on column public.jobs.durum is
  'LEGACY upstream marketing sub-state. Canonical position is status (phase) + lifecycle_status. Retained so no upstream value is lost; it is not a second workflow model and the panel does not edit it.';

do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_durum_check') then
    alter table public.jobs add constraint jobs_durum_check
      check (durum is null or durum in
             ('gorusuluyor','teklif','beklemede','kazanildi','kaybedildi'));
  end if;
end
$mig$;

-- Translate any upstream sub-state into canonical phase + lifecycle.
-- Mapping is the one fixed by the reconciliation brief:
--   gorusuluyor -> phase temas_takip
--   teklif      -> phase teklif
--   beklemede   -> lifecycle bekliyor
--   kaybedildi  -> lifecycle kapandi + closed_reason kaybedildi
--   kazanildi   -> no separate canonical state; normal Work flow continues
-- Only rows that are still at the first phase are moved forward, so a
-- Work the team has already advanced is never dragged backwards.
update public.jobs set status = 'temas_takip'
 where durum = 'gorusuluyor' and status = 'temas_takip';

update public.jobs set status = 'teklif'
 where durum = 'teklif' and status = 'temas_takip';

update public.jobs set lifecycle_status = 'bekliyor'
 where durum = 'beklemede' and lifecycle_status = 'acik';

update public.jobs
   set lifecycle_status = 'kapandi',
       closed_reason    = coalesce(closed_reason, 'kaybedildi')
 where durum = 'kaybedildi' and lifecycle_status <> 'kapandi';


-- ---------------------------------------------------------------------
-- 3. bildirimler — reservation-expiry attention signals
-- ---------------------------------------------------------------------
-- Ephemeral attention signals, NOT a coordination system: they never
-- carry Work/Entry truth and nothing reads them as business history.
create table if not exists public.bildirimler (
  id                bigint      generated by default as identity primary key,
  tur               text        not null,
  anahtar           text        not null,
  baslik            text        not null,
  detay             text,
  okundu            boolean     not null default false,
  eposta_gonderildi boolean     not null default false,
  created_at        timestamptz not null default now()
);

comment on table public.bildirimler is
  'Ephemeral attention signals (reservation expiry). Not a business timeline and not a Task/Ticket store - Entry remains the single coordination primitive (D-204).';

-- upstream upserts with onConflict:'anahtar', so this must be unique.
create unique index if not exists bildirimler_anahtar_key on public.bildirimler (anahtar);
create index if not exists bildirimler_okundu_idx on public.bildirimler (okundu, created_at desc);


-- ---------------------------------------------------------------------
-- 4. aboneler — public newsletter sign-ups
-- ---------------------------------------------------------------------
create table if not exists public.aboneler (
  id         bigint      generated by default as identity primary key,
  eposta     text        not null,
  kaynak     text,
  created_at timestamptz not null default now()
);

comment on table public.aboneler is
  'Public newsletter sign-ups. Anonymous INSERT only - the list itself is internal and is never readable by anon.';

create unique index if not exists aboneler_eposta_key on public.aboneler (lower(eposta));


-- ---------------------------------------------------------------------
-- 5. RLS — same Sprint 07 shape as every other table
-- ---------------------------------------------------------------------
alter table public.bildirimler enable row level security;
alter table public.aboneler    enable row level security;

-- Notifications: any active internal user may read, raise and mark read
-- (the sweep runs on panel load). Only an admin may delete.
drop policy if exists s07_bildirimler_read   on public.bildirimler;
drop policy if exists s07_bildirimler_write  on public.bildirimler;
drop policy if exists s07_bildirimler_modify on public.bildirimler;
drop policy if exists s07_bildirimler_remove on public.bildirimler;
create policy s07_bildirimler_read   on public.bildirimler for select to authenticated using (public.is_internal());
create policy s07_bildirimler_write  on public.bildirimler for insert to authenticated with check (public.is_internal());
create policy s07_bildirimler_modify on public.bildirimler for update to authenticated using (public.is_internal()) with check (public.is_internal());
create policy s07_bildirimler_remove on public.bildirimler for delete to authenticated using (public.is_admin());

-- Newsletter: the public may subscribe; only internal users may read the
-- list, and only an admin may prune it. Anon gets INSERT and nothing else.
drop policy if exists aboneler_insert       on public.aboneler;
drop policy if exists s07_aboneler_read     on public.aboneler;
drop policy if exists s07_aboneler_write    on public.aboneler;
drop policy if exists s07_aboneler_modify   on public.aboneler;
drop policy if exists s07_aboneler_remove   on public.aboneler;
create policy aboneler_insert     on public.aboneler for insert to anon          with check (true);
create policy s07_aboneler_read   on public.aboneler for select to authenticated using (public.is_internal());
create policy s07_aboneler_write  on public.aboneler for insert to authenticated with check (public.is_internal());
create policy s07_aboneler_modify on public.aboneler for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy s07_aboneler_remove on public.aboneler for delete to authenticated using (public.is_admin());
