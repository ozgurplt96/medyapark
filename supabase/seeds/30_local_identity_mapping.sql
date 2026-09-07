-- =====================================================================
-- LOCAL IDENTITY MAPPING — SYNTHETIC DEV ACCOUNT ONLY
-- This file IS committed to Git.
-- ---------------------------------------------------------------------
-- Sprint 01 links auth.users -> public.team.auth_user_id and makes that
-- link the basis of every internal RLS policy (06 §4.2, §19). A local
-- database therefore needs at least one ACTIVE mapped team row, or the
-- panel logs in successfully and then sees nothing at all.
--
-- WHY THIS RUNS AT 30 AND NOT INSIDE 10_local_dev_auth.sql
--   seeds/20_company_data.sql loads the real team dump with an explicit
--   `INSERT INTO team (id, ...) VALUES (1, ...)` followed by
--   `setval('team_id_seq', 1, true)`. A team row inserted at step 10
--   would take id = 1 from the fresh sequence and make that INSERT fail
--   with a primary-key collision, breaking the whole company data load.
--   Running after 20 lets the sequence hand out the next free id.
--
-- SCOPE — this file maps the SYNTHETIC account only:
--   dev@medyapark.local -> app_role = 'team_member'   (A1 mapping)
--
-- Real people are deliberately NOT mapped here. Their mapping lives in
-- the git-excluded seeds/95_local_private_identity.sql, so that no real
-- identity is committed and no synthetic row can ever reach production
-- (CURRENT_PROJECT_STATE §8).
--
-- The existing legacy team row (Beyza) is intentionally left untouched
-- and unlinked, exactly as the approved A1 mapping requires.
--
-- Idempotent: safe to re-run and safe when the account does not exist.
-- =====================================================================

do $seed$
declare
  v_email text := 'dev@medyapark.local';
  v_uid   uuid;
  v_team  bigint;
begin
  select id into v_uid from auth.users where email = v_email;

  if v_uid is null then
    raise notice 'S01 mapping skipped: auth user % not present', v_email;
    return;
  end if;

  -- Already linked?
  select id into v_team from public.team where auth_user_id = v_uid;
  if v_team is not null then
    raise notice 'S01 mapping already present: % -> team.id=%', v_email, v_team;
    return;
  end if;

  -- An unlinked synthetic row may exist from an earlier run; adopt it
  -- rather than creating a duplicate.
  select id into v_team
  from public.team
  where lower(coalesce(eposta, '')) = v_email and auth_user_id is null
  limit 1;

  if v_team is not null then
    update public.team
       set auth_user_id = v_uid,
           app_role     = 'team_member',
           active       = true
     where id = v_team;
    raise notice 'S01 mapping adopted existing row: % -> team.id=%', v_email, v_team;
    return;
  end if;

  insert into public.team (name, role, yetki, eposta, auth_user_id, app_role, active)
  values ('Local Dev', 'Local Development', 'team_member', v_email, v_uid, 'team_member', true)
  returning id into v_team;

  raise notice 'S01 mapping created: % -> team.id=% (team_member)', v_email, v_team;
end
$seed$;
