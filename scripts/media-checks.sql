-- =====================================================================
-- Mecra envanteri ve doluluk — değişmez (invariant) denetimleri
--
-- SALT OKUNUR. Hiçbir satır yazmaz/silmez; istediğin zaman çalıştır.
-- Repo'da ayrı bir test koşucusu yoktur; doğrulama yöntemi SQL assert +
-- canlı tarayıcı QA'dir (önceki sprint notlarının tamamı bu yöntemi
-- kullanır). Bu dosya o yöntemin tekrar çalıştırılabilir parçasıdır.
--
-- Çalıştırma (PowerShell borusu UTF-8'i BOZAR — dosya kopyalanır):
--   docker cp scripts\media-checks.sql supabase_db_medyapark:/tmp/mc.sql
--   docker exec supabase_db_medyapark psql -U postgres -d postgres -f /tmp/mc.sql
--
-- Herhangi bir denetim düşerse `exception` ile durur.
-- =====================================================================
\set ON_ERROR_STOP on

do $$
declare v int; v2 int; r record;
begin
  ---------------------------------------------------------------- 1
  -- Kontrol toplamı: operasyonel kapsamda 104 aktif statik yüz.
  -- LED yüzleri sayılmaz (eşzamanlı yayın alanıdır, satılabilir yüz
  -- değildir); eski modelleme alanları da sayılmaz.
  select count(*) into v
    from public.mecralar m
    join public.alt_mecralar a on a.mecra_id = m.id
    join public.units u on u.alt_mecra_id = a.id
   where m.operational and a.occupancy_mode = 'exclusive'
     and not a.legacy_archived and u.active;
  if v <> 104 then
    raise exception 'DENETİM 1 DÜŞTÜ: aktif statik yüz % (104 bekleniyordu)', v;
  end if;
  raise notice 'DENETİM 1 ✓ aktif statik yüz = 104';

  ---------------------------------------------------------------- 2
  -- Lokasyon kırılımı: M1 82 / Stadyum 8 / Esas 4 / Çukurova 10.
  for r in
    select m.name, count(u.id) c
      from public.mecralar m
      join public.alt_mecralar a on a.mecra_id = m.id
      join public.units u on u.alt_mecra_id = a.id
     where m.operational and a.occupancy_mode = 'exclusive'
       and not a.legacy_archived and u.active
     group by m.name
  loop
    if (r.name = 'M1 Adana AVM' and r.c <> 82)
       or (r.name = 'Adana Stadyumu' and r.c <> 8)
       or (r.name = 'Esas01 Burda AVM Karşısı' and r.c <> 4)
       or (r.name = 'Çukurova Kulübü' and r.c <> 10) then
      raise exception 'DENETİM 2 DÜŞTÜ: % -> % yüz', r.name, r.c;
    end if;
  end loop;
  raise notice 'DENETİM 2 ✓ lokasyon kırılımı doğru';

  ---------------------------------------------------------------- 3
  -- Statik münhasırlık: iptal edilmemiş iki kayıt aynı yüzde
  -- ÖRTÜŞEMEZ. (EXCLUDE kısıtının gerçekten iş gördüğünü doğrular.)
  select count(*) into v
    from public.media_placements p1
    join public.media_placements p2
      on p1.unit_id = p2.unit_id and p1.id < p2.id
     and p1.commitment <> 'cancelled' and p2.commitment <> 'cancelled'
     and daterange(p1.start_date, p1.end_date, '[]') && daterange(p2.start_date, p2.end_date, '[]')
   where p1.unit_id is not null;
  if v > 0 then raise exception 'DENETİM 3 DÜŞTÜ: % statik çakışma', v; end if;
  raise notice 'DENETİM 3 ✓ statik çakışma yok';

  ---------------------------------------------------------------- 4
  -- Opsiyon son geçerliliği YALNIZ opsiyonda bulunabilir.
  select count(*) into v from public.media_placements
   where option_expires_at is not null and commitment <> 'reserved';
  if v > 0 then raise exception 'DENETİM 4 DÜŞTÜ: % kayıtta rezervasyon/iptal üzerinde opsiyon süresi var', v; end if;
  raise notice 'DENETİM 4 ✓ opsiyon süresi yalnız opsiyonlarda';

  ---------------------------------------------------------------- 5
  -- Kapsam SİLME DEĞİLDİR: kapsam dışı lokasyonların envanteri durur.
  -- S20: temiz kurulumda kapsam dışı lokasyon HİÇ yoktur (yalnız kararlaştırılmış
  -- kapsam kurulur); korunacak bir şey olmadığı için denetim uygulanmaz.
  select count(*) into v2 from public.mecralar where not operational;
  select count(*) into v from public.units u
    join public.mecralar m on m.id = u.mecra_id where not m.operational;
  if v2 = 0 then
    raise notice 'DENETİM 5 ✓ kapsam dışı lokasyon yok (temiz kurulum)';
  else
    if v = 0 then raise exception 'DENETİM 5 DÜŞTÜ: kapsam dışı envanter kaybolmuş'; end if;
    raise notice 'DENETİM 5 ✓ kapsam dışı korunan yüz = %', v;
  end if;

  ---------------------------------------------------------------- 6
  -- Public projeksiyon SÖZLEŞMESİ: müşteri kimliği ve opsiyon süresi
  -- dışarı sızmaz. Taban tabloya kolon eklemek bunu genişletmemeli.
  select count(*) into v from information_schema.columns
   where table_schema = 'public' and table_name = 'booking_availability_public'
     and column_name in ('customer_id','option_expires_at','work_id','note');
  if v > 0 then raise exception 'DENETİM 6 DÜŞTÜ: public projeksiyon % hassas kolon taşıyor', v; end if;
  select count(*) into v2 from information_schema.columns
   where table_schema = 'public' and table_name = 'booking_availability_public';
  raise notice 'DENETİM 6 ✓ public projeksiyon % kolon, hassas kolon yok', v2;

  ---------------------------------------------------------------- 7
  -- Yeni ürün türü ayrımları duruyor (§3).
  select count(*) into v from public.products
   where name in ('Megalight','Megaboard','Ultraboard','Raket / CLP','Sabit Pano','LED Ekran','Raket LED');
  if v <> 7 then raise exception 'DENETİM 7 DÜŞTÜ: 7 ürün türünden % tanesi var', v; end if;
  raise notice 'DENETİM 7 ✓ yedi ürün türü ayrı';

  ---------------------------------------------------------------- 8
  -- LED kampanyası ALANA bağlanır, fiziksel ekrana değil: hiçbir
  -- yerleşim eşzamanlı bir alanın YÜZÜNE bağlı olmamalı.
  select count(*) into v
    from public.media_placements p
    join public.units u on u.id = p.unit_id
    join public.alt_mecralar a on a.id = u.alt_mecra_id
   where a.occupancy_mode = 'concurrent';
  if v > 0 then raise exception 'DENETİM 8 DÜŞTÜ: % yerleşim LED yüzüne bağlanmış', v; end if;
  raise notice 'DENETİM 8 ✓ LED kampanyaları alana bağlı';

  raise notice '--- 8/8 DENETİM GEÇTİ ---';
end $$;
