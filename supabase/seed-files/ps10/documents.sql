-- =====================================================================
-- PS10 §8 — Örnek zincirlerin GERÇEK, AÇILABİLİR belgeleri
--
-- `scripts/dev-seed-documents.ps1` tarafından, dosyalar yerel `documents`
-- deposuna yüklendikten SONRA çalıştırılır. Nesne yolu manifest.tsv ile
-- aynı kuraldan türer: a10d0000-0000-4000-8000-<n:12>/<dosya>.
--
-- Her belge zincirin AŞAMASINA uygun yere bağlanır (teklif → iş,
-- sözleşme → yapısal sözleşme kaydı, baskı onay görseli → baskı
-- operasyonu, montaj fotoğrafı → montaj operasyonu, fatura → iş, katalog
-- → hiçbir yere: İlişkilendirilmemiş). Her işe rastgele tüm türler
-- EKLENMEZ. Tarihler iş tarihidir.
--
-- İDEMPOTENT: aynı depo yolu zaten kayıtlıysa atlanır; nesne yoksa atlanır
-- (kırık yol kaydedilmez); zincir işi yoksa atlanır. Kullanıcı belgelerine
-- dokunulmaz. İçerik açıkça ÖRNEKTİR (imzasız, "ÖRNEK" damgalı).
-- =====================================================================
do $$
declare
  d date := (now() at time zone 'Europe/Istanbul')::date;
  y int := extract(year from d)::int; gy int := y - 1;
  r record; yol text; j_id bigint; j_title text; j_owner bigint; hedef bigint; yeni bigint; ad text; eklenen int := 0; eksik int := 0;
  sahip bigint; ilk_ekip bigint;
begin
  perform set_config('timezone', 'Europe/Istanbul', true);
  select id into ilk_ekip from public.team where active order by id limit 1;
  -- İş tarihi ve yükleyici tohum tarafından verilir; kimlik koruması YALNIZ
  -- bu blokta kapatılır (istemci yolu değişmez).
  execute 'alter table public.documents disable trigger trg_documents_sabit';
  execute 'alter table public.entries disable trigger trg_entries_koken_sabit';

  for r in
    select * from (values
      ( 1,'C1', 'job',      'teklif',           'Teklif',                  make_date(gy,2,10) + time '10:10'),
      ( 2,'C1', 'contract', 'sozlesme',         'Sözleşme',                make_date(gy,2,20) + time '14:10'),
      ( 3,'C1', 'op:baski', 'tasarim',          'Baskı onay görseli',      make_date(gy,2,23) + time '10:50'),
      ( 4,'C1', 'op:montaj','montaj_fotografi', 'Montaj fotoğrafı',        make_date(gy,3,1)  + time '09:15'),
      ( 5,'C1', 'job',      'muhasebe',         'Fatura özeti',            make_date(gy,5,3)  + time '09:50'),
      ( 6,'C2', 'contract', 'sozlesme',         'Sözleşme',                make_date(gy,8,22) + time '12:50'),
      ( 7,'C2R','contract', 'sozlesme',         'Yenileme sözleşmesi',     make_date(gy,11,26)+ time '14:50'),
      ( 8,'C3', 'job',      'teklif',           'Teklif',                  make_date(y,2,24)  + time '10:25'),
      ( 9,'C3', 'contract', 'sozlesme',         'Sözleşme',                make_date(y,3,3)   + time '11:50'),
      (10,'C3', 'op:montaj','montaj_fotografi', 'Montaj fotoğrafı',        make_date(y,3,15)  + time '08:55'),
      (11,'C3', 'job',      'muhasebe',         'Fatura özeti',            make_date(y,6,3)   + time '09:55'),
      (12,'C4', 'job',      'teklif',           'Teklif',                  (d-65) + time '10:05'),
      (13,'C4', 'contract', 'sozlesme',         'Sözleşme',                (d-54) + time '11:55'),
      (14,'C4', 'op:baski', 'tasarim',          'Baskı onay görseli',      (d-48) + time '15:20'),
      (15,'C4', 'op:montaj','montaj_fotografi', 'Montaj fotoğrafı',        (d-40) + time '09:25'),
      (16,'C5', 'job',      'teklif',           'Teklif',                  (d-15) + time '10:05'),
      (17,'C5', 'contract', 'sozlesme',         'Sözleşme',                (d-6)  + time '11:55'),
      (18,'C5', 'job',      'tasarim',          'Lansman tasarımı — onaylı',(d-2) + time '15:25'),
      (19,'C6', 'job',      'teklif',           'Teklif',                  (d-2)  + time '11:15'),
      (20,'C7', 'job',      'teklif',           'Teklif',                  (d-32) + time '10:05'),
      (21,'C7', 'contract', 'sozlesme',         'Sözleşme',                (d-26) + time '11:55'),
      (22,'C7', 'job',      'tasarim',          'LED kreatif (15 sn) — kare görseli', (d-23) + time '15:55'),
      (23,'C8', 'job',      'teklif',           'Teklif',                  (d-50) + time '10:05'),
      (24,null, null,       'katalog',          'Mecra kataloğu ve fiyat listesi ' || y || ' (örnek)', make_date(y,1,15) + time '11:00')
    ) v(n, zincir, bag, tur, baslik, zaman)
  loop
    yol := 'a10d0000-0000-4000-8000-' || lpad(r.n::text, 12, '0') || '/'
        || case r.tur when 'teklif' then 'ornek-teklif.pdf' when 'sozlesme' then 'ornek-sozlesme.pdf'
                      when 'tasarim' then 'ornek-tasarim.jpg' when 'montaj_fotografi' then 'ornek-uygulama-gorseli.png'
                      when 'muhasebe' then 'ornek-fatura.pdf' else 'ornek-katalog.pdf' end;
    if exists (select 1 from public.documents where storage_bucket = 'documents' and storage_path = yol) then continue; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'documents' and name = yol) then
      eksik := eksik + 1; continue;                    -- kırık yol KAYDEDİLMEZ
    end if;

    j_id := null; j_title := null; j_owner := null; hedef := null; sahip := ilk_ekip;
    if r.zincir is not null then
      select id, title, assignee_id into j_id, j_title, j_owner from public.jobs where note = 'PS10·' || r.zincir;
      if j_id is null then continue; end if;
      sahip := coalesce(j_owner, ilk_ekip);
      if r.bag = 'job' then hedef := j_id;
      elsif r.bag = 'contract' then select id into hedef from public.contracts where job_id = j_id order by id limit 1;
      else select id into hedef from public.work_operations where job_id = j_id and operation_type = split_part(r.bag, ':', 2) order by id limit 1;
      end if;
      if hedef is null then continue; end if;
    end if;

    ad := case when r.zincir is null then r.baslik
               when r.bag = 'contract' then r.baslik || ' — ' || (select title from public.contracts where id = hedef)
               else r.baslik || ' — ' || j_title end;
    insert into public.documents (original_name, title, doc_type, mime_type, provider, storage_bucket, storage_path, note)
    values (split_part(yol, '/', 2), left(ad, 200), r.tur, null, 'supabase', 'documents', yol,
            'Örnek içerik — gerçek bir ticari belge değildir.')
    returning id into yeni;
    if hedef is not null then
      insert into public.document_links (document_id, job_id, contract_id, operation_id)
      values (yeni, case when r.bag = 'job' then hedef end, case when r.bag = 'contract' then hedef end,
              case when r.bag like 'op:%' then hedef end);
    end if;
    update public.documents set created_at = r.zaman, uploaded_by_team_id = sahip where id = yeni;
    update public.document_links set created_at = r.zaman, created_by_team_id = sahip where document_id = yeni;
    eklenen := eklenen + 1;
  end loop;

  -- "Belge eklendi" hareketi COMMIT'te (ertelenmiş) üretilir; burada
  -- şimdi üretilir ki iş tarihine ve yükleyiciye taşınabilsin.
  set constraints all immediate;
  update public.entries e set occurred_at = dd.created_at + interval '1 minute', created_by_team_id = dd.uploaded_by_team_id
    from public.documents dd
   where e.document_id = dd.id and e.source = 'system' and e.system_kind = 'document_added'
     and dd.storage_path like 'a10d0000-0000-4000-8000-%' and e.occurred_at > now() - interval '10 minutes';

  execute 'alter table public.documents enable trigger trg_documents_sabit';
  execute 'alter table public.entries enable trigger trg_entries_koken_sabit';
  raise notice 'PS10 belgeler: % eklendi, % dosya depoda bulunamadı (önce yükleme betiği çalışmalı).', eklenen, eksik;
end $$;
