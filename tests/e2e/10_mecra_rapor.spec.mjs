// S14 — mecra müsaitlik raporunun temel hesapları. Beklenenler elle, takvim
// gerçeğinden yazılır (uygulamanın hesap fonksiyonundan ÜRETİLMEZ).
// Dönem: Mart 2035 (hiçbir tohum kaydı bu kadar ileriye uzanmaz; ayrıca
// seçilen yüzlerin o yıl boş olduğu sorgulanır).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { girisYap, sql, kurumId, temizle, teamId } from '../lib/ortam.mjs';

const BAS = '2035-03-01', BIT = '2035-03-31';
let F;   // fikstür kimlikleri

/* Aynı panonun iki yüzü (A/B) + iki ayrı yüz, 2035 boyunca boş; aynı lokasyon. */
function sec() {
  const bos = u => `not exists (select 1 from media_placements p where p.unit_id=${u} and p.commitment<>'cancelled'
                    and p.start_date<='2035-12-31' and coalesce(p.end_date,'9999-12-31')>='2035-01-01')`;
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
  yaz({ u: A }, 'confirmed', '2035-03-11', '2035-03-20');                        // ardışık yenileme
  yaz({ u: C }, 'reserved', '2035-03-05', '2035-03-15', "option_expires_at='2026-01-15'");  // süresi dolmuş opsiyon
  yaz({ u: D }, 'reserved', '2035-03-01', '2035-03-31');                         // sonra iptal edilir
  sql(`update media_placements set commitment='cancelled', cancelled_at=now() where unit_id=${D} and start_date='2035-03-01'`);
  if (led) yaz({ a: led }, 'confirmed', '2035-03-01', '2035-03-31');              // LED kampanyası
  return F;
}

async function raporAc(page, ek) {
  await page.evaluate(([s, b, e, x]) => rpAc('mecra', { siteler: [s], bas: b, bit: e, minGun: 1, led: true, ozet: true, ...x }), [F.site, BAS, BIT, ek]);
  await page.waitForFunction(([b, c]) => ui._rpModel && ui._rpTur === 'mecra' && ui._rpModel.bas === b && ui._rpModel.cikti === c
    && !rpDurum().yukleniyor, [BAS, ek.cikti]);
  return page.evaluate(() => ui._rpModel);
}
const yuz = (m, id) => m.gruplar.flatMap(g => g.urunler.flatMap(u => u.yuzler)).find(y => y.key === 'u' + id);
const gunler = y => y.seg.reduce((o, s) => { o[s.tip] = (o[s.tip] || 0) + s.gun; return o; }, {});

test.beforeEach(() => temizle());

test('müsait aralıklar: ardışık yenileme sahte boşluk üretmez; A/B ayrı; süresi geçmiş opsiyon bloklar; iptal bloklamaz', async ({ page }) => {
  F = sec();
  await girisYap(page, 'uye');
  const once = await raporAc(page, { cikti: 'aralik' });                     // fikstürden önce: yalnız özet farkı için
  fikstur(F);
  await page.evaluate(() => { rpDurum().veri = {}; ui._M = null; });
  const m = await raporAc(page, { cikti: 'aralik' });

  const a = yuz(m, F.A);
  expect(a.bos).toEqual([{ s: '2035-03-21', e: '2035-03-31', gun: 11 }]);   // 10/11 Mart arası boşluk YOK
  expect(gunler(a)).toMatchObject({ yayin: 20, musait: 11 });
  const b = yuz(m, F.B);
  expect(b.tam).toBe(true);                                                  // aynı panonun B yüzü etkilenmez
  expect(b.bos).toEqual([{ s: BAS, e: BIT, gun: 31 }]);
  const c = yuz(m, F.C);
  expect(c.bos).toEqual([{ s: '2035-03-01', e: '2035-03-04', gun: 4 }, { s: '2035-03-16', e: BIT, gun: 16 }]);
  expect(gunler(c)).toMatchObject({ opsiyon: 11 });
  const d = yuz(m, F.D);
  expect(d.tam).toBe(true);                                                  // iptal kayıt bloklamaz

  /* Doluluk özeti: payda SQL'le sayılan aktif statik yüz sayısı; fikstür
     tam olarak 20 yayın + 11 opsiyon yüzey-günü ekler; LED paydaya girmez. */
  const statik = +sql(`select count(*) from units u join alt_mecralar al on al.id=u.alt_mecra_id
    where al.mecra_id=${F.site} and al.occupancy_mode='exclusive' and not al.legacy_archived and u.active`);
  expect(m.ozet.n).toBe(statik);
  expect(m.ozet.gunSay).toBe(31);
  expect(m.ozet.donem.yayin - once.ozet.donem.yayin).toBe(20);
  expect(m.ozet.donem.opsiyon - once.ozet.donem.opsiyon).toBe(11);
  expect(m.ozet.donem.musait - once.ozet.donem.musait).toBe(-31);
  if (F.led) expect(m.led.flatMap(l => l.kampanyalar).length - once.led.flatMap(l => l.kampanyalar).length).toBe(1);
});

test('tam dönem müsaitlik ve dosya: yalnız bütün dönemi boş yüzler; Excel önizlemeyle aynı kapsam', async ({ page }) => {
  F = fikstur(sec());
  await girisYap(page, 'uye');
  const m = await raporAc(page, { cikti: 'tam' });
  const keys = new Set(m.gruplar.flatMap(g => g.urunler.flatMap(u => u.yuzler)).map(y => y.key));
  expect(keys.has('u' + F.B)).toBe(true);
  expect(keys.has('u' + F.D)).toBe(true);
  expect(keys.has('u' + F.A)).toBe(false);
  expect(keys.has('u' + F.C)).toBe(false);

  const [indir] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.locator('#rpXlsB').click()]);
  const b64 = fs.readFileSync(await indir.path()).toString('base64');
  const hucreler = await page.evaluate(async b => { const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Uint8Array.from(atob(b), c => c.charCodeAt(0)).buffer);
    const out = []; wb.eachSheet(ws => ws.eachRow(r => r.eachCell(c => out.push(String(c.value))))); return out; }, b64);
  const KOD = { [F.B]: sql(`select name from units where id=${F.B}`), [F.D]: sql(`select name from units where id=${F.D}`) };
  const kod = id => KOD[id];
  const yuzSayisi = m.gruplar.flatMap(g => g.urunler.flatMap(u => u.yuzler)).length;
  expect(hucreler.filter(x => x === kod(F.B)).length).toBeGreaterThan(0);
  expect(yuzSayisi).toBeGreaterThan(1);

  /* Yalnız seçili kayıtlar: dosya seçimi aşmaz. */
  await page.evaluate(() => rpSecMod('mecra', 'sec'));
  await page.evaluate(k => rpSec('mecra', k, true), 'u' + F.B);
  await page.waitForFunction(() => ui._rpModel && ui._rpModel.dahilYuzSay === 1);
  const [ind2] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.locator('#rpXlsB').click()]);
  const b2 = fs.readFileSync(await ind2.path()).toString('base64');
  const h2 = await page.evaluate(async b => { const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Uint8Array.from(atob(b), c => c.charCodeAt(0)).buffer);
    const out = []; wb.eachSheet(ws => ws.eachRow(r => r.eachCell(c => out.push(String(c.value))))); return out; }, b2);
  expect(h2).toContain(kod(F.B));
  expect(h2).not.toContain(kod(F.D));
});

test('dış paylaşım: kurum adı önizleme modeline ve dosyaya girmez', async ({ page }) => {
  F = fikstur(sec());
  await girisYap(page, 'uye');
  const m = await raporAc(page, { cikti: 'cizelge', _alici: 'dis', musteri: false, isAdi: false, notlar: false });
  expect(JSON.stringify(m)).not.toContain('S13 Regresyon Kurumu');
  const [indir] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.locator('#rpXlsB').click()]);
  const b64 = fs.readFileSync(await indir.path()).toString('base64');
  const hepsi = await page.evaluate(async b => { const z = Uint8Array.from(atob(b), c => c.charCodeAt(0));
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(z.buffer);
    const out = []; wb.eachSheet(ws => ws.eachRow(r => r.eachCell(c => out.push(String(c.value))))); return out.join('\n'); }, b64);
  expect(hepsi).not.toContain('S13 Regresyon Kurumu');
});
