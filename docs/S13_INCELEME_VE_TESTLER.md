# Sprint 13–14 — Uygulama geneli inceleme, düzeltmeler ve regresyon paketi

S13: 27 Eylül 2026 · `ozgur/s13-audit-ux` · migration `20260930100000_ps13_erisim_ve_butunluk.sql`
S14: 28 Eylül 2026 · `ozgur/s14-guvenilirlik` · migration `20261001100000_ps14_islem_tekillik.sql`,
`20261001110000_ps14_yonetim_surum.sql` (toplam 31)

Tek bulgu listesidir: S14 bulguları aynı tabloya B26'dan itibaren eklendi,
S13'ün açık bıraktığı maddelerin durumu §4'te güncellendi.

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
| **S14** · Kayıp yanıt ve yeniden deneme | iş, mecra yerleşimi, baskı/montaj, belge: sunucuda COMMIT olup yanıtı düşürülen istek; formda kal / sonucu kontrol et / sayfa yenile; farklı içerikle tekrar; eşzamanlı aynı istek; başka üye; pasif üye; yükleme yanıtı kaybı; yarım yükleme temizliği | hata bulundu → düzeltildi, testli (eski istemcide düşüyor) |
| **S14** · Adres, yenileme, Geri/İleri | yenileme, doğrudan bağlantı + giriş, alt sekme, mecra lokasyon/dönem, açık belge, bulunamayan kayıt, yetkisiz yönetim adresi, kaydedilmemiş formda elle adres | düzeltildi, testli |
| **S14** · Aranabilir kurum seçici | 600+ kayıt, Türkçe arama, benzer adlar, klavye, Esc, temizle, düzenlemede mevcut değer, kirli form, 390 px pencere içinde | düzeltildi, testli |
| **S14** · Yönetim formları | tedarikçi, ürün, sayfa, not: eşzamanlı değişiklik, bayat liste, değişikliksiz kayıt, hata sonrası taslak, sunucu doğrulaması, yetki | hata bulundu → düzeltildi, testli |
| **S14** · Rapor hesapları ve dosyalar | mecra: tam dönem, aralık, A/B, ardışık yenileme, süresi dolmuş opsiyon, iptal, LED ayrımı, özet; dört raporun PDF/XLSX'i sayfa sayfa görsel | hata bulundu → düzeltildi; hesaplar testli, dosyalar elle incelendi |
| **S14** · Klavye | yalnız klavyeyle iş oluşturma (kurum seçimi dahil) ve aşama değişikliği; onay penceresinde odak | hata bulundu → düzeltildi, testli |

**Otomatik ölçümün sınırı:** kontrast, etiketsiz denetim ve yatay taşma
ölçümü script ile S13'te 15, S14'te 21 ekranda yapıldı (sonuç: beş
genişlikte 0). Bu bir WCAG 2.2 AA uygunluk denetimi **değildir**. Ekran
okuyucuyla deneme **yapılmadı** (bu ortamda otomatikleştirilebilir bir ekran
okuyucu yok); klavye akışları test edildi.

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
| B26 | P2 | **S14** · Kayıp yanıttan sonra tekrar gönderim iş, yerleşim, işlem ve belgede ikinci kayıt ve ikinci Hareket üretiyordu | sunucuda işlem tekillik anahtarı: anahtar iş verisiyle aynı işlemde kaydedilir, tekrar ilk sonucu döner, farklı içerik reddedilir (409), eşzamanlı tekrar bekleyip aynı sonucu alır, hata anahtarı kilitlemez, kapsam ekip üyesi + işlem türü, sonuç döndürülmeden yetki yeniden denetlenir. Arayüz "sonuç doğrulanamadı" der; "Sonucu kontrol et", formda kal, kapanış/yenilemede arka planda sorgu (oturum deposu: en çok 10 girişim, 24 saat, form içeriği yok) | e2e tekrar (eski istemcide düşüyor), access-checks 8 |
| B27 | P2 | **S14** · Belge: yükleme yanıtı kaybolunca tekrar yeni yola ikinci dosya yüklüyordu; kayıt yanıtı kaybolunca doğrulama sorgusu da başarısızsa istemci yüklenen dosyayı silmeye çalışıyor, tekrar ikinci belge oluşturuyordu | dosya yolu öğe başına bir kez üretilir, "zaten var" yanıtı bu girişimin dosyası sayılır; belirsiz sonuçta dosya silinmez; kayıt adımı tekillik anahtarlı; belgeye bağlanmamış eski yüklemeler Belgeler'de görünür ve açık onayla temizlenir (belgeye bağlı dosya bu yoldan silinemez) | e2e tekrar |
| B28 | P2 | **S14** · Adres çubuğunda ekran yoktu: yenileme varsayılan ekrana atıyor, bağlantı paylaşılamıyordu | mevcut history katmanına okunabilir karma adres (`#/is/42`, `#/hafiza?sekme=…`, `#/mecralar?lok=…&donem=…`, `?belge=…`); açılışta ve elle adres değişiminde hedef açılır; giriş sonrası hedefe dönülür; kaydedilmemiş formda vazgeçilirse adres geri yazılır; adreste taslak, not, anahtar ya da imzalı adres yok | e2e adres |
| B29 | P3 | **S14** · Doğrudan bağlantıda silinmiş ya da yetkisiz kayıt uyarı verip önceki ekranda kalıyordu | açık "bulunamadı / görme yetkiniz yok" ekranı (RLS'in gizlediği kayıtla silinmiş kayıt aynı yanıtı verir), ağ hatasında "Tekrar dene"; konsolda 406 yok | e2e adres |
| B30 | P2 | **S14** · Kurum seçimleri 500+ seçenekli yerel liste; baskı/montaj ve taraf formlarında liste sessizce 800'de kesiliyor, kurum okuması PostgREST 1000 satır tavanındaydı | ortak aranabilir seçici (gizli `<select>` değer kaynağı olarak kalır): Türkçe harf katlama, önek + alfabetik sıra, VKN/adres ek bilgisi, klavye, Esc yalnız listeyi kapatır, gösterilmeyen sonuç sayısı yazılır; sayfalı okuma, kesme kaldırıldı | e2e seçici |
| B31 | P1 | **S14** · Yeni sayfa `upsert` ile kaydediliyordu: aynı adresli yayındaki bir sayfanın başlığı ve içeriği boş sayfayla eziliyordu | yeni sayfa insert; çakışmada açık uyarı | e2e yönetim |
| B32 | P2 | **S14** · Tedarikçi, ürün, sayfa, not formları önbellekten açılıp satırın tamamını yazıyor, eşzamanlı değişikliği eziyordu; ürün ve not kaydı hata yakalamıyor, yetkisiz güncelleme (0 satır) başarı sanılıyordu | tek ortak koşullu kayıt yolu: DB'den tam okuma, yalnız değişen alan, `updated_at` sürüm damgası (tetikleyici), değişiklik yoksa yazma ve günlük yok, hatada taslak korunur; zorunlu alanlar sunucuda (NOT VALID kısıt) | e2e yönetim, access-checks 9 |
| B33 | P2 | **S14** · Mecra raporunda LED satırları ham kaydı (kurum adı, iş adı, not) dış paylaşım modeline taşıyordu; dosyaya yazılmıyordu ama "kapatılan alan modele girmez" kuralı bozuktu | modele yalnız dönem kopyalanır | e2e mecra raporu (eski kodda düşüyor) |
| B34 | P2 | **S14** · Kişisel plan PDF'inde gün başlığı sayfa sonunda tek kalıyor, son sayfa tek cümleden oluşuyor, boş günler ayrı ayrı yer kaplıyordu | başlık ilk maddesiyle bölünmez; çevrimdışı notu başta; art arda boş günler tek satır (önizleme de aynı) | PDF görsel (3 → 2 sayfa) |
| B35 | P3 | **S14** · İş özeti PDF'inde uzun başlık sayfa üst bilgisinde iki satıra taşıp yarım kesiliyordu; "İlgili kişiler" kurum tarafını da listeliyordu | tek satır + sözcük sınırında "…"; bölüm adı "Taraflar ve ilgili kişiler" | PDF görsel |
| B36 | P2 | **S14** · İş aşaması klavyeyle seçilince gösterge yeniden çiziliyor, odak sayfanın başına düşüyordu | odak aynı aşama düğmesine döner | e2e klavye |
| B37 | P3 | **S14** · Mecralar Doluluk/Harita sekme değişimi ekran-numarası korumasının dışındaydı | korumalı çizim yolu | kod incelemesi |
| B38 | P3 | **S14** · Hareketler satırı üzerine gelince ok 4.41:1 kontrast | koyu vurgu tonu | ölçüm: 0 |
| B39 | P2 | **S14** · Belge kaydı yoldayken form kapatılırsa kapanış temizliği dosyayı siliyor, geç tamamlanan kayıt dosyasız belge üretebiliyordu; "Sonucu kontrol et" kayıt bulamayınca "oluşturulmadı" diyor ve dosyayı geri alıyordu | sonucu doğrulanamayan dosya kapanışta ve 409 sonrası silinmez; kayıt bulunamazsa yalnız "bulunamadı, tekrar güvenli" denir; arka plan sorgusu 60 sn'den yeni girişim için hüküm vermez | e2e tekrar: yoldaki istek test tarafından geç gönderilir (koruma kaldırılınca düşüyor) |
| B40 | P2 | **S14** · Ekip formu (yönetici) önbellekten açılıp `app_role` dahil satırın tamamını yazıyordu: başka yöneticinin yetki değişikliği eski formdan yapılan ilgisiz bir kayıtla sessizce geri alınabiliyordu | DB'den okuma; yalnız değişen alan, açılıştaki değer hâlâ yerindeyse; yetki aynı anda değiştiyse çakışma | e2e yönetim (eski kodda düşüyor) |
| B41 | P2 | **S14** · Pencere açılışındaki gecikmeli (30 ms) otomatik odak, kullanıcının geçtiği alanı geri çalıyordu; hızlı yazılan metin ilk alana gidiyordu (S13'ten beri aralıklı düşen kişi düzenleme testinin kök nedeni) | odak zaten pencere içindeyse gecikmeli odak uygulanmaz | e2e klavye (eski kodda düşüyor) |

S14'te değişiklik gerektirmeden doğrulananlar: mecra raporu hesapları
bağımsız beklentiyle (ardışık yenileme sahte boşluk üretmiyor, A/B bağımsız,
süresi dolmuş opsiyon blokluyor, iptal bloklamıyor, LED statik orana
girmiyor); baskı/montaj toplamı paket düzenlemesinden sonra (40.710 ₺ /
68.700 ₺, paket bir kez); XLSX'lerde gerçek tarih/sayı hücreleri, sabit
başlık, filtre, A4 yatay sığdırma, tekrarlanan başlık satırı, gizli sayfa ve
formül yok; PDF'lerde gömülü yazı tipi ve tekrarlanan tablo başlıkları.

S13'te değişiklik gerektirmeden doğrulananlar: rol matrisi (başkasının ajandası,
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

**Kapsam** (`tests/e2e`; S13 44 senaryo, S14 sonunda 87 senaryo):

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
- **S14:** dört oluşturma yolunda kayıp yanıt (sunucuda COMMIT + yanıt düşürülür) → tek kayıt, tek Hareket, tek dosya; sonucu kontrol et; yenileme sonrası bildirim; farklı içerik reddi; eşzamanlılık; yarım yükleme temizliği
- **S14:** adres, yenileme, giriş sonrası hedef, Geri/İleri, bulunamayan kayıt, açık belge, mecra dönemi, kaydedilmemiş form
- **S14:** aranabilir seçici (500+ kayıt, Türkçe, klavye, mobil, diğer formlar)
- **S14:** yönetim formları (eşzamanlılık, bayat liste, değişikliksiz kayıt, hata, sayfa ezme, sunucu doğrulaması)
- **S14:** mecra raporu hesapları (bağımsız beklenti), dış paylaşım modeli, yalnız seçili kayıtların Excel'i
- **S14:** yalnız klavyeyle iş oluşturma ve aşama değişikliği; onay penceresinde odak

SQL değişmezleri: `scripts/access-checks.sql` (9) ve `scripts/media-checks.sql` (8),
ikisi de salt okunur; çalışma DB'sinde de çalıştırılabilir.

Hata olursa ekran görüntüsü ve iz dosyası `tests/test-results/`, özet
`tests/playwright-report/index.html` altına yazılır (Git dışı).

Görsel ölçüm (isteğe bağlı): `node tests/gorsel/cek.mjs <klasör>`;
`MP_VP="720x450,320x640"` ile genişlikler değiştirilir. Temsili rapor
dosyaları: `node tests/gorsel/raporlar.mjs <klasör>` (test yığınında sentetik
veriyle dört raporun PDF/XLSX'i). Çıktı klasörleri Git dışında tutulmalıdır.

---

## 4. Açık liste (S13'ün bıraktıkları ve durumları)

| S13 maddesi | Durum |
|---|---|
| Kayıp yanıttan sonra mükerrer kayıt (iş, yerleşim, işlem, belge) | **kapandı** — B26, B27 |
| Adres çubuğunda ekran yok | **kapandı** — B28, B29 |
| Ekran içi alt panellerde sıra koruması | **kapandı** — B37 (Panelim Hareketler zaten korumalı yoldaydı) |
| Yönetim formları (tedarikçi, ürün, sayfa, not, ekip) | **kapandı** — B31, B32, B40 |
| Kurum seçimi 500+ seçenek | **kapandı** — B30 |
| Mecra müsaitlik raporu ve PDF içeriği otomatik testte değil | **kısmen** — mecra hesapları ve dış paylaşım modeli testli; PDF'ler sayfa sayfa elle incelendi, içerik otomatik karşılaştırılmıyor |
| Ekran okuyucuyla gerçek deneme | **açık** — bu ortamda yapılamadı |

Kalan düşük öncelikli işler (bilinen açık P0/P1 yok):

| Önem | Konu | Not |
|---|---|---|
| P3 | Güncelleme (Entry) oluşturmada tekillik anahtarı yok: kayıp yanıttan sonra tekrar ikinci güncelleme üretebilir | etkisi mükerrer bir not satırı (yetki/veri kaybı yok, kullanıcı kendi güncellemesini silebilir); aynı desen `entry_create_with_documents`'e uygulanabilir |
| P3 | Belge kaydı ile aynı anda, aynı kullanıcı tarafından o dosyanın açıkça silinmesi yarışı sunucuda kilitli değil (`document_create` dosyayı kilitsiz doğrular) | arayüzdeki tek otomatik silme yolu (form kapanışı) belirsiz dosyayı artık silmiyor; yarım yükleme temizliği yalnız 2 saatten eski ve belgeye bağlı olmayanları listeler |
| P3 | Aranabilir seçici yalnız kurum listelerinde; eski tedarikçi, mecra ve iş seçicileri yerel liste | listeler kısa; gerekirse aynı `data-ara` işaretiyle |
| P3 | PDF içerik doğrulaması otomatik değil | görsel inceleme her sürümde tekrarlanmalı |
| P3 | Ekran okuyucu denemesi | ayrı erişilebilirlik turu |
| — | Bilinen, engel olmayan: Google Maps anahtarı localhost'a izinli değil; `/favicon.ico` 404 | yerel ortam |

---

## 5. S14 son test koşusu

| | |
|---|---|
| Test edilen commit | `3e3f6cd` (ağaç `6c29c0d`) — `ozgur/s14-guvenilirlik` |
| Yöntem | `scripts/test-regression.ps1 -Fresh`: atılabilir yığın silinip yalnız Git'e girebilen dosyalardan sıfırdan kuruldu (31 migration + commit'li seed'ler + test kullanıcıları); koşu boyunca çalışma ağacı değişmedi |
| SQL | access-checks 9/9, media-checks 8/8 |
| Uçtan uca | **87 / 87 geçti** (4,0 dk) |
| Önceki koşular | `d03b2e1`: 85/85. `3d36745`: 85/86 — kişi düzenleme testi düştü; kök neden B41 (odak çalma), düzeltildi, `3e3f6cd` ile tam koşu yenilendi |

Yükseltme yolu: çalışma DB'sinin kopyasında iki migration uygulandı ve tekrar
uygulandı; 37 tabloda satır sayısı birebir, yeni tablo boş, access 9/9, mecra 8/8.
