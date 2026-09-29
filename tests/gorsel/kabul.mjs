// Kullanıcı kabul senaryoları — arayüzden uygulanır, her adımın beklenen sonucu
// doğrulanır ve ekran görüntüsü alınır. Yalnız test yığınında çalışır.
// Kullanım: node gorsel/kabul.mjs <cikti-klasoru>
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { hedefDogrula, girisYap, sql, temizle, kurumId, bosYuzeyler, APP } from '../lib/ortam.mjs';

hedefDogrula();
const cikti = process.argv[2] || 'kabul-cikti';
fs.mkdirSync(cikti, { recursive: true });
temizle();
const sonuc = [];
const tarayici = await chromium.launch({ channel: 'chrome' });
const ctx = await tarayici.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const hatalar = []; page.on('pageerror', e => hatalar.push(e.message));
let n = 0;
const foto = async ad => { n++; await page.screenshot({ path: path.join(cikti, `${String(n).padStart(2, '0')}_${ad}.png`) }); };
async function adim(senaryo, ad, fn) {
  try { const not = await fn(); sonuc.push({ senaryo, ad, durum: 'GEÇTİ', not: not || '' }); }
  catch (e) { sonuc.push({ senaryo, ad, durum: 'KALDI', not: String(e.message).slice(0, 200) }); await foto('HATA_' + ad.replace(/\W+/g, '_')); }
}
const bekle = (f, a) => page.waitForFunction(f, a, { timeout: 15000 });
const sayi = q => +sql(q);
await girisYap(page, 'uye');
const K = kurumId();

/* 1 — Kurum/kişi bul → iş aç → güncelleme ekle → Panelim/Hareketler */
let isId = 0;
await adim(1, 'Hafıza aramasında kurumu bul', async () => {
  await page.evaluate(() => go('kurumlar'));
  await page.locator('#hafQ').fill('Regresyon');
  await page.getByText('S13 Regresyon Kurumu').first().click();
  await bekle(() => history.state && history.state.v === 'org');
  await foto('s1_kurum'); return await page.evaluate(() => location.hash);
});
await adim(1, 'Kurumdan yeni iş aç', async () => {
  await page.evaluate(k => jobForm(null, null, { custId: k }), K);
  await page.fill('#jt', 'S13T Kabul — sonbahar kampanyası');
  await page.locator('#modal').getByRole('button', { name: 'Oluştur', exact: true }).click();
  await bekle(() => history.state && history.state.v === 'work');
  isId = sayi(`select id from jobs where title='S13T Kabul — sonbahar kampanyası'`);
  if (!isId) throw new Error('iş oluşmadı');
  await foto('s1_is_detay'); return `iş #${isId}, adres ${await page.evaluate(() => location.hash)}`;
});
await adim(1, 'İşe güncelleme ekle', async () => {
  await page.evaluate(i => qcAc({ jobId: i }), isId);
  await page.locator('#qcBody').fill('S13T Kabul: müşteri görselleri perşembe gönderecek.');
  await page.locator('#modal').getByRole('button', { name: /Paylaş|Kaydet/ }).last().click();
  await bekle(() => !document.getElementById('modalBg').classList.contains('open'));
  if (sayi(`select count(*) from entries where job_id=${isId} and body like 'S13T Kabul:%'`) !== 1) throw new Error('güncelleme yok');
});
await adim(1, 'Panelim Güncellemeler akışında bul', async () => {
  await page.evaluate(() => { if (typeof hrYaz === 'function') hrYaz({ ...hrDurum(), gor: 'guncelleme' }); return go('workspace-home'); });
  await page.getByText('S13T Kabul: müşteri görselleri').first().waitFor();
  await foto('s1_panelim');
});
await adim(1, 'Hareketler’de iş oluşturma hareketini bul', async () => {
  await page.evaluate(() => hrGor('hareket'));
  await page.getByText('S13T Kabul — sonbahar kampanyası').first().waitFor();
  await foto('s1_hareketler');
  await page.evaluate(() => hrGor('guncelleme'));
});

/* 2 — Yüzey ve tarih seç → opsiyon → yayına çevir → takvim */
let pid = 0, uid = 0;
await adim(2, 'Boş yüzeye opsiyon oluştur', async () => {
  [uid] = bosYuzeyler(1, '2026-11-01', '2026-11-30');
  await page.evaluate(([u, i]) => mForm({ hedefler: [{ unit_id: u }], isId: i, taah: 'reserved' }), [uid, isId]);
  await page.selectOption('#mfIs', String(isId));
  await page.fill('#mfBas', '2026-11-01'); await page.fill('#mfBit', '2026-11-30');
  await foto('s2_opsiyon_formu');
  await page.locator('#mfKaydet').click();
  await bekle(() => !document.getElementById('modalBg').classList.contains('open'));
  pid = sayi(`select id from media_placements where unit_id=${uid} and start_date='2026-11-01' and commitment='reserved'`);
  if (!pid) throw new Error('opsiyon yok');
  return `yüzey ${sql(`select name from units where id=${uid}`)}, kayıt #${pid}`;
});
await adim(2, 'Opsiyonu yayına çevir', async () => {
  await page.evaluate(p => mKayitAc(p), pid);
  await page.locator('#modal').getByRole('button', { name: 'Düzenle' }).click();
  await page.locator('#mfTaah [data-v=confirmed]').click();
  await page.locator('#mfKaydet').click();
  await bekle(() => !document.getElementById('modalBg').classList.contains('open'));
  if (sql(`select commitment from media_placements where id=${pid}`) !== 'confirmed') throw new Error('yayına çevrilmedi');
});
await adim(2, 'Takvimde doğrula', async () => {
  await page.evaluate(p => medyaOdak(p, { ayrinti: false }), pid);
  await bekle(() => document.querySelector('.mtb-b, [data-pid]'));
  await page.waitForTimeout(400);
  await foto('s2_takvim'); return await page.evaluate(() => location.hash);
});

/* 3 — Bağımsız belge → işe bağla → Hafıza ve iş detayından aç */
let docId = 0;
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
await adim(3, 'İlişkisiz belge ekle', async () => {
  await page.evaluate(() => belgeForm({}));
  await page.locator('#ek_bf input[type=file]').setInputFiles({ name: 's13t-kabul-teklif.pdf', mimeType: 'application/pdf', buffer: PDF });
  const tur = page.locator('#ek_bf .ek-tur').first(); if (!(await tur.inputValue())) await tur.selectOption('teklif');
  await page.fill('#bfBaslik', 'S13T Kabul teklifi');
  await page.locator('#bfKaydet').click();
  await bekle(() => !document.getElementById('modalBg').classList.contains('open'));
  docId = sayi(`select id from documents where title='S13T Kabul teklifi'`);
  if (!docId) throw new Error('belge yok');
});
await adim(3, 'Hafıza › Belgeler’de İlişkilendirilmemiş olarak gör, işe bağla', async () => {
  await page.evaluate(() => { hafYaz({ ...hafDurum(), tab: 'belgeler' }); return go('kurumlar'); });
  await page.getByText('S13T Kabul teklifi').first().waitFor();
  await foto('s3_belgeler');
  await page.evaluate(d => belgeDetay(d), docId);
  await page.evaluate(() => bdBaglaAc());
  await page.selectOption('#bdBTip', 'job_id');
  await bekle(() => document.querySelector('#bdBHedef') && document.querySelector('#bdBHedef').options.length > 1);
  await page.evaluate(i => { const s = document.getElementById('bdBHedef'); s.value = String(i); }, isId);
  await page.locator('#bdBKaydet').click();
  await bekle(i => (ui._bd && ui._bd.d.document_links || []).some(l => l.job_id === i), isId);
  await foto('s3_belge_detay');
});
await adim(3, 'İş detayından belgeyi aç', async () => {
  await page.evaluate(() => closeModal());
  await page.evaluate(i => workAc(i, { bolum: 'belge' }), isId);
  await page.getByText('S13T Kabul teklifi').first().waitFor();
  await foto('s3_is_belgeler');
  await page.getByText('S13T Kabul teklifi').first().click();
  await bekle(() => document.getElementById('modalBg').classList.contains('open') && ui._bd);
  await page.evaluate(() => closeModal());
});

/* 4 — Baskı/montaj + paket bedeli düzenle → rapor */
await adim(4, 'Paketli baskı/montaj kaydı ekle', async () => {
  const r = await page.evaluate(async i => {
    const { data, error } = await sb.rpc('operations_batch_create', { p_job: i, p_rows: [
      { operation_type: 'baski', description: 'S13T Kabul vinil baskı', quantity: 2, planned_date: '2026-10-20', cost: 1500, sale_amount: 2500, currency: 'TRY' },
      { operation_type: 'montaj', description: 'S13T Kabul montaj', quantity: 1, planned_date: '2026-10-22', cost: 800, sale_amount: 1200, currency: 'TRY' }],
      p_package: { label: 'Kabul paketi', cost_amount: 2000, sale_amount: 3500, currency: 'TRY' } });
    if (error) throw new Error(error.message); return data; }, isId);
  return `paket #${r.price_group_id}`;
});
await adim(4, 'Paket bedelini düzenle (2.000 → 2.400 ₺ maliyet)', async () => {
  await page.evaluate(i => workAc(i, { bolum: 'op' }), isId);
  await page.getByRole('button', { name: 'Paket bedelini düzenle' }).first().click();
  await page.fill('#pkM', '2400');
  await foto('s4_paket_formu');
  await page.locator('#pkKaydet').click();
  await bekle(() => !document.getElementById('modalBg').classList.contains('open'));
  if (sql(`select cost_amount::int from operation_price_groups where job_id=${isId}`) !== '2400') throw new Error('paket güncellenmedi');
});
await adim(4, 'Raporda paket bir kez ve güncel tutarla', async () => {
  /* S16: işe özel döküm İş dökümündedir; raporlar iç kullanımdır (maliyet). */
  await page.evaluate(i => rpAc('is', { is: i }), isId);
  await bekle(() => ui._rpModel && ui._rpTur === 'is' && ui._rpModel.ozet && !rpDurum().yukleniyor);
  const maliyet = await page.evaluate(() => ui._rpModel.baski.toplamlar.TRY.tutar); await foto('s4_rapor');
  if (maliyet !== 2400) throw new Error(`toplam ${maliyet}`);
  return 'maliyet 2.400 ₺ (satır tutarları toplama ayrıca girmedi)';
});

/* 5 — Dış paylaşım mecra raporu + kişisel plan; uygulama dışında açılır */
async function indir(dugme, ad) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator(dugme).click()]);
  const h = path.join(cikti, ad + path.extname(d.suggestedFilename())); await d.saveAs(h); return h;
}
await adim(5, 'Dış paylaşım mecra raporu (PDF + XLSX)', async () => {
  const s = sql(`select string_agg(id::text, ',') from mecralar where operational`).split(',').map(Number);
  await page.evaluate(x => rpAc('mecra', { siteler: x, bas: '2026-10-01', bit: '2026-12-31', _alici: 'dis' }), s);
  await bekle(() => ui._rpModel && ui._rpTur === 'mecra' && !rpDurum().yukleniyor);
  await foto('s5_mecra_onizleme');
  return [await indir('#rpPdfB', 'kabul_mecra'), await indir('#rpXlsB', 'kabul_mecra')].map(x => path.basename(x)).join(', ');
});
await adim(5, 'Kişisel çalışma planı (PDF)', async () => {
  await page.evaluate(() => rpAc('plan', { donem: 'hafta' }));
  await bekle(() => ui._rpModel && ui._rpTur === 'plan' && !rpDurum().yukleniyor);
  return path.basename(await indir('#rpPdfB', 'kabul_plan'));
});

await tarayici.close();
fs.writeFileSync(path.join(cikti, '_sonuc.json'), JSON.stringify({ sonuc, jsHatalari: hatalar }, null, 1));
for (const r of sonuc) console.log(`${r.senaryo}  ${r.durum}  ${r.ad}${r.not ? '  — ' + r.not : ''}`);
console.log('JS hatası:', hatalar.length ? hatalar : 'yok');
