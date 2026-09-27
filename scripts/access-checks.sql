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

  raise notice '--- 7/7 DENETİM GEÇTİ ---';
end $$;
