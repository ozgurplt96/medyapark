-- =====================================================================
-- PS13 — erişim ve veri bütünlüğü düzeltmeleri (EKLEMELİ)
--
-- S13 incelemesinde yeniden üretilen bulgular:
--
-- B01 (P1) `media_schedule` görünümü sahibinin (postgres) yetkisiyle
--     çalışıyordu: ekip kaydı olmayan ya da PASİF kullanıcı, taban
--     tablolarda (media_placements, customers, jobs) hiçbir satır
--     göremezken görünüm üzerinden müşteri adı, iş adı ve notları
--     okuyabiliyordu. → security_invoker; yetki taban tabloların RLS'inden
--     gelir. İç kullanıcı için sonuç değişmez. Public projeksiyon
--     (booking_availability_public) bu görünümü KULLANMAZ.
-- B02 (P1) `media` (public) bucket'ında yazma/güncelleme/silme yalnız
--     bucket_id'ye bakıyordu: oturum açmış HERHANGİ bir kullanıcı (pasif
--     ekip üyesi dahil) site görsellerini yükleyebilir/silebilirdi.
--     → yazma yolları aktif iç kullanıcı ister. Okuma herkese açık kalır.
-- B03 (P3) approve_quote anon'a EXECUTE açıktı (invoker; RLS nedeniyle
--     etkisiz). Hijyen: yalnız authenticated.
-- B04 (P1) Kurum sayfasından "Kişi Ekle" (ve lead dönüşümü) kişiyi
--     `contacts.customer_id` ile kaydediyor ama `contact_affiliations`
--     satırı oluşturmuyordu. Kurum sayfası kişileri bağlantılardan okuduğu
--     için kişi "kaydedildi" denmesine rağmen kurumda görünmüyordu.
--     PS3 kuralı: contacts.customer_id = kişinin birincil+aktif bağlantısı.
--     → kişi bir kuruma bağlı oluşturulduğunda ve hiç bağlantısı yoksa
--     birincil bağlantı veritabanında üretilir (tüm istemci yolları için);
--     mevcut yetim kayıtlar deterministik olarak onarılır.
-- S12 açığı: paket bedeli düzenlenebilir hale geliyor; tutar/ad/para
--     birimi değişimi güvenilir Hareket üretir (`price_group_changed`).
-- =====================================================================

-- ---------------------------------------------------------------- B01
alter view public.media_schedule set (security_invoker = true);
revoke insert, update, delete, truncate, references, trigger on public.media_schedule from authenticated, anon;
grant select on public.media_schedule to authenticated;

-- ---------------------------------------------------------------- B02
drop policy if exists media_authenticated_insert on storage.objects;
drop policy if exists media_authenticated_update on storage.objects;
drop policy if exists media_authenticated_delete on storage.objects;
drop policy if exists media_internal_insert on storage.objects;   -- yeniden çalıştırılabilir
drop policy if exists media_internal_update on storage.objects;
drop policy if exists media_internal_delete on storage.objects;
create policy media_internal_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_internal());
create policy media_internal_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_internal())
  with check (bucket_id = 'media' and public.is_internal());
create policy media_internal_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_internal());

-- ---------------------------------------------------------------- B03
revoke all on function public.approve_quote(bigint) from public, anon;
grant execute on function public.approve_quote(bigint) to authenticated;

-- ---------------------------------------------------------------- B04
create or replace function public._kisi_ilk_baglanti()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if new.customer_id is not null
     and not exists (select 1 from public.contact_affiliations a where a.contact_id = new.id) then
    insert into public.contact_affiliations (contact_id, customer_id, title, department, is_primary, active)
    values (new.id, new.customer_id, new.title, new.department, true, coalesce(new.active, true));
  end if;
  return null;
end $$;
revoke all on function public._kisi_ilk_baglanti() from public, anon, authenticated;
drop trigger if exists trg_kisi_ilk_baglanti on public.contacts;
create trigger trg_kisi_ilk_baglanti
  after insert or update of customer_id on public.contacts
  for each row execute function public._kisi_ilk_baglanti();

-- Mevcut yetimler: kurumu olan ama hiç bağlantısı olmayan kişi.
insert into public.contact_affiliations (contact_id, customer_id, title, department, is_primary, active)
select c.id, c.customer_id, c.title, c.department, true, coalesce(c.active, true)
  from public.contacts c
 where c.customer_id is not null
   and not exists (select 1 from public.contact_affiliations a where a.contact_id = c.id);

-- ---------------------------------------------------------- paket bedeli
alter table public.entries drop constraint if exists entries_system_kind_check;
alter table public.entries add constraint entries_system_kind_check check (system_kind is null or system_kind = any (array[
  'work_created','work_renamed','work_phase','work_lifecycle','work_contract','work_accounting',
  'operation_created','operation_status','quote_revised','quote_approved',
  'document_added','document_linked','document_unlinked','document_changed',
  'contract_created','contract_signed','contract_cancelled',
  'media_created','media_changed','media_cancelled','price_group_changed']));

create or replace function public._tutar_tr(n numeric) returns text language sql immutable as $$
  select case when n is null then '—'
    else translate(to_char(n, 'FM999,999,999,990.00'), ',.', '.,') end
$$;

create or replace function public._trg_paket_hareket()
returns trigger language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare parca text[] := '{}'; n int;
begin
  if new.label is distinct from old.label then
    parca := parca || ('ad: ' || old.label || ' → ' || new.label);
  end if;
  if new.cost_amount is distinct from old.cost_amount then
    parca := parca || ('maliyet ' || public._tutar_tr(old.cost_amount) || ' → ' || public._tutar_tr(new.cost_amount));
  end if;
  if new.sale_amount is distinct from old.sale_amount then
    parca := parca || ('satış ' || public._tutar_tr(old.sale_amount) || ' → ' || public._tutar_tr(new.sale_amount));
  end if;
  if new.currency is distinct from old.currency then
    parca := parca || ('para birimi ' || old.currency || ' → ' || new.currency);
  end if;
  if coalesce(array_length(parca, 1), 0) = 0 then return null; end if;   -- yalnız not değiştiyse sessiz
  select count(*) into n from public.work_operations where price_group_id = new.id;
  perform public._sistem_hareketi(new.job_id, 'price_group_changed',
    'Paket bedeli güncellendi — ' || new.label || ': ' || array_to_string(parca, ' · ')
      || ' ' || new.currency || ' (' || n || ' işlem)', null, null);
  return null;
end $$;
revoke all on function public._trg_paket_hareket() from public, anon, authenticated;
drop trigger if exists trg_paket_hareket on public.operation_price_groups;
create trigger trg_paket_hareket after update on public.operation_price_groups
  for each row execute function public._trg_paket_hareket();
