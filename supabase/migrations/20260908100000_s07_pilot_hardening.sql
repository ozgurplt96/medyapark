-- =====================================================================
-- Sprint 07 — Pilot hardening: public quote RPC + admin/team_member
--             server-side boundary
-- ---------------------------------------------------------------------
-- Canonical basis:
--   06_DATA_MODEL_AND_MIGRATION_SPEC_v1.0  §19 (RLS pilot minimum), §24
--   07_VIEWS_AND_UX_SPEC_v1.0              §2.2 (admin surface), §10
--                                          (team read-only media), §16
--   09_V0_SPRINT_PLAN_v1.0                 Sprint 07
--   11_PRODUCTION_PILOT_CHECKLIST_v1.0     §B
--   05_DECISION_LOG_v2.1                   D-203, D-215, D-230, D-232
--
-- Two things this migration closes:
--
--  1. The public quote request was BROKEN and is fixed without widening
--     anon read. site.js did `.insert(...).select('id')`, and RETURNING
--     needs a SELECT policy anon does not (and must not) have. The fix is
--     one narrowly-scoped SECURITY DEFINER RPC that validates the
--     request, writes quote + items atomically, and returns ONLY the new
--     reference id. Anon INSERT on quotes/quote_items is then REVOKED, so
--     the public surface shrinks rather than grows.
--
--  2. UI route hiding is not authorization (08 §9). The admin vs
--     team_member boundary is enforced here, in RLS.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Public quote request — one transactional RPC       (09 Sprint 07)
-- ---------------------------------------------------------------------
create or replace function public.submit_quote_request(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_name   text := nullif(btrim(coalesce(p_payload->>'customer_name','')),'');
  v_firma  text := nullif(btrim(coalesce(p_payload->>'firma','')),'');
  v_tel    text := nullif(btrim(coalesce(p_payload->>'telefon','')),'');
  v_mail   text := nullif(btrim(coalesce(p_payload->>'eposta','')),'');
  v_items  jsonb := coalesce(p_payload->'items','[]'::jsonb);
  v_n      int;
  v_quote  bigint;
  v_total  numeric(14,2) := 0;
  it       jsonb;
begin
  ------------------------------------------------------------ validation
  if jsonb_typeof(v_items) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'items_invalid');
  end if;

  v_n := jsonb_array_length(v_items);
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'error', 'items_empty');
  end if;
  if v_n > 200 then
    return jsonb_build_object('ok', false, 'error', 'items_too_many');
  end if;

  -- Somebody must be reachable, and the request must name someone.
  if v_tel is null and v_mail is null then
    return jsonb_build_object('ok', false, 'error', 'contact_required');
  end if;
  if v_name is null and v_firma is null then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;

  -- Length caps: this is an unauthenticated write path.
  if length(coalesce(v_name,''))  > 120 or length(coalesce(v_firma,'')) > 200
     or length(coalesce(v_tel,'')) > 40 or length(coalesce(v_mail,''))  > 160 then
    return jsonb_build_object('ok', false, 'error', 'field_too_long');
  end if;

  -- Every line must point at a real, commercially active unit and a
  -- well-formed month. This stops the public endpoint being used to
  -- probe for unit ids or to store arbitrary text.
  for it in select * from jsonb_array_elements(v_items) loop
    if (it->>'unit_id') is null
       or not exists (select 1 from units u
                      where u.id = (it->>'unit_id')::bigint and u.active) then
      return jsonb_build_object('ok', false, 'error', 'unit_invalid');
    end if;
    if coalesce(it->>'ym','') !~ '^\d{4}-\d{2}$' then
      return jsonb_build_object('ok', false, 'error', 'ym_invalid');
    end if;
  end loop;

  ------------------------------------------------------------- insert
  -- Total is recomputed from the lines rather than trusted from the
  -- caller, so a submitted request is at least internally consistent.
  select coalesce(sum(greatest(0, least(coalesce((e->>'price')::numeric, 0), 99999999))), 0)
    into v_total
  from jsonb_array_elements(v_items) e;

  insert into quotes (customer_name, firma, telefon, eposta, total, status, kaynak)
  values (v_name, v_firma, v_tel, v_mail, v_total, 'yeni', 'site')
  returning id into v_quote;

  insert into quote_items
    (quote_id, unit_id, ym, mecra_name, unit_name, product_name, olcu, start_day, period, price, adet)
  select v_quote,
         (e->>'unit_id')::bigint,
         e->>'ym',
         left(coalesce(e->>'mecra_name',''),   200),
         left(coalesce(e->>'unit_name',''),    200),
         left(coalesce(e->>'product_name',''), 200),
         left(coalesce(e->>'olcu',''),         100),
         nullif(e->>'start_day','')::date,
         left(coalesce(e->>'period',''),       100),
         greatest(0, least(coalesce((e->>'price')::numeric, 0), 99999999)),
         1
  from jsonb_array_elements(v_items) e;

  -- Only the reference id leaves this function. No row, no customer
  -- data, no internal state.
  return jsonb_build_object('ok', true, 'quote_id', v_quote);
exception
  when others then
    -- Never leak internal SQL detail to an anonymous caller.
    raise warning 'submit_quote_request failed: % %', sqlstate, sqlerrm;
    return jsonb_build_object('ok', false, 'error', 'server_error');
end
$function$;

comment on function public.submit_quote_request(jsonb) is
  'Only sanctioned public write path for quote requests. SECURITY DEFINER because anon has no INSERT on quotes/quote_items and must never gain SELECT. Validates, writes atomically, returns nothing but the new reference id.';

revoke all on function public.submit_quote_request(jsonb) from public;
grant execute on function public.submit_quote_request(jsonb) to anon, authenticated;

-- The direct anon INSERT path is now redundant AND weaker than the RPC
-- (no validation, no atomicity, and it could not read its own id back).
drop policy if exists quotes_insert      on public.quotes;
drop policy if exists quote_items_insert on public.quote_items;


-- ---------------------------------------------------------------------
-- 2. admin vs team_member — enforced in RLS, not in the UI  (11 §B)
-- ---------------------------------------------------------------------
-- Shape used throughout:
--   SELECT           -> is_internal()   (broad Workspace visibility, 06 §19)
--   INSERT/UPDATE    -> is_internal() on Workspace-owned domains
--                       is_admin()    on Admin-owned domains
--   DELETE           -> is_admin()     everywhere
--                       ("admin/destructive capability", 06 §19)

-- NAMING NOTE: new policies use an `s07_` prefix. The pre-existing public
-- read policies are called products_read / mecralar_read / units_read /
-- pages_read / settings_read / alt_read, so a generic `<table>_read` name
-- would COLLIDE with them — dropping the anon policy and silently taking
-- the public site's data away. The prefix keeps the two sets disjoint.

-- 2a. Workspace-owned: the team coordinates here every day.
do $mig$
declare t text;
begin
  foreach t in array array['customers','contacts','jobs','work_parties','entries','work_operations']
  loop
    execute format('drop policy if exists %I on public.%I', t||'_internal', t);
    execute format('drop policy if exists %I on public.%I', 's07_'||t||'_read',   t);
    execute format('drop policy if exists %I on public.%I', 's07_'||t||'_write',  t);
    execute format('drop policy if exists %I on public.%I', 's07_'||t||'_modify', t);
    execute format('drop policy if exists %I on public.%I', 's07_'||t||'_remove', t);

    execute format('create policy %I on public.%I for select to authenticated using (public.is_internal())', 's07_'||t||'_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_internal())', 's07_'||t||'_write', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_internal()) with check (public.is_internal())', 's07_'||t||'_modify', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', 's07_'||t||'_remove', t);
  end loop;
end
$mig$;

-- 2b. Admin-owned, INTERNAL-ONLY read: booking authority, commercial
--     documents, team administration, supplier + note modules.
do $mig$
declare t text;
begin
  foreach t in array array['bookings','suppliers','team','quotes','quote_items','leads','notes']
  loop
    execute format('drop policy if exists %I on public.%I', t||'_internal', t);
    execute format('drop policy if exists %I on public.%I', 's07_'||t||'_read',   t);
    execute format('drop policy if exists %I on public.%I', 's07_'||t||'_write',  t);
    execute format('drop policy if exists %I on public.%I', 's07_'||t||'_modify', t);
    execute format('drop policy if exists %I on public.%I', 's07_'||t||'_remove', t);

    execute format('create policy %I on public.%I for select to authenticated using (public.is_internal())', 's07_'||t||'_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', 's07_'||t||'_write', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', 's07_'||t||'_modify', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', 's07_'||t||'_remove', t);
  end loop;
end
$mig$;

-- 2c. Admin-owned but PUBLICLY READABLE: media inventory and site
--     content. The existing anon SELECT policies are left completely
--     untouched — the public site depends on them — and only the write
--     side is tightened to admin. 07 §10 is explicit that a team member
--     neither edits inventory structure, nor bypasses booking authority,
--     nor deactivates units.
do $mig$
declare t text;
begin
  foreach t in array array['units','mecralar','alt_mecralar','products','pages','settings',
                           'tuyap_ayarlar','tuyap_gruplar','tuyap_noktalar']
  loop
    execute format('drop policy if exists %I on public.%I', t||'_internal', t);
    execute format('drop policy if exists %I on public.%I', 's07_'||t||'_write',  t);
    execute format('drop policy if exists %I on public.%I', 's07_'||t||'_modify', t);
    execute format('drop policy if exists %I on public.%I', 's07_'||t||'_remove', t);

    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', 's07_'||t||'_write', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', 's07_'||t||'_modify', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', 's07_'||t||'_remove', t);
  end loop;
end
$mig$;

-- Guard rail: the public site must keep its anon SELECT policies. If any
-- went missing the pilot would ship a blank site, so fail the migration
-- loudly rather than discover it in the browser.
do $mig$
declare missing text;
begin
  select string_agg(t, ', ') into missing
  from unnest(array['products','mecralar','alt_mecralar','units','pages','settings']) t
  where not exists (
    select 1 from pg_policies p
    where p.schemaname='public' and p.tablename=t
      and p.cmd in ('SELECT','ALL') and 'anon' = any(p.roles));
  if missing is not null then
    raise exception 'S07: public anon SELECT policy missing on: %', missing;
  end if;
end
$mig$;

-- 2c. activity_log: any active internal user may APPEND (the panel writes
--     a login line), but only an admin may prune or alter it. An audit
--     trail a team member can rewrite is not an audit trail (BR-AUD01).
drop policy if exists activity_log_internal  on public.activity_log;
drop policy if exists s07_activity_log_read   on public.activity_log;
drop policy if exists s07_activity_log_write  on public.activity_log;
drop policy if exists s07_activity_log_modify on public.activity_log;
drop policy if exists s07_activity_log_remove on public.activity_log;

create policy s07_activity_log_read   on public.activity_log for select to authenticated using (public.is_internal());
create policy s07_activity_log_write  on public.activity_log for insert to authenticated with check (public.is_internal());
create policy s07_activity_log_modify on public.activity_log for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy s07_activity_log_remove on public.activity_log for delete to authenticated using (public.is_admin());

-- Public read paths (anon) are deliberately UNCHANGED:
--   products_read / mecralar_read / alt_read / units_read / pages_read /
--   settings_read / tuyap_* read  -> the public site needs them
--   leads_insert                  -> public planning request
--   booking_availability_public   -> occupancy without identity
