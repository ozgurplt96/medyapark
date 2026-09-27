# Sprint 13 — Uygulama geneli inceleme, düzeltmeler ve regresyon paketi

Tarih: 27 Eylül 2026 · Dal: `ozgur/s13-audit-ux` → `ozgur/local-dev`
Migration: `20260930100000_ps13_erisim_ve_butunluk.sql` (toplam 29)

Bu not; neyin nasıl denendiğini, bulunan hataları ve durumlarını, testlerin
nasıl çalıştırıldığını ve sonraki sprinte bırakılanları özetler. Gerçek
müşteri verisi, ekran görüntüleri ve gerçek verili rapor çıktıları bu
depoda **yoktur**; yerel inceleme klasöründe tutulur.

---

## 1. Ne denendi — akış durumu

Denemeler iki yolla yapıldı: gerçek arayüz (Playwright, gerçek tıklama ve
klavye) ve aynı anda veritabanı/API doğrulaması (satır sayıları, rol
jetonlarıyla doğrudan istekler). Yazan denemelerin tamamı **atılabilir test
yığınında** (`mptest`) yapıldı; çalışma DB'sine yalnız incelemesi yapılmış
migration uygulandı.

| Akış | Kapsam | Durum |
|---|---|---|
| A · Kurum/kişi → iş → güncelleme | iş oluşturma (hesap tarafı, ilgili, tek Hareket), çift tık, ağ hatası, sunucu hatası, kayıp yanıt; kurum ve kişi düzenleme | hata bulundu → düzeltildi, testli |
| B · Mecra opsiyon → yayın | statik çakışma (eşzamanlı), toplu kayıtta ya hep ya hiç, bitişi bilinmeyen kayıt, geçersiz/ters tarih, 29 Şubat, LED eşzamanlılığı, arayüz çakışma raporu | geçti; hata iletisi düzeltildi |
| C · İş → baskı/montaj → rapor | paket bedeli düzenleme, rapor toplamı, kısmi paket, bayat önizleme | S12 açığı kapatıldı, testli |
| D · Belgeler | ilişkisiz belge, başarısız yükleme + tekrar, bağlantı kaldırınca dosyanın korunması, kalıcı silme onayı | geçti; odak hatası düzeltildi |
| E · Dört rapor | baskı/montaj (iç/dış), iş özeti (iç/dış), kişisel plan (başkasının randevusu), mecra raporu yalnız arayüz gezintisiyle | baskı/iş/plan testli; mecra raporu yalnız elle gezildi |
| F · Oturum ve gezinme | başka sekmede çıkış, hesabın pasife alınması, hızlı ekran değişimi, tarayıcı Geri/İleri, sayfa yenileme | hata bulundu → düzeltildi, testli (yenileme → S14) |
| Erişim (OWASP WSTG temelli) | anonim, aktif üye, yönetici, pasif üye, ekip kaydı olmayan oturum; tablo/RPC/depo/görünüm yoklaması; XSS; tehlikeli URL; Excel formülü; tarayıcıdaki anahtarlar | hata bulundu → düzeltildi, testli |
| Görünüm | 1440 / 768 / 390 px, %200 yakınlaştırma (720 px) ve 320 px yeniden akış; 15 ekran/pencere | düzeltildi, otomatik ölçüm |

**Otomatik ölçümün sınırı:** kontrast, etiketsiz denetim ve yatay taşma
ölçümü script ile 15 ekranda yapıldı (sonuç: beş genişlikte 0). Bu bir
WCAG 2.2 AA uygunluk denetimi **değildir**; ekran okuyucuyla deneme
yapılmadı.

---

## 2. Bulgular ve düzeltmeler

Önem: **P0** veri kaybı/güvenlik açığı yaygın · **P1** veri kaybı, yetkisiz
erişim ya da temel akış bozuk · **P2** yanıltıcı ya da erişilebilirliği
engelleyen davranış · **P3** hijyen/küçük görsel.

| No | Önem | Bulgu | Düzeltme | Kanıt |
|---|---|---|---|---|
| B01 | P1 | `media_schedule` görünümü sahibinin yetkisiyle çalışıyordu: pasif üye ve ekip dışı oturum müşteri/iş adlarını okuyabiliyordu | `security_invoker`, yazma yetkileri geri alındı | access-checks 3, e2e erişim |
| B02 | P1 | `media` deposuna oturum açmış herkes (pasif üye dahil) yükleyip silebiliyordu | yazma yalnız aktif iç kullanıcı | access-checks 4, e2e erişim |
| B03 | P3 | `approve_quote` anonim çağrılabiliyordu (RLS nedeniyle etkisizdi) | yalnız `authenticated` | access-checks 5 |
| B04 | P1 | Kurum sayfasından eklenen kişi bağlantısız kalıyor, kurumda görünmüyordu | kişi bir kuruma bağlı oluşunca birincil bağlantı DB'de üretilir; yetimler onarıldı | access-checks 6 |
| B05 | P2 | Yıkıcı onayda odak "sil" düğmesindeydi; kapanınca odak kayboluyordu | odak güvenli düğmede, kapanınca tetikleyiciye döner | e2e belge |
| B06 | P2 | İş kaydedince kullanıcı listeye atılıyordu; yeni iş açılmıyordu | bağlamda kalır; yeni iş detayı açılır | e2e iş |
| B07 | P1 | Kurum kaydı hata yakalamıyor, çift gönderimi engellemiyordu | hata iletisi, meşgul durumu | e2e kurum |
| B08 | P1 | Başka sekmede çıkış / hesap pasifleşince açık sekme boş liste gösteriyordu (veri silinmiş gibi) | oturum koruması: yeniden giriş penceresi, açık form korunur; pasifte erişim kapanır | e2e oturum |
| B09 | P2 | Ham veritabanı iletileri gösteriliyordu; mecra formu eşlemeyi atlıyordu | tek `hataMetni()` eşlemesi | e2e mecra |
| B10 | P2 | Ağ hatasında "kaydedilmedi" deniyordu; yanıt kaybolduysa kayıt aslında oluşmuş olabilir | ileti belirsizliği açıkça söyler | e2e iş |
| B11 | P1 | S12: paket bedeli düzenlenemiyordu | işlemden erişilen düzenleme: Kaydet/Vazgeç, çakışma denetimi, çift gönderim engeli, güvenilir Hareket | e2e paket |
| B12 | P2 | Önizleme açıkken kayıt değişirse indirilen dosya eski veriyle üretiliyordu | indirme öncesi tazelik denetimi; değiştiyse önizleme yenilenir, indirme durur | e2e rapor |
| B13 | P2 | Yazıp geri silinen form "kaydedilmemiş değişiklik" uyarısı veriyordu | açılış anı ile karşılaştırma | e2e iş |
| B14 | P2 | PDF önizleme yüklenince odağı çalıyordu (Esc çalışmıyordu) | odak son öğeye geri verilir | e2e belge |
| B15 | P2 | Hızlı ekran değişiminde eski ekranın geç gelen verisi yeni ekranın üstüne çiziliyor, ayrıntı ekranı geçmişe yanlış girdi yazıyordu | ekran numarası; geç kalan ekran çizmez | e2e gezinme (eski kodda düşüyor) |
| B16 | P1 | Kurum düzenleme formu önbellekten açılıyordu; Hafıza'dan açılınca vergi dairesi boş geliyor ve Kaydet onu siliyordu; eşzamanlı değişiklik eziliyordu | form kaydı DB'den okur; yalnız değişen alan, koşullu yazım | e2e kurum (eski kodda düşüyor) |
| B17 | P1 | Kişi sayfasından "Düzenle" formu boş açıyor, Kaydet telefon/e-posta/unvanı siliyordu; kurum sayfasında "Birincil" kutusu kurumun ana kişisini sessizce değiştirebiliyordu | DB'den okuma, yalnız değişen alan, doğru bayrak, bağlamda kalma | e2e kişi (eski kodda düşüyor) |
| B18 | P2 | 1440 px'te 438 metin kontrast hatası (ikincil gri, amber, kırmızı, açık zemin üstü vurgu) | metin tonları koyulaştırıldı | ölçüm: 5 genişlikte 0 |
| B19 | P2 | Etiketsiz denetimler (güncelleme metni, giriş alanları) | etiket / `aria-label` | ölçüm: 0 |
| B20 | P2 | Yatay taşma: kurum sayfası 390 px, üst çubuk 320 px | kırılma, dar ekranda ikon düğme | ölçüm: 0 |
| B21 | P2 | İşler › Liste sıralaması klavyeyle yapılamıyordu, yön okunmuyordu | başlıkta düğme + `aria-sort`; sıralamadan sonra odak aynı sütunda | e2e iş |
| B22 | P2 | ≤600 px'te ana menü keşfedilemiyordu | iki satırlı menü | ekran görüntüsü |
| B23 | P3 | Pencerede Tab dışarı kaçıyor, arka sayfa kayıyor, uzun formda düğmeler görünmüyor | odak tuzağı, kaydırma kilidi, yapışkan alt şerit | elle |
| B24 | P3 | Başka yıla ait tarihlerde yıl yazmıyordu | yıl eklenir | elle |
| B25 | P3 | Küçük seçim kutusunda metin kırpılıyor; aktif filtre çerçevesi hata gibi kırmızıydı | düzeltildi | elle |

Değişiklik gerektirmeden doğrulananlar: rol matrisi (başkasının ajandası,
rol yükseltme, imzalı URL, yerleşim/paket yazımı), çift tıklamada tek kayıt,
XSS yükü (akış, iş sayfası, rapor önizlemesi), eşzamanlı statik yerleşimde
tek kazanan, toplu yerleşimde ya hep ya hiç, Excel'de `=`/`+` ile başlayan
metnin formül olmaması, belge bağlantısının yalnız `https` olabilmesi,
tarayıcıya giden dosyalarda `service_role`/gizli anahtar olmaması.

---

## 3. Testleri çalıştırma

```powershell
.\scripts\test-regression.ps1            # yığın yoksa kurar, varsa dosyaları tazeler, hepsini koşar
.\scripts\test-regression.ps1 -Fresh     # test yığınını silip sıfırdan kurar (temiz kurulum kanıtı)
.\scripts\test-regression.ps1 -Grep Paket
.\scripts\test-env.ps1 stop              # test yığınını durdurur ve siler
```

Gereken: Docker, Node 20+, yüklü Google Chrome. İlk koşuda `tests/`
bağımlılıkları kurulur.

**Hedef güvenliği.** Test yığını ayrı bir Supabase projesidir (`mptest`,
API `56321`, DB `56322`, uygulama `http://localhost:5520`). Yalnız Git'e
girebilen dosyalar kopyalanır; özel seed'ler kopyaya girerse kurulum durur.
Veritabanına `medyapark-test-ortami` işareti yazılır; koşucu ve her test
yazmadan önce bu işareti ve portları doğrular. Çalışma yığını (`54321`) ve
production hedeflenemez.

**Veri.** Commit'li sentetik seed'ler + `tests/fixtures/` (beş test
kullanıcısı: yönetici, iki aktif üye, pasif üye, ekip kaydı olmayan oturum;
sentetik "S13 Regresyon Kurumu"). Testler yalnız `S13T` önekli kayıtlar
oluşturur ve her testten önce bunları temizler; sıra ve tekrar bağımsızdır.
Sabit gelecek dönemler kullanılır (yerleşim/işlem tarihleri 2031, randevu
2027) — "bugün"e bağlı sonuç yoktur. Sabit bekleme yoktur; testler
gözlenebilir durumu bekler.

**Kapsam** (`tests/e2e`, 44 senaryo):

- iş oluşturma: başarı, çift tık, ağ/sunucu hatası ve kayıp yanıtta yarım kayıt yok
- Pano aşama taslağı: ok yazmaz, Vazgeç, Kaydet tek Hareket
- eşzamanlı düzenleme çakışması (iş, kurum, paket)
- kurum ve kişi düzenlemede görünmeyen alanların korunması
- statik yerleşim çakışması, toplu kayıt atomikliği, LED eşzamanlılığı
- ilişkisiz belge, başarısız yükleme ve tekrar, bağlantı kaldırılınca dosyanın korunması, yıkıcı onayda odak
- paket bedeli düzenleme ve rapor toplamı (bir kez sayım, kısmi paket)
- dış paylaşım raporunda kapalı alanların önizleme/model/Excel'de olmaması; bayat önizleme
- kişisel plan: başkasının randevusu görünmez; iş özeti dış paylaşımda iç yazışma yok
- kişisel veri ve iç tablolar: pasif üye, ekip dışı oturum, anonim; medya deposu yazımı
- oturum: başka sekmede çıkış, pasife alma; gezinme yarışı; Geri/İleri
- İşler › Liste sıralamasının klavyeyle yapılması
- Excel'de formül enjeksiyonu yok; belge bağlantısında yalnız `https`

SQL değişmezleri: `scripts/access-checks.sql` (7) ve `scripts/media-checks.sql` (8),
ikisi de salt okunur; çalışma DB'sinde de çalıştırılabilir.

Hata olursa ekran görüntüsü ve iz dosyası `tests/test-results/`, özet
`tests/playwright-report/index.html` altına yazılır (Git dışı).

Görsel ölçüm (isteğe bağlı): `node tests/gorsel/cek.mjs <klasör>`;
`MP_VP="720x450,320x640"` ile genişlikler değiştirilir. Çıktı klasörü Git
dışında tutulmalıdır.

---

## 4. Sprint 14'e bırakılanlar

| Önem | Konu | Neden şimdi değil |
|---|---|---|
| P2 | **Kayıp yanıttan sonra tekrar deneme mükerrer kayıt üretebilir** (iş, yerleşim, işlem, belge oluşturma). S13 iletiyi dürüst yaptı; kalıcı çözüm oluşturma RPC'lerine istemci üretimli tekillik anahtarı | tüm oluşturma yollarında şema + RPC değişikliği |
| P2 | Adres çubuğunda ekran yok: sayfa yenilenince varsayılan ekrana dönülür, bağlantı paylaşılamaz | gezinme modelinde URL kararı gerekir |
| P2 | Ekran içi alt paneller (ör. Panelim Hareketler sekmesi, Mecralar alt sekmesi) kendi isteklerinde sıra koruması taşımıyor; ekran düzeyinde koruma var | düşük gözlenen etki |
| P3 | Yönetim formları (tedarikçi, ürün, sayfa, not, ekip) satırın tamamını yazar ve eşzamanlılık denetimi yoktur | yalnız yönetici, düşük eşzamanlılık; S13'teki kurum/kişi desenine taşınmalı |
| P3 | Kurum seçimi 500+ seçenekli yerel `<select>`; aranabilir seçici | UI bileşeni kararı |
| P3 | Mecra müsaitlik raporu ve PDF çıktılarının içeriği otomatik testte değil (PDF sıkıştırılmış); Excel ve model testli | test altyapısı |
| P3 | Ekran okuyucuyla gerçek deneme yapılmadı | ayrı erişilebilirlik turu |
| — | Bilinen, engel olmayan: Google Maps anahtarı localhost'a izinli değil; `/favicon.ico` 404 | yerel ortam |
