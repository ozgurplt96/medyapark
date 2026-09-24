-- =====================================================================
-- PS9 kapanış §1 — SENTETİK envanter iskeleti (commit'li)
--
-- AMAÇ: taşınabilirlik. Şirket verisi seed'i (`20_company_data.sql`)
-- Git DIŞIDIR, bu yüzden temiz bir klonda hiç mecra/ürün/birim yoktur ve
-- `98_zzz_ps9_media_inventory.sql` (düzeltme seed'i) hiçbir şey bulamaz.
-- Bu dosya o boşluğu doldurur: dört aktif lokasyonu, ürün türlerini ve
-- 104 statik yüzü SIFIRDAN kurar.
--
-- ŞİRKET VERİSİ İÇERMEZ. Yalnız yapı: lokasyon adı, alan adı, ürün türü,
-- pozisyon kodu ve katalog ölçüsü. Müşteri, kişi, fiyat, sözleşme YOK.
--
-- KOŞULLU: kanonik lokasyonlar zaten varsa (şirket verisi yüklü bir
-- makinede) bu dosya HİÇBİR ŞEY yapmaz — mevcut envantere dokunmaz.
--
-- Sıra: `98_zzz_...` (düzeltme) ÖNCE, bu dosya SONRA çalışır; 104
-- kontrol toplamının kesin doğrulaması her iki yolda da BURADADIR.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Ürün türleri — yalnız eksik olanlar
-- ---------------------------------------------------------------------
insert into public.products (name, olcu, yuzey, isikli, baski_format, baski_malzemesi, sort)
select v.name, v.olcu, v.yuzey, v.isikli, v.baski_format, v.malzeme, v.sort
  from (values
    ('Megalight',   '385×260 cm',             'Tek yüz',   'İçten aydınlatmalı', null,          null,                  1),
    ('Raket / CLP', '120×185 cm',             'Çift yüz',  'Işıklı',             '106×185 cm',  null,                  2),
    ('LED Ekran',   'Lokasyona göre değişir', 'Dijital',   'Işıklı',             null,          null,                  3),
    ('Megaboard',   '500×200 cm',             'Tek yüz',   'Işıksız',            null,          '440 gr Avrupa vinil', 4),
    ('Ultraboard',  'Lokasyona göre değişir', 'Tek yüzey', 'Işıklı',             null,          '440 gr Avrupa vinil', 7),
    ('Sabit Pano',  'Lokasyona göre değişir', 'Tek yüzey', 'Işıksız',            null,          null,                  9),
    ('Raket LED',   'Lokasyona göre değişir', 'Dijital',   'Işıklı',             null,          null,                 10)
  ) as v(name, olcu, yuzey, isikli, baski_format, malzeme, sort)
 where not exists (select 1 from public.products p where p.name = v.name);

-- ---------------------------------------------------------------------
-- 2) Sentetik iskelet — yalnız kanonik lokasyonlar YOKSA
-- ---------------------------------------------------------------------
do $$
declare
  v_m1 bigint; v_st bigint; v_es bigint; v_ck bigint;
  v_alt bigint; i int;
  p_mgl bigint; p_rkt bigint; p_led bigint; p_mgb bigint;
  p_ulb bigint; p_sbt bigint; p_rled bigint;
begin
  if exists (select 1 from public.mecralar where name = 'M1 Adana AVM') then
    raise notice 'PS9 sentetik: kanonik envanter zaten var — DOKUNULMADI.';
    return;
  end if;
  raise notice 'PS9 sentetik: şirket verisi yok — sentetik iskelet kuruluyor.';

  select id into p_mgl  from public.products where name = 'Megalight';
  select id into p_rkt  from public.products where name = 'Raket / CLP';
  select id into p_led  from public.products where name = 'LED Ekran';
  select id into p_mgb  from public.products where name = 'Megaboard';
  select id into p_ulb  from public.products where name = 'Ultraboard';
  select id into p_sbt  from public.products where name = 'Sabit Pano';
  select id into p_rled from public.products where name = 'Raket LED';

  insert into public.mecralar (name, hidden, operational, sort)
       values ('M1 Adana AVM', false, true, 1) returning id into v_m1;
  insert into public.mecralar (name, hidden, operational, sort)
       values ('Adana Stadyumu', false, true, 2) returning id into v_st;
  insert into public.mecralar (name, hidden, operational, sort)
       values ('Esas01 Burda AVM Karşısı', true, true, 3) returning id into v_es;
  insert into public.mecralar (name, hidden, operational, sort)
       values ('Çukurova Kulübü', false, true, 4) returning id into v_ck;

  -- Kapsam DIŞI bir lokasyon da kurulur: `operational=false` davranışının
  -- ve "kapsam silme değildir" kuralının temiz klonda da sınanabilmesi
  -- için. İçinde birim vardır ama doluluk yüzeyinde GÖRÜNMEZ.
  insert into public.mecralar (name, hidden, operational, sort)
       values ('Homeboard', true, false, 9) returning id into v_alt;
  insert into public.alt_mecralar (mecra_id, name, product_id, occupancy_mode, sort)
       values (v_alt, 'Homeboard Panolar', p_sbt, 'exclusive', 1) returning id into v_alt;
  for i in 1..10 loop
    insert into public.units (mecra_id, alt_mecra_id, product_id, name, olcu, sort, active)
    select a.mecra_id, a.id, p_sbt, 'H' || i, '200×300 cm', i, true
      from public.alt_mecralar a where a.id = v_alt;
  end loop;

  ---------------------------------------------------------------- M1
  -- 12 Megalight yapı -> 24 yüz (A/B)
  insert into public.alt_mecralar (mecra_id, name, product_id, occupancy_mode, sort)
       values (v_m1, 'M1 Adana Megalight''lar', p_mgl, 'exclusive', 1) returning id into v_alt;
  for i in 1..12 loop
    insert into public.units (mecra_id, alt_mecra_id, product_id, name, olcu, sort, active)
         values (v_m1, v_alt, p_mgl, 'P' || i || '-A', '385×260 cm', i*2-1, true),
                (v_m1, v_alt, p_mgl, 'P' || i || '-B', '385×260 cm', i*2,   true);
  end loop;

  -- 29 Raket/CLP yapı -> 58 yüz (A/B). Kod P1–P29: Megalight ile
  -- ÇAKIŞIR ve bu bilinçlidir — kod yalnız kendi alanında benzersizdir.
  insert into public.alt_mecralar (mecra_id, name, product_id, occupancy_mode, sort)
       values (v_m1, 'M1 Adana Raketler', p_rkt, 'exclusive', 2) returning id into v_alt;
  for i in 1..29 loop
    insert into public.units (mecra_id, alt_mecra_id, product_id, name, olcu, sort, active)
         values (v_m1, v_alt, p_rkt, 'P' || i || '-A', '120×185 cm', i*2-1, true),
                (v_m1, v_alt, p_rkt, 'P' || i || '-B', '120×185 cm', i*2,   true);
  end loop;

  -- LED: eşzamanlı yayın alanı. Birimler satılabilir yüz DEĞİL, fiziksel
  -- ekrandır ve 104 toplamına GİRMEZ. İkinci ekranın teknik künyesi
  -- kaynakta yoktur -> BOŞ bırakılır, birinciden kopyalanmaz.
  insert into public.alt_mecralar (mecra_id, name, product_id, occupancy_mode, creative_seconds, sort)
       values (v_m1, 'M1 Adana LED', p_led, 'concurrent', 15, 3) returning id into v_alt;
  insert into public.units (mecra_id, alt_mecra_id, product_id, name, olcu, konum, yayin_format, sort, active)
       values (v_m1, v_alt, p_led, 'Ekran 1', '350×450 cm', 'Food Court', '960×640 px', 1, true),
              (v_m1, v_alt, p_led, 'Ekran 2', null, null, null, 2, true);

  ---------------------------------------------------------- Stadyum
  insert into public.alt_mecralar (mecra_id, name, product_id, occupancy_mode, sort, aciklama)
       values (v_st, 'Stadyum Megaboard', p_mgb, 'exclusive', 1,
               'Tek yüzlü megaboard. 500×200 cm. Baskı: 440 gr Avrupa vinil.') returning id into v_alt;
  insert into public.units (mecra_id, alt_mecra_id, product_id, name, olcu, sort, active)
       values (v_st, v_alt, p_mgb, 'MB1', '500×200 cm', 1, true),
              (v_st, v_alt, p_mgb, 'MB2', '500×200 cm', 2, true);

  insert into public.alt_mecralar (mecra_id, name, product_id, occupancy_mode, sort, aciklama)
       values (v_st, 'Stadyum Ultraboard', p_ulb, 'exclusive', 2,
               'Tek yüzlü ultraboard. 750×200 cm. Baskı: 440 gr Avrupa vinil.') returning id into v_alt;
  for i in 1..6 loop
    insert into public.units (mecra_id, alt_mecra_id, product_id, name, olcu, sort, active)
         values (v_st, v_alt, p_ulb, 'UB' || i, '750×200 cm', i, true);
  end loop;

  ------------------------------------------------------------- Esas
  insert into public.alt_mecralar (mecra_id, name, product_id, occupancy_mode, sort, aciklama)
       values (v_es, 'Esas01 Ultraboard', p_ulb, 'exclusive', 1,
               'Dört adet tek yüzlü ultraboard. Her biri 3 × 8 m, yatay, üstten aydınlatmalı. '
            || 'Baskı: 440 gr Avrupa vinil.') returning id into v_alt;
  for i in 1..4 loop
    insert into public.units (mecra_id, alt_mecra_id, product_id, name, olcu, konum, sort, active)
         values (v_es, v_alt, p_ulb, 'P' || i, '800×300 cm', 'Otopark girişi', i, true);
  end loop;

  --------------------------------------------------------- Çukurova
  insert into public.alt_mecralar (mecra_id, name, product_id, occupancy_mode, sort, aciklama)
       values (v_ck, 'Kulüp Sabit Panolar', p_sbt, 'exclusive', 1,
               'On adet tek yüzlü sabit reklam panosu. Her biri 400×200 cm.') returning id into v_alt;
  for i in 1..10 loop
    insert into public.units (mecra_id, alt_mecra_id, product_id, name, olcu, sort, active)
         values (v_ck, v_alt, p_sbt, 'P' || i, '400×200 cm', i, true);
  end loop;

  insert into public.alt_mecralar (mecra_id, name, product_id, occupancy_mode, creative_seconds, sort, aciklama)
       values (v_ck, 'Kulüp Raket LED', p_rled, 'concurrent', 15, 2,
               'Tek fiziksel Raket LED ekran. 100×160 cm, 768×1280 px. Eşzamanlı yayın.')
       returning id into v_alt;
  insert into public.units (mecra_id, alt_mecra_id, product_id, name, olcu, konum, yayin_format, sort, active)
       values (v_ck, v_alt, p_rled, 'Raket LED', '100×160 cm', 'Kulüp girişi', '768×1280 px', 1, true);

  -- Eski modelleme alanı: `legacy_archived` davranışı temiz klonda da
  -- sınanabilsin diye kurulur, operasyonel listede GÖRÜNMEZ.
  insert into public.alt_mecralar (mecra_id, name, product_id, occupancy_mode, legacy_archived, sort)
       values (v_ck, 'Kulüp LED Yayın Slotları', p_led, 'exclusive', true, 3) returning id into v_alt;
  for i in 1..15 loop
    insert into public.units (mecra_id, alt_mecra_id, product_id, name, sort, active)
         values (v_ck, v_alt, p_led, 'S' || lpad(i::text, 2, '0'), i, true);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3) KESİN doğrulama — her iki yolda da (şirket verisi VAR ya da YOK)
-- ---------------------------------------------------------------------
do $$
declare r record; v_top int := 0; v int;
begin
  for r in
    select m.name, count(u.id) filter (where u.active) as statik
      from public.mecralar m
      join public.alt_mecralar a on a.mecra_id = m.id
      left join public.units u on u.alt_mecra_id = a.id
     where m.operational and a.occupancy_mode = 'exclusive' and not a.legacy_archived
     group by m.name order by m.name
  loop
    raise notice 'PS9 envanter: % -> % aktif statik yüz', r.name, r.statik;
    v_top := v_top + r.statik;
  end loop;

  if v_top <> 104 then
    raise exception 'PS9 envanter: aktif statik yüz % — 104 bekleniyordu.', v_top;
  end if;
  raise notice 'PS9 envanter: TOPLAM aktif statik yüz = 104 ✓';

  select count(*) into v from public.mecralar where operational;
  if v <> 4 then raise exception 'PS9 envanter: aktif lokasyon % — 4 bekleniyordu.', v; end if;

  select count(*) into v from public.units u
    join public.mecralar m on m.id = u.mecra_id where not m.operational;
  if v = 0 then raise exception 'PS9 envanter: kapsam dışı envanter yok — kapsam SİLME DEĞİLDİR.'; end if;
  raise notice 'PS9 envanter: 4 aktif lokasyon, kapsam dışı korunan yüz = % ✓', v;
end $$;
