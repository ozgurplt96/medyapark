// Sprint 16 — Mecralar aylık yönetim tablosu ve işlev odaklı raporlar.
// Beklenen tarihler elle, takvim gerçeğinden yazılır (uygulamanın hesap
// fonksiyonundan ÜRETİLMEZ). Dönem 2037: hiçbir tohum kaydı bu yıla uzanmaz;
// seçilen yüzlerin o yıl boş olduğu ayrıca sorgulanır.
import { test, expect } from '@playwright/test';
import { girisYap, sql, kurumId, teamId, temizle, isOlustur, rpc, ONEK, APP } from '../lib/ortam.mjs';

test.beforeEach(() => { temizle(); sql(`delete from media_placements where note='S13T diğer kurum'`); });
test.afterAll(() => sql(`delete from media_placements where note='S13T diğer kurum'`));

/* Aynı panonun A/B yüzü + aynı lokasyonda bir yüz daha + LED alanı; 2037–2038 boş. */
function sec() {
  const bos = u => `not exists (select 1 from media_placements p where p.unit_id=${u} and p.commitment<>'cancelled'
                    and p.start_date<='2038-12-31' and coalesce(p.end_date,'9999-12-31')>='2037-01-01')`;
  const [A, B, site, alan] = sql(`select a.id||','||b.id||','||m.id||','||al.id from units a join units b on b.alt_mecra_id=a.alt_mecra_id
      and b.name=regexp_replace(a.name,'-A$','-B') join alt_mecralar al on al.id=a.alt_mecra_id join mecralar m on m.id=al.mecra_id
     where a.name ~ '-A$' and m.operational and al.occupancy_mode='exclusive' and not al.legacy_archived and a.active and b.active
       and ${bos('a.id')} and ${bos('b.id')} order by a.id limit 1`).split(',').map(Number);
  const C = +sql(`select min(u.id) from units u where u.alt_mecra_id=${alan} and u.active and u.id not in (${A},${B}) and ${bos('u.id')}`);
  const led = +sql(`select coalesce(min(id),0) from alt_mecralar where mecra_id=${site} and occupancy_mode='concurrent'`);
  return { A, B, C, site, alan, led };
}
const yaz = (h, c, bas, bit, ek = {}) => +sql(`insert into media_placements (${h.u ? 'unit_id' : 'alt_mecra_id'}, customer_id, commitment, start_date, end_date,
    option_expires_at, note, created_by_team_id)
  values (${h.u || h.a}, ${ek.kurum || kurumId()}, '${c}', '${bas}', ${bit ? `'${bit}'` : 'null'}, ${ek.ops ? `'${ek.ops}'` : 'null'},
    ${ek.not ? `'${ek.not}'` : 'null'}, ${teamId('uye')}) returning id`);
function fikstur() {
  const F = sec();
  F.p1 = yaz({ u: F.A }, 'confirmed', '2037-03-01', '2037-03-10');
  F.p2 = yaz({ u: F.A }, 'confirmed', '2037-03-11', '2037-03-20');              // kesintisiz yenileme — ayrı kayıt
  F.p3 = yaz({ u: F.C }, 'reserved', '2037-03-05', '2037-03-15', { ops: '2026-01-15' });   // süresi dolmuş opsiyon
  F.p4 = yaz({ u: F.A }, 'confirmed', '2037-12-20', '2038-01-10');              // yıl geçişi
  F.p5 = yaz({ u: F.B }, 'reserved', '2037-05-10', null);                        // bitişi bilinmiyor
  F.diger = +sql(`select min(id) from customers where firma<>'S13 Regresyon Kurumu' and firma not like 'S13T %'`);
  F.p6 = yaz({ u: F.C }, 'confirmed', '2037-04-01', '2037-04-30', { kurum: F.diger, not: 'S13T diğer kurum' });
  if (F.led) { F.l1 = yaz({ a: F.led }, 'confirmed', '2037-09-01', '2037-09-30'); F.l2 = yaz({ a: F.led }, 'confirmed', '2037-09-10', '2037-10-05'); }
  return F;
}
async function tabloAc(page, F, ek = {}) {
  await page.evaluate(([F, ek]) => medyaGit({ site: F.site, alan: '', kurum: '', is: '', q: '', urun: '', durum: '', msBas: '', msBit: '',
    olcek: 12, ank: '2037-01', gecmisGizle: false, acik: { ['g' + F.alan]: true, ...(F.led ? { ['g' + F.led]: true } : {}) }, ...ek }), [F, ek]);
  await page.waitForFunction(u => document.querySelector(`#mdGovde tr[data-u="${u}"]`), F.A);
}
/* Yüzün verilen aydaki hücresi (sütun sırası başlıktaki data-ym'den). */
async function hucreSec(page, u, ym) {
  const i = await page.evaluate(([u, ym]) => { const tr = document.querySelector(`#mdGovde tr[data-u="${u}"]`);
    const ths = [...tr.closest('table').querySelectorAll('thead th.mtb-ay')]; return ths.findIndex(t => t.dataset.ym === ym); }, [u, ym]);
  expect(i).toBeGreaterThanOrEqual(0);
  return page.locator(`#mdGovde tr[data-u="${u}"] td.mtb-c`).nth(i);
}

test.describe('Mecralar aylık yönetim tablosu', () => {
  test('karma ay: iki kayıt ayrı blok + müsait dilim; ekran ile rapor aynı tarihleri verir', async ({ page }) => {
    const F = fikstur();
    await girisYap(page, 'uye');
    await tabloAc(page, F);
    const mart = await hucreSec(page, F.A, '2037-03');
    await expect(mart).toHaveClass(/karma/);
    await expect(mart.locator(`.mtb-b[data-p="${F.p1}"]`)).toContainText('01.03–10.03.2037');
    await expect(mart.locator(`.mtb-b[data-p="${F.p2}"]`)).toContainText('11.03–20.03.2037');   // yenileme ayrı blok
    const bos = mart.locator('.mtb-b.t-musait');
    await expect(bos).toHaveCount(1);
    await expect(bos).toHaveAttribute('data-s', '2037-03-21');
    await expect(bos).toHaveAttribute('data-e', '2037-03-31');
    await expect(await hucreSec(page, F.B, '2037-03')).toHaveClass(/tek/);    // aynı panonun B yüzü bağımsız, tüm ay müsait
    /* Ekran = rapor: aynı yüz/ayın dilimleri Raporlar › Mecra doluluk tablosu modeliyle aynı. */
    const ekran = await mart.locator('.mtb-b').evaluateAll(l => l.map(b => b.className.match(/t-(yayin|opsiyon|musait)/)[1]));
    const rapor = await page.evaluate(async F => { const v = { M: ui._M };
      const a = { ...RPD_MECRA.varsayilan(), siteler: [F.site], bas: '2037-01-01', bit: '2037-12-31', _alici: 'ic' };
      const m = RPD_MECRA.model(a, v); const y = m.sayfalar.flatMap(s => s.panolar.flatMap(p => p.yuzler)).find(x => x.key === 'u' + F.A);
      return y.hucre[2].parca.map(p => [p.tip, p.s, p.e]); }, F);
    expect(rapor).toEqual([['yayin', '2037-03-01', '2037-03-10'], ['yayin', '2037-03-11', '2037-03-20'], ['musait', '2037-03-21', '2037-03-31']]);
    expect(ekran).toEqual(rapor.map(x => x[0]));
  });

  test('müsait dilime tıklama doğru yüzey ve tarihlerle formu açar; tıklama kayıt yazmaz', async ({ page }) => {
    const F = fikstur();
    await girisYap(page, 'uye');
    await tabloAc(page, F);
    const once = +sql(`select count(*) from media_placements where unit_id=${F.A}`);
    await (await hucreSec(page, F.A, '2037-03')).locator('.mtb-b.t-musait').click();
    await expect(page.locator('#modalBg.open #mfBas')).toHaveValue('2037-03-21');
    await expect(page.locator('#mfBit')).toHaveValue('2037-03-31');
    await expect(page.locator('#modalBg.open .md-hdf')).toContainText(await page.evaluate(u => ui._M.unitById[u].name, F.A));
    await page.evaluate(() => modalVazgec());
    await (await hucreSec(page, F.A, '2037-04')).locator('.mtb-b').click();       // tamamen boş ay: ayın sınırları
    await expect(page.locator('#modalBg.open #mfBas')).toHaveValue('2037-04-01');
    await expect(page.locator('#mfBit')).toHaveValue('2037-04-30');
    await page.evaluate(() => modalVazgec());
    expect(+sql(`select count(*) from media_placements where unit_id=${F.A}`)).toBe(once);
    await (await hucreSec(page, F.A, '2037-03')).locator(`.mtb-b[data-p="${F.p1}"]`).click();   // kayıt bloğu = kaydın ayrıntısı
    await expect(page.locator('#modalBg.open')).toContainText('01.03.2037 – 10.03.2037');
  });

  test('süresi dolmuş opsiyon uyarı taşır; yıl geçişi; bitişi bilinmeyen kayıt; kurum süzgeci sahte müsaitlik üretmez', async ({ page }) => {
    const F = fikstur();
    await girisYap(page, 'uye');
    await tabloAc(page, F);
    const cMart = await hucreSec(page, F.C, '2037-03');
    await expect(cMart.locator(`.mtb-b[data-p="${F.p3}"]`)).toHaveClass(/sur/);
    await expect(cMart).toContainText('Opsiyon süresi doldu');
    await expect(await hucreSec(page, F.A, '2037-12')).toContainText('20.12.2037–10.01.2038');
    await expect(await hucreSec(page, F.B, '2037-05')).toContainText('bitiş bilinmiyor');
    await expect((await hucreSec(page, F.B, '2037-11')).locator('.t-musait')).toHaveCount(0);   // bitişsiz kayıt ileriye bloklar
    /* Kurum süzgeci: C'nin Nisan'ı başka kurumun yayınıdır — soluk görünür, müsait GÖRÜNMEZ. */
    await tabloAc(page, F, { kurum: String(kurumId()), site: null });
    const cNisan = await hucreSec(page, F.C, '2037-04');
    await expect(cNisan.locator(`.mtb-b[data-p="${F.p6}"]`)).toHaveClass(/soluk/);
    await expect(cNisan.locator('.t-musait')).toHaveCount(0);
    await tabloAc(page, F, { olcek: 6, ank: '2037-10' });
    await expect(await hucreSec(page, F.A, '2038-01')).toContainText('20.12.2037–10.01.2038');   // yıl geçişi iki tarafta
  });

  test('LED: satır = kampanya, aynı ayda iki kampanya; boş ay müsait boyanmaz; takvimde göster doğru kaydı vurgular', async ({ page }) => {
    const F = fikstur();
    test.skip(!F.led, 'Test yığınında bu lokasyonda LED alanı yok');
    await girisYap(page, 'uye');
    await tabloAc(page, F);
    const led = page.locator(`#mdGovde section.md-led[data-a="${F.led}"]`);
    await expect(led.locator(`tr[data-p="${F.l1}"]`)).toHaveCount(1);
    await expect(led.locator(`tr[data-p="${F.l2}"]`)).toHaveCount(1);
    const eylul = await led.evaluate((s, l) => { const i = [...s.querySelectorAll('thead th.mtb-ay')].findIndex(t => t.dataset.ym === '2037-09');
      return l.map(p => s.querySelector(`tr[data-p="${p}"]`).querySelectorAll('td.mtb-c')[i].innerText.replace(/\s+/g, ' ').trim()); }, [F.l1, F.l2]);
    expect(eylul[0]).toContain('tüm ay');
    expect(eylul[1]).toContain('10.09–30.09');
    await expect(led.locator('.t-musait')).toHaveCount(0);                    // kampanyasız ay "boş slot" değildir
    await page.evaluate(p => medyaOdak(p, { ayrinti: false }), F.p2);
    await expect(page.locator(`#mdGovde .mtb-b.md-odak[data-p="${F.p2}"]`)).toHaveCount(1);
    await expect(page.locator('#mdOdak')).toContainText('11 Mar 2037');
  });
});

test.describe('Raporlar — dört işlev', () => {
  test('giriş dört seçenek; eski bağlantılar yeni karşılığına açılır', async ({ page }) => {
    const job = await isOlustur('uye', 'Eski bağlantı');
    await girisYap(page, 'uye');
    await page.evaluate(() => go('raporlar'));
    await expect(page.locator('.rp2-kart b')).toHaveText(['Mecra doluluk tablosu', 'Baskı / montaj takip tablosu', 'İş dökümü', 'Kişisel çalışma planım']);
    await expect(page.locator('.rp2-eski')).toHaveCount(0);
    await page.evaluate(j => rpAc('baski', { sablon: 'dokum', is: j, _alici: 'dis' }), job);   // eski "işe özel döküm"
    await page.waitForFunction(j => ui._rpTur === 'is' && rpAyar('is').is === j && ui._rpModel && !rpDurum().yukleniyor, job);
    expect(await page.evaluate(() => location.hash)).toBe('#/rapor/is');
    await page.goto(`${APP}/admin#/rapor/is`);                                  // eski URL (iş özeti) → İş dökümü
    await page.waitForFunction(() => ui._rpTur === 'is' && document.querySelector('#rpIs'));
    await expect(page.locator('.sec-head h3')).toHaveText('İş dökümü');
  });

  test('İş dökümü: yalnız iş seçimi; boş bölüm PDF\'e girmez; bölümünde görünen olay geçmişte tekrar edilmez; teknik kopya tek satır', async ({ page }) => {
    const job = await isOlustur('uye', 'Döküm bölüm');
    const r = await rpc('uye', 'operations_batch_create', { p_job: job, p_rows: [{ operation_type: 'baski', description: 'S13T tek baskı', planned_date: '2031-07-01', cost: 500 }] });
    expect(r.durum).toBe(200);
    const g = "(now() - interval '1 day')";
    sql(`insert into entries (job_id, body, source, system_kind, occurred_at) values
      (${job}, 'Aşama değişti: Temas → Teklif', 'system', 'work_phase', ${g}),
      (${job}, 'Aşama değişti: Temas → Teklif', 'system', 'work_phase', ${g} + interval '2 minutes'),
      (${job}, 'S13T belge alanı değişti', 'system', 'document_changed', ${g})`);
    await girisYap(page, 'uye');
    await page.evaluate(j => rpAc('is', { is: j }), job);
    await page.waitForFunction(() => ui._rpTur === 'is' && ui._rpModel && ui._rpModel.ozet && !rpDurum().yukleniyor);
    await expect(page.locator('#rpIs option[value]:not([value="0"])').first()).toHaveAttribute('data-ek', /.+/);   // kurum yardımcı bilgi
    expect(await page.locator('#rpKapsam input[type=date]').count()).toBe(0);    // tarih süzgeci yok
    let m = await page.evaluate(() => JSON.parse(JSON.stringify(ui._rpModel)));
    expect(m.bolumSay).toMatchObject({ yayin: 0, baski: 1, belge: 0 });
    expect(m.yayin).toBeNull(); expect(m.belge).toBeNull();
    expect(m.baski.toplamlar.TRY.tutar).toBe(500);
    const olaylar = m.gecmis.filter(x => x.tur === 'Olay').map(x => x.metin);
    expect(olaylar.filter(x => x.startsWith('Aşama değişti')).length).toBe(1);   // aynı olayın iki teknik kaydı tek satır
    expect(olaylar.join('|')).not.toContain('belge alanı değişti');            // rutin alan değişikliği yok
    expect(olaylar.some(x => /baskı\/montaj|Baskı kaydı/i.test(x))).toBe(false); // baskı bölümünde zaten var
    const pdf = await page.evaluate(() => JSON.stringify(RPD_IS.pdf(ui._rpModel, rpAyar('is')).icerik));
    expect(pdf).not.toContain('"Yayınlar"'); expect(pdf).not.toContain('"Belgeler"');
    expect(pdf).toContain('S13T tek baskı');
    await page.evaluate(() => rpIsBolum('baski', false));                     // bölüm çıkarılınca olayı geçmişe döner
    m = await page.evaluate(() => JSON.parse(JSON.stringify(ui._rpModel)));
    expect(m.baski).toBeNull();
    expect(m.gecmis.some(x => x.tur === 'Olay' && /kayd/i.test(x.metin) && /baskı|Baskı/.test(x.metin))).toBe(true);
  });

  test('Kişisel çalışma planım: takip edilen iş ya da düz not görev değildir; aynı aksiyon bir kez; tamamlanan/arşiv görünmez', async ({ page }) => {
    const bugun = new Date(); const g = n => { const d = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() + n, 12);
      return d.toISOString(); };
    const uye = teamId('uye'), uye2 = teamId('uye2');
    const job = await isOlustur('uye2', 'Plan iş');
    const arsiv = await isOlustur('uye2', 'Plan arşiv');
    sql(`update jobs set lifecycle_status='kapandi', closed_reason='tamamlandi' where id=${arsiv};
      insert into work_followers (job_id, team_id) values (${job}, ${uye}) on conflict do nothing`);
    const e = (govde, ek) => +sql(`insert into entries (job_id, body, created_by_team_id, assignee_id, due_at, action_status)
      values (${ek.job || job}, '${ONEK}${govde}', ${uye2}, ${ek.atanan || 'null'}, ${ek.tarih ? `'${ek.tarih}'` : 'null'}, ${ek.durum ? `'${ek.durum}'` : 'null'}) returning id`);
    e('takip edilen işte başkasının aksiyonu', { atanan: uye2, tarih: g(1), durum: 'open' });
    const iki = e('bana atanmış ve etiketli', { atanan: uye, tarih: g(1), durum: 'open' });
    sql(`insert into entry_relevance (entry_id, team_id) values (${iki}, ${uye})`);
    e('tamamlanmış aksiyon', { atanan: uye, tarih: g(1), durum: 'done' });
    e('arşivdeki işin aksiyonu', { atanan: uye, tarih: g(1), durum: 'open', job: arsiv });
    const bilgi = e('etiketlendiğim düz güncelleme', {});
    sql(`insert into entry_relevance (entry_id, team_id) values (${bilgi}, ${uye})`);
    await girisYap(page, 'uye');
    const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const bit = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() + 3);
    await page.evaluate(([b, e]) => rpAc('plan', { donem: 'ozel', bas: b, bit: e }), [ymd(bugun), ymd(bit)]);
    await page.waitForFunction(() => ui._rpTur === 'plan' && ui._rpModel && !rpDurum().yukleniyor);
    const m = await page.evaluate(() => JSON.parse(JSON.stringify(ui._rpModel)));
    const gorev = [...m.geciken, ...m.gunler.flatMap(x => x.maddeler), ...m.tarihsiz].map(x => x.baslik).filter(x => x.startsWith(ONEK));
    expect(gorev).toEqual([ONEK + 'bana atanmış ve etiketli']);
    expect(m.bilgiSatir.map(x => x.baslik)).toContain(ONEK + 'etiketlendiğim düz güncelleme');
    await expect(page.locator('#rpKapsam .rp4-acik')).toContainText('görev sayılmaz');
  });
});
