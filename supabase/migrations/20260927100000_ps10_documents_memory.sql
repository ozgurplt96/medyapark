-- Product Simplification Sprint 10 — Hafıza > Belgeler
--
-- PRODUCT DECISION (this sprint, product owner): a document may be saved
-- WITHOUT a business relation ("İlişkilendirilmemiş") and linked later.
-- Removing a link never deletes the file. This updates the S6 rule "a
-- completed document must have >= 1 link" and the S6 behaviour "removing
-- the last link deletes the file".
--
-- WHAT CHANGES
--   1. `documents.doc_type` gains `katalog` (katalog / fiyat listesi).
--   2. The deferred S6 "must be linked" check becomes a deferred LIFECYCLE
--      check: at COMMIT it stamps `detached_at` when the document has no
--      link, and writes ONE trusted "Belge eklendi" movement.
--   3. Link / unlink / metadata edit produce trusted movements
--      (`document_linked`, `document_unlinked`, `document_changed`).
--      A document created in the same transaction as its links emits ONE
--      movement, not one per link.
--   4. `document_create` accepts an empty link list.
--   5. `document_index` — one read model for Hafıza > Belgeler: document
--      metadata + the jobs / organizations / contracts it reaches (directly
--      or through an Update, Operation, Quote or Contract) + a folded search
--      text. SECURITY INVOKER: base-table RLS applies unchanged.
--
-- WHAT DOES NOT CHANGE
--   * storage provider, bucket, privacy, object path rule, size/MIME limits
--   * who may read (active internal user), edit metadata (uploader/admin),
--     link (internal), unlink (link author / uploader / admin)
--   * deletion still requires: unlinked + uploader/admin + object gone
--     (the "object first, metadata second" order stays structural)
--   * a system movement can still never be written by a client
--
-- Replayable from zero; idempotent.

-- =====================================================================
-- 1. Category: katalog / fiyat listesi
-- =====================================================================
alter table public.documents drop constraint if exists documents_doc_type_check;
alter table public.documents add constraint documents_doc_type_check check (doc_type in (
  'teklif','sozlesme','tasarim','baski_dosyasi','montaj_fotografi',
  'sokum_fotografi','mecra_belgesi','muhasebe','katalog','diger'));

-- Same single server-side label source (PS7.1) + `katalog`; `muhasebe`
-- reads as the user category "Fatura / Muhasebe".
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
      when 'planned' then 'Planlandı' when 'waiting' then 'Bekliyor'
      when 'in_progress' then 'Devam ediyor' when 'done' then 'Tamamlandı'
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

-- =====================================================================
-- 2. Trusted system kinds (PS8 list + three document kinds)
-- =====================================================================
alter table public.entries drop constraint if exists entries_system_kind_check;
alter table public.entries add constraint entries_system_kind_check check (
  system_kind is null or system_kind in (
    'work_created','work_renamed','work_phase','work_lifecycle','work_contract','work_accounting',
    'operation_created','operation_status',
    'quote_revised','quote_approved',
    'document_added','document_linked','document_unlinked','document_changed',
    'contract_created','contract_signed','contract_cancelled',
    'media_created','media_changed','media_cancelled'));

-- Document movement writer. Work is OPTIONAL (an unlinked or
-- organization-only document has none); the organization is kept only when
-- there is no Work, exactly like `_medya_hareketi`. Not granted to clients.
create or replace function public._belge_hareketi(p_job bigint, p_customer bigint, p_kind text,
                                                  p_body text, p_doc bigint)
returns void language plpgsql security definer
set search_path = public, auth, pg_temp as $$
begin
  if p_body is null then return; end if;
  if coalesce(current_setting('medyapark.belge_sessiz', true), '') = '1' then return; end if;
  insert into public.entries (job_id, customer_id, body, source, system_kind,
                              created_by_team_id, document_id)
  values (p_job, case when p_job is null then p_customer end, p_body, 'system', p_kind,
          public.current_team_id(), p_doc);
end;
$$;
revoke all on function public._belge_hareketi(bigint, bigint, text, text, bigint)
  from public, anon, authenticated;

-- The Work / Organization a document reaches, in order of directness:
-- direct Work -> Contract's Work -> Update's Work -> Operation's Work ->
-- Quote's Work. Organization: direct -> Contract -> Work account.
create or replace function public._belge_baglami(p_doc bigint, out job_id bigint, out customer_id bigint)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  select coalesce(
           (select l.job_id from public.document_links l where l.document_id = p_doc and l.job_id is not null order by l.id limit 1),
           (select c.job_id from public.document_links l join public.contracts c on c.id = l.contract_id
             where l.document_id = p_doc and c.job_id is not null order by l.id limit 1),
           (select e.job_id from public.document_links l join public.entries e on e.id = l.entry_id
             where l.document_id = p_doc and e.job_id is not null order by l.id limit 1),
           (select o.job_id from public.document_links l join public.work_operations o on o.id = l.operation_id
             where l.document_id = p_doc order by l.id limit 1),
           (select q.work_id from public.document_links l join public.quotes q on q.id = l.quote_id
             where l.document_id = p_doc and q.work_id is not null order by l.id limit 1))
    into job_id;
  select coalesce(
           (select l.customer_id from public.document_links l where l.document_id = p_doc and l.customer_id is not null order by l.id limit 1),
           (select c.customer_id from public.document_links l join public.contracts c on c.id = l.contract_id
             where l.document_id = p_doc order by l.id limit 1),
           (select j.customer_id from public.jobs j where j.id = job_id))
    into customer_id;
end;
$$;
revoke all on function public._belge_baglami(bigint) from public, anon, authenticated;

create or replace function public._belge_adi(p_doc bigint) returns text
language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(nullif(btrim(title), ''), original_name) from public.documents where id = p_doc;
$$;
revoke all on function public._belge_adi(bigint) from public, anon, authenticated;

-- =====================================================================
-- 3. Creation: unlinked allowed; one movement per document at COMMIT
-- =====================================================================
drop trigger if exists trg_documents_bagli_olmali on public.documents;
drop function if exists public._trg_documents_bagli_olmali();

create or replace function public._trg_documents_olustu() returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare b record; d record; bagli boolean; yalniz_ek boolean;
begin
  select * into d from public.documents where id = new.id;
  if not found then return null; end if;              -- created and removed in one txn

  bagli := exists (select 1 from public.document_links l where l.document_id = new.id);
  if not bagli then
    perform set_config('medyapark.belge_bag', '1', true);
    update public.documents set detached_at = coalesce(detached_at, now()) where id = new.id;
    perform set_config('medyapark.belge_bag', '', true);
  end if;

  -- S6 §45 kept: a photo inside an Update or an Operation's evidence is
  -- shown by that record itself; Hareketler is not a file log.
  yalniz_ek := bagli and not exists (
    select 1 from public.document_links l
     where l.document_id = new.id and l.entry_id is null and l.operation_id is null);
  if yalniz_ek then return null; end if;

  select * into b from public._belge_baglami(new.id);
  perform public._belge_hareketi(b.job_id, b.customer_id, 'document_added',
    public._lbl('belge', d.doc_type) || ' eklendi: ' || public._belge_adi(new.id)
      || case when not bagli then ' (ilişkilendirilmemiş)' else '' end,
    new.id);
  return null;
end;
$$;

drop trigger if exists trg_documents_olustu on public.documents;
create constraint trigger trg_documents_olustu
  after insert on public.documents
  deferrable initially deferred
  for each row execute function public._trg_documents_olustu();

-- =====================================================================
-- 4. Link / unlink: detached state + trusted movement
-- =====================================================================
create or replace function public._trg_document_links_sonra() returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare d record; c record; ad text;
begin
  if tg_op = 'INSERT' then
    select * into d from public.documents where id = new.document_id;
    perform set_config('medyapark.belge_bag', '1', true);
    update public.documents set detached_at = null
     where id = new.document_id and detached_at is not null;
    perform set_config('medyapark.belge_bag', '', true);

    -- Created in THIS transaction: the creation movement (deferred, above)
    -- already tells the story. `created_at` is forced to now() on insert
    -- and now() is constant within a transaction.
    if d.created_at = now() then return new; end if;

    ad := public._belge_adi(new.document_id);
    if new.job_id is not null then
      perform public._belge_hareketi(new.job_id, null, 'document_linked',
        public._lbl('belge', d.doc_type) || ' işe bağlandı: ' || ad, new.document_id);
    elsif new.contract_id is not null then
      select * into c from public.contracts where id = new.contract_id;
      perform public._belge_hareketi(c.job_id, c.customer_id, 'document_linked',
        public._lbl('belge', d.doc_type) || ' sözleşmeye bağlandı: ' || ad
          || ' → ' || coalesce(c.title, 'Sözleşme #' || c.id), new.document_id);
    end if;
    return new;
  end if;

  -- DELETE (explicit unlink, or FK cascade from a deleted record)
  select * into d from public.documents where id = old.document_id;
  if not found then return old; end if;                -- the document itself is being deleted

  if not exists (select 1 from public.document_links l where l.document_id = old.document_id) then
    perform set_config('medyapark.belge_bag', '1', true);
    update public.documents set detached_at = now()
     where id = old.document_id and detached_at is null;
    perform set_config('medyapark.belge_bag', '', true);
  end if;

  ad := public._belge_adi(old.document_id);
  -- Only a still-existing Work / Contract gets an "unlinked" line: when the
  -- Work itself is deleted the cascade must not write into a vanished Work.
  if old.job_id is not null and exists (select 1 from public.jobs j where j.id = old.job_id) then
    perform public._belge_hareketi(old.job_id, null, 'document_unlinked',
      public._lbl('belge', d.doc_type) || ' işten kaldırıldı: ' || ad
        || case when not exists (select 1 from public.document_links l where l.document_id = old.document_id)
                then ' (dosya Belgeler''de ilişkilendirilmemiş olarak duruyor)' else '' end,
      old.document_id);
  elsif old.contract_id is not null then
    select * into c from public.contracts where id = old.contract_id;
    if found then
      perform public._belge_hareketi(c.job_id, c.customer_id, 'document_unlinked',
        public._lbl('belge', d.doc_type) || ' sözleşmeden kaldırıldı: ' || ad, old.document_id);
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_document_links_sonra on public.document_links;
create trigger trg_document_links_sonra after insert or delete on public.document_links
  for each row execute function public._trg_document_links_sonra();

-- =====================================================================
-- 5. Metadata edit: one movement per real change
-- =====================================================================
create or replace function public._trg_documents_degisti() returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare b record; parca text[] := '{}';
begin
  if coalesce(current_setting('medyapark.belge_bag', true), '') = '1' then return new; end if;
  if coalesce(nullif(btrim(new.title), ''), new.original_name)
       is distinct from coalesce(nullif(btrim(old.title), ''), old.original_name) then
    parca := parca || ('ad: ' || coalesce(nullif(btrim(old.title), ''), old.original_name)
                     || ' → ' || coalesce(nullif(btrim(new.title), ''), new.original_name));
  end if;
  if new.doc_type is distinct from old.doc_type then
    parca := parca || ('kategori: ' || public._lbl('belge', old.doc_type) || ' → ' || public._lbl('belge', new.doc_type));
  end if;
  if coalesce(btrim(new.note), '') is distinct from coalesce(btrim(old.note), '') then
    parca := parca || 'açıklama güncellendi'::text;
  end if;
  if coalesce(array_length(parca, 1), 0) = 0 then return new; end if;

  select * into b from public._belge_baglami(new.id);
  perform public._belge_hareketi(b.job_id, b.customer_id, 'document_changed',
    'Belge bilgisi güncellendi: ' || coalesce(nullif(btrim(new.title), ''), new.original_name)
      || ' (' || array_to_string(parca, ' · ') || ')', new.id);
  return new;
end;
$$;

drop trigger if exists trg_documents_degisti on public.documents;
create trigger trg_documents_degisti after update of title, doc_type, note on public.documents
  for each row execute function public._trg_documents_degisti();

-- =====================================================================
-- 6. document_create: links are optional
-- =====================================================================
create or replace function public.document_create(p_docs jsonb)
returns jsonb language plpgsql security invoker
set search_path = public, pg_temp as $$
declare
  d jsonb; l jsonb; yeni bigint; ids bigint[] := '{}';
begin
  if jsonb_typeof(p_docs) <> 'array' or jsonb_array_length(p_docs) = 0 then
    raise exception 'Eklenecek belge yok.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_docs) > 10 then
    raise exception 'Tek seferde en fazla 10 belge eklenebilir.' using errcode = '22023';
  end if;
  for d in select * from jsonb_array_elements(p_docs) loop
    insert into public.documents (original_name, title, doc_type, mime_type, size_bytes,
                                  provider, storage_bucket, storage_path, external_url, note)
    values (d->>'original_name', nullif(trim(d->>'title'), ''), coalesce(d->>'doc_type', 'diger'),
            d->>'mime_type', (d->>'size_bytes')::bigint,
            d->>'provider',
            case when d->>'provider' = 'supabase' then 'documents' end,
            case when d->>'provider' = 'supabase' then d->>'storage_path' end,
            case when d->>'provider' = 'external' then trim(d->>'external_url') end,
            nullif(trim(d->>'note'), ''))
    returning id into yeni;
    if jsonb_typeof(d->'links') = 'array' then
      for l in select * from jsonb_array_elements(d->'links') loop
        insert into public.document_links (document_id, job_id, entry_id, operation_id,
                                           customer_id, contact_id, quote_id, contract_id)
        values (yeni, (l->>'job_id')::bigint, (l->>'entry_id')::bigint, (l->>'operation_id')::bigint,
                (l->>'customer_id')::bigint, (l->>'contact_id')::bigint, (l->>'quote_id')::bigint,
                (l->>'contract_id')::bigint);
      end loop;
    end if;
    ids := ids || yeni;
  end loop;
  return to_jsonb(ids);
end;
$$;
revoke all on function public.document_create(jsonb) from public, anon;
grant execute on function public.document_create(jsonb) to authenticated;

-- =====================================================================
-- 7. Read model for Hafıza > Belgeler
-- =====================================================================
-- Search folding: Turkish dotted/dotless I would otherwise split one word
-- into two spellings (lower('İ') = 'i̇' here). The client folds the query
-- with the SAME rule. File CONTENT is not searched and is not claimed to be.
create or replace function public._belge_katla(t text) returns text
language sql immutable as $$
  select lower(translate(coalesce(t, ''), 'İIı', 'iii'));
$$;
grant execute on function public._belge_katla(text) to authenticated;

drop view if exists public.document_index;
create view public.document_index with (security_invoker = true) as
with bag as (
  select l.document_id,
         coalesce(l.job_id, c.job_id, e.job_id, o.job_id, q.work_id) as job_id,
         coalesce(l.customer_id, c.customer_id) as customer_id,
         l.contract_id
    from public.document_links l
    left join public.contracts c        on c.id = l.contract_id
    left join public.entries e          on e.id = l.entry_id
    left join public.work_operations o  on o.id = l.operation_id
    left join public.quotes q           on q.id = l.quote_id
), toplu as (
  select b.document_id,
         array_remove(array_agg(distinct b.job_id), null) as job_ids,
         array_remove(array_agg(distinct coalesce(b.customer_id, j.customer_id)), null) as customer_ids,
         array_remove(array_agg(distinct b.contract_id), null) as contract_ids,
         string_agg(distinct j.title, ' ') as is_adlari,
         string_agg(distinct cu.firma, ' ') as kurum_adlari,
         string_agg(distinct ct.title, ' ') as sozlesme_adlari
    from bag b
    left join public.jobs j       on j.id = b.job_id
    left join public.customers cu on cu.id = coalesce(b.customer_id, j.customer_id)
    left join public.contracts ct on ct.id = b.contract_id
   group by b.document_id
)
select d.id, d.title, d.original_name, d.doc_type, d.mime_type, d.size_bytes, d.provider,
       d.storage_path, d.external_url, d.note, d.uploaded_by_team_id, d.created_at, d.updated_at,
       coalesce(nullif(btrim(d.title), ''), d.original_name) as ad,
       coalesce(t.job_ids, '{}')      as job_ids,
       coalesce(t.customer_ids, '{}') as customer_ids,
       coalesce(t.contract_ids, '{}') as contract_ids,
       (select count(*) from public.document_links l where l.document_id = d.id)::int as bag_sayisi,
       not exists (select 1 from public.document_links l where l.document_id = d.id) as iliskisiz,
       public._belge_katla(concat_ws(' ', d.title, d.original_name, d.note,
                                     t.is_adlari, t.kurum_adlari, t.sozlesme_adlari)) as arama
  from public.documents d
  left join toplu t on t.document_id = d.id;

revoke all on public.document_index from public, anon;
grant select on public.document_index to authenticated;

-- =====================================================================
-- 8. Existing rows: detached state must match reality
-- =====================================================================
do $$
begin
  perform set_config('medyapark.belge_bag', '1', true);
  update public.documents d set detached_at = now()
   where d.detached_at is null
     and not exists (select 1 from public.document_links l where l.document_id = d.id);
  perform set_config('medyapark.belge_bag', '', true);
end $$;

revoke all on function public._trg_documents_olustu()     from public, anon, authenticated;
revoke all on function public._trg_documents_degisti()    from public, anon, authenticated;
revoke all on function public._trg_document_links_sonra() from public, anon, authenticated;
