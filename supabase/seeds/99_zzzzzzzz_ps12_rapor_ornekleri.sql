-- =====================================================================
-- PS12 — Rapor kabul senaryoları için örnek veri
--
-- COMMIT'Lİ, ŞİRKET VERİSİ İÇERMEZ, İDEMPOTENT. Yalnız TOHUMLARIN kendi
-- kayıtlarına dokunur; kullanıcı kaydı değiştirilmez.
--
-- 1. PS10 zincir operasyonlarındaki geliştirici işareti ("PS10") not
--    alanından kaldırılır — raporda serbest not olarak görünmesin.
-- 2. İki örnek uygulayıcı kurum: "Örnek Baskı Merkezi (demo)" ve
--    "Örnek Uygulama Ekibi (demo)" (varsa yeniden oluşturulmaz).
-- 3. PS10 C5 (Raket yıl sonu lansmanı) operasyonlarına teknik alanlar
--    YALNIZ boşsa yazılır.
-- 4. Bir örnek iş (jobs.sort = 9301): referans Gürgençler / baskı-montaj
--    tablolarının ayırdığı her bilgiyi taşır — malzeme + gramaj, baskı
--    ölçüsü ≠ görünen alan, yüzey sayısı ≠ baskı adedi, "4 gün" vinç,
--    söküm, yeniden baskı, mecraya bağlı ve bağlı olmayan işlem, bir EUR
--    satırı ve 4 baskı satırını kapsayan TEK paket bedeli.
-- =====================================================================
do $$
declare
  d date := (now() at time zone 'Europe/Istanbul')::date;
  k bigint[]; t bigint[]; tn int; kurum bigint; j bigint; g bigint;
  bm bigint; ue bigint; raket bigint; mega bigint; c5 bigint; ad text;
begin
  perform set_config('timezone', 'Europe/Istanbul', true);

  -- 1 -------------------------------------------------------------------
  update public.work_operations o set note = null
    from public.jobs j
   where j.id = o.job_id and j.sort between 9201 and 9299 and o.note = 'PS10';

  -- 2 -------------------------------------------------------------------
  select id into bm from public.customers where firma = 'Örnek Baskı Merkezi (demo)' order by id limit 1;
  if bm is null then
    insert into public.customers (firma, relationship_roles, source_type)
    values ('Örnek Baskı Merkezi (demo)', '["supplier"]'::jsonb, 'demo') returning id into bm;
  end if;
  select id into ue from public.customers where firma = 'Örnek Uygulama Ekibi (demo)' order by id limit 1;
  if ue is null then
    insert into public.customers (firma, relationship_roles, source_type)
    values ('Örnek Uygulama Ekibi (demo)', '["supplier"]'::jsonb, 'demo') returning id into ue;
  end if;

  -- 3 -------------------------------------------------------------------
  select id into c5 from public.jobs where sort = 9206;
  if c5 is not null then
    update public.work_operations set material = 'Işıklı vinil', grammage_gsm = 440,
           dimensions = '101 x 157 cm', visible_size = '96 x 150 cm', surface_count = 4,
           supplier_org_id = coalesce(supplier_org_id, bm), unit_cost = 60, cost = 240
     where job_id = c5 and operation_type = 'baski' and material is null;
    update public.work_operations set supplier_org_id = coalesce(supplier_org_id, ue),
           location_text = coalesce(location_text, 'M1 AVM'), cost = coalesce(cost, 1200)
     where job_id = c5 and operation_type = 'montaj' and supplier_org_id is null;
  end if;

  -- 4 -------------------------------------------------------------------
  select array_agg(id order by id) into k
    from (select id from public.customers where active and coalesce(source_type,'') <> 'demo'
           order by id limit 10) x;
  select array_agg(id order by id) into t from public.team where active;
  tn := coalesce(array_length(t, 1), 0);
  if coalesce(array_length(k, 1), 0) = 0 or tn = 0 then
    raise notice 'PS12 rapor örnekleri: kurum ya da ekip yok — örnek iş atlandı.';
    return;
  end if;
  kurum := coalesce(k[9], k[1]);

  select u.id into raket
    from public.units u join public.alt_mecralar a on a.id = u.alt_mecra_id
    join public.mecralar m on m.id = a.mecra_id
   where m.name like 'M1%' and a.name ilike '%raket%' and coalesce(u.active, true)
   order by u.name limit 1;
  select u.id into mega
    from public.units u join public.alt_mecralar a on a.id = u.alt_mecra_id
    join public.mecralar m on m.id = a.mecra_id
   where m.name like 'M1%' and a.name ilike '%megalight%' and coalesce(u.active, true)
   order by u.name limit 1;

  select id into j from public.jobs where sort = 9301;
  if j is null then
    ad := regexp_replace((select firma from public.customers where id = kurum), '^(\S+(\s\S+)?).*$', '\1');
    insert into public.jobs (title, customer_id, status, lifecycle_status, assignee_id, sort, start_day)
    values (ad || ' · Lansman baskı ve montaj paketi', kurum, 'baski', 'acik', t[1 + 2 % tn], 9301, d - 12)
    returning id into j;
    insert into public.work_followers (job_id, team_id)
    select j, x from unnest(t) x on conflict do nothing;
  end if;

  if not exists (select 1 from public.work_operations where job_id = j) then
    insert into public.operation_price_groups (job_id, label, cost_amount, sale_amount, currency, note)
    values (j, 'Lansman baskı paketi', 30000, 52000, 'TRY',
            'Dört baskı kaleminin anlaşılan toplam bedeli (satır tutarları toplamından farklı).')
    returning id into g;

    insert into public.work_operations
      (job_id, operation_type, status, description, quantity, quantity_unit, dimensions, visible_size,
       surface_count, material, grammage_gsm, reprint, supplier_org_id, unit_id, location_text,
       planned_date, completed_at, unit_cost, cost, sale_amount, currency, price_group_id, note)
    values
      (j, 'baski', 'done', 'Megaboard baskı', 12, 'adet', '290 x 590 cm', '282 x 583 cm',
       4, 'Önden ışıklı vinil', 420, false, bm, null, 'Baskı merkezi',
       d - 10, (d - 9) + time '17:00', 1340, 16080, null, 'TRY', g, null),
      (j, 'baski', 'done', 'Megalight baskı (M1)', 27, 'adet', '255 x 363 cm', '252 x 350 cm',
       9, 'Önden ışıklı fiber kağıt', 120, false, bm, mega, null,
       d - 10, (d - 9) + time '17:00', 450, 12150, null, 'TRY', g, null),
      (j, 'baski', 'in_progress', 'Stadyum pano baskı', 6, 'adet', '200 x 500 cm', '190 x 490 cm',
       2, 'Avrupa vinil', 440, false, bm, null, 'Yeni Adana Stadyumu',
       d - 3, null, 560, 3360, null, 'TRY', g, null),
      (j, 'baski', 'planned', 'Raket / CLP baskı (M1)', 6, 'adet', '101 x 157 cm', '96 x 150 cm',
       2, 'Işıklı vinil', 440, false, bm, raket, null,
       d + 2, null, 60, 360, null, 'TRY', g, null),
      (j, 'montaj', 'planned', 'M1 Megalight ve Raket montajı', 11, 'adet', null, null,
       11, null, null, false, ue, mega, 'M1 AVM',
       d + 4, null, null, 3300, 4500, 'TRY', null, 'Gece montajı; AVM güvenliğine önceden bildirilecek.'),
      (j, 'montaj', 'planned', 'Stadyum pano montajı', 2, 'adet', null, null,
       2, null, null, false, ue, null, 'Yeni Adana Stadyumu',
       d + 5, null, null, 1200, 1800, 'TRY', null, null),
      (j, 'diger', 'planned', 'Vinç kiralama', 4, 'gun', null, null,
       null, null, null, false, ue, null, 'Fuar alanı',
       d + 6, null, 3000, 12000, 15000, 'TRY', null,
       'Satış fiyatı 15.000 TL + KDV; müşteriye ayrıca fatura edilecek. Vinç operatörü sabah 07:00''de sahada olmalı, fuar alanı giriş kartları uygulama ekibinde. Hava rüzgârlı olursa kurulum bir gün ertelenir ve vinç süresi uzatılmaz.'),
      (j, 'sokum', 'planned', 'Eski fuar panolarının sökümü', 3, 'adet', '600 x 300 cm', null,
       3, null, null, false, ue, null, 'Fuar alanı',
       d + 9, null, null, 4000, 5500, 'TRY', null, null),
      (j, 'baski', 'done', 'Duvar pano — ölçü revizesi', 1, 'adet', '300 x 400 cm', '290 x 390 cm',
       1, 'Avrupa vinil', 440, true, bm, null, 'A. Türkeş Bulvarı',
       d - 6, (d - 6) + time '15:00', null, 1300, 2400, 'TRY', null, 'Ölçü revizesi nedeniyle yeniden baskı.'),
      (j, 'baski', 'planned', 'Fuar standı kumaş baskı', 2, 'adet', '600 x 300 cm', null,
       1, 'Tekstil (kumaş)', 220, false, bm, null, 'Fuar alanı',
       d + 3, null, 180, 360, null, 'EUR', null, 'İthal kumaş; fiyat avro.');
  end if;

  raise notice 'PS12 rapor örnekleri: iş %, operasyon %, paket %', j,
    (select count(*) from public.work_operations where job_id = j),
    (select count(*) from public.operation_price_groups where job_id = j);
end $$;
