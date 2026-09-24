-- =====================================================================
-- PS8.1 — Çukurova Kulübü eski alan modellemesi replay (committed)
--
-- `db reset` migration'ları BOŞ veritabanına uygular ve seed'leri sonra
-- yükler; bu yüzden 20260922100000_ps81_media_legacy_areas dosyasının
-- VERİ kısmı local'de no-op olur. Bu dosya onu şirket verisi seed'inden
-- sonra tekrar oynatır. Şirket verisi İÇERMEZ — yalnız Ürün Sahibi'nin
-- 20 Eylül 2026 kararının yapısal karşılığı:
--
--   * Kulüp Raket LED  -> eşzamanlı yayın alanı (15 sn)
--   * Kulüp LED Yayın Slotları (S01–S15) -> eski modelleme; güncel
--     satılabilir envanter değil.
--
-- `98_ps8_media_backfill.sql`ten SONRA çalışır (dosya adı sırası): o
-- dosya eski kayıtları kesin dönemli yerleşime dönüştürür ve buradaki
-- korumaların nihai durumu görmesi gerekir.
-- =====================================================================

-- 1) Kulüp Raket LED -> eşzamanlı. Etkin yerleşim varsa DOKUNULMAZ.
do $$
declare v_id bigint;
begin
  select a.id into v_id
    from public.alt_mecralar a
    join public.mecralar m on m.id = a.mecra_id
   where m.name = 'Çukurova Kulübü'
     and a.name = 'Kulüp Raket LED'
     and a.occupancy_mode = 'exclusive';

  if v_id is null then return; end if;

  if exists (select 1 from public.media_placements p
               join public.units u on u.id = p.unit_id
              where u.alt_mecra_id = v_id and p.commitment <> 'cancelled') then
    raise notice 'PS8.1 seed: Kulüp Raket LED yüzlerinde etkin yerleşim var — DEĞİŞTİRİLMEDİ.';
    return;
  end if;

  update public.alt_mecralar
     set occupancy_mode   = 'concurrent',
         creative_seconds = 15,
         product_id       = coalesce((select id from public.products where name = 'LED Ekran'), product_id)
   where id = v_id;
end $$;

-- 2) Kulüp LED Yayın Slotları -> eski modelleme işareti.
--    Satırlar SİLİNMEZ, pasife ALINMAZ; yalnız operasyonel listeden çıkar.
update public.alt_mecralar a
   set legacy_archived = true
  from public.mecralar m
 where m.id = a.mecra_id
   and m.name = 'Çukurova Kulübü'
   and a.name = 'Kulüp LED Yayın Slotları'
   and a.legacy_archived = false;

-- 3) Doğrulama: sessiz kayma olmasın.
do $$
declare v_led int; v_ars int; v_unit int; v_book int;
begin
  select count(*) into v_led from public.alt_mecralar a join public.mecralar m on m.id = a.mecra_id
   where m.name = 'Çukurova Kulübü' and a.name = 'Kulüp Raket LED'
     and a.occupancy_mode = 'concurrent' and a.creative_seconds = 15;
  select count(*) into v_ars from public.alt_mecralar a join public.mecralar m on m.id = a.mecra_id
   where m.name = 'Çukurova Kulübü' and a.name = 'Kulüp LED Yayın Slotları' and a.legacy_archived;
  -- Eski modelleme KORUNUR: 15 yüz ve üzerlerindeki eski kayıtlar yerinde.
  select count(*) into v_unit from public.units u join public.alt_mecralar a on a.id = u.alt_mecra_id
   where a.name = 'Kulüp LED Yayın Slotları';
  select count(*) into v_book from public.bookings b join public.units u on u.id = b.unit_id
    join public.alt_mecralar a on a.id = u.alt_mecra_id where a.name = 'Kulüp LED Yayın Slotları';

  raise notice 'PS8.1 seed: Raket LED eşzamanlı=%, slot alanı arşivli=%, korunan slot yüzü=%, korunan eski kayıt=%',
    v_led, v_ars, v_unit, v_book;

  -- PS9 kapanış §1 — taşınabilirlik düzeltmesi.
  -- Bu assert'in amacı "arşivleme veri SİLMEMELİDİR" kuralını korumaktır
  -- ve yalnız alan GERÇEKTEN VARSA anlamlıdır. Şirket verisi seed'i
  -- (`20_company_data.sql`) Git dışı olduğu için temiz bir klonda
  -- `Kulüp LED Yayın Slotları` alanı hiç yoktur; koşulsuz assert orada
  -- boşluğa ateş ediyor ve `db reset`i kırıyordu. Artık önce alanın
  -- varlığı sorulur; kural alan varken aynen geçerlidir.
  if v_ars > 0 and v_unit = 0 then
    raise exception 'PS8.1 seed: eski slot yüzleri kayboldu — arşivleme veri SİLMEMELİDİR.';
  end if;
end $$;
