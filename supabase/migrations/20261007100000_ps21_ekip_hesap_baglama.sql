-- =====================================================================
-- PS21 — Ekip kaydını giriş hesabına bağlama (S20: temiz canlı kurulum)
--
-- İç erişim `auth.users.id → team.auth_user_id` bağıyla çalışır (06 §4.2);
-- e-posta metni yetki kaynağı DEĞİLDİR. Ancak bu bağı kurmanın uygulama
-- içinde hiçbir yolu yoktu: Ekip ekranından eklenen kişi, giriş hesabı açılmış
-- olsa bile içeri giremiyordu ve bağ yalnız elle SQL ile kurulabiliyordu.
--
-- Bu fonksiyon bağı YÖNETİCİNİN açık eylemiyle kurar:
--   · yalnız yönetici çağırabilir (is_admin());
--   · giriş hesabının kendisini OLUŞTURMAZ (auth şemasına yazmaz) — hesap
--     Supabase panelinden / yönetim betiğinden açılır;
--   · ekip kaydındaki e-postayla açılmış, e-postası ONAYLI hesabı bulur ve
--     kimliğiyle bağlar; sonrasında yetki yine kimlik üzerinden okunur;
--   · bir hesap yalnız bir ekip kaydına bağlanabilir.
-- Var olan bağ değiştirilmez (yanlışlıkla başka hesaba geçiş olmaz); erişimi
-- kapatmak için ekip kaydı pasife alınır.
-- İdempotent. Eklemelidir; önceki migration'lar düzenlenmedi.
-- =====================================================================
create or replace function public.ekip_hesap_bagla(p_team_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare t record; u record;
begin
  if not public.is_admin() then
    raise exception 'Bu işlem için yönetici olmalısınız.' using errcode = '42501';
  end if;
  select id, eposta, auth_user_id into t from public.team where id = p_team_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'neden', 'kayit_yok');
  end if;
  if t.auth_user_id is not null then
    return jsonb_build_object('ok', true, 'durum', 'zaten_bagli');
  end if;
  if coalesce(btrim(t.eposta), '') = '' then
    return jsonb_build_object('ok', false, 'neden', 'eposta_yok');
  end if;
  select au.id, au.email_confirmed_at into u
    from auth.users au where lower(au.email) = lower(btrim(t.eposta)) limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'neden', 'hesap_yok');
  end if;
  if u.email_confirmed_at is null then
    return jsonb_build_object('ok', false, 'neden', 'hesap_onaysiz');
  end if;
  if exists (select 1 from public.team x where x.auth_user_id = u.id and x.id <> p_team_id) then
    return jsonb_build_object('ok', false, 'neden', 'baska_uyede');
  end if;
  update public.team set auth_user_id = u.id where id = p_team_id;
  return jsonb_build_object('ok', true, 'durum', 'baglandi');
end $$;

comment on function public.ekip_hesap_bagla(bigint) is
  'Yönetici eylemi: ekip kaydını, e-postasıyla açılmış ONAYLI giriş hesabına kimlik üzerinden bağlar. Hesap oluşturmaz; var olan bağı değiştirmez.';

revoke all on function public.ekip_hesap_bagla(bigint) from public, anon;
grant execute on function public.ekip_hesap_bagla(bigint) to authenticated;
