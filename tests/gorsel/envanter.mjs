// Görsel envanter: ana ekranlarda başlık/gövde/yardımcı metin boyutları, kontrol
// yükseklikleri, kart sınırları ve klavye odağı halkası. Tasarım değişkenlerinin
// gerçekten uygulandığını ÖLÇEREK gösterir. Kullanım: node gorsel/envanter.mjs <cikti.json>
// Yalnız test ortamında çalışır; veri yazmaz.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { hedefDogrula, girisYap, sql } from '../lib/ortam.mjs';

hedefDogrula();
const J = +sql('select id from jobs where sort=9301');
const EKRAN = [
  ['panelim', p => p.evaluate(() => go('workspace-home'))],
  ['isler_pano', p => p.evaluate(() => go('is-takibi'))],
  ['isler_liste', p => p.evaluate(async () => { await go('is-takibi'); if (typeof isTabGit === 'function') await isTabGit('liste'); })],
  ['is_detay', p => p.evaluate(id => workAc(id), J)],
  ['hafiza', p => p.evaluate(() => go('kurumlar'))],
  ['mecralar', p => p.evaluate(() => go('ws-mecralar'))],
  ['raporlar', p => p.evaluate(() => go('raporlar'))],
  ['rapor_mecra', p => p.evaluate(() => rpAc('mecra'))],
  ['m_yeni_is', p => p.evaluate(() => jobForm())],
  ['m_guncelleme', p => p.evaluate(id => qcAc({ jobId: id }), J)],
];
const tarayici = await chromium.launch({ channel: 'chrome' });
const ctx = await tarayici.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await girisYap(page, 'uye');
const out = {};
for (const [ad, ac] of EKRAN) {
  await page.evaluate(() => { const d = document.getElementById('mpDlgBg'); if (d) d.remove(); try { closeModal(); } catch (e) {} });
  await ac(page);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
  out[ad] = await page.evaluate(() => {
    const kok = document.querySelector('#modalBg.open #modal') || document.getElementById('content');
    const gor = e => e.offsetParent !== null && e.getBoundingClientRect().width > 0;
    const say = (l, f) => { const m = {}; l.forEach(e => { const k = f(e); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ×${n}`); };
    const cs = e => getComputedStyle(e);
    const fz = e => `${parseFloat(cs(e).fontSize)}px/${cs(e).fontWeight}`;
    const basliklar = say([...kok.querySelectorAll('h2,h3,h4,h5')].filter(gor), e => `${e.tagName.toLowerCase()} ${fz(e)}`);
    const kontroller = say([...kok.querySelectorAll('button,input:not([type=checkbox]):not([type=radio]):not([type=hidden]),select,textarea')].filter(gor)
      .filter(e => !e.closest('.mtb,.kboard,.rp3-tab,.tk-grid')), e => { const h = Math.round(e.getBoundingClientRect().height);
        const tur = e.tagName === 'BUTTON' ? (e.className.match(/\b(btn-link|btn-sm|btn|pf-t|md-sp|md-nav|navi)\b/) || ['button'])[0] : e.tagName.toLowerCase() + (e.classList.contains('inp-sm') ? '.sm' : '');
        return tur === 'btn-link' || e.tagName === 'TEXTAREA' ? '' : `${tur} ${h}px`; });
    const kartlar = say([...kok.querySelectorAll('.sec-card,.card,.rp2-card,.kcol,.pn-card,.w-card')].filter(gor),
      e => `r${cs(e).borderTopLeftRadius} kenar ${cs(e).borderTopColor} gölge ${cs(e).boxShadow === 'none' ? 'yok' : 'var'}`);
    const govde = say([...kok.querySelectorAll('p,td,li,span,label')].filter(gor).filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 2)).slice(0, 400),
      e => `${parseFloat(cs(e).fontSize)}px`).slice(0, 6);
    return { zemin: cs(document.querySelector('.main')).backgroundColor + ' / ' + cs(document.querySelector('.main')).backgroundImage.slice(0, 40), basliklar, kontroller, kartlar, govde };
  });
  /* Klavye odağı: ilk üç odaklanabilir denetimin halkası (Tab ile). */
  const odak = [];
  await page.evaluate(() => { const k = document.querySelector('#modalBg.open #modal') || document.getElementById('content'); k.setAttribute('tabindex', '-1'); k.focus(); });
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(220);   /* outline geçişi bitsin */
    odak.push(await page.evaluate(() => { const e = document.activeElement, c = getComputedStyle(e); return `${e.tagName.toLowerCase()}.${(e.className || '').toString().split(' ')[0]}: ${c.outlineStyle === 'none' ? 'outline yok' : c.outlineWidth + ' ' + c.outlineColor} · ${c.boxShadow === 'none' ? 'gölge yok' : 'gölge ' + c.boxShadow.slice(0, 40)}`; })); }
  out[ad].odak = odak;
}
await tarayici.close();
fs.writeFileSync(process.argv[2] || 'envanter.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
