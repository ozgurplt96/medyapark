# S19 kapanış — Baskı / Montaj operasyon akışı

Canlı entegrasyon provasından önceki son operasyon düzeltmesi (01.10.2026).
Yeni modül ya da ikinci iş takip sistemi yoktur; her şey mevcut
`work_operations` satırlarının ve `kalem_key` bağının üzerindedir.

Migration: `20261005100000_ps19_operasyon_akisi.sql` (toplam 35) — eklemeli.
Tohum: `seeds/99_zzzzzzzzzz_ps19_uygulayan_ornekleri.sql` (yalnız `(demo)` kayıtlar).

## 1. Durum ve tarihler

- İşlem türleri: Baskı / Montaj / Söküm. `diger` değeri veritabanında durur ve
  yalnız onu taşıyan eski kayıtta görünür.
- Durum üç değerlidir: **Yapılacak** (`planned`) / **Tamamlandı** (`done`) /
  **İptal** (`cancelled`).
- Eski `waiting` ve `in_progress` değerleri "Yapılacak"tır. Migration mevcut
  satırları çevirir; `trg_ops_durum_sade` (BEFORE) sonradan gelen eski değerleri
  de `planned` olarak saklar. CHECK kısıtı gevşek bırakıldı: eski istemci ya da
  eski tohum reddedilmez. Hiçbir satır silinmez; geçmiş hareketler aynen durur
  ve dönüşüm yeni hareket üretmez.
- **Gecikti** saklanmaz: `planned` + `planned_date < bugün` ile türetilir
  (`opGecGun`).
- **Planlanan** (`planned_date`) ve **gerçekleşen** (`completed_at`) ayrıdır.
  Gerçekleşen tarih tahmin edilmez: yalnız kullanıcı girdiyse yazılır, gelecekte
  olamaz, bilinmiyorsa boş kalır ("girilmedi"). Eski davranış (Tamamlandı
  seçilince `now()` yazmak) kaldırıldı; tamamlanmamış kayıt gerçekleşen tarih
  taşımaz.
- Hareketler (tetikleyici, yalnız yazılan değişiklik için): tamamlandı, iptal
  edildi, yeniden yapılacak olarak işaretlendi.

## 2. Akışın görünürlüğü

Baskı & Montaj ekranı artık satır = **üretim kalemi** gösterir
(`opKalemGrupla`): aynı `kalem_key`i taşıyan işlemler tek satırda, tür ve tarih
sırasıyla adım olarak durur. Her adım: tür, durum, ilgili tarih (tamamlananlarda
gerçekleşen, yapılacaklarda planlanan), uygulayan. Sağda **sıradaki işlem**
(planlanan tarihi en erken yapılacak kayıt), tarihi, uygulayanı ve gecikme.

- Bağlantılı işlem dönem süzgecinin dışında olsa da akışta görünür (kalemi olan
  işlerin işlemleri ayrıca okunur: `operations_list&job_ids=`).
- Bağsız kayıt tek adımlı bir kalemdir; zorunlu baskı→montaj→söküm zinciri
  yoktur. Yeniden baskı ve ortak montaj (birden çok baskı + tek montaj) aynı
  kalemde birlikte görünür; aynı türden birden çok adım yer/açıklamayla ayrışır.

## 3. Detay ve düzenleme

- Kayda tıklamak **okunur detayı** açar (`opAc`): iş, yer, planlanan ve
  gerçekleşen tarih, uygulayan, ayrıntı, bedel, kalem akışı, fotoğraf ve
  belgeler (Aç). Detay hiçbir şey yazmaz. Düzenleme ayrı ve belirgin bir adımdır
  (**Düzenle** → `opForm`).
- **Montaj ekle / Söküm ekle / Yeniden baskı ekle**: iş, yer ve kalem bilgisi
  öneri olarak gelir; kullanıcı kontrol edip Kaydet'e basana dek kayıt oluşmaz.
- Durum dahil her değişiklik Kaydet ile yazılır; Vazgeç yazmaz ve hareket
  üretmez. Düzenleme formu taze kayıtla açılır.
- Yeni kayıt tek satırlık `operations_batch_create` ile oluşur: satır, kalem
  bağı (`kalem_op`), paket ve dosya bağlantıları tek işlemde; tekillik anahtarı
  (S14) geçerli. RPC satırları ayrıca `completed_date`, `supplier_contact_id`
  ve mevcut `price_group_id` taşıyabilir. İmza değişmedi.

## 4. Form ve uygulayan

- Yeni kayıt sade tek-kayıt formudur. İşlem türüne uygun alanlar görünür
  (gizlenen alanın kayıttaki değeri silinmez). Toplu giriş, paket bedeli ve
  teknik ayrıntılar gerektiğinde açılan bölüm / bağlantıdır; raporların
  kullandığı alanların tamamı durur.
- Uygulayan seçicisi bütün kurumları listelemez (`opUygSecici`):
  - kurum: ilişki rolü **Baskı merkezi** (`print_center`) ya da **Uygulayıcı**
    (`installer`) — mevcut `customers.relationship_roles`;
  - kişi: `contacts.is_executor` işaretli ya da doğrulanmış bir kurumun kişisi
    (`work_operations.supplier_contact_id`);
  - boş bırakılabilir ("belirlenmedi").
  Eski "Tedarikçi" etiketi tek başına yeterli değildir. Kayıtta duran ama
  doğrulanmamış değer silinmez; "Kayıttaki değer — doğrulanmamış" grubunda
  görünür ve dokunulmadan kaydedilirse korunur.
- Seçiciden kurum / kişi oluşturulmaz (mükerrer kimlik riski); doğrulama
  Hafıza'da yapılır (Kurum › İlişki Rolleri, Kişi › "Baskı / montaj
  uygulayıcısı").

## 5. Raporlar

Takip tablosu, iş dökümü ve kişisel plan aynı kayıtları okur; paket toplamları
ve kalem eşleşmesi değişmedi. Yalnız durum sözcükleri (Yapılacak) ve uygulayan
adı (kişi seçildiyse kişi adı da) güncellendi.

## 6. Entegrasyon provasına kalan maddeler

1. **Önder, BASKIMARK, ONLINE DIGITAL**: gerçek tablolarda geçiyor; çalışma
   veritabanındaki kurum ve kişi kayıtlarında karşılıkları yok (01.10.2026,
   salt okunur sorgu). Bu turda oluşturulmadı. Provada kimlikleri ekiple
   doğrulanıp Hafıza'da tek kayıt olarak açılmalı ve rolü işaretlenmeli
   (BASKIMARK, ONLINE DIGITAL → Baskı merkezi; Önder → uygulayıcı kişi).
2. Mevcut kurumlarda eski otomatik "Tedarikçi" etiketi varsa uygulayıcı rolüne
   kendiliğinden çevrilmez; gerçek uygulayıcılar elle işaretlenir.
3. Eski Baskı/Montaj tablolarından içe aktarımda uygulayan adı kurum adıyla
   birebir eşleşmezse boş kalır (isimden kimlik üretilmez); eşleşmeyenler
   provada listelenmeli.
4. Toplu kurum silme ve OSB temizliği yapılmadı.
5. Canlı veritabanında `work_operations` yoksa durum dönüşümü boş çalışır;
   varsa dönüşen satır sayısı migration bildiriminde yazar.
