// Mecra yerleşimleri: statik yüz münhasırdır, toplu kayıt ya hep ya hiç,
// LED alanı eşzamanlıdır. Sabit dönem: 2031 (örnek veriyle kesişmez).
import { test, expect } from '@playwright/test';
import { girisYap, sql, rpc, isOlustur, kurumId, bosYuzeyler, dlg, temizle } from '../lib/ortam.mjs';

/* Her test yalnız kendi işaretli verisiyle başlar (tekrar/sıra bağımsız). */
test.beforeEach(() => temizle());

const say = q => +sql(q);
const yerlestir = (kim, hedefler, bas, bit, c = 'confirmed') => rpc(kim, 'media_placements_create', {
  p_common: { customer_id: kurumId(), commitment: c, start_date: bas, end_date: bit },
  p_targets: hedefler });
const donemde = (u, bas, bit) => say(`select count(*) from media_placements where unit_id=${u} and commitment<>'cancelled'
  and start_date<='${bit}' and coalesce(end_date,'9999-12-31')>='${bas}'`);

test.describe('Statik yüz (API)', () => {
  test('aynı yüze eşzamanlı iki kayıt: yalnız biri kazanır', async () => {
    const [u] = bosYuzeyler(1, '2031-01-01', '2031-12-31');
    const [a, b] = await Promise.all([
      yerlestir('uye', [{ unit_id: u }], '2031-05-01', '2031-05-31'),
      yerlestir('uye2', [{ unit_id: u }], '2031-05-15', '2031-06-15')]);
    const kazanan = [a, b].filter(r => r.durum === 200 && r.veri.ok).length;
    expect(kazanan).toBe(1);
    expect(donemde(u, '2031-05-01', '2031-06-15')).toBe(1);
  });

  test('toplu kayıtta bir hedef çakışırsa hiçbiri yazılmaz', async () => {
    const [dolu, bos] = bosYuzeyler(2, '2031-01-01', '2031-12-31');
    expect((await yerlestir('uye', [{ unit_id: dolu }], '2031-03-01', '2031-03-31')).veri.ok).toBe(true);
    const r = await yerlestir('uye', [{ unit_id: bos }, { unit_id: dolu }], '2031-03-10', '2031-03-20');
    expect(r.veri.ok).toBe(false);
    expect(r.veri.sorunlar.map(s => s.unit_id)).toEqual([dolu]);
    expect(donemde(bos, '2031-03-01', '2031-03-31')).toBe(0);
  });

  test('bitişi bilinmeyen kayıt ileriye dönük bloklar; geçersiz ve ters tarih reddedilir', async () => {
    const [u] = bosYuzeyler(1, '2031-01-01', '2035-12-31');
    expect((await yerlestir('uye', [{ unit_id: u }], '2031-07-01', null)).veri.ok).toBe(true);
    expect((await yerlestir('uye', [{ unit_id: u }], '2033-01-01', '2033-01-10')).veri.ok).toBe(false);
    expect((await yerlestir('uye', [{ unit_id: u }], '2031-02-30', '2031-03-01')).durum).toBeGreaterThanOrEqual(400);
    const ters = await yerlestir('uye', [{ unit_id: u }], '2031-03-10', '2031-03-01');
    expect(ters.durum >= 400 || ters.veri.ok === false).toBe(true);
  });

  test('LED yayın alanı eşzamanlıdır: aynı dönemde iki kampanya kabul edilir', async () => {
    const alan = say(`select min(a.id) from alt_mecralar a join mecralar m on m.id=a.mecra_id
      where m.operational and a.occupancy_mode='concurrent'`);
    test.skip(!alan, 'Test yığınında LED alanı yok');
    const once = say(`select count(*) from media_placements where alt_mecra_id=${alan}`);
    const [a, b] = await Promise.all([
      yerlestir('uye', [{ alt_mecra_id: alan }], '2031-09-01', '2031-09-30'),
      yerlestir('uye2', [{ alt_mecra_id: alan }], '2031-09-10', '2031-09-20')]);
    expect(a.veri.ok && b.veri.ok).toBe(true);
    expect(say(`select count(*) from media_placements where alt_mecra_id=${alan}`) - once).toBe(2);
  });
});

test.describe('Statik yüz (arayüz)', () => {
  async function formAc(page, hedefler, isId) {
    await page.evaluate(([h, i]) => mForm({ hedefler: h, isId: i, taah: 'confirmed' }), [hedefler, isId]);
    await expect(page.locator('#modalBg.open #mfBas')).toBeVisible();
    await page.selectOption('#mfIs', String(isId));
    await expect(page.locator('#mfKurum')).toHaveValue(String(kurumId()));
  }

  test('çakışma raporu her hedefi söyler ve hiçbir kayıt oluşmaz', async ({ page }) => {
    const [dolu, bos] = bosYuzeyler(2, '2031-01-01', '2031-12-31');
    await yerlestir('uye', [{ unit_id: dolu }], '2031-10-01', '2031-10-31');
    const isId = await isOlustur('uye', 'Mecra çakışma');
    await girisYap(page, 'uye');
    await formAc(page, [{ unit_id: bos }, { unit_id: dolu }], isId);
    await page.fill('#mfBas', '2031-10-05');
    await page.fill('#mfBit', '2031-10-25');
    await page.locator('#mfKaydet').click();
    await expect(page.locator('.md-sorun')).toContainText('hiçbir kayıt oluşturulmadı');
    await expect(page.locator('.md-sorun li')).toHaveCount(1);
    expect(donemde(bos, '2031-10-01', '2031-10-31')).toBe(0);
  });

  test('sunucu sınırındaki çakışma (23P01) anlaşılır Türkçe iletiyle gösterilir', async ({ page }) => {
    const [u] = bosYuzeyler(1, '2031-01-01', '2031-12-31');
    const isId = await isOlustur('uye', 'Mecra 23P01');
    await girisYap(page, 'uye');
    await page.route('**/rest/v1/rpc/media_placements_create', r => r.fulfill({ status: 409, contentType: 'application/json',
      body: JSON.stringify({ code: '23P01', message: 'conflicting key value violates exclusion constraint "media_placements_no_overlap"', details: null, hint: null }) }));
    await formAc(page, [{ unit_id: u }], isId);
    await page.fill('#mfBas', '2031-11-01');
    await page.fill('#mfBit', '2031-11-30');
    await page.locator('#mfKaydet').click();
    await expect(dlg(page)).toContainText('az önce başka bir kayıtla doldu');
    await expect(dlg(page)).not.toContainText('exclusion');
    await page.locator('#mpDlgOk').click();
    await expect(page.locator('#modalBg.open #mfBas')).toHaveValue('2031-11-01');   // form yerinde
  });
});
