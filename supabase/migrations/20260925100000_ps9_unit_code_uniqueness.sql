-- =====================================================================
-- PS9 kapanış §3 — Pozisyon kodu KENDİ alanı içinde benzersizdir
--
-- Bağlam: kod yalnız kendi alanında benzersizdir (S8.1 §7). M1'de
-- Megalight P1–P12 ve Raket P1–P29 aynı `Pxx-A/B` kodlamasını kullanır
-- ve `P3-A` üç ayrı alanda birden bulunur — bu DOĞRUdur ve
-- korunmalıdır. Yasaklanan şey AYNI alanda aynı kodun iki kez olmasıdır.
--
-- Neden kısıt gerekli: envanter ekleme akışı yalnız istemcide kontrol
-- ediyordu. İki hızlı gönderim (çift tıklama ya da iki sekme) aynı kodu
-- iki kez yazabiliyordu; istemci kontrolü yarış koşulunu kapatmaz.
--
-- Uygulanmadan önce doğrulandı: mevcut veride (alt_mecra_id, name)
-- çifti için 0 mükerrer, 0 alansız birim.
-- =====================================================================

create unique index if not exists units_alt_name_uniq
  on public.units (alt_mecra_id, name)
  where alt_mecra_id is not null;

comment on index public.units_alt_name_uniq is
  'Pozisyon kodu kendi alanı içinde benzersiz. Farklı alanlarda aynı '
  'kod (Megalight P3-A ve Raket P3-A) BİLİNÇLİ olarak serbesttir.';
