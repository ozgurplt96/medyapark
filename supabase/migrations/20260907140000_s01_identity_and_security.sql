-- =====================================================================
-- Sprint 01 — Identity, Roles & Production Security Seam
-- ---------------------------------------------------------------------
-- Canonical basis:
--   06_DATA_MODEL_AND_MIGRATION_SPEC_v1.0  §4 (team), §12.4 (public
--   booking privacy), §19 (RLS pilot minimum), §22 M1
--   09_V0_SPRINT_PLAN_v1.0                 Sprint 01
--   05_DECISION_LOG_v2.1                   D-203, D-230
--
-- ADDITIVE ONLY (06 §1.1): no data column dropped, nothing renamed, no
-- row deleted. Legacy team.yetki / team.role are preserved untouched and
-- remain display/compatibility fields.
--
-- PRODUCTION NOTE (06 §1.5): this file belongs to the LOCAL consolidated
-- history and is never `db push`-ed. The production equivalent is a
-- separate reviewed forward migration applied in Sprint 08.
--
-- SCHEMA ONLY. No auth user, no team row, no company data is created
-- here. The local A1 identity mapping lives in supabase/seeds/ so that it
-- can never travel to production.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. team — internal identity, role and active seam   (06 §4.1)
-- ---------------------------------------------------------------------
alter table public.team add column if not exists auth_user_id uuid;
alter table public.team add column if not exists app_role     text    not null default 'team_member';
alter table public.team add column if not exists active       boolean not null default true;

comment on column public.team.auth_user_id is
  'Canonical link to auth.users(id). Primary internal identity join (06 s4.2). team.eposta is display/contact data only and must never be used for authorization.';
comment on column public.team.app_role is
  'V0 application role: admin | team_member (D-203). Not a permission matrix.';
comment on column public.team.active is
  'Internal access seam. active=false revokes internal data access without deleting history (06 s4.3).';

do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'team_auth_user_id_fkey') then
    alter table public.team
      add constraint team_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'team_app_role_check') then
    alter table public.team
      add constraint team_app_role_check check (app_role in ('admin', 'team_member'));
  end if;
end
$mig$;

-- Partial unique: one team profile per Auth user, while unmapped legacy
-- rows (auth_user_id is null) may still coexist during migration.
create unique index if not exists team_auth_user_id_key
  on public.team (auth_user_id) where auth_user_id is not null;


-- ---------------------------------------------------------------------
-- 2. Role helpers   (09 Sprint 01: "admin/team_member role helpers")
-- ---------------------------------------------------------------------
-- SECURITY DEFINER is REQUIRED here, not incidental. These functions read
-- public.team, and public.team is itself protected by a policy that calls
-- them. An INVOKER function would re-enter that policy and fail with
-- "infinite recursion detected in policy for relation team" (SQLSTATE
-- 42P17). Executing as owner reads the table without re-evaluating RLS.
--
-- search_path is pinned so a caller cannot redirect the definer body.
create or replace function public.is_internal()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $fn$
  select exists (
    select 1 from public.team t
    where t.auth_user_id = auth.uid()
      and t.active
  );
$fn$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $fn$
  select exists (
    select 1 from public.team t
    where t.auth_user_id = auth.uid()
      and t.active
      and t.app_role = 'admin'
  );
$fn$;

comment on function public.is_internal() is
  'True when the caller is an active internal team member. Basis of every internal RLS policy (06 s19).';
comment on function public.is_admin() is
  'True when the caller is an active internal team member with app_role = admin (D-203).';

-- NOTE — is_admin() is intentionally NOT referenced by any policy in this
-- migration. Sprint 01 delivers the role HELPERS; 09 lists "complex ACL"
-- under Out-of-scope and D-203 forbids a V0 permission matrix. Admin-only
-- mutation enforcement (11 §B: "team_member cannot access Admin-only
-- mutation capability by route manipulation") is Sprint 06/07 work. The
-- helper exists now so that surface plumbing and that later sprint have a
-- single, server-side source of truth to build on.

revoke all on function public.is_internal() from public;
revoke all on function public.is_admin()    from public;
grant execute on function public.is_internal() to anon, authenticated;
grant execute on function public.is_admin()    to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. Public booking availability — column projection   (06 §12.4)
-- ---------------------------------------------------------------------
-- RLS filters ROWS, never COLUMNS. The old bookings_read policy granted
-- anon SELECT with USING (true), so /rest/v1/bookings?select=* exposed
-- bookings.customer_id and bookings.note to the public internet, even
-- though the site only ever rendered three fields.
--
-- security_invoker is deliberately left at its default (false) so the
-- view executes as its owner and bypasses bookings RLS. That is the
-- point: this is the only sanctioned public read path and it can
-- physically return nothing but the three non-identifying columns.
create or replace view public.booking_availability_public as
  select b.unit_id,
         b.ym,
         b.status
  from public.bookings b;

comment on view public.booking_availability_public is
  'Public occupancy read path. Exposes unit_id, ym, status only - never customer_id or note (06 s12.4). Owner-executed by design.';

grant select on public.booking_availability_public to anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. RLS — internal tables require an ACTIVE internal user   (06 §19)
-- ---------------------------------------------------------------------
-- Before: every internal table was `authenticated ALL USING (true)`, i.e.
-- holding any JWT was sufficient. After: an active public.team row linked
-- by auth_user_id is required.

-- 4a. Internal-only tables (no anon read at all)
drop policy if exists customers_admin    on public.customers;
drop policy if exists jobs_admin         on public.jobs;
drop policy if exists team_admin         on public.team;
drop policy if exists notes_admin        on public.notes;
drop policy if exists activity_log_auth  on public.activity_log;
drop policy if exists suppliers_admin    on public.suppliers;
drop policy if exists suppliers_auth_all on public.suppliers;  -- redundant duplicate
drop policy if exists quotes_admin       on public.quotes;
drop policy if exists quote_items_admin  on public.quote_items;
drop policy if exists leads_admin        on public.leads;
drop policy if exists bookings_admin     on public.bookings;

create policy customers_internal    on public.customers    for all to authenticated using (public.is_internal()) with check (public.is_internal());
create policy jobs_internal         on public.jobs         for all to authenticated using (public.is_internal()) with check (public.is_internal());
create policy team_internal         on public.team         for all to authenticated using (public.is_internal()) with check (public.is_internal());
create policy notes_internal        on public.notes        for all to authenticated using (public.is_internal()) with check (public.is_internal());
create policy activity_log_internal on public.activity_log for all to authenticated using (public.is_internal()) with check (public.is_internal());
create policy suppliers_internal    on public.suppliers    for all to authenticated using (public.is_internal()) with check (public.is_internal());
create policy quotes_internal       on public.quotes       for all to authenticated using (public.is_internal()) with check (public.is_internal());
create policy quote_items_internal  on public.quote_items  for all to authenticated using (public.is_internal()) with check (public.is_internal());
create policy leads_internal        on public.leads        for all to authenticated using (public.is_internal()) with check (public.is_internal());
create policy bookings_internal     on public.bookings     for all to authenticated using (public.is_internal()) with check (public.is_internal());

-- 4b. Public write path preserved (06 §19): the public site must still be
--     able to submit a planning request and a quote request anonymously.
--     leads_insert / quotes_insert / quote_items_insert already exist as
--     anon INSERT-only policies and are intentionally left untouched.

-- 4c. Anon booking SELECT revoked; the public path is now the view.
drop policy if exists bookings_read on public.bookings;

-- 4d. Public-readable content/media tables: anon SELECT preserved, but
--     WRITE now requires an active internal user rather than any JWT.
drop policy if exists products_admin          on public.products;
drop policy if exists mecralar_admin          on public.mecralar;
drop policy if exists alt_admin               on public.alt_mecralar;
drop policy if exists units_admin             on public.units;
drop policy if exists pages_admin             on public.pages;
drop policy if exists settings_admin          on public.settings;
drop policy if exists "tuyap_ayarlar write"   on public.tuyap_ayarlar;
drop policy if exists "tuyap_gruplar write"   on public.tuyap_gruplar;
drop policy if exists "tuyap_noktalar write"  on public.tuyap_noktalar;

create policy products_internal       on public.products       for all to authenticated using (public.is_internal()) with check (public.is_internal());
create policy mecralar_internal       on public.mecralar       for all to authenticated using (public.is_internal()) with check (public.is_internal());
create policy alt_mecralar_internal   on public.alt_mecralar   for all to authenticated using (public.is_internal()) with check (public.is_internal());
create policy units_internal          on public.units          for all to authenticated using (public.is_internal()) with check (public.is_internal());
create policy pages_internal          on public.pages          for all to authenticated using (public.is_internal()) with check (public.is_internal());
create policy settings_internal       on public.settings       for all to authenticated using (public.is_internal()) with check (public.is_internal());
create policy tuyap_ayarlar_internal  on public.tuyap_ayarlar  for all to authenticated using (public.is_internal()) with check (public.is_internal());
create policy tuyap_gruplar_internal  on public.tuyap_gruplar  for all to authenticated using (public.is_internal()) with check (public.is_internal());
create policy tuyap_noktalar_internal on public.tuyap_noktalar for all to authenticated using (public.is_internal()) with check (public.is_internal());

-- Intentionally UNCHANGED (public site depends on them):
--   products_read / mecralar_read / alt_read / units_read / pages_read /
--   settings_read / tuyap_* read      -> anon+authenticated SELECT
--   leads_insert / quotes_insert / quote_items_insert -> anon INSERT
