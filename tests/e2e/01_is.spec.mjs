// İş oluşturma bütünlüğü, Pano aşama taslağı ve eşzamanlı düzenleme çakışması.
import { test, expect } from '@playwright/test';
import { girisYap, sql, rest, isOlustur, kurumId, teamId, dlg, ONEK, temizle, aramaliSec } from '../lib/ortam.mjs';

/* Her test yalnız kendi işaretli verisiyle başlar (tekrar/sıra bağımsız). */
test.beforeEach(() => temizle());

const say = q => +sql(q);
const isSay = baslik => say(`select count(*) from jobs where title='${ONEK}${baslik}'`);

async function yeniIsFormu(page, baslik) {
  await page.evaluate(() => jobForm());
  await expect(page.locator('#modalBg.open #jt')).toBeVisible();
  await page.fill('#jt', ONEK + baslik);
  await aramaliSec(page, '#jc', kurumId());
}

test.describe('İş oluşturma', () => {
  test('başarılı oluşturma: iş + hesap tarafı + ilgili + tek Hareket, ardından iş detayı açılır', async ({ page }) => {
    await girisYap(page, 'uye');
    await yeniIsFormu(page, 'Oluşturma');
    await page.locator('#modal').getByRole('button', { name: 'Oluştur', exact: true }).click();
    await expect(page.locator('#wFaz')).toBeVisible();                 // S13 B06: detay açılır, liste değil
    expect(await page.evaluate(() => history.state && history.state.v)).toBe('work');
    const id = say(`select id from jobs where title='${ONEK}Oluşturma'`);
    expect(isSay('Oluşturma')).toBe(1);
    expect(say(`select count(*) from work_parties where job_id=${id} and role='account' and customer_id=${kurumId()}`)).toBe(1);
    expect(say(`select count(*) from work_followers where job_id=${id} and team_id=${teamId('uye')}`)).toBe(1);
    expect(say(`select count(*) from entries where job_id=${id} and system_kind='work_created'`)).toBe(1);
  });

  test('çift tıklama tek iş üretir', async ({ page }) => {
    await girisYap(page, 'uye');
    await yeniIsFormu(page, 'Çift tık');
    await page.locator('#modal').getByRole('button', { name: 'Oluştur', exact: true }).dblclick();
    await expect(page.locator('#wFaz')).toBeVisible();
    expect(isSay('Çift tık')).toBe(1);
  });

  test('bağlantı hatası: yarım kayıt yok, form ve girilen veri yerinde', async ({ page }) => {
    await girisYap(page, 'uye');
    await page.route('**/rest/v1/rpc/job_create', r => r.abort('failed'));
    await yeniIsFormu(page, 'Bağlantı yok');
    await page.locator('#modal').getByRole('button', { name: 'Oluştur', exact: true }).click();
    await expect(dlg(page)).toContainText('yanıt alınamadı');
    await page.locator('#mpDlgOk').click();
    await expect(page.locator('#modalBg.open #jt')).toHaveValue(ONEK + 'Bağlantı yok');
    expect(isSay('Bağlantı yok')).toBe(0);
    expect(say(`select count(*) from work_parties wp join jobs j on j.id=wp.job_id where j.title like '${ONEK}Bağlantı yok'`)).toBe(0);
  });

  test('sunucu hatası: yarım kayıt yok, teknik ileti gösterilmez', async ({ page }) => {
    await girisYap(page, 'uye');
    await page.route('**/rest/v1/rpc/job_create', r => r.fulfill({ status: 500, contentType: 'application/json',
      body: JSON.stringify({ code: 'XX000', message: 'internal error', details: null, hint: null }) }));
    await yeniIsFormu(page, 'Sunucu hatası');
    await page.locator('#modal').getByRole('button', { name: 'Oluştur', exact: true }).click();
    await expect(dlg(page)).toBeVisible();
    await page.locator('#mpDlgOk').click();
    await expect(page.locator('#modalBg.open')).toBeVisible();
    expect(isSay('Sunucu hatası')).toBe(0);
  });

  test('yanıt kaybolursa kullanıcıya "kaydedilmedi" diye kesin konuşulmaz', async ({ page }) => {
    await girisYap(page, 'uye');
    /* İstek sunucuya ulaşır ve işlenir, yanıt istemciye dönmez. */
    await page.route('**/rest/v1/rpc/job_create', async r => { await r.fetch(); await r.abort('failed'); });
    await yeniIsFormu(page, 'Kayıp yanıt');
    await page.locator('#modal').getByRole('button', { name: 'Oluştur', exact: true }).click();
    /* S14: sonuç "doğrulanamadı" — ne "kaydedilmedi" ne "kaydedildi" denir. */
    await expect(dlg(page)).toContainText('sonucu doğrulanamadı');
    await expect(dlg(page)).not.toContainText('kaydedilmedi');
    await page.locator('#mpDlgOk').click();                              // Sonucu kontrol et
    await expect(page.locator('#wFaz')).toBeVisible();
    expect(isSay('Kayıp yanıt')).toBe(1);   // sunucuda tek ve tam kayıt (yarım değil)
    const id = say(`select id from jobs where title='${ONEK}Kayıp yanıt'`);
    expect(say(`select count(*) from work_parties where job_id=${id}`)).toBe(1);
  });

  test('yazıp geri silince Vazgeç "kaydedilmemiş değişiklik" uyarısı vermez', async ({ page }) => {
    await girisYap(page, 'uye');
    await page.evaluate(() => jobForm());
    await page.locator('#jt').pressSequentially('geçici');
    await page.locator('#jt').fill('');
    await page.locator('#modal').getByRole('button', { name: 'Vazgeç', exact: true }).click();
    await expect(page.locator('#modalBg.open')).toHaveCount(0);
    await expect(page.locator('#mpDlgBg')).toHaveCount(0);
  });
});

test.describe('Pano aşama taslağı', () => {
  test('ok yazmaz; Vazgeç geri alır; Kaydet tek Hareketle yazar', async ({ page }) => {
    const id = await isOlustur('uye', 'Pano aşama');
    await girisYap(page, 'uye');
    await page.evaluate(() => go('is-takibi'));
    const kart = page.locator('.kcard', { hasText: ONEK + 'Pano aşama' });
    await kart.locator('button[title^="Aşamayı öner: Teklif"]').click();
    await expect(page.locator('.w-faz-t')).toContainText('Teklif');
    expect(sql(`select status from jobs where id=${id}`)).toBe('temas_takip');

    await page.locator('.w-faz-t').getByRole('button', { name: 'Vazgeç' }).click();
    await expect(page.locator('.w-faz-t')).toHaveCount(0);
    expect(sql(`select status from jobs where id=${id}`)).toBe('temas_takip');
    expect(say(`select count(*) from entries where job_id=${id} and system_kind='work_phase'`)).toBe(0);

    await page.locator('#wFaz button', { hasText: 'Teklif' }).click();
    await page.locator('#wFazKaydet').click();
    await expect(page.locator('.w-faz-t')).toHaveCount(0);
    await expect(page.locator('#wFaz li.on')).toContainText('Teklif');
    expect(sql(`select status from jobs where id=${id}`)).toBe('teklif');
    expect(say(`select count(*) from entries where job_id=${id} and system_kind='work_phase'`)).toBe(1);
  });
});

test.describe('Eşzamanlı düzenleme', () => {
  test('başkası kaydettiyse üzerine yazılmaz; form ve girilen değer korunur', async ({ page }) => {
    const id = await isOlustur('uye', 'Çakışma A');
    await girisYap(page, 'uye');
    await page.evaluate(i => workAc(i), id);
    await page.evaluate(i => jobForm(null, i), id);
    await expect(page.locator('#modalBg.open #jt')).toHaveValue(ONEK + 'Çakışma A');
    /* İkinci kullanıcı aynı anda başlığı değiştirir. */
    const r = await rest('uye2', `jobs?id=eq.${id}`, { method: 'PATCH', body: { title: ONEK + 'Çakışma B' } });
    expect(r.durum).toBeLessThan(300);
    await page.fill('#jt', ONEK + 'Çakışma C');
    await page.locator('#modal').getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(dlg(page)).toContainText('başka biri tarafından değiştirildi');
    await page.locator('#mpDlgOk').click();
    await expect(page.locator('#modalBg.open #jt')).toHaveValue(ONEK + 'Çakışma C');
    expect(sql(`select title from jobs where id=${id}`)).toBe(ONEK + 'Çakışma B');
  });

  test('iş detayından düzenleyip kaydeden kullanıcı iş detayında kalır', async ({ page }) => {
    const id = await isOlustur('uye', 'Bağlamda kal');
    await girisYap(page, 'uye');
    await page.evaluate(i => workAc(i), id);
    await page.evaluate(i => jobForm(null, i), id);
    await page.fill('#jt', ONEK + 'Bağlamda kal 2');
    await page.locator('#modal').getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.locator('#modalBg.open')).toHaveCount(0);
    await expect(page.locator('#wFaz')).toBeVisible();
    expect(await page.evaluate(() => ui._work && ui._work.id)).toBe(id);
  });
});

test.describe('Kurum düzenleme', () => {
  const kayit = K => sql(`select coalesce(vergi_dairesi,'∅')||'|'||coalesce(vergi_no,'∅')||'|'||coalesce(telefon,'∅')||'|'||coalesce(puan::text,'∅') from customers where id=${K}`);

  test('Hafıza üzerinden düzenleme formda görünen alanları kaybetmez; yalnız değişen alan yazılır', async ({ page }) => {
    const K = kurumId();
    sql(`update customers set vergi_dairesi='Seyhan VD', vergi_no='1234567890', telefon='0322 000 00 00', puan=null where id=${K}`);
    await girisYap(page, 'uye');
    await page.evaluate(() => go('kurumlar'));
    await expect(page.locator('#hafQ')).toBeVisible();
    await page.evaluate(k => orgAc(k), K);
    await page.evaluate(k => custForm(k), K);
    await expect(page.locator('#cvd')).toHaveValue('Seyhan VD');               // önbellekten değil, kayıttan
    await page.fill('#ct', '0322 111 11 11');
    await page.locator('#modal').getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.locator('#modalBg.open')).toHaveCount(0);
    expect(kayit(K)).toBe('Seyhan VD|1234567890|0322 111 11 11|∅');
    expect(await page.evaluate(() => history.state && history.state.v)).toBe('org');   // kurum detayında kalır
  });

  test('başkası değiştirdiyse kurum kaydı üzerine yazılmaz', async ({ page }) => {
    const K = kurumId();
    sql(`update customers set telefon='0322 000 00 00' where id=${K}`);
    await girisYap(page, 'uye');
    await page.evaluate(k => orgAc(k), K);
    await page.evaluate(k => custForm(k), K);
    await expect(page.locator('#ct')).toHaveValue('0322 000 00 00');
    const r = await rest('uye2', `customers?id=eq.${K}`, { method: 'PATCH', body: { telefon: '0322 999 99 99' } });
    expect(r.durum).toBeLessThan(300);
    await page.fill('#ct', '0322 222 22 22');
    await page.locator('#modal').getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(dlg(page)).toContainText('başka biri tarafından değiştirildi');
    expect(sql(`select telefon from customers where id=${K}`)).toBe('0322 999 99 99');
  });
});

test.describe('Kişi düzenleme', () => {
  async function kisi(ad, ek = {}) {
    const r = await rest('uye', 'contacts', { method: 'POST', body: { name: 'S13T ' + ad, customer_id: kurumId(), is_primary: false, ...ek } });
    expect(r.durum).toBe(201); return r.veri[0].id;
  }
  const satir = id => sql(`select coalesce(title,'∅')||'|'||coalesce(phone,'∅')||'|'||coalesce(email,'∅')||'|'||is_primary from contacts where id=${id}`);

  test('kişi sayfasından düzenleme mevcut değerlerle açılır; yalnız değişen alan yazılır; kişi sayfasında kalınır', async ({ page }) => {
    const id = await kisi('Kişi sayfası', { phone: '0532 000 00 01', email: 's13t@ornek.test', title: 'Müdür' });
    await girisYap(page, 'uye');
    await page.evaluate(i => personAc(i), id);
    await page.locator('#content').getByRole('button', { name: 'Düzenle' }).first().click();
    await expect(page.locator('#modalBg.open #kn')).toHaveValue('S13T Kişi sayfası');
    await expect(page.locator('#kp')).toHaveValue('0532 000 00 01');
    await page.fill('#kt', 'Genel Müdür');
    await page.locator('#modal').getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.locator('#modalBg.open')).toHaveCount(0);
    expect(satir(id)).toBe('Genel Müdür|0532 000 00 01|s13t@ornek.test|false');
    expect(await page.evaluate(() => history.state && history.state.v)).toBe('kisi');
  });

  test('kurum sayfasından düzenleme kurumun ana kişisini değiştirmez', async ({ page }) => {
    const ana = await kisi('Ana kişi', { is_primary: true });
    const id = await kisi('Diğer kişi', { phone: '0532 000 00 02' });
    await girisYap(page, 'uye');
    await page.evaluate(k => orgAc(k), kurumId());
    await page.evaluate(([i, k]) => contactForm(i, k), [id, kurumId()]);
    await expect(page.locator('#kpr')).not.toBeChecked();      // bağlantının "ana kurum" bayrağı değil
    await page.fill('#kt', 'Satın alma');
    await page.locator('#modal').getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.locator('#modalBg.open')).toHaveCount(0);
    expect(satir(id)).toBe('Satın alma|0532 000 00 02|∅|false');
    expect(sql(`select is_primary from contacts where id=${ana}`)).toBe('t');
  });
});

test('İşler › Liste sıralaması klavyeyle yapılır ve yönü okunur', async ({ page }) => {
  await isOlustur('uye', 'Sıralama');
  await girisYap(page, 'uye');
  await page.evaluate(async () => { await go('is-takibi'); await isTabGit('liste'); });
  const baslik = page.locator('th.srt').first();
  const dugme = baslik.locator('button.th-srt');
  await dugme.focus();
  await expect(dugme).toBeFocused();
  const once = await page.locator('th.srt[aria-sort]:not([aria-sort="none"])').count();
  await page.keyboard.press('Enter');
  await expect(page.locator('th.srt').first()).not.toHaveAttribute('aria-sort', 'none');
  const yon1 = await page.locator('th.srt').first().getAttribute('aria-sort');
  await expect(page.locator('th.srt').first().locator('button.th-srt')).toBeFocused();   // odak aynı sütunda kalır
  await page.keyboard.press('Enter');
  await expect(page.locator('th.srt').first()).not.toHaveAttribute('aria-sort', yon1);
  expect(once).toBeLessThanOrEqual(1);
});
