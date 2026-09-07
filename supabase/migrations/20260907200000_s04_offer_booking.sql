-- =====================================================================
-- Sprint 04 — Offer & Booking Integration
-- ---------------------------------------------------------------------
-- Canonical basis:
--   06_DATA_MODEL_AND_MIGRATION_SPEC_v1.0  §10 (quotes -> Offer), §11
--   (approve_quote contract), §12 (bookings / availability / unit
--   activation), §22 M4
--   09_V0_SPRINT_PLAN_v1.0                 Sprint 04
--   05_DECISION_LOG_v2.1                   D-214, D-215, D-217, D-227
--
-- quotes + quote_items stay the Offer backing (D-227); the existing quote
-- builder, print/PDF path and the monthly (unit_id, ym) booking model are
-- preserved. Media inventory is NOT re-modelled (BR-M01).
--
-- ADDITIVE ONLY (06 §1.1).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. quotes — Work link and revision chain                 (06 §10)
-- ---------------------------------------------------------------------
alter table public.quotes add column if not exists work_id        bigint;
alter table public.quotes add column if not exists revision_of_id bigint;
alter table public.quotes add column if not exists revision_no    integer not null default 1;

comment on column public.quotes.work_id is
  'Owning Work. NULL is legitimate: an Offer may arrive before anyone opened a Work, and a Work may exist with no Offer at all (D-217).';
comment on column public.quotes.revision_of_id is
  'Previous revision. A sent Offer is never overwritten - a revision is a clone pointing back here (06 s10.2).';

-- 06 §10.1 orphan preflight was run before writing this migration:
--   select q.id from quotes q where q.customer_id is not null
--     and not exists (select 1 from customers c where c.id = q.customer_id);
-- Result: 0 rows, so the FK can be added without data repair.
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'quotes_customer_id_fkey') then
    alter table public.quotes add constraint quotes_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'quotes_work_id_fkey') then
    alter table public.quotes add constraint quotes_work_id_fkey
      foreign key (work_id) references public.jobs(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'quotes_revision_of_id_fkey') then
    alter table public.quotes add constraint quotes_revision_of_id_fkey
      foreign key (revision_of_id) references public.quotes(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'quotes_revision_no_check') then
    alter table public.quotes add constraint quotes_revision_no_check check (revision_no >= 1);
  end if;
end
$mig$;

create index if not exists quotes_work_id_idx on public.quotes (work_id);


-- ---------------------------------------------------------------------
-- 2. bookings — Work / source Offer link                   (06 §12.1)
-- ---------------------------------------------------------------------
-- Booking stays in the media domain. The link is a reference, not
-- ownership: booking status is NOT Work status (BR-M02).
alter table public.bookings add column if not exists work_id         bigint;
alter table public.bookings add column if not exists source_quote_id bigint;

do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_work_id_fkey') then
    alter table public.bookings add constraint bookings_work_id_fkey
      foreign key (work_id) references public.jobs(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'bookings_source_quote_id_fkey') then
    alter table public.bookings add constraint bookings_source_quote_id_fkey
      foreign key (source_quote_id) references public.quotes(id) on delete set null;
  end if;
end
$mig$;

create index if not exists bookings_work_id_idx on public.bookings (work_id);


-- ---------------------------------------------------------------------
-- 3. units — activation seam                               (06 §12.3)
-- ---------------------------------------------------------------------
-- Verified absent: units had no active/hidden equivalent, unlike
-- mecralar/alt_mecralar which carry `hidden`.
--
-- Deactivation is a DELIBERATE commercial act (D-215). Short maintenance
-- is NOT an automatic unavailability rule, an old poster left hanging is
-- not unavailability, and Medyapark's own advertising is not a commercial
-- booking.
alter table public.units add column if not exists active        boolean not null default true;
alter table public.units add column if not exists inactive_note text;

comment on column public.units.active is
  'Commercial availability switch, set by hand. Maintenance does not flip this automatically (BR-M03 / 06 s12.2).';


-- ---------------------------------------------------------------------
-- 4. Public availability view — keep it in step with S01
-- ---------------------------------------------------------------------
-- The S01 view is replaced so deactivated units stop being advertised
-- publicly. Still exposes unit_id, ym, status only - never customer_id,
-- note, work_id or source_quote_id (06 §12.4).
create or replace view public.booking_availability_public as
  select b.unit_id, b.ym, b.status
  from public.bookings b
  join public.units u on u.id = b.unit_id
  where u.active;

grant select on public.booking_availability_public to anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. approve_quote() — canonical refactor                  (06 §11)
-- ---------------------------------------------------------------------
-- Replaces behaviour that could not survive the canonical model:
--   * it ignored quotes.customer_id and went straight to fuzzy matching
--   * it wrote the contact person's name into customers.ilgili_kisi,
--     re-corrupting the provenance column Sprint 02 cleaned (S02_001)
--   * it guarded against duplicate Work by matching a GENERATED TITLE
--     STRING, so renaming a Work made re-approval create a second one
--   * it always created a Work, ignoring an existing quotes.work_id
--   * it stamped the legacy 'tasarim' phase
--   * it never linked bookings back to Work or source Offer
--
-- Returns jsonb. Existing callers read .reserved / .conflicts /
-- .customer_id, all of which are preserved.
create or replace function public.approve_quote(p_quote_id bigint)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  q            record;
  it           record;
  ex           record;
  cust_id      bigint;
  v_work_id    bigint;
  m_id         bigint;
  reserved     int     := 0;
  skipped      int     := 0;
  conflicts    text[]  := '{}';
  created_work boolean := false;
  job_title    text;
  cur_phase    text;
  phase_rank   jsonb   := '{"temas_takip":0,"teklif":1,"baski":2,"montaj":3,"yayinda_aktif":4}';
begin
  select * into q from quotes where id = p_quote_id;
  if not found then
    return jsonb_build_object('done', false, 'error', 'quote_not_found');
  end if;

  -- (8) Idempotency guard: an already-approved Offer is not re-applied.
  if q.status = 'onaylandi' then
    return jsonb_build_object(
      'done', true, 'already_approved', true,
      'reserved', 0, 'skipped', 0, 'conflicts', '[]'::jsonb,
      'customer_id', q.customer_id, 'work_id', q.work_id);
  end if;

  ---------------------------------------------------------------- customer
  -- (2) Stable ID first. Fuzzy matching is a fallback only (08 §6).
  cust_id := q.customer_id;

  if cust_id is null and coalesce(q.eposta,'') <> '' then
    select id into cust_id from customers where eposta = q.eposta limit 1;
  end if;
  if cust_id is null and coalesce(q.firma,'') <> '' then
    select id into cust_id from customers where firma = q.firma limit 1;
  end if;

  if cust_id is null then
    -- Only firma is written. The contact person becomes a real Contact,
    -- never customers.ilgili_kisi (S02_001).
    insert into customers (firma, telefon, eposta, source_type, source_ref)
    values (coalesce(nullif(q.firma,''), nullif(q.customer_name,''), 'Müşteri'),
            q.telefon, q.eposta, 'quote', 'quotes#' || p_quote_id)
    returning id into cust_id;

    if coalesce(nullif(trim(q.customer_name),''),'') <> '' then
      insert into contacts (customer_id, name, phone, email, is_primary, source_type, source_ref)
      values (cust_id, trim(q.customer_name), q.telefon, q.eposta, true,
              'quote', 'quotes#' || p_quote_id);
    end if;
  end if;

  if q.customer_id is null then
    update quotes set customer_id = cust_id where id = p_quote_id;
  end if;

  ------------------------------------------------------------------- work
  -- (3)(4) Reuse the linked Work; only create one when the Offer has none.
  v_work_id := q.work_id;

  select mecra_id into m_id
  from units
  where id = (select unit_id from quote_items
              where quote_id = p_quote_id and unit_id is not null limit 1);

  if v_work_id is null then
    job_title := coalesce(nullif(q.firma,''), nullif(q.customer_name,''), 'Müşteri')
                 || ' — Teklif #' || p_quote_id;
    insert into jobs (title, customer_id, mecra_id, status, lifecycle_status, note)
    values (job_title, cust_id, m_id, 'teklif', 'acik',
            'Onaylanan tekliften otomatik oluşturuldu.')
    returning id into v_work_id;
    created_work := true;

    update quotes set work_id = v_work_id where id = p_quote_id;

    -- Backfill the canonical account party for the new Work (06 §8).
    insert into work_parties (job_id, customer_id, role)
    values (v_work_id, cust_id, 'account')
    on conflict do nothing;
  end if;

  ---------------------------------------------------------------- booking
  -- (5)(6) Only concrete (unit_id, ym) items become bookings.
  for it in select * from quote_items
            where quote_id = p_quote_id and unit_id is not null and ym is not null loop

    select status, customer_id into ex
    from bookings where unit_id = it.unit_id and ym = it.ym;

    -- (7) A month already committed to a DIFFERENT Organization is a
    -- conflict and is reported, not silently overwritten. Re-approving
    -- over this customer's own booking is fine.
    if found and ex.status in ('dolu','rezerve')
       and ex.customer_id is not null and ex.customer_id <> cust_id then
      conflicts := array_append(conflicts,
        coalesce(it.unit_name,'#'||it.unit_id) || ' · ' || it.ym);
      skipped := skipped + 1;
      continue;
    end if;

    insert into bookings (unit_id, ym, status, customer_id, work_id, source_quote_id)
    values (it.unit_id, it.ym, 'dolu', cust_id, v_work_id, p_quote_id)
    on conflict (unit_id, ym) do update
      set status          = 'dolu',
          customer_id     = excluded.customer_id,
          work_id         = excluded.work_id,
          source_quote_id = excluded.source_quote_id;

    reserved := reserved + 1;
  end loop;

  ------------------------------------------------------------------ phase
  -- (9) Advance only forwards, and never past where the team already is.
  select status into cur_phase from jobs where id = v_work_id;
  if coalesce((phase_rank ->> cur_phase)::int, 0) < 1 then
    update jobs set status = 'teklif' where id = v_work_id;
  end if;

  update quotes set status = 'onaylandi' where id = p_quote_id;

  ------------------------------------------------------------------ entry
  -- (10) The system already knows this happened, so it records it itself
  -- instead of asking anyone to retype it (BR-E03).
  insert into entries (job_id, customer_id, body, source, source_ref)
  values (v_work_id, cust_id,
          'Teklif #' || p_quote_id || ' onaylandı'
          || case when reserved > 0 then ' · ' || reserved || ' ay rezerve edildi' else '' end
          || case when skipped  > 0 then ' · ' || skipped  || ' ay çakışma nedeniyle atlandı' else '' end,
          'system', 'quotes#' || p_quote_id);

  return jsonb_build_object(
    'done',         true,
    'reserved',     reserved,
    'skipped',      skipped,
    'conflicts',    to_jsonb(conflicts),
    'customer_id',  cust_id,
    'work_id',      v_work_id,
    'created_work', created_work);
end
$function$;

comment on function public.approve_quote(bigint) is
  'Canonical Offer acceptance (06 s11). Idempotent, reuses quotes.work_id instead of creating duplicate Work, links bookings to Work and source Offer, reports conflicts rather than overwriting another Organization, and never regresses Work phase.';
