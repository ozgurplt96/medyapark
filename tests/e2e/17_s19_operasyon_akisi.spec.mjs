// S19 kapanış — Baskı / Montaj operasyon akışı.
// Üç durum, türetilen "gecikti", ayrı planlanan/gerçekleşen tarih, üretim kalemi
// akışı, okunur detay + Düzenle, bağlantılı kayıt önerisi, Kaydet/Vazgeç,
// doğrulanmış uygulayan seçicisi. Beklenen değerler elle yazılır.
import { test, expect } from '@playwright/test';
import { girisYap, sql, rpc, temizle, isOlustur, kurumId, dlg } from '../lib/ortam.mjs';

test.beforeEach(() => temizle());
test.afterAll(() => temizle());

const op = id => { const [st, plan, ger, kalem, org, kisi, re] = sql(`select status||'|'||coalesce(planned_date::text,'')||'|'||coalesce((completed_at at time zone 'Europe/Istanbul')::date::text,'')
  ||'|'||coalesce(kalem_key::text,'')||'|'||coalesce(supplier_org_id::text,'')||'|'||coalesce(supplier_contact_id::text,'')||'|'||reprint from work_operations where id=${id}`).split('|');
  return { st, plan, ger, kalem, org, kisi, re: re === 'true' }; };
const hareket = job => sql(`select coalesce(string_agg(body, ' || ' order by id), '') from entries where job_id=${job} and source='system' and system_kind like 'operation%'`);
const hareketSay = job => +sql(`select count(*) from entries where job_id=${job} and source='system'`);
const opIds = job => sql(`select coalesce(string_agg(id::text, ',' order by id), '') from work_operations where job_id=${job}`).split(',').filter(Boolean).map(Number);
const kaydet = page => page.locator('#modalBg.open').getByRole('button', { name: 'Kaydet', exact: true }).click();
const kapandi = page => expect(page.locator('#modalBg.open')).toHaveCount(0);
/* Vazgeç: form gerçekten değiştiyse (klavye/fare girişi) onay sorulur → "Kaydetmeden kapat". */
async function vazgec(page, onayBeklenir) {
  await page.locator('#modalBg.open').getByRole('button', { name: 'Vazgeç' }).click();
  if (onayBeklenir) { await expect(page.locator('#mpDlgOk')).toBeVisible(); await page.locator('#mpDlgOk').click(); }
  await kapandi(page);
}
/* Doğrulanmış uygulayıcılar (test verisi): kurum rolü + işaretli kişi. */
function uygulayanlar() {
  const merkez = +sql(`insert into customers (firma, relationship_roles) values ('S13T Baskı Merkezi', '["print_center"]') returning id`);
  const etiketli = +sql(`insert into customers (firma, relationship_roles) values ('S13T Yalnız Tedarikçi Etiketli', '["supplier"]') returning id`);
  const kisi = +sql(`insert into contacts (name, is_executor) values ('S13T Saha Uygulayıcısı', true) returning id`);
  return { merkez, etiketli, kisi };
}
async function listeAc(page) {
  await page.evaluate(() => { opFiltreYaz({ donem: 'tum', from: '', to: '', type: '', kapsam: 'tum', q: 'S13T' }); go('operasyon'); });
  await page.waitForFunction(() => document.querySelector('.opk-r, #content .empty') && !/Yükleniyor/.test(document.getElementById('content').innerText.slice(0, 40)));
}
const satirlar = (page, job) => page.evaluate(j => [...document.querySelectorAll('.opk-r')].filter(r => r.querySelector('.opk-j').getAttribute('onclick') === `workAc(${j})`)
  .map(r => ({ adim: [...r.querySelectorAll('.opk-c')].map(c => ({ id: +c.dataset.op, sinif: c.className, metin: c.innerText.replace(/\s+/g, ' ').trim() })),
    sira: r.querySelector('.opk-sr').innerText.replace(/\s+/g, ' ').trim() })), job);

test.describe('Durum: Yapılacak / Tamamlandı / İptal', () => {
  test('eski durumlar "Yapılacak" olarak saklanır; dönüşüm hareket üretmez; gecikti planlanan tarihten türetilir', async ({ page }) => {
    const job = await isOlustur('uye', 'Op durum');
    const a = +sql(`insert into work_operations (job_id, operation_type, status, description, planned_date) values (${job}, 'baski', 'in_progress', 'S13T eski devam', '2020-01-10') returning id`);
    const b = +sql(`insert into work_operations (job_id, operation_type, status, description, planned_date) values (${job}, 'montaj', 'waiting', 'S13T eski bekliyor', '2099-01-10') returning id`);
    expect([op(a).st, op(b).st]).toEqual(['planned', 'planned']);              // saklanan değer sadeleşti
    const once = hareketSay(job);
    sql(`update work_operations set status='in_progress' where id=${a}`);      // eski istemci eski değeri yazarsa
    expect(op(a).st).toBe('planned');
    expect(hareketSay(job)).toBe(once);                                        // dönüşüm hareket değildir
    await girisYap(page, 'uye');
    await listeAc(page);
    const s = await satirlar(page, job);
    expect(s.length).toBe(2);                                                   // bağsız iki kayıt = iki ayrı kalem (zincir dayatılmaz)
    const A = s.find(x => x.adim[0].id === a).adim[0], B = s.find(x => x.adim[0].id === b).adim[0];
    expect(A.sinif).toMatch(/gec/); expect(A.metin).toMatch(/Gecikti · \d+ gün · plan 10\.01\.2020/);
    expect(B.sinif).not.toMatch(/gec/); expect(B.metin).toContain('Yapılacak · 10.01.2099');
    await expect(page.locator('#content')).not.toContainText(/Devam ediyor|Bekliyor|Planlandı/);
    /* Durum seçenekleri üç tanedir. */
    await page.evaluate(id => opForm(id), a);
    await expect(page.locator('#opSt option')).toHaveText(['Yapılacak', 'Tamamlandı', 'İptal']);
  });

  test('Kaydet/Vazgeç: kaydedilmeyen durum değişimi yazılmaz ve hareket üretmez; gerçekleşen tarih tahmin edilmez, planlanandan ayrıdır', async ({ page }) => {
    const job = await isOlustur('uye', 'Op kaydet');
    const a = +sql(`insert into work_operations (job_id, operation_type, status, description, planned_date) values (${job}, 'montaj', 'planned', 'S13T montaj', '2026-03-10') returning id`);
    await girisYap(page, 'uye');
    const h0 = hareketSay(job);
    /* Kayda tıklamak OKUNUR detayı açar; düzenleme ayrı adımdır. */
    await page.evaluate(id => opAc(id), a);
    await expect(page.locator('#modalBg.open #opdBaslik')).toHaveText('S13T montaj');
    await expect(page.locator('#modalBg.open input, #modalBg.open select, #modalBg.open textarea')).toHaveCount(0);
    await expect(page.locator('#modalBg.open')).toContainText('Planlanan tarih');
    await page.locator('#opdDuzenle').click();
    await expect(page.locator('#opSt')).toHaveValue('planned');
    await expect(page.locator('#opGerK')).toBeHidden();
    await page.locator('#opSt').focus();
    await page.keyboard.press('ArrowDown');                                     // gerçek kullanıcı girişi: Yapılacak → Tamamlandı
    await expect(page.locator('#opSt')).toHaveValue('done');
    await expect(page.locator('#opGerK')).toBeVisible();
    await expect(page.locator('#opGer')).toHaveValue('');                       // sistem tarih önermez
    /* Vazgeç → kaydedilmemiş değişiklik sorulur; kapatılınca hiçbir şey yazılmaz. */
    await vazgec(page, true);
    expect(op(a)).toMatchObject({ st: 'planned', ger: '' });
    expect(hareketSay(job)).toBe(h0);
    /* Kaydet, gerçekleşen tarih boş → tamamlandı, tarih YOK (tahmin edilmedi). */
    await page.evaluate(id => opForm(id), a);
    await page.selectOption('#opSt', 'done');
    await kaydet(page); await kapandi(page);
    expect(op(a)).toMatchObject({ st: 'done', ger: '', plan: '2026-03-10' });
    expect(hareketSay(job)).toBe(h0 + 1);
    expect(hareket(job)).toContain('Montaj tamamlandı.');
    await page.evaluate(id => opAc(id), a);
    await expect(page.locator('#modalBg.open .opd-dl')).toContainText('Gerçekleşen tarih');
    await expect(page.locator('#modalBg.open .opd-dl')).toContainText('girilmedi');
    /* Gerçekleşen tarih girilir: planlanan değişmez, yeni hareket oluşmaz (durum aynı). */
    await page.locator('#opdDuzenle').click();
    await page.locator('#opGer').fill('2099-01-01');                            // gelecekteki gerçekleşen tarih reddedilir
    await kaydet(page);
    await expect(dlg(page)).toContainText('gelecekte olamaz');
    await page.locator('#mpDlgBg button').first().click();
    expect(op(a).ger).toBe('');
    await page.locator('#opGer').fill('2026-03-12');
    await kaydet(page); await kapandi(page);
    expect(op(a)).toMatchObject({ st: 'done', ger: '2026-03-12', plan: '2026-03-10' });
    expect(hareketSay(job)).toBe(h0 + 1);
    /* İptal ve yeniden açma: her biri tek hareket. */
    await page.evaluate(id => opForm(id), a);
    await page.selectOption('#opSt', 'cancelled'); await kaydet(page); await kapandi(page);
    expect(op(a)).toMatchObject({ st: 'cancelled', ger: '' });
    await page.evaluate(id => opForm(id), a);
    await page.selectOption('#opSt', 'planned'); await kaydet(page); await kapandi(page);
    expect(op(a).st).toBe('planned');
    expect(hareket(job)).toMatch(/Montaj tamamlandı\. \|\| Montaj iptal edildi\. \|\| Montaj yeniden yapılacak olarak işaretlendi/);
    expect(hareketSay(job)).toBe(h0 + 3);
  });
});

test.describe('Üretim kalemi akışı', () => {
  test('bağlantılı baskı → montaj → söküm: öneri formu, Kaydet ile oluşur; akışta birlikte görünür; sıradaki işlem, tarih ve uygulayan', async ({ page }) => {
    const U = uygulayanlar();
    const job = await isOlustur('uye', 'Op zincir');
    await girisYap(page, 'uye');
    await page.evaluate(() => go('operasyon'));
    /* Yeni kayıt: sade tek-kayıt formu (toplu giriş ve paket açılır bölüm/bağlantıdır). */
    await page.evaluate(() => opForm(0));
    await expect(page.locator('#modalBg.open #opbRows')).toHaveCount(0);
    await expect(page.locator('#opDetTek')).not.toHaveAttribute('open', '');
    await expect(page.locator('#opDetTic')).not.toHaveAttribute('open', '');
    await page.selectOption('#opJob', String(job));
    await page.locator('#opDesc').fill('S13T zincir baskı');
    await page.locator('#opLoc').fill('S13T Fuar alanı');
    await page.locator('#opDate').fill('2026-05-02');
    /* Uygulayan seçicisi: yalnız doğrulanmış kurum/kişi; "Tedarikçi" etiketi tek başına yetmez. */
    const secenek = await page.locator('#opSup option').allTextContents();
    expect(secenek.some(t => t.includes('S13T Baskı Merkezi'))).toBe(true);
    expect(secenek.some(t => t.includes('S13T Saha Uygulayıcısı'))).toBe(true);
    expect(secenek.some(t => t.includes('S13T Yalnız Tedarikçi Etiketli'))).toBe(false);
    expect(secenek.some(t => t.includes('S13 Regresyon Kurumu'))).toBe(false);
    expect(secenek.length).toBeLessThan(40);                                    // bütün kurumlar listelenmez
    await page.selectOption('#opSup', 'k' + U.merkez);
    await kaydet(page); await kapandi(page);
    const [baski] = opIds(job);
    expect(op(baski)).toMatchObject({ st: 'planned', plan: '2026-05-02', org: String(U.merkez), kisi: '', kalem: '' });
    /* Detay → Montaj ekle: iş, yer ve kalem bilgisi ÖNERİ; Kaydet'e kadar kayıt yok. */
    await page.evaluate(id => opAc(id), baski);
    await page.locator('#modalBg.open').getByRole('button', { name: 'Montaj ekle' }).click();
    await expect(page.locator('#modalBg.open .op-oneri')).toContainText('aynı üretim kalemine');
    await expect(page.locator('#opJob')).toHaveValue(String(job));
    await expect(page.locator('#opT')).toHaveValue('montaj');
    await expect(page.locator('#opLoc')).toHaveValue('S13T Fuar alanı');
    await expect(page.locator('#opRe')).toBeHidden();                           // türe uygun alanlar: yeniden baskı montajda yok
    await expect(page.locator('#opMat')).toBeHidden();
    expect(opIds(job).length).toBe(1);                                          // henüz oluşmadı
    await page.locator('#opDate').fill('2031-05-06');
    await page.selectOption('#opSup', 'p' + U.kisi);                            // kişi seçimi
    await kaydet(page); await kapandi(page);
    const montaj = opIds(job)[1];
    expect(op(montaj)).toMatchObject({ st: 'planned', plan: '2031-05-06', kisi: String(U.kisi), org: '' });
    expect(op(montaj).kalem).not.toBe(''); expect(op(montaj).kalem).toBe(op(baski).kalem);
    /* Montajdan söküm. Vazgeç denenir: kayıt oluşmaz. */
    await page.evaluate(id => opAc(id), montaj);
    await page.locator('#modalBg.open').getByRole('button', { name: 'Söküm ekle' }).click();
    await page.locator('#opDate').fill('2031-06-30');
    await vazgec(page, false);
    expect(opIds(job).length).toBe(2);
    await page.evaluate(id => opBagliEkle(id, 'sokum'), montaj);
    await page.locator('#opDate').fill('2031-06-30');
    await kaydet(page); await kapandi(page);
    const sokum = opIds(job)[2];
    expect(op(sokum).kalem).toBe(op(baski).kalem);
    /* Baskı tamamlanır (gerçekleşen 03.05) → akış: ✓ baskı, sıradaki montaj. */
    await page.evaluate(id => opForm(id), baski);
    await page.selectOption('#opSt', 'done'); await page.locator('#opGer').fill('2026-05-03');
    await kaydet(page); await kapandi(page);
    await listeAc(page);
    const [K] = await satirlar(page, job);
    expect(K.adim.map(a => a.id)).toEqual([baski, montaj, sokum]);             // tek kalem, üç bağlantılı işlem
    expect(K.adim[0].sinif).toMatch(/done/); expect(K.adim[0].metin).toContain('Tamamlandı · 03.05.2026');
    expect(K.adim[0].metin).toContain('S13T Baskı Merkezi');
    expect(K.adim[1].sinif).toMatch(/sira/); expect(K.adim[1].metin).toContain('Yapılacak · 06.05.2031');
    expect(K.adim[1].metin).toContain('S13T Saha Uygulayıcısı');
    expect(K.sira).toMatch(/Montaj 06\.05\.2031 S13T Saha Uygulayıcısı/);
    /* Detayda akış ve sıradaki işlem cümlesi. */
    await page.locator(`.opk-c[data-op="${sokum}"]`).click();
    await expect(page.locator('#modalBg.open .opk-c')).toHaveCount(3);
    await expect(page.locator('#modalBg.open .opk-c.simdi')).toHaveAttribute('data-op', String(sokum));
    await expect(page.locator('#modalBg.open .opd-sira')).toContainText('Sıradaki işlem: Montaj · 06.05.2031');
    /* Takip raporu aynı kalemi baskı + montajı yan yana verir; uygulayan kişi adıyla. */
    const rap = await page.evaluate(async j => { await rpAc('baski', { is: j, donem: 'tum' }); return null; }, job);
    await page.waitForFunction(() => ui._rpTur === 'baski' && ui._rpModel && !rpDurum().yukleniyor);
    const m = await page.evaluate(() => ui._rpModel.satirlar.filter(s => s.rows).map(s => ({ not: s.not, rows: s.rows.map(r => [r.urun, r.merkez || '', r.mYapan || '']) })));
    expect(rap).toBeNull();
    expect(m.length).toBe(1);
    expect(m[0].rows[0][1]).toContain('S13T Baskı Merkezi');
    expect(m[0].rows[0][2]).toContain('S13T Saha Uygulayıcısı');
  });

  test('yeniden baskı, ortak montaj ve yalnız söküm senaryoları korunur; zincir dayatılmaz', async ({ page }) => {
    const job = await isOlustur('uye', 'Op senaryo');
    /* Ortak montaj: iki baskı + tek montaj aynı kalem (toplu giriş RPC'si, kalem etiketi 1). */
    const r = await rpc('uye', 'operations_batch_create', { p_job: job, p_rows: [
      { operation_type: 'baski', description: 'S13T pano A baskı', planned_date: '2031-07-01', kalem: '1', cost: 100 },
      { operation_type: 'baski', description: 'S13T pano B baskı', planned_date: '2031-07-01', kalem: '1', cost: 200 },
      { operation_type: 'montaj', description: 'S13T ortak montaj', planned_date: '2031-07-05', kalem: '1', cost: 50 },
      { operation_type: 'sokum', description: 'S13T yalnız söküm', planned_date: '2031-07-20' }] });
    expect(r.durum).toBe(200);
    const [bA, bB, mo, so] = r.veri.ids;
    expect(new Set([op(bA).kalem, op(bB).kalem, op(mo).kalem]).size).toBe(1);
    expect(op(so).kalem).toBe('');
    await girisYap(page, 'uye');
    /* Yeniden baskı: baskı detayından, aynı kalem, "yeniden baskı" işaretli öneri. */
    await page.evaluate(id => opAc(id), bA);
    await page.locator('#modalBg.open').getByRole('button', { name: 'Yeniden baskı ekle' }).click();
    await expect(page.locator('#opT')).toHaveValue('baski');
    await expect(page.locator('#opRe')).toBeChecked();
    await expect(page.locator('#opDesc')).toHaveValue('S13T pano A baskı');
    await page.locator('#opDate').fill('2031-07-03');
    await kaydet(page); await kapandi(page);
    const re = opIds(job).pop();
    expect(op(re)).toMatchObject({ re: true, kalem: op(bA).kalem });
    await listeAc(page);
    const s = await satirlar(page, job);
    expect(s.length).toBe(2);                                                   // ortak kalem + yalnız söküm
    const ortak = s.find(x => x.adim.length === 4), tek = s.find(x => x.adim.length === 1);
    expect(ortak.adim.map(a => a.id)).toEqual([bA, bB, re, mo]);                // baskılar tarih sırasıyla, sonra montaj
    expect(ortak.adim[2].metin).toContain('yeniden');
    expect(ortak.adim[0].metin).toContain('pano A');                            // aynı türden birden çok işlem ayırt edilir
    expect(tek.adim[0].id).toBe(so);                                            // yalnız söküm: tek adımlı kalem, baskı/montaj uydurulmaz
    expect(tek.adim[0].metin).toMatch(/^○ ?Söküm/);
    /* Takip raporu toplamı değişmedi: 100 + 200 + 50 (ortak montaj BİR kez) + yeniden baskı (bedelsiz). */
    await page.evaluate(j => rpAc('baski', { is: j, donem: 'tum' }), job);
    await page.waitForFunction(() => ui._rpTur === 'baski' && ui._rpModel && !rpDurum().yukleniyor);
    const top = await page.evaluate(() => ui._rpModel.toplamlar);
    expect(JSON.stringify(top)).toContain('350');
  });
});

test.describe('Detay, belge ve uygulayan', () => {
  test('fotoğraf ve belgeler işlemden açılır; doğrulanmamış kayıtlı uygulayan korunur; mobilde taşma yok', async ({ page }) => {
    const U = uygulayanlar();
    const job = await isOlustur('uye', 'Op belge');
    const a = +sql(`insert into work_operations (job_id, operation_type, status, description, planned_date, supplier_org_id) values (${job}, 'montaj', 'planned', 'S13T belgeli montaj', '2031-08-01', ${U.etiketli}) returning id`);
    const d = await rpc('uye', 'document_create', { p_docs: [{ provider: 'external', external_url: 'https://ornek.test/s13t-montaj.jpg',
      original_name: 's13t-montaj-foto.jpg', title: 'S13T montaj fotoğrafı', doc_type: 'montaj_fotografi', links: [{ operation_id: a }] }] });
    expect(d.durum).toBe(200);
    await page.setViewportSize({ width: 390, height: 844 });
    await girisYap(page, 'uye');
    await listeAc(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.locator(`.opk-c[data-op="${a}"]`).click();
    const satir = page.locator('#modalBg.open .opd-bl .bl-row');
    await expect(satir).toHaveCount(1);
    await expect(satir).toContainText('S13T montaj fotoğrafı');
    expect(await page.evaluate(() => { const m = document.getElementById('modal'); return m.scrollWidth <= m.clientWidth + 1; })).toBe(true);
    /* Aç → belge açılır (harici bağlantı yeni sekmede). */
    await page.evaluate(() => { window.__acilan = []; window.open = (u) => { window.__acilan.push(String(u)); return null; }; });
    await satir.getByRole('button', { name: 'Aç' }).click();
    expect(await page.evaluate(() => window.__acilan)).toEqual(['https://ornek.test/s13t-montaj.jpg']);
    /* Doğrulanmamış kayıtlı uygulayan: seçicide ayrı grupta durur; dokunmadan Kaydet onu silmez. */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => { const b = document.getElementById('mpDlgBg'); if (b) b.remove(); closeModal(); });
    await page.evaluate(id => opForm(id), a);
    await expect(page.locator('#opSup')).toHaveValue('k' + U.etiketli);
    await expect(page.locator('#opSup optgroup').first()).toHaveAttribute('label', /doğrulanmamış/);
    await page.locator('#opNote').fill('S13T not');
    await kaydet(page); await kapandi(page);
    expect(op(a).org).toBe(String(U.etiketli));
    /* Belirlenmemiş bırakılabilir. */
    await page.evaluate(id => opForm(id), a);
    await page.selectOption('#opSup', '');
    await kaydet(page); await kapandi(page);
    expect(op(a)).toMatchObject({ org: '', kisi: '' });
    /* Hafıza: uygulayıcı rolleri ve kişi işareti mevcut modelde. */
    await page.evaluate(id => orgAc(id), kurumId());
    await page.waitForFunction(() => ui._org && ui._org.id);
    await page.evaluate(id => orgRolForm(id), kurumId());
    await expect(page.locator('#modalBg.open')).toContainText('Baskı merkezi');
    await expect(page.locator('#modalBg.open')).toContainText('Uygulayıcı (montaj / söküm)');
    await page.evaluate(() => closeModal());
    await page.evaluate(id => contactForm(id), U.kisi);
    await expect(page.locator('#kex')).toBeChecked();
    await page.locator('#kex').evaluate(e => e.click());                        // anahtar görseli: kutu CSS ile gizli
    await kaydet(page); await kapandi(page);
    expect(sql(`select is_executor from contacts where id=${U.kisi}`)).toBe('f');
    await page.evaluate(id => opForm(id), a);
    expect((await page.locator('#opSup option').allTextContents()).some(t => t.includes('S13T Saha Uygulayıcısı'))).toBe(false);
  });
});
