-- Product Simplification Sprint 4 — booking exact-period fidelity
--
-- Basis: SCHEMA_IMPACT_REVIEW.md §5.3, PS4 brief §4-§8.
--
-- WHAT THIS IS NOT: an interval booking engine. The monthly model stays
-- authoritative and `bookings_unit_id_ym_key` is UNTOUCHED — verified as
-- load-bearing for the client-side `booking_toggle` upsert
-- (`onConflict:'unit_id,ym'`), which is not rewritten by this sprint.
--
-- Evidence (PS4 §1, re-harvested this sprint from the reservation/LED
-- workbooks — 1372 period strings across six distinct shapes):
--     714  05.07.24-05.01.25            dd.mm.yy pair
--     379  15.02.2024-15.02.2025        dd.mm.yyyy pair
--     148  *-31.12.2024 / 31.12.2024-   one side UNKNOWN
--      66  01.02. / 31.03.2026  2 AY    dates PLUS agreed duration
--      41  05.07-05.10/2026             year written once
--      24  20.09.2025 - ?               OPEN-ENDED
--
-- The first, second and fifth shapes are ordinary date ranges. The other
-- three (~238 strings) carry meaning two `date` columns cannot hold: an
-- unknown side, an open end, or a commercially agreed term ("2 AY") that is
-- not derivable from the dates. That is the concrete representational
-- problem PS4 §5 requires before a raw field may be added — so
-- `period_note` is justified, and is deliberately the ONLY text field added.

-- ---------------------------------------------------------------------
-- 1. Exact period, both sides nullable and independently so
-- ---------------------------------------------------------------------
-- Nullable independently on purpose: `*-31.12.2024` has a known end and an
-- unknown start, `20.09.2025 - ?` the reverse. Forcing both would have made
-- the workbook's own data unrepresentable.
alter table public.bookings add column if not exists period_start date;
alter table public.bookings add column if not exists period_end   date;

-- Raw source value, ONLY for what the two dates cannot express.
alter table public.bookings add column if not exists period_note text;

comment on column public.bookings.period_start is
  'Real business period start when known. NOT the monthly bucket - see ym. Nullable independently of period_end.';
comment on column public.bookings.period_end is
  'Real business period end when known. NULL means open-ended or unknown, never "no reservation".';
comment on column public.bookings.period_note is
  'Raw source period text only where dates cannot express it (open end, unknown side, agreed term such as "2 AY").';

-- A range that ends before it starts is always a data-entry error.
-- Written so that NULL on either side is allowed (the common case).
alter table public.bookings drop constraint if exists bookings_period_order;
alter table public.bookings add constraint bookings_period_order
  check (period_start is null or period_end is null or period_end >= period_start);

-- "Which bookings are active today?" scans by date. Partial, because rows
-- with no exact period are answered from `ym` instead and never match here.
create index if not exists bookings_period_idx
  on public.bookings(period_start, period_end) where period_start is not null;

-- ---------------------------------------------------------------------
-- 2. ym vs period_start/period_end — NOT interchangeable (PS4 §6)
-- ---------------------------------------------------------------------
-- `ym`     = the monthly occupancy/availability bucket. Availability truth.
-- `period_*` = the real business period, when known. Context truth.
--
-- One real reservation of 17.03.2026-02.04.2026 occupies the 2026-03 AND
-- 2026-04 buckets, and BOTH rows legitimately carry the same period dates.
-- Repeated period metadata across monthly rows is therefore NOT duplicate
-- business data, and nothing in this migration treats it as such.
--
-- No booking_group / reservation id is introduced (PS4 §7). Evaluated and
-- declined: every question the UI actually asks - "is this free?", "who
-- holds it?", "until when?", "when does it free up?" - is answerable from
-- the row in front of the user. A grouping id would only be needed to count
-- or edit reservations as a unit, which V0 does not do. Propagating a period
-- across the months it covers is handled in the UI helper instead.

-- ---------------------------------------------------------------------
-- 3. Public projection must NOT gain these columns (PS4 §26)
-- ---------------------------------------------------------------------
-- `booking_availability_public` is re-asserted here with its exact existing
-- projection so that adding columns to the base table cannot silently widen
-- what anonymous visitors can read. Customer identity and internal period
-- metadata stay internal.
create or replace view public.booking_availability_public as
  select b.unit_id, b.ym, b.status
    from public.bookings b
    join public.units u on u.id = b.unit_id
   where u.active;

comment on view public.booking_availability_public is
  'Public availability only: unit_id, ym, status. Never customer identity, never period metadata (PS4 §26).';
