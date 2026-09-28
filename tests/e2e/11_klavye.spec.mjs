// S14 — kritik akış yalnız klavyeyle: iş oluşturma (kurum seçimi dahil) ve
// aşama değişikliği. Fare kullanılmaz; odak Tab ile ilerler.
import { test, expect } from '@playwright/test';
import { girisYap, sql, temizle, ONEK } from '../lib/ortam.mjs';

test.beforeEach(() => temizle());

async function tabIle(page, kosul, en = 60) {
  for (let i = 0; i < en; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(kosul)) return;
  }
  throw new Error('Odak hedefe Tab ile ulaşmadı');
}

test('yalnız klavye: Yeni İş → başlık → kurum ara/seç → Oluştur → aşamayı Teklif yap', async ({ page }) => {
  await girisYap(page, 'uye');
  await page.evaluate(() => go('is-takibi'));
  await expect(page.locator('#ttl')).toHaveText('İşler');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await tabIle(page, () => /Yeni İş/.test((document.activeElement || {}).textContent || ''));
  await page.keyboard.press('Enter');
  await expect(page.locator('#modalBg.open #jt')).toBeFocused();              // odak ilk alanda
  await page.keyboard.type(ONEK + 'Klavye');
  await tabIle(page, () => document.activeElement && document.activeElement.id === 'jc__ara', 5);
  await page.keyboard.type('regresyon');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  expect(await page.inputValue('#jc')).toBe(sql(`select id from customers where firma='S13 Regresyon Kurumu'`));
  await tabIle(page, () => (document.activeElement || {}).textContent === 'Oluştur', 40);
  await page.keyboard.press('Enter');
  await expect(page.locator('#wFaz')).toBeVisible();
  const id = +sql(`select id from jobs where title='${ONEK}Klavye'`);
  expect(id).toBeGreaterThan(0);

  /* Aşama: gösterge düğmesine Tab, Enter ile taslak, Kaydet'e Tab, Enter. */
  await tabIle(page, () => { const a = document.activeElement; return !!a && !!a.closest('#wFaz') && /Teklif/.test(a.textContent); });
  await page.keyboard.press('Enter');
  await expect(page.locator('.w-faz-t')).toBeVisible();
  await expect(page.locator('#wFaz button[data-faz=teklif]')).toBeFocused();       // odak kaybolmadı
  await tabIle(page, () => (document.activeElement || {}).id === 'wFazKaydet', 8);
  await page.keyboard.press('Enter');
  await expect(page.locator('#wFaz li.on')).toContainText('Teklif');
  expect(sql(`select status from jobs where id=${id}`)).toBe('teklif');
});

test('yalnız klavye: onay penceresinde Tab dışarı kaçmaz, Esc kapatır ve odak geri döner', async ({ page }) => {
  await girisYap(page, 'uye');
  await page.evaluate(() => jobForm());
  await expect(page.locator('#jt')).toBeFocused();
  await page.keyboard.type('taslak');
  await page.keyboard.press('Escape');                                      // kirli form → onay
  await expect(page.locator('#mpDlgBg')).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('#mpDlgBg'))).toBe(true);
  }
  await page.keyboard.press('Escape');                                      // onayı kapat → forma dön
  await expect(page.locator('#mpDlgBg')).toHaveCount(0);
  await expect(page.locator('#modalBg.open #jt')).toHaveValue('taslak');
  expect(await page.evaluate(() => !!document.activeElement.closest('#modal'))).toBe(true);
});
