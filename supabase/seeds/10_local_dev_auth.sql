-- =====================================================================
-- LOCAL DEVELOPMENT LOGIN — bu dosya Git'e commit EDİLİR.
-- ---------------------------------------------------------------------
-- Amaç: repoyu yeni klonlayan bir geliştiricinin, elinde hiçbir gerçek
-- şirket verisi veya gerçek hesap olmadan panele girip çalışabilmesi.
--
-- GÜVENLİK SÖZLEŞMESİ
--   * Bu hesap YALNIZ local Supabase stack'inde (127.0.0.1) vardır.
--   * Production Auth'ta bu e-posta bulunmaz ve bulunmamalıdır.
--   * Şifre bilerek herkese açıktır; `postgres:postgres` ile aynı statüde
--     bir local development kolaylığıdır, gizli bilgi değildir.
--   * Bu dosya ASLA remote'a uygulanmaz. Local seed'ler yalnız
--     `supabase db reset` ile çalışır ve `--linked` reset yasaktır.
--
--   E-posta : dev@medyapark.local
--   Şifre   : medyapark-local-dev
--
-- Idempotent: hesap zaten varsa hiçbir şey yapmaz, bu yüzden diğer
-- (git-excluded) local seed'lerle birlikte güvenle çalışır.
-- =====================================================================

do $$
declare
  v_id    uuid := '00000000-0000-4000-a000-000000000001';
  v_email text := 'dev@medyapark.local';
  v_pass  text := 'medyapark-local-dev';
begin
  if exists (select 1 from auth.users where email = v_email) then
    raise notice 'local dev user already present: %', v_email;
    return;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt(v_pass, extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{"email_verified":true}',
    now(), now(),
    '', '', '', '',
    false, false
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    created_at, updated_at, last_sign_in_at
  ) values (
    v_email, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  raise notice 'local dev user created: % / %', v_email, v_pass;
end $$;
