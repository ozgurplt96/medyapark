-- =====================================================================
-- Sprint 13 TEST KULLANICILARI — yalnız atılabilir test ortamında
-- (scripts/test-env.ps1) uygulanır. Seed dizininde DEĞİLDİR; çalışma
-- DB'sine asla girmez. Şifreler bilerek açıktır (yerel test).
--
--   s13-admin@test.local   admin
--   s13-uye@test.local     team_member (aktif)
--   s13-uye2@test.local    team_member (aktif)
--   s13-pasif@test.local   team_member, active=false
--   s13-disari@test.local  oturum açabilir, ekip kaydı YOK
--   Şifre (hepsi): s13-test-parola
-- İdempotent.
-- =====================================================================
do $$
declare
  r record;
begin
  -- Hedef doğrulaması: yalnız işaretli test DB'sinde çalışır.
  if coalesce(shobj_description((select oid from pg_database where datname = current_database()), 'pg_database'), '')
     <> 'medyapark-test-ortami' then
    raise exception 'Bu dosya yalnız test ortamında çalışır.';
  end if;

  for r in select * from (values
      ('00000000-0000-4000-a013-000000000001'::uuid, 's13-admin@test.local',  'S13 Admin',  'admin',       true,  true),
      ('00000000-0000-4000-a013-000000000002'::uuid, 's13-uye@test.local',    'S13 Üye',    'team_member', true,  true),
      ('00000000-0000-4000-a013-000000000003'::uuid, 's13-uye2@test.local',   'S13 Üye İki','team_member', true,  true),
      ('00000000-0000-4000-a013-000000000004'::uuid, 's13-pasif@test.local',  'S13 Pasif',  'team_member', false, true),
      ('00000000-0000-4000-a013-000000000005'::uuid, 's13-disari@test.local', null,         null,          false, false)
    ) as v(uid, email, ad, rol, aktif, ekip)
  loop
    if not exists (select 1 from auth.users where id = r.uid) then
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user, is_anonymous)
      values ('00000000-0000-0000-0000-000000000000', r.uid, 'authenticated', 'authenticated', r.email,
        extensions.crypt('s13-test-parola', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', '{"email_verified":true}', now(), now(), '', '', '', '', false, false);
      insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
      values (r.email, r.uid, jsonb_build_object('sub', r.uid::text, 'email', r.email, 'email_verified', true),
        'email', now(), now(), now());
    end if;
    if r.ekip and not exists (select 1 from public.team where auth_user_id = r.uid) then
      insert into public.team (name, role, yetki, eposta, auth_user_id, app_role, active)
      values (r.ad, 'Test', r.rol, r.email, r.uid, r.rol, r.aktif);
    end if;
  end loop;

  -- Regresyon paketinin sentetik kurumu: testlerin yazdığı yerleşimler bu
  -- kuruma bağlanır ve her koşudan önce tek sorguyla temizlenir.
  if not exists (select 1 from public.customers where firma = 'S13 Regresyon Kurumu') then
    insert into public.customers (firma) values ('S13 Regresyon Kurumu');
  end if;

  -- Kişisel ajanda: yalnız sahibi görmeli.
  if not exists (select 1 from public.personal_events where title = 'S13 özel randevu') then
    insert into public.personal_events (team_id, title, event_date, event_time, note)
    select id, 'S13 özel randevu', date '2027-03-15', time '10:30', 'Yalnız S13 Üye görebilir'
      from public.team where eposta = 's13-uye@test.local';
  end if;
end $$;
