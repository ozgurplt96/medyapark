// S19 kapanış — Baskı & Montaj akışı görsel kanıtı (liste, detay, formlar).
// Kullanım: node gorsel/s19_op.mjs <cikti-klasoru>   · Yalnız test ortamı; veri YAZMAZ.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { hedefDogrula, girisYap, sql } from '../lib/ortam.mjs';

hedefDogrula();
const cikti = process.argv[2] || 'gorsel-cikti';
fs.mkdirSync(cikti, { recursive: true });
const J = +sql('select id from jobs where sort=9301');
const kalemli = +sql(`select min(o.id) from work_operations o where o.job_id=${J} and o.operation_type='baski' and o.kalem_key is not null`);
const tarayici = await chromium.launch({ channel: 'chrome' });
const out = {};
for (const [vp, w, h] of [['1440', 1440, 900], ['390', 390, 844]]) {
  const page = await (await tarayici.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' })).newPage();
  const hata = []; page.on('pageerror', e => hata.push(e.message));
  await girisYap(page, 'uye');
  const cek = async ad => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(cikti, `${ad}_${vp}.png`) }); };
  await page.evaluate(() => { opFiltreYaz({ donem: 'tum', from: '', to: '', type: '', kapsam: 'aktif', q: '' }); go('operasyon'); });
  await page.waitForSelector('.opk-r, .empty');
  out['liste_' + vp] = await page.evaluate(() => ({ kalem: document.querySelectorAll('.opk-r').length, adim: document.querySelectorAll('.opk-c').length,
    gec: document.querySelectorAll('.opk-c.gec').length, tasma: document.documentElement.scrollWidth > innerWidth + 1, alt: document.querySelector('.sec-head .sub').innerText }));
  await cek('op_liste');
  await page.evaluate(id => opAc(id), kalemli); await page.waitForSelector('#modalBg.open #opdDuzenle'); await cek('op_detay');
  await page.locator('#opdDuzenle').click(); await page.waitForSelector('#modalBg.open #opSt'); await cek('op_duzenle');
  await page.evaluate(() => closeModal());
  await page.evaluate(id => opBagliEkle(id, 'montaj'), kalemli); await page.waitForSelector('#modalBg.open .op-oneri'); await cek('op_bagli_montaj');
  out['bagli_' + vp] = await page.evaluate(() => ({ is: document.getElementById('opJob').value, tur: document.getElementById('opT').value,
    yer: document.getElementById('opUnit').value || document.getElementById('opLoc').value, gizli: [...document.querySelectorAll('#modal [data-tur]')].filter(e => e.hidden).length,
    uyg: [...document.querySelectorAll('#opSup option')].map(o => o.textContent.trim()) }));
  await page.evaluate(() => closeModal());
  await page.evaluate(() => opForm(0)); await page.waitForSelector('#modalBg.open #opSt'); await cek('op_yeni');
  await page.evaluate(() => closeModal());
  await page.evaluate(id => workAc(id, { bolum: 'op' }), J); await page.waitForSelector('#wOps .w-op');
  await page.evaluate(() => document.getElementById('wOps').scrollIntoView({ block: 'start' })); await cek('is_detay_op');
  out['hata_' + vp] = hata;
  await page.close();
}
await tarayici.close();
console.log(JSON.stringify(out, null, 1));
