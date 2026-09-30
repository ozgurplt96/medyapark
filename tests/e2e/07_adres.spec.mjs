// S14 — adres çubuğu: yenileme, doğrudan bağlantı, girişten dönüş,
// Geri/İleri, bulunamayan hedef, kaydedilmemiş değişiklik koruması.
import { test, expect } from '@playwright/test';
import { girisYap, sql, isOlustur, kurumId, dlg, temizle, APP, KULLANICI, PAROLA, ONEK } from '../lib/ortam.mjs';

test.beforeEach(() => temizle());
const hash = page => page.evaluate(() => location.hash);

test('iş ayrıntısı adreste; yenileme aynı işi açar', async ({ page }) => {
  const id = await isOlustur('uye', 'Adres yenileme');
  await girisYap(page, 'uye');
  await page.evaluate(i => workAc(i), id);
  await expect(page.locator('#wFaz')).toBeVisible();
  expect(await hash(page)).toBe(`#/is/${id}`);
  await page.reload();
  await expect(page.locator('#wFaz')).toBeVisible();
  expect(await page.evaluate(() => ui._work.id)).toBe(id);
  await expect(page.locator('#ttl')).toHaveText('İşler');
});

test('giriş gerektiren doğrudan bağlantı: girişten sonra hedefe dönülür', async ({ page }) => {
  await page.goto(`${APP}/admin#/kurum/${kurumId()}`);
  await page.fill('#lu', KULLANICI.uye);
  await page.fill('#lp', PAROLA);
  await page.locator('#lp').press('Enter');
  await expect(page.locator('#content h3')).toContainText('S13 Regresyon Kurumu');
  expect(await hash(page)).toBe(`#/kurum/${kurumId()}`);
});

test('alt sekme adreste; yazmak geçmişe girdi eklemez', async ({ page }) => {
  await girisYap(page, 'uye');
  await page.evaluate(async () => { await go('is-takibi'); await isTabGit('liste'); });
  expect(await hash(page)).toBe('#/isler?sekme=liste');
  const n = await page.evaluate(() => history.length);
  await page.locator('#content input[type=search], #content input.inp').first().pressSequentially('abc');
  expect(await page.evaluate(() => history.length)).toBe(n);
  await page.reload();
  await expect(page.locator('#content h3').first()).toContainText('Liste');   // Liste sekmesi açıldı
  expect(await hash(page)).toBe('#/isler?sekme=liste');
});

test('Geri/İleri adres ve ekranı birlikte taşır', async ({ page }) => {
  const id = await isOlustur('uye', 'Adres geri');
  await girisYap(page, 'uye');
  await page.evaluate(() => go('is-takibi'));
  await page.evaluate(i => workAc(i), id);
  await expect(page.locator('#wFaz')).toBeVisible();
  await page.evaluate(() => go('kurumlar'));
  await expect(page.locator('#hafQ')).toBeVisible();
  expect(await hash(page)).toMatch(/^#\/hafiza/);
  await page.goBack();
  await expect(page.locator('#wFaz')).toBeVisible();
  expect(await hash(page)).toBe(`#/is/${id}`);
  await page.goBack();
  await expect(page.locator('#ttl')).toHaveText('İşler');
  expect(await hash(page)).toMatch(/^#\/isler/);
  await page.goForward();
  expect(await hash(page)).toBe(`#/is/${id}`);
});

test('bulunamayan kayıt açıklanır; boş ekran yok', async ({ page }) => {
  await girisYap(page, 'uye');
  await page.evaluate(() => { location.hash = '#/is/987654321'; });
  await expect(page.locator('#content')).toContainText('İş bulunamadı');
  await expect(page.locator('#content')).toContainText('görme yetkiniz yok');
  expect(await hash(page)).toBe('#/is/987654321');
  await page.reload();
  await expect(page.locator('#content')).toContainText('İş bulunamadı');
  await page.evaluate(() => { location.hash = '#/kisi/987654321'; });
  await expect(page.locator('#content')).toContainText('Kişi bulunamadı');
});

test('yönetim ekranı adresi ekip üyesine yetki vermez', async ({ page }) => {
  await page.goto(`${APP}/admin#/dashboard`);
  await page.fill('#lu', KULLANICI.uye); await page.fill('#lp', PAROLA); await page.locator('#lp').press('Enter');
  await expect(page.locator('#ttl')).toHaveText('Panelim');
  expect(await hash(page)).toBe('#/panelim');
});

test('kaydedilmemiş form varken elle adres değişimi: kal → adres ve ekran eski yerinde', async ({ page }) => {
  await girisYap(page, 'uye');
  await page.evaluate(() => go('is-takibi'));
  const once = await hash(page);
  await page.evaluate(() => jobForm());
  await page.locator('#jt').pressSequentially('taslak');
  await page.evaluate(() => { location.hash = '#/hafiza'; });
  await expect(dlg(page)).toContainText('Kaydedilmemiş');
  await page.locator('#mpDlgNo').click();                             // Düzenlemeye dön
  await expect(page.locator('#modalBg.open #jt')).toHaveValue('taslak');
  await expect.poll(() => hash(page)).toBe(once);
  await expect(page.locator('#ttl')).toHaveText('İşler');
});

test('mecra lokasyonu ve dönemi adreste; bağlantı aynı pencereyi açar', async ({ page }) => {
  const lok = +sql(`select min(id) from mecralar where operational`);
  await girisYap(page, 'uye');
  await page.evaluate(() => { location.hash = ''; });
  /* S17: dönem tarih aralığıdır; S16 öncesi ?donem&olcek bağlantısı aralığa çevrilir. */
  await page.goto(`${APP}/admin#/mecralar?lok=${lok}&donem=2031-04&olcek=3`);
  await expect(page.locator('#ttl')).toHaveText('Mecralar');
  let st = await page.evaluate(() => mdDurum());
  expect([st.site, st.bas, st.bit]).toEqual([lok, '2031-04-01', '2031-06-30']);
  await expect.poll(() => hash(page)).toContain(`lok=${lok}`);
  expect(await hash(page)).toContain('bas=2031-04-01&bit=2031-06-30');
  await page.goto(`${APP}/admin#/mecralar?lok=${lok}&bas=2031-02-10&bit=2031-05-10&durum=musait`);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#mdGovde .md-sonuc'));
  st = await page.evaluate(() => mdDurum());
  expect([st.bas, st.bit, st.durum, st.hazir]).toEqual(['2031-02-10', '2031-05-10', 'musait', '3']);   // adres varsayılanla ezilmez
  await expect(page.locator('.md-sonuc')).toContainText('10.02.2031 – 10.05.2031');
});

test('açık belge ayrıntısı adreste; yenilemede yeniden açılır, kapanınca adresten düşer', async ({ page }) => {
  const r = await (await import('../lib/ortam.mjs')).rpc('uye', 'document_create', { p_docs: [{ provider: 'external',
    external_url: 'https://ornek.test/s13t.pdf', original_name: 's13t-adres.pdf', title: 'S13T adres belgesi', doc_type: 'diger', links: [] }] });
  const id = r.veri[0];
  await girisYap(page, 'uye');
  await page.evaluate(() => go('kurumlar'));
  await page.evaluate(i => belgeDetay(i), id);
  await expect.poll(() => hash(page)).toContain(`belge=${id}`);
  await page.reload();
  await expect(page.locator('#modalBg.open')).toContainText('S13T adres belgesi');
  await page.keyboard.press('Escape');
  await expect(page.locator('#modalBg.open')).toHaveCount(0);
  expect(await hash(page)).not.toContain('belge=');
});

test('adres, imzalı dosya adresi ya da form içeriği taşımaz', async ({ page }) => {
  const id = await isOlustur('uye', 'Adres gizlilik');
  await girisYap(page, 'uye');
  await page.evaluate(i => workAc(i), id);
  await page.evaluate(() => jobForm());
  await page.locator('#jt').pressSequentially('özel taslak');
  expect(await hash(page)).not.toMatch(/token|sign|taslak|%C3%B6zel/i);
  await page.evaluate(() => closeModal());
  expect(ONEK).toBeTruthy();
});
