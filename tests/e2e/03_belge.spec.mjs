// Belgeler: ilişkisiz kayıt, başarısız yükleme ve tekrar deneme, bağlantı
// kaldırılınca dosyanın korunması, yıkıcı onayda güvenli odak.
import { test, expect } from '@playwright/test';
import { girisYap, sql, rpc, isOlustur, dlg, jeton, API, ANON, temizle } from '../lib/ortam.mjs';

/* Her test yalnız kendi işaretli verisiyle başlar (tekrar/sıra bağımsız). */
test.beforeEach(() => temizle());

const say = q => +sql(q);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

async function belgeFormuDoldur(page, dosyaAdi, baslik, isId) {
  await page.evaluate(() => belgeForm({}));
  await expect(page.locator('#modalBg.open #bfKaydet')).toBeVisible();
  await page.locator('#ek_bf input[type=file]').setInputFiles({ name: dosyaAdi, mimeType: 'application/pdf', buffer: PDF });
  const tur = page.locator('#ek_bf .ek-tur').first();
  if (!(await tur.inputValue())) await tur.selectOption('teklif');
  await expect(page.locator('#bfBaslik')).toBeVisible();
  await page.fill('#bfBaslik', baslik);
  if (isId) await page.selectOption('#bfIs', String(isId));
}
/* Depodaki nesne gerçekten duruyor mu? Uygulamanın kendi yolu: imzalı URL. */
async function dosyaDuruyor(yol) {
  const t = await jeton('uye');
  const r = await fetch(`${API}/storage/v1/object/sign/documents/${yol}`, { method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 60 }) });
  if (r.status !== 200) return false;
  const j = await r.json();
  const g = await fetch(`${API}/storage/v1${j.signedURL}`);
  return g.status === 200 && (await g.arrayBuffer()).byteLength === PDF.length;
}

test('ilişkisiz belge kaydedilir; dosya depoda ve açılabilir', async ({ page }) => {
  await girisYap(page, 'uye');
  await belgeFormuDoldur(page, 's13t-iliskisiz.pdf', 'S13T ilişkisiz');
  await expect(page.locator('#bfIliski')).toContainText('İlişkilendirilmemiş');
  await page.locator('#bfKaydet').click();
  await expect(page.locator('#modalBg.open')).toHaveCount(0);
  const [id, yol] = sql(`select id||'|'||storage_path from documents where title='S13T ilişkisiz'`).split('|');
  expect(say(`select count(*) from document_links where document_id=${id}`)).toBe(0);
  expect(await dosyaDuruyor(yol)).toBe(true);
});

test('yükleme başarısızsa yarım belge yok; tekrar deneme tek belge üretir', async ({ page }) => {
  await girisYap(page, 'uye');
  let kes = true;
  await page.route('**/storage/v1/object/documents/**', r => (kes && r.request().method() === 'POST') ? r.abort('failed') : r.continue());
  await belgeFormuDoldur(page, 's13t-tekrar.pdf', 'S13T tekrar');
  await page.locator('#bfKaydet').click();
  await expect(page.locator('#bfDurum')).toContainText('Kaydedilemedi');
  expect(say(`select count(*) from documents where title='S13T tekrar'`)).toBe(0);
  kes = false;
  await page.locator('#bfKaydet').click();
  await expect(page.locator('#modalBg.open')).toHaveCount(0);
  expect(say(`select count(*) from documents where title='S13T tekrar'`)).toBe(1);
});

test('işten bağlantı kaldırılınca belge ve dosya korunur', async ({ page }) => {
  const isId = await isOlustur('uye', 'Belge bağlantı');
  await girisYap(page, 'uye');
  await belgeFormuDoldur(page, 's13t-bagli.pdf', 'S13T bağlı', isId);
  await page.locator('#bfKaydet').click();
  await expect(page.locator('#modalBg.open')).toHaveCount(0);
  const [id, yol] = sql(`select id||'|'||storage_path from documents where title='S13T bağlı'`).split('|');
  expect(say(`select count(*) from document_links where document_id=${id} and job_id=${isId}`)).toBe(1);

  await page.evaluate(i => belgeDetay(i), +id);
  await page.getByRole('button', { name: /bağlantısını kaldır/ }).click();
  await expect(dlg(page)).toContainText('dosya silinmez');
  await page.locator('#mpDlgOk').click();
  await expect(page.locator('.bd-bag')).toHaveCount(0);
  expect(say(`select count(*) from documents where id=${id}`)).toBe(1);
  expect(say(`select count(*) from document_links where document_id=${id}`)).toBe(0);
  expect(await dosyaDuruyor(yol)).toBe(true);
  expect(say(`select count(*) from entries where document_id=${id} and system_kind='document_unlinked'`)).toBe(1);
});

test('kalıcı silme onayında odak güvenli düğmede; yanlışlıkla Enter silmez ve odak geri döner', async ({ page }) => {
  await girisYap(page, 'uye');
  await belgeFormuDoldur(page, 's13t-odak.pdf', 'S13T odak');
  await page.locator('#bfKaydet').click();
  await expect(page.locator('#modalBg.open')).toHaveCount(0);
  const id = say(`select id from documents where title='S13T odak'`);
  await page.evaluate(i => belgeDetay(i), id);
  /* Açılış odağı ilk düğmeye yerleşir; PDF önizleme yüklenince odağı ÇALMAZ. */
  await expect(page.locator('#bdPdf')).toHaveAttribute('src', /.+/);
  await expect(page.locator('#modal').getByRole('button', { name: 'Aç', exact: true })).toBeFocused();
  const sil = page.getByRole('button', { name: 'Kalıcı olarak sil' });
  await sil.focus();
  await sil.press('Enter');
  await expect(dlg(page)).toBeVisible();
  await expect(page.locator('#mpDlgNo')).toBeFocused();       // S13 B05
  await page.keyboard.press('Enter');                        // yanlışlıkla Enter: silmez
  await expect(page.locator('#mpDlgBg')).toHaveCount(0);
  expect(say(`select count(*) from documents where id=${id}`)).toBe(1);
  await expect(sil).toBeFocused();                           // odak tetikleyiciye döner
});
