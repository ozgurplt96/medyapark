// S14 — kayıp yanıttan sonra güvenli yeniden deneme.
// Yanıt kaybı gerçek: istek sunucuya gider, işlem COMMIT olur, yanıt
// istemciye ulaşmadan bağlantı kesilir (route.fetch → abort). Tekrar aynı
// kayda dönmeli; kayıt, Hareket ve dosya sayısı artmamalı.
import { test, expect } from '@playwright/test';
import { girisYap, sql, rpc, isOlustur, kurumId, bosYuzeyler, dlg, temizle, ONEK, aramaliSec } from '../lib/ortam.mjs';

test.beforeEach(() => temizle());

const say = q => +sql(q);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const nesneSay = () => say(`select count(*) from storage.objects where bucket_id='documents'`);

/* İlk eşleşen isteği sunucuda işlet, yanıtını düşür; sonrakiler normal. */
async function yanitiKaybet(page, desen, yontem) {
  let kaldi = 1;
  await page.route(desen, async r => {
    if (kaldi > 0 && (!yontem || r.request().method() === yontem)) { kaldi--; await r.fetch(); await r.abort('failed'); }
    else await r.continue();
  });
}
const belirsizDiyalog = async page => {
  await expect(dlg(page)).toContainText('sonucu doğrulanamadı');
  await expect(dlg(page)).not.toContainText('başarısız');
};

test.describe('İş', () => {
  async function form(page, baslik) {
    await page.evaluate(() => jobForm());
    await page.fill('#jt', ONEK + baslik);
    await aramaliSec(page, '#jc', kurumId());
  }
  const olustur = page => page.locator('#modal').getByRole('button', { name: 'Oluştur', exact: true }).click();
  const kontrol = baslik => {
    const id = say(`select id from jobs where title='${ONEK}${baslik}'`);
    expect(say(`select count(*) from jobs where title='${ONEK}${baslik}'`)).toBe(1);
    expect(say(`select count(*) from entries where job_id=${id} and system_kind='work_created'`)).toBe(1);
    expect(say(`select count(*) from work_parties where job_id=${id}`)).toBe(1);
    return id;
  };

  test('yanıt kaybı → formda kal → Oluştur tekrar: tek iş, tek Hareket, iş açılır', async ({ page }) => {
    await girisYap(page, 'uye');
    await yanitiKaybet(page, '**/rest/v1/rpc/job_create');
    await form(page, 'Tekrar');
    await olustur(page);
    await belirsizDiyalog(page);
    await page.locator('#mpDlgNo').click();                      // Formda kal
    await expect(page.locator('#modalBg.open #jt')).toHaveValue(ONEK + 'Tekrar');
    await olustur(page);
    await expect(page.locator('#wFaz')).toBeVisible();
    const id = kontrol('Tekrar');
    expect(await page.evaluate(() => ui._work.id)).toBe(id);
  });

  test('yanıt kaybı → "Sonucu kontrol et" kaydı bulur ve açar', async ({ page }) => {
    await girisYap(page, 'uye');
    await yanitiKaybet(page, '**/rest/v1/rpc/job_create');
    await form(page, 'Kontrol');
    await olustur(page);
    await belirsizDiyalog(page);
    await page.locator('#mpDlgOk').click();                      // Sonucu kontrol et
    await expect(page.locator('#wFaz')).toBeVisible();
    kontrol('Kontrol');
  });

  test('yanıt kaybı → form kapatılıp sayfa yenilenince önceki girişimin sonucu bildirilir', async ({ page }) => {
    await girisYap(page, 'uye');
    await yanitiKaybet(page, '**/rest/v1/rpc/job_create');
    await form(page, 'Yenileme');
    await olustur(page);
    await belirsizDiyalog(page);
    await page.locator('#mpDlgNo').click();
    await page.evaluate(() => closeModal());
    await page.reload();
    await expect(dlg(page)).toContainText('kaydedilmiş');
    await page.locator('#mpDlgOk').click();                      // Kaydı aç
    await expect(page.locator('#wFaz')).toBeVisible();
    kontrol('Yenileme');
    expect(await page.evaluate(() => sessionStorage.getItem('mp_belirsiz'))).toBe('[]');
  });

  test('yanıt kaybından sonra değiştirilmiş içerik sessizce kabul edilmez', async ({ page }) => {
    await girisYap(page, 'uye');
    await yanitiKaybet(page, '**/rest/v1/rpc/job_create');
    await form(page, 'İçerik A');
    await olustur(page);
    await belirsizDiyalog(page);
    await page.locator('#mpDlgNo').click();
    await page.fill('#jt', ONEK + 'İçerik B');
    await olustur(page);
    await expect(dlg(page)).toContainText('daha önceki bir gönderimi sunucuda kaydedilmiş');
    await page.locator('#mpDlgOk').click();                      // Kaydedilen kaydı aç
    await expect(page.locator('#wFaz')).toBeVisible();
    expect(say(`select count(*) from jobs where title like '${ONEK}İçerik %'`)).toBe(1);
    expect(sql(`select title from jobs where title like '${ONEK}İçerik %'`)).toBe(ONEK + 'İçerik A');
  });
});

test('mecra: yanıt kaybı sonrası tekrar aynı yerleşimlere döner; Hareket artmaz', async ({ page }) => {
  const [u1, u2] = bosYuzeyler(2, '2034-01-01', '2034-12-31');
  const isId = await isOlustur('uye', 'Mecra tekrar');
  await girisYap(page, 'uye');
  await yanitiKaybet(page, '**/rest/v1/rpc/media_placements_create');
  await page.evaluate(([h, i]) => mForm({ hedefler: h, isId: i, taah: 'confirmed' }), [[{ unit_id: u1 }, { unit_id: u2 }], isId]);
  await page.selectOption('#mfIs', String(isId));
  await expect(page.locator('#mfKurum')).toHaveValue(String(kurumId()));
  await page.fill('#mfBas', '2034-03-01');
  await page.fill('#mfBit', '2034-03-31');
  await page.locator('#mfKaydet').click();
  await belirsizDiyalog(page);
  await page.locator('#mpDlgNo').click();
  await page.locator('#mfKaydet').click();
  await expect(page.locator('#modalBg.open')).toHaveCount(0);
  expect(say(`select count(*) from media_placements where work_id=${isId}`)).toBe(2);   // tekrar ikinci kayıt üretmedi
  const h = say(`select count(*) from entries where system_kind='media_created' and media_placement_id in (select id from media_placements where work_id=${isId})`);
  expect(h).toBeGreaterThan(0);
  expect(h).toBeLessThanOrEqual(2);                              // tek oluşturmanın Hareketleri
});

test('baskı/montaj: yanıt kaybı sonrası tekrar tek satır ve tek Hareket', async ({ page }) => {
  const isId = await isOlustur('uye', 'Operasyon tekrar');
  await girisYap(page, 'uye');
  await yanitiKaybet(page, '**/rest/v1/rpc/operations_batch_create');
  await page.evaluate(i => opTopluForm(i), isId);
  await page.locator('#opbRows [data-f=description]').first().fill('S13T tekrar vinil');
  await page.locator('#opbKaydetB').click();
  await belirsizDiyalog(page);
  await page.locator('#mpDlgNo').click();
  await page.locator('#opbKaydetB').click();
  await expect(page.locator('#modalBg.open')).toHaveCount(0);
  expect(say(`select count(*) from work_operations where job_id=${isId}`)).toBe(1);
  expect(say(`select count(*) from entries where job_id=${isId} and system_kind='operation_created'`)).toBe(1);
});

test.describe('Belge', () => {
  async function form(page, dosya, baslik) {
    await page.evaluate(() => belgeForm({}));
    await page.locator('#ek_bf input[type=file]').setInputFiles({ name: dosya, mimeType: 'application/pdf', buffer: PDF });
    const tur = page.locator('#ek_bf .ek-tur').first();
    if (!(await tur.inputValue())) await tur.selectOption('teklif');
    await page.fill('#bfBaslik', baslik);
  }

  test('kayıt yanıtı kaybolursa dosya silinmez; tekrar tek belge ve tek dosya', async ({ page }) => {
    await girisYap(page, 'uye');
    const once = nesneSay();
    await yanitiKaybet(page, '**/rest/v1/rpc/document_create');
    await form(page, 's13t-kayip.pdf', 'S13T kayıp yanıt');
    await page.locator('#bfKaydet').click();
    await belirsizDiyalog(page);
    await page.locator('#mpDlgNo').click();
    await expect(page.locator('#bfDurum')).toContainText('doğrulanamadı');
    expect(nesneSay()).toBe(once + 1);                          // dosya korunuyor
    await page.locator('#bfKaydet').click();
    await expect(page.locator('#modalBg.open')).toHaveCount(0);
    expect(say(`select count(*) from documents where title='S13T kayıp yanıt'`)).toBe(1);
    expect(nesneSay()).toBe(once + 1);
  });

  test('yükleme yanıtı kaybolursa tekrar aynı dosyayı yeniden kullanır (ikinci nesne yok)', async ({ page }) => {
    await girisYap(page, 'uye');
    const once = nesneSay();
    await yanitiKaybet(page, '**/storage/v1/object/documents/**', 'POST');
    await form(page, 's13t-yukleme.pdf', 'S13T yükleme kaybı');
    await page.locator('#bfKaydet').click();
    await expect(page.locator('#bfDurum')).toContainText('Kaydedilemedi');
    expect(nesneSay()).toBe(once + 1);                          // dosya sunucuya ulaştı
    await page.locator('#bfKaydet').click();
    await expect(page.locator('#modalBg.open')).toHaveCount(0);
    expect(say(`select count(*) from documents where title='S13T yükleme kaybı'`)).toBe(1);
    expect(nesneSay()).toBe(once + 1);
  });
});

/* İstek sunucuya HENÜZ ulaşmamış gibi: tarayıcı ağ hatası görür; aynı istek
   (aynı jeton, aynı gövde, aynı anahtar) test tarafından daha sonra sunucuya
   gönderilir — "istek hâlâ yolda / geç tamamlandı" durumu. */
async function yoldaTut(page, desen) {
  const kuyruk = []; let kaldi = 1;
  await page.route(desen, async r => {
    if (kaldi > 0 && r.request().method() === 'POST') {
      kaldi--; const q = r.request();
      kuyruk.push({ url: q.url(), headers: q.headers(), body: q.postData() });
      await r.abort('failed');
    } else await r.continue();
  });
  return {
    async gonder() {
      const x = kuyruk.shift(); const h = { ...x.headers };
      for (const k of ['host', 'content-length', 'connection', 'origin', 'referer']) delete h[k];
      return (await fetch(x.url, { method: 'POST', headers: h, body: x.body })).status;
    },
  };
}

test.describe('Belge — geç tamamlanan kayıt', () => {
  async function form(page, dosya, baslik) {
    await page.evaluate(() => belgeForm({}));
    await page.locator('#ek_bf input[type=file]').setInputFiles({ name: dosya, mimeType: 'application/pdf', buffer: PDF });
    const tur = page.locator('#ek_bf .ek-tur').first();
    if (!(await tur.inputValue())) await tur.selectOption('teklif');
    await page.fill('#bfBaslik', baslik);
  }

  test('istek yoldayken "Sonucu kontrol et" başarısızlık ilan etmez, dosya silinmez; geç kayıt tekrarla aynı belgeye döner', async ({ page }) => {
    await girisYap(page, 'uye');
    const once = nesneSay();
    const yol = await yoldaTut(page, '**/rest/v1/rpc/document_create');
    await form(page, 's13t-yolda.pdf', 'S13T yolda');
    await page.locator('#bfKaydet').click();
    await belirsizDiyalog(page);
    await page.locator('#mpDlgOk').click();                               // Sonucu kontrol et → henüz yok
    await expect(dlg(page)).toContainText('kayıt bulunamadı');
    await expect(dlg(page)).not.toContainText(/oluşturulmadı|başarısız|kaydedilmedi/);
    await page.locator('#mpDlgOk').click();
    expect(nesneSay()).toBe(once + 1);                                      // dosya yerinde
    expect(say(`select count(*) from documents where title='S13T yolda'`)).toBe(0);
    expect(await yol.gonder()).toBe(200);                                   // istek şimdi tamamlanır
    expect(say(`select count(*) from documents where title='S13T yolda'`)).toBe(1);
    await page.locator('#bfKaydet').click();                                // aynı girişim → aynı belge
    await expect(page.locator('#modalBg.open')).toHaveCount(0);
    expect(say(`select count(*) from documents where title='S13T yolda'`)).toBe(1);
    expect(nesneSay()).toBe(once + 1);
  });

  test('istek yoldayken form kapatılırsa dosya silinmez; geç gelen kayıt dosyalı belge olur ve yarım yükleme sayılmaz', async ({ page }) => {
    await girisYap(page, 'uye');
    const once = nesneSay();
    const yol = await yoldaTut(page, '**/rest/v1/rpc/document_create');
    await form(page, 's13t-kapat.pdf', 'S13T kapatılan form');
    await page.locator('#bfKaydet').click();
    await belirsizDiyalog(page);
    await page.locator('#mpDlgNo').click();                                 // Formda kal
    await page.locator('#modal').getByRole('button', { name: 'Vazgeç', exact: true }).click();
    if (await dlg(page).count()) await page.locator('#mpDlgOk').click();    // kaydetmeden kapat
    await expect(page.locator('#modalBg.open')).toHaveCount(0);
    await page.waitForTimeout(1500);                                        // kapanış temizliği ve arka plan sorgusu fırsatı
    expect(nesneSay()).toBe(once + 1);                                      // temizlik belirsiz dosyayı silmedi
    expect(await yol.gonder()).toBe(200);                                   // geç kayıt
    const [id, dosyaYolu] = sql(`select id||'|'||storage_path from documents where title='S13T kapatılan form'`).split('|');
    expect(+id).toBeGreaterThan(0);
    sql(`update storage.objects set created_at = now() - interval '3 hours' where name='${dosyaYolu}'`);
    const l = await rpc('uye', 'yarim_yuklemeler', {});
    expect(l.veri.map(x => x.name)).not.toContain(dosyaYolu);               // belgeye bağlı: temizlenemez
    expect(say(`select count(*) from storage.objects where name='${dosyaYolu}'`)).toBe(1);
  });
});

test('iş: gecikmiş yanıt sırasında ikinci tık ikinci iş üretmez', async ({ page }) => {
  await girisYap(page, 'uye');
  await page.route('**/rest/v1/rpc/job_create', async r => { await new Promise(x => setTimeout(x, 2500)); await r.continue(); });
  await page.evaluate(() => jobForm());
  await page.fill('#jt', ONEK + 'Gecikme');
  await aramaliSec(page, '#jc', kurumId());
  const b = page.locator('#modal').getByRole('button', { name: 'Oluştur', exact: true });
  await b.click();
  await b.click({ force: true, timeout: 2000 }).catch(() => {});
  await expect(page.locator('#wFaz')).toBeVisible({ timeout: 15000 });
  expect(say(`select count(*) from jobs where title='${ONEK}Gecikme'`)).toBe(1);
  expect(say(`select count(*) from entries e join jobs j on j.id=e.job_id where j.title='${ONEK}Gecikme' and e.system_kind='work_created'`)).toBe(1);
});

test('yarım kalan yükleme görünür ve temizlenir; belgeye bağlı dosya listelenmez ve silinmez', async ({ page }) => {
  const { depo, rpc: r2 } = await import('../lib/ortam.mjs');
  const u = crypto.randomUUID();
  const yetim = `${u}/s13t-yetim.pdf`, bagli = `${crypto.randomUUID()}/s13t-bagli-eski.pdf`;
  for (const y of [yetim, bagli])
    expect((await depo('uye', `object/documents/${y}`, { method: 'POST', govde: new Blob([PDF]), tip: 'application/pdf' })).durum).toBe(200);
  const d = await r2('uye', 'document_create', { p_docs: [{ provider: 'supabase', storage_path: bagli, original_name: 's13t-bagli-eski.pdf',
    title: 'S13T bağlı eski', doc_type: 'diger', mime_type: 'application/pdf', size_bytes: PDF.length, links: [] }] });
  expect(d.durum).toBe(200);
  sql(`update storage.objects set created_at = now() - interval '3 hours' where name in ('${yetim}','${bagli}')`);
  await girisYap(page, 'uye');
  await page.evaluate(() => { hafYaz({ ...hafDurum(), tab: 'belgeler' }); return go('kurumlar'); });
  await expect(page.locator('#blYarim')).toContainText('Kayda bağlanmamış');
  const liste = await page.evaluate(() => ui._blYarim);
  expect(liste).toContain(yetim);
  expect(liste).not.toContain(bagli);                                          // belgeye bağlı dosya listelenmez
  await page.locator('#blYarim').getByRole('button', { name: 'Temizle' }).click();
  await page.locator('#mpDlgOk').click();
  await expect(page.locator('#blYarim')).toBeEmpty();
  expect(say(`select count(*) from storage.objects where name='${yetim}'`)).toBe(0);
  expect(say(`select count(*) from storage.objects where name='${bagli}'`)).toBe(1);
});

test('sunucu: eşzamanlı aynı istekler tek kayıt; başka üye aynı anahtarı kullanamaz; pasif üye sonucu okuyamaz', async () => {
  const k = crypto.randomUUID(), job = { title: ONEK + 'Eşzamanlı', status: 'temas_takip', customer_id: kurumId() };
  const r = await Promise.all([1, 2, 3, 4].map(() => rpc('uye', 'job_create', { p_job: job, p_followers: [], p_islem: k })));
  expect(new Set(r.map(x => x.veri)).size).toBe(1);
  expect(say(`select count(*) from jobs where title='${ONEK}Eşzamanlı'`)).toBe(1);
  expect((await rpc('uye2', 'islem_sonucu', { p_tur: 'job_create', p_anahtar: k })).veri).toEqual({ durum: 'yok' });
  expect((await rpc('pasif', 'islem_sonucu', { p_tur: 'job_create', p_anahtar: k })).durum).toBe(403);
  expect((await rpc('uye', 'islem_sonucu', { p_tur: 'job_create', p_anahtar: k })).veri).toEqual({ durum: 'tamam', sonuc: r[0].veri });
});
