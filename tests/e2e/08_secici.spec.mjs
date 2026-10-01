// S14 — aranabilir kurum seçici (500+ kayıt, Türkçe arama, klavye, mobil).
import { test, expect } from '@playwright/test';
import { girisYap, sql, isOlustur, kurumId, dlg, temizle, ONEK } from '../lib/ortam.mjs';

test.beforeEach(() => {
  temizle();
  sql(`insert into customers (firma) select 'S13T Kurum ' || lpad(g::text, 3, '0') from generate_series(1, 600) g;
       insert into customers (firma, vergi_no) values ('S13T İstanbul Şişe Çam Sanayi ve Ticaret Anonim Şirketi Uzun Unvanlı Bölge Müdürlüğü', '1111111111'),
         ('S13T Benzer Ad', '2222222222'), ('S13T Benzer Ad', '3333333333');`);
});

const kutu = page => page.locator('#jc__ara');
const liste = page => page.locator('#jc__ara_l');

test('Türkçe arama, klavye ile seçim, ilk sonuç kendiliğinden seçilmez', async ({ page }) => {
  await girisYap(page, 'uye');
  await page.evaluate(() => jobForm());
  await expect(kutu(page)).toHaveAttribute('role', 'combobox');
  await kutu(page).click();
  await kutu(page).pressSequentially('istanbul sise');
  await expect(liste(page).locator('li[role=option]')).toHaveCount(1);
  await kutu(page).press('Enter');                                   // vurgulu satır yok → seçim yok
  expect(await page.inputValue('#jc')).toBe('');
  await kutu(page).press('ArrowDown');
  await kutu(page).press('Enter');
  const id = sql(`select id from customers where firma like 'S13T İstanbul%'`);
  expect(await page.inputValue('#jc')).toBe(id);
  await expect(kutu(page)).toHaveValue(/İstanbul Şişe Çam/);
  await expect(page.locator('#jkisiHint')).not.toHaveText('Önce kurum seçin.');   // onchange çalıştı
  await expect(page.locator('#modalBg.open')).toBeVisible();
});

test('çok sonuç sessizce kesilmez; benzer adlar ek bilgiyle ayrışır; boş sonuç söylenir', async ({ page }) => {
  await girisYap(page, 'uye');
  await page.evaluate(() => jobForm());
  await kutu(page).click();
  await kutu(page).pressSequentially('s13t kurum');
  await expect(liste(page)).toContainText('sonuç daha — aramayı daraltın');
  await kutu(page).fill('');
  await kutu(page).pressSequentially('kurum 01');
  await expect(liste(page).locator('li[role=option]').first()).toContainText('S13T Kurum 010');   // alfabetik, id sırası değil
  await kutu(page).fill('');
  await kutu(page).pressSequentially('kurum 599');
  await expect(liste(page).locator('li[role=option]')).toHaveCount(1);   // 500+ sonrasındaki kayıt da bulunur
  await kutu(page).fill('');
  await kutu(page).pressSequentially('benzer ad');
  await expect(liste(page).locator('li[role=option]')).toHaveCount(2);
  await expect(liste(page)).toContainText('VKN 2222222222');
  await expect(liste(page)).toContainText('VKN 3333333333');
  await kutu(page).fill('');
  await kutu(page).pressSequentially('zzzqqq');
  await expect(liste(page)).toContainText('Eşleşen kayıt yok');
});

test('Esc listeyi kapatır, formu değil; temizle düğmesi seçimi kaldırır', async ({ page }) => {
  await girisYap(page, 'uye');
  await page.evaluate(k => jobForm(null, null, { custId: k }), kurumId());
  await expect(kutu(page)).toHaveValue('S13 Regresyon Kurumu');
  await kutu(page).click();
  await expect(liste(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(liste(page)).toBeHidden();
  await expect(page.locator('#modalBg.open')).toBeVisible();
  await expect(kutu(page)).toHaveValue('S13 Regresyon Kurumu');      // arama metni seçimi bozmadı
  await page.locator('#modal .ara-x').first().click();
  expect(await page.inputValue('#jc')).toBe('');
});

test('düzenleme açıldığında mevcut kurum yüklenir; seçim değişimi kaydedilmemiş değişiklik sayılır', async ({ page }) => {
  const id = await isOlustur('uye', 'Seçici düzenleme');
  await girisYap(page, 'uye');
  await page.evaluate(i => jobForm(null, i), id);
  await expect(kutu(page)).toHaveValue('S13 Regresyon Kurumu');
  await kutu(page).click();
  await kutu(page).pressSequentially('kurum 001');
  await kutu(page).press('ArrowDown'); await kutu(page).press('Enter');
  await page.locator('#modal').getByRole('button', { name: 'Vazgeç', exact: true }).click();
  await expect(dlg(page)).toContainText('Kaydedilmemiş');
  await page.locator('#mpDlgNo').click();
  await page.locator('#modal').getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.locator('#modalBg.open')).toHaveCount(0);
  expect(sql(`select c.firma from jobs j join customers c on c.id=j.customer_id where j.id=${id}`)).toBe('S13T Kurum 001');
});

test('etiket seçiciye bağlı; mobilde pencere içinde sayfa taşması yok', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await girisYap(page, 'uye');
  await page.evaluate(() => jobForm());
  await page.locator('label[for="jc__ara"]').click();
  await expect(kutu(page)).toBeFocused();
  await expect(liste(page)).toBeVisible();
  await kutu(page).pressSequentially('uzun unvanlı');
  await expect(liste(page).locator('li[role=option]')).toHaveCount(1);
  const olc = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth,
    r: document.querySelector('#jc__ara_l').getBoundingClientRect().right }));
  expect(olc.sw).toBeLessThanOrEqual(olc.iw);
  expect(olc.r).toBeLessThanOrEqual(olc.iw);
});

test('diğer kurum seçimleri de aynı bileşeni kullanır (belge, İşler süzgeci); baskı/montaj uygulayanı yalnız doğrulanmışları listeler', async ({ page }) => {
  const isId = await isOlustur('uye', 'Seçici diğer');
  await girisYap(page, 'uye');
  await page.evaluate(() => belgeForm({}));
  await expect(page.locator('#bfKurum__ara')).toHaveAttribute('role', 'combobox');
  await page.evaluate(() => closeModal());
  /* S19: uygulayan seçicisi bütün kurumları listelemez — yalnız doğrulanmış baskı
     merkezi / uygulayıcı kurum ve kişiler (kısa liste; arama bileşeni gerekmez). */
  await page.evaluate(i => opTopluForm(i), isId);
  await expect(page.locator('#opbSup__ara')).toHaveCount(0);
  const uyg = await page.locator('#opbSup option').allTextContents();
  expect(uyg.length).toBeLessThan(40);
  expect(uyg[0]).toContain('belirlenmedi');
  expect(uyg.some(t => /S13T Kurum|S13 Regresyon Kurumu/.test(t))).toBe(false);
  await page.evaluate(() => closeModal());
  await page.evaluate(async () => { await go('is-takibi'); await isTabGit('liste'); });
  await expect(page.locator('#isOrg__ara')).toHaveAttribute('role', 'combobox');
});
