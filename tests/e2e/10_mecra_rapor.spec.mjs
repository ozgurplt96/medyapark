// S15 — mecra doluluk tablosu (ürün başına sayfa, yüz başına iki satır,
// sütunlarda aylar). Hesap kuralları S14'ten değişmedi; beklenenler elle,
// takvim gerçeğinden yazılır (uygulamanın hesap fonksiyonundan ÜRETİLMEZ).
// Dönem: Mart 2035 (hiçbir tohum kaydı bu kadar ileriye uzanmaz; ayrıca
// seçilen yüzlerin o yıl boş olduğu sorgulanır).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { girisYap, sql, kurumId, temizle, teamId, zipMetin } from '../lib/ortam.mjs';

const BAS = '2035-03-01', BIT = '2035-03-31';
let F;   // fikstür kimlikleri

/* Aynı panonun iki yüzü (A/B) + iki ayrı yüz, 2035 boyunca boş; aynı lokasyon. */
function sec() {
  const bos = u => `not exists (select 1 from media_placements p where p.unit_id=${u} and p.commitment<>'cancelled'
                    and p.start_date<='2036-12-31' and coalesce(p.end_date,'9999-12-31')>='2035-01-01')`;
  const [A, B, site] = sql(`select a.id||','||b.id||','||m.id from units a join units b on b.alt_mecra_id=a.alt_mecra_id
      and b.name=regexp_replace(a.name,'-A$','-B') join alt_mecralar al on al.id=a.alt_mecra_id join mecralar m on m.id=al.mecra_id
     where a.name ~ '-A$' and m.operational and al.occupancy_mode='exclusive' and not al.legacy_archived and a.active and b.active
       and ${bos('a.id')} and ${bos('b.id')} order by a.id limit 1`).split(',').map(Number);
  const [C, D] = sql(`select string_agg(u.id::text, ',' order by u.id) from (select u.id from units u join alt_mecralar al on al.id=u.alt_mecra_id
      where al.mecra_id=${site} and al.occupancy_mode='exclusive' and not al.legacy_archived and u.active and u.id not in (${A},${B})
        and ${bos('u.id')} order by u.id limit 2) u`).split(',').map(Number);
  const led = +sql(`select coalesce(min(id),0) from alt_mecralar where mecra_id=${site} and occupancy_mode='concurrent'`);
  return { A, B, C, D, site, led };
}
function fikstur(F) {
  const { A, C, D, led } = F;
  const k = kurumId(), t = teamId('uye');
  const yaz = (hedef, c, bas, bit, ek = '') => sql(`insert into media_placements (${hedef.u ? 'unit_id' : 'alt_mecra_id'}, customer_id, commitment, start_date, end_date, created_by_team_id${ek ? ',' + ek.split('=')[0] : ''})
      values (${hedef.u || hedef.a}, ${k}, '${c}', '${bas}', '${bit}', ${t}${ek ? ',' + ek.split('=')[1] : ''})`);
  yaz({ u: A }, 'confirmed', '2035-03-01', '2035-03-10');                        // yayın
  yaz({ u: A }, 'confirmed', '2035-03-11', '2035-03-20');                        // ardışık yenileme (aynı ay içinde ikinci yayın)
  yaz({ u: C }, 'reserved', '2035-03-05', '2035-03-15', "option_expires_at='2026-01-15'");  // süresi dolmuş opsiyon
  yaz({ u: D }, 'reserved', '2035-03-01', '2035-03-31');                         // sonra iptal edilir
  sql(`update media_placements set commitment='cancelled', cancelled_at=now() where unit_id=${D} and start_date='2035-03-01'`);
  yaz({ u: A }, 'confirmed', '2035-12-20', '2036-01-10');                        // yıl geçişi
  if (led) yaz({ a: led }, 'confirmed', '2035-03-01', '2035-03-31');              // LED kampanyası
  return F;
}

async function raporAc(page, ek) {
  const p = { siteler: [F.site], bas: BAS, bit: BIT, ...ek };
  await page.evaluate(p => rpAc('mecra', p), p);
  await page.waitForFunction(([b, e]) => ui._rpModel && ui._rpTur === 'mecra' && ui._rpModel.bas === b && ui._rpModel.bit === e
    && !rpDurum().yukleniyor, [p.bas, p.bit]);
  return page.evaluate(() => JSON.parse(JSON.stringify(ui._rpModel)));
}
const yuzler = m => m.sayfalar.flatMap(s => s.panolar.flatMap(p => p.yuzler));
const yuz = (m, id) => yuzler(m).find(y => y.key === 'u' + id);
const gunler = y => y.seg.reduce((o, s) => { o[s.tip] = (o[s.tip] || 0) + s.gun; return o; }, {});
async function xlsxHucreler(page, indir, sayfa) {
  const b64 = fs.readFileSync(await indir.path()).toString('base64');
  return page.evaluate(async ([b, sayfa]) => { const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Uint8Array.from(atob(b), c => c.charCodeAt(0)).buffer);
    const out = []; wb.eachSheet(ws => { if (sayfa && ws.name !== sayfa) return;
      ws.eachRow((r, i) => { if (i < 5) return; r.eachCell(c => out.push(String(c.text ?? c.value))); }); }); return out; }, [b64, sayfa]);
}

test.beforeEach(() => temizle());

test('ay içinde değişen durum: yenileme sahte boşluk üretmez; A/B ayrı; süresi geçmiş opsiyon bloklar; iptal bloklamaz', async ({ page }) => {
  F = fikstur(sec());
  await girisYap(page, 'uye');
  const m = await raporAc(page, { _alici: 'ic' });
  expect(m.aylar.map(a => a.ym)).toEqual(['2035-03']);
  expect(m.aylar[0].tam).toBe(true);

  const a = yuz(m, F.A);
  expect(a.bos).toEqual([{ s: '2035-03-21', e: '2035-03-31', gun: 11 }]);   // 10/11 Mart arası boşluk YOK
  expect(gunler(a)).toMatchObject({ yayin: 20, musait: 11 });
  /* Hücre: iki ayrı yayın dilimi + müsait kalan; ay "dolu" ya da "müsait" diye düzlenmez. */
  const h = a.hucre[0];
  expect(h.tip).toBe('karma');
  expect(h.parca.map(p => [p.tip, p.s, p.e])).toEqual([['yayin', '2035-03-01', '2035-03-10'], ['yayin', '2035-03-11', '2035-03-20'], ['musait', '2035-03-21', '2035-03-31']]);
  expect(h.parca[0].ust).toBe('S13 Regresyon Kurumu');                      // iç kullanımda kurum adı
  expect(h.parca[0].alt).toBe('01.03–10.03.2035');
  expect(h.parca[2].alt).toBe('21.03–31.03');

  const b = yuz(m, F.B);
  expect(b.tam).toBe(true);                                                  // aynı panonun B yüzü etkilenmez
  expect(b.hucre[0].tip).toBe('musait');
  expect(b.hucre[0].parca).toEqual([expect.objectContaining({ tip: 'musait', ust: 'Müsait', alt: '' })]);
  const c = yuz(m, F.C);
  expect(c.bos).toEqual([{ s: '2035-03-01', e: '2035-03-04', gun: 4 }, { s: '2035-03-16', e: BIT, gun: 16 }]);
  expect(gunler(c)).toMatchObject({ opsiyon: 11 });
  expect(c.hucre[0].parca[1].alt).toContain('opsiyon süresi doldu');
  expect(yuz(m, F.D).tam).toBe(true);                                        // iptal kayıt bloklamaz
  /* A ile B aynı pano satırında, A önce. */
  const pano = m.sayfalar.flatMap(s => s.panolar).find(p => p.yuzler.some(y => y.key === 'u' + F.A));
  expect(pano.yuzler.map(y => y.key)).toEqual(['u' + F.A, 'u' + F.B]);
  if (F.led) expect(m.led.length).toBeGreaterThan(0);
});

test('seçilen dönem dışındaki günler müsait sayılmaz; yıl geçişi', async ({ page }) => {
  F = fikstur(sec());
  await girisYap(page, 'uye');
  let m = await raporAc(page, { bas: '2035-03-15', bit: '2035-03-31', _alici: 'ic' });
  expect(m.aylar[0]).toMatchObject({ tam: false, s: '2035-03-15', e: '2035-03-31', kisa: 'Mar 2035 (15–31)' });
  const h = yuz(m, F.A).hucre[0];
  expect(h.dilim).toEqual([{ tip: 'disi', gun: 14 }, { tip: 'yayin', gun: 6 }, { tip: 'musait', gun: 11 }]);
  expect(h.parca.reduce((t, p) => t + p.gun, 0)).toBe(17);                   // yalnız seçilen günler
  const hb = yuz(m, F.B).hucre[0];
  expect(hb.parca).toEqual([expect.objectContaining({ tip: 'musait', alt: '15.03–31.03' })]);   // tüm ay değil

  m = await raporAc(page, { bas: '2035-12-01', bit: '2036-01-31', _alici: 'ic' });
  expect(m.aylar.map(a => a.kisa)).toEqual(['Ara 2035', 'Oca 2036']);
  const [ara, oca] = yuz(m, F.A).hucre;
  expect(ara.parca.map(p => p.tip)).toEqual(['musait', 'yayin']);
  expect(ara.parca[1].alt).toBe('20.12.2035–10.01.2036');                    // yıl geçişinde iki tam tarih
  expect(oca.parca.map(p => p.tip)).toEqual(['yayin', 'musait']);
});

test('yalnız dönemin tamamında müsait yüzler ve dosya: Excel önizlemeyle aynı kapsam, ürün başına sayfa', async ({ page }) => {
  F = fikstur(sec());
  await girisYap(page, 'uye');
  const m = await raporAc(page, { tamMusait: true });
  const keys = new Set(yuzler(m).map(y => y.key));
  expect(keys.has('u' + F.B)).toBe(true);
  expect(keys.has('u' + F.D)).toBe(true);
  expect(keys.has('u' + F.A)).toBe(false);
  expect(keys.has('u' + F.C)).toBe(false);
  expect(m.led.length).toBe(0);                                              // LED statik müsaitliğe katılmaz

  /* Yüz kodları farklı ürün ailelerinde tekrar edebilir (M1 Megalight P1-A ≠
     Raket P1-A): kontrol, yüzün KENDİ sayfasında yapılır. */
  const kod = id => sql(`select name from units where id=${id}`);
  const sayfaAd = m.sayfalar.find(s => s.panolar.some(p => p.yuzler.some(y => y.key === 'u' + F.B))).ad;
  const [indir] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.locator('#rpXlsB').click()]);
  const hucreler = await xlsxHucreler(page, indir, sayfaAd);
  expect(hucreler).toContain(kod(F.B));
  expect(hucreler).not.toContain(kod(F.A));
  expect(hucreler).not.toContain('Dolu');                                     // yalnız tam müsait yüzler

  /* Yalnız seçili kayıtlar: dosya seçimi aşmaz. */
  await page.evaluate(() => rpSecMod('mecra', 'sec'));
  await page.evaluate(k => rpSec('mecra', k, true), 'u' + F.B);
  await page.waitForFunction(() => ui._rpModel && ui._rpModel.dahilYuzSay === 1);
  const [ind2] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.locator('#rpXlsB').click()]);
  const h2 = await xlsxHucreler(page, ind2);
  expect(h2).toContain(kod(F.B));
  expect(h2).not.toContain(kod(F.D));
});

test('dış paylaşım: kurum adı modele ve dosyaya girmez; aynı yerleşimde Dolu yazar', async ({ page }) => {
  F = fikstur(sec());
  await girisYap(page, 'uye');
  const m = await raporAc(page, { _alici: 'dis' });
  expect(JSON.stringify(m)).not.toContain('S13 Regresyon');
  expect(yuz(m, F.A).hucre[0].parca[0]).toMatchObject({ tip: 'yayin', ust: 'Dolu', alt: '01.03–10.03.2035' });
  expect(yuz(m, F.C).hucre[0].parca[1]).toMatchObject({ tip: 'opsiyon', ust: 'Opsiyon' });
  expect(yuz(m, F.C).hucre[0].parca[1].alt).not.toContain('süresi');        // iç ayrıntı dışarı çıkmaz
  expect(await page.locator('#rpPrev').innerText()).not.toContain('S13 Regresyon');
  const [indir] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.locator('#rpXlsB').click()]);
  const ham = zipMetin(fs.readFileSync(await indir.path()));                  // dosyanın TÜM XML parçaları
  expect(ham).not.toContain('S13 Regresyon');
  expect(ham).toContain('Dolu');
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.locator('#rpPdfB').click()]);
  expect(pdf.suggestedFilename()).toMatch(/Doluluk_Tablosu.*\.pdf$/);
});
