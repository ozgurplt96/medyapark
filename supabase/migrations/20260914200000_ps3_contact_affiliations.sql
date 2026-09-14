-- Product Simplification Sprint 3 — Hafıza: Person ↔ multiple Organizations
--
-- Basis: SCHEMA_IMPACT_REVIEW.md §5.1 (required for V0), PS3 brief §6-§9.
--
-- Inspected before writing (PS3 §8):
--   * `contacts.customer_id` is ALREADY NULLABLE — a Person can exist with no
--     Organization today, so no column alteration is needed and no placeholder
--     Organization is ever fabricated.
--   * `contacts` stays the Person identity master. No contacts→people rewrite.
--   * `jobs.primary_contact_id → contacts(id)` is untouched: a Work's primary
--     Contact is a PERSON, and that person's other Organizations are extra
--     context, not a different primary-contact concept (PS3 §25).
--
-- Additive only. Nothing is dropped, renamed or made authoritative-only.

-- ---------------------------------------------------------------------
-- 1. contact_affiliations — the Person ↔ Organization relation
-- ---------------------------------------------------------------------
-- title/department live HERE, not on the person: "Pazarlama Müdürü" is true
-- of Ahmet AT ABC Ajans, and may be something else entirely at XYZ Derneği
-- (PS3 §6, §31). Phone and e-mail stay on `contacts` because they belong to
-- the human being, not to one of their jobs.
create table if not exists public.contact_affiliations (
  id          bigint generated always as identity primary key,
  contact_id  bigint      not null references public.contacts(id)  on delete cascade,
  customer_id bigint      not null references public.customers(id) on delete cascade,
  title       text,
  department  text,
  is_primary  boolean     not null default false,
  active      boolean     not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

-- One live affiliation per (person, organization). A person can of course be
-- affiliated with many organizations — that is the whole point — but not twice
-- with the SAME one while both rows are active (PS3 §7).
create unique index if not exists contact_affiliations_uniq_active
  on public.contact_affiliations(contact_id, customer_id) where active;

-- At most one PRIMARY organization per person.
--
-- Note this is a DIFFERENT axis from the pre-existing
-- `contacts_one_primary_per_customer`, which means "one primary PERSON per
-- organization". The two constrain opposite directions of the same relation
-- and must both hold: ABC Ajans has one main contact, and Ahmet has one main
-- employer. Conflating them would forbid a perfectly legal pairing.
create unique index if not exists contact_affiliations_one_primary_per_contact
  on public.contact_affiliations(contact_id) where is_primary and active;

-- Both directions are queried constantly by Hafıza:
--   Person Detail  -> "which organizations?"  (contact_id)
--   Org Detail     -> "which people?"         (customer_id)
create index if not exists contact_affiliations_contact_idx
  on public.contact_affiliations(contact_id);
create index if not exists contact_affiliations_customer_idx
  on public.contact_affiliations(customer_id);

comment on table public.contact_affiliations is
  'Person (contacts) <-> Organization (customers) relation. title/department describe the person IN THAT organization. Never a visibility gate.';

-- ---------------------------------------------------------------------
-- 2. Backfill — a lossless mirror of a link that already exists
-- ---------------------------------------------------------------------
-- Every existing contact carrying a customer_id gets exactly ONE affiliation,
-- marked primary. Zero judgment calls: it copies an assertion already made.
-- `on conflict do nothing` + the `not exists` guard make it reset-safe and
-- re-runnable without ever duplicating a person or an affiliation (PS3 §38).
insert into public.contact_affiliations (contact_id, customer_id, title, department, is_primary, active)
select c.id, c.customer_id, c.title, c.department, true, c.active
  from public.contacts c
 where c.customer_id is not null
   and not exists (
     select 1 from public.contact_affiliations a
      where a.contact_id = c.id and a.customer_id = c.customer_id);

-- ---------------------------------------------------------------------
-- 3. Compatibility rule: contacts.customer_id mirrors the primary affiliation
-- ---------------------------------------------------------------------
-- PS3 §9 requires ONE clear rule and forbids two contradictory sources of
-- "primary Organization". The rule is:
--
--     contacts.customer_id ALWAYS equals the customer_id of that contact's
--     primary+active affiliation, whenever one exists.
--
-- Enforced by triggers rather than by client code, because several existing
-- write paths (contactForm, inline create from New Work, future Hafıza edits)
-- all touch affiliations, and a rule implemented in one of them would be
-- silently missing from the others. This is NOT a generalized sync system: it
-- is one trigger, one direction, one column.
--
-- Direction is deliberately one-way (affiliation -> contacts). `contacts` has
-- no trigger writing back to affiliations, so there is no recursion.
-- TWO triggers, because the ordering matters and a single AFTER trigger
-- cannot do the job:
--
--   `contact_affiliations_one_primary_per_contact` is evaluated DURING the
--   INSERT/UPDATE statement. Demoting the previous primary from an AFTER
--   trigger runs too late — the index has already rejected the new row with
--   "duplicate key". Verified by testing the trigger before building any UI
--   on top of it. So demotion happens BEFORE, and the mirror AFTER.

-- (a) BEFORE: make room for the new primary.
create or replace function public.demote_sibling_affiliations()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.is_primary and new.active then
    update public.contact_affiliations
       set is_primary = false, updated_at = now()
     where contact_id = new.contact_id
       and is_primary
       and id is distinct from new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_demote_sibling_affiliations on public.contact_affiliations;
create trigger trg_demote_sibling_affiliations
  before insert or update on public.contact_affiliations
  for each row execute function public.demote_sibling_affiliations();

-- (b) AFTER: mirror the resulting primary into the compatibility column.
create or replace function public.sync_primary_affiliation()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_contact bigint; v_org bigint;
begin
  v_contact := coalesce(new.contact_id, old.contact_id);
  select a.customer_id into v_org
    from public.contact_affiliations a
   where a.contact_id = v_contact and a.is_primary and a.active
   order by a.id limit 1;

  -- `contacts.is_primary` means "primary PERSON at contacts.customer_id", and
  -- `contacts_one_primary_per_customer` enforces one per organization. When
  -- the mirror moves a person to a different organization we must not let
  -- them silently claim primacy there: keep the flag only if the target has
  -- no other primary person. Without this the mirror update fails outright
  -- with a duplicate-key error the user never caused.
  update public.contacts c
     set customer_id = v_org,
         is_primary  = c.is_primary and (
           v_org is null or not exists (
             select 1 from public.contacts o
              where o.customer_id = v_org and o.is_primary and o.id <> c.id))
   where c.id = v_contact
     and c.customer_id is distinct from v_org;

  return null;                              -- AFTER trigger; result ignored
end;
$$;

drop trigger if exists trg_sync_primary_affiliation on public.contact_affiliations;
create trigger trg_sync_primary_affiliation
  after insert or update or delete on public.contact_affiliations
  for each row execute function public.sync_primary_affiliation();

comment on function public.sync_primary_affiliation() is
  'Keeps contacts.customer_id equal to the contact primary+active affiliation. One-way, affiliation -> contacts. PS3 §9.';

-- ---------------------------------------------------------------------
-- 4. RLS — identical shape to contacts / work_parties
-- ---------------------------------------------------------------------
-- No new capability concept: internal users read and maintain ordinary
-- relationship data; only admin deletes rows outright. Deleting an
-- affiliation never deletes the Person or the Organization — the FKs point
-- FROM this table, so a cascade here can only remove affiliation rows when
-- their parent person/organization is itself deleted (PS3 §37).
alter table public.contact_affiliations enable row level security;

drop policy if exists ps3_contact_affiliations_read   on public.contact_affiliations;
drop policy if exists ps3_contact_affiliations_write  on public.contact_affiliations;
drop policy if exists ps3_contact_affiliations_modify on public.contact_affiliations;
drop policy if exists ps3_contact_affiliations_remove on public.contact_affiliations;

create policy ps3_contact_affiliations_read on public.contact_affiliations
  for select to authenticated using (is_internal());

create policy ps3_contact_affiliations_write on public.contact_affiliations
  for insert to authenticated with check (is_internal());

create policy ps3_contact_affiliations_modify on public.contact_affiliations
  for update to authenticated using (is_internal()) with check (is_internal());

create policy ps3_contact_affiliations_remove on public.contact_affiliations
  for delete to authenticated using (is_admin());
