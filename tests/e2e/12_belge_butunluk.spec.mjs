// Kabul turu — belge dosyası bütünlüğü: dosyasız belge oluşamaz.
// Yarış gerçekten üretilir: kayıt açık bir işlemde bekletilir, aynı kullanıcı
// dosyayı Storage API ile (uygulamanın kullandığı yol) silmeye çalışır.
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { girisYap, sql, rpc, depo, dlg, temizle, KULLANICI, DB_KONTEYNER } from '../lib/ortam.mjs';

test.beforeEach(() => temizle());
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const say = q => +sql(q);
const nesneVar = yol => say(`select count(*) from storage.objects where name='${yol}'`);
const UID = { uye: '00000000-0000-4000-a013-000000000002' };

async function yukle(kim, ad) {
  const yol = `${crypto.randomUUID()}/${ad}`;
  expect((await depo(kim, `object/documents/${yol}`, { method: 'POST', govde: new Blob([PDF]), tip: 'application/pdf' })).durum).toBe(200);
  return yol;
}
const sil = (kim, yol) => depo(kim, 'object/documents', { method: 'DELETE', govde: JSON.stringify({ prefixes: [yol] }) });
const govde = (yol, baslik) => [{ provider: 'supabase', storage_path: yol, original_name: yol.split('/')[1], title: baslik,
  doc_type: 'diger', mime_type: 'application/pdf', size_bytes: PDF.length, links: [] }];

test('kayıt sürerken aynı kullanıcının dosya silme isteği bekler ve reddedilir; belge dosyasıyla kalır', async () => {
  const yol = await yukle('uye', 's13t-yaris.pdf');
  const docs = JSON.stringify(govde(yol, 'S13T yarış')).replace(/'/g, "''");
  const A = new Promise(r => {
    const p = spawn('docker', ['exec', '-i', DB_KONTEYNER, 'psql', '-U', 'postgres', '-qtA', '-v', 'ON_ERROR_STOP=1']);
    let o = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => o += d); p.on('close', c => r({ c, o }));
    p.stdin.end(`begin; set local role authenticated;
      set local request.jwt.claims = '{"sub":"${UID.uye}","role":"authenticated"}';
      select public.document_create('${docs}'::jsonb); select pg_sleep(2); commit;`);
  });
  await new Promise(r => setTimeout(r, 800));                             // kayıt dosyayı doğruladı, COMMIT etmedi
  const b = await sil('uye', yol);
  const a = await A;
  expect(a.c).toBe(0);
  expect(b.veri).toEqual([]);                                             // silme reddedildi (bekledikten sonra)
  expect(say(`select count(*) from documents where storage_path='${yol}'`)).toBe(1);
  expect(nesneVar(yol)).toBe(1);
});

test('kaydedilmiş ilişkisiz belgenin dosyası yükleyen ya da yönetici tarafından doğrudan silinemez', async () => {
  const yol = await yukle('uye', 's13t-iliskisiz-korunur.pdf');
  expect((await rpc('uye', 'document_create', { p_docs: govde(yol, 'S13T ilişkisiz korunur') })).durum).toBe(200);
  expect(say(`select count(*) from documents where storage_path='${yol}' and detached_at is not null`)).toBe(1);
  expect((await sil('uye', yol)).veri).toEqual([]);
  expect((await sil('admin', yol)).veri).toEqual([]);
  expect(nesneVar(yol)).toBe(1);
  /* Pozitif kontrol: hiçbir belgeye bağlı olmayan kendi dosyası silinebilir. */
  const bos = await yukle('uye', 's13t-sahipsiz.pdf');
  expect((await sil('uye', bos)).veri.length).toBe(1);
  expect(nesneVar(bos)).toBe(0);
});

test.describe('kalıcı silme (önce kayıt, sonra dosya)', () => {
  async function belgeAc(page, baslik) {
    const yol = await yukle('uye', 's13t-kalici.pdf');
    const r = await rpc('uye', 'document_create', { p_docs: govde(yol, baslik) });
    await girisYap(page, 'uye');
    await page.evaluate(i => belgeDetay(i), r.veri[0]);
    await page.getByRole('button', { name: 'Kalıcı olarak sil' }).click();
    return { yol, id: r.veri[0] };
  }

  test('başarılı silmede belge ve dosya birlikte gider', async ({ page }) => {
    const { yol, id } = await belgeAc(page, 'S13T kalıcı sil');
    await page.locator('#mpDlgOk').click();
    await expect(page.locator('#modalBg.open')).toHaveCount(0);
    expect(say(`select count(*) from documents where id=${id}`)).toBe(0);
    expect(nesneVar(yol)).toBe(0);
  });

  test('dosya adımı başarısız olursa dosyasız belge değil sahipsiz dosya kalır; kullanıcıya söylenir ve temizlenebilir', async ({ page }) => {
    const { yol, id } = await belgeAc(page, 'S13T kalıcı sil hata');
    await page.route('**/storage/v1/object/documents', r => r.request().method() === 'DELETE' ? r.abort('failed') : r.continue());
    await page.locator('#mpDlgOk').click();
    await expect(page.locator('#toast')).toContainText('yarım yükleme');
    expect(say(`select count(*) from documents where id=${id}`)).toBe(0);        // dosyasız belge YOK
    expect(nesneVar(yol)).toBe(1);                                                // sahipsiz dosya
    sql(`update storage.objects set created_at = now() - interval '3 hours' where name='${yol}'`);
    expect((await rpc('uye', 'yarim_yuklemeler', {})).veri.map(x => x.name)).toContain(yol);
    expect((await sil('uye', yol)).veri.length).toBe(1);
  });
});

test('kayıt isteği sürerken pencere kapatılamaz; kayıt tamamlanır, dosya silinmez', async ({ page }) => {
  await girisYap(page, 'uye');
  await page.evaluate(async () => { await go('kurumlar'); await go('is-takibi'); });   // uygulama içi geçmiş
  await page.route('**/rest/v1/rpc/document_create', async r => { await new Promise(x => setTimeout(x, 4000)); await r.continue(); });
  await page.evaluate(() => belgeForm({}));
  await page.locator('#ek_bf input[type=file]').setInputFiles({ name: 's13t-kapanmaz.pdf', mimeType: 'application/pdf', buffer: PDF });
  const tur = page.locator('#ek_bf .ek-tur').first(); if (!(await tur.inputValue())) await tur.selectOption('teklif');
  await page.fill('#bfBaslik', 'S13T kapanmaz');
  await page.locator('#bfKaydet').click();
  await page.waitForFunction(() => /Kaydediliyor/.test(document.getElementById('bfKaydet').textContent));
  await page.keyboard.press('Escape');
  await expect(page.locator('#toast')).toContainText('Kayıt sürüyor');
  await expect(page.locator('#modalBg.open')).toBeVisible();
  await page.goBack();                                                            // uygulama içi Geri de kapatmaz
  await expect(page.locator('#modalBg.open')).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toMatch(/^#\/isler/);
  /* Sayfayı yenileme/kapatma: tarayıcı "ayrılmak istiyor musunuz" uyarısı verir; kalınırsa kayıt sürer. */
  let uyari = null;
  page.once('dialog', d => { uyari = d.type(); d.dismiss(); });
  await page.evaluate(() => { location.reload(); }).catch(() => {});
  await expect.poll(() => uyari).toBe('beforeunload');
  await expect(page.locator('#modalBg.open')).toHaveCount(0, { timeout: 15000 }); // kayıt bitince kendisi kapanır
  const yol = sql(`select storage_path from documents where title='S13T kapanmaz'`);
  expect(yol).toBeTruthy();
  expect(nesneVar(yol)).toBe(1);
});
