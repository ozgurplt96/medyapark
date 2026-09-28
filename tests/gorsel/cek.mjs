// Görsel inceleme: aynı veri + aynı viewport ile ekran görüntüsü, yatay taşma
// ve JS hatası kaydı. Kullanım: node gorsel/cek.mjs <cikti-klasoru>
// Yalnız test ortamında çalışır (hedefDogrula).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { APP, hedefDogrula, girisYap, sql } from '../lib/ortam.mjs';

hedefDogrula();
const cikti = process.argv[2] || 'gorsel-cikti';
fs.mkdirSync(cikti, { recursive: true });
/* S14: çok kayıtlı ve uzun adlı sentetik veri (sonraki test koşusu temizler). */
if (!+sql(`select count(*) from customers where firma like 'S13T Kurum %'`))
  sql(`insert into customers (firma) select 'S13T Kurum ' || lpad(g::text,3,'0') from generate_series(1,600) g;
       insert into customers (firma, vergi_no, adres) values ('S13T İstanbul Şişe Çam Sanayi ve Ticaret Anonim Şirketi Uzun Unvanlı Bölge Müdürlüğü', '1111111111', 'Seyhan, Adana')`);
const UZUN = +sql(`select coalesce(max(id),0) from jobs where title like 'S13T Çok uzun adlı%'`);
const J = +sql('select id from jobs where sort=9301');
const K = +sql('select customer_id from jobs where sort=9301');
const OP = +sql('select min(id) from work_operations where job_id=' + J);

const EKRAN = [
  ['panelim', p => p.evaluate(() => go('workspace-home'))],
  ['isler_pano', p => p.evaluate(() => go('is-takibi'))],
  ['isler_liste', p => p.evaluate(async () => { await go('is-takibi'); if (typeof isTabGit === 'function') await isTabGit('liste'); })],
  ['is_detay', p => p.evaluate(id => workAc(id), J)],
  ['hafiza', p => p.evaluate(() => go('kurumlar'))],
  ['kurum_detay', p => p.evaluate(id => orgAc(id), K)],
  ['mecralar', p => p.evaluate(() => go('ws-mecralar'))],
  ['baski_montaj', p => p.evaluate(() => go('operasyon'))],
  ['muhasebe', p => p.evaluate(() => go('muhasebe'))],
  ['raporlar', p => p.evaluate(() => go('raporlar'))],
  ['rapor_baski', p => p.evaluate(([k, j]) => rpAc('baski', { kurum: k, isler: [j] }), [K, J])],
  ['m_yeni_is', p => p.evaluate(() => jobForm())],
  ['m_guncelleme', p => p.evaluate(id => qcAc({ jobId: id }), J)],
  ['m_operasyon', p => p.evaluate(([o, j]) => opForm(o, j), [OP, J])],
  ['m_yerlesim', p => p.evaluate(() => mForm({ hedefler: [] }))],
  ['secici_acik', async p => { await p.evaluate(() => jobForm()); await p.locator('#jc__ara').click(); await p.locator('#jc__ara').pressSequentially('kurum 01'); }],
  ['secici_uzun', async p => { await p.evaluate(() => jobForm()); await p.locator('#jc__ara').click(); await p.locator('#jc__ara').pressSequentially('istanbul'); }],
  ['filtre_aktif', p => p.evaluate(async () => { await go('is-takibi'); isTabYaz('liste'); try { sessionStorage.setItem('mp_is_filtre', JSON.stringify({ ...JSON.parse(sessionStorage.getItem('mp_is_filtre') || '{}'), acil: true, q: 'kampanya' })); } catch (e) {} await renderSection(); })],
  ['hata_form', async p => { await p.evaluate(() => jobForm()); await p.locator('#modal').getByRole('button', { name: 'Oluştur', exact: true }).click(); await p.locator('#mpDlgBg').waitFor(); }],
  ['bulunamadi', async p => { await p.evaluate(() => { location.hash = '#/is/987654321'; }); await p.waitForFunction(() => /bulunamad/.test(document.getElementById('content').innerText)); }],
  ['uzun_is', p => p.evaluate(id => id ? workAc(id) : go('is-takibi'), UZUN)],
  ['hareketler', p => p.evaluate(async () => { await go('workspace-home'); if (typeof hrGor === 'function') await hrGor('hareket'); })],
  ['ajandam', p => p.evaluate(async () => { await go('workspace-home'); ajandaGor('takvim'); })],
];
/* MP_VP="720x450,320x640" ile değiştirilebilir (200% yakınlaştırma ≈ 720px, WCAG yeniden akış 320px). */
const VP = process.env.MP_VP ? process.env.MP_VP.split(',').map(x => { const [w, h] = x.split('x').map(Number); return [String(w), w, h]; })
  : [['1440', 1440, 900], ['768', 768, 1024], ['390', 390, 844]];

const tarayici = await chromium.launch({ channel: 'chrome' });
const rapor = [];
for (const [vpAd, w, h] of VP) {
  const ctx = await tarayici.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const hatalar = [];
  page.on('pageerror', e => hatalar.push(e.message));
  page.on('console', m => { if (m.type() === 'error') hatalar.push('console: ' + m.text()); });
  await girisYap(page, 'uye');
  for (const [ad, ac] of EKRAN) {
    hatalar.length = 0;
    await page.evaluate(() => { const d = document.getElementById('mpDlgBg'); if (d) d.remove(); try { closeModal(); } catch (e) {} });
    await ac(page);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !document.querySelector('#content .muted') || !/Yükleniyor|okunuyor/.test(document.querySelector('#content').innerText.slice(0, 80)));
    const olcum = await page.evaluate(() => {
      const kok = document.querySelector('#modalBg.open #modal') || document.getElementById('content');
      /* Erişilebilir adı olmayan form denetimleri */
      const etiketsiz = [...kok.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(e => e.offsetParent !== null)
        .filter(e => !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.title)
        .map(e => e.id || e.name || e.type || e.tagName);
      /* Metin kontrastı (etkin zemin atalardan bulunur) */
      const rgb = c => { const v = (c.match(/[\d.]+/g) || []).map(Number); if (/^color\(srgb/.test(c)) return v.slice(0, 3).map(x => x * 255).concat(v.length > 3 ? [v[3]] : []); return v; };
      const lum = ([r, g, b]) => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const zemin = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; const v = rgb(c); if (v.length >= 3 && (v[3] === undefined || v[3] > 0.5)) return v; } return [255, 255, 255]; };
      const kotu = [];
      for (const el of kok.querySelectorAll('*')) {
        if (!el.childNodes.length || el.offsetParent === null) continue;
        const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
        if (!txt) continue;
        const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < 0.6) continue;
        if (el.closest('[disabled],.dis,.eslesmez')) continue;
        const f = rgb(cs.color), b = zemin(el);
        const L1 = lum(f), L2 = lum(b), cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const buyuk = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
        if (cr < (buyuk ? 3 : 4.5)) kotu.push(`${cr.toFixed(2)} ${cs.color}/${b.join(',')} "${txt.slice(0, 24)}"`);
      }
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, etiketsiz, kontrast: kotu };
    });
    await page.screenshot({ path: path.join(cikti, `${ad}_${vpAd}.png`) });
    rapor.push({ ekran: ad, vp: vpAd, tasma: olcum.sw > olcum.iw + 1 ? `${olcum.sw}>${olcum.iw}` : '', etiketsiz: olcum.etiketsiz, kontrast: olcum.kontrast,
      hatalar: [...hatalar].filter(x => !/Google Maps|maps\.googleapis|RefererNotAllowed/.test(x)) });
  }
  await ctx.close();
}
await tarayici.close();
fs.writeFileSync(path.join(cikti, '_ozet.json'), JSON.stringify(rapor, null, 1));
for (const r of rapor) if (r.tasma || r.hatalar.length) console.log('TAŞMA/HATA', r.vp, r.ekran, r.tasma, r.hatalar.join(' | '));
for (const r of rapor.filter(x => x.vp === VP[0][0])) {
  if (r.etiketsiz.length) console.log('ETİKETSİZ', r.ekran, r.etiketsiz.join(','));
  if (r.kontrast.length) console.log('KONTRAST', r.ekran, r.kontrast.length, '|', [...new Set(r.kontrast)].slice(0, 6).join(' ; '));
}
console.log('bitti:', rapor.length, 'görüntü');
