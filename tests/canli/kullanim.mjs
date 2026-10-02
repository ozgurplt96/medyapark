// S20 — BOŞ BAŞLANGIÇTAN GERÇEK KULLANIM TESTİ
//
// Temiz kurulmuş bir backend'de (şema + yalnız kurulum tanımları) uygulamayı ARAYÜZDEN kullanır:
// kurum/kişi, iş, güncelleme, opsiyon → yayın, baskı–montaj–söküm, belge; yenileme sonrası
// kalıcılık, Yönetim erişimi, belge açma, gerçek PDF/Excel indirmeleri, boş ekranlar.
// Sonunda kendi oluşturduğu HER kaydı, dosyayı ve geçici hesabı siler; kurulum kayıtlarının
// değişmediğini doğrular.
//
// Yalnız iki hedefe izin verilir: yerel temiz kurulum yığını ve canlı proje. Çalışma DB'si,
// test yığını, demo ve devralınan eski proje REDDEDİLİR. Hedefte iş kaydı varsa (kullanılan
// sistem) çalışmaz.
//
//   MP_K_APP=<uygulama kökü> MP_K_API=<supabase url> MP_K_ANON=<publishable> MP_K_SERVIS=<service key>
//   node canli/kullanim.mjs <çıktı-klasörü> [--kalsin]
// Servis anahtarı yalnız geçici hesap açmak, doğrulamak ve temizlemek için kullanılır;
// dosyaya yazılmaz, çıktıya basılmaz.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { aramaliSec, pdfMetin } from '../lib/ortam.mjs';

const APP = (process.env.MP_K_APP || '').replace(/\/+$/, ''), API = (process.env.MP_K_API || '').replace(/\/+$/, '');
const ANON = process.env.MP_K_ANON || '', SERVIS = process.env.MP_K_SERVIS || '';
const cikti = process.argv[2] || 'kullanim-cikti', KALSIN = process.argv.includes('--kalsin');
if (!APP || !API || !ANON || !SERVIS) throw new Error('MP_K_APP, MP_K_API, MP_K_ANON, MP_K_SERVIS gerekli');
const IZINLI = [/^http:\/\/127\.0\.0\.1:58321$/, /^https:\/\/ziofsihzhixxrakbboks\.supabase\.co$/];
if (!IZINLI.some(r => r.test(API))) throw new Error(`Hedef reddedildi: ${API} (yalnız temiz kurulum provası ya da canlı proje)`);
const CANLI = API.startsWith('https://');
fs.mkdirSync(cikti, { recursive: true });

const ON = 'S20-KULLANIM ';
const R = [];
const kontrol = (bolum, ad, ok, not = '') => { R.push({ bolum, ad, ok: !!ok, not: String(not).slice(0, 400) }); console.log(`${ok ? '  ✓' : '  ✗'} [${bolum}] ${ad}${not !== '' ? ' — ' + String(not).slice(0, 220) : ''}`); };
const bas = (k, ek) => ({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json', ...(ek || {}) });
async function http(yol, o = {}) {
  const r = await fetch(API + yol, { method: o.method || 'GET', headers: o.headers, body: o.body == null ? undefined : (typeof o.body === 'string' || o.body instanceof Buffer ? o.body : JSON.stringify(o.body)) });
  const m = await r.text(); let v = null; try { v = m ? JSON.parse(m) : null; } catch { v = m; }
  return { durum: r.status, veri: v, cr: r.headers.get('content-range') };
}
const svc = (yol, o = {}) => http('/rest/v1/' + yol, { ...o, headers: bas(SERVIS, { Prefer: o.prefer || 'return=representation' }) });
const anon = (yol, o = {}) => http('/rest/v1/' + yol, { ...o, headers: bas(ANON, { Prefer: 'return=representation' }) });
const say = async t => { const r = await svc(`${t}?select=*`, { method: 'HEAD', prefer: 'count=exact' }); return r.cr ? +r.cr.split('/')[1] : NaN; };
const jetonlar = {};
async function jeton(k) {
  if (jetonlar[k.email]) return jetonlar[k.email];
  const r = await http('/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: { email: k.email, password: k.sifre } });
  if (!r.veri || !r.veri.access_token) throw new Error('giriş: ' + JSON.stringify(r.veri).slice(0, 200));
  return (jetonlar[k.email] = r.veri.access_token);
}
const kul = async (k, yol, o = {}) => http('/rest/v1/' + yol, { ...o, headers: { apikey: ANON, Authorization: 'Bearer ' + await jeton(k), 'Content-Type': 'application/json', Prefer: o.prefer || 'return=representation' } });

/* Operasyon tabloları: kurulumda BOŞ olmalı ve test sonunda yine boş kalmalı. */
const OPS = ['media_placements', 'work_operations', 'operation_price_groups', 'document_links', 'documents', 'entry_relevance', 'entries', 'work_followers',
  'work_parties', 'contract_items', 'contracts', 'quote_items', 'quotes', 'bookings', 'jobs', 'contact_affiliations', 'contacts', 'customers',
  'personal_events', 'notes', 'leads', 'aboneler', 'bildirimler', 'suppliers', 'activity_log', 'islem_anahtarlari', 'team',
  'tuyap_noktalar', 'tuyap_gruplar', 'tuyap_ayarlar'];
const KURULUM = ['mecralar', 'alt_mecralar', 'units', 'products', 'pages', 'settings'];
const ozet = async t => { const r = await svc(`${t}?select=*`); const s = JSON.stringify((r.veri || []).map(x => { const y = { ...x }; delete y.updated_at; return y; }).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)); return (r.veri || []).length + ':' + crypto.createHash('sha256').update(s).digest('hex').slice(0, 16); };

/* ---------- ön koşul: boş başlangıç ---------- */
console.log(`Hedef: ${APP}  →  ${API}`);
const once = {}; for (const t of OPS) once[t] = await say(t);
const dolu = Object.entries(once).filter(([, n]) => n > 0);
if (dolu.length) throw new Error('Hedef boş başlangıçta değil: ' + dolu.map(([t, n]) => `${t}=${n}`).join(', '));
const kurOnce = {}; for (const t of KURULUM) kurOnce[t] = await ozet(t);
const authOnce = (await http('/auth/v1/admin/users?per_page=200', { headers: bas(SERVIS) })).veri.users.length;
const nesneOnce = (await http('/storage/v1/object/list/documents', { method: 'POST', headers: bas(SERVIS), body: { prefix: '', limit: 1000 } })).veri.length;
kontrol('0', 'boş başlangıç: operasyon tabloları, ekip ve belge deposu boş', true, `${OPS.length} tablo 0 satır · giriş hesabı ${authOnce} · belge nesnesi ${nesneOnce}`);
kontrol('0', 'kurulum kayıtları yerinde', (await say('mecralar')) === 4 && (await say('units')) === 107 && (await say('products')) === 7 && (await say('pages')) === 5,
  Object.entries(kurOnce).map(([t, o]) => `${t} ${o.split(':')[0]}`).join(' · '));

/* ---------- geçici hesaplar (test sonunda silinir) ---------- */
const sifre = () => crypto.randomBytes(18).toString('base64url') + 'aA1';
const K = { admin: { email: 's20-kullanim-yonetici@example.com', sifre: sifre(), ad: ON + 'Yönetici', rol: 'admin' },
  uye: { email: 's20-kullanim-uye@example.com', sifre: sifre(), ad: ON + 'Üye', rol: 'team_member' } };
async function hesapAc(k) {
  const u = await http('/auth/v1/admin/users', { method: 'POST', headers: bas(SERVIS), body: { email: k.email, password: k.sifre, email_confirm: true } });
  if (!u.veri || !u.veri.id) throw new Error('hesap açılamadı: ' + JSON.stringify(u.veri).slice(0, 200));
  k.uid = u.veri.id;
  /* Ekip kaydı hesaba BAĞLI DEĞİL oluşturulur; bağ, ürünün kendi yolu ile kurulur (aşağıda). */
  const t = await svc('team', { method: 'POST', body: { name: k.ad, eposta: k.email, app_role: k.rol, seviye: k.rol === 'admin' ? 'yonetici' : 'uye', active: true, role: 'Test' } });
  k.tid = t.veri[0].id;
}
const BILINEN = /favicon|tile\.openstreetmap|fonts\.g|unpkg|cdnjs|jsdelivr/i;
function dinle(page, hata) {
  page.on('console', m => { const u = (m.location() || {}).url || ''; if (m.type() === 'error' && !BILINEN.test(m.text()) && !BILINEN.test(u)) hata.push((m.text() + ' ' + u).slice(0, 260)); });
  page.on('pageerror', e => hata.push('PAGEERROR ' + e.message.slice(0, 220)));
  page.on('response', r => { if (r.status() >= 400 && !BILINEN.test(r.url())) hata.push(r.status() + ' ' + r.url().slice(0, 150)); });
}
const bekle = page => page.waitForFunction(() => !/^Yükleniyor/.test((document.getElementById('content') || {}).innerText || '')).then(() => page.waitForLoadState('networkidle'));
const kapandi = page => page.waitForFunction(() => !document.querySelector('#modalBg.open'));
const kaydet = page => page.locator('#modalBg.open').getByRole('button', { name: 'Kaydet', exact: true }).click();
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
let tarayici, hataGenel = null;
const ekran = (page, ad) => page.screenshot({ path: path.join(cikti, ad + '.png') });
/* Gerçek giriş formu ile oturum. */
async function giris(page, k) {
  await page.goto(`${APP}/admin.html`);
  await page.waitForSelector('#lu');
  const bag = await page.evaluate(() => ({ url: SUPABASE_URL, ortam: MP_ORTAM, depo: MP_DEPO }));
  if (bag.url !== API) throw new Error(`uygulama yanlış backend'e bağlı: ${bag.url}`);
  await page.fill('#lu', k.email); await page.fill('#lp', k.sifre); await page.locator('#lgBtn').click();
  await page.waitForFunction(() => typeof ui !== 'undefined' && ui._me && ui._me.id && document.querySelector('#content .ekran') && !/^Yükleniyor/.test(document.getElementById('content').innerText.trim()));
  await page.waitForLoadState('networkidle');
  return bag;
}

try {
  await hesapAc(K.admin); await hesapAc(K.uye);
  /* İlk yönetici: bağ kurulum adımıyla (servis) kurulur; üye, ÜRÜNÜN yolu ile (yönetici → Ekip → "Giriş hesabını bağla"). */
  await svc(`team?id=eq.${K.admin.tid}`, { method: 'PATCH', body: { auth_user_id: K.admin.uid } });
  tarayici = await chromium.launch({ channel: 'chrome' });
  const baglam = () => tarayici.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', acceptDownloads: true });

  /* ============ A. Ortam ve erişim ============ */
  console.log('A. Ortam ve erişim');
  for (const t of ['customers', 'jobs', 'entries', 'team', 'contacts', 'quotes', 'work_operations', 'documents', 'media_placements', 'bookings', 'activity_log', 'aboneler', 'media_schedule']) {
    const r = await anon(`${t}?select=*&limit=3`);
    kontrol('A', `anonim ${t} okuyamaz`, r.durum >= 400 || (Array.isArray(r.veri) && r.veri.length === 0), r.durum);
  }
  for (const [t, n] of [['mecralar', 4], ['units', 107], ['products', 7], ['pages', 5]]) {
    const r = await anon(`${t}?select=id`); kontrol('A', `public içerik: ${t}`, r.durum === 200 && r.veri.length === n, `${r.veri.length} kayıt`);
  }
  const kayit = await http('/auth/v1/signup', { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: { email: 's20-kullanim-disari@example.com', password: sifre() } });
  kontrol('A', 'dışarıdan hesap açılamaz (kayıt kapalı)', kayit.durum >= 400 && !(kayit.veri && kayit.veri.id), `${kayit.durum} ${JSON.stringify(kayit.veri).slice(0, 90)}`);
  const u0 = await kul(K.uye, 'customers?select=id&limit=1');
  kontrol('A', 'giriş hesabı var ama ekip kaydına bağlı değil → içeri erişemez', u0.durum === 200 && u0.veri.length === 0 && (await kul(K.uye, 'team?select=id')).veri.length === 0, u0.durum);

  /* ============ yönetici ============ */
  const cA = await baglam(); const pa = await cA.newPage(); const hataA = []; dinle(pa, hataA);
  const bag = await giris(pa, K.admin);
  kontrol('A', 'uygulama doğru ortamı seçti', bag.url === API && bag.ortam === (CANLI ? 'canli' : 'yerel') && bag.depo === (CANLI ? 'mpc_' : 'mp_'), `${bag.ortam} · ${bag.url} · depo öneki ${bag.depo}`);
  let d = await pa.evaluate(() => ({ y: surfaceGet(), b: ui.section, nav: [...document.querySelectorAll('#navScroll .navi')].map(x => x.innerText.trim()), sw: !!document.querySelector('#surfaceSw') }));
  kontrol('B', 'yönetici Team Workspace ile açılır; Yönetim anahtarı vardır', d.y === 'workspace' && d.b === 'workspace-home' && d.sw && d.nav.join('|') === 'Panelim|İşler|Hafıza|Mecralar|Raporlar', d.nav.join(' · '));
  await ekran(pa, 'B_panelim_bos');
  const bosMetin = {};
  for (const s of ['workspace-home', 'is-takibi', 'kurumlar', 'ws-mecralar', 'raporlar', 'operasyon', 'muhasebe', 'ekip']) {
    await pa.evaluate(s => go(s), s); await bekle(pa);
    bosMetin[s] = (await pa.locator('#content').innerText()).replace(/\s+/g, ' ').slice(0, 600);
    if (['is-takibi', 'kurumlar', 'operasyon'].includes(s)) await ekran(pa, 'B_bos_' + s);
  }
  const bozuk = Object.entries(bosMetin).filter(([, t]) => /undefined|NaN|\[object|null/.test(t) || t.length < 20);
  kontrol('B', 'boş Workspace ekranları (8) anlaşılır; hata yok', hataA.length === 0 && bozuk.length === 0, hataA.slice(0, 3).join(' | ') || bozuk.map(([s]) => s).join(','));
  fs.writeFileSync(path.join(cikti, 'bos_ekran_metinleri.json'), JSON.stringify(bosMetin, null, 1));
  /* Yönetim */
  await pa.locator('#surfaceSw button', { hasText: 'Yönetim' }).click(); await pa.waitForFunction(() => ui.section === 'dashboard'); await bekle(pa);
  const yonetim = ['dashboard', 'raporlar', 'mecralar', 'urunler', 'harita', 'listeler', 'teklifler', 'talepler', 'kurumlar', 'musteriler', 'aboneler', 'is-takibi', 'operasyon', 'tedarikciler', 'anasayfa', 'sayfalar', 'ikonlar', 'ekip', 'notlar', 'ayarlar'];
  const yBozuk = [];
  for (const s of yonetim) {
    await pa.evaluate(s => go(s), s); await bekle(pa);
    const t = (await pa.locator('#content').innerText()).replace(/\s+/g, ' ');
    if (/undefined|NaN|\[object/.test(t) || t.length < 10) yBozuk.push(s + ': ' + ((t.match(/.{0,30}(undefined|NaN|\[object).{0,30}/) || [''])[0]));
    if (['dashboard', 'mecralar', 'urunler', 'anasayfa', 'sayfalar', 'ayarlar'].includes(s)) await ekran(pa, 'C_yonetim_' + s);
  }
  kontrol('C', 'Yönetim: devralınan 20 ekran açılır (site yönetimi dahil); konsol hatası ve 4xx/5xx yok', hataA.length === 0, hataA.slice(0, 4).join(' | '));
  kontrol('C', 'Yönetim ekranlarında bozuk metin yok (undefined / NaN / [object)', yBozuk.length === 0, yBozuk.join(' ; '));
  d = await pa.evaluate(async () => ({ mecra: (await api('mecra_list').catch(() => [])).length, urun: (await api('products_list').catch(() => [])).length, sayfa: (await api('pages_list').catch(() => [])).length, logo: !!document.querySelector('.brand img') }));
  kontrol('C', 'site yönetimi kurulum içeriğini okur (mecra / ürün / sayfa) ve logo görünür', d.mecra === 4 && d.urun === 7 && d.sayfa === 5 && d.logo, JSON.stringify(d));
  /* Ekip: üyenin giriş hesabını ürünün kendi yolu ile bağla. */
  await pa.evaluate(i => { ui._teamOpen = i; return go('ekip'); }, K.uye.tid);
  await pa.waitForSelector('#tpBagla'); await pa.locator('#tpBagla').click();
  await pa.waitForFunction(() => !document.querySelector('#tpBagla'));
  const u1 = await svc(`team?id=eq.${K.uye.tid}&select=auth_user_id`);
  kontrol('C', 'yönetici, üyenin giriş hesabını Ekip ekranından bağlar', u1.veri[0].auth_user_id === K.uye.uid);
  await pa.evaluate(() => { ui._teamOpen = null; });

  /* ============ ekip üyesi: günlük kullanım ============ */
  const cU = await baglam(); const page = await cU.newPage(); const hataU = []; dinle(page, hataU);
  await giris(page, K.uye);
  d = await page.evaluate(() => ({ nav: [...document.querySelectorAll('#navScroll .navi')].map(x => x.innerText.trim()), sw: !!document.querySelector('#surfaceSw') }));
  kontrol('D', 'ekip üyesi girer: yalnız Team Workspace, Yönetim anahtarı yok', d.nav.join('|') === 'Panelim|İşler|Hafıza|Mecralar|Raporlar' && !d.sw, d.nav.join(' · '));
  await page.evaluate(() => go('ayarlar')); await page.waitForFunction(() => ui.section === 'workspace-home');
  const yz = await kul(K.uye, 'settings?k=eq.siteName', { method: 'PATCH', body: { v: 'x' } });
  kontrol('D', 'ekip üyesi Yönetim bölümüne giremez ve site ayarını değiştiremez', (await svc('settings?k=eq.siteName&select=v')).veri[0].v !== 'x', yz.durum);

  console.log('E. Kurum, kişi, iş, güncelleme');
  await page.evaluate(() => custForm(0)); await page.waitForSelector('#modalBg.open #cf');
  await page.fill('#cf', ON + 'Kurum A.Ş.'); await page.fill('#ct', '0322 000 00 00'); await page.fill('#cv', '1234567890');
  await kaydet(page); await kapandi(page);
  const kurum = (await svc(`customers?firma=eq.${encodeURIComponent(ON + 'Kurum A.Ş.')}&select=id,vergi_no`)).veri;
  kontrol('E', 'kurum oluşturulur (arayüz)', kurum.length === 1 && kurum[0].vergi_no === '1234567890', `kurum #${kurum[0] && kurum[0].id}`);
  const KID = kurum[0].id;
  await page.evaluate(k => contactForm(0, k), KID); await page.waitForSelector('#modalBg.open #kn');
  await page.fill('#kn', ON + 'Kişi'); await page.fill('#kt', 'Pazarlama Müdürü'); await page.fill('#kp', '0532 000 00 00');
  await kaydet(page); await kapandi(page);
  const kisi = (await svc(`contacts?name=eq.${encodeURIComponent(ON + 'Kişi')}&select=id,customer_id`)).veri;
  const bagl = kisi.length ? (await svc(`contact_affiliations?contact_id=eq.${kisi[0].id}&select=customer_id`)).veri : [];
  kontrol('E', 'kişi oluşturulur ve kuruma bağlanır', kisi.length === 1 && kisi[0].customer_id === KID && bagl.length === 1);
  await page.evaluate(() => jobForm()); await page.waitForSelector('#modalBg.open #jt');
  await page.fill('#jt', ON + 'Kampanya'); await aramaliSec(page, '#jc', KID);
  await page.locator('#modal').getByRole('button', { name: 'Oluştur', exact: true }).click();
  await page.waitForSelector('#wFaz');
  const is = (await svc(`jobs?title=eq.${encodeURIComponent(ON + 'Kampanya')}&select=id,status,lifecycle_status,customer_id`)).veri;
  const JID = is[0].id;
  const taraf = (await svc(`work_parties?job_id=eq.${JID}&select=role,customer_id`)).veri, hrk = (await svc(`entries?job_id=eq.${JID}&source=eq.system&select=system_kind`)).veri;
  kontrol('E', 'iş açılır: hesap tarafı ve tek "iş oluşturuldu" hareketi', is.length === 1 && taraf.length === 1 && taraf[0].role === 'account' && hrk.length === 1 && hrk[0].system_kind === 'work_created', `iş #${JID} · ${is[0].status}/${is[0].lifecycle_status}`);
  await page.evaluate(j => qcAc({ jobId: j }), JID); await page.fill('#qcBody', ON + 'müşteri Megalight için fiyat istedi');
  await page.locator('#modal').getByRole('button', { name: 'Paylaş', exact: true }).click(); await kapandi(page);
  const gorundu = await page.waitForFunction(t => document.getElementById('content').innerText.includes(t), ON + 'müşteri Megalight', { timeout: 8000 }).then(() => true, () => false);
  const gnc = (await svc(`entries?job_id=eq.${JID}&source=neq.system&select=id,body`)).veri;
  kontrol('E', 'güncelleme eklenir; iş zaman çizgisinde görünür', gnc.length === 1 && gorundu, `kayıt ${gnc.length} · ekranda ${gorundu}`);

  console.log('F. Opsiyon → yayın');
  const yuz = (await svc(`units?select=id,name,alt_mecra_id,alt_mecralar!inner(occupancy_mode,name)&alt_mecralar.occupancy_mode=eq.exclusive&order=id&limit=1`)).veri[0];
  const yap = (b, e, c) => kul(K.uye, 'rpc/media_placements_create', { method: 'POST', body: { p_common: { customer_id: KID, work_id: JID, commitment: c, start_date: b, end_date: e }, p_targets: [{ unit_id: yuz.id }] } });
  const o1 = await yap('2027-03-05', '2027-03-25', 'reserved');
  const yer = (await svc(`media_placements?unit_id=eq.${yuz.id}&select=id,commitment`)).veri;
  kontrol('F', 'boş yüze kesin dönemli opsiyon', o1.durum === 200 && yer.length === 1 && yer[0].commitment === 'reserved', `${yuz.alt_mecralar.name} · ${yuz.name}`);
  const o2 = await yap('2027-03-20', '2027-04-10', 'confirmed');
  kontrol('F', 'çakışan dönem reddedilir', (await svc(`media_placements?unit_id=eq.${yuz.id}&select=id`)).veri.length === 1, JSON.stringify(o2.veri).slice(0, 120));
  await kul(K.uye, 'rpc/media_placement_update', { method: 'POST', body: { p_id: yer[0].id, p_patch: { commitment: 'confirmed' } } });
  kontrol('F', 'opsiyon yayına çevrilir', (await svc(`media_placements?id=eq.${yer[0].id}&select=commitment`)).veri[0].commitment === 'confirmed');
  const pub = await anon(`booking_availability_public?unit_id=eq.${yuz.id}`);
  kontrol('F', 'public müsaitlik yayını gösterir, kurumu göstermez', pub.veri.length >= 1 && Object.keys(pub.veri[0]).sort().join(',') === 'status,unit_id,ym', JSON.stringify(pub.veri));
  await page.evaluate(() => { medyaGit({ site: null, alan: '', kurum: '', is: '', q: '', urun: '', durum: '', bas: '2027-03-01', bit: '2027-03-31', gecmisGizle: false }); });
  await page.waitForFunction(() => /statik yüz/.test(document.getElementById('content').innerText));
  const sayac = await page.evaluate(() => (document.getElementById('content').innerText.match(/\d+ statik yüz.*/) || [''])[0]);
  for (let i = 0; i < 10; i++) { const k = page.locator('#content .md-gt[aria-expanded="false"]').first(); if (!(await k.count())) break; await k.click(); await page.waitForTimeout(250); }
  const mt = await page.locator('#content').innerText();
  kontrol('F', 'Mecralar: 104 statik yüz sayılır; yayın tabloda kurum adıyla görünür', sayac.startsWith('104 statik yüz') && /S20-KULLANIM/i.test(mt), sayac);
  await ekran(page, 'F_mecralar');

  console.log('G. Baskı – montaj – söküm');
  await page.evaluate(() => go('operasyon')); await bekle(page);
  await page.evaluate(() => opForm(0)); await page.waitForSelector('#modalBg.open #opJob');
  await page.selectOption('#opJob', String(JID)); await page.locator('#opDesc').fill(ON + 'megalight vinil'); await page.locator('#opLoc').fill('M1 Megalight'); await page.locator('#opDate').fill('2027-03-01');
  await kaydet(page); await kapandi(page);
  const ops = async () => (await svc(`work_operations?job_id=eq.${JID}&select=id,operation_type,status,kalem_key,planned_date,completed_at&order=id`)).veri;
  const baski = (await ops())[0].id;
  await page.evaluate(i => opAc(i), baski); await page.locator('#modalBg.open').getByRole('button', { name: 'Montaj ekle' }).click();
  await page.locator('#opDate').fill('2027-03-04'); await kaydet(page); await kapandi(page);
  const montaj = (await ops())[1].id;
  await page.evaluate(i => opAc(i), montaj); await page.locator('#modalBg.open').getByRole('button', { name: 'Söküm ekle' }).click();
  await kaydet(page); await kapandi(page);
  let ol = await ops();
  kontrol('G', 'baskı → montaj → söküm aynı üretim kaleminde', ol.length === 3 && ol.map(o => o.operation_type).join(',') === 'baski,montaj,sokum' && new Set(ol.map(o => o.kalem_key)).size === 1 && ol[0].kalem_key);
  await page.evaluate(i => opForm(i), baski); await page.waitForSelector('#modalBg.open #opSt');
  await page.selectOption('#opSt', 'done'); await page.locator('#opGer').fill('2026-09-30').catch(() => {});
  await kaydet(page); await kapandi(page);
  ol = await ops();
  kontrol('G', 'baskı tamamlanır; gerçekleşen tarih girilen tarihtir', ol[0].status === 'done' && String(ol[0].completed_at || '').slice(0, 10) >= '2026-09-29');
  await page.evaluate(() => { opFiltreYaz({ donem: 'tum', from: '', to: '', type: '', kapsam: 'tum', q: '' }); go('operasyon'); }); await bekle(page);
  await page.waitForSelector('.opk-r');
  const sr = await page.evaluate(() => document.querySelector('.opk-r .opk-sr').innerText.replace(/\s+/g, ' ').trim());
  kontrol('G', 'Baskı & Montaj: en yakın planlı işlem montaj; tarihsiz söküm ayrıca yazılı', /Montaj 04\.03\.2027/.test(sr) && /Tarihsiz yapılacak: Söküm/.test(sr), sr);
  await ekran(page, 'G_baski_montaj');

  console.log('H. Belge');
  await page.evaluate(() => belgeForm({})); await page.waitForSelector('#modalBg.open #bfKaydet');
  await page.locator('#ek_bf input[type=file]').setInputFiles({ name: 's20-kullanim-teklif.pdf', mimeType: 'application/pdf', buffer: PDF });
  const tur = page.locator('#ek_bf .ek-tur').first(); if (!(await tur.inputValue())) await tur.selectOption('teklif');
  await page.fill('#bfBaslik', ON + 'teklif'); await page.selectOption('#bfIs', String(JID));
  await page.locator('#bfKaydet').click(); await kapandi(page);
  const blg = (await svc(`documents?title=eq.${encodeURIComponent(ON + 'teklif')}&select=id,storage_path`)).veri;
  const s1 = await http(`/storage/v1/object/sign/documents/${blg[0].storage_path}`, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + await jeton(K.uye), 'Content-Type': 'application/json' }, body: { expiresIn: 60 } });
  const g1 = s1.veri && s1.veri.signedURL ? await fetch(`${API}/storage/v1${s1.veri.signedURL}`) : { status: 0, arrayBuffer: async () => new ArrayBuffer(0) };
  kontrol('H', 'belge yüklenir, işe bağlanır ve açılır (imzalı adres, tam içerik)', blg.length === 1 && g1.status === 200 && (await g1.arrayBuffer()).byteLength === PDF.length);
  const g2 = await fetch(`${API}/storage/v1/object/public/documents/${blg[0].storage_path}`);
  kontrol('H', 'belge dışarıya kapalı', g2.status >= 400, g2.status);

  console.log('I. Yenileme sonrası kalıcılık');
  await page.goto(`${APP}/admin.html#/is/${JID}`); await page.reload();
  await page.waitForFunction(j => typeof ui !== 'undefined' && ui._work && ui._work.id === j, JID); await page.waitForLoadState('networkidle');
  const dt = await page.locator('#content').innerText();
  kontrol('I', 'sayfa yenilenince iş, güncelleme, yayın, baskı–montaj ve belge yerinde', [ON + 'Kampanya', ON + 'müşteri Megalight', ON + 'megalight vinil', ON + 'teklif', 'S20-KULLANIM Kurum'].every(x => dt.toLocaleUpperCase('tr').includes(x.toLocaleUpperCase('tr'))),
    [ON + 'Kampanya', ON + 'müşteri Megalight', ON + 'megalight vinil', ON + 'teklif'].filter(x => !dt.includes(x)).join(' eksik; '));
  await ekran(page, 'I_is_detay');
  await page.evaluate(() => go('workspace-home')); await bekle(page);
  kontrol('I', 'Panelim akışında güncelleme görünür', (await page.locator('#content').innerText()).includes(ON + 'müşteri Megalight'));
  await ekran(page, 'I_panelim');

  console.log('J. PDF / Excel');
  const indir = async (ad, xls = true) => {
    let xb = Buffer.alloc(0);
    if (xls) { const [x] = await Promise.all([page.waitForEvent('download'), page.locator('#rpXlsB').click()]); xb = fs.readFileSync(await x.path()); fs.writeFileSync(path.join(cikti, `J_${ad}.xlsx`), xb); }
    const [p] = await Promise.all([page.waitForEvent('download'), page.locator('#rpPdfB').click()]);
    const pb = fs.readFileSync(await p.path()); fs.writeFileSync(path.join(cikti, `J_${ad}.pdf`), pb);
    return { x: xb.length, p: pb.length, metin: pdfMetin(pb) || '', zip: xb.slice(0, 2).toString() === 'PK', pdf: pb.slice(0, 4).toString() === '%PDF' };
  };
  const site = (await svc('mecralar?name=eq.M1%20Adana%20AVM&select=id')).veri[0].id;
  await page.evaluate(s => rpAc('mecra', { siteler: [s], bas: '2027-03-01', bit: '2027-03-31', _alici: 'ic' }), site);
  await page.waitForFunction(() => ui._rpTur === 'mecra' && ui._rpModel && !rpDurum().yukleniyor);
  let f = await indir('mecra_doluluk');
  kontrol('J', 'Mecra doluluk tablosu: gerçek Excel + PDF', f.zip && f.pdf && f.x > 3000 && f.p > 3000 && /KULLANIM|Kullanım/i.test(f.metin), `xlsx ${f.x} · pdf ${f.p}`);
  await page.evaluate(j => rpAc('baski', { is: j, donem: 'tum' }), JID);
  await page.waitForFunction(() => ui._rpTur === 'baski' && ui._rpModel && !rpDurum().yukleniyor);
  f = await indir('baski_montaj');
  kontrol('J', 'Baskı/montaj takip tablosu: gerçek Excel + PDF', f.zip && f.pdf && f.metin.includes('megalight vinil'), `xlsx ${f.x} · pdf ${f.p}`);
  await page.evaluate(j => rpAc('is', { is: j }), JID);
  await page.waitForFunction(() => ui._rpTur === 'is' && ui._rpModel && ui._rpModel.ozet && !rpDurum().yukleniyor);
  f = await indir('is_dokumu', await page.locator('#rpXlsB').isVisible());
  kontrol('J', 'İş dökümü PDF', f.pdf && f.metin.includes(ON + 'Kampanya'), `pdf ${f.p}`);
  await page.evaluate(() => rpAc('plan', {}));
  await page.waitForFunction(() => ui._rpTur === 'plan' && ui._rpModel && !rpDurum().yukleniyor);
  const [pp] = await Promise.all([page.waitForEvent('download'), page.locator('#rpPdfB').click()]);
  kontrol('J', 'Kişisel çalışma planım PDF', fs.readFileSync(await pp.path()).slice(0, 4).toString() === '%PDF');
  await page.evaluate(() => { medyaGit({ site: null, alan: '', kurum: '', is: '', q: '', urun: '', durum: '', bas: '2027-03-01', bit: '2027-03-31', gecmisGizle: false }); });
  await page.waitForFunction(() => ui._mdSonuc && document.querySelector('#mdGovde .md-sonuc'));
  const [mx] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => mdExcel({}))]);
  const mb = fs.readFileSync(await mx.path()); fs.writeFileSync(path.join(cikti, 'J_mecralar_dogrudan.xlsx'), mb);
  kontrol('J', 'Mecralar ekranından doğrudan Excel', mb.slice(0, 2).toString() === 'PK' && mb.length > 5000, `xlsx ${mb.length}`);
  kontrol('D', 'ekip üyesi oturumu boyunca konsol hatası ve 4xx/5xx yok', hataU.length === 0, hataU.slice(0, 4).join(' | '));

  console.log('K. Public site');
  const cP = await baglam(); const ps = await cP.newPage(); const hataP = []; dinle(ps, hataP);
  const istek = []; ps.on('response', r => { if (/\/rest\/v1\//.test(r.url())) istek.push(r.status() + ' ' + r.url().replace(/^.*\/rest\/v1\//, '').slice(0, 50)); });
  await ps.goto(`${APP}/`); await ps.waitForFunction(() => typeof D !== 'undefined' && D && D.mecralar); await ps.waitForLoadState('networkidle');
  const pd = await ps.evaluate(() => ({ url: SUPABASE_URL, mecra: D.mecralar.length, yuz: D.mecralar.reduce((n, m) => n + m.alts.reduce((k, a) => k + a.units.length, 0), 0), baslik: document.title, gorsel: [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.src).map(i => i.src).slice(0, 5) }));
  const gorunen = (await svc('mecralar?hidden=not.is.true&select=id')).veri.map(m => m.id);
  const gYuz = (await svc(`units?mecra_id=in.(${gorunen.join(',')})&select=id`)).veri.length;
  kontrol('K', 'public site aynı backend’den açılır; yayındaki lokasyonlar ve yüzler yüklenir', pd.url === API && pd.mecra === gorunen.length && pd.yuz === gYuz, `${pd.baslik} · ${pd.mecra} lokasyon · ${pd.yuz} yüz`);
  kontrol('K', 'site görselleri yeni depodan yüklenir (kırık görsel yok)', pd.gorsel.length === 0, pd.gorsel.join(' '));
  kontrol('K', 'müsaitlik yalnız public görünümden okunur', istek.some(x => /^200 booking_availability_public/.test(x)) && !istek.some(x => / bookings\?/.test(x)));
  await ekran(ps, 'K_public_anasayfa');
  const talep = await ps.evaluate(([uid, ad]) => sb.rpc('submit_quote_request', { p_payload: { customer_name: 'S20-KULLANIM Ziyaretçi', firma: 'S20-KULLANIM Firma', telefon: '05550000000', eposta: '', items: [{ unit_id: uid, ym: '2027-06', mecra_name: 'M1 Adana AVM', unit_name: ad, product_name: 'Megalight', olcu: '', start_day: '2027-06-01', period: 'Haziran 2027', price: 0 }] } }).then(r => r.error ? { hata: r.error.message } : r.data), [yuz.id, yuz.name]);
  kontrol('K', 'planlama talebi gönderilir', talep && talep.ok && (await say('quotes')) === 1, JSON.stringify(talep));
  await ps.goto(`${APP}/tuyap/`); await ps.waitForLoadState('load'); await ps.waitForTimeout(3000);
  kontrol('K', 'public sayfalar ve Tüyap sayfası: konsol hatası ve 4xx/5xx yok', hataP.length === 0, hataP.slice(0, 4).join(' | '));
  await cP.close();
  await pa.evaluate(() => go('teklifler')); await bekle(pa);
  kontrol('C', 'gelen planlama talebi Yönetim › Teklifler’de görünür', /S20-KULLANIM/.test(await pa.locator('#content').innerText()));
  kontrol('C', 'yönetici oturumu boyunca konsol hatası ve 4xx/5xx yok', hataA.length === 0, hataA.slice(0, 4).join(' | '));
  await cA.close(); await cU.close();
} catch (e) {
  hataGenel = e; kontrol('!', 'test akışı tamamlandı', false, (e && e.stack || String(e)).slice(0, 380));
} finally {
  if (tarayici) await tarayici.close();
  if (!KALSIN) {
    /* ============ Temizlik: geçici kayıtlar, dosyalar, hesaplar ============ */
    console.log('Z. Temizlik');
    const yollar = ((await svc('documents?select=storage_path')).veri || []).map(d => d.storage_path).filter(Boolean);
    const liste = async on => ((await http('/storage/v1/object/list/documents', { method: 'POST', headers: bas(SERVIS), body: { prefix: on, limit: 1000 } })).veri || []);
    for (const ust of await liste('')) for (const alt of (ust.id ? [] : await liste(ust.name))) { const y = `${ust.name}/${alt.name}`; if (alt.id) yollar.push(y); else for (const a3 of await liste(y)) yollar.push(`${y}/${a3.name}`); }
    const benzersiz = [...new Set(yollar)];
    if (benzersiz.length) await http('/storage/v1/object/documents', { method: 'DELETE', headers: bas(SERVIS), body: { prefixes: benzersiz } });
    const SIRA = ['media_placements', 'work_operations', 'operation_price_groups', 'document_links', 'documents', 'entry_relevance', 'entries', 'work_followers', 'work_parties', 'contract_items', 'contracts',
      'quote_items', 'quotes', 'bookings', 'jobs', 'contact_affiliations', 'contacts', 'customers', 'personal_events', 'notes', 'leads', 'aboneler', 'bildirimler', 'suppliers', 'entries', 'activity_log', 'islem_anahtarlari', 'team'];
    const ANAHTAR = { entry_relevance: 'entry_id', work_followers: 'job_id', islem_anahtarlari: 'created_at' };
    const sorun = [];
    for (let tur = 0; tur < 2; tur++) for (const t of SIRA) {
      const k = ANAHTAR[t] || 'id';
      const r = await svc(`${t}?${k}=not.is.null`, { method: 'DELETE', prefer: 'return=minimal' });
      if (r.durum >= 400 && tur === 1) sorun.push(`${t}: ${r.durum} ${JSON.stringify(r.veri).slice(0, 100)}`);
    }
    for (const k of Object.values(K)) if (k.uid) await http(`/auth/v1/admin/users/${k.uid}`, { method: 'DELETE', headers: bas(SERVIS) });
    const sonra = {}; for (const t of OPS) sonra[t] = await say(t);
    const kalan = Object.entries(sonra).filter(([, n]) => n !== 0);
    kontrol('Z', 'geçici kayıtlar silindi: operasyon tabloları ve ekip yine boş', kalan.length === 0 && sorun.length === 0, kalan.map(([t, n]) => `${t}=${n}`).join(', ') + ' ' + sorun.join(' ; '));
    const nesne = (await liste('')).length, auth = (await http('/auth/v1/admin/users?per_page=200', { headers: bas(SERVIS) })).veri.users.length;
    kontrol('Z', 'geçici dosyalar ve giriş hesapları silindi', nesne === nesneOnce && auth === authOnce, `belge nesnesi ${nesne} · giriş hesabı ${auth}`);
    const fark = []; for (const t of KURULUM) if ((await ozet(t)) !== kurOnce[t]) fark.push(t);
    kontrol('Z', 'kurulum kayıtları korundu (içerik değişmedi)', fark.length === 0, fark.join(', '));
  }
}
const sonuc = { zaman: new Date().toISOString(), app: APP, api: API, gecen: R.filter(x => x.ok).length, kalan: R.filter(x => !x.ok).length, sonuc: R };
fs.writeFileSync(path.join(cikti, 'kullanim.json'), JSON.stringify(sonuc, null, 1));
console.log(`\nKULLANIM TESTİ: ${sonuc.gecen} geçti, ${sonuc.kalan} kaldı`);
process.exit(sonuc.kalan ? 1 : 0);
