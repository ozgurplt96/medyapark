// Prova yığınında tek ekranı açıp durumunu döker (salt okunur yardımcı).
//   node prova/bak.mjs <uye|admin> <ekran> <cikti.png> [js-ifadesi]
import { chromium } from '@playwright/test';
process.env.MP_HEDEF = 'prova';
const { API, APP, hedefDogrula } = await import('../lib/ortam.mjs');
hedefDogrula();
const [, , kim, ekranAd, png, ifade] = process.argv;
const K = { admin: 'prova-yonetici@prova.local', uye: 'prova-uye@prova.local' };
const b = await chromium.launch({ channel: 'chrome' });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' })).newPage();
const hata = [];
page.on('console', m => { if (m.type() === 'error') hata.push(m.text().slice(0, 300)); });
page.on('pageerror', e => hata.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
page.on('response', r => { if (r.status() >= 400) hata.push(r.status() + ' ' + r.url().slice(0, 200)); });
await page.goto(`${APP}/admin`);
await page.waitForFunction(() => typeof sb !== 'undefined' && typeof go === 'function');
await page.evaluate(async ([e]) => { const r = await sb.auth.signInWithPassword({ email: e, password: 'prova-parola' }); if (r.error) throw new Error(r.error.message); }, [K[kim]]);
await page.reload();
await page.waitForFunction(() => typeof ui !== 'undefined' && ui._me && ui._me.id);
await page.waitForLoadState('networkidle');
await page.evaluate(s => go(s), ekranAd);
await page.waitForTimeout(4000);
if (png) await page.screenshot({ path: png });
const d = await page.evaluate(i => ({ bolum: ui.section, metin: document.getElementById('content').innerText.slice(0, 1500),
  nav: [...document.querySelectorAll('.side [onclick], .side a, aside [onclick]')].map(a => a.innerText.trim()).filter(Boolean).slice(0, 40),
  ek: i ? (0, eval)(i) : null }), ifade || '');
console.log(JSON.stringify({ hata, ...d }, null, 1));
await b.close();
