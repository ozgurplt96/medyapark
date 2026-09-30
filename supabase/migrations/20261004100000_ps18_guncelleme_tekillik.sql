-- =====================================================================
-- PS18 — Güncelleme (Entry) oluşturmada tekrar güvenliği + erişim hijyeni
--
-- 1) S13/S14 açık listesi (P3): kayıp yanıttan sonra "Kaydet" ikinci bir
--    güncelleme üretebiliyordu; dosyasız yol ayrıca iki ayrı istekti
--    (önce entries, sonra entry_relevance) — ikinci adım düşerse etiketsiz
--    yarım kayıt kalıyordu. Mevcut PS14 deseni (migration 20261001100000)
--    aynen uygulanır: eski gövde `_entry_create_yap` adını alır, aynı ad
--    ve p_islem (varsayılan null) ile sarmalayıcı yazılır. İstemci artık
--    YENİ güncellemenin tamamını (dosyalı/dosyasız) bu tek işlemden geçirir.
-- 2) booking_availability_public: güncellenemez (GROUP BY/UNION) bir görünüm
--    olmasına rağmen anon/authenticated'a INSERT/UPDATE/DELETE/TRUNCATE
--    verilmişti (Supabase varsayılanı). Çalışma anında reddediliyordu; yetki
--    yine de geri alınır, yalnız SELECT kalır.
-- 3) demote_sibling_affiliations / sync_primary_affiliation tetikleyici
--    fonksiyonlarıdır (RPC ile çalıştırılamaz) ama anon'a EXECUTE açıktı.
--
-- Eklemeli ve tekrar uygulanabilir. Veri değiştirmez.
-- =====================================================================

-- 1) ---------------------------------------------------- entry_create
alter table public.islem_anahtarlari drop constraint if exists islem_anahtarlari_tur;
alter table public.islem_anahtarlari add constraint islem_anahtarlari_tur
  check (tur = any (array['job_create','media_placements_create','operations_batch_create','document_create','entry_create']));

do $$ begin
  if not exists (select 1 from pg_proc where proname = '_entry_create_yap' and pronamespace = 'public'::regnamespace) then
    alter function public.entry_create_with_documents(jsonb, bigint[], jsonb) rename to _entry_create_yap;
  end if;
end $$;

drop function if exists public.entry_create_with_documents(jsonb, bigint[], jsonb, uuid);
create function public.entry_create_with_documents(p_entry jsonb, p_ilgili bigint[], p_docs jsonb,
                                                   p_islem uuid default null)
returns bigint language plpgsql security invoker
set search_path = public, pg_temp as $$
declare o jsonb; v bigint;
begin
  o := public._islem_basla('entry_create', p_islem,
         md5(jsonb_build_array(p_entry, to_jsonb(p_ilgili), p_docs)::text));
  if o is not null then return (o->>'sonuc')::bigint; end if;
  v := public._entry_create_yap(p_entry, p_ilgili, p_docs);
  perform public._islem_bitir('entry_create', p_islem, to_jsonb(v));
  return v;
end $$;

revoke all on function public._entry_create_yap(jsonb, bigint[], jsonb) from public, anon;
grant execute on function public._entry_create_yap(jsonb, bigint[], jsonb) to authenticated;
revoke all on function public.entry_create_with_documents(jsonb, bigint[], jsonb, uuid) from public, anon;
grant execute on function public.entry_create_with_documents(jsonb, bigint[], jsonb, uuid) to authenticated;
comment on function public._entry_create_yap(jsonb, bigint[], jsonb) is 'PS18: eski entry_create_with_documents gövdesi; sarmalayıcı çağırır.';

-- 2) ---------------------------------------- public görünüm: yalnız okuma
revoke insert, update, delete, truncate, references, trigger
  on public.booking_availability_public from anon, authenticated;
grant select on public.booking_availability_public to anon, authenticated;

-- 3) ------------------------------ tetikleyici fonksiyonları RPC değildir
revoke all on function public.demote_sibling_affiliations() from public, anon, authenticated;
revoke all on function public.sync_primary_affiliation() from public, anon, authenticated;
