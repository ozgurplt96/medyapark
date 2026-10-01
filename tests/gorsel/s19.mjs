// S19 hazırlık — Mecralar/Raporlar görsel ve dosya kanıtı (önce/sonra aynı koşulda).
// Kullanım: node gorsel/s19.mjs <cikti-klasoru>
// Yalnız test ortamında çalışır (hedefDogrula). Veri YAZMAZ.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { hedefDogrula, girisYap } from '../lib/ortam.mjs';

hedefDogrula();
const cikti = process.argv[2] || 'gorsel-cikti';
fs.mkdirSync(cikti, { recursive: true });
/* Karşılaştırma dönemi sabittir: önce/sonra ve Mecralar/Raporlar aynı aralık. */
const BAS = '2026-07-01', BIT = '2026-12-31';
/* 720×450 ≈ 1440×900 ekranda %200 yakınlaştırma. */
const VP = [['1440', 1440, 900], ['768', 768, 1024], ['390', 390, 844], ['720_zoom200', 720, 450]];
const tarayici = await chromium.launch({ channel: 'chrome' });
const olcum = {};

const mecraAc = (page, o = {}) => page.evaluate(async ([o, BAS, BIT]) => {
  const M = ui._M || await mdYukle();
  const m1 = M.mecs.find(m => /M1/i.test(m.name));
  const acik = {}; (M.altByMec[m1.id] || []).forEach(a => { acik['g' + a.id] = true; });
  sessionStorage.removeItem('mp_medya');
  medyaGit(o.varsayilan ? { site: m1.id, acik } : { site: m1.id, acik, bas: BAS, bit: BIT, durum: '', kurum: '', is: '', q: '', urun: '', gecmisGizle: false });
}, [o, BAS, BIT]);
const hazir = page => page.waitForFunction(() => ui._mdSonuc && document.querySelector('#mdGovde table') && !ui._mdYukleniyor);

for (const [vpAd, w, h] of VP) {
  const ctx = await tarayici.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, acceptDownloads: true,
    locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  const hatalar = [];
  page.on('pageerror', e => hatalar.push(e.message));
  await girisYap(page, 'uye');

  /* 1) Mecralar — ilk açılış (varsayılan dönem) */
  await mecraAc(page, { varsayilan: true }); await hazir(page);
  await page.screenshot({ path: path.join(cikti, `mecralar_ilk_${vpAd}.png`) });
  /* 2) Mecralar — sabit dönem, tablo görünür alanda */
  await mecraAc(page); await hazir(page);
  await page.locator('#mdGovde table').first().scrollIntoViewIfNeeded();
  await page.evaluate(() => { const t = document.querySelector('#mdGovde .md-alan'); if (t) t.scrollIntoView({ block: 'start' }); });
  await page.screenshot({ path: path.join(cikti, `mecralar_tablo_${vpAd}.png`) });
  /* LED alanı (kampanya sütunu geniş kalmalı) */
  if (await page.locator('#mdGovde section.md-led table').count()) {
    await page.evaluate(() => document.querySelector('#mdGovde section.md-led').scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(cikti, `mecralar_led_${vpAd}.png`) });
  }
  olcum[vpAd] = await page.evaluate(() => {
    const t = document.querySelector('#mdGovde table:not(.mtb-led)'); if (!t) return null;
    const g = s => { const e = t.querySelector(s); return e ? Math.round(e.getBoundingClientRect().width * 10) / 10 : null; };
    const ths = [...t.querySelectorAll('thead th')].map(e => [e.className.split(' ')[0] || e.textContent.trim(), Math.round(e.getBoundingClientRect().width)]);
    const led = document.querySelector('#mdGovde table.mtb-led thead th');
    return { sabitSutunlar: ths.slice(0, 2), ilkAy: ths[2], tabloGen: Math.round(t.getBoundingClientRect().width),
      sarmal: Math.round(t.parentElement.clientWidth), ledKampanya: led ? Math.round(led.getBoundingClientRect().width) : null,
      sayfaTasma: document.documentElement.scrollWidth > innerWidth + 1 };
  });

  if (vpAd === '1440') {
    /* 3) Raporlar › Mecra doluluk tablosu önizlemesi (referans düzen) */
    await page.evaluate(async ([BAS, BIT]) => { await rpAc('mecra'); const a = rpAyar('mecra'); a.bas = BAS; a.bit = BIT; rpKontrolCiz('mecra'); await rpYenile('mecra'); }, [BAS, BIT]);
    await page.waitForSelector('.rp3-dol');
    await page.evaluate(() => document.querySelector('.rp3-dol').closest('.rp3-kap').previousElementSibling.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(cikti, `rapor_mecra_${vpAd}.png`) });
    if (await page.locator('.rp3-led').count()) {
      await page.evaluate(() => document.querySelector('.rp3-led').closest('.rp3-kap').previousElementSibling.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: path.join(cikti, `rapor_led_${vpAd}.png`) });
    }
    olcum.rapor = await page.evaluate(() => { const t = document.querySelector('.rp3-dol');
      return [...t.querySelectorAll('thead th')].slice(0, 3).map(e => [e.textContent.trim(), Math.round(e.getBoundingClientRect().width)]); });

    /* 4) Gerçek indirilen dosyalar — aynı dönem; Raporlar iç ve dış ayrı */
    const indir = async (ad, fn) => { const [d] = await Promise.all([page.waitForEvent('download'), fn()]); await d.saveAs(path.join(cikti, ad)); return d.suggestedFilename(); };
    olcum.dosya = {};
    for (const alici of ['ic', 'dis']) {
      await page.evaluate(async ([al, BAS, BIT]) => { rpAliciSec('mecra', al); const a = rpAyar('mecra'); a.bas = BAS; a.bit = BIT; await rpYenile('mecra'); }, [alici, BAS, BIT]);
      await page.waitForSelector('.rp3-dol');
      olcum.dosya['rapor_' + alici] = await indir(`rapor_tum_mecralar_${alici}.xlsx`, () => page.evaluate(() => rpIndirXls('mecra')));
    }
    await page.evaluate(async ([BAS, BIT]) => { sessionStorage.removeItem('mp_medya');
      medyaGit({ site: null, bas: BAS, bit: BIT, durum: '', kurum: '', is: '', q: '', urun: '', gecmisGizle: false }); }, [BAS, BIT]);
    await page.waitForFunction(() => ui._mdSonuc && document.querySelector('#mdGovde .md-yil-site') && !ui._mdYukleniyor);
    olcum.dosya.mecralar_genel = await indir('mecralar_tum_mecralar.xlsx', () => page.evaluate(() => mdExcel({})));
    const siteler = await page.evaluate(() => ui._mdSonuc.siteler.filter(s => s.gruplar.some(g => g.esz)).map(s => [s.m.id, s.m.name]));
    for (const [id, ad] of siteler)
      olcum.dosya['mecralar_' + id] = await indir(`mecralar_tekil_${ad.replace(/[^A-Za-z0-9]+/g, '_')}.xlsx`, () => page.evaluate(i => mdExcel({ site: i }), id));
  }
  olcum['hata_' + vpAd] = hatalar;
  await ctx.close();
}
await tarayici.close();
fs.writeFileSync(path.join(cikti, '_olcum.json'), JSON.stringify(olcum, null, 1));
console.log(JSON.stringify(olcum, null, 1));
