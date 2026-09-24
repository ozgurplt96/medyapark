-- =====================================================================
-- PS9 görsel kabul §6 — sözleşme kalemi UYGUNLUĞU sunucuda da denetlenir
--
-- Sorun: iş/kurum eşleşmesi tek başına uygunluk için yeterli değildi.
-- Ekran görüntüsünde "Yeni LED yayını" formunda statik bir Megalight
-- kalemi (P3-A) seçilebilir görünüyordu. İstemci artık listeyi hedefe
-- göre daraltıyor; ama istemci süzgesi bir güvenlik sınırı değildir.
--
-- Kural: bağlanacak kalem
--   · bir YÜZEY işaret ediyorsa hedef yüzeyle aynı olmalı,
--   · yüzey işaret eden kalem eşzamanlı YAYIN ALANINA bağlanamaz,
--   · bir MECRA işaret ediyorsa hedefin mecrasıyla aynı olmalı,
--   · dönemi hedef dönemle ÖRTÜŞMELİ.
-- Kalem bağlamak hâlâ İSTEĞE BAĞLIDIR ve sözleşmenin imzalandığı
-- anlamına gelmez; yalnız UYGUNSUZ bağlantı engellenir.
-- =====================================================================

create or replace function public._medya_kalem_uygun(
  p_item bigint, p_unit bigint, p_area bigint, p_start date, p_end date)
returns void
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
declare k record; v_mecra bigint;
begin
  if p_item is null then return; end if;

  select ci.unit_id, ci.mecra_id, ci.start_date, ci.end_date
    into k from public.contract_items ci where ci.id = p_item;
  if not found then
    raise exception 'Seçilen sözleşme kalemi bulunamadı.' using errcode = '22023';
  end if;

  if p_unit is not null then
    select u.mecra_id into v_mecra from public.units u where u.id = p_unit;
  elsif p_area is not null then
    select a.mecra_id into v_mecra from public.alt_mecralar a where a.id = p_area;
  end if;

  if k.unit_id is not null and p_unit is null then
    raise exception 'Bu sözleşme kalemi belirli bir yüzeye aittir; eşzamanlı yayın alanına bağlanamaz.'
      using errcode = '22023';
  end if;
  if k.unit_id is not null and p_unit is not null and k.unit_id <> p_unit then
    raise exception 'Bu sözleşme kalemi başka bir yüzeye aittir.' using errcode = '22023';
  end if;
  if k.mecra_id is not null and v_mecra is not null and k.mecra_id <> v_mecra then
    raise exception 'Bu sözleşme kalemi başka bir mecraya aittir.' using errcode = '22023';
  end if;
  if p_start is not null and k.end_date is not null and k.end_date < p_start then
    raise exception 'Sözleşme kaleminin dönemi bu kayıtla örtüşmüyor.' using errcode = '22023';
  end if;
  if p_end is not null and k.start_date is not null and k.start_date > p_end then
    raise exception 'Sözleşme kaleminin dönemi bu kayıtla örtüşmüyor.' using errcode = '22023';
  end if;
end;
$$;

-- Toplu oluşturma: her hedef için kalem uygunluğu denetlenir.
-- Denetim, çakışma kontrolünden ÖNCE ve yazmadan önce yapılır; "ya hep
-- ya hiç" davranışı korunur.
create or replace function public.media_placements_create(p_common jsonb, p_targets jsonb)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  t jsonb; n int := 0; v_customer bigint; v_work bigint; v_start date; v_end date;
  v_commit text; v_devral boolean; sorun jsonb := '[]'::jsonb; cak jsonb;
  v_unit bigint; v_area bigint; v_mode text; v_active boolean; ids bigint[];
  v_seen text[] := '{}'; v_opt date; v_item bigint;
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
  v_item     := nullif(p_common->>'contract_item_id', '')::bigint;
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

    -- §6: sözleşme kalemi uygunluğu (ürün/hedef/dönem)
    perform public._medya_kalem_uygun(v_item, v_unit, v_area, v_start, v_end);

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
           v_customer, v_work, v_item,
           v_commit, v_start, v_end, nullif(trim(p_common->>'note'), ''), v_opt
      from jsonb_array_elements(p_targets) with ordinality e(x, i)
     order by i
    returning id)
  select array_agg(id order by id) into ids from ins;
  perform set_config('medyapark.eski_devral', '', true);

  return jsonb_build_object('ok', true, 'ids', to_jsonb(ids));
end;
$function$;

-- Güncelleme yolu da aynı denetimden geçer.
create or replace function public.media_placement_update(p_id bigint, p_patch jsonb)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare p record; v_start date; v_end date; v_unit bigint; v_devral boolean;
        v_taah text; v_opt date; v_item bigint; cak jsonb; n int;
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
  v_item   := case when p_patch ? 'contract_item_id'
                   then nullif(p_patch->>'contract_item_id', '')::bigint else p.contract_item_id end;

  v_opt := case when p_patch ? 'option_expires_at'
                then nullif(p_patch->>'option_expires_at', '')::date
                else p.option_expires_at end;
  if v_taah <> 'reserved' then v_opt := null; end if;

  -- §6: sözleşme kalemi uygunluğu
  perform public._medya_kalem_uygun(v_item, v_unit, p.alt_mecra_id, v_start, v_end);

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
    contract_item_id  = v_item,
    note              = case when p_patch ? 'note' then nullif(trim(p_patch->>'note'), '') else note end
   where id = p_id;
  get diagnostics n = row_count;
  perform set_config('medyapark.eski_devral', '', true);
  if n = 0 then raise exception 'Bu kaydı değiştirme yetkiniz yok.' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true, 'id', p_id);
end;
$function$;
