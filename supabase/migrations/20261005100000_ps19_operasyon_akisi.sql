-- =====================================================================
-- PS19 — Baskı / Montaj operasyon akışı (S19 kapanış)
--
--   1. Durum sadeleşir: Yapılacak (planned) / Tamamlandı (done) / İptal
--      (cancelled). Eski `waiting` ve `in_progress` değerleri "Yapılacak"
--      olarak SAKLANIR. Kayıt silinmez; geçmiş hareketler (entries) aynen
--      durur. CHECK kısıtı gevşek bırakılır: eski istemci / eski seed bu
--      değerleri gönderirse reddedilmez, BEFORE tetikleyicisi çevirir.
--   2. "Gecikti" saklanmaz: yapılacak kaydın planlanan tarihinden türetilir.
--      Gerçekleşen tarih (completed_at) artık TAHMİN EDİLMEZ — yalnız
--      kullanıcının girdiği tarih yazılır; bilinmiyorsa boş kalır.
--   3. Uygulayan: kurumun yanında KİŞİ de seçilebilir
--      (work_operations.supplier_contact_id). Kişi "uygulayıcı" olarak
--      işaretlenebilir (contacts.is_executor). Kurumlarda doğrulama mevcut
--      relationship_roles içindeki `print_center` / `installer` rolleridir
--      (şema değişikliği gerektirmez).
--   4. Tek / bağlantılı kayıt oluşturma: operations_batch_create satırları
--      artık `kalem_op` (aynı işin mevcut bir kaydıyla aynı üretim kalemi),
--      `completed_date`, `supplier_contact_id` ve mevcut `price_group_id`
--      taşıyabilir. İmza değişmedi; tekillik (S14) aynen geçerli.
--
-- Eklemeli ve geri alınabilir: kolon düşürme / yeniden adlandırma yok.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Etiketler: opdurum → Yapılacak / Tamamlandı / İptal
-- ---------------------------------------------------------------------
create or replace function public._lbl(grp text, v text) returns text
language sql immutable as $$
  select coalesce(case grp
    when 'faz' then case v
      when 'temas_takip' then 'Temas' when 'teklif' then 'Teklif'
      when 'baski' then 'Baskı' when 'montaj' then 'Montaj'
      when 'yayinda_aktif' then 'Yayında' when 'tasarim' then 'Tasarım (eski)'
      when 'yayin' then 'Yayın (eski)' when 'arsiv' then 'Arşiv (eski)' end
    when 'yasam' then case v
      when 'acik' then 'Açık' when 'bekliyor' then 'Bekliyor' when 'kapandi' then 'Kapandı' end
    when 'kapanis' then case v
      when 'tamamlandi' then 'Tamamlandı' when 'kaybedildi' then 'Kaybedildi'
      when 'iptal' then 'İptal' end
    when 'sozlesme' then case v
      when 'missing' then 'Eksik' when 'pending' then 'Bekleniyor' when 'signed' then 'İmzalı' end
    when 'muhasebe' then case v
      when 'yok' then 'Yok' when 'hazir' then 'Hazır'
      when 'gonderildi' then 'Gönderildi' when 'islendi' then 'İşlendi' end
    when 'optur' then case v
      when 'baski' then 'Baskı' when 'montaj' then 'Montaj'
      when 'sokum' then 'Söküm' when 'diger' then 'Diğer' end
    when 'opdurum' then case v
      when 'planned' then 'Yapılacak' when 'waiting' then 'Yapılacak'
      when 'in_progress' then 'Yapılacak' when 'done' then 'Tamamlandı'
      when 'cancelled' then 'İptal' end
    when 'belge' then case v
      when 'teklif' then 'Teklif' when 'sozlesme' then 'Sözleşme'
      when 'tasarim' then 'Tasarım' when 'baski_dosyasi' then 'Baskı Dosyası'
      when 'montaj_fotografi' then 'Montaj Fotoğrafı' when 'sokum_fotografi' then 'Söküm Fotoğrafı'
      when 'mecra_belgesi' then 'Mecra Belgesi' when 'muhasebe' then 'Fatura / Muhasebe'
      when 'katalog' then 'Katalog / Fiyat Listesi'
      when 'diger' then 'Diğer' end
  end, v);
$$;

-- ---------------------------------------------------------------------
-- 2. Hareket: tamamlandı / iptal / yeniden yapılacak
--    Kaydedilmeyen değişiklik hareket üretmez: tetikleyici yalnız yazılan
--    durum geçişinde çalışır. Eski durumların dönüşümü (aşağıda) geçiş
--    sayılmaz — sahte hareket üretmez.
-- ---------------------------------------------------------------------
create or replace function public._trg_ops_hareket() returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare ad text := public._lbl('optur', new.operation_type);
begin
  if new.status is distinct from old.status then
    if new.status in ('done','cancelled') then
      perform public._sistem_hareketi(new.job_id, 'operation_status',
        case new.status when 'done' then ad || ' tamamlandı.' else ad || ' iptal edildi.' end,
        new.id, null);
    elsif old.status in ('done','cancelled') and new.status = 'planned' then
      perform public._sistem_hareketi(new.job_id, 'operation_status',
        ad || ' yeniden yapılacak olarak işaretlendi (' || public._lbl('opdurum', old.status) || ' → Yapılacak).',
        new.id, null);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public._trg_ops_hareket() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Durum sadeleştirme: saklanan değer yalnız planned / done / cancelled
-- ---------------------------------------------------------------------
create or replace function public._trg_ops_durum_sade() returns trigger
language plpgsql as $$
begin
  if new.status in ('waiting','in_progress') then new.status := 'planned'; end if;
  -- Tamamlanmamış kayıt gerçekleşen tarih taşımaz.
  if new.status <> 'done' then new.completed_at := null; end if;
  return new;
end;
$$;
revoke all on function public._trg_ops_durum_sade() from public, anon, authenticated;

drop trigger if exists trg_ops_durum_sade on public.work_operations;
create trigger trg_ops_durum_sade
  before insert or update of status, completed_at on public.work_operations
  for each row execute function public._trg_ops_durum_sade();

-- Mevcut kayıtlar: yalnız durum değeri sadeleşir; başka hiçbir alan değişmez.
do $$
declare n int;
begin
  update public.work_operations set status = 'planned' where status in ('waiting','in_progress');
  get diagnostics n = row_count;
  raise notice 'PS19: % baskı/montaj kaydının durumu "Yapılacak" olarak sadeleştirildi.', n;
end $$;

comment on column public.work_operations.status is
  'planned = Yapılacak · done = Tamamlandı · cancelled = İptal. Eski waiting/in_progress değerleri kabul edilir ama planned olarak saklanır (trg_ops_durum_sade). "Gecikti" saklanmaz; planned + planned_date < bugün ile türetilir.';
comment on column public.work_operations.completed_at is
  'Gerçekleşen tarih. Yalnız kullanıcının girdiği tarih yazılır; sistem tahmin etmez. Bilinmiyorsa NULL.';

-- ---------------------------------------------------------------------
-- 4. Uygulayan: kişi desteği
-- ---------------------------------------------------------------------
alter table public.work_operations
  add column if not exists supplier_contact_id bigint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'work_operations_supplier_contact_id_fkey') then
    alter table public.work_operations
      add constraint work_operations_supplier_contact_id_fkey
      foreign key (supplier_contact_id) references public.contacts(id) on delete set null;
  end if;
end $$;
create index if not exists work_operations_supplier_contact_idx
  on public.work_operations (supplier_contact_id) where supplier_contact_id is not null;
comment on column public.work_operations.supplier_contact_id is
  'İşlemi uygulayan kişi (isteğe bağlı). supplier_org_id ile birlikte ya da tek başına dolu olabilir; ikisi de boşsa uygulayan belirlenmemiştir.';

alter table public.contacts
  add column if not exists is_executor boolean not null default false;
comment on column public.contacts.is_executor is
  'Kişi baskı / montaj / söküm uygulayıcısı olarak doğrulanmıştır (Baskı & Montaj uygulayan seçicisinde listelenir). Kullanıcı işaretler; içe aktarımla otomatik atanmaz.';

-- ---------------------------------------------------------------------
-- 5. operations_batch_create gövdesi: bağlantılı kayıt, gerçekleşen tarih,
--    uygulayan kişi, mevcut paket. İmza ve tekillik sarmalayıcısı aynı.
-- ---------------------------------------------------------------------
create or replace function public._operations_batch_create_yap(p_job bigint, p_rows jsonb,
  p_docs jsonb default '[]'::jsonb, p_package jsonb default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp as $$
declare
  r jsonb; n int := 0; ids bigint[]; docs jsonb := '[]'::jsonb; d jsonb; links jsonb;
  doc_ids jsonb := '[]'::jsonb; grp bigint := null; kmap jsonb; kop jsonb := '{}'::jsonb;
  ko bigint; kk uuid; kj bigint;
begin
  if p_job is null then
    raise exception 'İş seçimi zorunlu.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Kaydedilecek satır yok.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 60 then
    raise exception 'Tek seferde en fazla 60 satır kaydedilebilir.' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    n := n + 1;
    if coalesce(r->>'operation_type', '') not in ('baski','montaj','sokum','diger') then
      raise exception 'Satır %: tür seçilmeli.', n using errcode = '23514';
    end if;
    if coalesce(nullif(trim(r->>'description'), ''), nullif(trim(r->>'location_text'), ''),
                r->>'unit_id') is null then
      raise exception 'Satır %: pozisyon, yer ya da açıklama girilmeli.', n using errcode = '23514';
    end if;
    if (r->>'quantity') is not null and (r->>'quantity')::numeric <= 0 then
      raise exception 'Satır %: miktar sıfırdan büyük olmalı.', n using errcode = '23514';
    end if;
    if coalesce(nullif(r->>'quantity_unit', ''), 'adet') not in ('adet','m2','metre','gun','saat','takim','hizmet') then
      raise exception 'Satır %: miktar birimi geçersiz.', n using errcode = '23514';
    end if;
    if (r->>'cost') is not null and (r->>'cost')::numeric < 0 then
      raise exception 'Satır %: maliyet negatif olamaz.', n using errcode = '23514';
    end if;
    if (r->>'surface_count') is not null and (r->>'surface_count')::int < 0 then
      raise exception 'Satır %: yüzey sayısı negatif olamaz.', n using errcode = '23514';
    end if;
    if nullif(r->>'completed_date', '') is not null and coalesce(r->>'status', '') <> 'done' then
      raise exception 'Satır %: gerçekleşen tarih yalnız tamamlanan kayıtta girilir.', n using errcode = '23514';
    end if;
    if (r->>'price_group_id') is not null and not exists (
         select 1 from public.operation_price_groups g where g.id = (r->>'price_group_id')::bigint and g.job_id = p_job) then
      raise exception 'Satır %: paket bedeli bu işe ait değil.', n using errcode = '23514';
    end if;
  end loop;

  select coalesce(jsonb_object_agg(k, gen_random_uuid()), '{}'::jsonb) into kmap
    from (select distinct btrim(x->>'kalem') k from jsonb_array_elements(p_rows) x
           where nullif(btrim(x->>'kalem'), '') is not null) s;

  -- Bağlantılı kayıt: aynı işin mevcut bir kaydıyla aynı üretim kalemi.
  -- Mevcut kaydın kalemi yoksa şimdi açılır (ikisi birlikte bir kalem olur).
  for ko in select distinct (x->>'kalem_op')::bigint from jsonb_array_elements(p_rows) x
             where (x->>'kalem_op') is not null loop
    select job_id, kalem_key into kj, kk from public.work_operations where id = ko for update;
    if not found then
      raise exception 'Bağlanacak kayıt bulunamadı.' using errcode = 'P0002';
    end if;
    if kj <> p_job then
      raise exception 'Yalnız aynı işin kayıtları aynı üretim kalemine bağlanabilir.' using errcode = '23514';
    end if;
    if kk is null then
      kk := gen_random_uuid();
      update public.work_operations set kalem_key = kk, updated_at = now() where id = ko;
    end if;
    kop := kop || jsonb_build_object(ko::text, kk);
  end loop;

  if p_package is not null and jsonb_typeof(p_package) = 'object' then
    if coalesce(nullif(trim(p_package->>'label'), ''), '') = '' then
      raise exception 'Paket bedeli için kısa bir ad girilmeli.' using errcode = '23514';
    end if;
    if (p_package->>'cost_amount') is null and (p_package->>'sale_amount') is null then
      raise exception 'Paket bedeli için maliyet ya da satış tutarı girilmeli.' using errcode = '23514';
    end if;
    insert into public.operation_price_groups (job_id, label, cost_amount, sale_amount, currency, note, created_by_team_id)
    values (p_job, trim(p_package->>'label'), (p_package->>'cost_amount')::numeric,
            (p_package->>'sale_amount')::numeric, coalesce(nullif(p_package->>'currency', ''), 'TRY'),
            nullif(trim(p_package->>'note'), ''), public.current_team_id())
    returning id into grp;
  end if;

  with ins as (
    insert into public.work_operations (job_id, operation_type, status, description, quantity,
                                        dimensions, supplier_org_id, supplier_contact_id, unit_id, location_text,
                                        planned_date, cost, note, completed_at, created_by_team_id,
                                        material, grammage_gsm, visible_size, surface_count,
                                        quantity_unit, reprint, unit_cost, sale_amount, currency,
                                        price_group_id, kalem_key)
    select p_job, x->>'operation_type', coalesce(nullif(x->>'status', ''), 'planned'),
           nullif(trim(x->>'description'), ''), (x->>'quantity')::numeric,
           nullif(trim(x->>'dimensions'), ''), (x->>'supplier_org_id')::bigint,
           (x->>'supplier_contact_id')::bigint,
           (x->>'unit_id')::bigint, nullif(trim(x->>'location_text'), ''),
           (x->>'planned_date')::date, (x->>'cost')::numeric, nullif(trim(x->>'note'), ''),
           -- Gerçekleşen tarih tahmin edilmez: yalnız girildiyse (gün ortası, İstanbul).
           case when x->>'status' = 'done' and nullif(x->>'completed_date', '') is not null
                then ((x->>'completed_date')::date + time '12:00') at time zone 'Europe/Istanbul' end,
           public.current_team_id(),
           nullif(trim(x->>'material'), ''), (x->>'grammage_gsm')::int,
           nullif(trim(x->>'visible_size'), ''), (x->>'surface_count')::int,
           coalesce(nullif(x->>'quantity_unit', ''), 'adet'), coalesce((x->>'reprint')::boolean, false),
           (x->>'unit_cost')::numeric, (x->>'sale_amount')::numeric,
           coalesce(nullif(x->>'currency', ''), 'TRY'),
           coalesce(grp, (x->>'price_group_id')::bigint),
           coalesce((kmap->>btrim(x->>'kalem'))::uuid, (kop->>(x->>'kalem_op'))::uuid)
      from jsonb_array_elements(p_rows) with ordinality e(x, i)
     order by i
    returning id)
  select array_agg(id order by id) into ids from ins;

  if jsonb_typeof(p_docs) = 'array' and jsonb_array_length(p_docs) > 0 then
    select jsonb_agg(jsonb_build_object('operation_id', i)) into links from unnest(ids) as i;
    for d in select * from jsonb_array_elements(p_docs) loop
      docs := docs || jsonb_build_array(jsonb_set(d, '{links}', links));
    end loop;
    doc_ids := public.document_create(docs);
  end if;

  return jsonb_build_object('ids', to_jsonb(ids), 'documents', doc_ids, 'price_group_id', grp);
end;
$$;
