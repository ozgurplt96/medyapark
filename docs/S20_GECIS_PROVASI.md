# Geçiş provası — araçlar ve yöntem

1 Ekim 2026. Canlıya geçişten önce, **canlı şemanın kopyasına** ileri migration paketini uygulayıp
sonucu denetlemek için kullanılan araçlar. Bu belge yalnız yöntemi anlatır; canlı veriye ilişkin
sayılar, eşleştirme listeleri ve kararlar Git dışındaki geçiş notundadır.

## Üç ayrı yığın

| Yığın | Betik | API / uygulama | İçerik |
|---|---|---|---|
| Çalışma | `scripts/dev-start.ps1` | 54321 / 5500 | geliştirme verisi — **resetlenmez** |
| Test | `scripts/test-env.ps1` | 56321 / 5520 | temiz kurulum + sentetik veri (regresyon) |
| **Prova** | `scripts/prova-env.ps1` | 58321 / 5530 | **boş** başlar; canlı şeması + verisi ayrıca yüklenir |

Prova yığını geliştirme migration'larını ve seed'leri **çalıştırmaz**. Böylece yapılan iş "sıfırdan
kurulum testi" değil, "canlı şemasının yükseltilmesi" olur. DB `medyapark-prova-ortami` yorumuyla
işaretlenir; yazan her betik bu işareti doğrular.

## Akış

1. `.\scripts\prova-env.ps1 start` — boş yığın.
2. Canlı şema dökümü + veri dökümü yüklenir (Git dışı dosyalar).
3. Geçiş öncesi yedek (`pg_dump`) ve satır düzeyi karşılaştırma için kopya şema alınır.
4. İleri paket **dosya dosya, tek sefer** uygulanır: her dosya tek transaction, sürümü aynı
   transaction'da `supabase_migrations.schema_migrations` defterine yazılır; defterdeki dosya atlanır.
   Uygulanmayanlar: `20260903130227_remote_baseline`, `20260903160000_local_storage_media_bucket`.
5. Denetimler: yapısal fark (temiz kurulumla katalog karşılaştırması), önce/sonra veri farkı,
   `scripts/access-checks.sql`, `scripts/media-checks.sql`.
6. Kabul: `cd tests; node prova/kabul.mjs <çıktı>` — canlı kopyasındaki kayıtlarla arayüzden.
7. Regresyon: `cd tests; $env:MP_HEDEF='prova'; npx playwright test` — aynı paket, prova yığınına karşı.
8. Geri dönüş: geçiş öncesi yedek geri yüklenir, kopya şemayla satır farkı 0 olmalı.

## Neden defter şart

Migration dosyaları tek tek tekrar çalıştırılabilir yazılmadı. Paket ikinci kez çalıştırılırsa veri
çoğalmaz, ama **eski dosyalar sonradan sıkılaştırılmış politikaları geri getirir** (sonraki dosyalar
"zaten var" hatasıyla geri alındığı için düzeltme uygulanmaz). Defterli çalıştırıcıyla ikinci çalıştırma
hiçbir dosyayı uygulamaz; şema ve veri farkı 0.

## Provanın koda yansıyan sonuçları

- `20261006100000_ps20_canli_eski_politikalar.sql` — canlıda Git dışında kurulmuş `aboneler` ve
  `bildirimler` tablolarındaki "oturum açan herkes" politikaları düşürülür; koşulsuz başka politika
  kalırsa migration durur. Yerel/test/demo veritabanlarında etkisizdir.
- `scripts/access-checks.sql` DENETİM 2 — form tablolarında (aboneler, leads) koşulsuz politika
  yalnız INSERT olabilir.
- Pencere yarışı — arka plan sonuç sorgusu, açık "sonuç doğrulanamadı" penceresinin yerine geçip
  formu "Kaydediliyor…" durumunda bırakabiliyordu. Açık formun sorduğu girişime arka plan sorgusu
  dokunmaz; bir pencere diğerinin yerine geçerse bekleyen kod güvenli seçenekle sonuçlanır.
- Üç test örnek veriye bağlı varsayımdan arındırıldı (lokasyon sayısı, kimlik sırası = sayfa sırası,
  "bugün" durumu).

## Bilinen ortam kısıtı

Canlı ayarlardaki Google Maps anahtarı `localhost`'u reddeder; prova yığınında harita OSM'e düşer ve
Harita testi bu geçiş sırasında düşer. Yayın adresinde anahtarın izinli adres listesi belirleyicidir.
