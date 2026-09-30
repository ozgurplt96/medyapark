# Sprint 18 — Son teknik denetim: bulgular, düzeltmeler, kalanlar

30 Eylül 2026 · dal `ozgur/s18-denetim-karsilastirma` · migration `20261004100000_ps18_guncelleme_tekillik.sql` (toplam 34)

Önceki tek bulgu listesi `docs/S13_INCELEME_VE_TESTLER.md` (B01–B43) olarak kalır; S18
bulguları çakışmasın diye **S18-nn** numarasıyla bu dosyadadır. Halil sistemi karşılaştırması ve
geçiş planı: `docs/S18_HALIL_KARSILASTIRMA_VE_GECIS_PLANI.md`.

Gerçek müşteri verisi, ekran görüntüleri ve örnek dosyalar bu depoda yoktur; Git dışı inceleme
klasöründedir.

---

## 1. Yöntem

- **Başlangıç kanıtı:** S17 regresyon paketi (113 e2e, erişim 10, mecra 8) ve S13/S14 bulgu listesi.
- **Katalog incelemesi** (atılabilir test DB'si): RLS kapalı tablo, `security_invoker` olmayan
  görünüm, SECURITY DEFINER fonksiyonlarının `search_path`'i ve EXECUTE izinleri, anon/public
  politikaları, Storage bucket ve politikaları.
- **Rol matrisi** (atılabilir DB, her yazma geri alınan işlemde): 39 tablo/görünüm × anon, aktif
  üye, yönetici, pasif üye, ekip kaydı olmayan oturum; gerçek JWT iddialarıyla görünen / güncellenen
  / silinen satır sayısı.
- **Kod incelemesi:** `api()` yazma/silme yolları, oturum koruması, oluşturma akışlarının tekrar
  güvenliği, tam liste okumaları, olay dinleyicileri, ölü CSS/JS.
- **Arayüz + API birlikte** (Playwright, atılabilir yığın): kayıp yanıt, rolü düşürülmüş eski
  sekme, doğrudan API, indirilen PDF/XLSX'in kendi baytları.
- Çalışma DB'sine yalnız migration **provası** (ROLLBACK'li işlem) ve normal yükseltme uygulandı.

## 2. Bulgular ve düzeltmeler

Önem: **P0** yaygın veri kaybı/güvenlik · **P1** veri kaybı, yetkisiz erişim, temel akış bozuk ·
**P2** yanıltıcı ya da kullanıcının güvendiği sonucu bozan davranış · **P3** hijyen/küçük.

| No | Önem | Bulgu ve yeniden üretme | Etki | Kök neden | Düzeltme | Doğrulama |
|---|---|---|---|---|---|---|
| S18-01 | P2 | Rolü yönetici → ekip üyesine düşürülen kullanıcının açık sekmesinde "İş tarafını kaldır" (ya da kurum/kişi/teklif/not/ürün/mecra/ekip silme): sunucu RLS ile reddeder (0 satır), arayüz "Kaldırıldı" der; kayıt yerinde durur | Kullanıcı sildiğini sanar; veri kaybı yok ama yanlış iş kararı | Genel `DELMAP` yolu ve `customer_delete` / `supplier_delete` / `page_delete` silinen satırı istemiyordu (S10 yalnız iş/işlem/güncelleme/sözleşme silmeyi korumuştu) | `.select()` ile silinen satır istenir; 0 satır açık hata ("artık yok ya da silme yetkiniz yok") | e2e 15 (eski kodda düşüyor) |
| S18-02 | P2 | Aynı senaryoda açık sekme yönetici menüsünü ve düğmelerini göstermeye devam ediyordu (yalnız pasifleştirme algılanıyordu) | Yanıltıcı yüzey; S18-01'in tetikleyicisi | Odakta çalışan `kimlikDogrula` yalnız `active`e bakıyordu | `app_role` değiştiyse "Yetkiniz değişti" penceresi, sayfa yenilenir | e2e 15 (eski kodda düşüyor) |
| S18-03 | P2 | İş, ürün, mecra, alt mecra, pozisyon, teklif, ekip, sayfa, not silmede sunucu hatası (ör. bağlı kayıt yüzünden FK 23503) hiçbir ileti göstermiyordu | Kullanıcı sonucu bilmiyor | Dokuz çağrı `guard()` dışında `await api()` yapıyordu; yakalanmayan hata | Ortak `guard()` ile sarıldı: hata Türkçe iletiyle görünür | kod incelemesi + e2e 15 |
| S18-04 | P3 → kapatıldı | S13/S14 açık listesi: yeni güncellemede yanıt kaybolup Paylaş'a tekrar basılınca **ikinci güncelleme**. Ayrıca dosyasız yol iki istekti (önce `entries`, sonra `entry_relevance`): ikinci adım düşerse etiketsiz yarım kayıt. Dosyalı yolda yanıt kaybında istemci yüklenen dosyaları silmeye çalışıp "oluşturulamadı" diyordu (kayıt aslında oluşmuş olabilir) | Mükerrer not; yarım kayıt; yanlış "başarısız" iletisi | Güncelleme PS14 tekillik deseninin dışındaydı | Migration: `entry_create_with_documents` PS14 sarmalayıcısı (`p_islem`, `_entry_create_yap`); istemci yeni güncellemenin tamamını tek işlemden ve `islemCalistir` yolundan geçirir; belirsiz sonuçta dosyaya dokunulmaz, yalnız sunucunun kesin reddettiği girişim temizlenir | e2e 15: dosyasız + dosyalı kayıp yanıt → tek güncelleme / tek etiket / tek belge ve dosya; farklı içerikle tekrar → açık uyarı (eski kodda düşüyor); access-checks 8 (5/5 yol) |
| S18-05 | P3 | `booking_availability_public` (sahip yetkisiyle çalışan tek görünüm) anon ve authenticated'a INSERT/UPDATE/DELETE/TRUNCATE yetkisi taşıyordu | Çalışma anında reddediliyordu (GROUP BY/UNION, güncellenemez görünüm); hijyen | Supabase varsayılan yetkileri | Yalnız SELECT bırakıldı | access-checks 11 |
| S18-06 | P3 | `demote_sibling_affiliations` / `sync_primary_affiliation` (SECURITY DEFINER tetikleyici fonksiyonları) anon'a EXECUTE açıktı | RPC ile çalıştırılamaz; hijyen | Varsayılan PUBLIC EXECUTE | EXECUTE geri alındı (tetikleyiciler etkilenmez) | access-checks 11; e2e Hafıza akışları |
| S18-07 | P3 | Tam liste okumaları 1000 satırda sessizce kesilecekti: İşler (`jobs_list`), Mecralar iş adları (`media_jobs`), kişi listesi (`contacts_list`), Baskı & Montaj "Tümü" (`operations_list`, açık 1000 tavanı) | Büyüyen veride eksik liste, "İş #id" gibi adsız satır | S5.1 sayfalama kalıbı bu yollara uygulanmamıştı | `rapHepsi` sayfalı okuma; işlemlerde her sayfa taze sorgu | e2e 15: 1005 işlem tam okunur |
| S18-08 | P3 | Kullanılmayan CSS (`.mtl-*`, düz `md-ms`, `md-ms-l`, `md-rgun*`, S17'de kalkan site kartları `md-sk*`, `md-bar`, `md-kmp`, `md-tlr`, `md-soru*`, eski durum işaretleri) ve JS (`MD_KOD_ETIKET`, `mdOrgEtiket`, `mdRefGun`, `mdSec`, `rpH3`, `rpVarsayilanDisi`, `rpSetKontrolsuz`) | Bakım yükü, yanlış ipucu | S16/S17 sonrası kalıntı | 122 CSS kuralı + 1 animasyon + 7 JS tanımı kaldırıldı (referanssızlık JS/HTML'de tek tek doğrulandı; kullanılanlar `mtl-gk`, `mtl-cb`, `md-ms-f/-hata/-ozet/-uyari` kaldı) | CSS parantez dengesi; 28 ekran taraması; tam regresyon |
| S18-09 | istenen | Doluluk Excel'lerinde (Mecralar genel/mecra/ürün, Raporlar iç/dış, LED) 3. satır renk anahtarı ve 4. satır boşluk sabit alanda kalıyordu (C6/D6); takip şablonunda 3–4. satırlar boştu | Kaydırırken gereksiz sabit alan | Başlık bloğu 5 satır varsayımı | Yeni düzen: 1 başlık · 2 kısa dönem/kapsam · 3 sütunlar · 4+ veri. Renk anahtarı ve açıklamalar verinin altında tek alt not (`rpXlsAltNot`). Sabitleme C4/D4/A4, baskı başlığı 3:3. Mecralar süzgeçleri 2. satırdaki kapsam bilgisinde | e2e 15 (tüm doluluk/LED/takip sayfaları, ExcelJS); dosyalar Excel'de açılıp PDF'e basıldı |
| S18-10 | istenen | Pano sütunu 118 px sabit; sol menü 252 px | Ay sütunlarına daha az yer | Sabit genişlik | Pano sütunu içerik kadar (`mdPanoGen`, CSS `--pg`; mevcut kodlarla 90 px, mobil 72), yapışkan Yüz sütunu aynı değerden; rapor önizlemesinde No/Yüz içerik kadar. Menü 216 px (ölçüm: en uzun öğe "Planlama Talepleri" 208 px'te sığıyor; yazı küçültülmedi) | ölçüm betiği (Yönetim + Team, tüm gruplar açık); ekran görüntüleri 1440/390 |
| S18-11 | P3 | S17'nin dar kısmi ay sütununda ("Haziran · yalnız 30") çip kırpılıyordu | Kısmi ay bilgisi okunmuyor | Dar sütunda satır içi çip | Dar kısmi ayda çip alt satırda | ekran görüntüsü |

## 3. Denetlenen ve açık bulunmayan alanlar

| Alan | Ne yapıldı | Sonuç |
|---|---|---|
| A · Erişim | Rol matrisi (5 rol × 39 nesne), SECURITY DEFINER `search_path` (hepsi sabit), anon EXECUTE, Storage politikaları, public görünüm sütunları (`unit_id, ym, status`) | pasif ve ekip dışı oturum her iç tabloda 0 satır; üye iş/kurum/operasyon/yerleşim düzenler, silemez; kişisel etkinlik yalnız sahibine (yönetici dahil başkası 0); `documents` bucket özel, `media` herkese okunur (site görselleri) |
| A · Oturum | S13 B08 (çıkış/pasif) + S18-02 (rol) | e2e 05, 15 |
| B · Tekrar güvenliği | İş, yerleşim, işlem, belge (S14) + güncelleme (S18-04) | e2e 06, 15 |
| B · Eşzamanlı düzenleme | S14 koşullu kayıt (yönetim formları, ekip, kurum/kişi) | e2e 09; bu turda yeni yol eklenmedi |
| C · Belgeler | Yükleme yolu tekilliği, kilitli silme, önce kayıt sonra dosya, belirsiz sonuçta dosyaya dokunmama, imzalı URL (10 dk), MIME/uzantı ve 25 MB sınırı (istemci + bucket) | S14/B42 kapsamı yerinde; S18-04 aynı kuralı güncellemenin dosyalı yoluna getirdi |
| D · Mecra/operasyon | Dönem sınırları, bitişsiz kayıt, kesintisiz yenileme, süresi dolmuş opsiyon, sayaç = tablo = Excel, LED, paket/kalem | e2e 02, 04, 10, 13, 14 |
| E · Raporlar | Dört raporun PDF'i **indirilen dosyanın metninden** (PyMuPDF): doluluk iç/dış (dışta kurum adı yok — PDF ve XLSX'in tüm parçaları), takip (kalem + maliyet), iş dökümü, kişisel plan | e2e 15 |
| E · Gezinme | 8 Team + 20 Yönetim ekranı ve art arda beş ekran değişimi: konsol hatası ve 4xx/5xx yok | e2e 15 |
| F · Dinleyiciler | Her `addEventListener` için eşli kaldırma ya da tek kurulum koruması | birikim yok |

## 4. Kalan bilinen açıklar ve notlar

| Önem | Konu | Not |
|---|---|---|
| P2 (canlı) | **Canlı Supabase'te anon `bookings` okuyabiliyor, `customer_id` dahil** (salt okunur yoklama, 30.09) | Bizim şemada kapalı (D-230, S01); geçişte kapanır. Bu sprintte canlıya yazılmadı |
| P3 | Anon `units.inactive_note`, taslak mecralar (`hidden`), ürün fiyatlarını okuyabiliyor | Halil'in public site tasarımı; değiştirmek public siteyi etkiler. S19 kapsamında karar |
| P3 | Erişim kapansa da önceden alınmış imzalı belge bağlantısı en çok 10 dk çalışır | İmzalı URL'nin doğası |
| P3 | `_belge_nesnesi_silinebilir` iç kullanıcı tarafından doğrudan çağrılabilir; bir depolama yolunun belgeye bağlı olup olmadığını söyler | Yollar rastgele UUID; Storage politikası bu fonksiyona muhtaç |
| P3 | `dashboard_stats` (özet sayılar) ve `quotes_list` sayfalamasız; `entries_list` bilinçli 200 | 1000 satırın altında doğru; sayfalama bir sonraki bakım işi |
| P3 | `panel.js`'te Halil dönemi kalıntıları (`chartBars`, `chartDonut`, `flowList`, `opGo`, `MONTHS`, `NAV`…) | S19'da Halil kodu karşılaştırmasıyla birlikte ele alınacak |
| — | Ekran okuyucuyla gerçek deneme | Bu ortamda yapılamadı |

## 5. Son test koşusu

| | |
|---|---|
| Test edilen commit | `e779d7d` — `ozgur/s18-denetim-karsilastirma` (sonraki commit yalnız `docs/`) |
| Yöntem | `scripts/test-regression.ps1 -Fresh`: atılabilir yığın silinip yalnız Git'e girebilen dosyalardan kuruldu (34 migration + commit'li tohumlar + test kullanıcıları) |
| SQL | access-checks **11/11** (yeni 11: public görünüm salt okunur, tetikleyici RPC değil, `search_path` sabit), media-checks **8/8** |
| Uçtan uca | **124 / 124** (113 önceki + 11 yeni `15_s18_denetim`) — 6,9 dk |
| Eski kodda düşme kanıtı | İstemci düzeltmesi geri alınınca güncelleme tekrarı (dosyasız/dosyalı), rol düşürme ve üye silme testleri düştü (4/4); SQL denetimi 8 migration öncesi düştü (4/5) |
| Yükseltme yolu | Çalışma DB'sinde ROLLBACK'li işlemde migration iki kez uygulandı: 36 tabloda satır sayısı birebir, 11/11; ardından `migration up --local` (reset yok): satır sayıları birebir, 11/11, 8/8 |
| PDF | indirilen dosyanın metni PyMuPDF ile (yoksa test açıkça atlanır, geçmiş sayılmaz) |
