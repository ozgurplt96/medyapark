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
