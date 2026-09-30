// Sprint 17 — Mecralar: tek dönem araması, dönemsel durumlar, doğrudan Excel, harita.
// Beklenen tarihler elle, takvim gerçeğinden yazılır (uygulamanın hesabından
// ÜRETİLMEZ). Dönem 2037: hiçbir tohum kaydı bu yıla uzanmaz; seçilen yüzlerin
// o yıl boş olduğu ayrıca sorgulanır. Harita koordinatları yalnız test yığınında,
// test sırasında konur ve test sonunda geri alınır.
import { test, expect } from '@playwright/test';
import { girisYap, sql, kurumId, teamId, temizle, dlg } from '../lib/ortam.mjs';

const NOT = 'S13T s17';
test.beforeEach(() => { temizle(); sql(`delete from media_placements where note like '${NOT}%'`); });
test.afterAll(() => sql(`delete from media_placements where note like '${NOT}%'`));

/* Aynı panonun A/B yüzü + aynı gruptan bir yüz + aynı lokasyonda LED alanı; 2037 boş. */
function sec() {
  const bos = u => `not exists (select 1 from media_placements p where p.unit_id=${u} and p.commitment<>'cancelled'
                    and p.start_date<='2038-12-31' and coalesce(p.end_date,'9999-12-31')>='2037-01-01')`;
  const [A, B, site, alan] = sql(`select a.id||','||b.id||','||m.id||','||al.id from units a join units b on b.alt_mecra_id=a.alt_mecra_id
      and b.name=regexp_replace(a.name,'-A$','-B') join alt_mecralar al on al.id=a.alt_mecra_id join mecralar m on m.id=al.mecra_id
     where a.name ~ '-A$' and m.operational and al.occupancy_mode='exclusive' and not al.legacy_archived and a.active and b.active
       and ${bos('a.id')} and ${bos('b.id')} and exists (select 1 from alt_mecralar l where l.mecra_id=m.id and l.occupancy_mode='concurrent' and not l.legacy_archived)
     order by a.id limit 1`).split(',').map(Number);
  const C = +sql(`select min(u.id) from units u where u.alt_mecra_id=${alan} and u.active and u.id not in (${A},${B}) and ${bos('u.id')}`);
  const led = +sql(`select min(id) from alt_mecralar where mecra_id=${site} and occupancy_mode='concurrent' and not legacy_archived`);
  return { A, B, C, site, alan, led };
}
const yaz = (h, c, bas, bit, ek = {}) => +sql(`insert into media_placements (${h.u ? 'unit_id' : 'alt_mecra_id'}, customer_id, commitment, start_date, end_date,
    option_expires_at, note, created_by_team_id)
  values (${h.u || h.a}, ${kurumId()}, '${c}', '${bas}', ${bit ? `'${bit}'` : 'null'}, ${ek.ops ? `'${ek.ops}'` : 'null'}, '${NOT}', ${teamId('uye')}) returning id`);
function fikstur() {
  const F = sec();
  F.a1 = yaz({ u: F.A }, 'confirmed', '2037-03-01', '2037-03-10');
  F.a2 = yaz({ u: F.A }, 'confirmed', '2037-03-11', '2037-03-20');     // kesintisiz yenileme: 11.03 boşalma DEĞİL
  F.c1 = yaz({ u: F.C }, 'reserved', '2037-03-05', '2037-03-15', { ops: '2026-01-15' });   // süresi dolmuş opsiyon bloklar
  F.b1 = yaz({ u: F.B }, 'reserved', '2037-05-10', null);               // bitişi bilinmiyor
  F.l1 = yaz({ a: F.led }, 'confirmed', '2037-03-01', '2037-03-31');
  return F;
}
/* Programatik arama (uygulanan durum) — grup açık. */
async function ara(page, F, ek = {}) {
  await page.evaluate(([F, ek]) => medyaGit({ site: F.site, alan: '', kurum: '', is: '', q: '', urun: '', durum: '',
    bas: '2037-03-01', bit: '2037-03-31', gecmisGizle: false,
    acik: { ['g' + F.alan]: true, ['g' + F.led]: true }, ...ek }), [F, ek]);
  await page.waitForFunction(() => ui._mdSonuc && document.querySelector('#mdGovde .md-sonuc') && !ui._mdYukleniyor);
}
const sonuc = page => page.evaluate(() => ({ set: [...ui._mdSonuc.set], bosalma: ui._mdSonuc.bosalma, led: ui._mdSonuc.ledSay,
  satir: [...document.querySelectorAll('#mdGovde tr[data-u]')].map(t => +t.dataset.u), ozet: document.querySelector('.md-sonuc').innerText }));

test.describe('Tek dönem: varsayılan, hazır dönemler, taslak', () => {
  test('normal ilk giriş: bugün ±3 takvim ayı (Europe/Istanbul), 6 ay seçili, geçmiş aylar açık, arama uygulanmış', async ({ page }) => {
    await girisYap(page, 'uye');
    await page.evaluate(() => { sessionStorage.removeItem('mp_medya'); go('ws-mecralar'); });
    await page.waitForSelector('#mdGovde .md-sonuc');
    /* Test tarafı: İstanbul günü + elle ay ekleme (ay sonu sınırı). */
    const g = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
    const ay = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const t = m - 1 + n, yy = y + Math.floor(t / 12), mm = ((t % 12) + 12) % 12;
      const son = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate(); return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(d, son)).padStart(2, '0')}`; };
    const st = await page.evaluate(() => mdDurum());
    expect([st.hazir, st.bas, st.bit, st.gecmisGizle, st.durum]).toEqual(['6', ay(g, -3), ay(g, 3), false, '']);
    await expect(page.locator('#mdBas')).toHaveValue(ay(g, -3));
    await expect(page.locator('#mdBit')).toHaveValue(ay(g, 3));
    await expect(page.locator('.md-hazir .ws-switch button.on')).toHaveText(/6 ay/);
    await expect(page.locator('#mdGecmis')).not.toBeChecked();
    await expect(page.locator('.md-sonuc')).toContainText('Uygulanan arama');
    /* Eski sürümün saklanmış yıl görünümü yeni varsayılanı etkisiz bırakmaz. */
    await page.evaluate(() => { sessionStorage.setItem('mp_medya', JSON.stringify({ olcek: 12, ank: '2031-01', yil: 2031, durumGun: '2031-05-05' })); go('ws-mecralar'); });
    await page.waitForSelector('#mdGovde .md-sonuc');
    expect(await page.evaluate(() => [mdDurum().bas, mdDurum().bit])).toEqual([ay(g, -3), ay(g, 3)]);
  });

  test('ay sonu, şubat ve yıl geçişi; hazır dönemler ve elle aralık', async ({ page }) => {
    await girisYap(page, 'uye');
    const r = await page.evaluate(() => {
      const o = {};
      for (const g of ['2026-09-30', '2026-08-31', '2027-05-31', '2028-05-31', '2026-11-15', '2026-12-31']) { const eski = mdBugun; mdBugun = () => g;
        o[g] = { v6: mdVarsayilanDonem(), h3: mdHazirAralik('3', g), y: mdHazirAralik('yil', g) }; mdBugun = eski; }
      o.bul = [mdHazirBul('2026-06-30', '2026-12-30'), mdHazirBul('2027-02-28', '2027-08-31'), mdHazirBul('2026-09-30', '2026-12-30'),
        mdHazirBul('2026-01-01', '2026-12-31'), mdHazirBul('2026-10-01', '2026-10-31')];
      return o; });
    expect(r['2026-09-30'].v6).toMatchObject({ bas: '2026-06-30', bit: '2026-12-30' });   // brief örneği
    expect(r['2026-08-31'].v6).toMatchObject({ bas: '2026-05-31', bit: '2026-11-30' });   // 31 → 30 Kasım, Aralık'a taşmaz
    expect(r['2027-05-31'].v6).toMatchObject({ bas: '2027-02-28', bit: '2027-08-31' });   // şubat
    expect(r['2028-05-31'].v6).toMatchObject({ bas: '2028-02-29', bit: '2028-08-31' });   // artık yıl
    expect(r['2026-11-15'].v6).toMatchObject({ bas: '2026-08-15', bit: '2027-02-15' });   // yıl geçişi
    expect(r['2026-12-31'].h3).toEqual(['2026-12-31', '2027-03-31']);
    expect(r['2026-12-31'].y).toEqual(['2026-01-01', '2026-12-31']);
    expect(r.bul.map(x => x.hazir)).toEqual(['6', '6', '3', 'yil', '']);                   // elle aralık hazır döneme denk değil
    expect(r.bul[1].merkez).toBe('2027-05-31');
  });

  test('yazarken erken arama yok; Ara/Enter uygular; hazır dönem, ileri/geri ve Bugüne git dönemle birlikte sonucu günceller', async ({ page }) => {
    const F = fikstur();
    await girisYap(page, 'uye');
    await ara(page, F);
    const form = await page.locator('#mdAraForm').elementHandle();
    await page.locator('#mdBas').click();
    await page.keyboard.type('2');                                         // yarım yıl
    expect(await page.evaluate(() => mdDurum().bas)).toBe('2037-03-01');
    expect(await form.evaluate(f => f.isConnected)).toBe(true);           // form yeniden çizilmedi
    await page.locator('#mdDurumG button[data-v="musait"]').click();
    await expect(page.locator('#mdBekleyen')).toBeVisible();              // taslak ≠ uygulanan
    expect(await page.evaluate(() => [mdDurum().durum, ui._mdSonuc.durum])).toEqual(['', '']);
    await page.evaluate(() => { const b = document.getElementById('mdBas'); b.value = '2037-03-05'; b.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.locator('#mdBit').press('Enter');
    await page.waitForFunction(() => mdDurum().durum === 'musait');
    let st = await page.evaluate(() => mdDurum());
    expect([st.bas, st.bit, st.hazir]).toEqual(['2037-03-05', '2037-03-31', '']);
    await expect(page.locator('.md-hazir .ws-switch button.on')).toHaveCount(0);   // yanlış hazır dönem seçili görünmez
    await expect(page.locator('#mdBekleyen')).toBeHidden();
    /* Özel aralıkta ileri: kendi uzunluğu (27 gün) kadar. */
    await page.locator('.md-nav').last().click();
    await page.waitForFunction(() => mdDurum().bas === '2037-04-01');
    expect(await page.evaluate(() => mdDurum().bit)).toBe('2037-04-27');
    /* Bugüne git (özel aralık): uzunluk korunur, başlangıç bugün; süzgeçler korunur. */
    await page.getByRole('button', { name: 'Bugüne git' }).click();
    await page.waitForFunction(() => mdDurum().bas === mdBugun());
    st = await page.evaluate(() => mdDurum());
    expect(await page.evaluate(s => mdDn(s.bit) - mdDn(s.bas), st)).toBe(26);
    expect([st.durum, st.site]).toEqual(['musait', F.site]);
    /* 3 ay: merkezden (bugün) başlayıp 3 ay; ileri 3 ay adım. */
    await page.locator('.md-hazir .ws-switch button', { hasText: '3 ay' }).click();
    await page.waitForFunction(() => mdDurum().hazir === '3');
    st = await page.evaluate(() => mdDurum());
    expect(st.bas).toBe(await page.evaluate(() => mdBugun()));
    await expect(page.locator('#mdBas')).toHaveValue(st.bas);
    await page.locator('.md-nav').last().click();
    await page.waitForFunction(b => mdDurum().bas !== b, st.bas);
    expect(await page.evaluate(s => mdDurum().bas === mdAyKaydir(s.bas, 3), st)).toBe(true);
    /* Aramayı sıfırla → normal ilk açılış kapsamı. */
    await page.getByRole('button', { name: 'Aramayı sıfırla' }).click();
    await page.waitForFunction(() => mdDurum().durum === '' && mdDurum().site == null && mdDurum().hazir === '6');
  });

  test('geçmiş ayları gizle: etkin dönem ekranda; tamamen geçmiş aralıkta boş durum ve “Geçmiş ayları göster”', async ({ page }) => {
    await girisYap(page, 'uye');
    await page.evaluate(() => medyaGit({ site: null, bas: '2025-01-01', bit: '2025-03-31', gecmisGizle: true, durum: '' }));
    await page.waitForSelector('#mdGovde .md-bos');
    await expect(page.locator('#mdXlsGenel')).toBeDisabled();
    await page.getByRole('button', { name: 'Geçmiş ayları göster' }).click();
    await page.waitForFunction(() => !mdDurum().gecmisGizle && document.querySelector('#mdGovde .md-yil-site'));
    const g = await page.evaluate(() => mdBugun());
    const bas = await page.evaluate(g => mdAyKaydir(g, -2), g);
    await page.evaluate(b => medyaGit({ bas: b, bit: mdAyKaydir(mdBugun(), 2), gecmisGizle: true }), bas);
    await page.waitForSelector('#mdGovde .md-sonuc');
    const E = await page.evaluate(() => mdEtkin(mdDurum()));
    expect(E.bas).toBe(g.slice(0, 7) + '-01');                            // bugünün ayının geçmiş günleri silinmez
    await expect(page.locator('.md-sonuc')).toContainText('etkin dönem');
    await page.locator('#mdGecmis').uncheck();
    await page.waitForFunction(b => mdEtkin(mdDurum()).bas === b, bas);   // esas aralık geri gelir
  });
});

test.describe('Dönemsel durumlar: sayaç = tablo = Excel', () => {
  test('Opsiyonlu / Yayın / Müsait / Dönem içinde boşalacak; kesintisiz yenileme ve bitişsiz kayıt; LED sahte müsaitlik yok', async ({ page }) => {
    const F = fikstur();
    await girisYap(page, 'uye');
    const has = (s, u) => s.set.includes(u);
    await ara(page, F, { durum: 'opsiyon' });
    let s = await sonuc(page);
    expect([has(s, F.A), has(s, F.B), has(s, F.C)]).toEqual([false, false, true]);   // süresi dolmuş opsiyon hâlâ opsiyon
    await ara(page, F, { durum: 'yayin' });
    s = await sonuc(page);
    expect([has(s, F.A), has(s, F.B), has(s, F.C)]).toEqual([true, false, false]);
    expect(s.led).toBeGreaterThanOrEqual(1);                               // LED kampanyası dönemle kesişiyor
    await expect(page.locator(`#mdGovde tr[data-p="${F.l1}"]`)).toHaveCount(1);
    await ara(page, F, { durum: 'musait' });
    s = await sonuc(page);
    expect([has(s, F.A), has(s, F.B), has(s, F.C)]).toEqual([false, true, false]);
    expect(s.led).toBe(0);
    await expect(page.locator('#mdGovde section.md-led')).toHaveCount(0);   // LED'e boş slot hesabı yok
    expect(s.satir.sort()).toEqual([...s.set].sort());                      // tablo = sonuç (A/B zorla eklenmez)
    expect(s.satir).not.toContain(F.A);                                     // B'nin eşi A eklenmedi
    await ara(page, F, { durum: 'bosalacak' });
    s = await sonuc(page);
    expect(s.bosalma[F.A]).toBe('2037-03-21');                             // 11.03 değil: yenileme boşalma sayılmaz
    expect(s.bosalma[F.C]).toBe('2037-03-16');
    expect(has(s, F.B)).toBe(false);
    await expect(page.locator(`#mdGovde tr[data-u="${F.A}"] .mtb-b.bosalma`)).toHaveAttribute('data-s', '2037-03-21');
    await ara(page, F, { durum: 'bosalacak', bas: '2037-05-01', bit: '2037-12-31' });
    s = await sonuc(page);
    expect(has(s, F.B)).toBe(false);                                        // bilinmeyen bitişten tarih uydurulmaz
    await ara(page, F, { durum: 'musait', bas: '2037-05-01', bit: '2037-05-31' });
    expect(has(await sonuc(page), F.B)).toBe(false);
  });

  test('kurum süzgeci sahte boşluk üretmez; seçili yüzün gerçek tablosu tüm kayıtlarla çizilir', async ({ page }) => {
    const F = fikstur();
    const diger = +sql(`select min(id) from customers where firma<>'S13 Regresyon Kurumu' and firma not like 'S13T %'`);
    const d = +sql(`insert into media_placements (unit_id, customer_id, commitment, start_date, end_date, note, created_by_team_id)
      values (${F.C}, ${diger}, 'confirmed', '2037-03-20', '2037-03-31', '${NOT} diğer', ${teamId('uye')}) returning id`);
    await girisYap(page, 'uye');
    await ara(page, F, { kurum: String(kurumId()) });
    const tr = page.locator(`#mdGovde tr[data-u="${F.C}"]`);
    await expect(tr.locator(`.mtb-b[data-p="${d}"]`)).toHaveClass(/soluk/);   // başka kurumun kaydı görünür ve bloklar
    /* Mart: 1–4 müsait, 5–15 opsiyon, 16–19 müsait, 20–31 başka kurum. 20–31 müsait GÖRÜNMEZ. */
    const bos = await tr.locator('.t-musait').evaluateAll(l => l.map(b => [b.dataset.s, b.dataset.e]));
    expect(bos).toEqual([['2037-03-01', '2037-03-04'], ['2037-03-16', '2037-03-19']]);
  });

  test('doğrudan Excel: ürün grubu, mecranın tamamı (kapalı gruplar dahil) ve genel; uygulanan sonuç, taslak ve seçim karışmaz', async ({ page }) => {
    const F = fikstur();
    await girisYap(page, 'uye');
    await ara(page, F, { durum: 'musait', acik: { ['g' + F.alan]: false, ['g' + F.led]: false } });   // grup kullanıcı kararıyla KAPALI
    await expect(page.locator(`#mdGovde section.md-alan.md-kapali[data-a="${F.alan}"]`)).toHaveCount(1);
    /* Taslak değişiklik (uygulanmamış) ve toplu seçim kutusu indirmeyi etkilemez. */
    await page.locator('#mdDurumG button[data-v=""]').click();
    await expect(page.locator('#mdBekleyen')).toBeVisible();
    await page.evaluate(() => ui._mSec.add(-1));
    const oku = async () => page.evaluate(async () => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await ui._mdSonXls.blob.arrayBuffer());
      /* Yüz kodu iki satırlık birleşik hücrededir: yalnız ana (master) hücre sayılır. */
      return wb.worksheets.map(ws => { const yz = []; for (let r = 6; r <= ws.rowCount; r++) { const c = ws.getCell(r, 2);
          if (c.isMerged && c.master.address !== c.address) continue; if (c.value) yz.push(String(c.value)); }
        return { ad: ws.name, r1: String(ws.getCell(1, 1).value), r2: String(ws.getCell(2, 1).value), h5: ws.getRow(5).values.slice(1).map(String), yz }; }); });
    const [d1] = await Promise.all([page.waitForEvent('download'), page.evaluate(a => mdExcel({ alan: a }), F.alan)]);
    expect(d1.suggestedFilename()).toMatch(/^Medyapark_Doluluk_.+_Musait_2037-03-01_2037-03-31\.xlsx$/);
    let x = await oku();
    const beklenen = await page.evaluate(a => ui._mdSonuc.siteler.flatMap(s => s.gruplar).find(g => String(g.a.id) === String(a)).yuzler.map(u => u.name), F.alan);
    expect(x.length).toBe(1);
    expect(x[0].r2).toContain('Dönem: 01.03.2037 – 31.03.2037');
    expect(x[0].r2).toContain('Durum: Müsait');                            // taslaktaki “Tümü” değil
    expect(x[0].yz).toEqual(beklenen);                                     // sayaç/tablo ile aynı yüzler
    expect(x[0].yz).toContain(await page.evaluate(b => ui._M.unitById[b].name, F.B));
    expect(x[0].yz).not.toContain(await page.evaluate(a => ui._M.unitById[a].name, F.A));
    /* Mecranın tamamı, Tümü: kapalı gruplar ve LED dahil; LED boş ay müsait yazılmaz. */
    await ara(page, F, { acik: {} });
    const [d2] = await Promise.all([page.waitForEvent('download'), page.evaluate(s => mdExcel({ site: s }), F.site)]);
    x = await oku();
    const gruplar = await page.evaluate(s => ui._mdSonuc.siteler.find(t => t.m.id === s).gruplar.length, F.site);
    expect(x.length).toBe(gruplar);
    const led = x.find(w => w.h5[0] === 'Kampanya');
    expect(led).toBeTruthy();
    const ledHucre = await page.evaluate(async p => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await ui._mdSonXls.blob.arrayBuffer());
      const ws = wb.worksheets.find(w => w.getCell(5, 1).value === 'Kampanya'); const out = [];
      for (let r = 6; r <= ws.rowCount; r++) out.push(ws.getRow(r).values.slice(1).map(v => v == null ? '' : String(v))); return out; });
    expect(ledHucre.flat().join('|')).not.toMatch(/Müsait/);
    expect(ledHucre.some(r => r[3] === 'Tüm ay')).toBe(true);              // Mart 2037 kampanyası
    expect(d2.suggestedFilename()).toContain('2037-03-01_2037-03-31');
  });

  test('indirme anında kayıt değiştiyse eski sonuçla dosya üretilmez; tablo yenilenir', async ({ page }) => {
    const F = fikstur();
    await girisYap(page, 'uye');
    await ara(page, F);
    yaz({ u: F.B }, 'confirmed', '2037-03-02', '2037-03-04');              // başka oturumdan değişiklik
    let indi = false; page.on('download', () => { indi = true; });
    await page.evaluate(a => mdExcel({ alan: a }), F.alan);
    await expect(dlg(page)).toContainText('kayıtlar değişti');
    expect(indi).toBe(false);
    await page.locator('#mpDlgBg button').first().click();
    await expect(page.locator(`#mdGovde tr[data-u="${F.B}"] .t-yayin`)).toHaveCount(1);   // tablo güncel veriyle
  });
});

test.describe('Harita', () => {
  const K = [[36.995, 35.30], [37.005, 35.34]];
  /* Test koordinatları yalnız test yığınında; önceki değerler birebir geri yüklenir. */
  const konumAl = ids => sql(`select coalesce(string_agg(id||':'||coalesce(lat::text,'null')||':'||coalesce(lng::text,'null'),',' order by id),'') from units where id in (${ids})`);
  const konumYaz = s => s.split(',').filter(Boolean).forEach(x => { const [i, a, o] = x.split(':'); sql(`update units set lat=${a}, lng=${o} where id=${i}`); });

  test('liste ↔ pin, konumsuz mesajı, sığdır, liste gizle; Dolulukta göster dönemi korur; team konum yazamaz', async ({ page }) => {
    const F = fikstur();
    const once = konumAl(`${F.A},${F.B},${F.C}`);
    sql(`update units set lat=${K[0][0]}, lng=${K[0][1]} where id in (${F.A},${F.B}); update units set lat=${K[1][0]}, lng=${K[1][1]} where id=${F.C}`);
    try {
      await girisYap(page, 'uye');
      await page.evaluate(() => medyaGit({ site: null, urun: '', bas: '2037-03-01', bit: '2037-03-31', durum: '' }));
      await page.waitForSelector('#mdGovde .md-sonuc');
      await page.evaluate(() => wsMecTab('harita'));
      await page.waitForFunction(() => document.querySelector('#hList .hg-tools') && Object.keys(hPinler).length >= 2);
      const pano = await page.evaluate(a => hRows.find(r => r.faces.some(u => u.id === a)).id, F.A);
      const cid = await page.evaluate(c => hRows.find(r => r.faces.some(u => u.id === c)).id, F.C);
      /* Listeden seçim → seçili işaret + bilgi kartı (dönem + ayrı Bugün). */
      await page.locator(`#hr${pano}`).click();
      await expect(page.locator('#hSelBar')).toContainText('Dönem: 01.03.2037 – 31.03.2037');
      await expect(page.locator('#hSelBar')).toContainText('Bugün');
      await expect(page.locator('#hSelBar .hk-yuz')).toHaveCount(2);        // A ve B ayrı; tek hükme indirgenmez
      await expect(page.locator('#hSelBar')).toContainText('Yayında');
      expect(await page.evaluate(() => !!hMarker)).toBe(true);
      /* Pinden seçim → liste satırı seçili ve odakta. */
      await page.evaluate(c => hPinler[c].fire('click'), cid);
      await expect(page.locator(`#hr${cid}`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator(`#hr${cid}`)).toBeFocused();
      /* Konumsuz pano: seçili pin kalmaz, açık mesaj. */
      const yok = await page.evaluate(() => hRows.find(r => r.lat == null).id);
      await page.evaluate(y => hPick(y), yok);
      await expect(page.locator('#hMapSecNot')).toBeVisible();
      await expect(page.locator('#hMapSecNot')).toContainText('konum kayıtlı değil');
      expect(await page.evaluate(() => !!hMarker)).toBe(false);
      /* Yalnız konumu olanlar + arama; sığdır konumlu sonuçlara. */
      await page.locator('#hKonumlu').check();
      await expect(page.locator('#hKonumsuz')).toHaveCount(0);
      const zoomOnce = await page.evaluate(() => hMap.getZoom());
      await page.locator('#hSigdirB').click();
      await expect.poll(() => page.evaluate(() => { const b = hMap.getBounds(); return hVisible().filter(r => r.lat != null).every(r => b.contains([r.lat, r.lng])); })).toBe(true);
      expect(typeof zoomOnce).toBe('number');
      /* Liste gizle → harita genişler, düğme erişilebilir. */
      const w1 = await page.locator('#hMapCanvas').evaluate(e => e.offsetWidth);
      await page.locator('#hListeTog').click();
      await expect(page.locator('#hSide')).toBeHidden();
      expect(await page.locator('#hMapCanvas').evaluate(e => e.offsetWidth)).toBeGreaterThan(w1 + 150);
      await expect(page.locator('#hListeTog')).toHaveAttribute('aria-expanded', 'false');
      await page.locator('#hListeTog').click();
      /* Team: düzenleme yok; haritaya tık taslak üretmez; doğrudan API de yazamaz. */
      await page.evaluate(p => hPick(p), pano);
      await expect(page.locator('#hSelA')).toHaveCount(0);
      const kutu = await page.locator('#hMapCanvas').boundingBox();
      await page.mouse.click(kutu.x + 40, kutu.y + kutu.height - 40);
      expect(await page.evaluate(() => [hTaslak, ui._dirty])).toEqual([null, false]);
      await expect(page.evaluate(i => api('units_konum', { ids: [i], lat: 1, lng: 1 }), F.A)).rejects.toThrow();
      expect(sql(`select lat::text from units where id=${F.A}`)).toBe(String(K[0][0]));
      /* Dolulukta göster: doğru mecra/grup, dönem korunur, A/B satırları vurgulu. */
      await page.locator('#hSelBar').getByRole('button', { name: 'Dolulukta göster' }).click();
      await page.waitForSelector('#mdGovde tr.md-odak');
      const st = await page.evaluate(() => mdDurum());
      expect([st.bas, st.bit, st.site]).toEqual(['2037-03-01', '2037-03-31', F.site]);
      expect(await page.evaluate(() => wsMecSub())).toBe('doluluk');        // sekme ve adres haritada kalmaz
      expect(await page.evaluate(() => location.hash)).not.toContain('gorunum=harita');
      await expect(page.locator('.ws-switch button.on', { hasText: 'Doluluk' })).toHaveCount(1);
      expect(await page.evaluate(() => [...document.querySelectorAll('#mdGovde tr.md-odak')].map(t => +t.dataset.u).sort())).toEqual([F.A, F.B].sort());
    } finally {
      konumYaz(once);
      expect(konumAl(`${F.A},${F.B},${F.C}`)).toBe(once);
    }
  });

  test('yönetici: konum yalnız açık düzenlemede taslak olur; Vazgeç yazmaz, Kaydet A/B için tek istekte yazar', async ({ page }) => {
    const F = sec();
    const once = konumAl(`${F.A},${F.B}`);
    sql(`update units set lat=null, lng=null where id in (${F.A},${F.B})`);
    try {
      await girisYap(page, 'admin');
      await page.evaluate(() => { ui._mecSub = 'harita'; go('harita'); });
      await page.waitForFunction(() => document.querySelector('#hList .hg-tools') && typeof hMap !== 'undefined' && hMap);
      const pano = await page.evaluate(a => hRows.find(r => r.faces.some(u => u.id === a)).id, F.A);
      await page.evaluate(p => hPick(p), pano);
      await expect(page.locator('#hSelA')).toContainText('Konum ekle');
      await page.evaluate(() => hMap.fire('click', { latlng: L.latLng(37.01, 35.3) }));   // düzenleme kapalı: yazmaz, taslak yok
      expect(await page.evaluate(() => hTaslak)).toBeNull();
      await page.locator('#hSelA').getByRole('button', { name: 'Konum ekle' }).click();
      await expect(page.locator('#hDuzenBar')).toBeVisible();
      await page.evaluate(() => hMap.fire('click', { latlng: L.latLng(37.01, 35.3) }));
      await expect(page.locator('#hSelA')).toContainText('Kaydedilmemiş konum');
      await page.locator('#hSelA').getByRole('button', { name: 'Vazgeç' }).click();
      expect(sql(`select count(*) from units where id in (${F.A},${F.B}) and lat is not null`)).toBe('0');
      await page.locator('#hSelA').getByRole('button', { name: 'Konum ekle' }).click();
      await page.evaluate(() => hMap.fire('click', { latlng: L.latLng(37.0123, 35.3456) }));
      await page.locator('#hKaydetB').click();
      await expect.poll(() => sql(`select count(*) from units where id in (${F.A},${F.B}) and round(lat::numeric,4)=37.0123`)).toBe('2');
      await expect(page.locator('#hDuzenBar')).toBeHidden();
    } finally { konumYaz(once); }
  });
});
