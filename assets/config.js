/* Supabase bağlantısı — çalışılan hostname'e göre yönlenir.
 *
 *   loopback (localhost / 127.0.0.1 / ::1)  -> LOCAL Supabase  (development)
 *   gerçek domain (medyaparkadana.com …)    -> PRODUCTION Supabase
 *   LAN IP / .local / file://               -> ENGELLENİR (fail-safe)
 *
 * Üçüncü kural neden var: `serve` gibi statik sunucular aynı anda bir de
 * http://192.168.x.x:5500 adresi açar. O adres loopback olmadığı için eski
 * sürümde sessizce PRODUCTION Supabase'e düşüyordu — yani local geliştirme
 * yaptığını sanırken canlı şirket verisine bağlanabiliyordun. Artık bilinmeyen
 * "yerel ağ" bağlamı production'a düşmek yerine kapanır (fail closed).
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

const SUPABASE_URL = IS_LOCAL
  ? 'http://127.0.0.1:54321'
  : 'https://wubljodinspijiqzywav.supabase.co';

/* Her ikisi de publishable (browser) anahtarıdır; secret/service-role anahtarı
   asla client koduna girmez. Local anahtar yalnız 127.0.0.1 stack'inde geçerlidir. */
const SUPABASE_KEY = IS_LOCAL
  ? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
  : 'sb_publishable_36AtxToYL_3yZGyhE69zXw_T-xYOQNu';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
