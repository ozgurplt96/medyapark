-- =====================================================================
-- Correction Sprint 2 — narrow self-profile update seam
-- ---------------------------------------------------------------------
-- PROBLEM
--   `team` RLS (s07_team_modify) is is_admin() for both USING and
--   WITH CHECK, so a team_member cannot update even their OWN row.
--   Correction Sprint 1 therefore had to render Profilim read-only,
--   and logged that as open debt.
--
-- WHY NOT "just relax the RLS policy"
--   PostgreSQL RLS is ROW level, not COLUMN level. A policy that lets a
--   user update their own row would also let them set app_role='admin',
--   active, eposta or auth_user_id on that same row — i.e. privilege
--   escalation and identity takeover. Column GRANTs could express this,
--   but they interact awkwardly with PostgREST and would require
--   revoking the existing blanket UPDATE. The smallest provably safe
--   seam is a narrowly scoped SECURITY DEFINER function whose SET list
--   is fixed at authoring time.
--
-- WHAT THIS ADDS
--   public.update_my_profile(name, unvan, telefon, photo, notlar)
--     * caller is resolved ONLY from auth.uid() — there is no row id
--       parameter, so another user's row is not addressable at all;
--     * only the five canonical "safe profile" columns appear in the
--       SET list, so app_role / active / eposta / auth_user_id / seviye
--       are structurally unreachable through this path;
--     * requires the caller's linked team row to be active;
--     * pinned search_path; EXECUTE granted to `authenticated` only.
--
-- PARAMETER CONTRACT
--   NULL  = leave this column unchanged
--   ''    = clear this column (name excepted: it is NOT NULL, so a
--           blank name is ignored and the existing name is kept)
--   This lets each UI control own only its own fields: the profile form
--   sends name/unvan/telefon/photo and NULL for notlar, while the
--   Not Defteri card sends only notlar. Neither can wipe the other.
--
--   Existing RLS is NOT weakened: every policy on public.team is left
--   exactly as Sprint 07 created it. Admin team-management continues to
--   flow through the normal is_admin() UPDATE path.
--
-- SCOPE
--   LOCAL DEVELOPMENT MIGRATION. Production is NOT altered by this file
--   (Sprint 08B remains frozen). When this reaches the production
--   package it must be reviewed as its own forward migration.
-- =====================================================================

create or replace function public.update_my_profile(
  p_name    text default null,
  p_unvan   text default null,
  p_telefon text default null,
  p_photo   text default null,
  p_notlar  text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_name,'')),'');
  v_id   bigint;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- Only the caller's own, active, linked profile row. No id parameter
  -- exists, so this cannot be pointed at anybody else's row.
  -- NULL = leave unchanged, '' = clear (see PARAMETER CONTRACT above).
  update public.team t
     set name    = coalesce(v_name, t.name),      -- name is NOT NULL; never blanked
         unvan   = case when p_unvan   is null then t.unvan   else nullif(p_unvan,'')   end,
         telefon = case when p_telefon is null then t.telefon else nullif(p_telefon,'') end,
         photo   = case when p_photo   is null then t.photo   else nullif(p_photo,'')   end,
         notlar  = case when p_notlar  is null then t.notlar  else nullif(p_notlar,'')  end
   where t.auth_user_id = v_uid
     and t.active
  returning t.id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_active_profile');
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end
$$;

comment on function public.update_my_profile(text,text,text,text,text) is
  'Correction Sprint 2: lets an authenticated internal user edit ONLY the safe '
  'fields of their OWN active team row (name, unvan, telefon, photo, notlar). '
  'Role, active flag, e-mail and auth mapping are unreachable through this '
  'function by construction. team RLS is unchanged.';

revoke all on function public.update_my_profile(text,text,text,text,text) from public;
revoke all on function public.update_my_profile(text,text,text,text,text) from anon;
grant execute on function public.update_my_profile(text,text,text,text,text) to authenticated;
