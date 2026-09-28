// Paket bedeli düzenleme (S12 boşluğu) ve Baskı/Montaj dökümü:
// toplam paketi bir kez sayar, kısmi paketi toplama katmaz, dış paylaşımda
// kapalı alanlar hiçbir çıktıya girmez, önizleme bayatsa dosya üretilmez.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { girisYap, sql, rpc, rest, isOlustur, dlg, teamId as teamIdOf, ONEK, temizle, zipMetin } from '../lib/ortam.mjs';

/* Her test yalnız kendi işaretli verisiyle başlar (tekrar/sıra bağımsız). */
test.beforeEach(() => temizle());

const say = q => +sql(q);
/* Sıradan değerler değil: çıktıda başka bir sayıyla karışmasın. */
const PK = { maliyet: 1234.5, satis: 2345.75 }, TEK = { maliyet: 321.25, satis: 432.5 };
const GIZLI = 'S13T gizli not', PK_NOT = 'S13T paket notu';

async function kurulum(ad) {
  const job = await isOlustur('uye', ad);
  const p = await rpc('uye', 'operations_batch_create', { p_job: job, p_rows: [
    { operation_type: 'baski', description: 'S13T paket baskı', planned_date: '2031-04-01', cost: 700, note: GIZLI },
    { operation_type: 'montaj', description: 'S13T paket montaj', planned_date: '2031-04-02', cost: 300 }],
    p_package: { label: 'S13T paket', cost_amount: PK.maliyet, sale_amount: PK.satis, currency: 'TRY', note: PK_NOT } });
  expect(p.durum).toBe(200);
  const t = await rpc('uye', 'operations_batch_create', { p_job: job, p_rows: [
    { operation_type: 'sokum', description: 'S13T tekil söküm', planned_date: '2031-04-03', cost: TEK.maliyet, sale_amount: TEK.satis }] });
  expect(t.durum).toBe(200);
  return { job, grp: +p.veri.price_group_id, ops: p.veri.ids.map(Number), tek: +t.veri.ids[0] };
}
async function raporAc(page, job, ic) {
  await page.evaluate(([j, ic]) => rpAc('baski', { sablon: 'dokum', is: j, _alici: ic ? 'ic' : 'dis' }), [job, ic]);
  await page.waitForFunction(([j, ic]) => ui._rpModel && ui._rpTur === 'baski' && ui._rpModel.sablon === 'dokum' && ui._rpModel.ic === ic
    && rpAyar('baski').is === j && !rpDurum().yukleniyor, [job, ic]);
  return page.evaluate(() => JSON.parse(JSON.stringify(ui._rpModel)));
}
const paketHareket = grp => say(`select count(*) from entries e join operation_price_groups g on g.job_id=e.job_id
  where g.id=${grp} and e.system_kind='price_group_changed'`);

test.describe('Paket bedeli düzenleme', () => {
  test('işlemden erişilir; tutar ve etkilenen işlemler görünür; Kaydet tek Hareket yazar', async ({ page }) => {
    const { job, grp } = await kurulum('Paket düzenle');
    await girisYap(page, 'uye');
    await page.evaluate(j => workAc(j, { bolum: 'op' }), job);
    const kutu = page.locator('#wPaketler .w-paket');
    await expect(kutu).toContainText('S13T paket');
    await expect(kutu).toContainText('2 işlemi kapsar');
    await kutu.getByRole('button', { name: 'Paket bedelini düzenle' }).click();
    await expect(page.locator('#modalBg.open .pk-op')).toHaveCount(2);
    await expect(page.locator('#pkS')).toHaveValue(String(PK.satis));

    await page.fill('#pkS', '2600');
    await page.locator('#pkKaydet').dblclick();                       // çift gönderim tek yazım
    await expect(page.locator('#modalBg.open')).toHaveCount(0);
    expect(+sql(`select sale_amount from operation_price_groups where id=${grp}`)).toBe(2600);
    expect(paketHareket(grp)).toBe(1);
    expect(sql(`select body from entries where system_kind='price_group_changed' and job_id=${job}`)).toContain('Paket bedeli güncellendi');
    await expect(page.locator('#wPaketler')).toContainText('2.600,00');

    /* Değişiklik yoksa yazma yok, Hareket yok. */
    await page.locator('#wPaketler').getByRole('button', { name: 'Paket bedelini düzenle' }).click();
    await page.locator('#pkKaydet').click();
    await expect(page.locator('#modalBg.open')).toHaveCount(0);
    expect(paketHareket(grp)).toBe(1);
  });

  test('doğrulama: ad boş ve iki tutar birden boş kabul edilmez', async ({ page }) => {
    const { job } = await kurulum('Paket doğrulama');
    await girisYap(page, 'uye');
    await page.evaluate(j => workAc(j, { bolum: 'op' }), job);
    await page.locator('#wPaketler').getByRole('button', { name: 'Paket bedelini düzenle' }).click();
    await page.fill('#pkAd', '');
    await page.locator('#pkKaydet').click();
    await expect(page.locator('#pkHata')).toContainText('boş olamaz');
    await page.fill('#pkAd', 'S13T paket');
    await page.fill('#pkM', ''); await page.fill('#pkS', '');
    await page.locator('#pkKaydet').click();
    await expect(page.locator('#pkHata')).toContainText('en az biri');
  });

  test('başkası değiştirdiyse üzerine yazılmaz', async ({ page }) => {
    const { job, grp } = await kurulum('Paket çakışma');
    await girisYap(page, 'uye');
    await page.evaluate(j => workAc(j, { bolum: 'op' }), job);
    await page.locator('#wPaketler').getByRole('button', { name: 'Paket bedelini düzenle' }).click();
    const r = await rest('uye2', `operation_price_groups?id=eq.${grp}`, { method: 'PATCH', body: { sale_amount: 1900 } });
    expect(r.durum).toBeLessThan(300);
    await page.fill('#pkS', '2700');
    await page.locator('#pkKaydet').click();
    await expect(dlg(page)).toContainText('başka biri tarafından değiştirildi');
    expect(+sql(`select sale_amount from operation_price_groups where id=${grp}`)).toBe(1900);
  });

  test('aktif olmayan üye paketi değiştiremez', async () => {
    const { grp } = await kurulum('Paket yetki');
    const r = await rest('pasif', `operation_price_groups?id=eq.${grp}`, { method: 'PATCH', body: { sale_amount: 1 } });
    expect(Array.isArray(r.veri) ? r.veri.length : 0).toBe(0);
    expect(+sql(`select sale_amount from operation_price_groups where id=${grp}`)).toBe(PK.satis);
  });
});

test.describe('Baskı/montaj şablonları', () => {
  test('işe özel döküm: paket bir kez sayılır, düzenleme sonrası toplam güncellenir, kısmi paket toplama girmez', async ({ page }) => {
    const { job, grp, ops } = await kurulum('Rapor toplam');
    await girisYap(page, 'uye');
    let m = await raporAc(page, job, true);
    expect(m.toplamlar.TRY.tutar).toBeCloseTo(PK.maliyet + TEK.maliyet, 2);   // satır maliyetleri (700+300) eklenmez
    m = await raporAc(page, job, false);
    expect(m.toplamlar.TRY.tutar).toBeCloseTo(PK.satis + TEK.satis, 2);       // dış paylaşım = satış bedeli

    await rest('uye', `operation_price_groups?id=eq.${grp}`, { method: 'PATCH', body: { cost_amount: 3000, updated_at: new Date().toISOString() } });
    m = await raporAc(page, job, true);
    expect(m.toplamlar.TRY.tutar).toBeCloseTo(3000 + TEK.maliyet, 2);

    await page.evaluate(k => rpSec('baski', k, false), 'o' + ops[0]);             // paketin bir işlemi çıkarıldı
    m = await page.evaluate(() => JSON.parse(JSON.stringify(ui._rpModel)));
    expect(m.kismiPaket).toBe(true);
    expect(m.toplamlar.TRY.tutar).toBeCloseTo(TEK.maliyet, 2);
    expect(m.cikarilan.map(x => x.key)).toEqual(['o' + ops[0]]);              // çıkarılan geri eklenebilir listede
    await expect(page.locator('#rpPrev .rp3-cik')).toContainText('S13T paket baskı');
  });

  test('dış paylaşım: maliyet ve iç notlar önizlemeye, modele ve dosyanın hiçbir parçasına girmez; satış bedeli girer', async ({ page }) => {
    const { job } = await kurulum('Rapor dış');
    await girisYap(page, 'uye');
    const m = await raporAc(page, job, false);
    expect(m.ic).toBe(false);
    const json = JSON.stringify(m);
    for (const yasak of [GIZLI, PK_NOT, String(PK.maliyet), String(TEK.maliyet)]) expect(json).not.toContain(yasak);
    expect(json).toContain(String(TEK.satis));
    const onizleme = await page.locator('#rpPrev').innerText();
    for (const yasak of [GIZLI, PK_NOT, '1.234,5', '321,25']) expect(onizleme).not.toContain(yasak);
    expect(onizleme).toContain('432,50');

    const [indir] = await Promise.all([page.waitForEvent('download'), page.locator('#rpXlsB').click()]);
    const ham = zipMetin(fs.readFileSync(await indir.path()));
    expect(ham).toContain('S13T paket baskı');
    for (const yasak of [GIZLI, PK_NOT, '1234.5', '321.25', '>700<', '>300<']) expect(ham).not.toContain(yasak);
    for (const s of ['takip']) {                                              // takip şablonu da aynı kural
      const t = await page.evaluate(([j, s]) => rpAc('baski', { sablon: s, donem: 'tum', is: j }), [job, s])
        .then(() => page.waitForFunction(() => ui._rpModel && ui._rpModel.sablon === 'takip' && !rpDurum().yukleniyor))
        .then(() => page.evaluate(() => JSON.stringify(ui._rpModel)));
      for (const yasak of [GIZLI, PK_NOT, String(PK.maliyet), String(TEK.maliyet)]) expect(t).not.toContain(yasak);
    }
  });

  test('önizleme açıkken kayıt değişirse bayat dosya indirilmez; önizleme yenilenir', async ({ page }) => {
    const { job, grp } = await kurulum('Rapor bayat');
    await girisYap(page, 'uye');
    await raporAc(page, job, true);
    await rest('uye2', `operation_price_groups?id=eq.${grp}`, { method: 'PATCH', body: { cost_amount: 4000 } });
    let indirildi = false; page.on('download', () => { indirildi = true; });
    await page.locator('#rpXlsB').click();
    await expect(page.locator('#rpNot')).toContainText('Önizlemeden sonra kayıtlar değişti');
    expect(indirildi).toBe(false);
    const m = await page.evaluate(() => JSON.parse(JSON.stringify(ui._rpModel)));
    expect(m.toplamlar.TRY.tutar).toBeCloseTo(4000 + TEK.maliyet, 2);
    const [indir] = await Promise.all([page.waitForEvent('download'), page.locator('#rpXlsB').click()]);
    expect(indir.suggestedFilename()).toMatch(/Baski_Montaj_Dokumu.*\.xlsx$/);
  });
});

test.describe('Üretim kalemi (baskı ↔ montaj bağı)', () => {
  /* İki baskı + bunları kapsayan TEK montaj (ortak montaj) + bağsız bir montaj. */
  async function kalemKur(ad) {
    const job = await isOlustur('uye', ad);
    const r = await rpc('uye', 'operations_batch_create', { p_job: job, p_rows: [
      { operation_type: 'baski', description: 'S13T baskı A', planned_date: '2031-06-02', quantity: 6, surface_count: 2, cost: 600, sale_amount: 900, kalem: '1' },
      { operation_type: 'baski', description: 'S13T baskı B', planned_date: '2031-06-03', quantity: 4, cost: 400, sale_amount: 700, kalem: '1' },
      { operation_type: 'montaj', description: 'S13T ortak montaj', planned_date: '2031-06-05', cost: 250, sale_amount: 500, kalem: '1' },
      { operation_type: 'montaj', description: 'S13T bağsız montaj', planned_date: '2031-06-06', cost: 90 },
      { operation_type: 'diger', description: 'S13T vinç', planned_date: '2031-06-05', quantity: 4, quantity_unit: 'gun', cost: 1200 }] });
    expect(r.durum).toBe(200);
    return { job, ids: r.veri.ids.map(Number) };
  }
  const kk = id => sql(`select coalesce(kalem_key::text,'') from work_operations where id=${id}`);

  test('toplu kayıtta aynı etiket tek kalem; ortak montaj bedeli bir kez sayılır; bağsız montaj ayrı satırda', async ({ page }) => {
    const { job, ids } = await kalemKur('Kalem');
    expect(kk(ids[0])).not.toBe('');
    expect(kk(ids[1])).toBe(kk(ids[0])); expect(kk(ids[2])).toBe(kk(ids[0]));
    expect(kk(ids[3])).toBe(''); expect(kk(ids[4])).toBe('');
    await girisYap(page, 'uye');

    const d = await raporAc(page, job, true);
    const k1 = d.bolumler.find(b => b.tip === 'kalem').satirlar.find(s => s.tip === 'kalem');
    expect(k1.rows.map(r => r.urun)).toEqual(['S13T baskı A', 'S13T baskı B']);
    expect(k1.montaj).toMatchObject({ bedel: [{ pb: 'TRY', v: 250 }], kapsar: 2 });
    expect(k1.rows[0]).toMatchObject({ yuzey: 2, adet: 6, birimFiyat: 100, tutar: 600 });   // birim = 600/6, kayıttan
    const hiz = d.bolumler.find(b => b.tip === 'hizmet').satirlar;
    expect(hiz.map(h => h.urun)).toEqual(['Diğer hizmet — S13T vinç', 'Montaj — S13T bağsız montaj']);   // tarih sırası
    expect(hiz[1].urunAlt).toContain('baskıyla eşleştirilmemiş');
    expect(hiz[0]).toMatchObject({ adet: 4, birim: 'gün' });                  // 4 gün vinç 4 baskı değildir
    expect(d.toplamlar.TRY).toMatchObject({ baski: 1000, montaj: 250, hizmet: 1290, tutar: 2540 });

    await page.evaluate(j => rpAc('baski', { sablon: 'takip', donem: 'ozel', bas: '2031-06-01', bit: '2031-06-30', is: j, _alici: 'ic' }), job);
    await page.waitForFunction(() => ui._rpModel && ui._rpModel.sablon === 'takip' && !rpDurum().yukleniyor);
    const t = await page.evaluate(() => JSON.parse(JSON.stringify(ui._rpModel)));
    const ortak = t.satirlar.find(s => s.rows && s.rows.length === 2);
    expect(ortak).toMatchObject({ mSpan: 2, bedel: [{ pb: 'TRY', v: 1250 }] });   // 600+400+250, montaj bir kez
    expect(ortak.rows[0]).toMatchObject({ mTarih: '2031-06-05', urun: 'S13T baskı A' });
    expect(t.satirlar.filter(s => s.tip === 'kalem').length).toBe(3);
    expect(t.toplamlar.TRY.tutar).toBe(2540);

    /* Excel: montaj hücresi iki baskı satırında TEK birleşik hücre. */
    const [indir] = await Promise.all([page.waitForEvent('download'), page.locator('#rpXlsB').click()]);
    const b64 = fs.readFileSync(await indir.path()).toString('base64');
    const birlesik = await page.evaluate(async b => { const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Uint8Array.from(atob(b), c => c.charCodeAt(0)).buffer);
      const ws = wb.worksheets[0]; let r0 = 0; ws.eachRow((r, i) => { if (String(r.getCell(3).text).startsWith('S13T baskı A')) r0 = i; });
      return { r0, ust: ws.getCell(r0, 8).isMerged, esit: ws.getCell(r0 + 1, 8).master.address === ws.getCell(r0, 8).address,
        bedel: ws.getCell(r0, 7).value, tarih: ws.getCell(r0, 1).type }; }, b64);
    expect(birlesik).toMatchObject({ ust: true, esit: true, bedel: 1250, tarih: 4 /* ExcelJS ValueType.Date */ });
  });

  test('bağlama RPC: kalem yalnız aynı işte; çıkarınca tek kalan temizlenir; aktif olmayan üye bağlayamaz', async () => {
    const a = await kalemKur('Kalem RPC A'), b = await kalemKur('Kalem RPC B');
    /* bağsız montaj (A) → A'nın baskısına bağlanır */
    let r = await rpc('uye', 'operation_kalem_bagla', { p_op: a.ids[3], p_with: a.ids[0] });
    expect(r.durum).toBe(200);
    expect(kk(a.ids[3])).toBe(kk(a.ids[0]));
    /* başka işin kaydına bağlanamaz */
    r = await rpc('uye', 'operation_kalem_bagla', { p_op: a.ids[4], p_with: b.ids[0] });
    expect(r.durum).toBeGreaterThanOrEqual(400);
    expect(kk(a.ids[4])).toBe('');
    /* doğrudan güncelleme de tetikleyiciye takılır */
    const u = await rest('uye', `work_operations?id=eq.${b.ids[4]}`, { method: 'PATCH', body: { kalem_key: kk(a.ids[0]) } });
    expect(u.durum).toBeGreaterThanOrEqual(400);
    /* iki üyeli kalemden biri çıkınca kalan tek üyenin anahtarı temizlenir */
    const v = await kalemKur('Kalem RPC C');
    await rpc('uye', 'operation_kalem_bagla', { p_op: v.ids[4], p_with: v.ids[3] });
    expect(kk(v.ids[4])).not.toBe(''); expect(kk(v.ids[3])).toBe(kk(v.ids[4]));
    await rpc('uye', 'operation_kalem_bagla', { p_op: v.ids[4], p_with: null });
    expect(kk(v.ids[4])).toBe(''); expect(kk(v.ids[3])).toBe('');
    /* aktif olmayan üye: kaydı göremez, bağlayamaz */
    r = await rpc('pasif', 'operation_kalem_bagla', { p_op: a.ids[4], p_with: a.ids[0] });
    expect(r.durum).toBeGreaterThanOrEqual(400);
    expect(kk(a.ids[4])).toBe('');
  });

  test('kayıt formu: aynı üretim kalemi seçimi kaydedilir ve raporda yan yana görünür', async ({ page }) => {
    const { job, ids } = await kalemKur('Kalem form');
    await girisYap(page, 'uye');
    await page.evaluate(([j, o]) => workAc(j, { bolum: 'op', opId: o }), [job, ids[3]]);
    await page.evaluate(o => opForm(o), ids[3]);
    await expect(page.locator('#opKalem')).toBeVisible();
    await page.selectOption('#opKalem', String(ids[0]));
    await page.locator('#modalBg.open').getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.locator('#modalBg.open')).toHaveCount(0);
    expect(kk(ids[3])).toBe(kk(ids[0]));
    /* tarihsiz kalem dönem seçiliyken sessizce kaybolmaz: sayısı söylenir */
    sql(`update work_operations set planned_date=null where id=${ids[4]}`);
    await page.evaluate(j => rpAc('baski', { sablon: 'takip', donem: 'ozel', bas: '2031-06-01', bit: '2031-06-30', is: j, _alici: 'ic' }), job);
    await page.waitForFunction(() => ui._rpModel && ui._rpModel.sablon === 'takip' && !rpDurum().yukleniyor);
    const t = await page.evaluate(() => JSON.parse(JSON.stringify(ui._rpModel)));
    expect(t.tarihsizDisarda).toBe(1);
    expect(t.uyari.join(' ')).toContain('tarihi girilmemiş');
    const ortak = t.satirlar.find(s => s.rows && s.rows.length === 2);
    expect(ortak.not).toContain('Baskı + montaj');
    expect(t.satirlar.some(s => s.rows && s.rows.some(r => /bağsız montaj/.test(r.urun)))).toBe(false);   // artık kalemin montajı
  });
});

test.describe('Diğer raporlar', () => {
  const planAc = (page, kisi) => page.evaluate(k => rpAc('plan', { kisi: k, donem: 'ozel', bas: '2027-03-15', bit: '2027-03-15', randevu: true }), kisi)
    .then(() => page.waitForFunction(() => ui._rpModel && ui._rpTur === 'plan' && !rpDurum().yukleniyor));

  test('kişisel çalışma planı: randevu yalnız sahibinin planında; başkası için plan erişim genişletmez', async ({ browser }) => {
    const uye = teamIdOf('uye');
    const s1 = await (await browser.newContext()).newPage();
    await girisYap(s1, 'uye'); await planAc(s1, uye);
    await expect(s1.locator('#rpPrev')).toContainText('S13 özel randevu');            // pozitif kontrol
    const s2 = await (await browser.newContext()).newPage();
    await girisYap(s2, 'uye2'); await planAc(s2, uye);
    await expect(s2.locator('#rpPrev')).not.toContainText('S13 özel randevu');
    expect(JSON.stringify(await s2.evaluate(() => ui._rpModel))).not.toContain('S13 özel randevu');
  });

  test('iş özeti: dış paylaşımda iç güncelleme metni yok, iç kullanımda var', async ({ page }) => {
    const job = await isOlustur('uye', 'İş özeti');
    const e = await rest('uye', 'entries', { method: 'POST', body: { job_id: job, body: 'S13T iç yazışma metni', created_by_team_id: teamIdOf('uye') } });
    expect(e.durum).toBe(201);
    await girisYap(page, 'uye');
    const ac = ic => page.evaluate(([j, ic]) => rpAc('is', ic ? { is: j, _alici: 'ic', kisiler: true, guncelleme: true, aksiyon: true, muhasebe: true } : { is: j }), [job, ic])
      .then(() => page.waitForFunction(() => ui._rpModel && ui._rpTur === 'is' && !rpDurum().yukleniyor));
    await ac(true);
    await expect(page.locator('#rpPrev')).toContainText('S13T iç yazışma metni');
    await ac(false);
    await expect(page.locator('#rpPrev')).toContainText(ONEK + 'İş özeti');
    await expect(page.locator('#rpPrev')).not.toContainText('S13T iç yazışma metni');
    expect(JSON.stringify(await page.evaluate(() => ui._rpModel))).not.toContain('S13T iç yazışma metni');
  });
});

test.describe('Çıktı ve bağlantı güvenliği', () => {
  test('Excel: "=" ile başlayan kullanıcı metni formül olarak yazılmaz', async ({ page }) => {
    const job = await isOlustur('uye', 'Formül');
    const r = await rpc('uye', 'operations_batch_create', { p_job: job, p_rows: [
      { operation_type: 'baski', description: '=HYPERLINK("https://ornek.test","tikla")', planned_date: '2031-05-01' },
      { operation_type: 'montaj', description: '+1+2', planned_date: '2031-05-02' }] });
    expect(r.durum).toBe(200);
    await girisYap(page, 'uye');
    await raporAc(page, job, false);
    const [indir] = await Promise.all([page.waitForEvent('download'), page.locator('#rpXlsB').click()]);
    const b64 = fs.readFileSync(await indir.path()).toString('base64');
    const sonuc = await page.evaluate(async b => {
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Uint8Array.from(atob(b), c => c.charCodeAt(0)).buffer);
      let formul = 0, metin = [];
      wb.eachSheet(ws => ws.eachRow(r => r.eachCell(c => { if (c.formula || c.type === ExcelJS.ValueType.Formula) formul++;
        if (/HYPERLINK|\+1\+2/.test(String(c.text))) metin.push(String(c.text)); })));
      return { formul, metin }; }, b64);
    expect(sonuc.formul).toBe(0);
    expect(sonuc.metin.length).toBe(2);                     // metin olarak, olduğu gibi duruyor
  });

  test('belge bağlantısı yalnız https olabilir (javascript:/data:/http: reddedilir)', async () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'http://ornek.test/a.pdf', 'https://ornek.test/a b']) {
      const r = await rpc('uye', 'document_create', { p_docs: [{ provider: 'external', external_url: url, original_name: 's13t-url', doc_type: 'diger', links: [] }] });
      expect(r.durum, url).toBeGreaterThanOrEqual(400);
    }
    const ok = await rpc('uye', 'document_create', { p_docs: [{ provider: 'external', external_url: 'https://ornek.test/a.pdf', original_name: 's13t-url', doc_type: 'diger', links: [] }] });
    expect(ok.durum).toBe(200);                              // pozitif kontrol
  });
});
