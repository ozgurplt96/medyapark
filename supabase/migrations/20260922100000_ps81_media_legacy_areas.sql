/* ==========================================================
   Sprint 8.1 — Mecra çalışma yüzeyi: eski alan modellemesi
   ----------------------------------------------------------
   S8.1 Faz A denetiminin GEREKTİRDİĞİ tek şema değişikliği budur.
   Envanter satırlarına DOKUNULMAZ; hiçbir kayıt silinmez.

   Denetim bulgusu (yerel, 20 Eylül 2026):

     alt 3  "Kulüp Raket LED"          exclusive, 1 yüz,  0 yerleşim, 0 eski kayıt
     alt 8  "Kulüp LED Yayın Slotları" exclusive, 15 yüz, 0 yerleşim, 2 eski kayıt

   Ürün sahibi kararı (S8.1 §8): Çukurova Kulübü'ndeki Raket LED
   EŞZAMANLI bir yayın alanıdır; "S01–S15" ise güncel fiziksel envanter
   DEĞİL, eski LED şerit modellemesidir ve 15 münhasır yüz gibi
   sunulmamalıdır.

   Bu yüzden:
     1) `legacy_archived` eklenir — alanı operasyonel çalışma yüzeyinden
        çıkarır, kaydı ve geçmişi KORUR.
     2) Kulüp Raket LED eşzamanlı yayın alanına çevrilir (15 sn).
     3) Kulüp LED Yayın Slotları eski modelleme olarak işaretlenir.

   `hidden` BİLEREK kullanılmadı: o kolon "sitede yayında mı" demektir
   (site.js §71-73) ve public site görünürlüğüdür. Operasyonel envanter
   geçerliliği ayrı bir sorudur; iki anlam tek bayrağa yüklenmez.

   `booking_availability_public` DEĞİŞMEZ ve bu kolona bakmaz.
   Public projeksiyon zaten eşzamanlı alanları dışarıda bırakır; alt 3'ün
   tek yüzünde hiç eski kayıt olmadığı için public çıktı birebir aynıdır.
   ========================================================== */

/* ---------- 1) Eski modelleme işareti (additive) ---------- */
alter table public.alt_mecralar
  add column if not exists legacy_archived boolean not null default false;

comment on column public.alt_mecralar.legacy_archived is
  'true ise alan ESKİ modellemedir; güncel satılabilir envanter değildir. '
  'Kayıtlar, eski kayıtlar ve geçmiş korunur — yalnız operasyonel çalışma '
  'yüzeyinde (Bugün / Yıl / seçim) listelenmez. Public site görünürlüğü için '
  'bu kolon DEĞİL `hidden` kullanılır.';

/* ---------- 2) Kulüp Raket LED → eşzamanlı yayın alanı ----------
   Ada göre eşleştirilir (id varsayılmaz). Etkin yerleşim varsa
   dokunulmaz: veri, kolaylığa feda edilmez. Aynı koruma zaten
   `trg_alt_mecralar_mod_koru` tetikleyicisindedir; burada sessizce
   atlamak için tekrar edilir. */
do $$
declare v_id bigint;
begin
  select a.id into v_id
    from public.alt_mecralar a
    join public.mecralar m on m.id = a.mecra_id
   where m.name = 'Çukurova Kulübü'
     and a.name = 'Kulüp Raket LED'
     and a.occupancy_mode = 'exclusive';

  if v_id is null then
    raise notice 'S8.1: Kulüp Raket LED zaten eşzamanlı ya da bulunamadı — atlandı.';
    return;
  end if;

  if exists (select 1 from public.media_placements p
               join public.units u on u.id = p.unit_id
              where u.alt_mecra_id = v_id and p.commitment <> 'cancelled') then
    raise notice 'S8.1: Kulüp Raket LED yüzlerinde etkin yerleşim var — davranış DEĞİŞTİRİLMEDİ.';
    return;
  end if;

  update public.alt_mecralar
     set occupancy_mode   = 'concurrent',
         creative_seconds = 15,
         /* Tür sınıflandırması: "Raket LED" bir LED ekrandır; Raket/CLP
            ürünü altında görünmesi Doluluk tür filtresini yanıltıyordu. */
         product_id       = coalesce((select id from public.products where name = 'LED Ekran'), product_id)
   where id = v_id;

  raise notice 'S8.1: Kulüp Raket LED eşzamanlı yayın alanına çevrildi (15 sn).';
end $$;

/* ---------- 3) Kulüp LED Yayın Slotları → eski modelleme ----------
   15 "slot" satırı SİLİNMEZ ve pasife ALINMAZ: `units.active=false`
   `booking_availability_public` içinden geçtiği için public çıktıyı
   değiştirirdi. Yalnız alan operasyonel listeden çıkarılır; S01/S02
   üzerindeki iki eski kayıt kurum geçmişinde ve dışa aktarımda okunur
   kalır. */
update public.alt_mecralar a
   set legacy_archived = true
  from public.mecralar m
 where m.id = a.mecra_id
   and m.name = 'Çukurova Kulübü'
   and a.name = 'Kulüp LED Yayın Slotları'
   and a.legacy_archived = false;
