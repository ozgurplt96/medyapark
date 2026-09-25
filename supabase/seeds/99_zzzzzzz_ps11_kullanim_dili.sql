-- =====================================================================
-- PS11 §1 / §7 — örnek verilerde GERÇEK KULLANIM DİLİ
--
-- COMMIT'Lİ, ŞİRKET VERİSİ İÇERMEZ, İDEMPOTENT. Yalnız TOHUMLARIN kendi
-- yazdığı metinleri değiştirir; kullanıcının yazdığı nota dokunmaz.
--
-- 1. PS10 zincir işlerinin kimliği `jobs.note = 'PS10·Cx'` yerine
--    `jobs.sort` bandına (9201…) taşınır; not alanı boşaltılır (işi
--    düzenleyen kullanıcı "PS10·C1" görmesin).
-- 2. Yerleşim notlarındaki geliştirici işaretleri ("PS9U· kullanım
--    deseni 2", "PS9· süresi geçmiş opsiyon — hâlâ bloklar…") gerçek
--    kullanım cümlelerine çevrilir.
-- 3. Veri taşıma açıklamaları ("Eski LED tablosundan: şerit etiketi…",
--    "Eski aylık kayıtlardan birleştirildi") operasyon ekranından
--    kaldırılır. Köken teknik düzeyde korunur (legacy_lane, bookings.
--    superseded_by_placement_id); veri silinmez.
-- 4. Tohumların ürettiği mecra hareketlerinin dili S11 migration'ı ile
--    aynı sözlüğe getirilir ("kesin kayıt" → "yayın"). YALNIZ yerel
--    örnek veri içindir; production geçmişi bu dosyayla değişmez.
-- =====================================================================
do $$
begin
  -- 1 -------------------------------------------------------------------
  update public.jobs set sort = case note
      when 'PS10·C1' then 9201 when 'PS10·C2' then 9202 when 'PS10·C2R' then 9203
      when 'PS10·C3' then 9204 when 'PS10·C4' then 9205 when 'PS10·C5' then 9206
      when 'PS10·C6' then 9207 when 'PS10·C7' then 9208 when 'PS10·C8' then 9209
      else 9210 + nullif(substr(note, 8), '')::int end,
         note = null
   where note like 'PS10·%';

  -- 2 + 3 ---------------------------------------------------------------
  perform set_config('medyapark.medya_sessiz', '1', true);
  update public.media_placements p set note = case
      when p.note like 'PS9U· kullanım deseni%' then
        case when p.commitment = 'reserved' then 'Opsiyon — müşteri onayı bekleniyor.' else 'Dönemsel kampanya yayını.' end
      when p.note = 'PS9U· yıl sonu kampanyası'   then 'Yıl sonu kampanyası.'
      when p.note = 'PS9U· kesintisiz yenileme'   then 'Aynı müşteriyle kesintisiz yenileme.'
      when p.note = 'PS9U· gelecek rezervasyon'   then 'Gelecek dönem yayını.'
      when p.note like 'PS9U· LED kampanyası%'    then 'LED kampanyası — 15 sn kreatif.'
      when p.note = 'PS10· LED yaşam döngüsü'     then 'LED kampanyası — 15 sn kreatif.'
      when p.note = 'PS10· yaşam döngüsü' then
        case when p.commitment = 'reserved' then 'Opsiyon — müşteri bütçe onayı bekleniyor.'
             when p.contract_item_id is not null then 'Sözleşmeye bağlı kampanya yayını.' else 'Kampanya yayını.' end
      when p.note = 'PS9· geçmiş dönem, bugün boş'                       then 'Geçmiş dönem yayını.'
      when p.note = 'PS9· bitiyor ama arkasında yenileme var'           then 'Dönem sonu yaklaşıyor; yenileme sözleşmesi hazır.'
      when p.note = 'PS9· kesintisiz yenileme (ertesi gün başlar)'      then 'Kesintisiz yenileme.'
      when p.note = 'PS9· yakında boşalıyor, yenileme yok'              then 'Dönem sonunda yenileme planlanmadı.'
      when p.note like 'PS9· aynı ay,%'                                 then 'Kısa dönem yayın.'
      when p.note = 'PS9· yenileme 1/2 — aynı müşteri'                  then 'İlk dönem.'
      when p.note = 'PS9· yenileme 2/2 — kesintisiz, ayrı sözleşme'     then 'Yenileme — ayrı sözleşme.'
      when p.note = 'PS9· boşluklu yenileme 1/2'                        then 'İlk dönem.'
      when p.note like 'PS9· boşluklu yenileme 2/2%'                    then 'İkinci dönem (aradaki boşluktan sonra).'
      when p.note = 'PS9· yıl sınırını aşıyor'                          then 'Yılbaşını kapsayan yayın.'
      when p.note like 'PS9· geçerli opsiyon%'                          then 'Opsiyon — müşteri kararı bekleniyor.'
      when p.note like 'PS9· süresi geçmiş opsiyon%'                    then 'Opsiyon süresi doldu; müşteriden karar bekleniyor.'
      when p.note = 'PS9· iptal edilecek kayıt'                         then 'Müşteri vazgeçti.'
      when p.note like 'PS9· opsiyondan%'                               then 'Opsiyondan yayına çevrildi.'
      when p.note = 'PS9· ay ortası başlar, ertesi aya geçer'           then 'Ay ortası başlangıçlı yayın.'
      when p.note = 'PS9· çok lokasyonlu iş — Stadyum ayağı'            then 'Çok lokasyonlu kampanya — Stadyum.'
      when p.note = 'PS9· çok lokasyonlu iş — Esas ayağı'               then 'Çok lokasyonlu kampanya — Esas01.'
      when p.note like 'PS9· gelecek rezervasyon%'                      then 'Gelecek dönem yayını.'
      when p.note like 'PS9·%'   then nullif(btrim(substr(p.note, 5)), '')
      when p.note like 'Eski LED tablosundan:%' or p.note = 'Eski aylık kayıtlardan birleştirildi' then null
      else p.note end
   where p.note like 'PS9%·%' or p.note like 'PS10·%'
      or p.note like 'Eski LED tablosundan:%' or p.note = 'Eski aylık kayıtlardan birleştirildi';
  perform set_config('medyapark.medya_sessiz', '', true);

  -- 4 -------------------------------------------------------------------
  update public.entries set body = replace(replace(replace(body,
           ' kesin kayıt oluşturuldu', ' yayın oluşturuldu'),
           'rezervasyon (opsiyon)', 'opsiyon'),
           'kesinleşti', 'opsiyondan yayına çevrildi')
   where source = 'system' and system_kind like 'media_%'
     and (body like '%kesin kayıt%' or body like '%rezervasyon (opsiyon)%' or body like '%kesinleşti%');
end $$;

do $$
declare n_not int; n_is int;
begin
  select count(*) into n_not from public.media_placements where note like 'PS9%·%' or note like 'PS10·%';
  select count(*) into n_is from public.jobs where note like 'PS10·%';
  raise notice 'PS11 dil: geliştirici işaretli yerleşim notu %, iş notu % (beklenen 0).', n_not, n_is;
end $$;
