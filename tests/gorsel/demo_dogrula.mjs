// Demo yayını doğrulaması — SALT OKUNUR. Hiçbir kayıt yazmaz; yalnız oturum açar,
// ekranları gezer ve dosya indirir. Kullanım: node gorsel/demo_dogrula.mjs <cikti-klasoru> [beklenen-surum]
// Hedef yalnız demo adresidir (Halil'in canlı sistemi DEĞİL).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DEMO = 'https://ozgurplt96.github.io/medyapark-demo/admin.html';
const DEMO_API = 'mdeqpoiweggdjhvmgddw';                    // medyapark-test (ayrı Supabase projesi)
const cikti = process.argv[2] || 'demo-cikti';
const surum = process.argv[3] || '';
fs.mkdirSync(cikti, { recursive: true });

const tarayici = await chromium.launch({ channel: 'chrome' });
const ctx = await tarayici.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
const page = await ctx.newPage();
const hatalar = [], yazma = [];
page.on('pageerror', e => hatalar.push(e.message));
page.on('request', r => { const m = r.method(), u = r.url();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(m) && !/\/auth\/v1\/token/.test(u) && !/\/rest\/v1\/rpc\/(dashboard_stats|media_scope)/.test(u) && !/\/storage\/v1\/object\/sign\//.test(u)) yazma.push(`${m} ${u.replace(/\?.*/, '')}`); });
await page.goto(DEMO + '?t=' + Date.now());
await page.waitForFunction(() => typeof sb !== 'undefined' && typeof go === 'function');
const api = await page.evaluate(() => SUPABASE_URL);
if (!String(api).includes(DEMO_API)) throw new Error('Demo beklenen API\'ye bağlı değil: ' + api);
await page.evaluate(async () => { const r = await sb.auth.signInWithPassword({ email: 'dev@medyapark.local', password: 'medyapark-local-dev' }); if (r.error) throw new Error(r.error.message); });
await page.reload();
await page.waitForFunction(() => typeof ui !== 'undefined' && ui._me && ui._me.id && document.querySelector('#content .ekran'));
const sonuc = { api, surum: await page.evaluate(() => (document.querySelector('script[src*="panel.js"]') || {}).src.split('v=')[1]) };
if (surum && sonuc.surum !== surum) throw new Error(`Sürüm beklenen değil: ${sonuc.surum} ≠ ${surum}`);

/* Mecralar: ilk açılış */
await page.evaluate(() => { sessionStorage.removeItem('mp_medya'); go(isAdmin() && surfaceGet() !== 'workspace' ? 'listeler' : 'ws-mecralar'); });
await page.waitForFunction(() => ui._mdSonuc && document.querySelector('#mdGovde .md-sonuc') && !ui._mdYukleniyor);
sonuc.mecralar = await page.evaluate(() => { const st = mdDurum();
  return { hazir: st.hazir, bas: st.bas, bit: st.bit, gecmisGizle: st.gecmisGizle, secili: (document.querySelector('#mdHazirG button.on') || {}).textContent,
    durumlar: [...document.querySelectorAll('#mdDurumG button')].map(b => b.textContent.trim()), ozet: document.querySelector('.md-sonuc-h').innerText.replace(/\s+/g, ' ') }; });
/* Tek tıkla mecra sekmesi + ilk grubu aç */
await page.locator('#mdSiteG button').nth(1).click();
await page.evaluate(() => { const b = document.querySelector('#mdGovde .md-gt[aria-expanded="false"]'); if (b) b.click(); });
await page.waitForSelector('#mdGovde table.mtb');
sonuc.tablo = await page.evaluate(() => { const t = document.querySelector('#mdGovde table.mtb:not(.mtb-led)');
  return [...t.querySelectorAll('thead th')].slice(0, 3).map(e => [e.textContent.trim().slice(0, 12), Math.round(e.getBoundingClientRect().width)]); });
await page.screenshot({ path: path.join(cikti, 'demo_mecralar.png') });

/* Raporlar › tüm mecralar Excel: LED sayfaları */
await page.evaluate(() => rpAc('mecra'));
await page.waitForFunction(() => ui._rpTur === 'mecra' && ui._rpModel && !rpDurum().yukleniyor);
const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#rpXlsB').click()]);
await d.saveAs(path.join(cikti, 'demo_rapor_tum_mecralar.xlsx'));
sonuc.excel = await page.evaluate(async () => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await ui._rpSon.blob.arrayBuffer());
  return wb.worksheets.map(ws => ({ ad: ws.name, ilk: String(ws.getCell(3, 1).value), aylar: ws.getRow(3).values.slice(4, 7).map(String) })); });
/* Baskı & Montaj: üretim kalemi akışı, üç durum, detay (salt okunur) */
await page.evaluate(() => { opFiltreYaz({ donem: 'tum', from: '', to: '', type: '', kapsam: 'tum', q: '' }); go('operasyon'); });
await page.waitForSelector('.opk-r');
sonuc.operasyon = await page.evaluate(() => ({ ozet: document.querySelector('.sec-head .sub').innerText, kalem: document.querySelectorAll('.opk-r').length,
  cokAdimli: [...document.querySelectorAll('.opk-r')].filter(r => r.querySelectorAll('.opk-c').length > 1).length,
  eskiDurumSozcugu: /Devam ediyor|Bekliyor|Planlandı/.test(document.getElementById('content').innerText) }));
await page.locator('.opk-c').first().click();
await page.waitForSelector('#modalBg.open #opdDuzenle');
sonuc.operasyon.detay = await page.evaluate(() => ({ duzenle: !!document.getElementById('opdDuzenle'), formAlani: document.querySelectorAll('#modal input, #modal select, #modal textarea').length }));
await page.screenshot({ path: path.join(cikti, 'demo_operasyon.png') });
await page.locator('#opdDuzenle').click();
await page.waitForSelector('#modalBg.open #opSt');
sonuc.operasyon.durumlar = await page.locator('#opSt option').allTextContents();
sonuc.operasyon.uygulayan = await page.locator('#opSup option').allTextContents();
await page.evaluate(() => closeModal());
sonuc.hatalar = hatalar; sonuc.yazmaIstekleri = yazma;
await tarayici.close();
fs.writeFileSync(path.join(cikti, 'demo_dogrulama.json'), JSON.stringify(sonuc, null, 1));
console.log(JSON.stringify(sonuc, null, 1));
