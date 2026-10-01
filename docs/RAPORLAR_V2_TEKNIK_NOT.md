# Raporlar V2 — teknik devir notu (Sprint 12)

Hassas veri içermez. Raporlar kanonik kayıtların **salt okunur** projeksiyonudur;
rapor hazırlamak, önizlemek ya da indirmek hiçbir kaydı değiştirmez.

## Dosyalar

| Dosya | İçerik |
|---|---|
| `assets/rapor.js` | Rapor çerçevesi, ortak PDF/XLSX stili, dört rapor tanımı (`RPD_MECRA`, `RPD_BASKI`, `RPD_PLAN`, `RPD_IS`) |
| `assets/fonts/PlusJakartaSans-*.ttf` + `OFL.txt` | PDF'e gömülen yazı tipi (Türkçe karakter + ₺) |
| `supabase/migrations/20260929100000_ps12_rapor_operasyon_alanlari.sql` | Operasyon alanları + paket bedeli tablosu |
| `supabase/seeds/99_zzzzzzzz_ps12_rapor_ornekleri.sql` | İdempotent örnek veri (şirket verisi yok) |
| `assets/panel.js` | Eski S5 sayfası `raporTablolari()` adıyla "Hızlı Excel tabloları" altında; operasyon formu yeni alanları; bağlam girişleri |

Kütüphaneler yalnız gerektiğinde yüklenir: pdfmake 0.2.12 (cdnjs) ve ExcelJS
4.4.0 (cdnjs). SheetJS ekran dışa/içe aktarımında kalır; ExcelJS yalnız biçimli
rapor dosyası içindir (SheetJS topluluk sürümü sabit başlık, yazdırma ayarı ve
biçim yazamıyor).

## Akış

`veri (tek okuma anı) + ayar + seçim → def.model() → önizleme | PDF | XLSX`

- Önizleme ve iki dosya **aynı model nesnesinden** üretilir.
- Kapatılan alan modele hiç kopyalanmaz → dosyada, gizli sayfada, metadata'da yoktur.
- Seçim: "Tüm filtrelenen sonuçlar" (çıkarılanlar hariç) / "Yalnız seçili kayıtlar".
  Filtre dışına düşen seçim budanır ve kullanıcıya sayısı söylenir.
- Veri yeniden okunurken ya da okuma hatasında indirme düğmeleri kilitlidir;
  hata "0 sonuç" gibi gösterilmez.
- Dış paylaşım / iç kullanım yalnız varsayılan alanları seçer, yetki vermez.

## Veri kaynakları

| Rapor | Kaynak |
|---|---|
| Mecra müsaitliği | `mdYukle()` → `media_schedule` (kesin yerleşim + geçerli eski kayıt), `units`, `alt_mecralar`, `mecralar.operational` |
| Baskı / montaj | `work_operations`, `operation_price_groups`, `jobs`, `customers` |
| Kişisel plan | `entries` (insan), `entry_relevance`, `work_followers`, `jobs`, `work_operations`, `personal_events` (yalnız kendi planı) |
| İş özeti | `work_detail` (iş, taraflar, güncelleme/hareket, yerleşim, operasyon, belge), `contacts`, `work_followers` |

## Hesap kuralları

**Mecra** (Mecralar ekranıyla aynı):
- İptal bloklamaz; opsiyon ve yayın bloklar; süresi dolmuş opsiyon bloklamaya devam eder.
- Bitişi bilinmeyen kayıt dönem sonuna kadar bloklar; A/B yüzleri bağımsız.
- Gün düzeyinde tarama: ardışık yenileme sahte boşluk üretmez, aynı yüzey-gün iki kez sayılmaz (yayın > opsiyon).
- "Dönemin tamamında müsait" ≠ "müsait tarih aralıkları".
- Doluluk özeti: tek gün oranı (yüz sayısı) ile dönem oranı (yüzey-gün) ayrı; yayın ve opsiyon ayrı.
  Payda seçili kapsamdaki bugünkü aktif statik envanterdir.
- LED ayrı bölüm; statik toplama ve orana katılmaz.

**Baskı / montaj:**
- Her para birimi ayrı toplanır.
- Paket bedeli (`operation_price_groups`) bir kez sayılır:
  - tüm işlemleri rapordaysa toplama girer;
  - kısmen rapordaysa kapsamıyla yazılır, dağıtılmaz ve toplama girmez.
- Paket içindeki satır tutarları bilgi amaçlıdır.
- KDV, indirim ve kâr hesaplanmaz.
- Miktar birimiyle yazılır ("4 gün" vinç dört baskı değildir); yüzey sayısı ≠ baskı adedi, baskı ölçüsü ≠ görünen alan.

**Kişisel plan:**
- İlgi kuralı Ajandam ile aynıdır: etiketli, atanan, yazar ya da takip edilen/sahibi olunan iş.
- Tarihli veya açık aksiyon = yapılacak iş; düz güncelleme = "gelişme".
- Gelişmelerde yalnız etiketlenen ve acil olanlar seçili gelir.
- Bugünden önceki açık aksiyon "Geciken"dir.
- Saat yalnız kişisel randevuda yazılır.
- Başkası için hazırlanan plan kişisel randevu içermez; RLS de döndürmez.

**İş özeti:**
- Mevcut durum rapor anıyla etiketlenir.
- Yapısal bölümde görünen olayın hareketi zaman çizelgesinde tekrarlanmaz.
- Belgelerin yalnız adı, türü ve tarihi yazılır; bağlantı yazılmaz.

## Çıktı

**PDF:**
- A4 dikey/yatay, kişisel plan A5 dikey.
- Gömülü yazı tipi; metin seçilebilir.
- Grup başlıkları tablonun tekrarlanan başlık satırıdır, bu yüzden sayfa sonunda tek başına kalmaz.
- Satırlar sayfada bölünmez; sayfa numarası ve oluşturulma anı her sayfada.
- Metadata: başlık + "Medyapark".

**XLSX:**
- Başlık bloğu 1–3. satırda (birleştirme yok); veri başlığı 5. satırda.
- Sabit başlık, filtre, yazdırma alanı, yön ve tekrarlanan başlık tanımlı.
- Tarih, sayı ve para gerçek hücre tipindedir.
- Formül yazılmaz; kullanıcı metni düz metindir.
- Gizli sayfa yoktur; yazar "Medyapark"tır.

## Veri modeli eki (migration)

`work_operations` tablosuna eklenen alanlar:
`material`, `grammage_gsm`, `visible_size`, `surface_count`,
`quantity_unit` (adet/m2/metre/gun/saat/takim/hizmet), `reprint`, `unit_cost`,
`sale_amount`, `currency` (TRY/USD/EUR), `price_group_id`.

`dimensions` alanı artık "baskı ölçüsü" anlamındadır.

`operation_price_groups` tablosu:
- `job_id`, `label`, `cost_amount`, `sale_amount`, `currency`, `note`.
- RLS `work_operations` ile aynıdır: iç kullanıcı okur/yazar, yalnız admin siler, anon erişemez.
- Paket yalnız kendi işinin operasyonlarını kapsar (tetikleyiciyle zorlanır).

`operations_batch_create(p_job, p_rows, p_docs, p_package)` satırları, belge
bağlantılarını ve isteğe bağlı paketi tek işlemde yazar.

## Doğrulanan senaryolar (26.09.2026, yerel)

- **Mecra:** M1 + Çukurova, 01.09.2026–28.02.2027.
  - Rapor ile bağımsız SQL aynı sonucu verdi: 92 yüz, 16.652 yüzey-gün, yayın 2.689, opsiyon 1.328, müsait 12.635; tek gün 23/0/69.
  - P1-A Ekim–Aralık boş günleri SQL ile birebir: 55 gün, 22.10–03.12 ve 20.12–31.12.
- **Baskı:**
  - Toplam 51.800 ₺ maliyet ve 81.200 ₺ satış: paket 30.000 + paket dışı 21.800. EUR ayrı.
  - Kısmi pakette paket toplam dışında kaldı: 21.800 / 29.200.
  - PDF ve XLSX aynı toplamları taşıyor.
- **Dış paylaşım sızıntı taraması:** PDF metni, XLSX'in tüm XML parçaları ve metadata tarandı.
  - Müşteri adı, maliyet, satış bedeli, paket ve serbest not bulunmadı.
- **Seçim:** filtre değişince görünmeyen seçim budandı ve bildirildi.
- **Durumlar:**
  - Boş sonuçta indirme kilitli.
  - Okuma hatasında hata mesajı gösterildi, indirme kilitli; yeniden denemede veri geldi.
- **Formül:** `=1+1`, `@SUM(A1)` ve `+cmd|x` metin olarak yazıldı, dosyada formül yok.
- **Yetki:** başka kişinin planında kişisel randevu 0; doğrudan sorgu da boş (RLS).
- **Veritabanı (team_member, geri alınan işlemde):**
  - Paketli toplu kayıt tek işlemde yazıldı, tek hareket üretti.
  - Başka işin paketi reddedildi.
  - Geçersiz birim reddedildi.
  - team_member paket silemedi.
- **Arayüz:** 1440 px ve 390 px'te yatay taşma yok; konsol hatası yok.

---

# Sprint 15 — gerçek Excel şablonlarına uygun raporlar

Referans: elle tutulan "M1 ADANA AVM PANOLAR REZ. LİSTESİ", "BASKI-MONTAJ
TAKİP TABLOSU" ve Gürgençler baskı/montaj dökümü. Referans dosyaların
kayıtları uygulamaya aktarılmadı; yalnız düzenleri örnek alındı. Manuel
dosyalardaki hatalar (ör. Gürgençler G20 toplamının yalnız ilk kalemi
kapsaması, "FİRMA" sütunundaki ARC/ERK satıcı kodları) kopyalanmadı.

## Mecra doluluk tablosu (`RPD_MECRA`)

- Tek çıktı; eski "tam dönem / aralıklar / çizelge" üçlüsü ve doluluk özeti
  kaldırıldı. Filtreler: dönem, mecra, ürün, iç/dış; tek daraltma
  "yalnız dönemin tamamında müsait yüzeyler". Önizlemede yüz çıkar/geri ekle.
- Excel: lokasyon + ürün ailesi başına sayfa; No · Yüz · aylar. Yüz başına iki
  satır (üstte kurum/durum, altta kesin tarih). A/B ardışık, pano numarası
  birleşik. Başlık ve A:B sabit, ay başlıkları her sayfada; elle sayfa sonu
  pano (A/B) çiftini bölmez; ölçek 6 ay/sayfa genişliği.
- Ay içinde durum değişirse: hücre beyaz, iki satır boyunca birleşik; her
  dilim kendi renk işaretiyle alt alta ("Müsait · 01.09–04.09", kurum +
  tarih). Keskin geçişli (gradient) dolgu Excel baskısında çizgili çıktığı
  için kullanılmadı. PDF ve önizlemede ayrıca günlere oranlı ince şerit.
- Seçilen başlangıç/bitiş dışındaki günler "dönem dışı"dır, müsait sayılmaz;
  ay başlığı "Eki 2026 (15–31)".
- Dış paylaşımda kurum adı modele hiç kopyalanmaz; aynı yerleşimde
  Dolu / Opsiyon / Müsait + tarih. İç ayrıntı ("opsiyon süresi doldu") yok.
- LED ayrı sayfa; statik müsaitliğe ve yüz sayısına katılmaz.
- Hesap kuralları S12/S14 ile aynıdır (`rpYuzSerit` değişmedi).

## Baskı / montaj (`RPD_BASKI`) — iki hazır şablon

- **Takip tablosu**: Tarih · Müşteri · Ürün/iş kalemi · Adet · Baskı merkezi ·
  Ölçü · Bedel · Montaj tarihi · Montaj yeri · Montajı yapan · Not. Dönem
  hazır seçimlerle; tarih = kalemin **planlanan** tarihi (baskı; yoksa ilk
  uygulama). Tarihsiz kalem dönem seçiliyken sayısıyla bildirilir, "Ek
  filtreler"den eklenir. Durum Not sütununda.
- **İşe özel döküm**: tek iş; Ürün · Malzeme/cins · Baskı ölçüsü · Görünen
  alan · Yüzey adedi · Baskı adedi · Montaj bedeli · Birim fiyat · Tutar;
  destek hizmetleri (bağsız montaj, söküm, vinç…) ayrı bölüm; toplamlar
  para birimine göre aynı sayfada.
- Bedel: iç = kayıtlı maliyet, dış = kayıtlı satış bedeli (başlıkta yazar).
  Birim fiyat yalnız kayıttan (kayıtlı birim ya da tam bölünen satır tutarı).
- Paket bedeli bir kez; kısmi paket toplama girmez ve dağıtılmaz.
- Eski "Hızlı Excel tabloları"ndaki Baskı & Montaj, Doluluk Detayı ve
  Doluluk Özeti ile Baskı & Montaj / Doluluk ekranlarının ham dışa
  aktarımları kaldırıldı; o düğmeler yeni şablonları açar.

## Üretim kalemi (migration `20261003100000_ps15_uretim_kalemi.sql`)

- `work_operations.kalem_key uuid` — aynı anahtar = aynı üretim kalemi
  (baskı + montaj/söküm; bir montaj birden çok baskıyı kapsayabilir).
  Yeni tablo yok; mevcut satırlar NULL (bağımsız), tahmin yapılmaz.
- Tetikleyici: kalem yalnız aynı işin kayıtlarını kapsar.
- `operation_kalem_bagla(p_op, p_with)` (invoker, RLS geçerli): bağlar ya da
  çıkarır; tek üyesi kalan kalem temizlenir.
- Toplu giriş satırında "Kalem" etiketi (aynı pozisyondan baskı+montaj
  üretilince önerilir, görünür ve değiştirilebilir); tek kayıt formunda
  "Aynı üretim kalemi" seçimi; iş detayında "kalem N" rozeti.
- Tohum `99_zzzzzzzzz_ps15_kalem_ornekleri.sql`: yalnız tohum işleri
  (sort 9201–9206, 9301), yalnız boşsa; açık eşleşme listesi.

---

# Sprint 16 — aylık mecra yönetimi ve işlev odaklı raporlar

Migration yok (toplam 33). Referans: S15 mecra doluluk Excel'i (yönetim
ekranının görsel mantığı) ve tarihsel "LED EKRANLAR YAYIN DURUMU" tablosu
(yalnız okunuş; kayıtları aktarılmadı, ARC/ERK/POLAT satırları ekran ya da
kapasite sayılmadı).

## Ortak hesap (ekran = rapor)

`assets/medya.js` › AYLIK DİLİM bölümü; rapor bunları doğrudan kullanır:

| Fonksiyon | İş |
|---|---|
| `mdGunDilim(M,u,b,e,ref)` | yüzün günleri → ardışık dilimler (yayın > opsiyon > müsait; iptal bloklamaz; süresi dolmuş opsiyon bloklar; bitişsiz kayıt dönem sonuna kadar) |
| `mdDonemAylari(b,e)` | dönem ayları; kısmi ay ve "dönem dışı" gün sayısı |
| `mdAyHucre(seg,ay)` | bir aydaki dilimler (ay sınırına kırpılmış) + günlere oranlı renk dilimi; metin üretmez |

`rpYuzSerit` / `rpDonemAylari` artık bunların takma adıdır, `rpDolHucre`
yalnız rapor metnini (iç: kurum, dış: Dolu/Opsiyon/Müsait) yazar. Eski ve
yeni rapor modeli 104 yüzde, altı dönem/alıcı bileşiminde birebir aynı
çıktı (doğrulama: HEAD `rapor.js` aynı sayfada ayrı kapsamda çalıştırıldı).

## Mecralar — aylık yönetim tablosu (ana görünüm)

- İnce zaman çubukları kaldırıldı; ikinci ana görünüm yok. `mdStatikZaman` /
  `mdLedZaman` aynı adla tablo çizer, çağıranlar değişmedi.
- Statik: pano/pozisyon ve yüz sütunları yapışkan, aylar sütunda, A/B aynı
  pano altında; başlık yapışkan, tablo kendi içinde kayar (`.mtb-wrap`).
  Ay sütunu 3 ay 250, 6 ay 200, yıl 170 px — yazı küçültülmez.
- Hücre: tek durumlu ay tam dolgu; karma ay beyaz zemin + üstte günlere
  oranlı şerit + her dilim ayrı renkli blok (kurum · durum · kaydın kesin
  dönemi). Yenileme ayrı kayıt = ayrı blok.
- Durum metni `mdKayitDurumAd` ile: Yayında / Planlandı (kesikli çerçeve,
  "şu anda yayında" gibi görünmez) / Bitti (açık ton, metin koyu) / Opsiyon.
  Süresi dolmuş opsiyon sol kırmızı çizgi + "⚠ Opsiyon süresi doldu".
- Tıklama yazmaz: kayıt bloğu `mKayitAc`, müsait dilim `mdBosAc(uid,s,e)` →
  `mForm` yüzey + dilimin başlangıç/bitişi (boş ayda ayın sınırları).
  Kayıt anındaki çakışma denetimi (`media_placements_create`) aynen geçerli.
- Kurum/iş süzgeci kayıt sorusudur: eşleşmeyen kayıt soluk görünür ama
  dilimler yüzeyin TÜM kayıtlarıyla hesaplanır — süzgeç sahte müsaitlik
  üretemez. Durum süzgeci ve müsaitlik araması `mdDurumHesap` (değişmedi).
- İşaretler ayrışır: bugün = mavi dikey çizgi + başlıkta "Bugün N";
  durum tarihi = kesikli gri; müsaitlik araması = yeşil bant; seçili yüz =
  mavi sol şerit; odak (Takvimde göster) = amber çerçeve.
- LED: satır = kampanya (tarihsel LED tablosunun okunuşu); ayda kaydın o
  aya düşen kısmı. Kampanyasız ay boş beyazdır, müsait boyanmaz.
- Derin bağlantı: `medyaOdak` kaydın tüm ay bloklarını vurgular, ilkini
  yapışkan sütunların arkasında kalmayacak biçimde yatayda görünür alana alır.

## Raporlar — dört seçenek

`RP_TURLER` sırası ve `#/rapor/<tür>` adresleri değişmedi (geçmiş girdileri
bozulmasın). "Hızlı Excel tabloları" kaldırıldı: iş listesi İşler › Liste'de,
teklif listesi Teklifler ekranında (`teklifExcel`), aksiyon planının yerini
Kişisel çalışma planım aldı.

| Rapor | Giriş | Çıktı |
|---|---|---|
| Mecra doluluk tablosu | dönem, mecra, ürün, iç/dış, başlık/alıcı (tek dışa gönderilebilen rapor) | PDF · Excel (S15 düzeni aynen) |
| Baskı / montaj takip tablosu | dönem, isteğe bağlı kurum/iş | PDF · Excel |
| İş dökümü | yalnız aranabilir iş seçici (kurum `data-ek` yardımcı bilgi) | PDF |
| Kişisel çalışma planım | Bugün / Bu hafta / Tarih aralığı | A5 PDF |

`rpEskiBaglanti`: `rpAc('baski',{sablon:'dokum'})` → İş dökümü; diğer
raporlarda varsayılanda olmayan eski ayarlar (`_alici`, `sablon`, `kisi`,
`iptal`…) sessizce düşer. Başlık/alıcı/açıklama yalnız `metinAyar` taşıyan
mecra tablosunda. Önizleme ve dosyalar yine aynı modelden.

**Baskı / montaj takip tablosu:** 11 sütun korunur; bedel = kayıtlı maliyet
(sütun adı "Maliyet", satış bedeli okunmaz bile). Kalemler kurum/iş grup
bandında (ara toplam + durum özeti). Kalem durumu: Tamamlandı (yeşil metin),
Devam ediyor (mavi metin), Bekliyor (gri), Gecikti · N gün (kırmızı metin +
açık kırmızı zemin) — mecra renkleri kullanılmaz. Hesap `rpKalemleriKur` /
`rpPaketKur` / `rpToplamKur` / `rpKalemSirala` ortak yardımcılarında; eski
modelle 25 kalem ve toplamlar, 13 işin dökümü birebir aynı. PDF: sütun
başlığı sayfa üstünde tekrar eder (`rpPdfBelge` `o.sayfaUstu`), grup bandı
kendi tablosunun tekrarlanan başlığıdır; Not hücresi birleşik değil
(pdfmake birleşik hücrede uzun metni kırpıyordu). Excel: sabit ölçek, elle
sayfa sonu; kalem ve grup bandı bölünmez, taşan grup "(devam)" bandıyla sürer.

**İş dökümü:** özet sabit (kurum, ilgili kişiler, Medyapark ekibi, güncel
aşama, önemli tarihler, açık aksiyonlar); Yayınlar / Baskı-montaj (eski işe
özel döküm, maliyetle) / Güncellemeler ve önemli geçmiş / Belgeler dahil
et-çıkar. Kaydı olmayan bölüm devre dışı ve PDF'e girmez. Geçmişteki sistem
olayları yalnız tür koduyla seçilir (`RP_GECMIS_KURAL`): iş/sözleşme/teklif/
muhasebe olayları her zaman; yayın, baskı-montaj ve belge olayları yalnız o
bölüm rapor dışındaysa; `document_changed` hiç. Aynı gün + tür + metin tek
satır. Veri okuma hatası "kayıt yok" gibi gösterilmez.

**Kişisel çalışma planım:** yalnız oturum sahibi. Görev = açık aksiyon VE
(bana atanmış ∨ beni etiketlemiş ∨ benim açtığım ve atanmamış) + sahibi
olduğum işlerin planlanan baskı/montajı + kendi randevularım. Takip edilen
iş ya da düz güncelleme görev değildir; tamamlanan/iptal ve arşivdeki işin
kayıtları girmez; kayıt anahtarıyla bir kez. Bilgi için: beni etiketleyen ya
da takip/sahip olduğum işte acil düz güncelleme, son 7 gün, en çok 12.

## Doğrulama (29.09.2026)

- Temiz test yığını (33 migration + commit'li tohumlar): e2e 103/103,
  erişim ve mecra SQL denetimleri geçti.
- Çıktılar Excel'in kendisiyle PDF'e basılıp sayfa sayfa incelendi.
- Mecralar M1 tam yıl, üç grup açık: 1.104 hücre ~20 ms; 1440 ve 390 px'te
  sayfa taşması yok.

---

# Sprint 17 — Mecralarda tek dönem, doğrudan Excel ve harita

Migration yok (toplam 33). Değişen: `assets/medya.js`, `assets/panel.js`
(adres katmanı + harita), `assets/rapor.js` (ortak yardımcılar, LED sayfası),
`assets/panel.css`, `admin.html` (v147).

## Tek dönem (uygulanan arama)

Eski "durum tarihi", ayrı "müsaitlik araması" ve yıl/ölçek/çapa durumu
kaldırıldı. `sessionStorage['mp_medya']` (sürüm 17) yalnız uygulanmış aramayı
tutar: `bas`, `bit`, `hazir` ('6' | '3' | 'yil' | ''), `merkez`, `durum`,
`site`, `urun`, `kurum`, `is`, `q`, `alan`, `gecmisGizle`, `acik`.

- "Bugün" `Europe/Istanbul`dur (`mdBugun`, `Intl`).
- Takvim ayı ekleme ay sonuna sınırlanır (`mdAyKaydir`): 31.08 + 3 ay = 30.11;
  31.05 − 3 ay = 28/29.02.
- Normal ilk açılış: 6 ay, merkez bugün → bugün−3 ay … bugün+3 ay
  (30.09.2026 → 30.06–30.12.2026). Yedi ay sütununa değebilir; kısmi ilk/son
  ay başlıkta ("yalnız 30", "1–30") ve özet satırında yazılır, dönem dışı
  günler gri ve müsait sayılmaz.
- Hazır dönemler: 6 ay = merkez ±3 ay; 3 ay = merkezden 3 ay ileri; Yıl =
  merkezin takvim yılı. ‹ › hazır dönemin adımıyla (6/3/12 ay), özel aralık
  kendi uzunluğu kadar kayar. Bugüne git merkezi bugüne alır; özel aralıkta
  uzunluk korunur, başlangıç bugün olur. Süzgeçler korunur.
- Elle aralık `mdHazirBul` ile bir hazır döneme denk değilse hiçbir hazır
  dönem seçili görünmez.
- Sürüm farkı (eski saklanmış yıl görünümü) → normal ilk açılış. Dokunulmamış
  varsayılan dönem (`oto`) gün dönünce yeni bugüne göre kurulur.
- Adres: `#/mecralar?lok=&grup=&bas=&bit=&durum=&gecmis=gizli`. Tarihli adres
  aramanın tamamıdır ve varsayılanla ezilmez. S16 öncesi `?donem=YYYY-MM&olcek=N`
  tarih aralığına çevrilir. Arama metni adrese yazılmaz.

## Taslak ve uygulama

Form taslağı (`ui._mdTaslak`, bellek) hiçbir hesaba, tabloya, adrese ya da
Excel'e girmez. Yazarken ekran yeniden çizilmez; yalnız Ara / Enter uygular
(tarih doğrulaması S10 kuralıyla aynı; en çok üç yıl). Bekleyen değişiklik
"Bekleyen değişiklik · Aramayı uygula" göstergesiyle söylenir. Hazır dönem,
‹ ›, Bugüne git yalnız dönemi uygular; formdaki diğer bekleyen değişiklik
taslak olarak kalır. Aktif filtre etiketi kaldırma, programatik geçiş
(`medyaGit`, kayıt bağlantısı, harita) uygulanan aramayı değiştirir.

"Geçmiş ayları gizle" yalnız görünümdür (`mdEtkin`): bugünün ayından önceki
kısım düşer, bugünün ayının geçmiş günleri silinmez; etkin dönem özet satırında
yazar ve tablo, sayaç, Excel etkin dönemi kullanır. Tamamen geçmiş aralıkta
boş durum + "Geçmiş ayları göster".

## Durumlar — tek sonuç (`mdSonuc`)

Sayaç, tablo satırları, vurgular, seçilebilir yüzler ve üç seviyedeki Excel
aynı `mdSonuc(M, st)` nesnesinden beslenir. Tümü seçili ETKİN dönem [B, E] içindir.

| Durum | Kural |
|---|---|
| Tümü | kapsamdaki bütün aktif statik yüzler; kurum/iş/metin süzgeci varsa dönemde eşleşen kaydı olanlar |
| Opsiyonlu | dönemle kesişen, iptal edilmemiş opsiyon (süresi dolmuş dahil) |
| Yayın | dönemle kesişen kesin yayın (geçmiş ve planlanan dahil; kayıtta Yayında/Planlandı/Bitti) |
| Müsait | dönemin TAMAMINDA engelleyici kaydı olmayan statik yüz; kurum/iş daraltmaz |
| Dönem içinde boşalacak | `mdBosalma`: önceki gün bloklu, o gün boş ve gün [B, E] içinde; kesintisiz yenileme ve ertesi gün başlayan kayıt birleşir; bitişsiz ya da ay bazlı/bitişsiz eski son halka tarih üretmez; kurum/iş boşalan zincirde aranır |

- A/B ayrı; A/B'den yalnız biri sonuçtaysa diğeri tabloya ve Excel'e eklenmez.
- Süzgeç bir yüzün diğer kayıtlarını hesaptan çıkarmaz: dilimler her zaman tüm
  engelleyici kayıtlarla çizilir (eşleşmeyen kayıt soluk görünür).
- LED: Opsiyonlu/Yayın dönemle kesişen kampanyaları getirir; Müsait/Boşalacak
  LED'i dışarıda bırakır ve bunu söyler. Kapasite/boş slot yok.
- Pasif yüzler sonuçta yer almaz, sayısı notta yazar.
- Yüz ayrıntısı ve haritadaki "Bugün" satırı ayrı ve etiketlidir (`mdYuzeyDurum`);
  eski "Yakında boşalacak" etiketi kaldırıldı.

## Doğrudan Excel (`mdExcel`)

"Doluluk tablosu" düğmesi artık Raporlar'a yönlendirmez. Üç seviye:
genel (`{}`), mecra (`{site}`), ürün grubu (`{alan}`). Kapsam uygulanan
sonucun tamamıdır: kaydırmayla erişilen satırlar, kapalı gruplar dahil; toplu
kayıt seçim kutuları ve form taslağı kapsamı değiştirmez.

- Sayfa düzeni Raporlar › Mecra doluluk tablosu ile aynıdır: `rpXlsDosya` +
  `rpXlsDoluluk`; yüz dilimi `rpYuzSegModel`, pano düzeni `rpPanolar`
  (RPD_MECRA de bunları kullanır — çıktısı değişmedi). Satır 2: dönem +
  "Durum: …"; satır 4: kurum/iş/ürün/arama ve geçmiş gizleme süzgeçleri.
  İç kullanımdır (kurum adları yazılır). Raporlar'ın ayarları okunmaz.
- LED: `rpXlsLedAylik` — satır = kampanya, aylar sütunda, kampanyanın o aya
  (dönemle kırpılmış) düşen günleri; boş ay beyaz ve metinsizdir.
- Dosya adı: `Medyapark_Doluluk_<mecra>[_<ürün>][_<durum>]_<başlangıç>_<bitiş>.xlsx`.
- Tazelik: indirme anında veri yeniden okunur; kapsamın kayıt imzası değiştiyse
  dosya üretilmez, tablo yenilenir ve kullanıcıya söylenir. Arama indirme
  sırasında değişirse dosya üretilmez. Veri okunurken, indirme sürerken ve sonuç
  boşken düğmeler kilitlidir.

## Harita

- Liste (mecra → ürün → pano) daraltılabilir; "Listeyi gizle · haritayı
  genişlet" üst çubukta her zaman erişilebilir. Arama (mecra/ürün/pano/konum),
  "Yalnız konumu olanlar"; konumu olmayanlar ayrı `<details>` bölümünde.
  Aramada eşleşen dallar açılır. Pinler listenin konumlu sonuçlarıdır.
- Doluluk'ta uygulanan mecra/ürün kapsamı listeye "Doluluk kapsamı" etiketiyle
  taşınır; kaldırmak yalnız haritayı etkiler.
- Liste → pin (işaret + uçuş); pin → liste satırı (dal açılır, görünür alana,
  odak). "Sonuçları haritaya sığdır" konumlu sonuçlara; hiç yoksa söyler.
- Bilgi kartı haritanın ALTINDA (seçimde harita kaymaz): ad, mecra › ürün,
  ölçü, konum; her yüz için uygulanan dönemin kayıtları ve ayrıca etiketli
  "Bugün". Karma A/B tek renkli hükme indirgenmez. "Dolulukta göster" doğru
  mecra/grubu açar, dönemi korur, panonun A/B satırlarını vurgular.
- Konumsuz pano seçilince haritada seçili pin kalmaz, açık mesaj görünür.
- Pin rengi mecradır (divIcon), doluluk değildir.
- Konum: yalnız yönetici, yalnız "Konum ekle / Konumu düzenle" ile açılan
  düzenleme modunda; tıklama/sürükleme yalnız taslak üretir, Kaydet tüm yüzleri
  tek istekte yazar, Vazgeç yazmaz. Team için düzenleme denetimi yok; doğrudan
  API de RLS'e takılır.
- Google/OSM düşüşü korunur; ResizeObserver + `invalidateSize` ile sekme, liste
  ve pencere değişiminde yeniden ölçülür. Harita ayarları (metinler, Google
  anahtarı) yönetici için kapalı bir bölüme alındı.

## Doğrulama (30.09.2026)

- Temiz test yığını: e2e 113/113 (103 + S17'nin 10 senaryosu), erişim 10/10,
  mecra 8/8. S16 ve adres testleri yeni durum modeline uyarlandı.
- Excel dosyaları indirilen baytlardan (ExcelJS) okunarak doğrulandı: yüzler =
  sonuç, durum başlıkta, taslak dosyaya girmiyor, LED boş ay "Müsait" yazmıyor.

# S19 hazırlık — toplu Excel'de LED, tek tıkla süzgeç, tam ay dönemler, ortak tasarım değişkenleri

Geçiş hazırlığından önceki düzeltme turu (01.10.2026). Migration yok; kayıt
akışları, hesap kuralları (`mdGunDilim`, `mdSonuc`) ve sayfa şablonları aynı.

## LED: tek model, tek sayfa üreticisi

- Sorun: Mecralar'ın doğrudan Excel'i LED alanını aylık şablonla
  (`rpXlsLedAylik`) yazarken, Raporlar › Mecra doluluk tablosu bütün LED
  alanlarını tek düz "LED yayınları" listesine döküyordu.
- `rpLedAlanModel(M, mecra, alan, kayitlar, aylar, gun, ic, kull)` LED yayın
  alanının TEK modelidir. `mdXlsModel` (Mecralar) ve `RPD_MECRA.model`
  (Raporlar) aynı fonksiyonu çağırır; önizleme, PDF ve Excel bu modelden çizilir.
  Toplu indirme için ayrı bir LED düzeni tutulmaz.
- Her yayın alanı kendi sayfasıdır (M1 LED, Çukurova LED ayrı). Sayfalar
  mecra → alan sırasındadır (`rpMecraBolumler`): LED sayfası kendi mecrasının
  statik sayfalarının yanında durur.
- Kampanyasız ay boş bırakılır; "Müsait" yazılmaz, kapasite hesaplanmaz.
- Dış paylaşımda kurum ve iş adı modele girmez; satır etiketi `rpLedDisAd(i)`
  ("Kampanya 1", …) ile üretilir. 2. satırdaki İç kullanım / Dış paylaşım ve
  "Hazırlanan" bilgisi modelden okunur.
- S18'in üç satırlık üst alanı (başlık · kısa dönem/kapsam · sütun başlıkları)
  korunur.

## Mecralar: süzgeçler ve dönem

- Mecra sekmesi, durum, kurum, iş, ürün ve metin araması TEK TIKLA uygulanır
  (`mdUygula`). Form yeniden çizilmez: `mdKontrolEsitle` kontrolleri yerinde
  eşitler, `mdCiz` yalnız gövdeyi yeniler (odak kaybolmaz).
- Taslak yalnız elle yazılan özel başlangıç/bitiş tarihidir (`ui._mdTaslak`).
  Ara / Enter ile uygulanır (`mdAraUygula`); başka bir süzgece tıklamak onu
  uygulamaz, uygulanmış dönem kullanılır. Tarih yazarken ekran çizilmez.
- Durum etiketleri: Tümü / Opsiyonlu / Yayında / Müsait / Yakında boşalacak.
  Anlam dönemseldir ve saklanan anahtarlar (`opsiyon|yayin|musait|bosalacak`)
  değişmedi. Gelecekteki kesin yayın "Planlandı" yazar.
- Hazır dönemler tam takvim ayıdır ve çapa aya (`merkez`, YYYY-MM-01) göre
  kurulur (`mdHazirAralik`):
  3 ay = önceki ay + çapa ay dahil üç ay (varsayılan; dört sütun) ·
  6 ay = önceki ay + altı ay (yedi sütun) ·
  Yıl = takvim yılı; çapa Ocak ise önceki Aralık da dahil ·
  özel dönem = girilen kesin tarihler.
  Örnek 01.10.2026: 3 ay → 01.09.2026–31.12.2026, 6 ay → 01.09.2026–31.03.2027.
  Bitiş hep ay sonudur; tek günlük sütun oluşmaz.
- "Bugüne git" güncel döneme döner (özel dönemdeyse 3 aya). "Geçmiş ayları
  gizle" hazır ve özel dönemde bulunduğumuz aydan önceki ayları gizler;
  kapatılınca asıl dönem geri gelir. `MD_SURUM = 19`: eski saklı görünüm yeni
  varsayılanı etkisiz bırakmaz.

## Mecralar tablosu = Raporlar önizlemesinin düzeni

- Sütunlar No + Yüz (seçim kutusu ve yüz kodu, ör. `P1-A`). Yüz sütununun
  genişliği çizimden sonra içerikten ölçülür (`mdYuzGenOlc`) ve `--yg` olarak
  tabloya yazılır; `<col>`, tablo `min-width`i ve yapışkan `left` aynı
  değişkenleri kullanır. Ölçülen: No 34 px + Yüz 77 px (önce Pano 90 + Yüz 40);
  Raporlar önizlemesi 33 + 77 px.
- Tek durumlu ay hücresi durum rengiyle dolu; ay içinde değişen hücre beyaz,
  dilimler renk işareti + kalın ad + küçük tarih satırıyla (rapor önizlemesiyle
  aynı). Her dilim tıklanabilir kalır; LED kampanya sütunu 230 px.

## Ortak tasarım değişkenleri (`panel.css :root`)

Taban kurallar şu değişkenlere bağlandı; sayfaya özel yama eklenmedi:
`--fs-title/--fs-card/--fs-body/--fs-sm/--fs-xs`, `--ctl-h` (36 px; form
alanı, düğme), `--ctl-h-sm` (32 px; süzgeç, küçük düğme, sekme), `--r-card`,
`--c-card-line`, `--sh-card`, `--c-row`, `--c-focus`, `--st-yayin-*`,
`--st-ops-*`, `--st-musait-*`. 760 px altında kontrol yükseklikleri 40/36 px.
Klavye odağı tek renktir (`--c-focus`); seçim (koyu dolgu + ✓) ve durum
renkleriyle karışmaz. Mecra durum rozetleri tablo ve raporla aynı tonları
kullanır (Excel/PDF için aynı değerler `RP_DR` / `MD_RENK` içindedir).

## Doğrulama (01.10.2026)

- `tests/e2e/16_s19_led_sablon_tablo.spec.mjs`: toplu Excel'de LED sayfaları,
  Mecralar tekil indirmesiyle hücre/dolgu/sütun genişliği eşitliği, dış
  paylaşımda ad sızmaması, Yüz sütununun gerçek genişliği ve yapışkan konumlar.
- `tests/e2e/14_…spec.mjs`: tek tıkla süzgeç, tarih taslağı, hazır dönemler.
- Görsel/ölçüm araçları: `tests/gorsel/s19.mjs`, `envanter.mjs`, `cek.mjs`;
  demo yayını için salt okunur `demo_dogrula.mjs`.
