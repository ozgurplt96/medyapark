-- =====================================================================
-- PS9 — Mecra doluluk senaryo fixture'i (COMMIT'Lİ, sentetik)
--
-- PS9 kapanış §1 ile Git'e ALINDI. Gerekçe: taşınabilirliğin özel,
-- sürümlenmeyen dosyalara bağlı olmaması gerekir. Bu dosya ŞİRKET
-- VERİSİ İÇERMEZ:
--   · Özel demo fixture'i yüklüyse onun işlerine REFERANS verir.
--   · Yüklü değilse (temiz klon) açıkça "(demo)" etiketli SENTETİK
--     kurum ve işler oluşturur.
-- Her iki yolda da aynı senaryo kümesini kurar.
--
-- AMAÇ: uygulama DÜZGÜN KULLANILDIĞINDA doluluk takviminin ne
-- göstereceğini kanıtlamak. Kayıtlar gerçek operasyon geçmişi DEĞİLDİR
-- ve öyle sunulmaz; eski Excel dolulukları "anlamlandırılarak" eksik
-- kayıt üretilmez.
--
-- REFERANS TARİH: çalıştırıldığı andaki Europe/Istanbul YEREL günü (`d`).
-- Tüm dönemler `d`ye görelidir, bu yüzden fixture her gün anlamlı kalır
-- (bugün / yakında / gelecek / yıl sınırı senaryoları kaymaz).
-- Uygulamanın saati SABİTLENMEZ.
--
-- YENİDEN ÜRETİM:
--   npx supabase db reset
--   ya da yalnız bu dosya:
--     docker cp supabase\seeds\99_zzzz_ps9_media_demo.sql `
--       supabase_db_medyapark:/tmp/x.sql
--     docker exec supabase_db_medyapark psql -U postgres -d postgres -f /tmp/x.sql
--   (PowerShell borusu UTF-8'i BOZAR; dosya KOPYALANARAK verilir.)
--
-- İDEMPOTENT: her yerleşim `PS9·` önekli bir nota sahiptir; bir tane
-- bile varsa dosya hiç çalışmaz. TRUNCATE / genel reset KULLANILMAZ.
--
-- YAZIM GERÇEK YOLDAN: `media_placements_create` / `media_placement_update`
-- güvenilir RPC'leri, dev kullanıcısının JWT kimliğiyle. Çakışma kısıtı,
-- RLS ve güvenilir hareket tetikleyicileri fixture için GEVŞETİLMEZ —
-- yani buradaki her satır gerçek kurallardan geçmiştir.
--
-- Özel PS8 fixture'i yüklüyse onunla ÇAKIŞMAZ: farklı yüzler kullanılır
-- (Çukurova Sabit Panolar, Stadyum Ultraboard, Esas01 P1/P3, M1 P20 çifti)
-- ve M1 LED'e yalnız orada hiç kayıt yoksa yazılır.
-- =====================================================================
do $$
declare
  d date := (now() at time zone 'Europe/Istanbul')::date;
  yilSonu date;
  w_aci bigint; w_aci2 bigint; w_adn bigint; w_yil bigint;
  c_aci bigint; c_adn bigint; c_yil bigint;
  a_cuk bigint; a_ub bigint; a_esas bigint; a_kled bigint; a_m1led bigint;
  r jsonb; pid bigint;
begin
  if exists (select 1 from public.media_placements where note like 'PS9·%') then
    raise notice 'PS9 demo: zaten yüklü — atlandı.'; return;
  end if;

  -- Önce ÖZEL demo fixture'inin isleri (varsa) kullanilir; boylece bu
  -- makinedeki mevcut demo baglami korunur.
  select id into w_aci  from public.jobs where title = 'M1 Adana AVM · Sonbahar kampanyası' order by id limit 1;
  select id into w_aci2 from public.jobs where title = 'Acıbadem · Yıl sonu duyuru panoları' order by id limit 1;
  select id into w_adn  from public.jobs where title = 'ADN Lezzet · Ürün lansmanı' order by id limit 1;
  select id into w_yil  from public.jobs where title = 'Tüyap Afiş Planlaması' order by id limit 1;

  -- TEMİZ KLON YOLU (PS9 kapanış §1): özel fixture Git dışıdır, bu
  -- yüzden orada bu işler yoktur. Senaryoların taşınabilir olması için
  -- SENTETİK kurum ve işler oluşturulur. Gerçek şirket verisi YOKTUR:
  -- adlar açıkça "(demo)" etiketlidir ve yalnız eksikse yaratılır.
  if w_aci is null or w_adn is null or w_yil is null then
    raise notice 'PS9 demo: özel demo işleri yok — sentetik kurum/iş kuruluyor.';

    insert into public.customers (firma, active, relationship_roles, source_type)
    select v.ad, true, '[]'::jsonb, 'ps9_sentetik'
      from (values ('Kuzey Reklam A.Ş. (demo)'), ('Deniz Gıda Ltd. (demo)'), ('Anadolu Lojistik A.Ş. (demo)')) as v(ad)
     where not exists (select 1 from public.customers c where c.firma = v.ad);

    select id into c_aci from public.customers where firma = 'Kuzey Reklam A.Ş. (demo)';
    select id into c_adn from public.customers where firma = 'Deniz Gıda Ltd. (demo)';
    select id into c_yil from public.customers where firma = 'Anadolu Lojistik A.Ş. (demo)';

    insert into public.jobs (title, customer_id, status, lifecycle_status)
    select v.t, v.c, 'teklif', 'acik'
      from (values
        ('Kuzey Reklam · Sonbahar kampanyası (demo)', c_aci),
        ('Kuzey Reklam · Yıl sonu duyuru panoları (demo)', c_aci),
        ('Deniz Gıda · Ürün lansmanı (demo)', c_adn),
        ('Anadolu Lojistik · Yıl planlaması (demo)', c_yil)
      ) as v(t, c)
     where not exists (select 1 from public.jobs j where j.title = v.t);

    select id into w_aci  from public.jobs where title = 'Kuzey Reklam · Sonbahar kampanyası (demo)';
    select id into w_aci2 from public.jobs where title = 'Kuzey Reklam · Yıl sonu duyuru panoları (demo)';
    select id into w_adn  from public.jobs where title = 'Deniz Gıda · Ürün lansmanı (demo)';
    select id into w_yil  from public.jobs where title = 'Anadolu Lojistik · Yıl planlaması (demo)';
  end if;
  w_aci2 := coalesce(w_aci2, w_aci);
  if w_aci is null or w_adn is null or w_yil is null then
    raise notice 'PS9 demo: iş çözülemedi — atlandı.'; return;
  end if;
  -- S11: notlar gerçek kullanım diline çevrildikten sonra da tekrar
  -- çalıştırma çoğaltmasın: senaryo işlerinde yerleşim varsa yüklüdür.
  if exists (select 1 from public.media_placements where work_id in (w_aci, w_aci2, w_adn, w_yil)
              and note is not null and note not like 'PS9U·%') then
    raise notice 'PS9 demo: zaten yüklü — atlandı.'; return;
  end if;

  select a.id into a_cuk from public.alt_mecralar a join public.mecralar m on m.id = a.mecra_id
   where m.name = 'Çukurova Kulübü' and a.name = 'Kulüp Sabit Panolar';
  select a.id into a_ub from public.alt_mecralar a join public.mecralar m on m.id = a.mecra_id
   where m.name = 'Adana Stadyumu' and a.name = 'Stadyum Ultraboard';
  select a.id into a_esas from public.alt_mecralar a join public.mecralar m on m.id = a.mecra_id
   where m.name = 'Esas01 Burda AVM Karşısı' and a.name = 'Esas01 Ultraboard';
  select a.id into a_kled from public.alt_mecralar a join public.mecralar m on m.id = a.mecra_id
   where m.name = 'Çukurova Kulübü' and a.name = 'Kulüp Raket LED';
  select a.id into a_m1led from public.alt_mecralar a join public.mecralar m on m.id = a.mecra_id
   where m.name = 'M1 Adana AVM' and a.name = 'M1 Adana LED' and a.occupancy_mode = 'concurrent';
  if a_cuk is null or a_ub is null then
    raise notice 'PS9 demo: PS9 envanteri yok (98_zzz_ps9 çalıştı mı?) — atlandı.'; return;
  end if;

  yilSonu := make_date(extract(year from d)::int, 12, 31);

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

  create temporary table if not exists _ps9u(alan bigint, ad text, id bigint) on commit drop;
  insert into _ps9u select u.alt_mecra_id, u.name, u.id from public.units u
   where u.alt_mecra_id in (a_cuk, a_ub, a_esas)
      or u.alt_mecra_id = (select alt_mecra_id from public.units where id =
           (select id from public.units where name = 'P20-A' order by id limit 1));

  -- ================= Çukurova · Sabit Panolar (tek yüz) ===============

  -- P1 · geçmişte kullanılmış, BUGÜN BOŞ
  r := public.media_placements_create(jsonb_build_object('work_id',w_yil,'commitment','confirmed',
         'start_date',d-70,'end_date',d-40,'note','PS9· geçmiş dönem, bugün boş'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_cuk and ad='P1'))));
  if not (r->>'ok')::boolean then raise exception 'PS9 P1: %', r; end if;

  -- P2 · bugün devam eden + ARKASINDA KESİNTİSİZ YENİLEME
  --      => "yakında boşalıyor" SAYILMAMALI (§6)
  r := public.media_placements_create(jsonb_build_object('work_id',w_aci,'commitment','confirmed',
         'start_date',d-20,'end_date',d+5,'note','PS9· bitiyor ama arkasında yenileme var'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_cuk and ad='P2'))));
  if not (r->>'ok')::boolean then raise exception 'PS9 P2/1: %', r; end if;
  r := public.media_placements_create(jsonb_build_object('work_id',w_aci2,'commitment','confirmed',
         'start_date',d+6,'end_date',d+66,'note','PS9· kesintisiz yenileme (ertesi gün başlar)'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_cuk and ad='P2'))));
  if not (r->>'ok')::boolean then raise exception 'PS9 P2/2: %', r; end if;

  -- P3 · bugün devam eden, ARKASI BOŞ => gerçekten "yakında boşalıyor"
  r := public.media_placements_create(jsonb_build_object('work_id',w_adn,'commitment','confirmed',
         'start_date',d-20,'end_date',d+4,'note','PS9· yakında boşalıyor, yenileme yok'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_cuk and ad='P3'))));
  if not (r->>'ok')::boolean then raise exception 'PS9 P3: %', r; end if;

  -- P4 · aynı ay içinde FARKLI müşteriler, aralarında GERÇEK boşluk
  r := public.media_placements_create(jsonb_build_object('work_id',w_aci,'commitment','confirmed',
         'start_date',d-12,'end_date',d-6,'note','PS9· aynı ay, birinci müşteri'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_cuk and ad='P4'))));
  if not (r->>'ok')::boolean then raise exception 'PS9 P4/1: %', r; end if;
  r := public.media_placements_create(jsonb_build_object('work_id',w_adn,'commitment','confirmed',
         'start_date',d-2,'end_date',d+9,'note','PS9· aynı ay, ikinci müşteri (arada boş günler)'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_cuk and ad='P4'))));
  if not (r->>'ok')::boolean then raise exception 'PS9 P4/2: %', r; end if;

  -- P5 · AYNI müşterinin kesintisiz yenilemesi (iki ayrı sözleşme)
  r := public.media_placements_create(jsonb_build_object('work_id',w_aci,'commitment','confirmed',
         'start_date',d-45,'end_date',d-16,'note','PS9· yenileme 1/2 — aynı müşteri'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_cuk and ad='P5'))));
  if not (r->>'ok')::boolean then raise exception 'PS9 P5/1: %', r; end if;
  r := public.media_placements_create(jsonb_build_object('work_id',w_aci,'commitment','confirmed',
         'start_date',d-15,'end_date',d+20,'note','PS9· yenileme 2/2 — kesintisiz, ayrı sözleşme'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_cuk and ad='P5'))));
  if not (r->>'ok')::boolean then raise exception 'PS9 P5/2: %', r; end if;

  -- P6 · yenileme ama ARADA BOŞLUK var
  r := public.media_placements_create(jsonb_build_object('work_id',w_adn,'commitment','confirmed',
         'start_date',d-50,'end_date',d-31,'note','PS9· boşluklu yenileme 1/2'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_cuk and ad='P6'))));
  if not (r->>'ok')::boolean then raise exception 'PS9 P6/1: %', r; end if;
  r := public.media_placements_create(jsonb_build_object('work_id',w_adn,'commitment','confirmed',
         'start_date',d-10,'end_date',d+14,'note','PS9· boşluklu yenileme 2/2 (arada 20 gün boş)'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_cuk and ad='P6'))));
  if not (r->>'ok')::boolean then raise exception 'PS9 P6/2: %', r; end if;

  -- P7 · YIL SINIRINI aşan rezervasyon
  r := public.media_placements_create(jsonb_build_object('work_id',w_yil,'commitment','confirmed',
         'start_date',yilSonu-20,'end_date',yilSonu+45,'note','PS9· yıl sınırını aşıyor'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_cuk and ad='P7'))));
  if not (r->>'ok')::boolean then raise exception 'PS9 P7: %', r; end if;

  -- P8 · GEÇERLİ opsiyon (son geçerlilik ileride) — reklam dönemi ayrı
  r := public.media_placements_create(jsonb_build_object('work_id',w_adn,'commitment','reserved',
         'start_date',d+20,'end_date',d+50,'option_expires_at',d+9,
         'note','PS9· geçerli opsiyon — son geçerlilik reklam döneminden ÖNCE'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_cuk and ad='P8'))));
  if not (r->>'ok')::boolean then raise exception 'PS9 P8: %', r; end if;

  -- P9 · SÜRESİ GEÇMİŞ opsiyon. Bloklamaya DEVAM eder (§8: bloklama
  --      davranışı sessizce değişmez); takvim "süresi doldu" der ve
  --      karar insana bırakılır.
  r := public.media_placements_create(jsonb_build_object('work_id',w_yil,'commitment','reserved',
         'start_date',d+12,'end_date',d+40,'option_expires_at',d-3,
         'note','PS9· süresi geçmiş opsiyon — hâlâ bloklar, karar bekliyor'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_cuk and ad='P9'))));
  if not (r->>'ok')::boolean then raise exception 'PS9 P9: %', r; end if;

  -- P10 · İPTAL edilmiş kayıt: geçmişte görünür, müsaitliği BLOKLAMAZ
  r := public.media_placements_create(jsonb_build_object('work_id',w_aci,'commitment','confirmed',
         'start_date',d-3,'end_date',d+27,'note','PS9· iptal edilecek kayıt'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_cuk and ad='P10'))));
  if not (r->>'ok')::boolean then raise exception 'PS9 P10: %', r; end if;
  pid := (r->'ids'->>0)::bigint;
  perform public.media_placement_update(pid, jsonb_build_object('commitment','cancelled'));

  -- ================= Stadyum · Ultraboard ============================

  -- UB1 · opsiyon -> REZERVASYONA DÖNÜŞÜM (§4/§8 akışı)
  r := public.media_placements_create(jsonb_build_object('work_id',w_aci2,'commitment','reserved',
         'start_date',d+30,'end_date',d+90,'option_expires_at',d+7,
         'note','PS9· opsiyondan rezervasyona dönüştürüldü'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_ub and ad='UB1'))));
  if not (r->>'ok')::boolean then raise exception 'PS9 UB1: %', r; end if;
  pid := (r->'ids'->>0)::bigint;
  -- Dönüşüm: opsiyon son geçerliliği artık anlamsız, RPC temizler.
  perform public.media_placement_update(pid, jsonb_build_object('commitment','confirmed'));

  -- UB2 · ay ortasında başlayıp SONRAKİ AYA geçen rezervasyon
  r := public.media_placements_create(jsonb_build_object('work_id',w_adn,'commitment','confirmed',
         'start_date',(date_trunc('month',d)+interval '16 day')::date,
         'end_date',(date_trunc('month',d)+interval '1 month 11 day')::date,
         'note','PS9· ay ortası başlar, ertesi aya geçer'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_ub and ad='UB2'))));
  if not (r->>'ok')::boolean then raise exception 'PS9 UB2: %', r; end if;

  -- UB3 + Esas P1 · AYNI İŞ, farklı lokasyon ve farklı ürün ölçüsü
  r := public.media_placements_create(jsonb_build_object('work_id',w_yil,'commitment','confirmed',
         'start_date',d-4,'end_date',d+26,'note','PS9· çok lokasyonlu iş — Stadyum ayağı'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_ub and ad='UB3'))));
  if not (r->>'ok')::boolean then raise exception 'PS9 UB3: %', r; end if;

  -- UB4 · GELECEKTE başlayacak rezervasyon (bugünü DOLU yapmamalı)
  r := public.media_placements_create(jsonb_build_object('work_id',w_aci,'commitment','confirmed',
         'start_date',d+25,'end_date',d+55,'note','PS9· gelecek rezervasyon — bugün boş'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_ub and ad='UB4'))));
  if not (r->>'ok')::boolean then raise exception 'PS9 UB4: %', r; end if;

  -- UB5 ve UB6 bilinçli olarak TAMAMEN BOŞ bırakılır.

  -- ================= Esas 01 · Ultraboard ============================
  if a_esas is not null then
    r := public.media_placements_create(jsonb_build_object('work_id',w_yil,'commitment','confirmed',
           'start_date',d-4,'end_date',d+26,'note','PS9· çok lokasyonlu iş — Esas ayağı'),
         jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_esas and ad='P1'))));
    if not (r->>'ok')::boolean then raise exception 'PS9 Esas P1: %', r; end if;

    r := public.media_placements_create(jsonb_build_object('work_id',w_adn,'commitment','confirmed',
           'start_date',d-30,'end_date',null,'note','PS9· bitişi bilinmiyor — açık uçlu'),
         jsonb_build_array(jsonb_build_object('unit_id',(select id from _ps9u where alan=a_esas and ad='P3'))));
    if not (r->>'ok')::boolean then raise exception 'PS9 Esas P3: %', r; end if;
  end if;

  -- ========== M1 Raketler · aynı panonun A/B yüzü farklı müşteride ====
  r := public.media_placements_create(jsonb_build_object('work_id',w_aci,'commitment','confirmed',
         'start_date',d-8,'end_date',d+22,'note','PS9· A yüzü — bu müşteri'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from public.units where name='P20-A' order by id limit 1))));
  if not (r->>'ok')::boolean then raise exception 'PS9 P20-A: %', r; end if;
  r := public.media_placements_create(jsonb_build_object('work_id',w_adn,'commitment','confirmed',
         'start_date',d-8,'end_date',d+22,'note','PS9· B yüzü — BAŞKA müşteri, A/B bağımsızdır'),
       jsonb_build_array(jsonb_build_object('unit_id',(select id from public.units where name='P20-B' order by id limit 1))));
  if not (r->>'ok')::boolean then raise exception 'PS9 P20-B: %', r; end if;

  -- ========== Çukurova Raket LED · eşzamanlı kampanyalar =============
  -- Aynı yayın alanında ÖRTÜŞEN kampanyalar: statik çakışma kuralı
  -- BURAYA UYGULANMAZ, çünkü LED münhasır değildir.
  if a_kled is not null then
    r := public.media_placements_create(jsonb_build_object('work_id',w_aci,'commitment','confirmed',
           'start_date',d-6,'end_date',d+24,'note','PS9· eşzamanlı yayın 1'),
         jsonb_build_array(jsonb_build_object('alt_mecra_id',a_kled)));
    if not (r->>'ok')::boolean then raise exception 'PS9 KLED/1: %', r; end if;
    r := public.media_placements_create(jsonb_build_object('work_id',w_adn,'commitment','confirmed',
           'start_date',d-1,'end_date',d+40,'note','PS9· eşzamanlı yayın 2 — 1 ile örtüşür'),
         jsonb_build_array(jsonb_build_object('alt_mecra_id',a_kled)));
    if not (r->>'ok')::boolean then raise exception 'PS9 KLED/2: %', r; end if;
    r := public.media_placements_create(jsonb_build_object('work_id',w_yil,'commitment','reserved',
           'start_date',d+15,'end_date',d+60,'note','PS9· eşzamanlı yayın 3 — opsiyon, yaklaşan'),
         jsonb_build_array(jsonb_build_object('alt_mecra_id',a_kled)));
    if not (r->>'ok')::boolean then raise exception 'PS9 KLED/3: %', r; end if;
  end if;

  -- M1 LED: eşzamanlı kampanyalar. Bunları önceden ÖZEL PS8 fixture'i
  -- sağlıyordu; temiz klonda o dosya yoktur, bu yüzden senaryo buraya
  -- taşındı. Zaten kayıt varsa (özel fixture yüklü) tekrar EKLENMEZ.
  if a_m1led is not null
     and not exists (select 1 from public.media_placements
                      where alt_mecra_id = a_m1led and commitment <> 'cancelled') then
    r := public.media_placements_create(jsonb_build_object('work_id',w_aci,'commitment','confirmed',
           'start_date',d-10,'end_date',d+20,'note','PS9· M1 LED eşzamanlı yayın 1'),
         jsonb_build_array(jsonb_build_object('alt_mecra_id',a_m1led)));
    if not (r->>'ok')::boolean then raise exception 'PS9 M1LED/1: %', r; end if;
    r := public.media_placements_create(jsonb_build_object('work_id',w_adn,'commitment','confirmed',
           'start_date',d-2,'end_date',d+35,'note','PS9· M1 LED eşzamanlı yayın 2 — 1 ile örtüşür'),
         jsonb_build_array(jsonb_build_object('alt_mecra_id',a_m1led)));
    if not (r->>'ok')::boolean then raise exception 'PS9 M1LED/2: %', r; end if;
  end if;

  perform set_config('request.jwt.claims', '', true);

  raise notice 'PS9 demo: % kayıt yüklendi (referans gün %).',
    (select count(*) from public.media_placements where note like 'PS9·%'), d;
end $$;

-- Doğrulama: çakışma kısıtı fixture için gevşetilmedi, iptal bloklamıyor.
do $$
declare v_cak int; v_ipt int;
begin
  select count(*) into v_cak
    from public.media_placements p1 join public.media_placements p2
      on p1.unit_id = p2.unit_id and p1.id < p2.id
     and p1.commitment <> 'cancelled' and p2.commitment <> 'cancelled'
     and daterange(p1.start_date, p1.end_date, '[]') && daterange(p2.start_date, p2.end_date, '[]')
   where p1.unit_id is not null;
  if v_cak > 0 then
    raise exception 'PS9 demo: % statik çakışma var — EXCLUDE kısıtı atlanmış olmalı.', v_cak;
  end if;

  select count(*) into v_ipt from public.media_placements where commitment = 'cancelled';
  raise notice 'PS9 demo doğrulama: statik çakışma 0, iptal edilmiş kayıt % (bloklamaz).', v_ipt;
end $$;
