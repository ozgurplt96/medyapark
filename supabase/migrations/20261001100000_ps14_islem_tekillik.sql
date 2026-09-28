-- =====================================================================
-- PS14 — işlem tekillik anahtarı (güvenli yeniden deneme) (EKLEMELİ)
--
-- Sorun (S13 B10): oluşturma isteği sunucuda COMMIT olup yanıt istemciye
-- ulaşmazsa, kullanıcının aynı formu yeniden göndermesi ikinci bir iş,
-- yerleşim, işlem ya da belge (ve ikinci Hareket) üretiyordu.
--
-- Çözüm: her oluşturma GİRİŞİMİ istemcide bir anahtar (uuid) taşır; aynı
-- girişimin tekrarları aynı anahtarı gönderir. Sunucu:
--   · anahtarı iş verisiyle AYNI işlemde (transaction) kaydeder;
--   · işlem başarısızsa anahtar da geri alınır (anahtar kilitlenmez);
--   · başarılı bir girişimin tekrarına ilk sonucu döndürür — ikinci kayıt,
--     ikinci Hareket, ikinci dosya bağlantısı oluşmaz;
--   · aynı anahtarla FARKLI içerik gelirse reddeder (sessizce kabul etmez);
--   · eşzamanlı iki aynı istekte ikincisi benzersiz anahtar üzerinde bekler
--     ve ilkinin sonucunu alır;
--   · kapsam: ekip üyesi + işlem türü; sonuç döndürülmeden önce güncel iç
--     kullanıcı yetkisi yeniden denetlenir.
--
-- Mevcut RPC'ler DEĞİŞTİRİLMEDİ: gövdeleri aynen yeniden adlandırılıp
-- `_…_yap` olarak kalır; aynı adla ince bir sarmalayıcı eklenir. Anahtarsız
-- çağrı (p_islem null) eski davranışın aynısıdır. Toplu mecra kaydının
-- ya hep ya hiç ve çakışma kuralları sarmalayıcıdan etkilenmez.
-- =====================================================================

create table if not exists public.islem_anahtarlari (
  team_id       bigint      not null references public.team(id) on delete cascade,
  tur           text        not null,
  anahtar       uuid        not null,
  icerik_ozeti  text        not null,
  sonuc         jsonb,
  created_at    timestamptz not null default now(),
  primary key (team_id, tur, anahtar),
  constraint islem_anahtarlari_tur check (tur in
    ('job_create','media_placements_create','operations_batch_create','document_create'))
);
comment on table public.islem_anahtarlari is
  'PS14: oluşturma girişimlerinin tekillik anahtarı. İstemci doğrudan erişemez; yalnız SECURITY DEFINER yardımcılar. 7 günden eski satırlar kendiliğinden silinir.';
alter table public.islem_anahtarlari enable row level security;
revoke all on public.islem_anahtarlari from public, anon, authenticated;

-- Girişimi başlatır. NULL → yeni girişim (devam et); jsonb → önceki sonuç.
create or replace function public._islem_basla(p_tur text, p_anahtar uuid, p_ozet text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare t bigint; n int; r public.islem_anahtarlari%rowtype;
begin
  if p_anahtar is null then return null; end if;
  t := public.current_team_id();
  if t is null or not public.is_internal() then
    raise exception 'Bu işlem için yetkiniz yok.' using errcode = '42501';
  end if;
  delete from public.islem_anahtarlari where team_id = t and created_at < now() - interval '7 days';
  insert into public.islem_anahtarlari (team_id, tur, anahtar, icerik_ozeti)
  values (t, p_tur, p_anahtar, p_ozet)
  on conflict do nothing;
  get diagnostics n = row_count;
  if n = 1 then return null; end if;
  select * into r from public.islem_anahtarlari where team_id = t and tur = p_tur and anahtar = p_anahtar;
  if r.icerik_ozeti <> p_ozet then
    raise exception 'Bu işlem daha önce farklı içerikle gönderilmiş ve kaydedilmiş.'
      using errcode = 'PT409', hint = coalesce(r.sonuc::text, '');
  end if;
  return jsonb_build_object('sonuc', r.sonuc);
end $$;

create or replace function public._islem_bitir(p_tur text, p_anahtar uuid, p_sonuc jsonb)
returns void language sql security definer
set search_path = public, pg_temp as $$
  update public.islem_anahtarlari set sonuc = p_sonuc
   where p_anahtar is not null and team_id = public.current_team_id() and tur = p_tur and anahtar = p_anahtar;
$$;

-- Veri yazmadan dönen (ör. çakışma raporu) girişimin anahtarı serbest kalır.
create or replace function public._islem_vazgec(p_tur text, p_anahtar uuid)
returns void language sql security definer
set search_path = public, pg_temp as $$
  delete from public.islem_anahtarlari
   where p_anahtar is not null and team_id = public.current_team_id() and tur = p_tur and anahtar = p_anahtar;
$$;

revoke all on function public._islem_basla(text, uuid, text) from public, anon;
revoke all on function public._islem_bitir(text, uuid, jsonb) from public, anon;
revoke all on function public._islem_vazgec(text, uuid) from public, anon;
grant execute on function public._islem_basla(text, uuid, text) to authenticated;
grant execute on function public._islem_bitir(text, uuid, jsonb) to authenticated;
grant execute on function public._islem_vazgec(text, uuid) to authenticated;

-- Sonucu doğrulanamayan girişimi sorgular (yazmaz).
create or replace function public.islem_sonucu(p_tur text, p_anahtar uuid)
returns jsonb language plpgsql security definer stable
set search_path = public, pg_temp as $$
declare r public.islem_anahtarlari%rowtype;
begin
  if not public.is_internal() then
    raise exception 'Bu işlem için yetkiniz yok.' using errcode = '42501';
  end if;
  select * into r from public.islem_anahtarlari
   where team_id = public.current_team_id() and tur = p_tur and anahtar = p_anahtar;
  if not found then return jsonb_build_object('durum', 'yok'); end if;
  return jsonb_build_object('durum', 'tamam', 'sonuc', r.sonuc);
end $$;
revoke all on function public.islem_sonucu(text, uuid) from public, anon;
grant execute on function public.islem_sonucu(text, uuid) to authenticated;

-- ------------------------------------------------------------ job_create
do $$ begin
  if not exists (select 1 from pg_proc where proname = '_job_create_yap' and pronamespace = 'public'::regnamespace) then
    alter function public.job_create(jsonb, bigint[]) rename to _job_create_yap;
  end if;
end $$;
drop function if exists public.job_create(jsonb, bigint[], uuid);
create function public.job_create(p_job jsonb, p_followers bigint[], p_islem uuid default null)
returns bigint language plpgsql security invoker
set search_path = public, pg_temp as $$
declare o jsonb; v bigint;
begin
  o := public._islem_basla('job_create', p_islem, md5(jsonb_build_array(p_job, to_jsonb(p_followers))::text));
  if o is not null then return (o->>'sonuc')::bigint; end if;
  v := public._job_create_yap(p_job, p_followers);
  perform public._islem_bitir('job_create', p_islem, to_jsonb(v));
  return v;
end $$;

-- ------------------------------------------------ media_placements_create
do $$ begin
  if not exists (select 1 from pg_proc where proname = '_media_placements_create_yap' and pronamespace = 'public'::regnamespace) then
    alter function public.media_placements_create(jsonb, jsonb) rename to _media_placements_create_yap;
  end if;
end $$;
drop function if exists public.media_placements_create(jsonb, jsonb, uuid);
create function public.media_placements_create(p_common jsonb, p_targets jsonb, p_islem uuid default null)
returns jsonb language plpgsql security invoker
set search_path = public, pg_temp as $$
declare o jsonb; v jsonb;
begin
  o := public._islem_basla('media_placements_create', p_islem, md5(jsonb_build_array(p_common, p_targets)::text));
  if o is not null then return o->'sonuc'; end if;
  v := public._media_placements_create_yap(p_common, p_targets);
  if coalesce((v->>'ok')::boolean, false) then
    perform public._islem_bitir('media_placements_create', p_islem, v);
  else
    perform public._islem_vazgec('media_placements_create', p_islem);   -- çakışma raporu: hiçbir şey yazılmadı
  end if;
  return v;
end $$;

-- ------------------------------------------------ operations_batch_create
do $$ begin
  if not exists (select 1 from pg_proc where proname = '_operations_batch_create_yap' and pronamespace = 'public'::regnamespace) then
    alter function public.operations_batch_create(bigint, jsonb, jsonb, jsonb) rename to _operations_batch_create_yap;
  end if;
end $$;
drop function if exists public.operations_batch_create(bigint, jsonb, jsonb, jsonb, uuid);
create function public.operations_batch_create(p_job bigint, p_rows jsonb, p_docs jsonb default '[]'::jsonb,
                                               p_package jsonb default null, p_islem uuid default null)
returns jsonb language plpgsql security invoker
set search_path = public, pg_temp as $$
declare o jsonb; v jsonb;
begin
  o := public._islem_basla('operations_batch_create', p_islem,
         md5(jsonb_build_array(p_job, p_rows, p_docs, p_package)::text));
  if o is not null then return o->'sonuc'; end if;
  v := public._operations_batch_create_yap(p_job, p_rows, p_docs, p_package);
  perform public._islem_bitir('operations_batch_create', p_islem, v);
  return v;
end $$;

-- --------------------------------------------------------- document_create
-- entry_create_with_documents ve _operations_batch_create_yap bu adı tek
-- argümanla çağırır; varsayılan p_islem = null ile eski davranış sürer.
do $$ begin
  if not exists (select 1 from pg_proc where proname = '_document_create_yap' and pronamespace = 'public'::regnamespace) then
    alter function public.document_create(jsonb) rename to _document_create_yap;
  end if;
end $$;
drop function if exists public.document_create(jsonb, uuid);
create function public.document_create(p_docs jsonb, p_islem uuid default null)
returns jsonb language plpgsql security invoker
set search_path = public, pg_temp as $$
declare o jsonb; v jsonb;
begin
  o := public._islem_basla('document_create', p_islem, md5(p_docs::text));
  if o is not null then return o->'sonuc'; end if;
  v := public._document_create_yap(p_docs);
  perform public._islem_bitir('document_create', p_islem, v);
  return v;
end $$;

revoke all on function public.job_create(jsonb, bigint[], uuid) from public, anon;
revoke all on function public.media_placements_create(jsonb, jsonb, uuid) from public, anon;
revoke all on function public.operations_batch_create(bigint, jsonb, jsonb, jsonb, uuid) from public, anon;
revoke all on function public.document_create(jsonb, uuid) from public, anon;
grant execute on function public.job_create(jsonb, bigint[], uuid) to authenticated;
grant execute on function public.media_placements_create(jsonb, jsonb, uuid) to authenticated;
grant execute on function public.operations_batch_create(bigint, jsonb, jsonb, jsonb, uuid) to authenticated;
grant execute on function public.document_create(jsonb, uuid) to authenticated;

comment on function public._job_create_yap(jsonb, bigint[]) is 'PS14: eski job_create gövdesi; job_create sarmalayıcısı çağırır.';
comment on function public._media_placements_create_yap(jsonb, jsonb) is 'PS14: eski media_placements_create gövdesi.';
comment on function public._operations_batch_create_yap(bigint, jsonb, jsonb, jsonb) is 'PS14: eski operations_batch_create gövdesi.';
comment on function public._document_create_yap(jsonb) is 'PS14: eski document_create gövdesi.';

-- ------------------------------------------- yarım kalmış belge yüklemeleri
-- Depoya yüklenmiş ama hiçbir belge kaydına bağlanmamış (form kapanırken
-- temizlenememiş) nesneler. Yalnız çağıranın kendi yüklemeleri (yönetici:
-- tümü), 2 saatten eski olanlar. Silme depo politikasıyla sınırlıdır:
-- belge kaydına bağlı bir nesne bu yoldan SİLİNEMEZ.
create or replace function public.yarim_yuklemeler()
returns table (name text, created_at timestamptz, boyut bigint)
language sql stable security invoker
set search_path = public, storage, pg_temp as $$
  select o.name, o.created_at, coalesce((o.metadata->>'size')::bigint, 0)
    from storage.objects o
   where o.bucket_id = 'documents'
     and (public.is_admin() or o.owner_id = auth.uid()::text)
     and o.created_at < now() - interval '2 hours'
     and not exists (select 1 from public.documents d
                      where d.storage_bucket = 'documents' and d.storage_path = o.name)
   order by o.created_at
   limit 200;
$$;
revoke all on function public.yarim_yuklemeler() from public, anon;
grant execute on function public.yarim_yuklemeler() to authenticated;

notify pgrst, 'reload schema';
