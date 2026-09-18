-- Product Simplification Sprint 7.1 — Work workflow, activity navigation &
-- operation entry refinement.
--
-- Additive only. Replayable from zero. No table is dropped or renamed; no
-- historical system row is rewritten (S4.4 §21 prospective-only rule).
--
-- 1. Lifecycle integrity  — a closing reason only exists on a closed Work.
--    Audit (§3): every writer (job_lifecycle API, S03/S07r backfills, demo
--    fixture) already wrote the reason only together with `kapandi`; the
--    "Açık + Tamamlandı" screen was a UI default (a <select> without an
--    empty option shows its first option for NULL). The CHECK makes the
--    invariant a database fact instead of a convention.
-- 2. Trusted Work-title event (`work_renamed`), lifecycle wording in the
--    current Aktif/Arşiv vocabulary.
-- 3. Structured activity targets on `entries`: `work_operation_id`,
--    `document_id`. Filled ONLY by trusted triggers; a human Update cannot
--    carry them (CHECK). Work / accounting events need only `job_id`.
-- 4. Operation creation events become statement-level: one INSERT
--    statement that creates N operations for a Work emits ONE summary
--    movement (N=1 keeps the previous wording). No client flag is involved,
--    so a client cannot suppress or fake it.
-- 5. `operations_batch_create` — atomic multi-row creation (+ optional
--    shared documents linked to every created row, one physical file).

-- =====================================================================
-- 1. Lifecycle integrity
-- =====================================================================
-- No-op on every known dataset (verified locally: 0 rows). Kept so a
-- production preflight surprise cannot make the CHECK below fail. It does
-- not touch a trigger column, so it emits no movement.
update public.jobs set closed_reason = null
 where lifecycle_status <> 'kapandi' and closed_reason is not null;

alter table public.jobs drop constraint if exists jobs_closed_reason_only_closed;
alter table public.jobs add constraint jobs_closed_reason_only_closed
  check (closed_reason is null or lifecycle_status = 'kapandi');

-- =====================================================================
-- 2. Labels — closing reason short form (UI: "Kaybedildi")
-- =====================================================================
-- Same function as S6 (single server-side label source); only
-- `kapanis.kaybedildi` changes to the short form used by the archive
-- dialog and the new movement text.
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
      when 'mecra_belgesi' then 'Mecra Belgesi' when 'muhasebe' then 'Muhasebe'
      when 'diger' then 'Diğer' end
  end, v);
$$;

-- =====================================================================
-- 3. Structured activity targets
-- =====================================================================
alter table public.entries
  add column if not exists work_operation_id bigint null
    references public.work_operations(id) on delete set null,
  add column if not exists document_id bigint null
    references public.documents(id) on delete set null;

-- A target is part of a TRUSTED movement. A human Update cannot carry one,
-- so a client can never point a fake row at an operation or a document.
alter table public.entries drop constraint if exists entries_target_only_system;
alter table public.entries add constraint entries_target_only_system
  check ((work_operation_id is null and document_id is null) or source = 'system');

create index if not exists entries_work_operation_idx
  on public.entries (work_operation_id) where work_operation_id is not null;
create index if not exists entries_document_idx
  on public.entries (document_id) where document_id is not null;

alter table public.entries drop constraint if exists entries_system_kind_check;
alter table public.entries add constraint entries_system_kind_check check (
  system_kind is null or system_kind in (
    'work_created','work_renamed','work_phase','work_lifecycle','work_contract','work_accounting',
    'operation_created','operation_status',
    'quote_revised','quote_approved',
    'document_added',
    'contract_created','contract_signed','contract_cancelled'));

-- Internal writer with targets. Still NOT granted to any client role.
create or replace function public._sistem_hareketi(p_job bigint, p_kind text, p_body text,
                                                   p_op bigint, p_doc bigint)
returns void language plpgsql security definer
set search_path = public, auth, pg_temp as $$
begin
  if p_job is null or p_body is null then return; end if;
  insert into public.entries (job_id, body, source, system_kind, created_by_team_id,
                              work_operation_id, document_id)
  values (p_job, p_body, 'system', p_kind, public.current_team_id(), p_op, p_doc);
end;
$$;
revoke all on function public._sistem_hareketi(bigint, text, text, bigint, bigint)
  from public, anon, authenticated;

-- The 3-argument form (used by S6/S7 triggers) keeps working, untargeted.
create or replace function public._sistem_hareketi(p_job bigint, p_kind text, p_body text)
returns void language plpgsql security definer
set search_path = public, auth, pg_temp as $$
begin
  perform public._sistem_hareketi(p_job, p_kind, p_body, null::bigint, null::bigint);
end;
$$;
revoke all on function public._sistem_hareketi(bigint, text, text) from public, anon, authenticated;

-- =====================================================================
-- 4. Work (jobs) events: + title, lifecycle in Aktif/Arşiv language
-- =====================================================================
-- Unchanged from S7 except:
--   * `work_renamed` when the title meaningfully changes. Whitespace-only
--     edits (trim, doubled spaces) are cosmetic and emit nothing (§11).
--   * lifecycle text speaks the employee model (§48):
--       -> kapandi            "İş arşivlendi: <neden>."
--       kapandi -> acik       "İş yeniden açıldı."
--       kapandi -> bekliyor   "İş yeniden açıldı (Bekliyor)."
--       acik -> bekliyor      "İş beklemeye alındı."
--       bekliyor -> acik      "İş beklemeden çıkarıldı."
create or replace function public._trg_jobs_hareket() returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare
  eski_ad text := regexp_replace(btrim(coalesce(old.title, '')), '\s+', ' ', 'g');
  yeni_ad text := regexp_replace(btrim(coalesce(new.title, '')), '\s+', ' ', 'g');
begin
  if tg_op = 'INSERT' then
    perform public._sistem_hareketi(new.id, 'work_created', 'İş oluşturuldu.');
    return new;
  end if;

  if yeni_ad <> eski_ad and yeni_ad <> '' then
    perform public._sistem_hareketi(new.id, 'work_renamed',
      'İş adı değişti: ' || eski_ad || ' → ' || yeni_ad);
  end if;

  if new.status is distinct from old.status then
    perform public._sistem_hareketi(new.id, 'work_phase',
      'Aşama değişti: ' || public._lbl('faz', old.status) || ' → ' || public._lbl('faz', new.status));
  end if;

  if new.lifecycle_status is distinct from old.lifecycle_status then
    perform public._sistem_hareketi(new.id, 'work_lifecycle',
      case
        when new.lifecycle_status = 'kapandi' then
          'İş arşivlendi' || coalesce(': ' || public._lbl('kapanis', new.closed_reason), '') || '.'
        when old.lifecycle_status = 'kapandi' then
          'İş yeniden açıldı' || case when new.lifecycle_status = 'bekliyor' then ' (Bekliyor).' else '.' end
        when new.lifecycle_status = 'bekliyor' then 'İş beklemeye alındı.'
        else 'İş beklemeden çıkarıldı.'
      end);
  end if;

  if new.contract_status is distinct from old.contract_status
     and coalesce(current_setting('medyapark.sozlesme_senk', true), '') <> '1' then
    perform public._sistem_hareketi(new.id, 'work_contract',
      'Sözleşme durumu: ' || public._lbl('sozlesme', old.contract_status) || ' → '
      || public._lbl('sozlesme', new.contract_status));
  end if;

  if new.accounting_status is distinct from old.accounting_status then
    perform public._sistem_hareketi(new.id, 'work_accounting',
      'Muhasebe durumu: ' || public._lbl('muhasebe', old.accounting_status) || ' → '
      || public._lbl('muhasebe', new.accounting_status));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_jobs_hareket on public.jobs;
create trigger trg_jobs_hareket
  after insert or update of title, status, lifecycle_status, contract_status, accounting_status
  on public.jobs for each row execute function public._trg_jobs_hareket();

-- =====================================================================
-- 5. Operation events
-- =====================================================================
-- 5a. Status transitions stay row-level, now targeted at the operation.
create or replace function public._trg_ops_hareket() returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare ad text := public._lbl('optur', new.operation_type);
begin
  if new.status is distinct from old.status and new.status in ('in_progress','done','cancelled') then
    perform public._sistem_hareketi(new.job_id, 'operation_status',
      case new.status
        when 'done'      then ad || ' tamamlandı.'
        when 'cancelled' then ad || ' iptal edildi.'
        else ad || ' başladı (' || public._lbl('opdurum', old.status) || ' → '
                || public._lbl('opdurum', new.status) || ').'
      end,
      new.id, null);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ops_hareket on public.work_operations;
create trigger trg_ops_hareket
  after update of status on public.work_operations
  for each row execute function public._trg_ops_hareket();

-- 5b. Creation is statement-level. One statement = one movement per Work.
--     N = 1  -> "Montaj kaydı eklendi · 20.09.2026"   (unchanged wording)
--     N > 1  -> "4 baskı/montaj kaydı eklendi: Baskı ×2, Montaj ×2 · 20.09.2026"
--     Target = the first created operation; the UI highlights its siblings
--     through their shared creation instant (same transaction, same now()).
create or replace function public._trg_ops_hareket_ekle() returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare g record; o record; parca text; tarih text;
begin
  for g in select job_id, count(*) as n, min(id) as ilk,
                  count(distinct planned_date) as gun, min(planned_date) as tarih1,
                  bool_or(planned_date is null) as tarihsiz
             from yeni group by job_id loop
    tarih := case when g.gun = 1 and not g.tarihsiz
                  then ' · ' || to_char(g.tarih1, 'DD.MM.YYYY') else '' end;
    if g.n = 1 then
      select * into o from yeni where id = g.ilk;
      perform public._sistem_hareketi(g.job_id, 'operation_created',
        public._lbl('optur', o.operation_type) || ' kaydı eklendi' || tarih, o.id, null);
    else
      select string_agg(public._lbl('optur', t) || ' ×' || c, ', '
                        order by array_position(array['baski','montaj','sokum','diger'], t))
        into parca
        from (select operation_type as t, count(*) as c from yeni
               where job_id = g.job_id group by operation_type) s;
      perform public._sistem_hareketi(g.job_id, 'operation_created',
        g.n || ' baskı/montaj kaydı eklendi: ' || parca || tarih, g.ilk, null);
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_ops_hareket_ekle on public.work_operations;
create trigger trg_ops_hareket_ekle
  after insert on public.work_operations
  referencing new table as yeni
  for each statement execute function public._trg_ops_hareket_ekle();

-- =====================================================================
-- 6. Document event targeted at the document
-- =====================================================================
-- Same function as S6, only the movement now carries `document_id`.
create or replace function public._trg_document_links_sonra() returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare d record;
begin
  perform set_config('medyapark.belge_bag', '1', true);

  if tg_op = 'INSERT' then
    update public.documents set detached_at = null
     where id = new.document_id and detached_at is not null;

    if new.job_id is not null then
      select doc_type, coalesce(nullif(trim(title), ''), original_name) as ad
        into d from public.documents where id = new.document_id;
      if d.doc_type in ('sozlesme', 'teklif') then
        perform public._sistem_hareketi(new.job_id, 'document_added',
          case d.doc_type when 'sozlesme' then 'Sözleşme eklendi: ' else 'Teklif dosyası eklendi: ' end
          || d.ad, null, new.document_id);
      end if;
    end if;
    perform set_config('medyapark.belge_bag', '', true);
    return new;
  end if;

  if not exists (select 1 from public.document_links l where l.document_id = old.document_id) then
    update public.documents set detached_at = now()
     where id = old.document_id and detached_at is null;
  end if;
  perform set_config('medyapark.belge_bag', '', true);
  return old;
end;
$$;

revoke all on function public._trg_jobs_hareket()          from public, anon, authenticated;
revoke all on function public._trg_ops_hareket()           from public, anon, authenticated;
revoke all on function public._trg_ops_hareket_ekle()      from public, anon, authenticated;
revoke all on function public._trg_document_links_sonra()  from public, anon, authenticated;

-- =====================================================================
-- 7. Atomic multi-row operation creation
-- =====================================================================
-- SECURITY INVOKER: work_operations / documents RLS and every trigger apply
-- exactly as for single-row writes. Rows are validated up front with their
-- row number, then inserted by ONE statement (one summary movement). If
-- `p_docs` is given, each document is linked to EVERY created operation
-- (one physical file, N links) inside the same transaction: either all
-- operations and all links exist, or nothing does.
create or replace function public.operations_batch_create(p_job bigint, p_rows jsonb,
                                                         p_docs jsonb default '[]'::jsonb)
returns jsonb language plpgsql security invoker
set search_path = public, pg_temp as $$
declare
  r jsonb; n int := 0; ids bigint[]; docs jsonb := '[]'::jsonb; d jsonb; links jsonb; doc_ids jsonb := '[]'::jsonb;
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
      raise exception 'Satır %: adet sıfırdan büyük olmalı.', n using errcode = '23514';
    end if;
    if (r->>'cost') is not null and (r->>'cost')::numeric < 0 then
      raise exception 'Satır %: maliyet negatif olamaz.', n using errcode = '23514';
    end if;
  end loop;

  with ins as (
    insert into public.work_operations (job_id, operation_type, status, description, quantity,
                                        dimensions, supplier_org_id, unit_id, location_text,
                                        planned_date, cost, note, completed_at, created_by_team_id)
    select p_job, x->>'operation_type', coalesce(nullif(x->>'status', ''), 'planned'),
           nullif(trim(x->>'description'), ''), (x->>'quantity')::numeric,
           nullif(trim(x->>'dimensions'), ''), (x->>'supplier_org_id')::bigint,
           (x->>'unit_id')::bigint, nullif(trim(x->>'location_text'), ''),
           (x->>'planned_date')::date, (x->>'cost')::numeric, nullif(trim(x->>'note'), ''),
           case when x->>'status' = 'done' then now() end,
           public.current_team_id()
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

  return jsonb_build_object('ids', to_jsonb(ids), 'documents', doc_ids);
end;
$$;
revoke all on function public.operations_batch_create(bigint, jsonb, jsonb) from public, anon;
grant execute on function public.operations_batch_create(bigint, jsonb, jsonb) to authenticated;
