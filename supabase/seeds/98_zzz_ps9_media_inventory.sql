-- =====================================================================
-- PS9 — Mecra envanteri düzeltmesi (commit'li replay)
--
-- `db reset` migration'ları BOŞ veritabanına uygular, şirket verisi
-- seed'ini (20_company_data.sql) SONRA yükler. Bu yüzden
-- 20260924100000_ps9_media_inventory_scope.sql YALNIZ DDL taşır ve
-- envanterin VERİ karşılığı buradadır.
--
-- ŞİRKET VERİSİ İÇERMEZ. İçeriği Ürün Sahibi'nin 24 Eylül 2026 kesin
-- envanter kararıdır (sprint §2–§3) ve yalnız yapısal karşılığıdır.
-- `98_zz_ps81_...`ten SONRA çalışır (dosya adı sırası).
--
-- Kesin kapsam ve kontrol toplamı — 104 AKTİF STATİK YÜZ:
--     M1 Adana AVM ................ 82   (12 Megalight = 24 yüz A/B,
--                                         29 Raket/CLP = 58 yüz A/B)
--     Yeni Adana Stadyumu .......... 8   (2 Megaboard + 6 Ultraboard)
--     Esas 01 Burda AVM karşısı .... 4   (4 Ultraboard)
--     Çukurova Kulübü .............. 10  (10 sabit pano, tek yüz)
--
-- LED yüzeyleri bu toplama GİRMEZ: LED eşzamanlı yayın alanıdır, statik
-- yüz değildir (S8). Fiziksel ekran sayısı, kampanya sayısı ve statik
-- yüz sayısı üç AYRI büyüklüktür.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Ürün türleri — ayrım korunur, tek ölçü DAYATILMAZ
--
-- §3: Megalight, Megaboard, Ultraboard, Raket/CLP, Sabit Pano, LED ve
-- Raket LED ayrı türlerdir. Aynı ürün türü farklı lokasyonlarda farklı
-- ölçüdedir (Stadyum Ultraboard 750×200, Esas Ultraboard 800×300), bu
-- yüzden ürün KATEGORİSİNE tek ölçü yazmak lokasyonlardan birini
-- yalanlar. Gerçek ölçü `units.olcu`da yaşar.
-- ---------------------------------------------------------------------
insert into public.products (name, olcu, yuzey, isikli, sort)
select 'Raket LED', 'Lokasyona göre değişir', 'Dijital', 'Işıklı',
       coalesce((select max(sort) from public.products), 0) + 1
 where not exists (select 1 from public.products where name = 'Raket LED');

-- Raket / CLP: katalog ÜRÜN ölçüsü ile BASKI ölçüsü aynı şey değildir
-- (§2). İkisi birleştirilmez; ayrı alanlarda durur.
update public.products
   set olcu = '120×185 cm', baski_format = '106×185 cm'
 where name = 'Raket / CLP';

update public.products set isikli = 'İçten aydınlatmalı'
 where name = 'Megalight' and coalesce(isikli, '') <> 'İçten aydınlatmalı';

-- Lokasyona göre değişen ölçüler: kategoriye tek sayı yazılmaz.
update public.products set olcu = 'Lokasyona göre değişir'
 where name in ('Ultraboard', 'LED Ekran', 'Sabit Pano')
   and coalesce(olcu, '') <> 'Lokasyona göre değişir';

-- Stadyum ve Esas için katalogda açıkça 440 gr Avrupa vinil belirtilmiş.
-- Bu iki lokasyon Ultraboard/Megaboard ürünlerinin TAMAMIDIR, o yüzden
-- ürün düzeyi doğrudur. M1/Çukurova için kaynakta açık olmayan malzeme
-- ATANMAZ.
update public.products set baski_malzemesi = '440 gr Avrupa vinil'
 where name in ('Ultraboard', 'Megaboard');

-- ---------------------------------------------------------------------
-- 2) Operasyonel kapsam
--
-- Kapsam dışı lokasyonların satırları, birimleri ve eski kayıtları
-- SİLİNMEZ; yalnız aktif doluluk yüzeyinden ve sayaçlardan çıkar.
-- ---------------------------------------------------------------------
update public.mecralar
   set operational = (name in ('M1 Adana AVM', 'Adana Stadyumu',
                               'Esas01 Burda AVM Karşısı', 'Çukurova Kulübü'));

-- ---------------------------------------------------------------------
-- 3) Yeni Adana Stadyumu — Megaboard ve Ultraboard AYRI türlerdir
--
-- Önceki durum: "Yeni Alt Mecra" adlı tek alan Megalight ürününe
-- bağlıydı ve içinde tek bir "Yeni Pozisyon" vardı; gerçek Megaboard
-- yüzü ise hiçbir alana bağlı OLMAYAN yetim bir satırdı. Stadyum
-- Megalight DEĞİLDİR (§2).
-- ---------------------------------------------------------------------
do $$
declare v_mec bigint; v_mb bigint; v_ub bigint; v_pid_mb bigint; v_pid_ub bigint; i int;
begin
  select id into v_mec from public.mecralar where name = 'Adana Stadyumu';
  if v_mec is null then
    raise notice 'PS9 seed: Adana Stadyumu yok — atlandı.'; return;
  end if;
  select id into v_pid_mb from public.products where name = 'Megaboard';
  select id into v_pid_ub from public.products where name = 'Ultraboard';

  -- Megaboard alanı: mevcut yanlış adlandırılmış alan yeniden kullanılır
  -- (silinmez — geçmişi olan envanter silinmez, §8).
  select id into v_mb from public.alt_mecralar
   where mecra_id = v_mec and name in ('Stadyum Megaboard', 'Yeni Alt Mecra') order by id limit 1;
  if v_mb is null then
    insert into public.alt_mecralar (mecra_id, name, product_id, occupancy_mode, sort)
    values (v_mec, 'Stadyum Megaboard', v_pid_mb, 'exclusive', 1) returning id into v_mb;
  else
    update public.alt_mecralar
       set name = 'Stadyum Megaboard', product_id = v_pid_mb, occupancy_mode = 'exclusive',
           aciklama = 'Tek yüzlü megaboard. 500×200 cm. Baskı: 440 gr Avrupa vinil.'
     where id = v_mb;
  end if;

  select id into v_ub from public.alt_mecralar where mecra_id = v_mec and name = 'Stadyum Ultraboard';
  if v_ub is null then
    insert into public.alt_mecralar (mecra_id, name, product_id, occupancy_mode, sort)
    values (v_mec, 'Stadyum Ultraboard', v_pid_ub, 'exclusive', 2) returning id into v_ub;
  else
    update public.alt_mecralar set product_id = v_pid_ub, occupancy_mode = 'exclusive' where id = v_ub;
  end if;
  update public.alt_mecralar
     set aciklama = 'Tek yüzlü ultraboard. 750×200 cm. Baskı: 440 gr Avrupa vinil.'
   where id = v_ub;

  -- Megaboard yüzleri: MB1 zaten var olan (yerleşim geçmişi TAŞIYAN)
  -- yetim satırdır; yeniden adlandırılıp alanına bağlanır, SİLİNMEZ.
  update public.units
     set alt_mecra_id = v_mb, product_id = v_pid_mb, name = 'MB1',
         olcu = '500×200 cm', sort = 1, active = true
   where mecra_id = v_mec and name in ('MB1', 'Stadyum Megaboard');

  -- MB2: eski "Yeni Pozisyon" (geçmişi yok) yeniden kullanılır.
  update public.units
     set alt_mecra_id = v_mb, product_id = v_pid_mb, name = 'MB2',
         olcu = '500×200 cm', sort = 2, active = true
   where mecra_id = v_mec and name in ('MB2', 'Yeni Pozisyon');

  for i in 1..6 loop
    if not exists (select 1 from public.units where alt_mecra_id = v_ub and name = 'UB' || i) then
      insert into public.units (mecra_id, alt_mecra_id, product_id, name, olcu, sort, active)
      values (v_mec, v_ub, v_pid_ub, 'UB' || i, '750×200 cm', i, true);
    else
      update public.units set olcu = '750×200 cm', product_id = v_pid_ub, active = true
       where alt_mecra_id = v_ub and name = 'UB' || i;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4) Esas 01 Burda AVM karşısı — 4 Ultraboard
--
-- Ürün Sahibi'nin kesin düzeltmesi (§2): bunlar ULTRABOARD'dur, bina
-- duvar giydirmesi DEĞİLDİR. Katalogdaki farklı adlandırma yüzünden
-- Esas kapsam dışına çıkarılmaz ve aynı dört ürün başka kategoride
-- ÇOĞALTILMAZ.
--
-- Ölçü: 3 × 8 m, yatay. Depoda tüm ölçüler `genişlik×yükseklik cm`
-- düzenindedir, bu yüzden yatay 8 m × 3 m => 800×300 cm.
-- ---------------------------------------------------------------------
do $$
declare v_alt bigint; v_pid bigint;
begin
  select a.id into v_alt from public.alt_mecralar a join public.mecralar m on m.id = a.mecra_id
   where m.name = 'Esas01 Burda AVM Karşısı' and a.name = 'Esas01 Ultraboard';
  if v_alt is null then raise notice 'PS9 seed: Esas01 alanı yok — atlandı.'; return; end if;
  select id into v_pid from public.products where name = 'Ultraboard';

  update public.alt_mecralar
     set product_id = v_pid, occupancy_mode = 'exclusive',
         aciklama = 'Dört adet tek yüzlü ultraboard. Her biri 3 × 8 m, yatay, '
                 || 'üstten aydınlatmalı. Baskı: 440 gr Avrupa vinil.'
   where id = v_alt;

  update public.units set olcu = '800×300 cm', product_id = v_pid, active = true
   where alt_mecra_id = v_alt;
end $$;

-- ---------------------------------------------------------------------
-- 5) Çukurova Kulübü — 10 sabit pano + 1 Raket LED
--
-- Sabit pano alanı hiç YOKTU. Pozisyon kodu bilinçli olarak P1–P10'dur:
-- eski `Kulüp LED Yayın Slotları` alanı S01–S15 kodlarını kullanıyor ve
-- aynı mecrada iki kez S01 görmek okuyanı yanıltırdı (kod yalnız kendi
-- alanında benzersizdir — S8.1 §7).
-- ---------------------------------------------------------------------
do $$
declare v_mec bigint; v_alt bigint; v_pid bigint; v_led bigint; v_pled bigint; i int;
begin
  select id into v_mec from public.mecralar where name = 'Çukurova Kulübü';
  if v_mec is null then raise notice 'PS9 seed: Çukurova Kulübü yok — atlandı.'; return; end if;
  select id into v_pid from public.products where name = 'Sabit Pano';

  select id into v_alt from public.alt_mecralar where mecra_id = v_mec and name = 'Kulüp Sabit Panolar';
  if v_alt is null then
    insert into public.alt_mecralar (mecra_id, name, product_id, occupancy_mode, sort)
    values (v_mec, 'Kulüp Sabit Panolar', v_pid, 'exclusive', 1) returning id into v_alt;
  end if;
  update public.alt_mecralar
     set product_id = v_pid, occupancy_mode = 'exclusive',
         aciklama = 'On adet tek yüzlü sabit reklam panosu. Her biri 400×200 cm.'
   where id = v_alt;

  for i in 1..10 loop
    if not exists (select 1 from public.units where alt_mecra_id = v_alt and name = 'P' || i) then
      insert into public.units (mecra_id, alt_mecra_id, product_id, name, olcu, sort, active)
      values (v_mec, v_alt, v_pid, 'P' || i, '400×200 cm', i, true);
    else
      update public.units set olcu = '400×200 cm', product_id = v_pid, active = true
       where alt_mecra_id = v_alt and name = 'P' || i;
    end if;
  end loop;

  -- Raket LED: eşzamanlı yayın alanı (S8.1'de zaten dönüştürüldü).
  -- Burada yalnız ürün türü ayrımı ve fiziksel ekran künyesi netleşir.
  select id into v_led from public.alt_mecralar where mecra_id = v_mec and name = 'Kulüp Raket LED';
  select id into v_pled from public.products where name = 'Raket LED';
  if v_led is not null then
    update public.alt_mecralar set product_id = v_pled,
           aciklama = 'Tek fiziksel Raket LED ekran. 100×160 cm, 768×1280 px. '
                   || 'Eşzamanlı yayın: aynı dönemde birden çok reklamveren yayında olabilir.'
     where id = v_led;
    update public.units
       set product_id = v_pled, olcu = '100×160 cm', yayin_format = '768×1280 px',
           name = 'Raket LED', konum = coalesce(konum, 'Kulüp girişi')
     where alt_mecra_id = v_led;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6) M1 LED — iki fiziksel ekran, uydurulmuş eşleştirme YOK
--
-- §3: mevcut `P3-A` satırı fiziksel ekran envanterinin gerçeği DEĞİLDİR.
-- O satır eski aylık LED kayıtlarının çapasıdır (4 eski kayıt ona
-- bağlıdır). Adı statik bir pozisyon kodu gibi okunuyordu.
--
-- Çapa satırı KORUNUR ama dürüst adlandırılır ve satışa kapatılır;
-- üzerindeki eski kayıtlar böylece HİÇBİR fiziksel ekrana atanmış
-- olmaz. İki gerçek ekran ayrı envanter satırı olarak eklenir.
-- İkinci ekranın teknik özellikleri kaynakta YOK: kopyalanmaz, boş kalır.
--
-- Kampanyalar ALANA bağlanır (media_placements.alt_mecra_id), ekrana
-- değil — yani "hangi kampanya hangi ekranda" ilişkisi UYDURULMAZ.
-- ---------------------------------------------------------------------
do $$
declare v_alt bigint; v_pid bigint;
begin
  select a.id into v_alt from public.alt_mecralar a join public.mecralar m on m.id = a.mecra_id
   where m.name = 'M1 Adana AVM' and a.name = 'M1 Adana LED';
  if v_alt is null then raise notice 'PS9 seed: M1 LED alanı yok — atlandı.'; return; end if;
  select id into v_pid from public.products where name = 'LED Ekran';

  update public.alt_mecralar
     set aciklama = 'İki fiziksel LED ekran. Eşzamanlı yayın: aynı dönemde birden çok '
                 || 'reklamveren yayında olabilir. Kampanya ekrana değil yayın alanına bağlanır.'
   where id = v_alt;

  -- Eski aylık LED kayıtlarının çapası.
  update public.units
     set name = 'Eski yayın şeridi', active = false,
         inactive_note = 'Eski aylık LED kayıtlarının çapası — fiziksel ekran değildir, satılmaz.',
         olcu = null, konum = null, yayin_format = null
   where alt_mecra_id = v_alt and name in ('P3-A', 'Eski yayın şeridi');

  if not exists (select 1 from public.units where alt_mecra_id = v_alt and name = 'Ekran 1') then
    insert into public.units (mecra_id, alt_mecra_id, product_id, name, olcu, konum, yayin_format, sort, active)
    select mecra_id, v_alt, v_pid, 'Ekran 1', '350×450 cm', 'Food Court', '960×640 px', 1, true
      from public.alt_mecralar where id = v_alt;
  else
    update public.units set olcu = '350×450 cm', konum = 'Food Court', yayin_format = '960×640 px',
                            product_id = v_pid, active = true
     where alt_mecra_id = v_alt and name = 'Ekran 1';
  end if;

  -- İkinci ekran: ölçü ve çözünürlük kaynakta YOK. Food Court'un
  -- değerleri buraya KOPYALANMAZ.
  if not exists (select 1 from public.units where alt_mecra_id = v_alt and name = 'Ekran 2') then
    insert into public.units (mecra_id, alt_mecra_id, product_id, name, olcu, konum, yayin_format, sort, active, inactive_note)
    select mecra_id, v_alt, v_pid, 'Ekran 2', null, null, null, 2, true, null
      from public.alt_mecralar where id = v_alt;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 7) Bilgilendirme
--
-- KESİN 104 doğrulaması BU DOSYADA DEĞİL, `98_zzzz_ps9_synthetic_inventory.sql`
-- sonundadır. Gerekçe: şirket verisi seed'i Git dışıdır; temiz bir klonda
-- bu dosya hiçbir lokasyon bulamaz ve burada yapılan sert bir assert
-- `db reset`i kırardı. Doğrulama iki yolun BİRLEŞTİĞİ noktada yapılır.
-- ---------------------------------------------------------------------
do $$
declare v int;
begin
  select count(*) into v from public.mecralar where operational;
  raise notice 'PS9 düzeltme: kapsam içi lokasyon = % (kesin doğrulama sonraki seed''de)', v;
end $$;
