# Sprint 20 — Temiz canlı kurulum

2 Ekim 2026. Plan değişti: devralınan uygulama aktif kullanılan bir sistem değil; eski kullanıcılar ve
operasyon kayıtları **taşınmaz**. Uygulama ayrı, temiz bir canlı backend'le kullanıma açılır; güncel
veriler ekip tarafından uygulama üzerinden girilir. (Önceki veri göçü provası `S20_GECIS_PROVASI.md`
bu kararla geçersizdir; yalnız yöntem kaydı olarak durur.)

Bu belge yöntemi anlatır. Kurulum verisinin kendisi (mecra/ürün tanımları, site içeriği), parolalar
ve servis anahtarları Git'te **yoktur**.

## Ortamlar

| Ortam | Uygulama adresi | Backend | Veri |
|---|---|---|---|
| Yerel geliştirme | `http://localhost:5500` | yerel Supabase (54321) | geliştirme verisi |
| Demo | `https://ozgurplt96.github.io/medyapark-demo/` | Supabase `mdeqpoiweggdjhvmgddw` | sentetik örnek veri |
| **Canlı** | `https://ozgurplt96.github.io/medyapark/` | Supabase `ziofsihzhixxrakbboks` (org "Medyapark") | gerçek kullanım |

Ortam, uygulamanın açıldığı **adresten (host + yol)** seçilir — `assets/config.js`, `MP_YAYIN`.
Demo ve canlı aynı host'tadır (GitHub Pages bir hesabın depolarını aynı host altında, farklı yollarda
yayımlar); bu yüzden kural host + yol önekidir ve tam eşleşir (`/medyapark/` öneki `/medyapark-demo/`
ile eşleşmez). Tanımlı olmayan her adres **kapalıdır**: uygulama hiçbir veritabanına bağlanmaz.
Devralınan eski Supabase projesi hiçbir ortamın hedefi değildir (Tüyap sayfası dahil — o sayfa
eskiden adres ne olursa olsun eski projeye sabit bağlıydı).

Aynı origin'i paylaştıkları için canlı, tarayıcı deposunda kendi anahtar önekini (`mpc_`) kullanır;
süzgeç/yüzey tercihleri demo ile karışmaz. Oturum anahtarı zaten proje kimliğiyle ayrıdır.

Yeni bir yayın adresi (ör. özel alan adı) için tek değişiklik `MP_YAYIN`'a bir satır eklemektir.

## Temiz kurulum

1. **Şema:** bütün migration'lar sırayla (`supabase migration up --linked`). Fonksiyonlar, RLS,
   `media` (public) ve `documents` (özel) bucket'ları ve depo politikaları migration'lardadır.
2. **Seed çalışmaz.** Demo, sentetik ve şirket verisi seed'lerinin hiçbiri uygulanmaz.
3. **Kurulum verisi** (Git dışı, üretici betikle): yalnız tanım kayıtları —
   4 lokasyon, 8 alan, 104 statik yüz + 3 LED ekranı, 7 ürün türü, 5 site sayfası, 24 ayar.
   Kaynak: 24 Eylül kesin envanter kararı (yapı) + devralınan sitenin güncel public içeriği
   (metin, görsel, ürün ayrıntıları, ayarlar). İşaret edilen görseller yeni projenin `media`
   bucket'ına kopyalanır; kayıtlarda eski projeye giden adres kalmaz.
   Çıktı salt `INSERT … ON CONFLICT DO NOTHING`dir: tekrar çalıştırmak mükerrer üretmez ve
   Yönetim'den sonradan yapılan düzenlemeyi ezmez.
4. **Kimlik doğrulama:** dışarıdan kayıt kapalı, şifre en az 8 karakter, site adresi yayın adresi.
5. Kurum, kişi, iş, güncelleme, teklif, yayın/opsiyon, baskı-montaj, belge, ekip ve Tüyap içeriği
   **boş** başlar.

Yerel prova: `.\scripts\prova-env.ps1 start -Temiz` (bütün migration'lar, seed yok) + kurulum verisi.

## Tek uygulama, iki yüzey

- Herkes **Team Workspace** ile açılır (Panelim, İşler, Hafıza, Mecralar, Raporlar).
- Yönetici ayrıca **Yönetim**'e geçer (kenar çubuğundaki anahtar). Bir yönetim bölümü doğrudan
  açılırsa (bağlantı, yenileme, pano kartı) menü o yüzeye geçer.
- Yönetim, devralınan ekranların tamamını taşır: Dashboard, Mecralar, Ürünler, Harita, Doluluk,
  Teklifler, Planlama Talepleri, Müşteriler, Bülten Aboneleri, Tedarikçiler, Anasayfa, Sayfalar,
  İkonlar, Ekip, Notlar, Ayarlar (+ Hafıza, İş Takibi, Baskı & Montaj, Raporlar).

## Giriş hesapları

İç erişim `auth.users.id → team.auth_user_id` bağıyla çalışır. E-posta metni yetki kaynağı değildir.

1. Giriş hesabı açılır (Supabase paneli → Authentication → Add user, "Auto Confirm"; ya da yönetim
   betiği). Dışarıdan kayıt kapalıdır.
2. Yönetici, **Yönetim › Ekip**'te kişiyi ekler (ad, e-posta, yetki) ve profilinden
   **"Giriş hesabını bağla"** der (`ekip_hesap_bagla`, yalnız yönetici; e-postası onaylı hesabı
   kimliğiyle bağlar; bir hesap tek ekip kaydına bağlanır).
3. Kişi ilk girişte **profilinden şifresini değiştirir**.

İlk yönetici için 2. adım kurulum sırasında servis yetkisiyle yapılır (içeride henüz yönetici yoktur).
Demo girişi canlıda yoktur ve canlı yönetici hesabı olarak kullanılmaz.

## Boş başlangıçtan kullanım testi

`tests/canli/kullanim.mjs` — yalnız yerel temiz kurulum yığınına ya da canlı projeye karşı çalışır;
hedefte iş kaydı varsa (kullanılan sistem) çalışmaz. Geçici iki hesap açar, uygulamayı arayüzden
kullanır (kurum/kişi, iş, güncelleme, opsiyon → yayın, baskı–montaj–söküm, belge, yenileme sonrası
kalıcılık, dört raporun gerçek PDF/Excel indirmesi, Yönetim erişimi, public site, planlama talebi)
ve sonunda oluşturduğu her kaydı, dosyayı ve hesabı siler; kurulum kayıtlarının içeriğinin
değişmediğini doğrular.

## Bilinmesi gerekenler

- **Yedek:** ücretsiz planda otomatik günlük yedek yoktur ve proje 7 gün kullanılmazsa duraklar.
  Gerçek veri girilmeden önce plan yükseltilmeli ya da düzenli döküm alınmalıdır.
- **Harita:** Google Maps anahtarı kurulum verisine alınmadı (eski yayın adresine kısıtlı, başka
  hesabın kaynağı). Harita OpenStreetMap ile çalışır; Google istenirse yeni adrese izinli bir
  anahtar Yönetim › Ayarlar'dan girilir.
- **E-posta:** Supabase'in varsayılan e-posta gönderimi yalnız proje ekibine ve düşük limitle
  çalışır; davet/şifre sıfırlama e-postası için özel SMTP gerekir. Hesaplar bu yüzden geçici
  şifreyle açılır.
