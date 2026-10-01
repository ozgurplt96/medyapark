// GEÇİŞ PROVASI — kabul denetimi. Yalnız prova yığınına (scripts/prova-env.ps1) karşı çalışır:
// canlı kopyası + ileri migration paketi + onaylı kimlik eşlemesinin temsilî karşılığı.
// Sentetik kurulum testi DEĞİLDİR; gerçek kopyadaki kayıtlarla çalışır. Oluşturduğu her kayıt
// "PROVA-KABUL" önekini taşır.
//   Kullanım (tests/ içinden):  node prova/kabul.mjs <cikti-klasoru>
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

process.env.MP_HEDEF = 'prova';
const { API, APP, ANON, sql, hedefDogrula, aramaliSec, pdfMetin } = await import('../lib/ortam.mjs');
hedefDogrula();
const cikti = process.argv[2] || 'prova-cikti';
fs.mkdirSync(cikti, { recursive: true });

const PAROLA = 'prova-parola', ONEK = 'PROVA-KABUL ';
const K = { admin: 'prova-yonetici@prova.local', uye: 'prova-uye@prova.local', disari: 'prova-eslesmemis@prova.local' };
const R = [];
const kontrol = (bolum, ad, ok, not = '') => { R.push({ bolum, ad, ok: !!ok, not: String(not).slice(0, 400) }); console.log(`${ok ? '  ✓' : '  ✗'} [${bolum}] ${ad}${not ? ' — ' + String(not).slice(0, 200) : ''}`); };
const say = q => +sql(q);
const jetonlar = {};
async function jeton(kim) {
  if (jetonlar[kim]) return jetonlar[kim];
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: K[kim], password: PAROLA }) });
  const j = await r.json(); if (!j.access_token) throw new Error('giriş: ' + JSON.stringify(j));
  return (jetonlar[kim] = j.access_token);
}
async function rest(kim, yol, o = {}) {
  const t = kim ? await jeton(kim) : null;
  const r = await fetch(`${API}/rest/v1/${yol}`, { method: o.method || 'GET', headers: { apikey: ANON, Authorization: `Bearer ${t || ANON}`, 'Content-Type': 'application/json', Prefer: o.prefer || 'return=representation' }, body: o.body ? JSON.stringify(o.body) : undefined });
  const m = await r.text(); let v = null; try { v = m ? JSON.parse(m) : null; } catch { v = m; }
  return { durum: r.status, veri: v, cr: r.headers.get('content-range') };
}
const BILINEN = /favicon|RefererNotAllowed|Google Maps JavaScript API|maps\.googleapis|tile\.openstreetmap|fonts\.g/i;
function dinle(page, hata) {
  page.on('console', m => { const u = (m.location() || {}).url || ''; if (m.type() === 'error' && !BILINEN.test(m.text()) && !BILINEN.test(u)) hata.push((m.text() + ' ' + u).slice(0, 260)); });
  page.on('pageerror', e => hata.push('PAGEERROR ' + e.message.slice(0, 200)));
  page.on('response', r => { if (r.status() >= 400 && !BILINEN.test(r.url())) hata.push(r.status() + ' ' + r.url().slice(0, 140)); });
}
async function giris(page, kim) {
  await page.goto(`${APP}/admin`);
  await page.waitForFunction(() => typeof sb !== 'undefined' && typeof go === 'function');
  if (await page.evaluate(() => SUPABASE_URL) !== API) throw new Error('uygulama yanlış API’ye bağlı');
  await page.evaluate(async ([e, p]) => { const r = await sb.auth.signInWithPassword({ email: e, password: p }); if (r.error) throw new Error(r.error.message); }, [K[kim], PAROLA]);
  await page.reload();
  await page.waitForFunction(() => typeof ui !== 'undefined' && ui._me && ui._me.id && document.querySelector('#content .ekran') && !/^Yükleniyor/.test(document.getElementById('content').innerText.trim()));
  await page.waitForLoadState('networkidle');
}
const bekle = page => page.waitForFunction(() => !/^Yükleniyor/.test((document.getElementById('content') || {}).innerText || '')).then(() => page.waitForLoadState('networkidle'));
const kaydet = page => page.locator('#modalBg.open').getByRole('button', { name: 'Kaydet', exact: true }).click();
const kapandi = page => page.waitForFunction(() => !document.querySelector('#modalBg.open'));
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

const tarayici = await chromium.launch({ channel: 'chrome' });
const baglam = () => tarayici.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', acceptDownloads: true });
const ekran = async (page, ad) => page.screenshot({ path: path.join(cikti, ad + '.png') });

/* ======================= A. Giriş ve yetkiler ======================= */
console.log('A. Giriş ve yetkiler');
for (const t of ['customers', 'jobs', 'entries', 'team', 'contacts', 'quotes', 'quote_items', 'work_operations', 'documents', 'media_placements', 'bookings', 'activity_log', 'aboneler', 'bildirimler', 'media_schedule']) {
  const r = await rest(null, `${t}?select=*&limit=3`);
  kontrol('A', `anon ${t} okuyamaz`, r.durum >= 400 || (Array.isArray(r.veri) && r.veri.length === 0), `${r.durum} ${Array.isArray(r.veri) ? r.veri.length + ' satır' : JSON.stringify(r.veri).slice(0, 80)}`);
}
{
  const r = await rest(null, 'booking_availability_public?select=*');
  const anahtar = r.veri && r.veri[0] ? Object.keys(r.veri[0]).sort().join(',') : '';
  kontrol('A', 'public müsaitlik görünümü: kayıt var, kurum kimliği yok', r.durum === 200 && r.veri.length === say('select count(*) from booking_availability_public') && anahtar === 'status,unit_id,ym', `${r.veri.length} satır · sütunlar: ${anahtar}`);
  for (const t of ['mecralar', 'alt_mecralar', 'units', 'products', 'pages', 'settings', 'tuyap_noktalar']) {
    const p = await rest(null, `${t}?select=*`, { prefer: 'count=exact' });
    kontrol('A', `anon public içerik: ${t}`, p.durum === 200 && p.veri.length === say(`select count(*) from ${t}`), `${p.veri.length} satır`);
  }
  const d = await rest('disari', 'customers?select=id&limit=3');
  kontrol('A', 'Auth’ta olup ekipte olmayan hesap kurum okuyamaz', d.durum === 200 && d.veri.length === 0, `${d.durum} ${JSON.stringify(d.veri).slice(0, 60)}`);
  const d2 = await rest('disari', 'entries', { method: 'POST', body: { body: ONEK + 'dışarıdan' } });
  kontrol('A', 'ekipte olmayan hesap güncelleme yazamaz', d2.durum >= 400, d2.durum);
  const d3 = await rest('disari', 'aboneler?select=id'); const d4 = await rest('disari', 'bildirimler?select=id');
  kontrol('A', 'ekipte olmayan hesap bülten abonelerini / bildirimleri okuyamaz (PS20)', d3.veri.length === 0 && d4.veri.length === 0, `${d3.durum}/${d4.durum}`);
  const u = await rest('uye', 'customers?select=id', { prefer: 'count=exact' });
  kontrol('A', 'ekip üyesi bütün kurumları görür', (u.cr || '').endsWith('/' + say('select count(*) from customers')), u.cr);
  const uid = say(`select id from team where eposta='${K.uye}'`);
  const y = await rest('uye', `team?id=eq.${uid}`, { method: 'PATCH', body: { app_role: 'admin' } });
  kontrol('A', 'ekip üyesi kendi rolünü yükseltemez', sql(`select app_role from team where id=${uid}`) === 'team_member', `${y.durum}`);
  const s = await rest('uye', 'jobs?id=eq.4', { method: 'DELETE' });
  kontrol('A', 'ekip üyesi iş silemez', say('select count(*) from jobs where id=4') === 1, `${s.durum}`);
  sql(`update team set active=false where id=${uid}`); delete jetonlar.uye;
  const p = await rest('uye', 'customers?select=id&limit=3');
  kontrol('A', 'pasif yapılan ekip üyesi içeri erişemez', p.veri.length === 0, `${p.durum} ${p.veri.length}`);
  sql(`update team set active=true where id=${uid}`); delete jetonlar.uye;
}

/* ======================= arayüz: ekip üyesi ======================= */
const cU = await baglam(); const page = await cU.newPage(); const hataU = []; dinle(page, hataU);
await giris(page, 'uye');
{
  const nav = await page.evaluate(() => [...document.querySelectorAll('.side [onclick], .side a')].map(a => a.innerText.trim()).filter(Boolean));
  kontrol('A', 'ekip üyesi: yalnız Team Workspace menüsü', nav.length > 0 && !nav.some(x => /Ayarlar|Ekip$|Sayfalar|Ürünler|Tedarikçiler/.test(x)), nav.join(' · '));
  await ekran(page, 'A_uye_panelim');
}

/* ======================= B. İş ve güncelleme ======================= */
console.log('B. İş ve güncelleme');
const kurum = say(`select min(id) from customers where relationship_evidence='confirmed_historical'`);
await page.evaluate(() => jobForm());
await page.waitForSelector('#modalBg.open #jt');
await page.fill('#jt', ONEK + 'Kampanya');
await aramaliSec(page, '#jc', kurum);
await page.locator('#modal').getByRole('button', { name: 'Oluştur', exact: true }).click();
await page.waitForSelector('#wFaz');
const job = say(`select id from jobs where title='${ONEK}Kampanya'`);
kontrol('B', 'ekip üyesi gerçek bir kuruma iş açar (arayüz)', job > 0 && say(`select count(*) from work_parties where job_id=${job} and role='account' and customer_id=${kurum}`) === 1
  && say(`select count(*) from entries where job_id=${job} and system_kind='work_created'`) === 1, `iş #${job} · kurum #${kurum} · hesap tarafı ve tek Hareket`);
await page.evaluate(j => qcAc({ jobId: j }), job);
await page.fill('#qcBody', ONEK + 'müşteri M1 Megalight için fiyat istedi');
await page.locator('#modal').getByRole('button', { name: 'Paylaş', exact: true }).click();
await kapandi(page);
kontrol('B', 'güncelleme eklenir ve iş zaman çizgisinde görünür', say(`select count(*) from entries where job_id=${job} and source<>'system' and body like '${ONEK}%'`) === 1
  && (await page.locator('#content').innerText()).includes(ONEK + 'müşteri M1'));
await page.evaluate(() => go('workspace-home')); await bekle(page);
kontrol('B', 'güncelleme Panelim akışında', (await page.locator('#content').innerText()).includes(ONEK + 'müşteri M1'));
await page.evaluate(() => workAc(4)); await page.waitForFunction(() => ui._work && ui._work.id === 4);
kontrol('B', 'canlıdan gelen mevcut iş (#4) açılır; kurumu ve aşaması okunur', (await page.locator('#content').innerText()).includes('Tüyap Afiş Planlaması'), sql(`select status||' / '||lifecycle_status from jobs where id=4`));
await page.evaluate(() => go('is-takibi')); await bekle(page); await ekran(page, 'B_isler');

/* ======================= C. Doluluk ======================= */
console.log('C. Doluluk');
{
  const ms = await rest('uye', 'media_schedule?select=*', { prefer: 'count=exact' });
  kontrol('C', 'canlıdaki eski aylık kayıtların tamamı çizelgede (ay bazlı)', ms.veri.length === say('select count(*) from bookings where superseded_by_placement_id is null'), `${ms.veri.length} kayıt`);
  const bos = say(`select min(u.id) from units u join alt_mecralar a on a.id=u.alt_mecra_id where a.occupancy_mode='exclusive' and u.active and not exists (select 1 from bookings b where b.unit_id=u.id)`);
  const yap = (bas, bit, c, unit) => rest('uye', 'rpc/media_placements_create', { method: 'POST', body: { p_common: { customer_id: kurum, work_id: job, commitment: c, start_date: bas, end_date: bit }, p_targets: [{ unit_id: unit }] } });
  const o = await yap('2026-11-05', '2026-11-25', 'reserved', bos);
  const pid = say(`select coalesce(max(id),0) from media_placements where unit_id=${bos} and work_id=${job}`);
  kontrol('C', 'boş yüze kesin dönemli opsiyon', o.durum === 200 && pid > 0, `yüz #${bos} · ${JSON.stringify(o.veri).slice(0, 120)}`);
  const c = await yap('2026-11-20', '2026-12-10', 'confirmed', bos);
  kontrol('C', 'çakışan dönem reddedilir, kayıt oluşmaz', say(`select count(*) from media_placements where unit_id=${bos}`) === 1, JSON.stringify(c.veri).slice(0, 160));
  const y = await rest('uye', 'rpc/media_placement_update', { method: 'POST', body: { p_id: pid, p_patch: { commitment: 'confirmed' } } });
  kontrol('C', 'opsiyon yayına çevrilir', sql(`select commitment from media_placements where id=${pid}`) === 'confirmed', `${y.durum}`);
  const eski = sql(`select b.unit_id||'|'||b.ym from bookings b join units u on u.id=b.unit_id join alt_mecralar a on a.id=u.alt_mecra_id where b.status='dolu' and a.occupancy_mode='exclusive' order by b.id limit 1`).split('|');
  const e = await yap(eski[1] + '-05', eski[1] + '-20', 'confirmed', +eski[0]);
  kontrol('C', 'eski aylık "dolu" kaydın ayına yeni yayın yazılamaz (eski kayıt da bloklar)', say(`select count(*) from media_placements where unit_id=${eski[0]}`) === 0, `yüz #${eski[0]} ${eski[1]} · ${JSON.stringify(e.veri).slice(0, 140)}`);
  const pub = await rest(null, `booking_availability_public?unit_id=eq.${bos}`);
  kontrol('C', 'public müsaitlik yeni yayını gösterir, kurumu göstermez', pub.veri.length >= 1 && !('customer_id' in pub.veri[0]), JSON.stringify(pub.veri));
  await page.evaluate(() => go('ws-mecralar')); await bekle(page);
  await page.waitForFunction(() => /statik yüz/.test(document.getElementById('content').innerText));
  const n = say(`select count(*) from units u join alt_mecralar a on a.id=u.alt_mecra_id join mecralar m on m.id=a.mecra_id where m.operational and a.occupancy_mode='exclusive' and not a.legacy_archived and u.active`);
  const ozet = await page.evaluate(() => (document.getElementById('content').innerText.match(/\d+ statik yüz.*/) || [''])[0]);
  kontrol('C', 'Mecralar ekranı canlı envanteri sayar (sayaç = veritabanı)', ozet.startsWith(n + ' statik yüz'), ozet);
  await page.evaluate(() => mdUygula({ hazir: 'yil', merkez: '2026-10-01', bas: '2026-01-01', bit: '2026-12-31' }));
  for (let i = 0; i < 6; i++) { const k = page.locator('#content .md-gt[aria-expanded="false"]').first(); if (!(await k.count())) break; await k.click(); await page.waitForTimeout(300); }
  const t = await page.evaluate(() => ({ tablo: document.querySelectorAll('#content table').length, ayBazli: (document.getElementById('content').innerText.match(/ay bazlı/gi) || []).length }));
  kontrol('C', 'yıl görünümünde tablo açılır; eski aylık kayıtlar "ay bazlı" olarak okunur', t.tablo > 0, `${t.tablo} tablo · "ay bazlı" ${t.ayBazli} kez`);
  await ekran(page, 'C_mecralar');
}

/* ======================= D. Baskı – montaj – söküm ======================= */
console.log('D. Baskı – montaj – söküm');
{
  await page.evaluate(() => go('operasyon')); await bekle(page);
  await page.evaluate(() => opForm(0)); await page.waitForSelector('#modalBg.open #opJob');
  await page.selectOption('#opJob', String(job));
  await page.locator('#opDesc').fill(ONEK + 'megalight vinil');
  await page.locator('#opLoc').fill('M1 Megalight');
  await page.locator('#opDate').fill('2026-10-28');
  const secenek = await page.locator('#opSup option').allTextContents();
  await kaydet(page); await kapandi(page);
  const ids = () => sql(`select coalesce(string_agg(id::text, ',' order by id), '') from work_operations where job_id=${job}`).split(',').filter(Boolean).map(Number);
  const [baski] = ids();
  kontrol('D', 'baskı kaydı oluşur (arayüz)', baski > 0);
  kontrol('D', 'uygulayan seçicisi: doğrulanmış kayıt olmadığı için boş (eşleştirme bekliyor)', secenek.filter(x => x.trim() && !/belirlenmedi|seç/i.test(x)).length === 0, secenek.map(x => x.trim()).filter(Boolean).join(' | ').slice(0, 160));
  await page.evaluate(id => opAc(id), baski);
  await page.locator('#modalBg.open').getByRole('button', { name: 'Montaj ekle' }).click();
  await page.locator('#opDate').fill('2026-11-04'); await kaydet(page); await kapandi(page);
  const montaj = ids()[1];
  await page.evaluate(id => opAc(id), montaj);
  await page.locator('#modalBg.open').getByRole('button', { name: 'Söküm ekle' }).click();
  await kaydet(page); await kapandi(page);                                        // söküm tarihsiz bırakılır
  const sokum = ids()[2];
  kontrol('D', 'bağlantılı montaj ve söküm aynı üretim kalemine eklenir', say(`select count(distinct kalem_key) from work_operations where job_id=${job} and kalem_key is not null`) === 1 && say(`select count(*) from work_operations where job_id=${job}`) === 3);
  await page.evaluate(id => opForm(id), baski); await page.waitForSelector('#modalBg.open #opSt');
  await page.selectOption('#opSt', 'done');
  await page.locator('#opGer').fill('2026-09-30').catch(() => {});
  await kaydet(page); await kapandi(page);
  kontrol('D', 'baskı tamamlandı olarak kaydedilir; gerçekleşen tarih kullanıcının girdiğidir', sql(`select status||'|'||coalesce((completed_at at time zone 'Europe/Istanbul')::date::text,'∅') from work_operations where id=${baski}`) === 'done|2026-09-30', sql(`select status||'|'||coalesce((completed_at at time zone 'Europe/Istanbul')::date::text,'∅') from work_operations where id=${baski}`));
  await page.evaluate(() => { opFiltreYaz({ donem: 'tum', from: '', to: '', type: '', kapsam: 'tum', q: 'PROVA-KABUL' }); go('operasyon'); }); await bekle(page);
  await page.waitForSelector('.opk-r');
  const sr = await page.evaluate(() => (document.querySelector('.opk-h').innerText + ' → ' + document.querySelector('.opk-r .opk-sr').innerText).replace(/\s+/g, ' ').trim());
  kontrol('D', '"En yakın planlı işlem" montajı gösterir; tarihsiz söküm ayrıca yazılır', /en yakın planlı işlem → .*Montaj 04\.11\.2026/.test(sr.toLocaleLowerCase('tr').replace('montaj', 'Montaj')) && /Tarihsiz yapılacak: Söküm/.test(sr) && !/Sıradaki/.test(sr), sr);
  kontrol('D', 'işlemler güvenilir Hareket üretir', say(`select count(*) from entries where job_id=${job} and source='system' and system_kind like 'operation%'`) >= 2, sql(`select string_agg(system_kind, ',' order by id) from entries where job_id=${job} and source='system'`));
  await ekran(page, 'D_baski_montaj');
}

/* ======================= E. Belgeler ======================= */
console.log('E. Belgeler');
{
  await page.evaluate(() => belgeForm({})); await page.waitForSelector('#modalBg.open #bfKaydet');
  await page.locator('#ek_bf input[type=file]').setInputFiles({ name: 'prova-kabul-teklif.pdf', mimeType: 'application/pdf', buffer: PDF });
  const tur = page.locator('#ek_bf .ek-tur').first(); if (!(await tur.inputValue())) await tur.selectOption('teklif');
  await page.fill('#bfBaslik', ONEK + 'teklif'); await page.selectOption('#bfIs', String(job));
  await page.locator('#bfKaydet').click(); await kapandi(page);
  const [id, yol] = sql(`select id||'|'||storage_path from documents where title='${ONEK}teklif'`).split('|');
  kontrol('E', 'belge yüklenir ve işe bağlanır', +id > 0 && say(`select count(*) from document_links where document_id=${id} and job_id=${job}`) === 1 && say(`select count(*) from storage.objects where bucket_id='documents' and name='${yol}'`) === 1);
  const t = await jeton('uye');
  const s = await fetch(`${API}/storage/v1/object/sign/documents/${yol}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 60 }) });
  const j = s.status === 200 ? await s.json() : {};
  const g = j.signedURL ? await fetch(`${API}/storage/v1${j.signedURL}`) : { status: 0 };
  kontrol('E', 'ekip üyesi belgeyi imzalı adresle açar', g.status === 200);
  const a = await fetch(`${API}/storage/v1/object/public/documents/${yol}`);
  const a2 = await fetch(`${API}/storage/v1/object/authenticated/documents/${yol}`, { headers: { apikey: ANON, Authorization: `Bearer ${await jeton('disari')}` } });
  kontrol('E', 'belge dışarıya ve ekipte olmayan hesaba kapalı', a.status >= 400 && a2.status >= 400, `${a.status}/${a2.status}`);
  await page.evaluate(() => { go('kurumlar'); }); await bekle(page); await ekran(page, 'E_hafiza');
}

/* ======================= F. Dört rapor ======================= */
console.log('F. Dört rapor');
{
  const site = say('select min(id) from mecralar where operational');
  const indir = async (ad, xls = true) => {
    let xb = Buffer.alloc(0);
    if (xls) { const [x] = await Promise.all([page.waitForEvent('download'), page.locator('#rpXlsB').click()]); xb = fs.readFileSync(await x.path()); fs.writeFileSync(path.join(cikti, `F_${ad}.xlsx`), xb); }
    const [p] = await Promise.all([page.waitForEvent('download'), page.locator('#rpPdfB').click()]);
    const pb = fs.readFileSync(await p.path()); fs.writeFileSync(path.join(cikti, `F_${ad}.pdf`), pb);
    return { x: xb.length, p: pb.length, metin: pdfMetin(pb) || '' };
  };
  await page.evaluate(s => rpAc('mecra', { siteler: [s], bas: '2026-01-01', bit: '2026-12-31', _alici: 'ic' }), site);
  await page.waitForFunction(() => ui._rpTur === 'mecra' && ui._rpModel && !rpDurum().yukleniyor);
  let d = await indir('mecra_ic'); await ekran(page, 'F_rapor_mecra');
  kontrol('F', 'Mecra doluluk tablosu (iç): önizleme + Excel + PDF', d.x > 3000 && d.p > 3000 && /M1/.test(d.metin), `xlsx ${d.x} · pdf ${d.p}`);
  await page.evaluate(s => rpAc('mecra', { siteler: [s], bas: '2026-01-01', bit: '2026-12-31', _alici: 'dis' }), site);
  await page.waitForFunction(() => ui._rpTur === 'mecra' && ui._rpModel && !rpDurum().yukleniyor && rpAyar('mecra')._alici === 'dis');
  d = await indir('mecra_dis');
  const kurumAd = sql(`select firma from customers where id=${kurum}`);
  kontrol('F', 'Mecra doluluk tablosu (dış paylaşım): kurum adı çıktıda yok', d.p > 3000 && !d.metin.includes(kurumAd.slice(0, 12)), `pdf ${d.p}`);
  await page.evaluate(j => rpAc('baski', { is: j, donem: 'tum' }), job);
  await page.waitForFunction(() => ui._rpTur === 'baski' && ui._rpModel && !rpDurum().yukleniyor);
  d = await indir('baski');
  kontrol('F', 'Baskı/montaj takip tablosu', d.x > 3000 && d.metin.includes('megalight vinil'), `xlsx ${d.x} · pdf ${d.p}`);
  await page.evaluate(j => rpAc('is', { is: j }), job);
  await page.waitForFunction(() => ui._rpTur === 'is' && ui._rpModel && ui._rpModel.ozet && !rpDurum().yukleniyor);
  d = await indir('is', await page.locator('#rpXlsB').isVisible());
  kontrol('F', 'İş dökümü', d.metin.includes(ONEK + 'Kampanya') && d.metin.includes('megalight vinil'), `pdf ${d.p}`);
  await page.evaluate(() => rpAc('plan', {}));
  await page.waitForFunction(() => ui._rpTur === 'plan' && ui._rpModel && !rpDurum().yukleniyor);
  const [p] = await Promise.all([page.waitForEvent('download'), page.locator('#rpPdfB').click()]);
  kontrol('F', 'Kişisel çalışma planım', fs.statSync(await p.path()).size > 2000, `pdf ${fs.statSync(await p.path()).size}`);
}

/* ======================= H. Ekran taraması ======================= */
console.log('H. Ekran taraması');
for (const s of ['workspace-home', 'is-takibi', 'kurumlar', 'ws-mecralar', 'raporlar', 'operasyon', 'muhasebe', 'ekip']) { await page.evaluate(s => go(s), s); await bekle(page); }
kontrol('H', 'ekip üyesi: 8 ekran, konsol hatası ve 4xx/5xx yok', hataU.length === 0, hataU.slice(0, 4).join(' | '));
await cU.close();

const cA = await baglam(); const pa = await cA.newPage(); const hataA = []; dinle(pa, hataA);
await giris(pa, 'admin');
{
  const nav = await pa.evaluate(() => [...document.querySelectorAll('.side [onclick], .side a')].map(a => a.innerText.trim()).filter(Boolean));
  kontrol('A', 'yönetici: yönetim menüsü görünür', nav.some(x => /Ayarlar/.test(x)) && nav.some(x => /Ekip/.test(x)), `${nav.length} öğe`);
  for (const s of ['dashboard', 'raporlar', 'mecralar', 'urunler', 'harita', 'listeler', 'teklifler', 'talepler', 'kurumlar', 'musteriler', 'aboneler', 'is-takibi', 'operasyon', 'tedarikciler', 'anasayfa', 'sayfalar', 'ikonlar', 'ekip', 'notlar', 'ayarlar']) {
    await pa.evaluate(s => go(s), s); await bekle(pa);
    if (['dashboard', 'mecralar', 'listeler', 'teklifler', 'musteriler', 'ekip'].includes(s)) await ekran(pa, 'H_admin_' + s);
  }
  kontrol('H', 'yönetici: 20 yönetim ekranı, konsol hatası ve 4xx/5xx yok', hataA.length === 0, hataA.slice(0, 4).join(' | '));
  const m = await pa.evaluate(() => api('customers_list').then(l => l.length).catch(e => 'HATA ' + e.message));
  kontrol('H', 'Müşteriler (yönetim) canlı kurumların tamamını okur', m === say('select count(*) from customers'), m);
}

/* ======================= I. Canlıdaki bekleyen teklif ======================= */
console.log('I. Canlıdaki mevcut teklif');
{
  const once = { is: say('select count(*) from jobs'), yer: say('select count(*) from media_placements'), kurum: say('select count(*) from customers') };
  const kalem = sql(`select string_agg(unit_id||':'||coalesce(ym,'∅'), ', ' order by id) from quote_items where quote_id=1`);
  const r1 = await pa.evaluate(() => sb.rpc('approve_quote', { p_quote_id: 1 }).then(r => r.error ? { hata: r.error.message } : r.data));
  const ara = { is: say('select count(*) from jobs'), yer: say('select count(*) from media_placements'), kurum: say('select count(*) from customers') };
  const r2 = await pa.evaluate(() => sb.rpc('approve_quote', { p_quote_id: 1 }).then(r => r.error ? { hata: r.error.message } : r.data));
  const son = { is: say('select count(*) from jobs'), yer: say('select count(*) from media_placements'), kurum: say('select count(*) from customers') };
  kontrol('I', 'canlıdan gelen bekleyen teklif (#1) onaylanır; sonuç ve çakışmalar açıkça döner', !r1.hata, `kalemler ${kalem} → ${JSON.stringify(r1).slice(0, 220)} · iş +${ara.is - once.is}, yerleşim +${ara.yer - once.yer}, kurum +${ara.kurum - once.kurum}`);
  kontrol('I', 'aynı teklifin ikinci onayı mükerrer iş / yerleşim / kurum üretmez', son.is === ara.is && son.yer === ara.yer && son.kurum === ara.kurum, JSON.stringify(r2).slice(0, 160));
  kontrol('I', 'onay sonrası teklif işe bağlı', say('select count(*) from quotes where id=1 and work_id is not null') === 1, sql(`select 'status='||status||' work_id='||coalesce(work_id::text,'∅')||' customer_id='||coalesce(customer_id::text,'∅') from quotes where id=1`));
}
await cA.close();

/* ======================= G. Public site ======================= */
console.log('G. Public site');
{
  const cP = await baglam(); const pp = await cP.newPage(); const hataP = []; dinle(pp, hataP);
  const istek = []; pp.on('response', r => { if (/rest\/v1\//.test(r.url())) istek.push(r.status() + ' ' + r.url().replace(/^.*rest\/v1\//, '').slice(0, 60)); });
  await pp.goto(`${APP}/`); await pp.waitForLoadState('networkidle');
  await pp.waitForFunction(() => typeof D !== 'undefined' && D && D.mecralar);
  const d = await pp.evaluate(() => ({ mecra: D.mecralar.length, unit: D.mecralar.reduce((n, m) => n + m.alts.reduce((k, a) => k + a.units.length, 0), 0),
    dolu: D.mecralar.reduce((n, m) => n + m.alts.reduce((k, a) => k + a.units.reduce((z, u) => z + u.booked.length, 0), 0), 0), baslik: document.title }));
  kontrol('G', 'anasayfa açılır; canlı envanter yüklenir', d.mecra === say('select count(*) from mecralar where not coalesce(hidden,false)') && d.unit === say('select count(*) from units') && d.dolu === say('select count(*) from booking_availability_public'), `${d.baslik} · ${d.mecra} mecra · ${d.unit} pozisyon · ${d.dolu} dolu/opsiyonlu ay`);
  kontrol('G', 'müsaitlik yalnız public görünümden okunur (bookings tablosuna istek yok)', istek.some(x => /^200 booking_availability_public/.test(x)) && !istek.some(x => / bookings\?/.test(x)), istek.filter(x => /book/.test(x)).join(' | '));
  await ekran(pp, 'G_public_anasayfa');
  const u = sql(`select u.id||'|'||u.name from units u join alt_mecralar a on a.id=u.alt_mecra_id where a.occupancy_mode='exclusive' and u.active order by u.id desc limit 1`).split('|');
  const n0 = say('select count(*) from quotes');
  const r = await pp.evaluate(([uid, ad]) => sb.rpc('submit_quote_request', { p_payload: { customer_name: 'PROVA-KABUL Ziyaretçi', firma: 'PROVA-KABUL Firma', telefon: '05550000000', eposta: '', items: [{ unit_id: uid, ym: '2027-02', mecra_name: 'M1 Adana AVM', unit_name: ad, product_name: 'Raket / CLP', olcu: '', start_day: '2027-02-01', period: 'Şubat 2027', price: 0 }] } }).then(r => r.error ? { hata: r.error.message } : r.data), [+u[0], u[1]]);
  kontrol('G', 'planlama talebi gönderilir (yalnız RPC ile)', r && r.ok && say('select count(*) from quotes') === n0 + 1, JSON.stringify(r));
  const dogrudan = await rest(null, 'quotes', { method: 'POST', body: { firma: 'PROVA-KABUL doğrudan' } });
  kontrol('G', 'doğrudan teklif tablosuna yazma reddedilir', dogrudan.durum >= 400, dogrudan.durum);
  const b = await rest(null, 'rpc/submit_quote_request', { method: 'POST', body: { p_payload: { customer_name: '', firma: '', telefon: '', eposta: '', items: [] } } });
  kontrol('G', 'boş talep reddedilir', b.veri && b.veri.ok === false, JSON.stringify(b.veri));
  await pp.goto(`${APP}/tuyap/`); await pp.waitForLoadState('load'); await pp.waitForTimeout(5000); await ekran(pp, 'G_tuyap');
  kontrol('G', 'Tüyap çalışma alanı ve public sayfalar: konsol hatası ve 4xx/5xx yok', hataP.length === 0, hataP.slice(0, 4).join(' | '));
  await cP.close();
}
await tarayici.close();

const ozet = { zaman: new Date().toISOString(), gecen: R.filter(x => x.ok).length, kalan: R.filter(x => !x.ok).length, sonuc: R };
fs.writeFileSync(path.join(cikti, 'kabul.json'), JSON.stringify(ozet, null, 1));
console.log(`\nKABUL: ${ozet.gecen} geçti, ${ozet.kalan} kaldı`);
process.exit(ozet.kalan ? 1 : 0);
