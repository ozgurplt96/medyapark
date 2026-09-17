-- Product Simplification Sprint 6 — Documents & Attachments foundation
--
-- STORAGE DECISION (product owner): new Medyapark file uploads use Supabase
-- Storage. This migration does NOT add a second storage stack; it adds a
-- second BUCKET on the same Supabase Storage infrastructure.
--
-- WHY A SEPARATE BUCKET (audit, S6 §2):
--   `media` (Halil's unit/site images) is PUBLIC by design: anon SELECT and
--   LIST are allowed and any authenticated user may delete any object. That
--   is correct for public website imagery and WRONG for contracts, proposals
--   and field evidence. `media` is left exactly as it is.
--   `documents` is PRIVATE: no anon access at all, reads via short-lived
--   signed URLs generated for an authenticated internal user.
--
-- MODEL:
--   documents       one row per physical file (or per external link)
--   document_links  one row per business context, exactly ONE explicit FK
--
-- BUSINESS RULES ENFORCED HERE (not only in UI):
--   * provider integrity: supabase -> bucket+path, no URL;
--                         external -> https URL, no bucket/path
--   * a completed document must have >= 1 link (deferred check at COMMIT;
--     creation therefore goes through one transaction: `document_create`
--     or `entry_create_with_documents`)
--   * uploader identity comes from the JWT, never from the client body
--   * a client cannot register someone else's storage object
--   * physical identifiers are immutable after insert
--   * removing the LAST link does not silently delete metadata: the row is
--     stamped `detached_at` so the file can be cleaned up (and retried if
--     Storage deletion fails) by the uploader or an admin
--   * a human Update may have empty text only if it has >= 1 attachment
--
-- Replayable from zero; idempotent where Supabase allows it.

-- =====================================================================
-- 0. Copy fix carried from S5.1 (§48): accounting label is `Yok`.
--    Storage value `yok` is unchanged. Existing historical rows are not
--    rewritten (S4.4 §21 prospective-only rule).
-- =====================================================================
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
      when 'tamamlandi' then 'Tamamlandı' when 'kaybedildi' then 'Kaybedildi / Reddedildi'
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
      when 'mecra_belgesi' then 'Mecra Belgesi' when 'muhasebe' then 'Muhasebe'
      when 'diger' then 'Diğer' end
  end, v);
$$;

-- =====================================================================
-- 1. Private bucket
-- =====================================================================
-- 25 MiB per file: below the project/global Storage limit (config.toml
-- `file_size_limit = "50MiB"`, storage FILE_SIZE_LIMIT=52428800) and
-- comfortably above phone photos, signed contracts, proposal PDFs and
-- Office files. Larger production artwork stays an external link.
-- MIME allow-list is enforced BY STORAGE (server side), not only by the UI.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 26214400, array[
  'image/jpeg','image/png','image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv','text/plain'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- =====================================================================
-- 2. documents
-- =====================================================================
create table if not exists public.documents (
  id                   bigint generated by default as identity primary key,
  original_name        text not null,
  title                text null,
  doc_type             text not null default 'diger',
  mime_type            text null,
  size_bytes           bigint null,
  provider             text not null,
  storage_bucket       text null,
  storage_path         text null,
  external_url         text null,
  note                 text null,
  uploaded_by_team_id  bigint null references public.team(id) on delete set null,
  detached_at          timestamptz null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz null,
  constraint documents_doc_type_check check (doc_type in (
    'teklif','sozlesme','tasarim','baski_dosyasi','montaj_fotografi',
    'sokum_fotografi','mecra_belgesi','muhasebe','diger')),
  constraint documents_provider_check check (provider in ('supabase','external')),
  constraint documents_name_len check (length(trim(original_name)) between 1 and 255),
  constraint documents_size_nonneg check (size_bytes is null or size_bytes >= 0),
  constraint documents_origin_integrity check (
       (provider = 'supabase' and storage_bucket = 'documents'
          and storage_path is not null and external_url is null)
    or (provider = 'external' and storage_bucket is null and storage_path is null
          and external_url ~* '^https://[^[:space:]]+$'))
);

create unique index if not exists documents_storage_object_uq
  on public.documents (storage_bucket, storage_path) where storage_path is not null;
create index if not exists documents_type_idx     on public.documents (doc_type);
create index if not exists documents_uploader_idx on public.documents (uploaded_by_team_id, created_at desc);
create index if not exists documents_created_idx  on public.documents (created_at desc);
create index if not exists documents_name_idx     on public.documents (lower(coalesce(title, original_name)));
create index if not exists documents_detached_idx on public.documents (detached_at) where detached_at is not null;

-- =====================================================================
-- 3. document_links — exactly one explicit business target per row
-- =====================================================================
-- Contract FK deliberately absent: structured Commercial Records are S7.
create table if not exists public.document_links (
  id                  bigint generated by default as identity primary key,
  document_id         bigint not null references public.documents(id)       on delete cascade,
  job_id              bigint null     references public.jobs(id)            on delete cascade,
  entry_id            bigint null     references public.entries(id)         on delete cascade,
  operation_id        bigint null     references public.work_operations(id) on delete cascade,
  customer_id         bigint null     references public.customers(id)       on delete cascade,
  contact_id          bigint null     references public.contacts(id)        on delete cascade,
  quote_id            bigint null     references public.quotes(id)          on delete cascade,
  created_by_team_id  bigint null     references public.team(id)            on delete set null,
  created_at          timestamptz not null default now(),
  constraint document_links_one_target check (
    num_nonnulls(job_id, entry_id, operation_id, customer_id, contact_id, quote_id) = 1)
);

create unique index if not exists document_links_job_uq      on public.document_links (document_id, job_id)       where job_id is not null;
create unique index if not exists document_links_entry_uq    on public.document_links (document_id, entry_id)     where entry_id is not null;
create unique index if not exists document_links_op_uq       on public.document_links (document_id, operation_id) where operation_id is not null;
create unique index if not exists document_links_customer_uq on public.document_links (document_id, customer_id)  where customer_id is not null;
create unique index if not exists document_links_contact_uq  on public.document_links (document_id, contact_id)   where contact_id is not null;
create unique index if not exists document_links_quote_uq    on public.document_links (document_id, quote_id)     where quote_id is not null;

create index if not exists document_links_document_idx on public.document_links (document_id);
create index if not exists document_links_job_idx      on public.document_links (job_id)       where job_id is not null;
create index if not exists document_links_entry_idx    on public.document_links (entry_id)     where entry_id is not null;
create index if not exists document_links_op_idx       on public.document_links (operation_id) where operation_id is not null;
create index if not exists document_links_customer_idx on public.document_links (customer_id)  where customer_id is not null;
create index if not exists document_links_contact_idx  on public.document_links (contact_id)   where contact_id is not null;
create index if not exists document_links_quote_idx    on public.document_links (quote_id)     where quote_id is not null;

-- =====================================================================
-- 4. documents triggers: trusted identity, object ownership, immutability
-- =====================================================================
create or replace function public._trg_documents_ekle() returns trigger
language plpgsql security definer
set search_path = public, auth, storage, pg_temp as $$
declare nesne record;
begin
  -- Uploader comes from the session. Admin may keep a supplied value (backup
  -- restore replays historical rows); everyone else is stamped.
  if not public.is_admin() or new.uploaded_by_team_id is null then
    new.uploaded_by_team_id := public.current_team_id();
  end if;
  new.detached_at := null;
  new.created_at  := now();
  new.updated_at  := null;

  if new.provider = 'supabase' then
    select o.owner_id, o.metadata into nesne
      from storage.objects o
     where o.bucket_id = new.storage_bucket and o.name = new.storage_path;
    if not found then
      raise exception 'Dosya depoda bulunamadı.' using errcode = '42501';
    end if;
    -- A client may only register an object it uploaded itself.
    if not public.is_admin() and nesne.owner_id is distinct from auth.uid()::text then
      raise exception 'Bu dosyayı kaydetme yetkiniz yok.' using errcode = '42501';
    end if;
    -- Size and MIME are taken from Storage, not from the browser.
    new.mime_type  := coalesce(nesne.metadata->>'mimetype', new.mime_type);
    new.size_bytes := coalesce((nesne.metadata->>'size')::bigint, new.size_bytes);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_documents_ekle on public.documents;
create trigger trg_documents_ekle before insert on public.documents
  for each row execute function public._trg_documents_ekle();

create or replace function public._trg_documents_sabit() returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp as $$
begin
  if new.provider            is distinct from old.provider
  or new.storage_bucket      is distinct from old.storage_bucket
  or new.storage_path        is distinct from old.storage_path
  or new.external_url        is distinct from old.external_url
  or new.mime_type           is distinct from old.mime_type
  or new.size_bytes          is distinct from old.size_bytes
  or new.uploaded_by_team_id is distinct from old.uploaded_by_team_id
  or new.created_at          is distinct from old.created_at then
    raise exception 'Belgenin dosya kimliği değiştirilemez.' using errcode = '42501';
  end if;
  -- `detached_at` is lifecycle state owned by the link triggers.
  if new.detached_at is distinct from old.detached_at
     and coalesce(current_setting('medyapark.belge_bag', true), '') <> '1' then
    raise exception 'Belge bağlantı durumu doğrudan değiştirilemez.' using errcode = '42501';
  end if;
  if coalesce(current_setting('medyapark.belge_bag', true), '') <> '1' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_documents_sabit on public.documents;
create trigger trg_documents_sabit before update on public.documents
  for each row execute function public._trg_documents_sabit();

-- A completed document must belong somewhere (checked at COMMIT).
create or replace function public._trg_documents_bagli_olmali() returns trigger
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.documents d where d.id = new.id)
     and not exists (select 1 from public.document_links l where l.document_id = new.id) then
    raise exception 'Belge bir işe, güncellemeye, operasyona veya kuruma bağlanmadan kaydedilemez.'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_documents_bagli_olmali on public.documents;
create constraint trigger trg_documents_bagli_olmali
  after insert on public.documents
  deferrable initially deferred
  for each row execute function public._trg_documents_bagli_olmali();

-- =====================================================================
-- 5. document_links triggers: author stamp, entry authorship, detach,
--    trusted system activity
-- =====================================================================
create or replace function public._trg_document_links_ekle() returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp as $$
begin
  if not public.is_admin() or new.created_by_team_id is null then
    new.created_by_team_id := public.current_team_id();
  end if;
  new.created_at := now();
  -- Attaching to an Update edits that Update: author (or admin) only, and
  -- never to a system Entry.
  if new.entry_id is not null and not public.is_admin() and not exists (
       select 1 from public.entries e
        where e.id = new.entry_id and e.source <> 'system'
          and e.created_by_team_id = public.current_team_id()) then
    raise exception 'Bu güncellemeye dosya ekleme yetkiniz yok.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_document_links_ekle on public.document_links;
create trigger trg_document_links_ekle before insert on public.document_links
  for each row execute function public._trg_document_links_ekle();

create or replace function public._trg_document_links_sonra() returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare d record;
begin
  perform set_config('medyapark.belge_bag', '1', true);

  if tg_op = 'INSERT' then
    update public.documents set detached_at = null
     where id = new.document_id and detached_at is not null;

    -- S6 §45: only a DIRECT Work link of a significant business type is
    -- history. Photos inside an Update, operation evidence and corrections
    -- are not (Hareketler is not a file audit log).
    if new.job_id is not null then
      select doc_type, coalesce(nullif(trim(title), ''), original_name) as ad
        into d from public.documents where id = new.document_id;
      if d.doc_type in ('sozlesme', 'teklif') then
        perform public._sistem_hareketi(new.job_id, 'document_added',
          case d.doc_type when 'sozlesme' then 'Sözleşme eklendi: ' else 'Teklif dosyası eklendi: ' end
          || d.ad);
      end if;
    end if;
    perform set_config('medyapark.belge_bag', '', true);
    return new;
  end if;

  -- DELETE (explicit unlink or FK cascade from a deleted Update/Operation/Work)
  if not exists (select 1 from public.document_links l where l.document_id = old.document_id) then
    update public.documents set detached_at = now()
     where id = old.document_id and detached_at is null;
  end if;
  perform set_config('medyapark.belge_bag', '', true);
  return old;
end;
$$;

drop trigger if exists trg_document_links_sonra on public.document_links;
create trigger trg_document_links_sonra after insert or delete on public.document_links
  for each row execute function public._trg_document_links_sonra();

-- =====================================================================
-- 6. Photo-only Update
-- =====================================================================
-- The row-level CHECK could not know about attachments. It now applies to
-- SYSTEM rows only; human rows are checked at COMMIT: non-blank text OR at
-- least one attachment. A text-less Update whose last attachment is removed
-- is rejected (add text or delete the Update).
alter table public.entries drop constraint if exists entries_body_not_blank;
alter table public.entries add constraint entries_body_not_blank
  check (source <> 'system' or length(trim(body)) > 0);

create or replace function public._entry_icerik_var(p_entry bigint) returns void
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.entries e
              where e.id = p_entry and e.source <> 'system' and length(trim(e.body)) = 0)
     and not exists (select 1 from public.document_links l where l.entry_id = p_entry) then
    raise exception 'Güncelleme boş olamaz: metin yazın ya da dosya ekleyin.' using errcode = '23514';
  end if;
end;
$$;
revoke all on function public._entry_icerik_var(bigint) from public, anon, authenticated;

create or replace function public._trg_entries_icerik() returns trigger
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  perform public._entry_icerik_var(new.id);
  return null;
end;
$$;

drop trigger if exists trg_entries_icerik on public.entries;
create constraint trigger trg_entries_icerik
  after insert or update of body on public.entries
  deferrable initially deferred
  for each row execute function public._trg_entries_icerik();

create or replace function public._trg_document_links_icerik() returns trigger
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if old.entry_id is not null then
    perform public._entry_icerik_var(old.entry_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_document_links_icerik on public.document_links;
create constraint trigger trg_document_links_icerik
  after delete on public.document_links
  deferrable initially deferred
  for each row execute function public._trg_document_links_icerik();

-- =====================================================================
-- 7. Trusted system kind for direct Work documents
-- =====================================================================
alter table public.entries drop constraint if exists entries_system_kind_check;
alter table public.entries add constraint entries_system_kind_check check (
  system_kind is null or system_kind in (
    'work_created','work_phase','work_lifecycle','work_contract','work_accounting',
    'operation_created','operation_status',
    'quote_revised','quote_approved',
    'document_added'));

-- =====================================================================
-- 8. RLS
-- =====================================================================
alter table public.documents      enable row level security;
alter table public.document_links enable row level security;

revoke all on public.documents      from anon;
revoke all on public.document_links from anon;
grant select, insert, update, delete on public.documents      to authenticated;
grant select, insert, delete         on public.document_links to authenticated;

drop policy if exists "s6_documents_read"   on public.documents;
drop policy if exists "s6_documents_write"  on public.documents;
drop policy if exists "s6_documents_modify" on public.documents;
drop policy if exists "s6_documents_remove" on public.documents;

create policy "s6_documents_read" on public.documents
  for select to authenticated using (public.is_internal());

-- Identity/ownership checks live in trg_documents_ekle.
create policy "s6_documents_write" on public.documents
  for insert to authenticated with check (public.is_internal());

-- Title / type / note corrections: uploader or admin.
create policy "s6_documents_modify" on public.documents
  for update to authenticated
  using (public.is_admin() or uploaded_by_team_id = public.current_team_id())
  with check (public.is_admin() or uploaded_by_team_id = public.current_team_id());

-- Metadata disappears only after the document is detached from every
-- context AND, for Supabase files, after its object is really gone from
-- Storage. The order "object first, metadata second" is therefore enforced
-- here, not only in the app: a failed Storage delete can never leave an
-- untracked object behind metadata that was already removed (S6 §24).
-- Another ordinary user can never delete somebody else's contract.
create or replace function public._belge_nesnesi_yok(p_bucket text, p_path text) returns boolean
language sql stable security definer
set search_path = public, storage, pg_temp as $$
  select p_path is null or not exists (
    select 1 from storage.objects o where o.bucket_id = p_bucket and o.name = p_path);
$$;
revoke all on function public._belge_nesnesi_yok(text, text) from public, anon;
grant execute on function public._belge_nesnesi_yok(text, text) to authenticated;

create policy "s6_documents_remove" on public.documents
  for delete to authenticated
  using (detached_at is not null
         and (public.is_admin() or uploaded_by_team_id = public.current_team_id())
         and public._belge_nesnesi_yok(storage_bucket, storage_path));

drop policy if exists "s6_document_links_read"   on public.document_links;
drop policy if exists "s6_document_links_write"  on public.document_links;
drop policy if exists "s6_document_links_remove" on public.document_links;

create policy "s6_document_links_read" on public.document_links
  for select to authenticated using (public.is_internal());

create policy "s6_document_links_write" on public.document_links
  for insert to authenticated with check (public.is_internal());

-- Unlink: whoever created the link, the document's uploader, or admin.
create policy "s6_document_links_remove" on public.document_links
  for delete to authenticated
  using (public.is_admin()
         or created_by_team_id = public.current_team_id()
         or exists (select 1 from public.documents d
                     where d.id = document_links.document_id
                       and d.uploaded_by_team_id = public.current_team_id()));

-- =====================================================================
-- 9. Storage policies for `documents` (media policies untouched)
-- =====================================================================
-- Object may be removed only when no ATTACHED metadata still points at it:
-- a file still used by any business context cannot be deleted by accident.
create or replace function public._belge_nesnesi_silinebilir(p_name text) returns boolean
language sql stable security definer
set search_path = public, auth, pg_temp as $$
  select not exists (
    select 1 from public.documents d
     where d.storage_bucket = 'documents' and d.storage_path = p_name
       and d.detached_at is null);
$$;
revoke all on function public._belge_nesnesi_silinebilir(text) from public, anon;
grant execute on function public._belge_nesnesi_silinebilir(text) to authenticated;

drop policy if exists "documents_internal_read"   on storage.objects;
drop policy if exists "documents_internal_insert" on storage.objects;
drop policy if exists "documents_owner_delete"    on storage.objects;

create policy "documents_internal_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and public.is_internal());

-- `<uuid>/<sanitized-name>`: a generated identity, never a Work title.
create policy "documents_internal_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and public.is_internal()
              and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]{1,180}$');

-- No UPDATE policy: objects are never overwritten in place.
create policy "documents_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents'
         and (public.is_admin() or owner_id = auth.uid()::text)
         and public._belge_nesnesi_silinebilir(name));

-- =====================================================================
-- 10. Atomic creation RPCs (SECURITY INVOKER: every RLS rule above applies)
-- =====================================================================
-- p_docs: [{provider, storage_path | external_url, original_name, title,
--           doc_type, note, links:[{job_id|entry_id|operation_id|customer_id|contact_id|quote_id}]}]
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
    if jsonb_typeof(d->'links') <> 'array' or jsonb_array_length(d->'links') = 0 then
      raise exception 'Belge bir bağlama bağlanmalı.' using errcode = '23514';
    end if;
    for l in select * from jsonb_array_elements(d->'links') loop
      insert into public.document_links (document_id, job_id, entry_id, operation_id,
                                         customer_id, contact_id, quote_id)
      values (yeni, (l->>'job_id')::bigint, (l->>'entry_id')::bigint, (l->>'operation_id')::bigint,
              (l->>'customer_id')::bigint, (l->>'contact_id')::bigint, (l->>'quote_id')::bigint);
    end loop;
    ids := ids || yeni;
  end loop;
  return to_jsonb(ids);
end;
$$;
revoke all on function public.document_create(jsonb) from public, anon;
grant execute on function public.document_create(jsonb) to authenticated;

-- Human Update + tags + attachments in ONE transaction, so a photo-only
-- Update can never exist without its photo.
create or replace function public.entry_create_with_documents(p_entry jsonb, p_ilgili bigint[], p_docs jsonb)
returns bigint language plpgsql security invoker
set search_path = public, pg_temp as $$
declare yeni bigint; d jsonb; docs jsonb := '[]'::jsonb;
begin
  insert into public.entries (job_id, customer_id, contact_id, body, is_urgent,
                              due_at, action_status, source, created_by_team_id)
  values ((p_entry->>'job_id')::bigint, (p_entry->>'customer_id')::bigint,
          (p_entry->>'contact_id')::bigint, coalesce(p_entry->>'body', ''),
          coalesce((p_entry->>'is_urgent')::boolean, false),
          (p_entry->>'due_at')::timestamptz, p_entry->>'action_status',
          'manual', public.current_team_id())
  returning id into yeni;

  if p_ilgili is not null and array_length(p_ilgili, 1) > 0 then
    insert into public.entry_relevance (entry_id, team_id)
    select yeni, t from unnest(p_ilgili) t on conflict do nothing;
  end if;

  if p_docs is not null and jsonb_typeof(p_docs) = 'array' and jsonb_array_length(p_docs) > 0 then
    for d in select * from jsonb_array_elements(p_docs) loop
      docs := docs || jsonb_build_array(d || jsonb_build_object(
        'links', jsonb_build_array(jsonb_build_object('entry_id', yeni))));
    end loop;
    perform public.document_create(docs);
  end if;
  return yeni;
end;
$$;
revoke all on function public.entry_create_with_documents(jsonb, bigint[], jsonb) from public, anon;
grant execute on function public.entry_create_with_documents(jsonb, bigint[], jsonb) to authenticated;

revoke all on function public._trg_documents_ekle()         from public, anon, authenticated;
revoke all on function public._trg_documents_sabit()        from public, anon, authenticated;
revoke all on function public._trg_documents_bagli_olmali() from public, anon, authenticated;
revoke all on function public._trg_document_links_ekle()    from public, anon, authenticated;
revoke all on function public._trg_document_links_sonra()   from public, anon, authenticated;
revoke all on function public._trg_entries_icerik()         from public, anon, authenticated;
revoke all on function public._trg_document_links_icerik()  from public, anon, authenticated;
