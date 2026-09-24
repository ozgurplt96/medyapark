-- =====================================================================
-- PS9 — Mecra envanteri: operasyonel kapsam, ekran kimliği, opsiyon
--       son geçerlilik tarihi
--
-- Bu dosya YALNIZ DDL taşır. `db reset` migration'ları BOŞ veritabanına
-- uygular ve şirket verisi seed'ini SONRA yükler; bu yüzden envanter
-- VERİSİ düzeltmesi burada no-op olurdu. Veri karşılığı:
--   supabase/seeds/98_zzz_ps9_media_inventory.sql   (commit'li replay)
--
-- Canonical: 06 §12 (media domain), 08 §5. Frozen paket DEĞİŞMEDİ.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Operasyonel kapsam — mecra düzeyinde, AÇIK bir alan
--
-- Neden yeni kolon, neden `hidden` değil: `mecralar.hidden` public SİTE
-- taslak/yayın bayrağıdır (panel.js "○ Taslak / ● Yayında"; site.js
-- taslakları siteden tamamen gizler). Esas01 Burda sitede taslaktır
-- (hidden = true) ama operasyonda KAPSAM İÇİDİR. İki kavram aynı kolona
-- bindirilirse Esas'ı kapsama almak onu istemeden siteye yayınlar.
--
-- `alt_mecralar.legacy_archived` (S8.1) da bu değildir: o, bir ALANIN
-- eski modelleme olduğunu söyler. Kapsam sorusu LOKASYON düzeyindedir.
--
-- Kapsam dışı mecranın kayıtları, birimleri, eski rezervasyonları ve
-- belgeleri OLDUĞU GİBİ KALIR; yalnız aktif doluluk yüzeyinden, sayaç
-- ve yeni yerleşim seçiminden çıkar.
-- ---------------------------------------------------------------------
alter table public.mecralar
  add column if not exists operational boolean not null default true;

comment on column public.mecralar.operational is
  'Operasyonel kapsam: aktif doluluk ekranı, sayaçlar ve yeni yerleşim '
  'seçimi yalnız true olan mecraları gösterir. Public site görünürlüğü '
  'DEĞİLDİR (o `hidden`). Kapsam dışı mecranın geçmiş kayıtları korunur.';

-- ---------------------------------------------------------------------
-- 2) Fiziksel ekranın yayın çözünürlüğü — yüz/ekran düzeyinde
--
-- `products.yayin_format` ürün KATEGORİSİ içindir. Piksel çözünürlüğü
-- fiziksel ekrana özgüdür: M1 Food Court 960×640, Çukurova Raket LED
-- 768×1280. Kategoriye tek değer yazmak ikisinden birini yalanlar
-- (sprint §3: fiziksel ölçü, baskı ölçüsü ve piksel çözünürlüğü AYRI
-- özelliklerdir).
-- ---------------------------------------------------------------------
alter table public.units
  add column if not exists yayin_format text;

comment on column public.units.yayin_format is
  'Bu fiziksel ekranın yayın dosyası çözünürlüğü (ör. 960×640 px). '
  'Yalnız dijital yüzeylerde anlamlıdır; bilinmiyorsa NULL kalır — '
  'başka ekrandan KOPYALANMAZ.';

-- ---------------------------------------------------------------------
-- 3) Opsiyonun son geçerlilik tarihi ≠ reklam dönemi
--
-- `start_date`/`end_date` REKLAM DÖNEMİdir. Bir opsiyonun ayrıca kendi
-- son geçerlilik tarihi vardır ("bu opsiyon 30 Eylül'e kadar geçerli").
-- Modelde bu ayrım yoktu.
--
-- BLOKLAMA DAVRANIŞI BİLİNÇLİ OLARAK DEĞİŞMEDİ (sprint §8: "Kayıtların
-- bloke etme davranışını sessizce değiştirme"). Süresi geçmiş opsiyon
-- yüzü BLOKLAMAYA DEVAM EDER; `media_placements_no_static_overlap`
-- EXCLUDE kısıtı tarihe göre otomatik serbest bırakma yapmaz. Tarih bir
-- KARAR TETİKLEYİCİSİDİR: UI "süresi doldu" der, insan uzatır,
-- rezervasyona çevirir ya da iptal eder. Otomatik serbest bırakmak
-- sessiz çifte satış riski yaratırdı.
-- ---------------------------------------------------------------------
alter table public.media_placements
  add column if not exists option_expires_at date;

comment on column public.media_placements.option_expires_at is
  'Opsiyonun son geçerlilik tarihi — reklam dönemi (start_date/end_date) '
  'DEĞİLDİR. Yalnız commitment = reserved kayıtlarda anlamlıdır. Süresi '
  'geçmiş opsiyon yüzü bloklamaya DEVAM EDER; otomatik serbest bırakma yok.';

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'media_placements_option_expiry_only_reserved') then
    alter table public.media_placements
      add constraint media_placements_option_expiry_only_reserved
      check (option_expires_at is null or commitment = 'reserved');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4) Yazma yolu: opsiyon son geçerliliği güvenilir RPC'lerden geçer
--
-- İstemci `media_placements`e doğrudan yazmaz (S8). İki RPC de yeni
-- alanı tanımalı, aksi halde form alanı sessizce kaybolurdu.
-- ---------------------------------------------------------------------
create or replace function public.media_placement_update(p_id bigint, p_patch jsonb)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare p record; v_start date; v_end date; v_unit bigint; v_devral boolean;
        v_taah text; v_opt date; cak jsonb; n int;
begin
  if not public.is_internal() then
    raise exception 'Bu işlem için ekip üyesi olmalısınız.' using errcode = '42501';
  end if;
  select * into p from public.media_placements where id = p_id;
  if not found then raise exception 'Kayıt bulunamadı.' using errcode = 'P0002'; end if;

  v_start  := coalesce(nullif(p_patch->>'start_date', '')::date, p.start_date);
  v_end    := case when p_patch ? 'end_date' then nullif(p_patch->>'end_date', '')::date else p.end_date end;
  v_unit   := coalesce(nullif(p_patch->>'unit_id', '')::bigint, p.unit_id);
  v_devral := coalesce((p_patch->>'eski_devral')::boolean, false);
  v_taah   := coalesce(nullif(p_patch->>'commitment', ''), p.commitment);

  -- Opsiyon son geçerliliği: rezervasyona ya da iptale geçen kayıtta
  -- ANLAMSIZ hale gelir ve otomatik temizlenir. Aksi halde CHECK kısıtı
  -- kullanıcının anlamadığı bir hata verirdi (opsiyondan rezervasyona
  -- dönüşüm §8'in beklenen akışıdır).
  v_opt := case when p_patch ? 'option_expires_at'
                then nullif(p_patch->>'option_expires_at', '')::date
                else p.option_expires_at end;
  if v_taah <> 'reserved' then v_opt := null; end if;

  if v_unit is not null and v_taah <> 'cancelled' then
    select jsonb_agg(jsonb_build_object(
             'tur', x.record_kind, 'placement_id', x.placement_id, 'booking_id', x.booking_id,
             'customer_id', x.customer_id, 'firma', c.firma,
             'bas', x.block_start, 'bit', x.block_end, 'precision', x.date_precision, 'ym', x.ym,
             'devralinabilir', (x.record_kind = 'legacy' and x.customer_id = p.customer_id)))
      into cak
      from public.media_conflicts(v_unit, v_start, v_end, p_id) x
      left join public.customers c on c.id = x.customer_id
     where not (v_devral and x.record_kind = 'legacy' and x.customer_id = p.customer_id);
    if cak is not null then
      return jsonb_build_object('ok', false, 'sorunlar', jsonb_build_array(jsonb_build_object(
        'unit_id', v_unit, 'hedef', public._medya_hedef_adi(v_unit, null), 'neden', 'Çakışma',
        'cakismalar', cak)));
    end if;
  end if;

  if v_devral then perform set_config('medyapark.eski_devral', '1', true); end if;
  update public.media_placements set
    unit_id           = v_unit,
    start_date        = v_start,
    end_date          = v_end,
    commitment        = v_taah,
    option_expires_at = v_opt,
    work_id           = case when p_patch ? 'work_id' then nullif(p_patch->>'work_id', '')::bigint else work_id end,
    customer_id       = coalesce(nullif(p_patch->>'customer_id', '')::bigint, customer_id),
    contract_item_id  = case when p_patch ? 'contract_item_id'
                             then nullif(p_patch->>'contract_item_id', '')::bigint else contract_item_id end,
    note              = case when p_patch ? 'note' then nullif(trim(p_patch->>'note'), '') else note end
   where id = p_id;
  get diagnostics n = row_count;
  perform set_config('medyapark.eski_devral', '', true);
  if n = 0 then raise exception 'Bu kaydı değiştirme yetkiniz yok.' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true, 'id', p_id);
end;
$function$;

-- Toplu oluşturma: TEK değişiklik ortak alanlara `option_expires_at`
-- eklenmesidir. Doğrulama sırası, hedef başına çakışma raporu, "ya hep ya
-- hiç" davranışı, devralma ve 120 hedef sınırı S8'deki gibi KORUNDU.
create or replace function public.media_placements_create(p_common jsonb, p_targets jsonb)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  t jsonb; n int := 0; v_customer bigint; v_work bigint; v_start date; v_end date;
  v_commit text; v_devral boolean; sorun jsonb := '[]'::jsonb; cak jsonb;
  v_unit bigint; v_area bigint; v_mode text; v_active boolean; ids bigint[];
  v_seen text[] := '{}'; v_opt date;
begin
  if not public.is_internal() then
    raise exception 'Bu işlem için ekip üyesi olmalısınız.' using errcode = '42501';
  end if;
  v_work     := nullif(p_common->>'work_id', '')::bigint;
  v_customer := nullif(p_common->>'customer_id', '')::bigint;
  v_start    := nullif(p_common->>'start_date', '')::date;
  v_end      := nullif(p_common->>'end_date', '')::date;
  v_commit   := coalesce(nullif(p_common->>'commitment', ''), 'reserved');
  v_devral   := coalesce((p_common->>'eski_devral')::boolean, false);
  -- Reklam dönemi DEĞİL: opsiyonun kendi son geçerlilik tarihi. Yalnız
  -- opsiyonda anlamlıdır; rezervasyonda sessizce düşer (CHECK kısıtı).
  v_opt      := case when v_commit = 'reserved'
                     then nullif(p_common->>'option_expires_at', '')::date end;

  if v_customer is null and v_work is not null then
    select customer_id into v_customer from public.jobs where id = v_work;
  end if;
  if v_customer is null then
    raise exception 'Kurum seçilmeli.' using errcode = '22023';
  end if;
  if v_start is null then
    raise exception 'Başlangıç tarihi zorunlu.' using errcode = '22023';
  end if;
  if v_end is not null and v_end < v_start then
    raise exception 'Bitiş tarihi başlangıçtan önce olamaz.' using errcode = '22023';
  end if;
  if v_commit not in ('reserved','confirmed') then
    raise exception 'Geçersiz durum.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) = 0 then
    raise exception 'En az bir yüzey ya da yayın alanı seçilmeli.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_targets) > 120 then
    raise exception 'Tek seferde en fazla 120 hedef kaydedilebilir.' using errcode = '22023';
  end if;

  for t in select * from jsonb_array_elements(p_targets) loop
    n := n + 1;
    v_unit := nullif(t->>'unit_id', '')::bigint;
    v_area := nullif(t->>'alt_mecra_id', '')::bigint;
    if num_nonnulls(v_unit, v_area) <> 1 then
      raise exception 'Hedef %: tek bir yüzey ya da yayın alanı olmalı.', n using errcode = '22023';
    end if;
    if (coalesce(v_unit::text, 'a' || v_area)) = any(v_seen) then
      raise exception 'Aynı hedef iki kez seçildi.' using errcode = '22023';
    end if;
    v_seen := v_seen || coalesce(v_unit::text, 'a' || v_area);

    if v_unit is not null then
      select coalesce(a.occupancy_mode, 'exclusive'), u.active into v_mode, v_active
        from public.units u left join public.alt_mecralar a on a.id = u.alt_mecra_id where u.id = v_unit;
      if v_mode is null then
        sorun := sorun || jsonb_build_object('unit_id', v_unit, 'hedef', '#' || v_unit, 'neden', 'Yüzey bulunamadı.');
        continue;
      end if;
      if v_mode = 'concurrent' then
        sorun := sorun || jsonb_build_object('unit_id', v_unit, 'hedef', public._medya_hedef_adi(v_unit, null),
                                             'neden', 'Eşzamanlı yayın alanına ait; kampanya alana eklenir.');
        continue;
      end if;
      if not v_active then
        sorun := sorun || jsonb_build_object('unit_id', v_unit, 'hedef', public._medya_hedef_adi(v_unit, null),
                                             'neden', 'Pozisyon pasif, satışa kapalı.');
        continue;
      end if;
      select jsonb_agg(jsonb_build_object(
               'tur', x.record_kind, 'placement_id', x.placement_id, 'booking_id', x.booking_id,
               'customer_id', x.customer_id, 'firma', c.firma,
               'bas', x.block_start, 'bit', x.block_end, 'precision', x.date_precision, 'ym', x.ym,
               'devralinabilir', (x.record_kind = 'legacy' and x.customer_id = v_customer)))
        into cak
        from public.media_conflicts(v_unit, v_start, v_end) x
        left join public.customers c on c.id = x.customer_id
       where not (v_devral and x.record_kind = 'legacy' and x.customer_id = v_customer);
      if cak is not null then
        sorun := sorun || jsonb_build_object('unit_id', v_unit, 'hedef', public._medya_hedef_adi(v_unit, null),
                                             'neden', 'Çakışma', 'cakismalar', cak);
      end if;
    else
      select occupancy_mode into v_mode from public.alt_mecralar where id = v_area;
      if v_mode is distinct from 'concurrent' then
        sorun := sorun || jsonb_build_object('alt_mecra_id', v_area, 'hedef', public._medya_hedef_adi(null, v_area),
                                             'neden', 'Eşzamanlı yayın alanı değil.');
      end if;
    end if;
  end loop;

  if jsonb_array_length(sorun) > 0 then
    return jsonb_build_object('ok', false, 'sorunlar', sorun);
  end if;

  if v_devral then perform set_config('medyapark.eski_devral', '1', true); end if;
  with ins as (
    insert into public.media_placements (unit_id, alt_mecra_id, customer_id, work_id, contract_item_id,
                                         commitment, start_date, end_date, note, option_expires_at)
    select nullif(x->>'unit_id', '')::bigint, nullif(x->>'alt_mecra_id', '')::bigint,
           v_customer, v_work, nullif(p_common->>'contract_item_id', '')::bigint,
           v_commit, v_start, v_end, nullif(trim(p_common->>'note'), ''), v_opt
      from jsonb_array_elements(p_targets) with ordinality e(x, i)
     order by i
    returning id)
  select array_agg(id order by id) into ids from ins;
  perform set_config('medyapark.eski_devral', '', true);

  return jsonb_build_object('ok', true, 'ids', to_jsonb(ids));
end;
$function$;

-- ---------------------------------------------------------------------
-- 5) Okuma yüzeyi: `media_schedule` opsiyon son geçerliliğini taşısın
--
-- Görünüm S8'de tanımlandığı gibi ÖNCE okundu; yalnız iki yeni kolon
-- eklendi (placement tarafında gerçek değer, eski kayıt tarafında NULL —
-- eski aylık ızgarada opsiyon süresi kavramı YOKTUR). Public
-- projeksiyon `booking_availability_public` bu görünümden türemez ve
-- DEĞİŞMEDİ: taban tabloya kolon eklemek onu genişletmez (S4 §26).
-- ---------------------------------------------------------------------
create or replace view public.media_schedule as
 select 'placement'::text as record_kind, p.id as placement_id, null::bigint as booking_id,
    p.unit_id, coalesce(p.alt_mecra_id, u.alt_mecra_id) as alt_mecra_id,
    coalesce(u.mecra_id, a.mecra_id) as mecra_id,
    case when p.alt_mecra_id is not null then 'concurrent'::text else 'exclusive'::text end as occupancy_mode,
    p.customer_id, p.work_id, p.contract_item_id, p.source_quote_id, p.commitment,
    p.start_date, p.end_date,
    case when p.end_date is null then 'open_end'::text else 'exact'::text end as date_precision,
    null::text as ym, p.start_date as block_start, p.end_date as block_end,
    null::text as period_note, p.note, p.legacy_lane, p.created_by_team_id,
    p.created_at, p.updated_at, p.cancelled_at,
    u.name as unit_name, a.name as area_name, m.name as mecra_name,
    c.firma as customer_name, j.title as work_title, a.creative_seconds,
    p.option_expires_at
   from media_placements p
     left join units u on u.id = p.unit_id
     left join alt_mecralar a on a.id = coalesce(p.alt_mecra_id, u.alt_mecra_id)
     left join mecralar m on m.id = coalesce(u.mecra_id, a.mecra_id)
     left join customers c on c.id = p.customer_id
     left join jobs j on j.id = p.work_id
union all
 select 'legacy'::text as record_kind, null::bigint as placement_id, b.id as booking_id,
    b.unit_id, u.alt_mecra_id, u.mecra_id,
    coalesce(a.occupancy_mode, 'exclusive'::text) as occupancy_mode,
    b.customer_id, b.work_id, null::bigint as contract_item_id, b.source_quote_id,
    case b.status when 'dolu'::text then 'confirmed'::text else 'reserved'::text end as commitment,
    b.period_start as start_date, b.period_end as end_date,
    case when b.period_start is not null and b.period_end is not null then 'exact'::text
         when b.period_start is not null then 'open_end'::text
         else 'month'::text end as date_precision,
    b.ym::text as ym,
    case when b.period_start is not null and b.period_end is not null
              and b.period_start <= k.bitis and b.period_end >= k.bas
         then greatest(b.period_start, k.bas) else k.bas end as block_start,
    case when b.period_start is not null and b.period_end is not null
              and b.period_start <= k.bitis and b.period_end >= k.bas
         then least(b.period_end, k.bitis) else k.bitis end as block_end,
    b.period_note, b.note, null::text as legacy_lane, null::bigint as created_by_team_id,
    null::timestamptz as created_at, null::timestamptz as updated_at, null::timestamptz as cancelled_at,
    u.name as unit_name, a.name as area_name, m.name as mecra_name,
    c.firma as customer_name, j.title as work_title, a.creative_seconds,
    null::date as option_expires_at
   from bookings b
     join units u on u.id = b.unit_id
     left join alt_mecralar a on a.id = u.alt_mecra_id
     left join mecralar m on m.id = u.mecra_id
     left join customers c on c.id = b.customer_id
     left join jobs j on j.id = b.work_id
     cross join lateral ( select to_date(b.ym::text || '-01'::text, 'YYYY-MM-DD'::text) as bas,
            (to_date(b.ym::text || '-01'::text, 'YYYY-MM-DD'::text) + '1 mon -1 days'::interval)::date as bitis) k
  where b.superseded_by_placement_id is null;
