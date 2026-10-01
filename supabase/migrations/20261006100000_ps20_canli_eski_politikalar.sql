-- =====================================================================
-- PS20 — Canlıda kalan eski "her oturum her şeyi yapar" politikaları
--
-- Geçiş provasında (canlı şemanın kopyasına ileri paket uygulanınca)
-- bulundu: `bildirimler` ve `aboneler` tabloları Halil tarafından canlıda
-- Git dışında kurulmuş ve ikisinde de
--     <tablo>_admin  FOR ALL  TO authenticated  USING (true) WITH CHECK (true)
-- politikası var. S07R bu tablolara kendi (is_internal / is_admin)
-- politikalarını EKLER ama eskileri adlarıyla düşürmez. Politikalar OR'lanır;
-- eski politika durdukça ekip kaydı olmayan herhangi bir oturum bülten
-- abonelerini (e-posta) ve bildirimleri okuyup değiştirebilir.
--
-- Yerel / test / demo veritabanlarında bu politikalar hiç oluşmadı (orada
-- tabloları S07R kurdu); bu dosya oralarda etkisizdir. İdempotenttir.
-- Önceden uygulanmış migration düzenlenmedi.
-- =====================================================================
drop policy if exists bildirimler_admin on public.bildirimler;
drop policy if exists aboneler_admin    on public.aboneler;

-- Güvence: iç tablolarda koşulsuz politika kalmasın. Canlıda bizim
-- bilmediğimiz başka bir eski politika varsa burada DURUR (sessizce
-- geçmez); adı okunur ve ayrı, gözden geçirilmiş bir adımla kaldırılır.
do $$
declare t text;
begin
  select string_agg(tablename || '.' || policyname, ', ' order by tablename, policyname) into t
    from pg_policies
   where schemaname = 'public'
     and (qual = 'true' or with_check = 'true')
     and not (tablename in ('alt_mecralar','mecralar','pages','products','settings','units',
                            'tuyap_ayarlar','tuyap_gruplar','tuyap_noktalar') and cmd = 'SELECT')
     and not (tablename in ('aboneler','leads') and cmd = 'INSERT');
  if t is not null then
    raise exception 'PS20: koşulsuz politika kaldı: %', t;
  end if;
end $$;
