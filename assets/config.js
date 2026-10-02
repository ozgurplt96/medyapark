/* Supabase bağlantısı — uygulamanın AÇILDIĞI ADRESE (host + yol) göre ortam seçilir.
 *
 *   loopback (localhost / 127.0.0.1 / ::1)          -> YEREL Supabase (geliştirme)
 *   ozgurplt96.github.io/medyapark-demo/            -> DEMO Supabase  (sentetik örnek veri)
 *   ozgurplt96.github.io/medyapark/                 -> CANLI Supabase (gerçek kullanım)
 *   bunların dışındaki HER adres                    -> ENGELLENİR (hiçbir veritabanına bağlanmaz)
 *
 * Neden host TEK BAŞINA yetmez (S20): GitHub Pages aynı hesabın bütün depolarını
 * aynı host altında, farklı YOLLARDA yayımlar. Demo ve canlı aynı host'tadır;
 * yalnız host'a bakan bir kural ikisini aynı veritabanına bağlardı. Bu yüzden
 * yayın adresi host + yol öneki olarak, tam eşleşmeyle tanımlanır
 * ("/medyapark/" öneki "/medyapark-demo/" ile eşleşmez).
 *
 * Neden "bilinmeyen adres" kapalıdır: önceki sürümde tanınmayan her gerçek alan
 * adı eski (devralınan) Supabase projesine düşüyordu. S20 kararıyla o proje bu
 * uygulamanın hedefi DEĞİLDİR; uygulama yalnız aşağıda açıkça yazılı adreslerde
 * çalışır. Yeni bir yayın adresi (ör. özel alan adı) kullanılacaksa MP_YAYIN'a
 * bir satır eklenir — başka hiçbir yer değişmez.
 *
 * Yerel ağ adresi (192.168.x.x …) neden kapalı: `serve` gibi statik sunucular
 * bir de LAN adresi açar; o adres loopback olmadığı için yerel geliştirme
 * yaptığını sanırken başka bir veritabanına bağlanılabilirdi.
 */

/* Üçü de publishable (tarayıcı) anahtarıdır; secret / service-role anahtarı
   asla istemci koduna girmez. */
const MP_ORTAMLAR = {
  yerel: { url: 'http://127.0.0.1:54321', key: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' },
  demo:  { url: 'https://mdeqpoiweggdjhvmgddw.supabase.co', key: 'sb_publishable_jaETNikQtD0zyq0WaVVfLw_jD43BKtQ' },
  canli: { url: 'https://ziofsihzhixxrakbboks.supabase.co', key: 'sb_publishable_fEMgmvnodsPzbaa3UVRLGg_7232jL_A' },
};

/* Yayın adresleri: [host, yol öneki, ortam]. Yol öneki "/" ile başlar ve biter. */
const MP_YAYIN = [
  ['ozgurplt96.github.io', '/medyapark-demo/', 'demo'],
  ['ozgurplt96.github.io', '/medyapark/', 'canli'],
];

/* Saf işlev (testlerde doğrudan çağrılır): adres -> 'yerel' | 'demo' | 'canli' | null. */
function mpOrtamSec(host, yol, protokol) {
  host = String(host || '').toLowerCase();
  if (protokol === 'file:') return null;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return 'yerel';
  var y = String(yol || '/').toLowerCase();
  if (y.charAt(y.length - 1) !== '/') y += '/';          /* "/medyapark" ve "/medyapark/admin.html" */
  for (var i = 0; i < MP_YAYIN.length; i++) {
    if (host === MP_YAYIN[i][0] && y.indexOf(MP_YAYIN[i][1]) === 0) return MP_YAYIN[i][2];
  }
  return null;
}

const MP_ORTAM = mpOrtamSec(window.location.hostname, window.location.pathname, window.location.protocol);

if (!MP_ORTAM) {
  const _msg =
    'Bu adres (' + (window.location.host || window.location.protocol) + window.location.pathname + ') ' +
    'tanımlı bir Medyapark yayın adresi değil.\n\n' +
    'Yanlış veritabanına bağlanmamak için uygulama burada başlatılmadı; ' +
    'hiçbir sunucuya bağlanılmadı.\n\n' +
    'Yerel geliştirme için:  http://localhost:5500/';

  if (document.body) {
    document.body.innerHTML =
      '<pre style="margin:0;padding:32px;font:14px/1.7 ui-monospace,Consolas,monospace;' +
      'background:#1b1b1b;color:#ffb454;min-height:100vh;white-space:pre-wrap">' +
      _msg.replace(/[<>&]/g, function (c) {
        return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c];
      }) +
      '</pre>';
  }
  throw new Error('Medyapark: tanımsız yayın adresi, Supabase istemcisi oluşturulmadı. ' + _msg);
}

const IS_LOCAL = MP_ORTAM === 'yerel';
const IS_TEST_HOST = MP_ORTAM === 'demo';
const SUPABASE_URL = MP_ORTAMLAR[MP_ORTAM].url;
const SUPABASE_KEY = MP_ORTAMLAR[MP_ORTAM].key;

/* Tarayıcı deposu (localStorage / sessionStorage) anahtar öneki. Demo ve canlı
   aynı origin'dedir (aynı host); süzgeç, yüzey ve taslak kayıtları birbirine
   karışmasın diye canlı kendi önekini kullanır. Oturum anahtarı zaten proje
   kimliğiyle ayrıdır (sb-<ref>-auth-token). */
const MP_DEPO = MP_ORTAM === 'canli' ? 'mpc_' : 'mp_';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* Demo adresinde küçük, kalıcı bir şerit: kimse bu adresi canlı sanmasın.
   Yalnız görsel — hiçbir davranışı değiştirmez. */
if (MP_ORTAM === 'demo') {
  window.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('div');
    b.textContent = 'TEST ORTAMI — sentetik örnek veri, canlı veritabanına bağlı değil';
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;' +
      'background:#7c2d12;color:#fff;font:600 12px/1.4 system-ui,sans-serif;' +
      'text-align:center;padding:6px 10px;pointer-events:none;';
    document.body.appendChild(b);
  });
}
