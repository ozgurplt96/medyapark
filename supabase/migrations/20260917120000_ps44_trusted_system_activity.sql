-- Product Simplification Sprint 4.4 — trusted system activity (Hareketler)
--
-- PROBLEM (verified in S4.3 QA and again in S4.4 inventory):
-- `source='system'` Entries were written from the BROWSER by `sysEntry()`,
-- running as the logged-in user. RLS could not tell a genuine phase change
-- from a user typing a fake "Aşama değişti" row, so `source='system'` was
-- not trustworthy. A Hareketler surface built on it would show forgeable events.
--
-- APPROACH: events are emitted BECAUSE a real mutation happened.
--   * AFTER triggers on the mutated tables derive the event from OLD/NEW.
--   * Trigger functions are SECURITY DEFINER (owner `postgres` has BYPASSRLS),
--     so they can write system rows that ordinary clients no longer can.
--   * There is deliberately NO callable "create_system_event(text,...)" RPC:
--     that would only move the forgeable writer behind a function (§4).
--   * The caller cannot choose the text, the kind, the target or the actor.
--     Text is built here from OLD/NEW; actor is `current_team_id()`, which
--     resolves from the authenticated JWT (`auth.uid()`), not from client input.
--
-- CANONICAL STORE: `entries` with `source='system'` stays the one place these
-- live. Work Timeline already reads it. No parallel `system_events` table and
-- no copy into `bildirimler` (§7, §19).
--
-- PROSPECTIVE ONLY (§21): existing system rows are not rewritten.

-- =====================================================================
-- 1. Structured event kind
-- =====================================================================
-- A small, KNOWN set of V0 families (§9) - text + CHECK, not an enum type and
-- not free JSON (06 §1.4: portable to MySQL). Lets Hareketler filter by family
-- without parsing Turkish sentences.
alter table public.entries add column if not exists system_kind text null;

alter table public.entries drop constraint if exists entries_system_kind_check;
alter table public.entries add constraint entries_system_kind_check check (
  system_kind is null or system_kind in (
    'work_created','work_phase','work_lifecycle','work_contract','work_accounting',
    'operation_created','operation_status',
    'quote_revised','quote_approved'));

-- A human Update can never carry a system kind.
alter table public.entries drop constraint if exists entries_system_kind_only_system;
alter table public.entries add constraint entries_system_kind_only_system
  check (system_kind is null or source = 'system');

create index if not exists entries_system_feed_idx
  on public.entries (occurred_at desc, id desc) where source = 'system';

-- =====================================================================
-- 2. Label helpers (single server-side source for event text)
-- =====================================================================
-- Mirrors FAZ_ETIKET / LIFELBL / accLbl / opTypeLbl / opStatLbl in panel.js.
-- If a label changes in the UI it must change here too; kept IMMUTABLE and
-- tiny on purpose.
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
      when 'yok' then 'Henüz yok' when 'hazir' then 'Hazır'
      when 'gonderildi' then 'Gönderildi' when 'islendi' then 'İşlendi' end
    when 'optur' then case v
      when 'baski' then 'Baskı' when 'montaj' then 'Montaj'
      when 'sokum' then 'Söküm' when 'diger' then 'Diğer' end
    when 'opdurum' then case v
      when 'planned' then 'Planlandı' when 'waiting' then 'Bekliyor'
      when 'in_progress' then 'Devam ediyor' when 'done' then 'Tamamlandı'
      when 'cancelled' then 'İptal' end
  end, v);
$$;

-- Internal writer. NOT granted to clients (see REVOKE below). Only the
-- SECURITY DEFINER trigger functions in this migration call it.
create or replace function public._sistem_hareketi(p_job bigint, p_kind text, p_body text)
returns void language plpgsql security definer
set search_path = public, auth, pg_temp as $$
begin
  if p_job is null or p_body is null then return; end if;
  insert into public.entries (job_id, body, source, system_kind, created_by_team_id)
  values (p_job, p_body, 'system', p_kind, public.current_team_id());
end;
$$;
revoke all on function public._sistem_hareketi(bigint, text, text) from public, anon, authenticated;

-- =====================================================================
-- 3. Work (jobs) events
-- =====================================================================
-- Replaces browser `sysEntry` calls in: jobMove, jobForm (edit + create),
-- workLifeDegis, workMetaSave (contract + accounting), accDurum.
-- One trigger covers EVERY write path, including ones added later.
-- Note-only / cosmetic column changes emit nothing (§6).
create or replace function public._trg_jobs_hareket() returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    perform public._sistem_hareketi(new.id, 'work_created', 'İş oluşturuldu.');
    return new;
  end if;

  if new.status is distinct from old.status then
    perform public._sistem_hareketi(new.id, 'work_phase',
      'Aşama değişti: ' || public._lbl('faz', old.status) || ' → ' || public._lbl('faz', new.status));
  end if;

  if new.lifecycle_status is distinct from old.lifecycle_status then
    perform public._sistem_hareketi(new.id, 'work_lifecycle',
      'Durum değişti: ' || public._lbl('yasam', old.lifecycle_status) || ' → '
      || public._lbl('yasam', new.lifecycle_status)
      || case when new.lifecycle_status = 'kapandi' and new.closed_reason is not null
              then ' (' || public._lbl('kapanis', new.closed_reason) || ')' else '' end);
  end if;

  if new.contract_status is distinct from old.contract_status then
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
  after insert or update of status, lifecycle_status, contract_status, accounting_status
  on public.jobs for each row execute function public._trg_jobs_hareket();

-- =====================================================================
-- 4. Operation events
-- =====================================================================
-- Same meaningful-transition rule the browser used (C4 §16): creation, start,
-- completion, cancellation. Planned <-> waiting shuffles and note-only edits
-- emit nothing.
create or replace function public._trg_ops_hareket() returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare ad text := public._lbl('optur', new.operation_type);
begin
  if tg_op = 'INSERT' then
    perform public._sistem_hareketi(new.job_id, 'operation_created',
      ad || ' kaydı eklendi'
      || case when new.planned_date is not null then ' · ' || to_char(new.planned_date, 'DD.MM.YYYY') else '' end);
    return new;
  end if;

  if new.status is distinct from old.status and new.status in ('in_progress','done','cancelled') then
    perform public._sistem_hareketi(new.job_id, 'operation_status',
      case new.status
        when 'done'      then ad || ' tamamlandı.'
        when 'cancelled' then ad || ' iptal edildi.'
        else ad || ' başladı (' || public._lbl('opdurum', old.status) || ' → '
                || public._lbl('opdurum', new.status) || ').'
      end);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ops_hareket on public.work_operations;
create trigger trg_ops_hareket
  after insert or update of status on public.work_operations
  for each row execute function public._trg_ops_hareket();

-- =====================================================================
-- 5. Offer revision event
-- =====================================================================
-- Replaces the browser `sysEntry` in quoteRevise(). The revision clone copies
-- `work_id` from its source, so the Work context is on the row itself.
create or replace function public._trg_quotes_hareket() returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp as $$
begin
  if new.revision_of_id is not null and new.work_id is not null then
    perform public._sistem_hareketi(new.work_id, 'quote_revised',
      'Teklif #' || new.revision_of_id || ' revize edildi → #' || new.id
      || ' (rev ' || coalesce(new.revision_no, 1) || ')');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quotes_hareket on public.quotes;
create trigger trg_quotes_hareket
  after insert on public.quotes
  for each row execute function public._trg_quotes_hareket();

-- =====================================================================
-- 6. approve_quote() — existing server-side system writer
-- =====================================================================
-- Found in the S4.4 inventory (previous audits missed it): approve_quote()
-- is SECURITY INVOKER and inserts its own `source='system'` row
-- ('Teklif #N onaylandı · …') WITHOUT an actor or kind. It is NOT redefined
-- here - changing a working canonical RPC body is not needed to fix trust.
-- Instead a BEFORE INSERT stamp:
--   * fills the actor from the authenticated session when a system row
--     arrives without one (never overwrites a supplied actor), and
--   * tags approve_quote's row with `quote_approved` via its `quotes#N`
--     source_ref.
-- approve_quote still succeeds after the policy change below because only
-- admins can approve quotes (quotes write RLS = is_admin) and admins keep
-- system-insert rights for backup restore.
create or replace function public._trg_entries_sistem_damga() returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp as $$
begin
  if new.source = 'system' then
    if new.created_by_team_id is null then
      new.created_by_team_id := public.current_team_id();
    end if;
    if new.system_kind is null and new.source_ref like 'quotes#%' then
      new.system_kind := 'quote_approved';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_entries_sistem_damga on public.entries;
create trigger trg_entries_sistem_damga
  before insert on public.entries
  for each row execute function public._trg_entries_sistem_damga();

-- =====================================================================
-- 7. Trust boundary
-- =====================================================================
-- INSERT: ordinary internal users may create HUMAN Entries only (author =
-- self, unchanged from S4.3). A `source='system'` row from a client is
-- rejected. Admin keeps it because backup RESTORE (`YEDEK_SIRA` includes
-- `entries`) must replay historical system rows - admin is already trusted
-- with delete/restore of the whole dataset. Trigger functions bypass RLS as
-- their owner and are unaffected.
drop policy if exists "s43_entries_write" on public.entries;
create policy "s44_entries_write" on public.entries
  for insert to authenticated
  with check (
    public.is_admin()
    or (public.is_internal()
        and source <> 'system'
        and system_kind is null
        and created_by_team_id = public.current_team_id())
  );

-- UPDATE: S4.3 left one path open - an ASSIGNEE's WITH CHECK did not require
-- `source <> 'system'`, so an assignee could promote a row to system.
drop policy if exists "s43_entries_modify" on public.entries;
create policy "s44_entries_modify" on public.entries
  for update to authenticated
  using (
    public.is_admin()
    or (source <> 'system' and created_by_team_id = public.current_team_id())
    or assignee_id = public.current_team_id()
  )
  with check (
    public.is_admin()
    or (source <> 'system' and system_kind is null
        and (created_by_team_id = public.current_team_id()
             or assignee_id = public.current_team_id()))
  );

-- Immutable provenance. A policy cannot compare OLD and NEW, so an assignee
-- could previously rewrite `created_by_team_id` (forging the author of a human
-- Update) while keeping `assignee_id = self`. For non-admins, source, kind and
-- author are now frozen on update. Raising (not silently ignoring) makes a
-- forgery attempt visible; legitimate edits never send these columns changed.
create or replace function public._trg_entries_koken_sabit() returns trigger
language plpgsql security definer
set search_path = public, auth, pg_temp as $$
begin
  if not public.is_admin() and (
       new.source             is distinct from old.source
    or new.system_kind        is distinct from old.system_kind
    or new.created_by_team_id is distinct from old.created_by_team_id) then
    raise exception 'Kaydın kaynağı ve yazarı değiştirilemez.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_entries_koken_sabit on public.entries;
create trigger trg_entries_koken_sabit
  before update on public.entries
  for each row execute function public._trg_entries_koken_sabit();

-- Trigger functions are not meant to be called directly.
revoke all on function public._trg_jobs_hareket()           from public, anon, authenticated;
revoke all on function public._trg_ops_hareket()            from public, anon, authenticated;
revoke all on function public._trg_quotes_hareket()         from public, anon, authenticated;
revoke all on function public._trg_entries_sistem_damga()   from public, anon, authenticated;
revoke all on function public._trg_entries_koken_sabit()    from public, anon, authenticated;
