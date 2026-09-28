/* Supabase bağlantısı — çalışılan hostname'e göre yönlenir.
 *
 *   loopback (localhost / 127.0.0.1 / ::1)  -> LOCAL Supabase  (development)
 *   TEST_HOST (aşağıda, tek satır)          -> ayrı, izole TEST Supabase projesi
 *   gerçek domain (medyaparkadana.com …)    -> PRODUCTION Supabase
 *   LAN IP / .local / file://               -> ENGELLENİR (fail-safe)
 *
 * Üçüncü kural neden var: `serve` gibi statik sunucular aynı anda bir de
 * http://192.168.x.x:5500 adresi açar. O adres loopback olmadığı için eski
 * sürümde sessizce PRODUCTION Supabase'e düşüyordu — yani local geliştirme
 * yaptığını sanırken canlı şirket verisine bağlanabiliyordun. Artık bilinmeyen
 * "yerel ağ" bağlamı production'a düşmek yerine kapanır (fail closed).
 *
 * TEST_HOST neden var (28 Eylül 2026, tek satırlık ek): uygulamanın başka
 * bir bilgisayardan tarayıcıyla denenebilmesi için ayrı, izole bir Supabase
 * projesine (kendi org'u, kendi verisi — Halil'in production'ıyla hiçbir
 * ilişkisi yok) yayımlanan bir kopya olacak (GitHub Pages, fork üzerinden —
 * bkz. .medyapark-context/reviews/online-test-ortami/). Bu satır olmasaydı
 * o adres "gerçek domain" sayılıp PRODUCTION'a bağlanırdı — canlı şirket
 * verisine yanlışlıkla erişim riski burada da aynen geçerli, bu yüzden aynı
 * fail-closed mantığı bir istisna değil, aynı kuralın devamı olarak eklendi.
 * Supabase Storage'ın kendisinden statik yayın DENENDİ ve reddedildi: her
 * genel (public) nesneye sabit `Content-Security-Policy: default-src
 * 'none'; sandbox` başlığı ekleniyor, bu yüzden orada script hiç çalışmaz
 * (yalnız dosya indirme için uygun, uygulama barındırmak için değil).
 *
 * Production davranışı değişmedi: gerçek domain üzerinden açıldığında
 * aşağıdaki kuralların hiçbiri eşleşmez ve production ayarları kullanılır.
 */

const _host = window.location.hostname;

const IS_LOCAL =
  _host === 'localhost' ||
  _host === '127.0.0.1' ||
  _host === '::1' ||
  _host === '[::1]';

/* Uzaktan deneme ortamı — yalnız bu tek, tam eşleşen hostname. Genel bir
   "her supabase.co adresine izin ver" kuralı DEĞİL; yeni bir yetki modeli
   ya da genel mekanizma açmaz, yalnızca mevcut üç-yollu yönlendirmeye bir
   satır daha ekler. */
const TEST_HOST = 'ozgurplt96.github.io';
const IS_TEST_HOST = _host === TEST_HOST;

/* Ne loopback ne de gerçek bir site: yerel ağ IP'si, mDNS adı veya dosya yolu. */
const IS_AMBIGUOUS_HOST =
  !IS_LOCAL && (
    window.location.protocol === 'file:' ||
    /\.local$/i.test(_host) ||
    /^10\./.test(_host) ||
    /^192\.168\./.test(_host) ||
    /^169\.254\./.test(_host) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(_host)
  );

if (IS_AMBIGUOUS_HOST) {
  const _msg =
    'Bu adres (' + (window.location.host || window.location.protocol) + ') ' +
    'local geliştirme adresi değil.\n\n' +
    'Yanlışlıkla CANLI (production) Supabase verisine bağlanmamak için ' +
    'uygulama burada başlatılmadı.\n\n' +
    'Local geliştirme için:  http://localhost:5500/';

  if (document.body) {
    document.body.innerHTML =
      '<pre style="margin:0;padding:32px;font:14px/1.7 ui-monospace,Consolas,monospace;' +
      'background:#1b1b1b;color:#ffb454;min-height:100vh;white-space:pre-wrap">' +
      _msg.replace(/[<>&]/g, function (c) {
        return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c];
      }) +
      '</pre>';
  }
  throw new Error('Medyapark: ambiguous host, Supabase client not created. ' + _msg);
}

/* TEST_HOST, uygulamanın YAYIMLANDIĞI adres (GitHub Pages) — Supabase
   projesinin adresi DEĞİL. İkisi ayrı ayrı sabitlenir; karıştırılırsa
   istemci kendi barındırma adresine bağlanmaya çalışır (yanlış). */
const TEST_SUPABASE_URL = 'https://mdeqpoiweggdjhvmgddw.supabase.co';
const TEST_SUPABASE_KEY = 'sb_publishable_jaETNikQtD0zyq0WaVVfLw_jD43BKtQ';

const SUPABASE_URL = IS_LOCAL
  ? 'http://127.0.0.1:54321'
  : IS_TEST_HOST
    ? TEST_SUPABASE_URL
    : 'https://wubljodinspijiqzywav.supabase.co';

/* Üçü de publishable (browser) anahtarıdır; secret/service-role anahtarı asla
   client koduna girmez. Local anahtar yalnız 127.0.0.1 stack'inde geçerlidir;
   test anahtarı yalnız TEST_HOST'ta, kendi izole projesinde geçerlidir. */
const SUPABASE_KEY = IS_LOCAL
  ? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
  : IS_TEST_HOST
    ? TEST_SUPABASE_KEY
    : 'sb_publishable_36AtxToYL_3yZGyhE69zXw_T-xYOQNu';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* TEST_HOST'ta küçük, kalıcı bir şerit: kimse bu adresi yanlışlıkla
   production sanmasın. Yalnız görsel — hiçbir davranışı değiştirmez. */
if (IS_TEST_HOST) {
  window.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('div');
    b.textContent = 'TEST ORTAMI — sentetik örnek veri, üretim (canlı) Supabase\'e bağlı değil';
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;' +
      'background:#7c2d12;color:#fff;font:600 12px/1.4 system-ui,sans-serif;' +
      'text-align:center;padding:6px 10px;pointer-events:none;';
    document.body.appendChild(b);
  });
}
