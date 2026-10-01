// S19 hazırlık — toplu Excel'de LED aylık şablonu ve Mecralar tablosunun kompakt No/Yüz düzeni.
// Dönem 2037: tohum kayıtları bu yıla uzanmaz. Beklenen değerler elle yazılır.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { girisYap, sql, kurumId, teamId, temizle, zipMetin } from '../lib/ortam.mjs';

const NOT = 'S13T s19';
test.beforeEach(() => { temizle(); sql(`delete from media_placements where note like '${NOT}%'`); });
test.afterAll(() => sql(`delete from media_placements where note like '${NOT}%'`));

/* Kapsamdaki BÜTÜN LED yayın alanlarına Mart 2037'de birer kampanya (ilkine iki). */
function fikstur() {
  const alanlar = sql(`select al.id||':'||m.id from alt_mecralar al join mecralar m on m.id=al.mecra_id
     where m.operational and al.occupancy_mode='concurrent' and not al.legacy_archived order by m.sort, m.id, al.sort, al.id`).split('\n').filter(Boolean).map(x => x.split(':').map(Number));
  const yaz = (a, c, bas, bit) => +sql(`insert into media_placements (alt_mecra_id, customer_id, commitment, start_date, end_date, note, created_by_team_id)
    values (${a}, ${kurumId()}, '${c}', '${bas}', '${bit}', '${NOT}', ${teamId('uye')}) returning id`);
  alanlar.forEach(([a], i) => { yaz(a, 'confirmed', '2037-03-01', '2037-03-31'); if (i === 0) yaz(a, 'reserved', '2037-03-20', '2037-04-10'); });
  return { alanlar };
}
/* İndirilen dosyanın sayfaları (sayfa içinde ExcelJS ile). */
const sayfalar = (page, kaynak) => page.evaluate(async k => {
  const blob = k === 'md' ? ui._mdSonXls.blob : ui._rpSon.blob;
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await blob.arrayBuffer());
  const hv = v => v == null ? '' : typeof v === 'object' && v.richText ? v.richText.map(x => x.text).join('') : String(v);
  return wb.worksheets.map(ws => { const r = []; ws.eachRow({ includeEmpty: true }, (row, i) => { const v = []; for (let c = 1; c <= ws.columnCount; c++) v.push(hv(row.getCell(c).value)); r[i] = v; });
    const dolgu = []; ws.eachRow((row, i) => { if (i < 4) return; row.eachCell((c, k) => { if (c.fill && c.fill.fgColor) dolgu.push(`${i}:${k}:${c.fill.fgColor.argb}`); }); });
    return { ad: ws.name, r1: r[1], r2: r[2], h: r[3], veri: r.slice(4), dolgu, gen: ws.columns.map(c => c.width), ySplit: (ws.views[0] || {}).ySplit, xSplit: (ws.views[0] || {}).xSplit }; });
}, kaynak);
/* Kampanya satırı: Dönem sütunu tarihle başlar (alt not satırı birleşik hücredir, sayılmaz). */
const kampanya = r => r && /^\d{2}\.\d{2}/.test(r[2] || '');
const raporIndir = async (page, alici) => {
  await page.evaluate(a => rpAc('mecra', { bas: '2037-03-01', bit: '2037-04-30', _alici: a }), alici);
  await page.waitForFunction(a => ui._rpTur === 'mecra' && ui._rpModel && !rpDurum().yukleniyor && rpAyar('mecra')._alici === a, alici);
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#rpXlsB').click()]);
  return d;
};

test.describe('Toplu Excel: LED yayın alanları aylık şablonla, ayrı sayfalarda', () => {
  test('Raporlar › tüm mecralar: düz LED listesi yok; her LED alanı kendi aylık sayfası ve Mecralar tekil indirmesiyle birebir aynı', async ({ page }) => {
    const F = fikstur();
    test.skip(F.alanlar.length < 2, 'Test yığınında iki LED yayın alanı yok');
    await girisYap(page, 'uye');
    await raporIndir(page, 'ic');
    const R = await sayfalar(page, 'rp');
    expect(R.map(s => s.ad).join('|')).not.toMatch(/LED yayınları/);         // eski düz liste sayfası kalktı
    const led = R.filter(s => s.h[0] === 'Kampanya');
    expect(led.length).toBe(F.alanlar.length);                              // alan başına bir sayfa; birleştirilmez
    for (const s of led) {
      expect(s.h.slice(0, 5)).toEqual(['Kampanya', 'Durum', 'Dönem', 'Mart 2037', 'Nisan 2037']);
      expect([s.ySplit, s.xSplit]).toEqual([3, 3]);
      expect(s.r1.filter(Boolean).length).toBe(1);                          // S18 üç satırlık üst alan: başlık
      expect(s.r2.filter(Boolean).length).toBe(1);                          //   kısa dönem/kapsam
      expect(s.r2[0]).toContain('Dönem: 01.03.2037 – 30.04.2037');
      expect(s.r2[0]).toContain('İç kullanım');
      expect(s.veri.flat().join('|')).not.toMatch(/Müsait/);               // kampanyasız ay "Müsait" değildir
      expect(s.veri.some(r => r[3] === 'Tüm ay')).toBe(true);
    }
    const ilk = led[0];
    expect(ilk.veri.some(r => r[3] === '20.03–31.03' && r[4] === '01.04–10.04' && /Opsiyon/.test(r[1]))).toBe(true);
    expect(ilk.veri.find(r => r[3] === 'Tüm ay')[4]).toBe('');               // Nisan'da kampanya yok: hücre boş
    /* Sayfa sırası mecra → alan: LED sayfası kendi mecrasının statik sayfalarının yanında. */
    const sira = await page.evaluate(() => rpMecraBolumler(ui._rpModel).map(b => (b.L || b.sf).ad));
    expect(R.map(s => s.ad)).toEqual(sira);
    /* Aynı koşul (iç kullanım, aynı dönem): Mecralar'ın tekil indirmesiyle hücre hücre aynı. */
    for (const [alan, site] of F.alanlar) {
      await page.evaluate(([site]) => medyaGit({ site, alan: '', kurum: '', is: '', q: '', urun: '', durum: '', bas: '2037-03-01', bit: '2037-04-30', gecmisGizle: false, acik: {} }), [site]);
      await page.waitForFunction(() => ui._mdSonuc && document.querySelector('#mdGovde .md-sonuc') && !ui._mdYukleniyor);
      await Promise.all([page.waitForEvent('download'), page.evaluate(a => mdExcel({ alan: a }), alan)]);
      const [m] = await sayfalar(page, 'md');
      const r = led.find(s => s.ad === m.ad);
      expect(r, m.ad).toBeTruthy();
      expect(r.h).toEqual(m.h);
      expect(r.veri.filter(kampanya)).toEqual(m.veri.filter(kampanya));
      expect(r.veri.filter(kampanya).length).toBeGreaterThan(0);
      expect(r.dolgu).toEqual(m.dolgu);
      expect(r.gen).toEqual(m.gen);
      expect(r.r1).toEqual(m.r1);
    }
  });

  test('dış paylaşım: aynı aylık şablon, kurum ve iş adı dosyaya girmez; seçimden çıkarılan kampanya sayfaya girmez', async ({ page }) => {
    const F = fikstur();
    test.skip(!F.alanlar.length, 'Test yığınında LED yayın alanı yok');
    const kurumAd = sql(`select firma from customers where id=${kurumId()}`);
    await girisYap(page, 'uye');
    const d = await raporIndir(page, 'dis');
    const ham = zipMetin(fs.readFileSync(await d.path()));
    expect(ham).not.toContain(kurumAd); expect(ham).not.toMatch(/Regresyon/i);
    let led = (await sayfalar(page, 'rp')).filter(s => s.h[0] === 'Kampanya');
    expect(led.length).toBe(F.alanlar.length);
    expect(led[0].r2[0]).toContain('Dış paylaşım');
    expect(led[0].veri.filter(kampanya).map(r => r[0])).toEqual(['Kampanya 1', 'Kampanya 2']);
    expect(led[0].veri.some(r => r[3] === 'Tüm ay')).toBe(true);
    /* Önizleme = dosya: önizlemede de alan başına aylık tablo; bir kampanya çıkarılır. */
    await expect(page.locator('#rpPrev table.rp3-led')).toHaveCount(F.alanlar.length);
    await page.locator('#rpPrev table.rp3-led').first().locator('tbody tr').nth(1).locator('input.rp2-cb').uncheck();
    await Promise.all([page.waitForEvent('download'), page.locator('#rpXlsB').click()]);
    led = (await sayfalar(page, 'rp')).filter(s => s.h[0] === 'Kampanya');
    expect(led[0].veri.filter(kampanya).length).toBe(1);
  });
});

test.describe('Mecralar tablosu: Raporlar önizlemesindeki kompakt No / Yüz düzeni', () => {
  test('Yüz sütunu içerik kadar (gerçek ölçüm); yapışkan konumlar tutarlı; LED kampanya sütunu geniş kalır', async ({ page }) => {
    fikstur();
    await girisYap(page, 'uye');
    await page.evaluate(async () => { const M = ui._M || await mdYukle();
      const m = M.mecs.find(x => mdKapsamda(x) && (M.altByMec[x.id] || []).some(a => mdEszamanli(a) && !mdArsiv(a)));
      const acik = {}; (M.altByMec[m.id] || []).forEach(a => { acik['g' + a.id] = true; });
      medyaGit({ site: m.id, alan: '', kurum: '', is: '', q: '', urun: '', durum: '', bas: '2037-03-01', bit: '2037-08-31', gecmisGizle: false, acik }); });
    await page.waitForFunction(() => ui._mdSonuc && document.querySelector('#mdGovde table.mtb') && !ui._mdYukleniyor);
    const o = await page.evaluate(() => [...document.querySelectorAll('#mdGovde table.mtb:not(.mtb-led)')].map(t => {
      const g = e => e.getBoundingClientRect(); const no = t.querySelector('thead th.mtb-no'), yz = t.querySelector('thead th.mtb-yz');
      const ic = Math.max(...[...t.querySelectorAll('.mtb-yi')].map(e => g(e).width));
      const w = t.closest('.mtb-wrap'); w.scrollLeft = 400;
      const tb = t.querySelector('tbody th.mtb-yz'), nb = t.querySelector('tbody th.mtb-no');
      const r = { no: g(no).width, yz: g(yz).width, ic, ay: g(t.querySelector('thead th.mtb-ay')).width,
        yzSol: g(tb).left - g(w).left - w.clientLeft, noSol: g(nb).left - g(w).left - w.clientLeft, tasma: t.scrollWidth > w.clientWidth,
        colYz: g(t.querySelector('col.c-yuz')).width, kirpilan: [...t.querySelectorAll('.mtb-yi')].some(e => e.scrollWidth > e.clientWidth + 1) };
      w.scrollLeft = 0; return r; }));
    expect(o.length).toBeGreaterThan(0);
    for (const t of o) {
      expect(t.no).toBeLessThanOrEqual(36);                                 // sıra no: dar
      expect(t.yz - t.ic).toBeLessThanOrEqual(20);                          // Yüz = kutu + kod + iç boşluk; fazlası yok
      expect(t.yz).toBeLessThanOrEqual(110);
      expect(t.kirpilan).toBe(false);                                       // kod kırpılmaz
      expect(Math.abs(t.colYz - t.yz)).toBeLessThanOrEqual(1);              // <col> = gerçek genişlik
      expect(Math.round(t.noSol)).toBe(0);                                  // yatay kaydırmada No solda sabit
      expect(Math.abs(t.yzSol - t.no)).toBeLessThanOrEqual(1);              // Yüz, No'nun hemen sağında sabit (üst üste binmez)
      expect(t.ay).toBeGreaterThanOrEqual(140);
    }
    const led = await page.evaluate(() => { const t = document.querySelector('#mdGovde table.mtb-led'); return t ? t.querySelector('thead th.mtb-kmp').getBoundingClientRect().width : null; });
    expect(led).toBeGreaterThanOrEqual(225);                                // LED kampanya adı sütunu daraltılmadı
    /* Sayfa yatayda taşmaz; tablo kendi içinde kayar. */
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
});
