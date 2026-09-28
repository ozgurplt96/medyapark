// Sprint 13 — test ortamı yardımcıları.
// Tek hedef: scripts/test-env.ps1'in kurduğu atılabilir yığın.
// Yazan her test ÖNCE `hedefDogrula()` çağırır; hedef bu değilse durur.
import { execFileSync } from 'node:child_process';

export const API = process.env.MP_TEST_API || 'http://127.0.0.1:56321';
export const APP = process.env.MP_TEST_APP || 'http://localhost:5520';
export const DB_KONTEYNER = 'supabase_db_mptest';
export const ANON = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
export const PAROLA = 's13-test-parola';
export const KULLANICI = {
  admin: 's13-admin@test.local', uye: 's13-uye@test.local', uye2: 's13-uye2@test.local',
  pasif: 's13-pasif@test.local', disari: 's13-disari@test.local',
};
/* Sabit referans tarih: "bugün"e bağlı olmayan senaryolar bunu kullanır. */
export const REF = '2027-03-01';

let _dogrulandi = false;
export function hedefDogrula() {
  if (_dogrulandi) return;
  const u = new URL(API);
  if (!['127.0.0.1', 'localhost'].includes(u.hostname) || u.port !== '56321')
    throw new Error(`Test hedefi reddedildi: ${API} (yalnız 127.0.0.1:56321)`);
  if (!/^http:\/\/localhost:5520\/?$/.test(APP)) throw new Error(`Uygulama hedefi reddedildi: ${APP}`);
  const isaret = sql(`select coalesce(shobj_description((select oid from pg_database where datname=current_database()),'pg_database'),'')`);
  if (isaret !== 'medyapark-test-ortami') throw new Error('Test DB işareti yok — çalışma DB\'si olabilir, durduruldu.');
  _dogrulandi = true;
}

/* Test DB'sinde postgres olarak SQL (yalnız doğrulama ve teste ait temizlik). */
export function sql(q) {
  return execFileSync('docker', ['exec', '-i', DB_KONTEYNER, 'psql', '-U', 'postgres', '-d', 'postgres', '-qtA', '-v', 'ON_ERROR_STOP=1'],
    { input: q, encoding: 'utf8' }).trim();
}

const _jeton = {};
export async function jeton(kim) {
  if (!kim) return null;
  if (_jeton[kim]) return _jeton[kim];
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: KULLANICI[kim], password: PAROLA }) });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Giriş başarısız: ${kim} ${JSON.stringify(j)}`);
  return (_jeton[kim] = j.access_token);
}
function baslik(t, ek) { return { apikey: ANON, Authorization: `Bearer ${t || ANON}`, ...(ek || {}) }; }

/* PostgREST çağrısı: {durum, veri}. */
export async function rest(kim, yol, o = {}) {
  const t = await jeton(kim);
  const r = await fetch(`${API}/rest/v1/${yol}`, { method: o.method || 'GET',
    headers: baslik(t, { 'Content-Type': 'application/json', Prefer: o.prefer || 'return=representation' }),
    body: o.body ? JSON.stringify(o.body) : undefined });
  const metin = await r.text(); let veri = null; try { veri = metin ? JSON.parse(metin) : null; } catch { veri = metin; }
  return { durum: r.status, veri };
}
export const rpc = (kim, ad, govde) => rest(kim, `rpc/${ad}`, { method: 'POST', body: govde || {} });

export async function depo(kim, yol, o = {}) {
  const t = await jeton(kim);
  const r = await fetch(`${API}/storage/v1/${yol}`, { method: o.method || 'GET',
    headers: baslik(t, o.tip ? { 'Content-Type': o.tip } : { 'Content-Type': 'application/json' }),
    body: o.govde });
  const metin = await r.text(); let veri = null; try { veri = JSON.parse(metin); } catch { veri = metin; }
  return { durum: r.status, veri };
}

/* ---- Regresyon paketinin kendi verisi ----
   Testlerin oluşturduğu her kayıt ya "S13T " önekli başlık taşır ya da
   sentetik "S13 Regresyon Kurumu"na bağlıdır. Gerçek/örnek veriye
   dokunulmaz; temizlik yalnız bu işaretli satırları siler. */
export const ONEK = 'S13T ';
export const kurumId = () => +sql(`select id from customers where firma='S13 Regresyon Kurumu'`);
export const teamId = kim => +sql(`select id from team where eposta='${KULLANICI[kim]}'`);

export function temizle() {
  hedefDogrula();
  sql(`
    with j as (select id from jobs where title like 'S13T %'),
         d as (select id from documents where title like 'S13T%' or original_name like 's13t-%'),
         p as (select id from media_placements where customer_id=(select id from customers where firma='S13 Regresyon Kurumu'))
    delete from entries where job_id in (select id from j) or document_id in (select id from d)
       or media_placement_id in (select id from p) or body like 'S13T %';
    delete from document_links where document_id in (select id from documents where title like 'S13T%' or original_name like 's13t-%');
    delete from documents where title like 'S13T%' or original_name like 's13t-%';
    delete from media_placements where customer_id=(select id from customers where firma='S13 Regresyon Kurumu');
    delete from work_operations where job_id in (select id from jobs where title like 'S13T %');
    delete from jobs where title like 'S13T %';
    update jobs set primary_contact_id=null where primary_contact_id in (select id from contacts where name like 'S13T %');
    delete from entries where contact_id in (select id from contacts where name like 'S13T %');
    delete from contact_affiliations where contact_id in (select id from contacts where name like 'S13T %');
    delete from contacts where name like 'S13T %';
    delete from customers where firma like 'S13T %';
    delete from suppliers where firma like 'S13T%';
    delete from products where name like 'S13T%';
    delete from pages where slug like 's13t%';
    delete from notes where konu like 'S13T%';
    update team set active=true, app_role='team_member', seviye='uye', telefon=null where eposta='s13-uye2@test.local';`);
}

/* Verilen dönemin TAMAMINDA boş, satışta, statik (münhasır) yüzler. */
export function bosYuzeyler(n, bas, bit) {
  const s = sql(`select string_agg(id::text, ',' order by id) from (
    select u.id from units u join alt_mecralar a on a.id=u.alt_mecra_id join mecralar m on m.id=a.mecra_id
     where m.operational and coalesce(a.occupancy_mode,'exclusive')='exclusive' and u.active
       and not exists (select 1 from media_placements p where p.unit_id=u.id and p.commitment<>'cancelled'
                        and p.start_date<='${bit}' and coalesce(p.end_date,'9999-12-31')>='${bas}')
     order by u.id limit ${n}) x`);
  const ids = s ? s.split(',').map(Number) : [];
  if (ids.length < n) throw new Error(`Yeterli boş yüzey yok (${ids.length}/${n})`);
  return ids;
}

/* API üzerinden (ürünün kendi RPC'siyle) iş oluşturur. */
export async function isOlustur(kim, baslik, ek = {}) {
  const r = await rpc(kim, 'job_create', { p_job: { title: ONEK + baslik, status: 'temas_takip', customer_id: kurumId(), ...ek }, p_followers: [] });
  if (r.durum >= 300) throw new Error('job_create: ' + JSON.stringify(r.veri));
  return +(r.veri.id ?? r.veri);
}

/* S14: kurum seçimleri aranabilir seçicidir; kullanıcı gibi yazıp seçer.
   `sec` gizli <select>'in seçicisidir (ör. '#jc'). */
export async function aramaliSec(page, sec, deger) {
  const id = sec.replace(/^#/, '');
  const ad = await page.evaluate(([s, v]) => {
    const o = [...document.querySelector(s).options].find(x => x.value === String(v)); return o ? o.textContent.trim() : null; }, [sec, deger]);
  if (!ad) throw new Error(`${sec} içinde ${deger} yok`);
  const kutu = page.locator(`#${id}__ara`);
  await kutu.click();
  await kutu.fill(ad);
  await page.locator(`#${id}__ara_l li[role=option]`).filter({ hasText: ad }).first().click();
  await expectDeger(page, sec, String(deger));
}
async function expectDeger(page, sec, v) {
  await page.waitForFunction(([s, x]) => document.querySelector(s).value === x, [sec, v]);
}

/* Açık onay/uyarı penceresi (mpDlg). */
export const dlg = page => page.locator('#mpDlgBg .mpdlg');

/* Tarayıcıda test kullanıcısıyla oturum. Sabit bekleme yok: panelin
   kimliği yüklendiği gözlenebilir durumu (ui._me) beklenir. */
export async function girisYap(page, kim) {
  hedefDogrula();
  await page.goto(`${APP}/admin`);
  await page.waitForFunction(() => typeof sb !== 'undefined' && typeof go === 'function');
  const url = await page.evaluate(() => SUPABASE_URL);
  if (!String(url).includes('127.0.0.1:56321')) throw new Error(`Uygulama yanlış API'ye bağlı: ${url}`);
  await page.evaluate(async ([e, p]) => {
    const r = await sb.auth.signInWithPassword({ email: e, password: p }); if (r.error) throw new Error(r.error.message);
  }, [KULLANICI[kim], PAROLA]);
  await page.reload();
  await page.waitForFunction(() => typeof ui !== 'undefined' && ui._me && ui._me.id && document.getElementById('content') && document.getElementById('ttl'));
  /* Açılış ekranı da tamamlanmış olmalı: test kendi gezinmesini açılışın
     go() çağrısından ÖNCE başlatırsa, ekran yarışı koruması (doğru olarak)
     sonraki açılış ekranını kazandırır. */
  await page.waitForFunction(() => history.state && history.state.mp && document.querySelector('#content .ekran')
    && !/^Yükleniyor/.test(document.getElementById('content').innerText.trim()));
  await page.waitForLoadState('networkidle');
}
