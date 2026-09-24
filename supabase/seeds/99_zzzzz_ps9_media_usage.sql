-- =====================================================================
-- PS9 görsel kabul §5 — AKTİF KULLANILAN bir sistemi temsil eden demo
--
-- COMMIT'Lİ, ŞİRKET VERİSİ İÇERMEZ. Yalnız yerleşim (kullanım) üretir;
-- envanteri ve kurum kimliklerini DEĞİŞTİRMEZ.
--
-- Neden: 104 yüzeyin yalnız birkaçında 27 kayıt bulunması "aktif
-- kullanılan sistem" görüntüsü vermiyordu. Bu dosya her ürün grubuna
-- yayılmış, geçmişi ve geleceği olan kullanım üretir.
--
-- DETERMİNİSTİK: rastgelelik yok. Desen pozisyon sırasından (`i % 6`)
-- türetilir, tarihler referans güne (`d`) görelidir. Aynı gün iki kez
-- çalıştırıldığında aynı sonucu verir ve İDEMPOTENTTİR
-- (`note like 'PS9U·%'` varsa hiç çalışmaz).
--
-- ESKİ KAYITLAR (bookings): SİLİNMEZ ve sahte kesin tarihe
-- ÇEVRİLMEZ. Demo kapsamındaki yüzeylerde, o dönemi artık kesin
-- dönemli bir yerleşim temsil ettiği için ürünün kendi geçiş alanı
-- `bookings.superseded_by_placement_id` ile işaretlenirler. Satır
-- olduğu gibi durur (ay, durum, kurum, not) ve tek SQL ile geri alınır:
--     update bookings set superseded_by_placement_id = null;
-- Bu sayede "ay bazlı / kurum belirtilmemiş / eski kayıt" ifadeleri
-- normal demo görünümünden düşer, kanıt ise kaybolmaz.
-- =====================================================================
do $$
declare
  d date := (now() at time zone 'Europe/Istanbul')::date;
  yb date; i int; n int; v_alt bigint; v_unit bigint; v_team bigint;
  v_cust bigint[]; v_job bigint[]; v_kn int;
  rec record; idx int; pat int; c1 bigint; c2 bigint; j1 bigint; j2 bigint;
  b1 date; e1 date; b2 date; e2 date; taah text; opt date;
  yeni bigint; toplam int := 0;
begin
  if exists (select 1 from public.media_placements where note like 'PS9U·%') then
    raise notice 'PS9 kullanım: zaten yüklü — atlandı.'; return;
  end if;
  yb := make_date(extract(year from d)::int, 1, 1);
  select id into v_team from public.team where active order by id limit 1;

  ------------------------------------------------------------------ 1
  -- Kurum havuzu: MEVCUT kurumlar deterministik olarak seçilir (bu
  -- makinede 531 gerçek kurum korunur, yenisi eklenmez). Temiz klonda
  -- yeterli kurum yoksa açıkça "(demo)" etiketli sentetikler üretilir.
  select array_agg(id order by id) into v_cust
    from (select id from public.customers where active order by id limit 10) x;
  v_kn := coalesce(array_length(v_cust,1),0);
  if v_kn < 6 then
    insert into public.customers (firma, active, relationship_roles, source_type)
    select 'Demo Reklamveren ' || g, true, '[]'::jsonb, 'ps9_sentetik'
      from generate_series(1,10) g
     where not exists (select 1 from public.customers c where c.firma = 'Demo Reklamveren ' || g);
    select array_agg(id order by id) into v_cust
      from (select id from public.customers where active order by id limit 10) x;
    v_kn := coalesce(array_length(v_cust,1),0);
  end if;
  if v_kn = 0 then raise notice 'PS9 kullanım: kurum yok — atlandı.'; return; end if;

  ------------------------------------------------------------------ 2
  -- İş havuzu: her kuruma İKİ dönemsel kampanya. Böylece her kayda
  -- aynı birkaç iş rastgele bağlanmaz; iş–kurum–dönem ilişkisi anlamlı.
  for i in 1..v_kn loop
    insert into public.jobs (title, customer_id, status, lifecycle_status)
    select v.t, v_cust[i], v.s, 'acik'
      from (values
        ((select coalesce(nullif(split_part(firma,' ',1),''),'Kurum') from public.customers where id=v_cust[i])
           || ' · ' || extract(year from d)::int || ' ilk yarı kampanyası', 'yayinda_aktif'),
        ((select coalesce(nullif(split_part(firma,' ',1),''),'Kurum') from public.customers where id=v_cust[i])
           || ' · ' || extract(year from d)::int || ' ikinci yarı kampanyası', 'teklif')
      ) as v(t,s)
     where not exists (select 1 from public.jobs j where j.title = v.t);
  end loop;
  select array_agg(id order by id) into v_job
    from public.jobs where title like '%kampanyası' and customer_id = any(v_cust);

  ------------------------------------------------------------------ 2b
  -- ESKİ AYLIK KAYITLARIN DEVRALINMASI
  --
  -- Ürünün kendi devralma yolu (`medyapark.eski_devral`) yalnız AYNI
  -- kurumun eski kaydını devralır; kapsamdaki eski kayıtların çoğunda
  -- kurum YOKTUR, dolayısıyla o yol onları kapsayamaz. Bu yüzden her
  -- ilgili yüzey için önce eski kayıtlarla ÇAKIŞMAYAN bir aralıkta
  -- (yıl sonu) gerçek bir demo yerleşimi oluşturulur, sonra o yüzeydeki
  -- eski aylık satırlar bu yerleşimle "devralındı" olarak işaretlenir.
  --
  -- Eski satır SİLİNMEZ, tarihi/kurumu DEĞİŞTİRİLMEZ; yalnız artık
  -- kesin dönemli yerleşimlerle temsil edildiği kaydedilir. Geri alma:
  --     update bookings set superseded_by_placement_id = null;
  for rec in
    select distinct u.id, u.sort
      from public.bookings b
      join public.units u on u.id = b.unit_id
      join public.alt_mecralar a on a.id = u.alt_mecra_id
      join public.mecralar m on m.id = a.mecra_id
     where b.superseded_by_placement_id is null
       and m.operational and a.occupancy_mode = 'exclusive' and not a.legacy_archived
       and u.active
     order by u.sort, u.id
  loop
    idx := coalesce(idx,0) + 1;
    c1 := v_cust[1 + ((idx * 5) % v_kn)];
    select id into j1 from public.jobs where customer_id = c1 and title like '%kampanyası' order by id desc limit 1;
    if j1 is null then continue; end if;
    -- Yıl sonu penceresi: kapsamdaki eski aylık kayıtlar 01–11
    -- aylarındadır, bu yüzden aralık çakışmasızdır. Başlangıç ve süre
    -- pozisyona göre DETERMİNİSTİK olarak kaydırılır; aksi halde tüm
    -- yüzeylerde aynı tarihli, yapay bir aralık sütunu oluşurdu.
    b1 := make_date(extract(year from d)::int, 12, 1) + ((idx * 3) % 12);
    e1 := b1 + 10 + ((idx * 5) % 16);
    if exists (select 1 from public.media_placements p
                where p.unit_id = rec.id and p.commitment <> 'cancelled'
                  and daterange(p.start_date, p.end_date, '[]') && daterange(b1, e1, '[]')) then
      continue;
    end if;
    insert into public.media_placements
      (unit_id, customer_id, work_id, commitment, start_date, end_date, note, created_by_team_id)
    values (rec.id, c1, j1, 'confirmed', b1, e1, 'PS9U· yıl sonu kampanyası', v_team)
    returning id into yeni;
    toplam := toplam + 1;

    update public.bookings b
       set superseded_by_placement_id = yeni
     where b.unit_id = rec.id and b.superseded_by_placement_id is null;
  end loop;

  ------------------------------------------------------------------ 3
  -- Kullanım üretimi. Desen pozisyon sırasına göre (deterministik):
  --   0 geçmişte kullanılmış, bugün boş
  --   1 bugün devam eden, ileride bitiyor
  --   2 devam eden + arkasında kesintisiz yenileme
  --   3 gelecek opsiyon
  --   4 geçmiş + arada boşluk + gelecek rezervasyon
  --   5 BİLEREK BOŞ (her yeri doldurmak hedef değil)
  -- A/B yüzleri farklı kurum ve farklı tarih alır; mekanik kopya YOK.
  idx := 0;
  for rec in
    select u.id, u.name, u.alt_mecra_id, a.occupancy_mode,
           row_number() over (partition by u.alt_mecra_id order by u.sort, u.id) rn
      from public.units u
      join public.alt_mecralar a on a.id = u.alt_mecra_id
      join public.mecralar m on m.id = a.mecra_id
     where m.operational and a.occupancy_mode = 'exclusive'
       and not a.legacy_archived and u.active
       -- Zaten PS9 senaryo fixture'inin kullandigi yuzeylere DOKUNMA
       and not exists (select 1 from public.media_placements p
                        where p.unit_id = u.id and p.note like 'PS9·%')
     order by a.id, u.sort, u.id
  loop
    idx := idx + 1;
    pat := (rec.rn::int + (case when rec.name like '%-B' then 3 else 0 end)) % 6;
    if pat = 5 then continue; end if;                         -- bilerek boş

    c1 := v_cust[1 + ((idx * 3) % v_kn)];
    c2 := v_cust[1 + ((idx * 7 + 4) % v_kn)];
    select id into j1 from public.jobs where customer_id = c1 and title like '%kampanyası' order by id limit 1;
    select id into j2 from public.jobs where customer_id = c2 and title like '%kampanyası' order by id desc limit 1;
    if j1 is null then continue; end if;
    j2 := coalesce(j2, j1);

    b1 := null; e1 := null; b2 := null; e2 := null; taah := 'confirmed'; opt := null;
    if pat = 0 then
      b1 := yb + ((idx * 11) % 60);  e1 := b1 + 25 + ((idx * 5) % 30);
      if e1 >= d then e1 := d - 7 - ((idx*3)%10); end if;
      if e1 <= b1 then e1 := b1 + 14; end if;
    elsif pat = 1 then
      b1 := d - 12 - ((idx * 7) % 40); e1 := d + 18 + ((idx * 9) % 45);
    elsif pat = 2 then
      b1 := d - 20 - ((idx * 5) % 30); e1 := d + 6 + ((idx * 3) % 10);
      b2 := e1 + 1;                    e2 := b2 + 40 + ((idx * 11) % 50);
    elsif pat = 3 then
      b1 := d + 15 + ((idx * 6) % 50); e1 := b1 + 28 + ((idx * 4) % 35);
      taah := 'reserved'; opt := d + 5 + ((idx * 2) % 20);
    else
      b1 := yb + ((idx * 13) % 45);    e1 := b1 + 20 + ((idx * 3) % 20);
      if e1 >= d - 5 then e1 := d - 20; end if;
      if e1 <= b1 then b1 := yb; e1 := yb + 20; end if;
      b2 := d + 25 + ((idx * 8) % 60); e2 := b2 + 30 + ((idx * 6) % 40);
    end if;

    /* Bu yüzeyde zaten bir kayıt varsa (ör. 2b'de oluşturulan yıl sonu
       kampanyası) çakışan desen ATLANIR. Çakışma koruması demo için
       GEVŞETİLMEZ; desen ona uyar. */
    if not exists (select 1 from public.media_placements p
                    where p.unit_id = rec.id and p.commitment <> 'cancelled'
                      and daterange(p.start_date, p.end_date, '[]') && daterange(b1, e1, '[]')) then
      insert into public.media_placements
        (unit_id, customer_id, work_id, commitment, start_date, end_date,
         option_expires_at, note, created_by_team_id)
      values (rec.id, c1, j1, taah, b1, e1, opt, 'PS9U· kullanım deseni ' || pat, v_team);
      toplam := toplam + 1;
    end if;

    if b2 is not null
       and not exists (select 1 from public.media_placements p
                        where p.unit_id = rec.id and p.commitment <> 'cancelled'
                          and daterange(p.start_date, p.end_date, '[]') && daterange(b2, e2, '[]')) then
      insert into public.media_placements
        (unit_id, customer_id, work_id, commitment, start_date, end_date, note, created_by_team_id)
      values (rec.id, case when pat = 2 then c1 else c2 end,
              case when pat = 2 then j1 else j2 end,
              'confirmed', b2, e2,
              case when pat = 2 then 'PS9U· kesintisiz yenileme' else 'PS9U· gelecek rezervasyon' end, v_team);
      toplam := toplam + 1;
    end if;
  end loop;

  ------------------------------------------------------------------ 4
  -- LED: farklı dönemlere yayılan, örtüşen kampanyalar.
  for rec in
    select a.id from public.alt_mecralar a join public.mecralar m on m.id = a.mecra_id
     where m.operational and a.occupancy_mode = 'concurrent' and not a.legacy_archived
  loop
    for i in 0..3 loop
      c1 := v_cust[1 + ((i * 3 + rec.id::int) % v_kn)];
      select id into j1 from public.jobs where customer_id = c1 and title like '%kampanyası'
       order by id limit 1 offset (i % 2);
      if j1 is null then continue; end if;
      insert into public.media_placements
        (alt_mecra_id, customer_id, work_id, commitment, start_date, end_date, note, created_by_team_id)
      values (rec.id, c1, j1,
              case when i = 3 then 'reserved' else 'confirmed' end,
              d - 60 + (i * 34), d - 60 + (i * 34) + 48 + (i * 6),
              'PS9U· LED kampanyası ' || (i + 1), v_team);
      toplam := toplam + 1;
    end loop;
  end loop;

  ------------------------------------------------------------------ 4b
  -- Eşzamanlı (LED) alanlardaki eski aylık kayıtlar da devralınır.
  -- Kampanya ALANA bağlandığı için devralan kayıt o alanın yeni
  -- yerleşimlerinden biridir; eski satır yine SİLİNMEZ.
  for rec in
    select distinct a.id
      from public.alt_mecralar a join public.mecralar m on m.id = a.mecra_id
     where m.operational and a.occupancy_mode = 'concurrent' and not a.legacy_archived
  loop
    select id into yeni from public.media_placements
     where alt_mecra_id = rec.id and note like 'PS9U·%' order by id limit 1;
    if yeni is null then continue; end if;
    update public.bookings b
       set superseded_by_placement_id = yeni
      from public.units u
     where u.id = b.unit_id and u.alt_mecra_id = rec.id
       and b.superseded_by_placement_id is null;
  end loop;

  raise notice 'PS9 kullanım: % yerleşim üretildi, % eski aylık kayıt devralındı (referans gün %).',
    toplam,
    (select count(*) from public.bookings where superseded_by_placement_id is not null), d;
end $$;

-- ---------------------------------------------------------------------
-- Doğrulama
-- ---------------------------------------------------------------------
do $$
declare v_cak int; v_kaps int; v_top int; v_eski int;
begin
  select count(*) into v_cak
    from public.media_placements p1 join public.media_placements p2
      on p1.unit_id = p2.unit_id and p1.id < p2.id
     and p1.commitment <> 'cancelled' and p2.commitment <> 'cancelled'
     and daterange(p1.start_date, p1.end_date, '[]') && daterange(p2.start_date, p2.end_date, '[]')
   where p1.unit_id is not null;
  if v_cak > 0 then
    raise exception 'PS9 kullanım: % statik çakışma — EXCLUDE kısıtı ihlal edilmiş.', v_cak;
  end if;

  select count(distinct u.id) into v_top
    from public.units u join public.alt_mecralar a on a.id = u.alt_mecra_id
    join public.mecralar m on m.id = a.mecra_id
   where m.operational and a.occupancy_mode = 'exclusive' and not a.legacy_archived and u.active;
  select count(distinct p.unit_id) into v_kaps
    from public.media_placements p join public.units u on u.id = p.unit_id
    join public.alt_mecralar a on a.id = u.alt_mecra_id
    join public.mecralar m on m.id = a.mecra_id
   where m.operational and a.occupancy_mode = 'exclusive' and not a.legacy_archived;
  raise notice 'PS9 kullanım: % statik yüzeyden %''inde kullanım var', v_top, v_kaps;

  -- Normal demo görünümünde eski/aylık kayıt KALMAMALI.
  /* Arşivlenmiş alanlar (legacy_archived) operasyonel çalışma
     yüzeyinde zaten listelenmez; denetim onları hariç tutar. */
  select count(*) into v_eski from public.media_schedule s
    join public.alt_mecralar a on a.id = s.alt_mecra_id
   where s.record_kind = 'legacy' and not a.legacy_archived
     and s.mecra_id in (select id from public.mecralar where operational);
  if v_eski > 0 then
    raise notice 'PS9 kullanım: DİKKAT — kapsam içinde hâlâ % eski kayıt görünüyor.', v_eski;
  else
    raise notice 'PS9 kullanım: kapsam içinde eski/aylık kayıt kalmadı ✓';
  end if;
end $$;
