-- =====================================================================
-- PS3 affiliation backfill replay for LOCAL resets. Committed to Git.
-- ---------------------------------------------------------------------
-- Same ordering asymmetry as seeds/40, seeds/50 and seeds/97:
-- `supabase db reset` applies MIGRATIONS to an EMPTY database and loads the
-- seeds afterwards, so the backfill inside
-- 20260914200000_ps3_contact_affiliations.sql is a no-op locally — there
-- were no contacts yet when it ran. Every contact created by a later seed
-- would otherwise have zero affiliations, and `contacts.customer_id` would
-- disagree with the (missing) primary affiliation.
--
-- In PRODUCTION the forward migration runs against populated tables and IS
-- the real backfill. This file only replays it locally.
--
-- Runs at 98: AFTER seeds/96 (demo fixture, which creates both plain
-- contacts and its own explicit affiliations) and after seeds/97.
--
-- Idempotent, and deliberately identical in logic to the migration's own
-- INSERT: one primary affiliation per contact that carries a customer_id,
-- skipped entirely when that pair already exists.
-- =====================================================================

insert into public.contact_affiliations (contact_id, customer_id, title, department, is_primary, active)
select c.id, c.customer_id, c.title, c.department, true, c.active
  from public.contacts c
 where c.customer_id is not null
   and not exists (
     select 1 from public.contact_affiliations a
      where a.contact_id = c.id and a.customer_id = c.customer_id);

do $seed$
declare v_contacts int; v_eligible int; v_affs int; v_primary int; v_mismatch int;
begin
  select count(*) into v_contacts from public.contacts;
  select count(*) into v_eligible from public.contacts where customer_id is not null;
  select count(*) into v_affs     from public.contact_affiliations;
  select count(*) into v_primary  from public.contact_affiliations where is_primary and active;

  -- The PS3 §9 compatibility rule, asserted rather than assumed:
  -- contacts.customer_id must equal the contact's primary+active affiliation.
  select count(*) into v_mismatch
    from public.contacts c
   where c.customer_id is distinct from (
     select a.customer_id from public.contact_affiliations a
      where a.contact_id = c.id and a.is_primary and a.active
      order by a.id limit 1);

  raise notice 'ps3 affiliation backfill: contacts=% eligible=% affiliations=% primary=% mirror_mismatch=%',
    v_contacts, v_eligible, v_affs, v_primary, v_mismatch;

  if v_mismatch > 0 then
    raise warning 'ps3: % contact(s) whose customer_id does not mirror their primary affiliation', v_mismatch;
  end if;
end $seed$;
