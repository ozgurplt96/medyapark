-- Product Simplification Sprint 11 — yayın dili + tek işlemde iş oluşturma
--
-- 1. Güvenilir mecra hareketlerinin DİLİ, ekibin kullandığı sözcüklere
--    uyumlanır: "kesin kayıt" / "rezervasyon (opsiyon)" yerine "yayın" /
--    "opsiyon"; "kesinleşti" yerine "opsiyondan yayına çevrildi".
--    Durum değerleri (`reserved` / `confirmed` / `cancelled`), RPC'ler,
--    çakışma ve bloklama kuralları DEĞİŞMEZ: yalnız anlatım değişir.
--    Geçmiş hareket satırları yeniden yazılmaz (S4.4 ileriye dönük kural).
--
-- 2. `job_create`: iş + hesap tarafı (work_parties.account) + ilgili ekip
--    (work_followers) TEK işlemde. Önceden istemci bunları üç ayrı istekle
--    yazıyor ve son ikisinin hatasını yutuyordu; iş taraf/takipçi olmadan
--    yarım kalabiliyordu. SECURITY INVOKER: RLS ve tüm tetikleyiciler
--    aynen geçerli.
--
-- Tekrar çalıştırılabilir.

create or replace function public._trg_media_hareket_ekle() returns trigger
language plpgsql security definer
set search_path = public, pg_temp as $$
declare g record; ad text; ne text;
begin
  for g in select work_id, customer_id, commitment, start_date, end_date,
                  (alt_mecra_id is not null) as eszamanli,
                  count(*) as n, min(id) as ilk,
                  array_agg(id order by id) as ids
             from yeni where commitment <> 'cancelled'
            group by 1,2,3,4,5,6 loop
    if g.eszamanli then
      select string_agg(public._medya_hedef_adi(null, p.alt_mecra_id), ', ' order by p.id) into ad
        from yeni p where p.id = any(g.ids);
      ne := ad || ' için ' || case g.commitment when 'confirmed' then 'yayın' else 'opsiyon' end || ' eklendi';
    elsif g.n = 1 then
      ne := public._medya_hedef_adi((select unit_id from yeni where id = g.ilk), null)
            || ' için ' || case g.commitment when 'confirmed' then 'yayın' else 'opsiyon' end
            || ' oluşturuldu';
    else
      select string_agg(u.name, ', ' order by u.name) into ad
        from yeni p join public.units u on u.id = p.unit_id where p.id = any(g.ids);
      ne := g.n || ' yüzey için ' || case g.commitment when 'confirmed' then 'yayın' else 'opsiyon' end
            || ' oluşturuldu: ' || ad;
    end if;
    perform public._medya_hareketi(g.work_id, g.customer_id, 'media_created',
      ne || ' · ' || public._medya_donem(g.start_date, g.end_date), g.ilk);
  end loop;
  return null;
end;
$$;

create or replace function public._trg_media_hareket_degis() returns trigger
language plpgsql security definer
set search_path = public, pg_temp as $$
declare hedef text; parca text[] := '{}';
begin
  hedef := public._medya_hedef_adi(new.unit_id, new.alt_mecra_id);
  if new.commitment = 'cancelled' and old.commitment <> 'cancelled' then
    perform public._medya_hareketi(new.work_id, new.customer_id, 'media_cancelled',
      hedef || ' ' || case when old.commitment = 'reserved' then 'opsiyonu' else 'yayını' end
      || ' iptal edildi · ' || public._medya_donem(new.start_date, new.end_date), new.id);
    return null;
  end if;
  if new.commitment = 'cancelled' then return null; end if;

  if new.unit_id is distinct from old.unit_id then
    parca := parca || ('yüzey değişti: ' || public._medya_hedef_adi(old.unit_id, null));
  end if;
  if new.start_date = old.start_date and new.end_date is distinct from old.end_date then
    parca := parca || (case
      when new.end_date is null then 'bitiş bilinmiyor olarak işaretlendi'
      when old.end_date is null or new.end_date > old.end_date
        then to_char(new.end_date, 'DD.MM.YYYY') || ' tarihine uzatıldı'
      else to_char(new.end_date, 'DD.MM.YYYY') || ' tarihine kısaltıldı' end);
  elsif new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then
    parca := parca || ('dönem değişti: ' || public._medya_donem(old.start_date, old.end_date)
                       || ' → ' || public._medya_donem(new.start_date, new.end_date));
  end if;
  if new.commitment is distinct from old.commitment then
    parca := parca || (case new.commitment when 'confirmed' then 'opsiyondan yayına çevrildi'
                                           else 'yayından opsiyona çevrildi' end);
  end if;
  if new.work_id is distinct from old.work_id then
    parca := parca || ('bağlı iş değişti'::text);
  end if;
  if array_length(parca, 1) is null then return null; end if;
  perform public._medya_hareketi(new.work_id, new.customer_id, 'media_changed',
    hedef || ': ' || array_to_string(parca, '; '), new.id);
  return null;
end;
$$;

revoke all on function public._trg_media_hareket_ekle()  from public, anon, authenticated;
revoke all on function public._trg_media_hareket_degis() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. job_create — iş + hesap tarafı + ilgili ekip, tek işlem
-- ---------------------------------------------------------------------
create or replace function public.job_create(p_job jsonb, p_followers bigint[])
returns bigint language plpgsql security invoker
set search_path = public, pg_temp as $$
declare yeni bigint; v_cust bigint := (p_job->>'customer_id')::bigint;
begin
  if nullif(btrim(coalesce(p_job->>'title', '')), '') is null then
    raise exception 'Başlık zorunlu.' using errcode = '23514';
  end if;
  insert into public.jobs (title, customer_id, primary_contact_id, status, is_urgent, lifecycle_status)
  values (regexp_replace(btrim(p_job->>'title'), '\s+', ' ', 'g'), v_cust,
          (p_job->>'primary_contact_id')::bigint,
          coalesce(nullif(p_job->>'status', ''), 'temas_takip'),
          coalesce((p_job->>'is_urgent')::boolean, false), 'acik')
  returning id into yeni;
  if v_cust is not null then
    insert into public.work_parties (job_id, customer_id, role) values (yeni, v_cust, 'account');
  end if;
  if p_followers is not null and array_length(p_followers, 1) > 0 then
    insert into public.work_followers (job_id, team_id)
    select yeni, f from unnest(p_followers) f on conflict do nothing;
  end if;
  return yeni;
end;
$$;
revoke all on function public.job_create(jsonb, bigint[]) from public, anon;
grant execute on function public.job_create(jsonb, bigint[]) to authenticated;
