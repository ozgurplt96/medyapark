// Sprint 18 — son teknik denetimin bulguları için regresyon testleri.
// Yazan her şey atılabilir test yığınındadır; test verisi "S13T " önekli ya da
// "S13 Regresyon Kurumu"na bağlıdır ve temizle() ile silinir.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { girisYap, sql, rpc, isOlustur, kurumId, teamId, temizle, dlg, ONEK, zipMetin, pdfMetin, KULLANICI } from '../lib/ortam.mjs';

const NOT = 'S13T s18';
test.beforeEach(() => { temizle(); sql(`delete from media_placements where note like '${NOT}%'`); });
test.afterAll(() => sql(`delete from media_placements where note like '${NOT}%'`));
const say = q => +sql(q);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

/* İlk eşleşen isteği sunucuda işlet, yanıtını düşür (06_tekrar ile aynı yöntem). */
async function yanitiKaybet(page, desen) {
  let kaldi = 1;
  await page.route(desen, async r => { if (kaldi > 0) { kaldi--; await r.fetch(); await r.abort('failed'); } else await r.continue(); });
}

test.describe('Güncelleme oluşturma: tek işlem ve tekrar güvenliği', () => {
  for (const dosyali of [false, true]) {
    test(`yanıt kaybı → formda kal → Paylaş tekrar: tek güncelleme, tek etiket${dosyali ? ', tek belge ve dosya' : ''}`, async ({ page }) => {
      const job = await isOlustur('uye', 'Güncelleme tekrar ' + (dosyali ? 'dosyalı' : 'dosyasız'));
      const metin = `${ONEK}tekrar ${dosyali ? 'dosyalı' : 'dosyasız'}`;
      const nesne = () => say(`select count(*) from storage.objects where bucket_id='documents'`);
      const n0 = nesne();
      await girisYap(page, 'uye');
      await page.evaluate(j => workAc(j), job);
      await page.waitForFunction(j => ui._work && ui._work.id === j, job);
      await yanitiKaybet(page, '**/rest/v1/rpc/entry_create_with_documents');
      await page.evaluate(j => qcAc({ jobId: j }), job);
      await page.fill('#qcBody', metin);
      await page.locator(`.qcRel[value="${teamId('uye2')}"]`).check();
      if (dosyali) await page.locator('#modalBg.open input[type=file]').first().setInputFiles({ name: 's13t-s18.pdf', mimeType: 'application/pdf', buffer: PDF });
      await page.locator('#modal').getByRole('button', { name: 'Paylaş', exact: true }).click();
      await expect(dlg(page)).toContainText('sonucu doğrulanamadı');
      await page.locator('#mpDlgNo').click();                                   // Formda kal
      await expect(page.locator('#modalBg.open #qcBody')).toHaveValue(metin);   // taslak korunur
      expect(say(`select count(*) from entries where body='${metin}'`)).toBe(1); // sunucu kaydetti
      await page.locator('#modal').getByRole('button', { name: 'Paylaş', exact: true }).click();
      await expect(page.locator('#modalBg.open')).toHaveCount(0);
      const id = say(`select id from entries where body='${metin}'`);
      expect(say(`select count(*) from entries where body='${metin}'`)).toBe(1);  // ikinci güncelleme yok
      expect(say(`select count(*) from entry_relevance where entry_id=${id}`)).toBe(1);
      if (dosyali) {
        expect(say(`select count(*) from document_links where entry_id=${id}`)).toBe(1);
        expect(nesne()).toBe(n0 + 1);                                          // dosya tek, silinmedi
        expect(say(`select count(*) from documents d join storage.objects o on o.name=d.storage_path where d.original_name='s13t-s18.pdf'`)).toBe(1);
      }
    });
  }

  test('farklı içerikle tekrar: ilk gönderim kaydedilmişse açıkça söylenir, ikinci kayıt sessizce oluşmaz', async ({ page }) => {
    const job = await isOlustur('uye', 'Güncelleme farklı');
    await girisYap(page, 'uye');
    await page.evaluate(j => workAc(j), job);
    await page.waitForFunction(j => ui._work && ui._work.id === j, job);
    await yanitiKaybet(page, '**/rest/v1/rpc/entry_create_with_documents');
    await page.evaluate(j => qcAc({ jobId: j }), job);
    await page.fill('#qcBody', ONEK + 'ilk metin');
    await page.locator('#modal').getByRole('button', { name: 'Paylaş', exact: true }).click();
    await page.locator('#mpDlgNo').click();
    await page.fill('#qcBody', ONEK + 'değişmiş metin');
    await page.locator('#modal').getByRole('button', { name: 'Paylaş', exact: true }).click();
    await expect(dlg(page)).toContainText('daha önceki bir gönderimi sunucuda kaydedilmiş');
    expect(say(`select count(*) from entries where job_id=${job} and body like '${ONEK}%'`)).toBe(1);
  });
});

test.describe('Yetki değişimi ve reddedilen silme', () => {
  test('rolü düşürülen yöneticinin açık sekmesi: silme başarı gibi görünmez, sekme yetki değişimini söyler', async ({ page }) => {
    const job = await isOlustur('admin', 'Rol düşürme');
    const taraf = say(`insert into work_parties (job_id, customer_id, role) values (${job}, ${kurumId()}, 'agency') returning id`);
    try {
      await girisYap(page, 'admin');
      expect(await page.evaluate(() => isAdmin())).toBe(true);
      sql(`update team set app_role='team_member' where eposta='${KULLANICI.admin}'`);
      const r = await page.evaluate(id => api('work_party_delete&id=' + id).then(() => 'basari', e => e.message), taraf);
      expect(r).toContain('silinemedi');                                          // 0 satır başarı sayılmaz
      expect(say(`select count(*) from work_parties where id=${taraf}`)).toBe(1);
      await page.evaluate(() => kimlikDogrula(true));
      await expect(page.locator('#oturumBg')).toContainText('Yetkiniz değişti');
    } finally { sql(`update team set app_role='admin' where eposta='${KULLANICI.admin}'`); }
  });

  test('ekip üyesi yöneticiye ait silmeleri doğrudan API ile yapamaz ve arayüz başarı bildirmez', async ({ page }) => {
    const job = await isOlustur('uye', 'Üye silme');
    const taraf = say(`insert into work_parties (job_id, customer_id, role) values (${job}, ${kurumId()}, 'agency') returning id`);
    const kurum = say(`insert into customers (firma) values ('${ONEK}silinemez kurum') returning id`);
    await girisYap(page, 'uye');
    for (const [act, id] of [['work_party_delete', taraf], ['customer_delete', kurum]]) {
      const r = await page.evaluate(([a, i]) => (a === 'customer_delete' ? api(a, { id: i }) : api(a + '&id=' + i)).then(() => 'basari', e => e.message), [act, id]);
      expect(r, act).toContain('silinemedi');
    }
    expect(say(`select count(*) from work_parties where id=${taraf}`)).toBe(1);
    expect(say(`select count(*) from customers where id=${kurum}`)).toBe(1);
  });
});

test.describe('Tam liste okumaları ve ekran taraması', () => {
  test('Baskı & Montaj "Tümü" 1000 satırda sessizce kesilmez (sayfalı okuma)', async ({ page }) => {
    const job = await isOlustur('uye', 'Sayfalama');
    sql(`insert into work_operations (job_id, operation_type, description, planned_date)
         select ${job}, 'baski', 'S13T sayfa '||g, date '2031-01-01' + g from generate_series(1,1005) g`);
    await girisYap(page, 'uye');
    const n = await page.evaluate(j => api('operations_list&job_id=' + j).then(l => l.length), job);
    expect(n).toBe(1005);
    const tum = await page.evaluate(() => api('operations_list').then(l => l.length));
    expect(tum).toBe(say(`select count(*) from work_operations`));
  });

  /* Bilinen, engel olmayan yerel iletiler: favicon 404 ve localhost'a izinli
     olmayan Google Maps anahtarı (OSM'e düşülür). */
  const BILINEN = /favicon|RefererNotAllowed|Google Maps JavaScript API|tile\.openstreetmap/i;
  for (const kim of ['uye', 'admin']) {
    test(`tüm ekranlar ve hızlı ekran değişimi: konsol hatası ve 4xx/5xx yok (${kim})`, async ({ page }) => {
      const hata = [];
      page.on('console', m => { if (m.type() === 'error' && !BILINEN.test(m.text())) hata.push(m.text().slice(0, 160)); });
      page.on('pageerror', e => hata.push('PAGEERROR ' + e.message));
      page.on('response', r => { if (r.status() >= 400 && !BILINEN.test(r.url())) hata.push(r.status() + ' ' + r.url().slice(0, 120)); });
      await girisYap(page, kim);
      const ekranlar = kim === 'uye' ? ['workspace-home', 'is-takibi', 'kurumlar', 'ws-mecralar', 'raporlar', 'operasyon', 'muhasebe', 'ekip']
        : ['dashboard', 'raporlar', 'mecralar', 'urunler', 'harita', 'listeler', 'teklifler', 'talepler', 'kurumlar', 'musteriler', 'aboneler',
           'is-takibi', 'operasyon', 'tedarikciler', 'anasayfa', 'sayfalar', 'ikonlar', 'ekip', 'notlar', 'ayarlar'];
      for (const s of ekranlar) {
        await page.evaluate(s => go(s), s);
        await page.waitForFunction(() => !/^Yükleniyor/.test((document.getElementById('content') || {}).innerText || ''));
        await page.waitForLoadState('networkidle');
      }
      /* Hızlı değişim: son ekran kazanır, önceki ekranların geç verisi üstüne çizmez. */
      await page.evaluate(l => { l.forEach(s => go(s)); }, ekranlar.slice(0, 5));
      await page.waitForLoadState('networkidle');
      const son = ekranlar[4];
      expect(await page.evaluate(() => ui.section)).toBe(son);
      expect(hata, hata.join('\n')).toEqual([]);
    });
  }
});

/* ---------- Excel üst alanı ve PDF metni ---------- */
function mecraSec() {
  const bos = u => `not exists (select 1 from media_placements p where p.unit_id=${u} and p.commitment<>'cancelled'
                    and p.start_date<='2038-12-31' and coalesce(p.end_date,'9999-12-31')>='2037-01-01')`;
  const [A, site, alan] = sql(`select a.id||','||m.id||','||al.id from units a join alt_mecralar al on al.id=a.alt_mecra_id join mecralar m on m.id=al.mecra_id
     where m.operational and al.occupancy_mode='exclusive' and not al.legacy_archived and a.active and ${bos('a.id')}
       and exists (select 1 from alt_mecralar l where l.mecra_id=m.id and l.occupancy_mode='concurrent' and not l.legacy_archived)
     order by a.id limit 1`).split(',').map(Number);
  const led = say(`select min(id) from alt_mecralar where mecra_id=${site} and occupancy_mode='concurrent' and not legacy_archived`);
  const yaz = (col, id) => sql(`insert into media_placements (${col}, customer_id, commitment, start_date, end_date, note, created_by_team_id)
    values (${id}, ${kurumId()}, 'confirmed', '2037-03-05', '2037-03-20', '${NOT}', ${teamId('uye')})`);
  yaz('unit_id', A); yaz('alt_mecra_id', led);
  return { A, site, alan, led };
}
/* İndirilen xlsx'i sayfa içinde ExcelJS ile açar: her sayfanın sabitleme,
   baskı başlığı, ilk üç satırı ve alt notu. */
const xlsYapi = (page, kaynak) => page.evaluate(async k => {
  const blob = k === 'md' ? ui._mdSonXls.blob : ui._rpSon.blob;
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await blob.arrayBuffer());
  const hv = v => v == null ? '' : typeof v === 'object' && v.richText ? v.richText.map(x => x.text).join('') : String(v);
  return wb.worksheets.map(ws => ({ ad: ws.name, ySplit: (ws.views[0] || {}).ySplit, baslik: ws.pageSetup.printTitlesRow,
    r: [1, 2, 3, 4].map(i => ws.getRow(i).values.slice(1).map(hv).filter(Boolean)),
    alt: [...Array(ws.rowCount).keys()].map(i => hv(ws.getCell(i + 1, 1).value)).filter(t => /Renk anahtarı|Her satır bir kampanyadır|Paket bedeli|toplam/i.test(t)).slice(0, 2) }));
}, kaynak);
const ustSade = s => {
  expect(s.ySplit, s.ad).toBe(3);
  expect(s.baslik, s.ad).toBe('3:3');
  expect(s.r[0].length, s.ad + ' 1. satır yalnız başlık').toBe(1);
  expect(s.r[1].length, s.ad + ' 2. satır yalnız kısa bilgi').toBe(1);
  expect(s.r[2].join('|'), s.ad + ' 3. satır sütun başlıkları').toMatch(/^(No\|Yüz|Kampanya\|Durum|Tarih\|Müşteri|Yayın alanı)/);
  expect(s.r.slice(0, 3).flat().join('|'), s.ad).not.toMatch(/Ay içinde değişim|Dönem dışı\|/);
};

test.describe('Doluluk Excel üst alanı ve rapor PDF metni', () => {
  test('Mecralar doğrudan Excel: başlık · kısa bilgi · sütunlar; sabitleme ve baskı başlığı 3. satır; renk anahtarı alt notta', async ({ page }) => {
    const F = mecraSec();
    await girisYap(page, 'uye');
    await page.evaluate(F => medyaGit({ site: F.site, alan: '', kurum: '', is: '', q: '', urun: '', durum: '', bas: '2037-03-01', bit: '2037-03-31', gecmisGizle: false, acik: {} }), F);
    await page.waitForFunction(() => ui._mdSonuc && document.querySelector('#mdGovde .md-sonuc') && !ui._mdYukleniyor);
    await Promise.all([page.waitForEvent('download'), page.evaluate(s => mdExcel({ site: s }), F.site)]);
    const S = await xlsYapi(page, 'md');
    S.forEach(ustSade);
    expect(S.find(s => s.r[2][0] === 'No').alt[0]).toContain('Renk anahtarı');
    expect(S.find(s => s.r[2][0] === 'Kampanya').alt[0]).toContain('Her satır bir kampanyadır');
    /* Kayıtlar değişmedi: yüzün Mart hücresi kurum ve kesin tarihi taşır (satır 4+). */
    const hucre = await page.evaluate(async () => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await ui._mdSonXls.blob.arrayBuffer());
      const out = []; wb.worksheets[0].eachRow((row, i) => { if (i >= 4) out.push(row.values.slice(1).map(v => v && v.richText ? v.richText.map(x => x.text).join('') : v).join('|')); }); return out.join('\n'); });
    expect(hucre).toContain('05.03–20.03.2037');
  });

  test('Raporlar › doluluk: iç ve dış Excel/PDF — sade üst alan, dış çıktıda kurum adı yok, PDF metni beklenen içeriği taşır', async ({ page }) => {
    const F = mecraSec();
    const kurumAd = sql(`select firma from customers where id=${kurumId()}`);
    await girisYap(page, 'uye');
    for (const alici of ['ic', 'dis']) {
      await page.evaluate(([F, a]) => rpAc('mecra', { siteler: [F.site], bas: '2037-03-01', bit: '2037-03-31', _alici: a }), [F, alici]);
      await page.waitForFunction(a => ui._rpTur === 'mecra' && ui._rpModel && !rpDurum().yukleniyor && rpAyar('mecra')._alici === a, alici);
      const [x] = await Promise.all([page.waitForEvent('download'), page.locator('#rpXlsB').click()]);
      (await xlsYapi(page, 'rp')).forEach(ustSade);
      const ham = zipMetin(fs.readFileSync(await x.path()));
      const [p] = await Promise.all([page.waitForEvent('download'), page.locator('#rpPdfB').click()]);
      const metin = pdfMetin(fs.readFileSync(await p.path()));
      test.skip(metin == null, 'PDF metni çıkarılamadı (PyMuPDF yok) — PDF içerik denetimi YAPILMADI');
      expect(metin).toContain('01.03.2037 – 31.03.2037');
      expect(metin).toMatch(/Müsait/);
      if (alici === 'dis') {
        for (const t of [ham, metin]) { expect(t).not.toMatch(/Regresyon/i); expect(t).not.toContain(kurumAd); }
        expect(metin).toContain('Dolu');
      } else { expect(metin).toMatch(/REGRESYON|Regresyon/); expect(ham).toMatch(/Regresyon/i); }
    }
  });

  test('Baskı/montaj takip, İş dökümü ve Kişisel plan PDF\'leri kaydın önemli verisini taşır; takip Excel üst alanı sade', async ({ page }) => {
    const job = await isOlustur('uye', 'PDF içerik');
    const r = await rpc('uye', 'operations_batch_create', { p_job: job, p_rows: [{ operation_type: 'baski', description: 'S13T pdf baskı kalemi', planned_date: '2031-07-01', cost: 777 }] });
    expect(r.durum).toBe(200);
    const yarin = new Date(Date.now() + 864e5).toISOString();
    sql(`insert into entries (job_id, body, created_by_team_id, assignee_id, due_at, action_status) values (${job}, '${ONEK}plandaki aksiyon', ${teamId('uye')}, ${teamId('uye')}, '${yarin}', 'open')`);
    await girisYap(page, 'uye');
    await page.evaluate(j => rpAc('baski', { is: j, donem: 'tum' }), job);
    await page.waitForFunction(() => ui._rpTur === 'baski' && ui._rpModel && !rpDurum().yukleniyor);
    await Promise.all([page.waitForEvent('download'), page.locator('#rpXlsB').click()]);
    ustSade((await xlsYapi(page, 'rp'))[0]);
    const pdf = async () => { const [p] = await Promise.all([page.waitForEvent('download'), page.locator('#rpPdfB').click()]); return pdfMetin(fs.readFileSync(await p.path())); };
    let m = await pdf();
    test.skip(m == null, 'PDF metni çıkarılamadı (PyMuPDF yok) — PDF içerik denetimi YAPILMADI');
    expect(m).toContain('S13T pdf baskı kalemi');
    expect(m).toContain('777,00');
    await page.evaluate(j => rpAc('is', { is: j }), job);
    await page.waitForFunction(() => ui._rpTur === 'is' && ui._rpModel && ui._rpModel.ozet && !rpDurum().yukleniyor);
    m = await pdf();
    expect(m).toContain(ONEK + 'PDF içerik');
    expect(m).toContain('S13T pdf baskı kalemi');
    await page.evaluate(() => rpAc('plan', { donem: 'hafta' }));
    await page.waitForFunction(() => ui._rpTur === 'plan' && ui._rpModel && !rpDurum().yukleniyor);
    m = await pdf();
    expect(m).toContain('plandaki aksiyon');
  });
});
