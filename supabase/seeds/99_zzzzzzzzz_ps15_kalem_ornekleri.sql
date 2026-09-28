-- =====================================================================
-- PS15 — Üretim kalemi örnekleri (rapor şablonları için)
--
-- COMMIT'Lİ, ŞİRKET VERİSİ İÇERMEZ, İDEMPOTENT. Yalnız TOHUMLARIN kendi
-- işlerine (jobs.sort 9201–9206 ve 9301) dokunur ve yalnız kalem anahtarı
-- BOŞ olan kayıtları bağlar. Kullanıcı kaydı değiştirilmez; eşleşme
-- isimden tahmin edilmez — hangi kaydın hangi kalemde olduğu aşağıda
-- açıkça yazılıdır.
--
--   9301 kalem A: Megalight baskı (M1) + Raket / CLP baskı (M1)
--                 + "M1 Megalight ve Raket montajı"  → ORTAK montaj
--   9301 kalem B: Stadyum pano baskı + Stadyum pano montajı
--   9301 diğerleri bağımsız: Megaboard baskı (montajı yok), duvar pano
--                 yeniden baskı, kumaş baskı (EUR), vinç (4 gün), söküm
--   9201–9206   : her işin baskısı ve montajı (9204'te söküm de) tek kalem
-- =====================================================================
do $$
declare j bigint; k uuid; n int := 0;
begin
  select id into j from public.jobs where sort = 9301;
  if j is not null then
    if not exists (select 1 from public.work_operations where job_id = j and kalem_key is not null) then
      k := gen_random_uuid();
      update public.work_operations set kalem_key = k
       where job_id = j and description in ('Megalight baskı (M1)', 'Raket / CLP baskı (M1)', 'M1 Megalight ve Raket montajı');
      get diagnostics n = row_count;
      k := gen_random_uuid();
      update public.work_operations set kalem_key = k
       where job_id = j and description in ('Stadyum pano baskı', 'Stadyum pano montajı');
    end if;
  end if;

  for j in select id from public.jobs where sort between 9201 and 9206 loop
    if not exists (select 1 from public.work_operations where job_id = j and kalem_key is not null)
       and (select count(*) from public.work_operations where job_id = j and operation_type = 'baski') = 1 then
      update public.work_operations set kalem_key = gen_random_uuid()
       where job_id = j and operation_type = 'baski';
      update public.work_operations o set kalem_key = b.kalem_key
        from public.work_operations b
       where o.job_id = j and b.job_id = j and b.operation_type = 'baski'
         and o.operation_type in ('montaj', 'sokum') and o.kalem_key is null;
    end if;
  end loop;

  raise notice 'PS15 kalem örnekleri: bağlı kayıt %', (select count(*) from public.work_operations where kalem_key is not null);
end $$;
