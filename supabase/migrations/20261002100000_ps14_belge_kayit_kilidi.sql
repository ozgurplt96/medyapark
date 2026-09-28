-- =====================================================================
-- PS14c — belge dosyası bütünlüğü: dosyasız belge oluşamaz (EKLEMELİ)
--
-- Kabul turunda (28 Eylül 2026) yeniden üretildi:
--   1. İlişkisiz ("İlişkilendirilmemiş") bir belgenin dosyası, yükleyen ya da
--      yönetici tarafından Storage API ile her an silinebiliyordu: silme
--      politikası yalnız BAĞLI (detached_at is null) belgeleri koruyordu. Yeni
--      kaydedilen ilişkisiz belge de COMMIT'te "ayrık" damgalandığı için
--      korumasızdı. Sonuç: Belgeler'de görünen ama açılamayan belge.
--   2. Kayıt, dosyanın varlığını kilitsiz doğruluyordu; aynı anda yapılan
--      silme ile iki taraf da başarı döndürüp dosyasız belge bırakabiliyordu.
--   3. Kalıcı silme "önce dosya, sonra kayıt" sırasındaydı; ikinci adım
--      başarısız olursa (bağlantı kopması) dosyasız belge kalıyordu.
--
-- Düzeltme (dosya yönetimi mimarisi değişmedi; yalnız sıra ve koruma):
--   · Dosya YALNIZ hiçbir belge kaydı ona işaret etmiyorsa silinebilir
--     (bağlı ya da ilişkisiz fark etmez).
--   · Kalıcı silmede sıra tersine döndü: önce belge kaydı (ilişkisiz +
--     yükleyen/yönetici; önceki kural aynen), sonra dosya. Dosya adımı
--     başarısız olursa geriye dosyasız belge değil, sahipsiz dosya kalır;
--     o da Belgeler'deki "yarım yükleme" temizliğinde görünür.
--   · Kayıt ve silme aynı dosya adı için aynı işlem-içi danışma kilidini
--     alır; bekleyen taraf kilit bırakılınca taze görüntüyle karar verir:
--     silme, COMMIT olmuş belgeyi görüp reddeder; kayıt, silinmiş dosyayı
--     görüp "Dosya depoda bulunamadı" ile açıkça başarısız olur.
-- =====================================================================

-- Dosya silinebilir mi? Hiçbir belge kaydı işaret etmiyorsa. VOLATILE:
-- kilit beklendikten sonraki okuma taze görüntüyle yapılır.
create or replace function public._belge_nesnesi_silinebilir(p_name text)
returns boolean language plpgsql volatile security definer
set search_path = public, auth, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext('medyapark.belge.' || p_name));
  return not exists (
    select 1 from public.documents d
     where d.storage_bucket = 'documents' and d.storage_path = p_name);
end $$;
revoke all on function public._belge_nesnesi_silinebilir(text) from public, anon;
grant execute on function public._belge_nesnesi_silinebilir(text) to authenticated;

-- Belge kaydı silinebilir mi? İlişkisiz + yükleyen/yönetici (önceki kural);
-- "dosya önce silinmiş olmalı" ön koşulu kaldırıldı (sıra tersine döndü).
drop policy if exists s6_documents_remove on public.documents;
create policy s6_documents_remove on public.documents for delete to authenticated
  using ((detached_at is not null) and (public.is_admin() or uploaded_by_team_id = public.current_team_id()));

create or replace function public._trg_documents_ekle()
returns trigger language plpgsql security definer
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
    -- PS14c: aynı dosyanın eşzamanlı silinmesiyle sıralanır (bkz. başlık).
    perform pg_advisory_xact_lock(hashtext('medyapark.belge.' || new.storage_path));
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
end $$;
