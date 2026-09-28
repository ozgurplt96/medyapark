-- =====================================================================
-- PS15 — Üretim kalemi: aynı kalemin baskı / montaj / söküm kayıtları
--
-- Referans "BASKI-MONTAJ TAKİP TABLOSU" bir üretim kalemini TEK satırda
-- okur: baskı bilgisi (tarih, adet, baskı merkezi, ölçü) ve aynı kalemin
-- montajı (montaj tarihi, yeri, yapan) yan yana. Uygulamada baskı ve
-- montaj ayrı `work_operations` satırlarıdır ve aralarında bağ YOKTU.
-- Aynı işe ait olmak aynı kalem olmak demek değildir; isim benzerliği ya
-- da satır sırası da kanıt değildir. Bu yüzden bağ AÇIK ve kullanıcı
-- tarafından kurulur.
--
-- EN KÜÇÜK EKLEME: tek kolon `kalem_key uuid`. Aynı anahtarı taşıyan
-- işlemler aynı üretim kalemidir. Ayrı tablo AÇILMAZ:
--   · 1 baskı + 1 montaj                  → iki satır aynı anahtar
--   · 1 montaj birden çok baskıyı kapsar  → hepsi aynı anahtar (montaj
--                                           bedeli raporda BİR kez sayılır)
--   · baskı + montaj + söküm              → üçü aynı anahtar
-- Paket bedeli (`price_group_id`) kalem DEĞİLDİR: fiyat gruplamasıdır.
--
-- Mevcut satırlar: kolon NULL (bağımsız) — hiçbir veri değişmez, hiçbir
-- eşleşme tahmin edilmez.
-- =====================================================================

alter table public.work_operations add column if not exists kalem_key uuid;
create index if not exists work_operations_kalem_idx on public.work_operations(kalem_key) where kalem_key is not null;
comment on column public.work_operations.kalem_key is
  'PS15: üretim kalemi anahtarı. Aynı anahtarlı baskı/montaj/söküm kayıtları aynı üretim kalemidir. NULL = bağımsız.';

-- Kalem yalnız AYNI işin kayıtlarını kapsar.
create or replace function public._trg_ops_kalem_ayni_is()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.kalem_key is not null and exists (
       select 1 from public.work_operations o
        where o.kalem_key = new.kalem_key and o.job_id <> new.job_id and o.id <> new.id) then
    raise exception 'Üretim kalemi yalnız aynı işin kayıtlarını kapsayabilir.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public._trg_ops_kalem_ayni_is() from public, anon, authenticated;
drop trigger if exists trg_ops_kalem_ayni_is on public.work_operations;
create trigger trg_ops_kalem_ayni_is
  before insert or update of kalem_key, job_id on public.work_operations
  for each row execute function public._trg_ops_kalem_ayni_is();

-- ---------------------------------------------------------------------
-- operation_kalem_bagla(p_op, p_with)
--   p_with verilirse p_op, p_with'in kalemine katılır (p_with'in kalemi
--   yoksa ikisi için yeni kalem açılır). p_with NULL ise p_op kalemden
--   çıkar. Tek üyesi kalan kalemin anahtarı temizlenir (anlamsız tekil
--   kalem bırakılmaz). SECURITY INVOKER: RLS geçerlidir; aktif iç
--   kullanıcı olmayan kayıt göremez, dolayısıyla bağlayamaz.
-- ---------------------------------------------------------------------
create or replace function public.operation_kalem_bagla(p_op bigint, p_with bigint default null)
returns uuid language plpgsql security invoker
set search_path = public, pg_temp as $$
declare a record; b record; k uuid; eski uuid;
begin
  select id, job_id, kalem_key into a from public.work_operations where id = p_op for update;
  if not found then
    raise exception 'Kayıt bulunamadı.' using errcode = 'P0002';
  end if;
  eski := a.kalem_key;
  if p_with is null then
    update public.work_operations set kalem_key = null, updated_at = now() where id = p_op;
    k := null;
  else
    if p_with = p_op then
      raise exception 'Kayıt kendisiyle eşleştirilemez.' using errcode = '22023';
    end if;
    select id, job_id, kalem_key into b from public.work_operations where id = p_with for update;
    if not found then
      raise exception 'Eşleştirilecek kayıt bulunamadı.' using errcode = 'P0002';
    end if;
    if b.job_id <> a.job_id then
      raise exception 'Yalnız aynı işin kayıtları aynı üretim kalemine bağlanabilir.' using errcode = '23514';
    end if;
    k := coalesce(b.kalem_key, gen_random_uuid());
    update public.work_operations set kalem_key = k, updated_at = now()
     where id in (p_op, p_with) and kalem_key is distinct from k;
  end if;
  if eski is not null and eski is distinct from k then
    update public.work_operations set kalem_key = null
     where kalem_key = eski and (select count(*) from public.work_operations where kalem_key = eski) = 1;
  end if;
  return k;
end $$;
revoke all on function public.operation_kalem_bagla(bigint, bigint) from public, anon;
grant execute on function public.operation_kalem_bagla(bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------
-- Toplu giriş: satırdaki isteğe bağlı `kalem` etiketi ("1", "2"…) aynı
-- kayıt işlemi içinde aynı etiketi taşıyan satırları tek kaleme bağlar.
-- Etiket yalnız o işlemde anlamlıdır; saklanan değer yeni bir uuid'dir.
-- Gövde PS12 sürümüyle aynıdır; tek fark kalem_key eşlemesidir. İmza
-- değişmediği için PS14 tekillik sarmalayıcısı aynen geçerlidir.
-- ---------------------------------------------------------------------
create or replace function public._operations_batch_create_yap(p_job bigint, p_rows jsonb,
                                                              p_docs jsonb default '[]'::jsonb,
                                                              p_package jsonb default null)
returns jsonb language plpgsql security invoker
set search_path = public, pg_temp as $$
declare
  r jsonb; n int := 0; ids bigint[]; docs jsonb := '[]'::jsonb; d jsonb; links jsonb;
  doc_ids jsonb := '[]'::jsonb; grp bigint := null; kmap jsonb;
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
  end loop;

  select coalesce(jsonb_object_agg(k, gen_random_uuid()), '{}'::jsonb) into kmap
    from (select distinct btrim(x->>'kalem') k from jsonb_array_elements(p_rows) x
           where nullif(btrim(x->>'kalem'), '') is not null) s;

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
                                        dimensions, supplier_org_id, unit_id, location_text,
                                        planned_date, cost, note, completed_at, created_by_team_id,
                                        material, grammage_gsm, visible_size, surface_count,
                                        quantity_unit, reprint, unit_cost, sale_amount, currency,
                                        price_group_id, kalem_key)
    select p_job, x->>'operation_type', coalesce(nullif(x->>'status', ''), 'planned'),
           nullif(trim(x->>'description'), ''), (x->>'quantity')::numeric,
           nullif(trim(x->>'dimensions'), ''), (x->>'supplier_org_id')::bigint,
           (x->>'unit_id')::bigint, nullif(trim(x->>'location_text'), ''),
           (x->>'planned_date')::date, (x->>'cost')::numeric, nullif(trim(x->>'note'), ''),
           case when x->>'status' = 'done' then now() end,
           public.current_team_id(),
           nullif(trim(x->>'material'), ''), (x->>'grammage_gsm')::int,
           nullif(trim(x->>'visible_size'), ''), (x->>'surface_count')::int,
           coalesce(nullif(x->>'quantity_unit', ''), 'adet'), coalesce((x->>'reprint')::boolean, false),
           (x->>'unit_cost')::numeric, (x->>'sale_amount')::numeric,
           coalesce(nullif(x->>'currency', ''), 'TRY'), grp,
           (kmap->>btrim(x->>'kalem'))::uuid
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
revoke all on function public._operations_batch_create_yap(bigint, jsonb, jsonb, jsonb) from public, anon;
comment on function public._operations_batch_create_yap(bigint, jsonb, jsonb, jsonb) is
  'PS14: operations_batch_create gövdesi. PS15: satırdaki kalem etiketi aynı üretim kalemine bağlar.';
