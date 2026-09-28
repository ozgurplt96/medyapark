-- =====================================================================
-- Erişim ve bütünlük — değişmez (invariant) denetimleri (Sprint 13)
--
-- SALT OKUNUR. Hiçbir satır yazmaz/silmez. Hem çalışma DB'sinde hem
-- atılabilir test yığınında çalıştırılabilir. Çalışma zamanı davranışı
-- (gerçek rollerle istek) tests/e2e/05_erisim_oturum.spec.mjs içindedir;
-- bu dosya şemanın o davranışı sağlayan parçalarının yerinde olduğunu
-- doğrular.
--
-- Çalıştırma (PowerShell borusu UTF-8'i BOZAR — dosya kopyalanır):
--   docker cp scripts\access-checks.sql supabase_db_medyapark:/tmp/ac.sql
--   docker exec supabase_db_medyapark psql -U postgres -d postgres -f /tmp/ac.sql
-- Herhangi bir denetim düşerse `exception` ile durur.
-- =====================================================================
\set ON_ERROR_STOP on

do $$
declare v int; t text;
begin
  ---------------------------------------------------------------- 1
  -- public şemasındaki her tabloda RLS açık.
  select count(*), string_agg(c.relname, ', ') into v, t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v > 0 then raise exception 'DENETİM 1 DÜŞTÜ: RLS kapalı tablo(lar): %', t; end if;
  raise notice 'DENETİM 1 ✓ tüm public tablolarda RLS açık';

  ---------------------------------------------------------------- 2
  -- Koşulsuz (true) ya da anonim politikalar YALNIZ public site içeriğinde.
  select count(*), string_agg(distinct tablename, ', ') into v, t
    from pg_policies
   where schemaname = 'public'
     and (qual = 'true' or with_check = 'true' or roles::text like '%anon%')
     and tablename not in ('alt_mecralar','mecralar','pages','products','settings','units',
                           'tuyap_ayarlar','tuyap_gruplar','tuyap_noktalar',
                           'aboneler','leads');           -- son ikisi yalnız INSERT (form)
  if v > 0 then raise exception 'DENETİM 2 DÜŞTÜ: iç tabloda koşulsuz/anonim politika: %', t; end if;
  select count(*) into v from pg_policies
   where schemaname = 'public' and tablename in ('aboneler','leads') and cmd <> 'INSERT' and roles::text like '%anon%';
  if v > 0 then raise exception 'DENETİM 2 DÜŞTÜ: aboneler/leads anonim okunabiliyor'; end if;
  raise notice 'DENETİM 2 ✓ anonim erişim yalnız public içerik ve form ekleme';

  ---------------------------------------------------------------- 3
  -- media_schedule görünümü çağıranın yetkisiyle çalışır (S13 B01):
  -- aksi halde görünüm sahibinin yetkisiyle RLS'i atlar.
  select count(*) into v from pg_class
   where oid = 'public.media_schedule'::regclass
     and coalesce(reloptions::text, '') like '%security_invoker=true%';
  if v <> 1 then raise exception 'DENETİM 3 DÜŞTÜ: media_schedule security_invoker değil'; end if;
  if has_table_privilege('anon', 'public.media_schedule', 'select') then
    raise exception 'DENETİM 3 DÜŞTÜ: anon media_schedule okuyabiliyor'; end if;
  raise notice 'DENETİM 3 ✓ media_schedule RLS''e tabi';

  ---------------------------------------------------------------- 4
  -- media deposuna yazma yalnız aktif iç kullanıcı (S13 B02).
  select count(*) into v from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('media_authenticated_insert','media_authenticated_update','media_authenticated_delete');
  if v > 0 then raise exception 'DENETİM 4 DÜŞTÜ: eski "her oturum yazar" medya politikası duruyor'; end if;
  select count(*) into v from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT','UPDATE','DELETE')
     and policyname like 'media_%' and coalesce(qual, with_check) not like '%is_internal()%'
     and coalesce(with_check, qual) not like '%is_internal()%';
  if v > 0 then raise exception 'DENETİM 4 DÜŞTÜ: medya yazma politikası is_internal() istemiyor'; end if;
  raise notice 'DENETİM 4 ✓ medya deposuna yazma iç kullanıcıya kısıtlı';

  ---------------------------------------------------------------- 5
  -- approve_quote anonim çağrılamaz (S13 B03).
  if has_function_privilege('anon', 'public.approve_quote(bigint)', 'execute') then
    raise exception 'DENETİM 5 DÜŞTÜ: anon approve_quote çalıştırabiliyor'; end if;
  raise notice 'DENETİM 5 ✓ approve_quote anonim çağrılamaz';

  ---------------------------------------------------------------- 6
  -- Kuruma bağlı her kişinin en az bir bağlantısı var (S13 B04): aksi
  -- halde kişi kurum sayfasında görünmez.
  select count(*) into v from public.contacts c
   where c.customer_id is not null
     and not exists (select 1 from public.contact_affiliations a where a.contact_id = c.id);
  if v > 0 then raise exception 'DENETİM 6 DÜŞTÜ: % kişi kurumuna bağlantısız', v; end if;
  raise notice 'DENETİM 6 ✓ kuruma bağlı her kişinin bağlantısı var';

  ---------------------------------------------------------------- 7
  -- Paket bedeli değişikliği güvenilir Hareket üretir.
  select count(*) into v from pg_trigger
   where tgrelid = 'public.operation_price_groups'::regclass and not tgisinternal and tgname = 'trg_paket_hareket';
  if v <> 1 then raise exception 'DENETİM 7 DÜŞTÜ: paket Hareket tetikleyicisi yok'; end if;
  raise notice 'DENETİM 7 ✓ paket bedeli Hareket tetikleyicisi yerinde';

  ---------------------------------------------------------------- 8
  -- PS14: işlem tekillik anahtarları istemciye kapalı (RLS açık, doğrudan
  -- yetki yok); dört oluşturma yolu anahtar kabul eder.
  select count(*) into v from pg_class where oid = 'public.islem_anahtarlari'::regclass and relrowsecurity;
  if v <> 1 then raise exception 'DENETİM 8 DÜŞTÜ: islem_anahtarlari RLS kapalı'; end if;
  select count(*) into v from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'islem_anahtarlari' and grantee in ('anon', 'authenticated');
  if v > 0 then raise exception 'DENETİM 8 DÜŞTÜ: islem_anahtarlari istemciye açık (% yetki)', v; end if;
  select count(*) into v from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('job_create', 'media_placements_create', 'operations_batch_create', 'document_create')
     and pg_get_function_identity_arguments(oid) like '%p_islem uuid';
  if v <> 4 then raise exception 'DENETİM 8 DÜŞTÜ: % / 4 oluşturma yolu anahtar kabul ediyor', v; end if;
  raise notice 'DENETİM 8 ✓ işlem tekillik anahtarı yerinde ve istemciye kapalı';

  ---------------------------------------------------------------- 9
  -- PS14: yönetim kayıtlarında sürüm damgası (koşullu kayıt) tetikleyicisi.
  select count(*) into v from pg_trigger
   where tgname = 'trg_surum_damgasi' and not tgisinternal
     and tgrelid in ('public.suppliers'::regclass, 'public.products'::regclass, 'public.pages'::regclass, 'public.notes'::regclass);
  if v <> 4 then raise exception 'DENETİM 9 DÜŞTÜ: sürüm damgası % / 4 tabloda', v; end if;
  raise notice 'DENETİM 9 ✓ yönetim kayıtlarında sürüm damgası yerinde';

  ---------------------------------------------------------------- 10
  -- PS14c: dosyasız belge oluşamaz — dosya yalnız hiçbir belge ona işaret
  -- etmiyorsa silinebilir (kilitli, taze okuma); belge kaydı önce silinir.
  select count(*) into v from pg_proc
   where oid = 'public._belge_nesnesi_silinebilir(text)'::regprocedure
     and provolatile = 'v' and prosrc like '%pg_advisory_xact_lock%' and prosrc not like '%detached_at%';
  if v <> 1 then raise exception 'DENETİM 10 DÜŞTÜ: dosya silme koruması eski kuralda'; end if;
  select count(*) into v from pg_proc
   where oid = 'public._trg_documents_ekle()'::regprocedure and prosrc like '%pg_advisory_xact_lock%';
  if v <> 1 then raise exception 'DENETİM 10 DÜŞTÜ: belge kaydı dosya kilidini almıyor'; end if;
  select count(*) into v from pg_policies
   where tablename = 'documents' and policyname = 's6_documents_remove' and qual like '%_belge_nesnesi_yok%';
  if v <> 0 then raise exception 'DENETİM 10 DÜŞTÜ: belge silme hâlâ "önce dosya" sırasına bağlı'; end if;
  raise notice 'DENETİM 10 ✓ belge dosyası bütünlüğü (kilit + önce kayıt)';

  raise notice '--- 10/10 DENETİM GEÇTİ ---';
end $$;
