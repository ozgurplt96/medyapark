// S14 — yönetim formları: tam okuma, yalnız değişen alan, eşzamanlı değişikliği
// ezmeme, değişiklik yoksa yazmama, hatada taslağı koruma, sunucu doğrulaması.
import { test, expect } from '@playwright/test';
import { girisYap, sql, rest, dlg, temizle } from '../lib/ortam.mjs';

test.beforeEach(() => temizle());
const kaydet = page => page.locator('#modal').getByRole('button', { name: 'Kaydet', exact: true }).click();

test('tedarikçi: başkası değiştirdiyse ezilmez; form ve taslak yerinde', async ({ page }) => {
  const id = +sql(`insert into suppliers (firma, iban, telefon) values ('S13T Tedarikçi', 'TR00 1111', '0322 000') returning id`);
  await girisYap(page, 'admin');
  await page.evaluate(i => supForm(i), id);
  await expect(page.locator('#sib')).toHaveValue('TR00 1111');
  expect((await rest('admin', `suppliers?id=eq.${id}`, { method: 'PATCH', body: { iban: 'TR00 2222' } })).durum).toBeLessThan(300);
  await page.fill('#st', '0322 999');
  await kaydet(page);
  await expect(dlg(page)).toContainText('başka biri tarafından değiştirildi');
  await expect(dlg(page)).toContainText('IBAN');
  await page.locator('#mpDlgOk').click();
  await expect(page.locator('#modalBg.open #st')).toHaveValue('0322 999');
  expect(sql(`select iban||'|'||telefon from suppliers where id=${id}`)).toBe('TR00 2222|0322 000');
});

test('tedarikçi: bayat listeden açılan form güncel kaydı gösterir; yalnız değişen alan yazılır', async ({ page }) => {
  const id = +sql(`insert into suppliers (firma, iban, telefon) values ('S13T Bayat', 'TR00 1111', '0322 000') returning id`);
  await girisYap(page, 'admin');
  await page.evaluate(() => go('tedarikciler'));
  await expect(page.locator('#content')).toContainText('S13T Bayat');
  sql(`update suppliers set iban='TR00 3333' where id=${id}`);                // liste açıkken başka yerden
  await page.evaluate(i => supForm(i), id);
  await expect(page.locator('#sib')).toHaveValue('TR00 3333');
  await page.fill('#st', '0322 555');
  await kaydet(page);
  await expect(page.locator('#modalBg.open')).toHaveCount(0);
  expect(sql(`select iban||'|'||telefon from suppliers where id=${id}`)).toBe('TR00 3333|0322 555');
});

test('değişiklik yoksa yazma ve kayıt günlüğü yok', async ({ page }) => {
  const id = +sql(`insert into notes (konu, body) values ('S13T Not', 'içerik') returning id`);
  await girisYap(page, 'admin');
  const log = () => +sql(`select count(*) from activity_log`);
  const once = log();
  await page.evaluate(i => noteForm(i), id);
  await kaydet(page);
  await expect(page.locator('#modalBg.open')).toHaveCount(0);
  expect(sql(`select coalesce(updated_at::text,'yok') from notes where id=${id}`)).toBe('yok');
  expect(log()).toBe(once);
});

test('not: kayıt başarısızsa taslak kaybolmaz', async ({ page }) => {
  const id = +sql(`insert into notes (konu, body) values ('S13T Not 2', 'eski') returning id`);
  await girisYap(page, 'admin');
  await page.route('**/rest/v1/notes?*', r => r.request().method() === 'PATCH'
    ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'boom' }) }) : r.continue());
  await page.evaluate(i => noteForm(i), id);
  await page.fill('#nb', 'yeni içerik taslağı');
  await kaydet(page);
  await expect(dlg(page)).toBeVisible();
  await page.locator('#mpDlgOk').click();
  await expect(page.locator('#modalBg.open #nb')).toHaveValue('yeni içerik taslağı');
  expect(sql(`select body from notes where id=${id}`)).toBe('eski');
});

test('ürün: eşzamanlı fiyat değişikliği ezilmez', async ({ page }) => {
  const id = +sql(`insert into products (name, prices) values ('S13T Ürün', '{"1 ay": 100}') returning id`);
  await girisYap(page, 'admin');
  await page.evaluate(() => go('urunler'));
  await page.evaluate(i => prodEdit(i), id);
  await expect(page.locator('#pname')).toHaveValue('S13T Ürün');
  expect((await rest('admin', `products?id=eq.${id}`, { method: 'PATCH', body: { prices: { '1 ay': 150 } } })).durum).toBeLessThan(300);
  await page.fill('#pname', 'S13T Ürün yeni ad');
  await page.locator('#prodEd .btn-primary').click();
  await expect(dlg(page)).toContainText('Fiyatlar');
  await page.locator('#mpDlgOk').click();
  await expect(page.locator('#pname')).toHaveValue('S13T Ürün yeni ad');
  expect(sql(`select name||'|'||(prices->>'1 ay') from products where id=${id}`)).toBe('S13T Ürün|150');
});

test('sayfa: aynı adresli yeni sayfa mevcut içeriği ezmez; düzenlemede eşzamanlılık korunur', async ({ page }) => {
  sql(`insert into pages (slug, title, blocks, in_menu, sort) values ('s13t-hakkinda', 'S13T Hakkında', '[{"type":"text","text":"yayındaki içerik"}]', false, 99)`);
  await girisYap(page, 'admin');
  await page.evaluate(() => go('sayfalar'));
  await page.evaluate(() => { pageNew(); });
  await page.fill('#mpPromptI', 'S13T Hakkında');
  await page.locator('#mpDlgOk').click();
  await expect(dlg(page)).toContainText('zaten var');
  await page.locator('#mpDlgOk').click();
  expect(sql(`select blocks->0->>'text' from pages where slug='s13t-hakkinda'`)).toBe('yayındaki içerik');

  await page.evaluate(() => pageEdit('s13t-hakkinda'));
  await expect(page.locator('#pgTitle')).toHaveValue('S13T Hakkında');
  expect((await rest('admin', 'pages?slug=eq.s13t-hakkinda', { method: 'PATCH', body: { title: 'S13T Hakkında (Halil)' } })).durum).toBeLessThan(300);
  await page.fill('#pgTitle', 'S13T Hakkımızda');
  await page.evaluate(() => pageSaveBlocks());
  await expect(dlg(page)).toContainText('başka biri tarafından değiştirildi');
  expect(sql(`select title from pages where slug='s13t-hakkinda'`)).toBe('S13T Hakkında (Halil)');
});

test('sunucu doğrulaması ve yetki: boş ad reddedilir; ekip üyesi yönetim kaydını değiştiremez', async () => {
  const id = +sql(`insert into suppliers (firma) values ('S13T Doğrulama') returning id`);
  expect((await rest('admin', `suppliers?id=eq.${id}`, { method: 'PATCH', body: { firma: '  ' } })).durum).toBe(400);
  const r = await rest('uye', `suppliers?id=eq.${id}`, { method: 'PATCH', body: { firma: 'S13T değişti' } });
  expect(r.veri).toEqual([]);
  expect(sql(`select firma from suppliers where id=${id}`)).toBe('S13T Doğrulama');
});
