-- =====================================================================
-- PS10 §8 — BİRBİRİNE BAĞLI ÖRNEK İŞLER (yaşam döngüsü zincirleri)
--
-- COMMIT'Lİ, ŞİRKET VERİSİ İÇERMEZ. PS9 kullanım fixture'inin kurum
-- havuzunu (ilk 10 aktif kurum; temiz klonda "(demo)" etiketli sentetikler)
-- kullanır, envantere ve kurum kimliklerine DOKUNMAZ.
--
-- Amaç: rezervasyon çubuğu sayısını değil, İŞİN YAŞAM DÖNGÜSÜNÜ temsil
-- etmek: teklif → sözleşme → tasarım/baskı → montaj → yayın → kapanış.
-- Geçen yıl ve bu yılın ilk yarısı dahil. Zincirler:
--   C1  geçen yıl bahar · M1 Megalight + Raket · tamamlandı, muhasebe işlendi
--   C2  geçen yıl sonbahar · Stadyum Megaboard · tamamlandı
--   C2R C2'nin YENİLEMESİ: aynı yüzler, kesintisiz ayrı dönem, AYRI sözleşme
--   C3  bu yıl ilk yarı · Esas01 Ultraboard · tamamlandı
--   C4  şu an yayında · Çukurova sabit pano · muhasebe hazır
--   C5  baskı aşamasında · M1 Raket · yayın yakında
--   C6  teklif/opsiyon aşamasında · M1 Megalight · karar bekleniyor
--   C7  LED yayını · eşzamanlı alan · baskı/montaj YOK (LED statik gibi kopyalanmaz)
--   C8  kaybedilen teklif · yerleşim yok
-- + her havuz kurumu için geçen yılın arşivlenmiş yıllık kampanyası.
--
-- Belgeler (gerçek, açılabilir örnek dosyalar) bu dosyada DEĞİL:
-- `scripts/dev-seed-documents.ps1` dosyaları yerel depoya yükler ve
-- `supabase/seed-files/ps10/documents.sql` ile bağlar (SQL tek başına
-- depoya dosya koyamaz).
--
-- DETERMİNİSTİK + İDEMPOTENT: her zincir `jobs.sort` bandıyla (9201…) tanınır (S11: not alanı işaret taşımaz)
-- işaretiyle bir kez kurulur; kullanıcı kayıtları EZİLMEZ. Yüzeyler
-- çakışma denetimiyle (media_conflicts) seçilir; dolu yüze yazılmaz.
--
-- Sistem hareketleri tetikleyicilerden GERÇEKTEN üretilir; yalnız zamanı
-- ve aktörü iş tarihine göre geriye alınır (tohum anında "bugün"
-- oluşmuş gibi görünmesinler diye).
-- =====================================================================

create or replace function pg_temp.ps10_yuzler(p_mecra text, p_urun text, p_bas date, p_bit date, p_n int, p_kay int default 0)
returns bigint[] language sql as $$
  -- p_kay: aday listesini döndürür; her zincir aynı ilk boş yüzlere
  -- (P1/P2) yığılmaz, geçmiş takvime dengeli yayılır.
  select coalesce(array_agg(id order by sira), '{}') from (
    select id, (rn - 1 + p_kay) % greatest(cnt, 1) as sira from (
    select u.id, row_number() over (order by u.sort, u.id) rn, count(*) over () cnt
      from public.units u
      join public.alt_mecralar a on a.id = u.alt_mecra_id
      join public.mecralar m on m.id = a.mecra_id
      left join public.products p on p.id = coalesce(u.product_id, a.product_id)
     where m.name ilike p_mecra and coalesce(p.name, a.name) ilike p_urun
       and u.active and a.occupancy_mode = 'exclusive' and not a.legacy_archived
       and not exists (select 1 from public.media_conflicts(u.id, p_bas, p_bit))
    ) a order by 2 limit p_n) x;
$$;

-- S11: zincir kimliği `jobs.sort` bandında (9201…); kullanıcıya görünen not
-- alanı işaret taşımaz.
create or replace function pg_temp.ps10_bant(p_key text) returns int language sql immutable as $$
  select case p_key when 'C1' then 9201 when 'C2' then 9202 when 'C2R' then 9203 when 'C3' then 9204
    when 'C4' then 9205 when 'C5' then 9206 when 'C6' then 9207 when 'C7' then 9208 when 'C8' then 9209
    else 9210 + nullif(substr(p_key, 3), '')::int end;
$$;

create or replace function pg_temp.ps10_is(p_key text, p_title text, p_cust bigint, p_owner bigint,
                                           p_status text, p_lokal date)
returns bigint language plpgsql as $$
declare v bigint;
begin
  select id into v from public.jobs where sort = pg_temp.ps10_bant(p_key)
     or note = 'PS10·' || p_key;                    -- S11 öncesi işaret
  if v is not null then return null; end if;             -- zaten kurulu: zinciri atla
  insert into public.jobs (title, customer_id, status, lifecycle_status, assignee_id, sort, start_day)
  values (p_title, p_cust, p_status, 'acik', p_owner, pg_temp.ps10_bant(p_key), p_lokal)
  returning id into v;
  insert into public.work_parties (job_id, customer_id, role) values (v, p_cust, 'account')
  on conflict do nothing;
  insert into public.work_followers (job_id, team_id) values (v, p_owner) on conflict do nothing;
  return v;
end $$;

create or replace function pg_temp.ps10_not(p_job bigint, p_team bigint, p_at timestamptz, p_body text)
returns void language sql as $$
  insert into public.entries (job_id, body, source, created_by_team_id, occurred_at)
  values (p_job, p_body, 'manual', p_team, p_at);
$$;

create or replace function pg_temp.ps10_soz(p_job bigint, p_cust bigint, p_title text, p_ref text,
                                            p_signed date, p_status text)
returns bigint language sql as $$
  insert into public.contracts (customer_id, job_id, title, reference_no, status, signed_at,
                                currency, vat_mode, vat_rate, payment_terms, note)
  values (p_cust, p_job, p_title, p_ref, p_status, p_signed, 'TRY', 'haric', 20,
          'Örnek: yayın başında %50, bitişte %50.', 'Örnek sözleşme kaydı (demo).')
  returning id;
$$;

create or replace function pg_temp.ps10_kalem(p_c bigint, p_type text, p_desc text, p_mecra bigint,
                                              p_qty numeric, p_bas date, p_bit date, p_birim numeric, p_sort int)
returns bigint language sql as $$
  insert into public.contract_items (contract_id, item_type, description, mecra_id, quantity,
                                     start_date, end_date, unit_price, sort)
  values (p_c, p_type, p_desc, p_mecra, p_qty, p_bas, p_bit, nullif(p_birim, 0), p_sort)
  returning id;
$$;

create or replace function pg_temp.ps10_mecra(p_like text) returns bigint language sql as $$
  select id from public.mecralar where name ilike p_like order by id limit 1;
$$;

-- Tek ifade = tek "N yüzey için … oluşturuldu" hareketi (PS8 kuralı).
create or replace function pg_temp.ps10_yer(p_job bigint, p_cust bigint, p_units bigint[], p_bas date,
                                            p_bit date, p_taah text, p_item bigint, p_ops date, p_team bigint)
returns int language plpgsql as $$
declare n int;
begin
  if coalesce(array_length(p_units, 1), 0) = 0 then return 0; end if;
  insert into public.media_placements (unit_id, customer_id, work_id, commitment, start_date, end_date,
                                       contract_item_id, option_expires_at, note, created_by_team_id)
  select u, p_cust, p_job, p_taah, p_bas, p_bit, p_item, p_ops,
         case when p_taah = 'reserved' then 'Opsiyon — müşteri bütçe onayı bekleniyor.'
              when p_item is not null then 'Sözleşmeye bağlı kampanya yayını.' else 'Kampanya yayını.' end, p_team
    from unnest(p_units) u;
  get diagnostics n = row_count;
  return n;
end $$;

-- Sistem hareketlerini iş tarihine ve iş sahibine taşır. Aşama/iş durumu
-- hareketleri oluşma SIRASIYLA verilen tarihlere eşlenir.
create or replace function pg_temp.ps10_tarihle(p_w bigint, p_job bigint, p_actor bigint,
    p_olustu timestamptz, p_ticari timestamptz, p_fazlar timestamptz[], p_durum timestamptz[])
returns void language plpgsql as $$
begin
  update public.entries e set created_by_team_id = p_actor,
    occurred_at = case
      when e.system_kind = 'work_created' then p_olustu
      when e.system_kind in ('contract_created','contract_signed','work_contract','media_created') then p_ticari
      when e.system_kind = 'operation_created' then
        coalesce((select (o.planned_date - 5)::timestamp + time '10:30' from public.work_operations o where o.id = e.work_operation_id), p_ticari)
      when e.system_kind = 'operation_status' then
        coalesce((select o.completed_at from public.work_operations o where o.id = e.work_operation_id),
                 (select o.planned_date::timestamp + time '09:00' from public.work_operations o where o.id = e.work_operation_id))
      else e.occurred_at end
   where e.id > p_w and e.source = 'system' and e.job_id = p_job;
  -- Sıralı olaylar: aşama ve iş durumu
  update public.entries e set occurred_at = p_fazlar[x.n]
    from (select id, row_number() over (order by id) n from public.entries
           where id > p_w and job_id = p_job and system_kind = 'work_phase') x
   where e.id = x.id and x.n <= coalesce(array_length(p_fazlar, 1), 0);
  update public.entries e set occurred_at = p_durum[x.n]
    from (select id, row_number() over (order by id) n from public.entries
           where id > p_w and job_id = p_job and system_kind in ('work_lifecycle','work_accounting')) x
   where e.id = x.id and x.n <= coalesce(array_length(p_durum, 1), 0);
end $$;

do $$
declare
  d date := (now() at time zone 'Europe/Istanbul')::date;
  y int := extract(year from d)::int;
  gy int := y - 1;
  k bigint[]; kn int; t bigint[]; tn int;
  m1 bigint; st bigint; es bigint; cu bigint;
  j bigint; c bigint; i1 bigint; i2 bigint; i3 bigint; w bigint;
  f1 bigint[]; f2 bigint[]; o1 bigint; o2 bigint; led bigint;
  ad text; bas date; bit date; ix int; toplam int := 0;
  ts timestamptz;
begin
  -- "10:15" gibi saatler YEREL iş saatidir; tarih+saat → timestamptz
  -- dönüşümü oturum saat dilimini kullanır (varsayılan UTC).
  perform set_config('timezone', 'Europe/Istanbul', true);
  -- Tohum sırasında hareketlerin aktörü sonradan iş sahibine taşınır;
  -- köken koruması yalnız bu blokta kapatılır (istemci yolu DEĞİŞMEZ).
  execute 'alter table public.entries disable trigger trg_entries_koken_sabit';

  select array_agg(id order by id) into k
    from (select id from public.customers where active order by id limit 10) x;
  kn := coalesce(array_length(k, 1), 0);
  select array_agg(id order by id) into t from public.team where active;
  tn := coalesce(array_length(t, 1), 0);
  if kn < 8 or tn = 0 then
    raise notice 'PS10 zincirleri: yeterli kurum (%) ya da ekip (%) yok — atlandı.', kn, tn;
    execute 'alter table public.entries enable trigger trg_entries_koken_sabit';
    return;
  end if;
  m1 := pg_temp.ps10_mecra('M1%');
  st := pg_temp.ps10_mecra('%Stadyum%');
  es := pg_temp.ps10_mecra('Esas01%');
  cu := pg_temp.ps10_mecra('%ukurova%');

  -------------------------------------------------------------------- 0
  -- PS9 kullanım fixture'i onarımı: "ilk yarı kampanyası" işi yıl sonu
  -- kayıtlarına, "ikinci yarı" işi ocak kayıtlarına bağlanıyordu. Yalnız
  -- tohumun KENDİ kayıtları (`note like 'PS9U·%'`) aynı kurumun doğru
  -- dönem işine taşınır; kullanıcı kaydına dokunulmaz.
  perform set_config('medyapark.medya_sessiz', '1', true);
  update public.media_placements p set work_id = h2.id
    from public.jobs h1, public.jobs h2
   where p.note like 'PS9U·%' and p.work_id = h1.id
     and h1.title like '% · ' || y || ' ilk yarı kampanyası'
     and h2.customer_id = h1.customer_id and h2.title like '% · ' || y || ' ikinci yarı kampanyası'
     and p.start_date >= make_date(y, 7, 1);
  update public.media_placements p set work_id = h1.id
    from public.jobs h1, public.jobs h2
   where p.note like 'PS9U·%' and p.work_id = h2.id
     and h2.title like '% · ' || y || ' ikinci yarı kampanyası'
     and h1.customer_id = h2.customer_id and h1.title like '% · ' || y || ' ilk yarı kampanyası'
     and p.start_date < make_date(y, 7, 1);
  perform set_config('medyapark.medya_sessiz', '', true);
  -- İlk yarı işi tüm kayıtları bittiyse arşivlenmiştir; ikinci yarı işi
  -- bugün yayında kaydı varsa "Yayında"dır. Tohum işinin durumu tohumca
  -- düzeltilir (aşama geçmişi gürültüsü üretmeden).
  execute 'alter table public.jobs disable trigger trg_jobs_hareket';
  update public.jobs j set lifecycle_status = 'kapandi', closed_reason = 'tamamlandi',
         status = 'yayinda_aktif', accounting_status = 'islendi'
   where j.title like '% · ' || y || ' ilk yarı kampanyası' and j.customer_id = any(k)
     and j.lifecycle_status <> 'kapandi'
     and not exists (select 1 from public.media_placements p where p.work_id = j.id
                      and p.commitment <> 'cancelled' and coalesce(p.end_date, d) >= d);
  update public.jobs j set status = 'yayinda_aktif'
   where j.title like '% · ' || y || ' ikinci yarı kampanyası' and j.customer_id = any(k)
     and j.status = 'teklif'
     and exists (select 1 from public.media_placements p where p.work_id = j.id
                  and p.commitment = 'confirmed' and p.start_date <= d and coalesce(p.end_date, d) >= d);
  -- "2 · 2026 …" gibi tek karakterli kurum kısaltmaları okunmuyordu.
  update public.jobs j set title = regexp_replace(c.firma, '^(\S+(\s\S+)?).*$', '\1')
                                 || substr(j.title, strpos(j.title, ' · '))
    from public.customers c
   where c.id = j.customer_id and j.customer_id = any(k)
     and j.title ~ ('^\S{1,3} · ' || y || ' (ilk|ikinci) yarı kampanyası$');
  execute 'alter table public.jobs enable trigger trg_jobs_hareket';

  -------------------------------------------------------------------- C1
  -- Geçen yıl bahar: teklif → sözleşme → baskı → montaj → yayın → kapanış.
  -- Birden çok ürün: M1 Megalight (2 yüz) + M1 Raket (4 yüz).
  bas := make_date(gy, 3, 1); bit := make_date(gy, 4, 30);
  select coalesce(max(id), 0) into w from public.entries;
  ad := regexp_replace((select firma from public.customers where id = k[1]), '^(\S+(\s\S+)?).*$', '\1');
  j := pg_temp.ps10_is('C1', ad || ' · ' || gy || ' bahar kampanyası', k[1], t[1 + 0 % tn], 'teklif', bas);
  if j is not null then
    perform pg_temp.ps10_not(j, t[1 + 0 % tn], make_date(gy, 2, 10) + time '10:15', 'Teklif gönderildi: M1 Megalight 2 yüz + Raket 4 yüz, Mart–Nisan.');
    perform pg_temp.ps10_not(j, t[1 + 0 % tn], make_date(gy, 2, 18) + time '16:40', 'Müşteri paketi onayladı; sözleşme hazırlanıyor.');
    c := pg_temp.ps10_soz(j, k[1], ad || ' · ' || gy || ' bahar sözleşmesi', 'ÖRN-' || gy || '-001', make_date(gy, 2, 20), 'imzali');
    i1 := pg_temp.ps10_kalem(c, 'mecra', 'M1 Megalight — çift yüz', m1, 2, bas, bit, 0, 1);
    i2 := pg_temp.ps10_kalem(c, 'mecra', 'M1 Raket / CLP', m1, 4, bas, bit, 0, 2);
    i3 := pg_temp.ps10_kalem(c, 'baski', 'Baskı ve montaj (6 yüz)', null, 6, null, null, 0, 3);
    toplam := toplam + pg_temp.ps10_yer(j, k[1], pg_temp.ps10_yuzler('M1%', 'Megalight%', bas, bit, 2), bas, bit, 'confirmed', i1, null, t[1]);
    toplam := toplam + pg_temp.ps10_yer(j, k[1], pg_temp.ps10_yuzler('M1%', 'Raket%', bas, bit, 4), bas, bit, 'confirmed', i2, null, t[1]);
    update public.jobs set status = 'baski' where id = j;
    insert into public.work_operations (job_id, operation_type, status, description, quantity, planned_date, note)
    values (j, 'baski', 'planned', 'Megalight + Raket afişleri', 6, make_date(gy, 2, 24), 'PS10'),
           (j, 'montaj', 'planned', 'M1 AVM gece montajı', 6, make_date(gy, 2, 28), 'PS10');
    select min(id), max(id) into o1, o2 from public.work_operations where job_id = j;
    perform pg_temp.ps10_not(j, t[1 + 3 % tn], make_date(gy, 2, 23) + time '11:00', 'Baskı dosyası müşteri tarafından onaylandı, matbaaya gönderildi.');
    update public.work_operations set status = 'done', completed_at = make_date(gy, 2, 26) + time '15:00' where id = o1;
    update public.jobs set status = 'montaj' where id = j;
    update public.work_operations set status = 'done', completed_at = make_date(gy, 2, 28) + time '23:30' where id = o2;
    perform pg_temp.ps10_not(j, t[1 + 3 % tn], make_date(gy, 3, 1) + time '09:20', 'Montaj tamamlandı; uygulama fotoğrafları eklendi.');
    update public.jobs set status = 'yayinda_aktif' where id = j;
    perform pg_temp.ps10_not(j, t[1 + 0 % tn], make_date(gy, 4, 30) + time '17:00', 'Yayın dönemi bitti; söküm 2 Mayıs gecesi.');
    update public.jobs set accounting_status = 'islendi',
           accounting_sent_at = make_date(gy, 5, 3) + time '10:00', accounting_processed_at = make_date(gy, 5, 8) + time '14:00' where id = j;
    update public.jobs set lifecycle_status = 'kapandi', closed_reason = 'tamamlandi' where id = j;
    perform pg_temp.ps10_tarihle(w, j, t[1 + 0 % tn], make_date(gy, 2, 5) + time '09:30', make_date(gy, 2, 20) + time '14:00',
      array[make_date(gy, 2, 22) + time '10:00', make_date(gy, 2, 27) + time '09:00', make_date(gy, 3, 1) + time '09:00']::timestamptz[],
      array[make_date(gy, 5, 3) + time '10:00', make_date(gy, 5, 8) + time '14:05']::timestamptz[]);
  end if;

  -------------------------------------------------------------------- C2 + C2R
  -- Geçen yıl sonbahar Stadyum; ardından AYNI yüzlerde kesintisiz,
  -- ayrı dönem ve AYRI sözleşmeyle yenileme.
  bas := make_date(gy, 9, 1); bit := make_date(gy, 11, 30);
  f1 := pg_temp.ps10_yuzler('%Stadyum%', 'Megaboard%', bas, make_date(y, 2, 28), 2);
  select coalesce(max(id), 0) into w from public.entries;
  ad := regexp_replace((select firma from public.customers where id = k[2]), '^(\S+(\s\S+)?).*$', '\1');
  j := pg_temp.ps10_is('C2', ad || ' · ' || gy || ' sonbahar stadyum', k[2], t[1 + 1 % tn], 'teklif', bas);
  if j is not null then
    perform pg_temp.ps10_not(j, t[1 + 1 % tn], make_date(gy, 8, 12) + time '11:00', 'Stadyum Megaboard teklifi iletildi (sezon açılışı).');
    c := pg_temp.ps10_soz(j, k[2], ad || ' · Stadyum ' || gy || ' sonbahar', 'ÖRN-' || gy || '-014', make_date(gy, 8, 22), 'imzali');
    i1 := pg_temp.ps10_kalem(c, 'mecra', 'Stadyum Megaboard', st, 2, bas, bit, 0, 1);
    toplam := toplam + pg_temp.ps10_yer(j, k[2], f1, bas, bit, 'confirmed', i1, null, t[1 + 1 % tn]);
    update public.jobs set status = 'baski' where id = j;
    insert into public.work_operations (job_id, operation_type, status, description, quantity, planned_date, note)
    values (j, 'baski', 'planned', 'Megaboard vinil baskı', 2, make_date(gy, 8, 27), 'PS10'),
           (j, 'montaj', 'planned', 'Stadyum iskele montajı', 2, make_date(gy, 8, 31), 'PS10');
    select min(id), max(id) into o1, o2 from public.work_operations where job_id = j;
    update public.work_operations set status = 'done', completed_at = make_date(gy, 8, 28) + time '16:00' where id = o1;
    update public.jobs set status = 'montaj' where id = j;
    update public.work_operations set status = 'done', completed_at = make_date(gy, 8, 31) + time '18:30' where id = o2;
    update public.jobs set status = 'yayinda_aktif' where id = j;
    perform pg_temp.ps10_not(j, t[1 + 1 % tn], make_date(gy, 11, 18) + time '15:10', 'Müşteri aynı yüzlerle kış dönemi için yenilemek istiyor.');
    update public.jobs set accounting_status = 'islendi', accounting_sent_at = make_date(gy, 12, 2) + time '10:00',
           accounting_processed_at = make_date(gy, 12, 6) + time '12:00' where id = j;
    update public.jobs set lifecycle_status = 'kapandi', closed_reason = 'tamamlandi' where id = j;
    perform pg_temp.ps10_tarihle(w, j, t[1 + 1 % tn], make_date(gy, 8, 10) + time '09:00', make_date(gy, 8, 22) + time '13:00',
      array[make_date(gy, 8, 25) + time '10:00', make_date(gy, 8, 30) + time '09:00', make_date(gy, 9, 1) + time '08:30']::timestamptz[],
      array[make_date(gy, 12, 2) + time '10:00', make_date(gy, 12, 6) + time '12:05']::timestamptz[]);

    -- Yenileme: ayrı iş, ayrı sözleşme, kesintisiz dönem, baskı YOK (aynı afiş kaldı).
    select coalesce(max(id), 0) into w from public.entries;
    j := pg_temp.ps10_is('C2R', ad || ' · Stadyum kış yenilemesi', k[2], t[1 + 1 % tn], 'teklif', make_date(gy, 12, 1));
    if j is not null then
      perform pg_temp.ps10_not(j, t[1 + 1 % tn], make_date(gy, 11, 20) + time '10:00', 'Yenileme: aynı iki Megaboard, 1 Aralık – 28 Şubat. Afiş değişmiyor.');
      c := pg_temp.ps10_soz(j, k[2], ad || ' · Stadyum yenileme (kış)', 'ÖRN-' || gy || '-014-Y', make_date(gy, 11, 26), 'imzali');
      i1 := pg_temp.ps10_kalem(c, 'mecra', 'Stadyum Megaboard — yenileme', st, 2, make_date(gy, 12, 1), make_date(y, 2, 28), 0, 1);
      toplam := toplam + pg_temp.ps10_yer(j, k[2], f1, make_date(gy, 12, 1), make_date(y, 2, 28), 'confirmed', i1, null, t[1 + 1 % tn]);
      update public.jobs set status = 'yayinda_aktif' where id = j;
      update public.jobs set accounting_status = 'islendi', accounting_sent_at = make_date(y, 3, 2) + time '10:00',
             accounting_processed_at = make_date(y, 3, 6) + time '11:00' where id = j;
      update public.jobs set lifecycle_status = 'kapandi', closed_reason = 'tamamlandi' where id = j;
      perform pg_temp.ps10_tarihle(w, j, t[1 + 1 % tn], make_date(gy, 11, 20) + time '09:30', make_date(gy, 11, 26) + time '15:00',
        array[make_date(gy, 12, 1) + time '08:30']::timestamptz[],
        array[make_date(y, 3, 2) + time '10:00', make_date(y, 3, 6) + time '11:05']::timestamptz[]);
    end if;
  end if;

  -------------------------------------------------------------------- C3
  -- Bu yıl ilk yarı · Esas01 Ultraboard · tamamlandı, muhasebeye gönderildi.
  bas := make_date(y, 3, 15); bit := make_date(y, 5, 31);
  select coalesce(max(id), 0) into w from public.entries;
  ad := regexp_replace((select firma from public.customers where id = k[3]), '^(\S+(\s\S+)?).*$', '\1');
  j := pg_temp.ps10_is('C3', ad || ' · ' || y || ' ilk yarı Esas01', k[3], t[1 + 2 % tn], 'teklif', bas);
  if j is not null then
    perform pg_temp.ps10_not(j, t[1 + 2 % tn], make_date(y, 2, 24) + time '10:30', 'Esas01 Ultraboard teklifi gönderildi.');
    c := pg_temp.ps10_soz(j, k[3], ad || ' · Esas01 ' || y || ' ilk yarı', 'ÖRN-' || y || '-006', make_date(y, 3, 3), 'imzali');
    i1 := pg_temp.ps10_kalem(c, 'mecra', 'Esas01 Ultraboard', es, 2, bas, bit, 0, 1);
    toplam := toplam + pg_temp.ps10_yer(j, k[3], pg_temp.ps10_yuzler('Esas01%', 'Ultraboard%', bas, bit, 2), bas, bit, 'confirmed', i1, null, t[1 + 2 % tn]);
    update public.jobs set status = 'baski' where id = j;
    insert into public.work_operations (job_id, operation_type, status, description, quantity, planned_date, note)
    values (j, 'baski', 'planned', 'Ultraboard baskı', 2, make_date(y, 3, 10), 'PS10'),
           (j, 'montaj', 'planned', 'Esas01 montaj', 2, make_date(y, 3, 14), 'PS10'),
           (j, 'sokum', 'planned', 'Dönem sonu söküm', 2, make_date(y, 6, 1), 'PS10');
    select min(id) into o1 from public.work_operations where job_id = j;
    update public.work_operations set status = 'done', completed_at = (planned_date + 1) + time '17:00' where job_id = j;
    update public.jobs set status = 'montaj' where id = j;
    update public.jobs set status = 'yayinda_aktif' where id = j;
    perform pg_temp.ps10_not(j, t[1 + 2 % tn], make_date(y, 3, 15) + time '09:00', 'Montaj fotoğrafı müşteriye iletildi; yayın başladı.');
    perform pg_temp.ps10_not(j, t[1 + 4 % tn], make_date(y, 6, 3) + time '10:00', 'Söküm tamamlandı. Fatura bilgileri muhasebeye iletildi.');
    update public.jobs set accounting_status = 'gonderildi', accounting_sent_at = make_date(y, 6, 3) + time '10:00' where id = j;
    update public.jobs set lifecycle_status = 'kapandi', closed_reason = 'tamamlandi' where id = j;
    perform pg_temp.ps10_tarihle(w, j, t[1 + 2 % tn], make_date(y, 2, 20) + time '09:00', make_date(y, 3, 3) + time '12:00',
      array[make_date(y, 3, 5) + time '10:00', make_date(y, 3, 13) + time '09:00', make_date(y, 3, 15) + time '08:30']::timestamptz[],
      array[make_date(y, 6, 3) + time '10:05', make_date(y, 6, 5) + time '09:00']::timestamptz[]);
  end if;

  -------------------------------------------------------------------- C4
  -- Şu an yayında · Çukurova sabit pano · muhasebe hazır.
  bas := d - 40; bit := d + 50;
  select coalesce(max(id), 0) into w from public.entries;
  ad := regexp_replace((select firma from public.customers where id = k[4]), '^(\S+(\s\S+)?).*$', '\1');
  j := pg_temp.ps10_is('C4', ad || ' · Çukurova kulüp sezonu', k[4], t[1 + 3 % tn], 'teklif', bas);
  if j is not null then
    perform pg_temp.ps10_not(j, t[1 + 3 % tn], (bas - 25) + time '10:00', 'Kulüp sezonu için 3 sabit pano teklifi iletildi.');
    c := pg_temp.ps10_soz(j, k[4], ad || ' · Çukurova sezon sözleşmesi', 'ÖRN-' || y || '-021', bas - 14, 'imzali');
    i1 := pg_temp.ps10_kalem(c, 'mecra', 'Çukurova Kulübü sabit pano', cu, 3, bas, bit, 0, 1);
    toplam := toplam + pg_temp.ps10_yer(j, k[4], pg_temp.ps10_yuzler('%ukurova%', '%', bas, bit, 3), bas, bit, 'confirmed', i1, null, t[1 + 3 % tn]);
    update public.jobs set status = 'baski' where id = j;
    insert into public.work_operations (job_id, operation_type, status, description, quantity, planned_date, note)
    values (j, 'baski', 'planned', 'Sabit pano baskı', 3, bas - 6, 'PS10'),
           (j, 'montaj', 'planned', 'Kulüp girişi montaj', 3, bas - 1, 'PS10');
    update public.work_operations set status = 'done', completed_at = planned_date + time '18:00' where job_id = j;
    update public.jobs set status = 'montaj' where id = j;
    update public.jobs set status = 'yayinda_aktif' where id = j;
    perform pg_temp.ps10_not(j, t[1 + 3 % tn], bas + time '09:30', 'Montaj tamam, fotoğraflar eklendi. Yayın başladı.');
    perform pg_temp.ps10_not(j, t[1 + 4 % tn], (d - 3) + time '11:00', 'Ara fatura için muhasebe bilgileri hazır.');
    update public.jobs set accounting_status = 'hazir' where id = j;
    perform pg_temp.ps10_tarihle(w, j, t[1 + 3 % tn], (bas - 26) + time '09:00', (bas - 14) + time '12:00',
      array[(bas - 10) + time '10:00', (bas - 2) + time '09:00', bas + time '08:30']::timestamptz[],
      array[(d - 3) + time '11:05']::timestamptz[]);
  end if;

  -------------------------------------------------------------------- C5
  -- Baskı aşamasında: sözleşme imzalı, baskı sürüyor, montaj planlı.
  bas := d + 12; bit := d + 60;
  select coalesce(max(id), 0) into w from public.entries;
  ad := regexp_replace((select firma from public.customers where id = k[5]), '^(\S+(\s\S+)?).*$', '\1');
  j := pg_temp.ps10_is('C5', ad || ' · Raket yıl sonu lansmanı', k[5], t[1 + 4 % tn], 'teklif', bas);
  if j is not null then
    perform pg_temp.ps10_not(j, t[1 + 4 % tn], (d - 15) + time '10:00', 'Yıl sonu lansmanı için 4 Raket teklifi gönderildi.');
    c := pg_temp.ps10_soz(j, k[5], ad || ' · Raket lansman sözleşmesi', 'ÖRN-' || y || '-033', d - 6, 'imzali');
    i1 := pg_temp.ps10_kalem(c, 'mecra', 'M1 Raket / CLP', m1, 4, bas, bit, 0, 1);
    toplam := toplam + pg_temp.ps10_yer(j, k[5], pg_temp.ps10_yuzler('M1%', 'Raket%', bas, bit, 4), bas, bit, 'confirmed', i1, null, t[1 + 4 % tn]);
    update public.jobs set status = 'baski' where id = j;
    insert into public.work_operations (job_id, operation_type, status, description, quantity, planned_date, note)
    values (j, 'baski', 'planned', 'Raket afiş baskısı', 4, d + 4, 'PS10'),
           (j, 'montaj', 'planned', 'M1 Raket montajı', 4, d + 11, 'PS10');
    select min(id) into o1 from public.work_operations where job_id = j;
    update public.work_operations set status = 'in_progress' where id = o1;
    perform pg_temp.ps10_not(j, t[1 + 3 % tn], (d - 2) + time '15:30', 'Tasarım onaylandı; baskı matbaada.');
    perform pg_temp.ps10_tarihle(w, j, t[1 + 4 % tn], (d - 16) + time '09:00', (d - 6) + time '12:00',
      array[(d - 3) + time '10:00']::timestamptz[], array[]::timestamptz[]);
    update public.entries set occurred_at = (d - 1) + time '09:10'
     where id > w and job_id = j and system_kind = 'operation_status';
  end if;

  -------------------------------------------------------------------- C6
  -- Teklif / opsiyon aşamasında; karar bekleniyor.
  bas := d + 30; bit := d + 75;
  select coalesce(max(id), 0) into w from public.entries;
  ad := regexp_replace((select firma from public.customers where id = k[6]), '^(\S+(\s\S+)?).*$', '\1');
  j := pg_temp.ps10_is('C6', ad || ' · Megalight yeni yıl teklifi', k[6], t[1 + 0 % tn], 'teklif', bas);
  if j is not null then
    perform pg_temp.ps10_not(j, t[1 + 0 % tn], (d - 2) + time '11:20', 'Yeni yıl için 2 Megalight yüzü opsiyonlandı; müşteri bütçe onayını bekliyor.');
    toplam := toplam + pg_temp.ps10_yer(j, k[6], pg_temp.ps10_yuzler('M1%', 'Megalight%', bas, bit, 2), bas, bit, 'reserved', null, d + 7, t[1 + 0 % tn]);
    insert into public.entries (job_id, body, source, created_by_team_id, occurred_at, action_status, assignee_id, due_at)
    values (j, 'Müşteriyi ara: bütçe onayı ve opsiyon süresi', 'manual', t[1 + 0 % tn], (d - 2) + time '11:25',
            'open', t[1 + 0 % tn], (d + 5) + time '10:00');
    update public.jobs set lifecycle_status = 'bekliyor' where id = j;
    perform pg_temp.ps10_tarihle(w, j, t[1 + 0 % tn], (d - 3) + time '09:00', (d - 2) + time '11:30',
      array[]::timestamptz[], array[(d - 2) + time '11:40']::timestamptz[]);
  end if;

  -------------------------------------------------------------------- C7
  -- LED: eşzamanlı ALANA bağlanır; baskı/montaj yoktur. Kreatif 15 sn.
  select a.id into led from public.alt_mecralar a join public.mecralar m on m.id = a.mecra_id
   where m.operational and a.occupancy_mode = 'concurrent' and not a.legacy_archived order by a.id limit 1;
  bas := d - 20; bit := d + 40;
  select coalesce(max(id), 0) into w from public.entries;
  ad := regexp_replace((select firma from public.customers where id = k[7]), '^(\S+(\s\S+)?).*$', '\1');
  if led is not null then
    j := pg_temp.ps10_is('C7', ad || ' · LED sonbahar yayını', k[7], t[1 + 1 % tn], 'teklif', bas);
    if j is not null then
      perform pg_temp.ps10_not(j, t[1 + 1 % tn], (bas - 12) + time '10:00', 'LED yayın teklifi: 15 sn kreatif, 8 hafta.');
      c := pg_temp.ps10_soz(j, k[7], ad || ' · LED yayın sözleşmesi', 'ÖRN-' || y || '-027', bas - 6, 'imzali');
      i1 := pg_temp.ps10_kalem(c, 'mecra', 'LED yayını — 15 sn kreatif', (select mecra_id from public.alt_mecralar where id = led), 1, bas, bit, 0, 1);
      insert into public.media_placements (alt_mecra_id, customer_id, work_id, commitment, start_date, end_date,
                                           contract_item_id, note, created_by_team_id)
      values (led, k[7], j, 'confirmed', bas, bit, i1, 'LED kampanyası — 15 sn kreatif.', t[1 + 1 % tn]);
      toplam := toplam + 1;
      perform pg_temp.ps10_not(j, t[1 + 1 % tn], (bas - 3) + time '16:00', 'Kreatif (15 sn) yayın ekibine iletildi; baskı/montaj gerekmiyor.');
      update public.jobs set status = 'yayinda_aktif' where id = j;
      perform pg_temp.ps10_tarihle(w, j, t[1 + 1 % tn], (bas - 13) + time '09:00', (bas - 6) + time '12:00',
        array[bas + time '08:00']::timestamptz[], array[]::timestamptz[]);
    end if;
  end if;

  -------------------------------------------------------------------- C8
  -- Kaybedilen teklif: Work kapanır, yerleşim yoktur.
  select coalesce(max(id), 0) into w from public.entries;
  ad := regexp_replace((select firma from public.customers where id = k[8]), '^(\S+(\s\S+)?).*$', '\1');
  j := pg_temp.ps10_is('C8', ad || ' · Stadyum maç günü teklifi', k[8], t[1 + 2 % tn], 'teklif', d - 50);
  if j is not null then
    perform pg_temp.ps10_not(j, t[1 + 2 % tn], (d - 50) + time '10:00', 'Maç günleri için Ultraboard teklifi gönderildi.');
    perform pg_temp.ps10_not(j, t[1 + 2 % tn], (d - 38) + time '14:30', 'Müşteri bütçeyi dijitale kaydırdı; teklif kabul edilmedi.');
    update public.jobs set lifecycle_status = 'kapandi', closed_reason = 'kaybedildi' where id = j;
    perform pg_temp.ps10_tarihle(w, j, t[1 + 2 % tn], (d - 51) + time '09:00', (d - 50) + time '10:00',
      array[]::timestamptz[], array[(d - 38) + time '14:35']::timestamptz[]);
  end if;

  -------------------------------------------------------------------- GY
  -- Geçen yılın arşivlenmiş yıllık kampanyaları: her havuz kurumu için
  -- 2–3 yüz, farklı aylarda (deterministik). Geçmiş kayıt yoğunluğu.
  for ix in 1..kn loop
    select coalesce(max(id), 0) into w from public.entries;
    ad := regexp_replace((select firma from public.customers where id = k[ix]), '^(\S+(\s\S+)?).*$', '\1');
    j := pg_temp.ps10_is('GY' || ix, ad || ' · ' || gy || ' yıllık kampanya', k[ix], t[1 + ix % tn], 'yayinda_aktif',
                         make_date(gy, 1 + (ix * 2) % 10, 1));
    if j is null then continue; end if;
    bas := make_date(gy, 1 + (ix * 2) % 10, 1 + (ix * 3) % 12);
    bit := bas + 35 + (ix * 7) % 30;
    toplam := toplam + pg_temp.ps10_yer(j, k[ix], pg_temp.ps10_yuzler(
        case ix % 3 when 0 then 'M1%' when 1 then '%Stadyum%' else '%ukurova%' end,
        case ix % 3 when 0 then 'Raket%' else '%' end, bas, bit, 2 + ix % 2, ix * 5), bas, bit, 'confirmed', null, null, t[1 + ix % tn]);
    bas := bit + 20 + (ix * 5) % 40; bit := bas + 28;
    if bit < make_date(gy, 12, 31) then
      toplam := toplam + pg_temp.ps10_yer(j, k[ix], pg_temp.ps10_yuzler('M1%', 'Megalight%', bas, bit, 1, ix * 3), bas, bit, 'confirmed', null, null, t[1 + ix % tn]);
    end if;
    perform pg_temp.ps10_not(j, t[1 + ix % tn], make_date(gy, 12, 20) + time '16:00', gy || ' dönemi tamamlandı; yıl sonu kapanışı yapıldı.');
    update public.jobs set accounting_status = 'islendi' where id = j;
    update public.jobs set lifecycle_status = 'kapandi', closed_reason = 'tamamlandi' where id = j;
    perform pg_temp.ps10_tarihle(w, j, t[1 + ix % tn], make_date(gy, 1 + (ix * 2) % 10, 1) - 20 + time '09:00',
      make_date(gy, 1 + (ix * 2) % 10, 1) - 10 + time '12:00', array[]::timestamptz[],
      array[make_date(gy, 12, 20) + time '16:00', make_date(gy, 12, 21) + time '10:00']::timestamptz[]);
  end loop;

  -- Ertelenmiş denetimler (güncelleme içeriği vb.) şimdi çalışır; aksi halde
  -- bekleyen tetikleyici olayı varken tablo ALTER edilemez.
  set constraints all immediate;
  execute 'alter table public.entries enable trigger trg_entries_koken_sabit';
  raise notice 'PS10 zincirleri: % yerleşim üretildi (referans gün %).', toplam, d;
end $$;

-- Yerleşimi "kaydeden" tetikleyicide oturumdan (JWT) damgalanır; tohumda
-- oturum yoktur. Tohumun KENDİ yerleşimleri iş sahibine ve iş tarihine
-- (başlangıçtan 10 gün önce, bugünden ileri değil) taşınır. İdempotent.
do $$
begin
  perform set_config('medyapark.medya_sessiz', '1', true);
  -- Yalnız kaydeden/zaman düzeltilir; iş alanlarına dokunulmadığı için
  -- doğrulama tetikleyicisi YALNIZ bu ifade için kapatılır.
  execute 'alter table public.media_placements disable trigger trg_media_placements_dogrula';
  update public.media_placements p
     set created_by_team_id = j.assignee_id,
         created_at = least(p.start_date - 10, (now() at time zone 'Europe/Istanbul')::date - 1) + time '11:00'
    from public.jobs j
   where j.id = p.work_id and j.sort between 9201 and 9299
     and (p.created_by_team_id is null or p.created_at > now() - interval '1 day');
  execute 'alter table public.media_placements enable trigger trg_media_placements_dogrula';
end $$;

-- ---------------------------------------------------------------------
-- Doğrulama
-- ---------------------------------------------------------------------
do $$
declare v_cak int; v_is int; v_ter int;
begin
  select count(*) into v_cak
    from public.media_placements p1 join public.media_placements p2
      on p1.unit_id = p2.unit_id and p1.id < p2.id
     and p1.commitment <> 'cancelled' and p2.commitment <> 'cancelled'
     and daterange(p1.start_date, p1.end_date, '[]') && daterange(p2.start_date, p2.end_date, '[]')
   where p1.unit_id is not null;
  if v_cak > 0 then raise exception 'PS10: % statik çakışma.', v_cak; end if;
  select count(*) into v_is from public.jobs where sort between 9201 and 9299;
  -- Dönem adı ile yerleşim tarihi çelişmemeli: "ilk yarı" işinde 1 Temmuz sonrası kayıt yok.
  select count(*) into v_ter from public.media_placements p join public.jobs j on j.id = p.work_id
   where j.title like '% ilk yarı%' and p.start_date >= make_date(extract(year from p.start_date)::int, 7, 1)
     and j.title like '%' || extract(year from p.start_date)::int || '%';
  raise notice 'PS10: % zincir işi; ilk yarı adı/dönem çelişkisi: %', v_is, v_ter;
end $$;
