# Sprint 18 — Halil'in sistemi: salt okunur karşılaştırma ve geçiş planı

30 Eylül 2026. Bu belge canlı sisteme **hiçbir şey yazmadan** yapılan incelemenin sonucudur ve
S19+ için geçiş sırasını önerir. Canlı veri içeriği (kurum adları, kayıtlar) bu belgeye
yazılmadı; yalnız yapı ve sayılar var. Demo ve yerel örnek veriler canlı veri gibi ele alınmadı.

## 1. Neyin nasıl incelendiği

| Kaynak | Yöntem | Güven |
|---|---|---|
| Halil reposu `halilsafak/medyapark` | ayrı, ayrılmış worktree (`origin/main`); çalışma dalı değişmedi | kesin |
| Canlıda sunulan kod | GitHub Pages'ten 7 dosya indirilip SHA karşılaştırması | kesin |
| `medyaparkadana.com` | yalnız GET | kesin (bugünkü durum) |
| Canlı Supabase `wubljodinspijiqzywav` şeması | publishable anahtarla PostgREST `select=<sütun>&limit=0` (veri satırı istenmez; eksik tablo/sütun hata kodu verir) | tablo/sütun varlığı **kesin**; tip, kısıt, RLS, fonksiyon gövdesi **incelenemedi** |
| Canlı satır sayıları | aynı anahtarla `count=exact` | yalnız **anon'a görünen** satırlar; RLS'li tablolarda 0 "boş" demek değildir |
| Canlı public tablolarda fazla sütun | public site verisi olan 8 tabloda tek satırın yalnız anahtar adları | kesin (8 tablo) |
| Canlı Storage | anon liste (public `media` bucket kök klasörleri) | kısmi |

**İncelenemeyenler ve gerekli erişim:** canlı RLS politikaları, fonksiyon/tetikleyici gövdeleri,
kısıtlar, iç tabloların satır sayıları ve içeriği (`customers`, `jobs`, `quotes`, `team`,
`activity_log`…), Auth kullanıcıları, Storage politikaları. Bunlar için şunlardan biri gerekir:
(a) canlı veritabanının salt okunur `pg_dump` çıktısı (doğrudan bağlantı parolasıyla), ya da
(b) Supabase panelinden alınmış günlük yedek dosyası. Supabase CLI hesabı projeye erişebiliyor;
ancak CLI'nin veritabanına bağlanan komutları canlıda **geçici giriş rolü oluşturuyor**
("Initialising login role…") — bu bir rol değişikliği olduğu için bu sprintte kullanılmadı.

## 2. Sürümler ve yayın ortamı

| | Durum (30.09.2026) |
|---|---|
| Halil `main` | `3d9e285` (9 Eylül 11:18) — tek dal, son push 9 Eylül |
| Bizim ayrıldığımız sürüm | `3d9e285` (`git merge-base` = aynı; `ozgur/local-dev` geride 0) |
| Canlıda kullanılan kod | GitHub Pages `https://halilsafak.github.io/medyapark/` → `3d9e285` (admin.html, index.html, panel.js, site.js, config.js, panel.css, site.css birebir aynı) |
| `medyaparkadana.com` / `www` | Hostinger'da **"Parked Domain"** sayfası; uygulama bu alan adında yayında **değil** |
| Canlı veritabanı | Supabase `wubljodinspijiqzywav` (config.js'te gerçek alan adları ve GitHub Pages için üretim hedefi) |
| Şema yönetimi | Halil reposunda migration klasörü yok; canlıda 24 migration (11–26 Ağustos) + elle eklenen `jobs.assignee_id` |

Sonuç: Halil'in **kodu** 9 Eylül'den beri değişmedi ve bizim tabanımızla aynı. Sonradan değişen
şey **canlı veri** (Halil'in operasyonel girişleri) ve **envanter yapısı** (aşağıda).

## 3. Canlı şema — bizimle karşılaştırma

Canlıda **var**, bizde de var (bizde ek sütunlarla): `mecralar`, `alt_mecralar`, `units`,
`products`, `bookings`, `customers`, `jobs`, `quotes`, `quote_items`, `team`, `suppliers`,
`notes`, `pages`, `settings`, `leads`, `aboneler`, `bildirimler`, `activity_log`,
`tuyap_ayarlar`, `tuyap_gruplar`, `tuyap_noktalar`.

Canlıda **yok** (bizim eklediklerimiz): `contacts`, `contact_affiliations`, `work_parties`,
`entries`, `entry_relevance`, `work_followers`, `work_operations`, `operation_price_groups`,
`media_placements`, `documents`, `document_links`, `contracts`, `contract_items`,
`personal_events`, `islem_anahtarlari`, görünümler `media_schedule`, `document_index`,
`booking_availability_public`.

Canlı tablolarda **eksik sütunlar** (bizim migration'larımızın ekledikleri):

| Tablo | Eksik sütunlar |
|---|---|
| `team` | `auth_user_id`, `app_role`, `active` |
| `customers` | `entity_kind`, `relationship_roles`, `active`, `source_type`, `source_ref`, `relationship_evidence` |
| `jobs` | `lifecycle_status`, `closed_reason`, `primary_contact_id`, `contract_*` (5), `accounting_*` (5), `is_urgent` |
| `quotes` | `work_id`, `revision_of_id`, `revision_no` |
| `bookings` | `work_id`, `source_quote_id`, `period_start`, `period_end`, `period_note`, `superseded_by_placement_id` |
| `units` | `active`, `inactive_note`, `yayin_format` |
| `mecralar` | `operational` |
| `alt_mecralar` | `occupancy_mode`, `creative_seconds`, `legacy_archived` |
| `products`, `pages`, `notes`, `suppliers` | `updated_at` |

Canlıda olup bizde olmayan sütun: public tablolarda **yok** (8 tabloda doğrulandı); iç tablolarda
**incelenemedi**.

**Canlı envanter (anon'a açık, 30.09):** 1 mecra — *M1 Adana AVM* (hub); 3 alan — Megalight
(24 pozisyon), Raketler (58), LED (1); toplam 83 pozisyon; 10 ürün. Bizim çalışma kopyamızdaki
3 Eylül dökümünde 9 mecra / 157 pozisyon vardı ve S9'da kesinleştirilen operasyonel envanter
4 lokasyon / 104 statik yüzdü (M1 82, Stadyum 8, Esas01 4, Çukurova 10). **Canlıda M1 dışındaki
mecralar yok.** Silinmiş mi, gizlenmiş mi (anon politikası `true` olduğu için görünmez olmaları
beklenmez), başka bir yapıya mı taşındı — Halil'e sorulmalı.

**Canlı güvenlik gözlemi:** anon `bookings` okuyabiliyor ve `customer_id` sütunu anon'a açık
(11 satır görünür). Kurum adları anon'a kapalı (`customers` 0), ama kimlikler açık. Bizim
şemada kapalı (S01 + D-230); geçişle kapanır. Canlıya yazılmadı.

**Storage:** `media` bucket public, kökte `tuyap/` ve `u/` klasörleri. Görsel adresleri DB'ye
mutlak URL olarak yazılı; geçişte yollar değişmemeli. `documents` bucket canlıda yok (bizim).

## 4. Özellik matrisi

Halil'in yönetim menüsü bizde **birebir** vardır (biz Hafıza ve Baskı & Montaj ekledik). Halil
kodunda olup bizde olmayan `api` eylemi yalnız üç tanedir: `booking_toggle`, `booking_list`,
`bookings_all` (aylık doluluk ızgarasının yazma/okuma yolları).

| Halil tarafı | Gerçek kullanım amacı | Bizdeki karşılık | Karar | Gerekli uyarlama | Bağımlılık / büyüklük |
|---|---|---|---|---|---|
| Doluluk / Kiralama — ay hücresine tıklayıp dolu/rezerve/boş (`booking_toggle`) | Hızlı doluluk girişi | Mecralar aylık tablo + kesin dönemli yerleşim formu (müsait dilime tıklayınca yüz ve tarihler hazır); eski aylık kayıt "ay bazlı" görünür | **Değerlendirme gerekli** | Halil'in günlük hızı korunuyor mu: gerekirse "ayın tamamı için opsiyon/yayın" tek tıklık kısayol (aynı `media_placements_create` yolundan) | Halil ile 30 dk deneme; kısayol gerekirse ~1 gün |
| Doluluk Excel içe aktarımı | Eski tablolardan ay bazlı kayıt | `bookImport` (yönetici, "Eski ay kaydı al") | Mevcut karşılık | — | — |
| Teklifler — builder, PDF, onay (`approve_quote`) | Satış | Aynı builder; onay artık iş + yerleşim üretir (S04/S8) | Mevcut karşılık | Canlıdaki bekleyen tekliflerin onay davranışı provada denenmeli | prova |
| İş Akışı (kanban, `assignee_id`) | Operasyon takibi | İşler (Work: aşama + yaşam döngüsü, güncellemeler, taraflar) | Mevcut karşılık | Canlı `jobs.status` değerlerinin aşamaya eşlenmesi (06 §7.1 ön denetim) | prova |
| Müşteriler | Kurum kaydı | Hafıza › Kurumlar (+ Admin Müşteriler korunur) | Mevcut karşılık | — | — |
| Tedarikçiler, Ürünler, Mecralar (CMS: alan, pozisyon, foto, galeri, yerleşim planı), Harita, Anasayfa, Sayfalar, İkonlar, Bülten, Planlama Talepleri, Notlar, Ayarlar, İşlem günlüğü | Site ve envanter yönetimi | Aynı ekranlar (S14 koşullu kayıt ile) | Mevcut karşılık | — | — |
| Ekip | Kullanıcı yönetimi | Ekip + `app_role`, `active`, `auth_user_id` | Taşınacak (veri) | Gerçek kullanıcı ↔ `team` eşlemesi (bkz. §5.4) | Özgür/Halil onayı |
| Raporlar (eski) | — | Dört işlev odaklı rapor (S16) | Mevcut karşılık | — | — |
| Dashboard | Özet | Admin Dashboard korunur; Team: Panelim | Mevcut karşılık | — | — |
| Public site (`index.html`, `site.js`) | Mecra sayfaları, harita, müsaitlik, planlama talebi, bülten | Aynı; iki fark: müsaitlik `booking_availability_public`ten, planlama talebi `submit_quote_request` RPC'sinden | **Taşınacak** | DB değişikliği ÖNCE, frontend SONRA — eski frontend geçişten sonra müsaitliği okuyamaz (anon `bookings` kapanır) | yayın sırası |
| Tüyap çalışma alanı (`/tuyap/`) | Fuar noktaları | Aynı dosya; tablolarda yazma **yönetici** ister (canlıda herhangi bir oturum) | Taşınacak | Tüyap'ı düzenleyen kişilerin `app_role=admin` eşlemesi | küçük |

## 5. Veri geçişi

### 5.1 Temel yaklaşım: yerinde evrim, birleştirme değil

Canlı veritabanı gerçeğin kaynağıdır. Bizim şema, Halil'in şemasının **üzerine eklemeli**
migration'lardan oluşur; bu yüzden geçiş, canlı kayıtların başka bir veritabanına kopyalanıp
eşleştirilmesi değil, **canlı veritabanına ileri yönlü migration paketinin uygulanmasıdır**.
Kimlikler (ID) değişmez; çakışma yoktur; ilişkiler yerinde kalır.

- Yerel/demo veritabanlarındaki kayıtlar (örnek işler, güncellemeler, belgeler, sentetik
  envanter) **varsayılan olarak taşınmaz**. Yerel çalışma DB'sindeki 55 işin (30.09 sayımı)
  33'ü örnek bandında (`sort ≥ 9000`), 20'si S9 kullanım tohumunun gerçek kurum adlarıyla
  ürettiği örnek kampanyalar (`sort 0`, 24.09), 1'i canlı dökümünden gelen ve canlıda zaten
  bulunan kayıt, **1'i 26.09'da elle girilmiş kökeni belirsiz bir kayıt** — bunun gerçek bir iş
  olup olmadığı kullanıcıya sorulmalı; otomatik taşınmaz. Demo Supabase verisi de sentetiktir.
- `20260903130227_remote_baseline.sql` (yerel konsolide döküm) canlıya **uygulanmaz** (06 §1.5).
- `20260903160000_local_storage_media_bucket.sql` yalnız yerel içindir; canlıda `media` zaten var.
- `20260907120000_jobs_assignee_id_compat.sql` canlıda karşılığı olan sütunu ekler; provada
  "zaten var" davranışı doğrulanmalı.
- İleri paket: `20260907140000_s01…` → `20261004100000_ps18…` (31 dosya).

### 5.2 Kaynak → hedef eşlemesi

| Kaynak (canlı) | Hedef | Yöntem | Belirsizlik / insan kararı |
|---|---|---|---|
| `customers` | aynı tablo + köken sütunları | S02 migration backfill (`relationship_evidence`); **kişi backfill'i yok** (S02_001 kararı) | Aynı kurumun mükerrer kayıtları otomatik birleştirilmez (BR-ID04/05) |
| `customers.ilgili_kisi` | `relationship_evidence` | S02 | Kişi değildir; kişi kaydı üretilmez |
| `jobs` | aynı tablo (Work) | S03: `status` → aşama, `lifecycle_status` | **Canlı `status` dağılımı bilinmiyor** — `tasarim`/`arsiv` eşlemesi insan onayı ister (06 §7.1) |
| `jobs.customer_id` | `work_parties` (`account`) | S03 backfill | — |
| `quotes` | aynı tablo + `work_id` | S04; `customer_id` FK'sı öncesi **orphan ön denetimi** | Orphan teklifler için karar |
| `bookings` (Halil'in aylık girişleri, 9 Eylül sonrası dahil) | aynı tablo, "ay bazlı eski kayıt"; Mecralar'da görünür | PS8: kesin dönemli yerleşimler ayrı tablo; eski kayıt silinmez, istenirse `superseded_by_placement_id` ile devralınır | Hangi aylık kaydın kesin döneme çevrileceği ekip kararıdır (tarih uydurulmaz) |
| `mecralar`/`alt_mecralar`/`units` | aynı tablolar + `operational`, `occupancy_mode`, `legacy_archived`, `active` | PS8/PS9 migration'ları | **Canlıda yalnız M1 var** — S9 envanter düzeltmeleri (Stadyum, Esas01, Çukurova kimliklerine dayanan veri adımları) canlıda eşleşmeyebilir. `units_alt_name_uniq` benzersizlik kısıtı canlıdaki toplu pozisyon üreticisiyle oluşmuş mükerrer kodlarda **düşebilir** → ön denetim |
| M1 LED (canlıda 1 pozisyon) | `alt_mecralar` eşzamanlı alan + fiziksel ekranlar | PS9 | Canlıdaki tek pozisyon eski `P3-A` yer tutucusu mu, gerçek ekran mı — Halil |
| `team` + Auth kullanıcıları | `team.auth_user_id`, `app_role`, `active` | S01; eşleme e-posta ile **önerilir, kişi onaylar** | Canlı Auth kullanıcı listesi incelenemedi |
| `tuyap_*` | aynı | — | yazma yetkisi yöneticiye kısıtlanır |
| `activity_log` | aynı (teknik günlük) | — | — |
| Görsel URL'leri (`image`, `galeri`, `kapak`…) | aynı | değişmez | — |

### 5.3 Tohum (seed) dosyaları canlıda çalıştırılmaz

`supabase/seeds/` altındaki commit'li dosyaların iki türü var:
- **Yerel tekrar (replay):** `40_s02_…`, `50_s03_…`, `97_upstream_…`, `98_ps3_…`, `98_ps8_…`,
  `98_zz_ps81_…`, `98_zzz_ps9_media_inventory` — boş veritabanına `db reset` sonrası migration
  backfill'lerini yeniden oynatır. Canlıda backfill'ler migration'ın kendisi içinde gerçek
  veriye karşı çalışır; bu dosyalar **ayrıca çalıştırılmaz**, ama migration'da bulunmayan bir
  veri düzeltmesi içerip içermedikleri provada tek tek karşılaştırılmalı.
- **Sentetik / demo:** `10_local_dev_auth`, `30_local_identity_mapping`,
  `98_zzzz_ps9_synthetic_inventory`, `99_*` — canlıya **asla**.

### 5.4 Kimlik ve yetki

- Canlıda self-signup kapatılmalı (D-230) — panel ayarı, geçiş penceresinde.
- Çekirdek ekip listesi (02 §2) için Auth kullanıcısı var mı, e-postası ne — Özgür/Halil
  doğrulayacak; `team.auth_user_id` eşlemesi e-posta benzerliğiyle **önerilir**, onaysız yazılmaz.
- `app_role`: yönetici = Halil, Özgür (+ Tüyap düzenleyicileri); diğerleri `team_member`.
- `dev@medyapark.local` ve `s13-*` test kullanıcıları yalnız yerel/test/demo.

### 5.5 Public site ve yayın bağımlılıkları

1. Canlı DB'ye ileri paket uygulanınca anon `bookings` okuması kapanır → **Halil'in şu anki
   frontend'i müsaitliği gösteremez**. DB ve frontend aynı bakım penceresinde değişmeli.
2. Planlama talebi `submit_quote_request` RPC'sine geçer; eski frontend'in doğrudan `quotes`
   INSERT'i reddedilir.
3. Yayın hedefi kararı: bugün canlı kod GitHub Pages'te (`halilsafak/medyapark`). Bizim kodun
   yayını için Halil'in reposuna yazma yetkisi ya da yeni bir yayın adresi gerekir;
   `medyaparkadana.com` Hostinger'da park durumunda (DNS/hosting kararı). `config.js` üretim
   yönlendirmesi hazır (gerçek alan adı → canlı Supabase; belirsiz host → kapalı).

## 6. Önerilen sıra ve gerçekçi büyüklük

İş tek sprinte sığmaz; iki engel sprint dışı karara bağlıdır: canlı veritabanına salt okunur
erişim (yedek ya da `pg_dump`) ve envanter/yayın kararları.

**S19 — hazırlık ve prova (geçiş YOK)**
1. Erişim: canlı yedek dosyası ya da salt okunur `pg_dump` + Auth kullanıcı listesi (Özgür/Halil).
2. Halil ile 30 dk: (a) M1 dışındaki mecralar ne oldu, (b) M1 LED pozisyonu, (c) aylık tıklamalı
   giriş hızının karşılığı, (d) Tüyap'ı kim düzenliyor.
3. Atılabilir yığına canlı yedeğin geri yüklenmesi; ön denetimler (06 §24): `jobs.status`
   dağılımı, orphan teklifler, mükerrer pozisyon kodları, `bookings` kapsamı, Auth ↔ ekip eşlemesi.
4. İleri paketin (31 migration) bu kopyaya uygulanması; hataların **ayrı, eklemeli düzeltme
   migration'larıyla** giderilmesi (önceden uygulanmış migration düzenlenmez); satır sayısı ve
   ilişki karşılaştırması; regresyon paketinin bu kopyaya karşı koşturulması.
5. Gerekirse Halil'in hızlı doluluk girişinin karşılığı (bkz. §4).

**S20 — canlı geçiş (açık onayla)**
1. Bakım penceresi ve veri girişi dondurma (Halil'e bildirim; açık panel oturumları kapatılır).
2. Canlı yedek (+ mümkünse PITR işareti), son ön denetim.
3. İleri paket + onaylı kimlik eşlemesi; self-signup kapatma.
4. Frontend yayını (karar verilen hedefe), smoke (11 §D), çekirdek ekip girişi.
5. Geri dönüş: yeni sistemde oluşturulan kayıtların dışa aktarımı → yedeğe dönüş → eski frontend
   (`3d9e285`) yeniden yayın. Geri dönüşte pencere sonrası girişler kaybolacağı için ilk 72 saat
   (11 §F) boyunca günlük dışa aktarım.

**S21 — pilot stabilizasyonu** (09 Sprint 09).

Tahmin: S19 prova işi 3–5 gün, erişim ve Halil kararlarına bağlı; S20 geçiş penceresi yarım gün +
bir gün izleme. S19'da canlıya yazma ya da geçiş **önerilmez**.
