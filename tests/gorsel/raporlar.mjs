// Temsili rapor dosyaları (yalnız test yığını, sentetik veri).
// Kullanım: node gorsel/raporlar.mjs <cikti-klasoru>
// Çıktı klasörü Git DIŞINDA tutulmalıdır.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { hedefDogrula, girisYap, sql, rpc, isOlustur, kurumId, teamId, temizle } from '../lib/ortam.mjs';

hedefDogrula();
const cikti = process.argv[2] || 'rapor-cikti';
fs.mkdirSync(cikti, { recursive: true });
temizle();

/* Uzun metinli, çok satırlı sentetik iş: sayfa kırılımı ve uzun başlık/not. */
const UZUN = 'S13T Çok uzun adlı kampanya — M1 Adana AVM giriş katı Megalight ve Raket yüzlerinde sonbahar lansmanı, ikinci dalga ve bölge mağazaları';
const isId = await isOlustur('uye', UZUN.slice(5));
const satirlar = Array.from({ length: 34 }, (_, i) => ({
  operation_type: i % 3 === 2 ? 'montaj' : 'baski', status: i % 5 === 0 ? 'done' : 'planned',
  description: `Pozisyon ${i + 1}: vinil baskı, laminasyonlu, kenar payı 5 cm` + (i % 7 === 0 ? ' — müşteri onayı sonrası revize edilen görsel; ölçüler yerinde yeniden alındı, eski germe çıtası değiştirilecek' : ''),
  quantity: 1 + (i % 4), quantity_unit: 'adet', dimensions: '385×260 cm', material: 'Vinil 510 gr',
  planned_date: `2031-05-${String(1 + (i % 28)).padStart(2, '0')}`, cost: 1200 + i * 35, sale_amount: 2100 + i * 50, currency: 'TRY',
  note: i % 6 === 0 ? 'İç not: gece montajı, AVM güvenliğine 48 saat önce bildirim; forklift ve iskele ayrıca kiralanacak.' : null }));
const op = await rpc('uye', 'operations_batch_create', { p_job: isId, p_rows: satirlar.slice(0, 30),
  p_package: { label: 'Lansman paketi', cost_amount: 30000, sale_amount: 52000, currency: 'TRY' } });
await rpc('uye', 'operations_batch_create', { p_job: isId, p_rows: satirlar.slice(30) });
const paket = op.veri.price_group_id;
sql(`update operation_price_groups set cost_amount=31500, sale_amount=54000 where id=${paket}`);   // düzenlendi
for (let i = 0; i < 6; i++) sql(`insert into entries (job_id, body, created_by_team_id, occurred_at, due_at, action_status)
  values (${isId}, 'S13T Güncelleme ${i + 1}: müşteri ile görüşüldü, ikinci dalga için görseller perşembeye kadar gelecek; montaj ekibi hafta sonu çalışacak.',
  ${teamId('uye')}, now() - interval '${i} days', ${i < 3 ? `current_date + ${i + 1}` : 'null'}, ${i < 3 ? `'open'` : 'null'})`);

const tarayici = await chromium.launch({ channel: 'chrome' });
const page = await (await tarayici.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } })).newPage();
await girisYap(page, 'uye');
async function indir(dugme, ad) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator(dugme).click()]);
  const hedef = path.join(cikti, ad + path.extname(d.suggestedFilename()));
  await d.saveAs(hedef); console.log('✓', hedef);
}
async function ac(tur, preset) {
  await page.evaluate(([t, p]) => rpAc(t, p), [tur, preset]);
  await page.waitForFunction(t => ui._rpModel && ui._rpTur === t && !rpDurum().yukleniyor, tur);
}
const siteler = sql(`select string_agg(id::text, ',') from mecralar where operational`).split(',').map(Number);
await ac('mecra', { siteler, bas: '2026-10-01', bit: '2027-03-31', _alici: 'dis' });
await indir('#rpPdfB', 'mecra_doluluk'); await indir('#rpXlsB', 'mecra_doluluk');
await ac('baski', { sablon: 'takip', donem: 'tum', kurum: kurumId(), _alici: 'ic' });
await indir('#rpPdfB', 'baski_montaj_takip'); await indir('#rpXlsB', 'baski_montaj_takip');
await ac('baski', { sablon: 'dokum', kurum: kurumId(), is: isId, _alici: 'dis' });
await indir('#rpPdfB', 'baski_montaj_dokum'); await indir('#rpXlsB', 'baski_montaj_dokum');
await ac('plan', { kisi: teamId('uye'), donem: 'hafta' });
await indir('#rpPdfB', 'kisisel_plan');
await ac('is', { is: isId, _alici: 'ic', kisiler: true, guncelleme: true, aksiyon: true, muhasebe: true });
await indir('#rpPdfB', 'is_ozeti');
await tarayici.close();
console.log('bitti');
