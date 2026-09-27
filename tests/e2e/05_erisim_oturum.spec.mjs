// Erişim: kişisel veri yalnız sahibine; pasif üye, ekip dışı oturum ve anonim
// iç veriyi okuyamaz; tarayıcıya ayrıcalıklı anahtar gitmez.
// Oturum: başka sekmede çıkış ve hesabın pasife alınması açık sekmede yakalanır.
import { test, expect } from '@playwright/test';
import { girisYap, sql, rest, depo, APP, KULLANICI, PAROLA, temizle } from '../lib/ortam.mjs';

/* Her test yalnız kendi işaretli verisiyle başlar (tekrar/sıra bağımsız). */
test.beforeEach(() => temizle());

const satir = r => (Array.isArray(r.veri) ? r.veri.length : 0);

test.describe('Erişim', () => {
  test('kişisel randevu yalnız sahibine görünür (yönetici dahil)', async () => {
    expect(satir(await rest('uye', `personal_events?title=eq.S13 özel randevu`))).toBe(1);
    for (const kim of ['uye2', 'admin', 'pasif', 'disari', null]) {
      const r = await rest(kim, `personal_events?title=eq.S13 özel randevu`);
      expect(satir(r), `${kim || 'anon'} kişisel randevuyu görmemeli`).toBe(0);
    }
    const r = await rest('uye2', `personal_events?title=eq.S13 özel randevu`, { method: 'PATCH', body: { note: 'x' } });
    expect(satir(r)).toBe(0);
    expect(sql(`select note from personal_events where title='S13 özel randevu'`)).toBe('Yalnız S13 Üye görebilir');
  });

  test('pasif üye, ekip dışı oturum ve anonim iç tabloları okuyamaz', async () => {
    const TABLO = ['jobs', 'entries', 'customers', 'contacts', 'team', 'work_operations', 'operation_price_groups',
      'documents', 'media_placements', 'media_schedule', 'contracts', 'bildirimler'];
    expect(satir(await rest('uye', 'jobs?select=id&limit=1'))).toBe(1);
    /* Pozitif kontrol: tablo gerçekten var ve aktif üyeye açık (boş sonuç "yok" demek değil). */
    for (const t of TABLO) expect((await rest('uye', `${t}?select=*&limit=1`)).durum, `uye → ${t}`).toBe(200);
    for (const kim of ['pasif', 'disari', null]) for (const t of TABLO) {
      const r = await rest(kim, `${t}?select=*&limit=5`);
      expect(satir(r), `${kim || 'anon'} → ${t}`).toBe(0);
    }
  });

  test('pasif üye ve ekip dışı oturum medya deposuna yazamaz', async () => {
    for (const kim of ['pasif', 'disari', null]) {
      const r = await depo(kim, `object/media/s13t-${kim || 'anon'}.txt`, { method: 'POST', govde: new Blob(['x']), tip: 'text/plain' });
      expect(r.durum, `${kim || 'anon'} medya yüklememeli`).toBeGreaterThanOrEqual(400);
    }
    expect(+sql(`select count(*) from storage.objects where bucket_id='media' and name like 's13t-%'`)).toBe(0);
    /* Pozitif kontrol: aktif üye yükleyip silebilir (red, yol hatasından gelmiyor). */
    expect((await depo('uye', 'object/media/s13t-uye.txt', { method: 'POST', govde: new Blob(['x']), tip: 'text/plain' })).durum).toBe(200);
    expect((await depo('uye', 'object/media', { method: 'DELETE', govde: JSON.stringify({ prefixes: ['s13t-uye.txt'] }) })).durum).toBe(200);
    expect(+sql(`select count(*) from storage.objects where bucket_id='media' and name like 's13t-%'`)).toBe(0);
  });

  test('tarayıcıya giden dosyalarda ayrıcalıklı anahtar yok', async () => {
    const html = await (await fetch(`${APP}/admin`)).text();
    const dosyalar = [...html.matchAll(/(?:src|href)="(assets\/[^"?]+\.(?:js|css))/g)].map(m => m[1]);
    expect(dosyalar.length).toBeGreaterThan(3);
    dosyalar.push('assets/config.js');
    const metin = [html, ...(await Promise.all(dosyalar.map(async d => (await fetch(`${APP}/${d}`)).text())))].join('\n');
    expect(metin).not.toMatch(/service_role|sb_secret_/);
    for (const [j] of metin.matchAll(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g)) {
      const yuk = JSON.parse(Buffer.from(j.split('.')[1], 'base64url').toString());
      expect(yuk.role).not.toBe('service_role');
    }
  });
});

test.describe('Oturum', () => {
  test('başka sekmede çıkış: açık sekme uyarır, form korunur, aynı hesapla devam edilir', async ({ context }) => {
    const a = await context.newPage();
    await girisYap(a, 'uye');
    await a.evaluate(() => jobForm());
    await a.fill('#jt', 'S13T korunan taslak');

    const b = await context.newPage();
    await b.goto(`${APP}/admin`);
    await b.waitForFunction(() => typeof sb !== 'undefined');
    await b.evaluate(() => sb.auth.signOut());

    await a.bringToFront();
    await a.evaluate(() => kimlikDogrula(true));
    await expect(a.locator('#oturumBg')).toContainText('Oturum sona erdi');
    await expect(a.locator('#otP')).toBeFocused();
    await a.fill('#otE', KULLANICI.uye);
    await a.fill('#otP', PAROLA);
    await a.locator('#otB').click();
    await expect(a.locator('#oturumBg')).toHaveCount(0);
    await expect(a.locator('#modalBg.open #jt')).toHaveValue('S13T korunan taslak');
  });

  test('hesap pasife alınınca açık sekmede erişim kapanır', async ({ page }) => {
    await girisYap(page, 'uye2');
    try {
      sql(`update team set active=false where eposta='${KULLANICI.uye2}'`);
      await page.evaluate(() => kimlikDogrula(true));
      await expect(page.locator('#oturumBg')).toContainText('Erişim kapandı');
      await expect(page.locator('#otP')).toHaveCount(0);
    } finally {
      sql(`update team set active=true where eposta='${KULLANICI.uye2}'`);
    }
  });
});

test.describe('Gezinme', () => {
  /* Önce açılan ekranın istekleri yavaş; kullanıcı hemen başka ekrana geçer.
     Sabit bekleme yerine: gecikmeli istekler yanıtlanana kadar beklenir. */
  async function yaris(page, once, sonra) {
    let sinir = Infinity; const bekleyen = [];
    await page.route('**/rest/v1/**', async r => {
      if (Date.now() < sinir) { let bit; bekleyen.push(new Promise(x => (bit = x))); await new Promise(x => setTimeout(x, 1200)); await r.continue(); bit(); }
      else await r.continue(); });
    sinir = Date.now() + 100;
    await page.evaluate(e => { eval(e); }, once);
    await page.waitForTimeout(120); sinir = 0;
    await page.evaluate(e => eval(e), sonra);
    await expect.poll(() => bekleyen.length).toBeGreaterThan(0);
    await Promise.all(bekleyen); await page.waitForLoadState('networkidle');
    await page.unroute('**/rest/v1/**');
  }
  const baslikIcerik = page => page.evaluate(() => ({ ttl: document.getElementById('ttl').textContent,
    h: (document.querySelector('#content h3') || {}).textContent || '', v: history.state && history.state.v }));

  test('yavaş önceki bölüm yeni bölümün üstüne çizilmez', async ({ page }) => {
    await girisYap(page, 'uye');
    await yaris(page, "go('muhasebe')", "go('operasyon')");
    const s = await baslikIcerik(page);
    expect(s.ttl).toBe('Baskı & Montaj');
    expect(s.h).toContain('Baskı & Montaj');
  });

  test('yavaş iş ayrıntısı yeni bölümün üstüne çizilmez ve geçmişe yazılmaz', async ({ page }) => {
    const id = +sql(`select min(id) from jobs`);
    await girisYap(page, 'uye');
    await page.evaluate(() => go('raporlar'));
    await yaris(page, `workAc(${id})`, "go('kurumlar')");
    const s = await baslikIcerik(page);
    expect(s).toMatchObject({ ttl: 'Hafıza', v: 'sec' });
    expect(s.h).toContain('Hafıza');
  });

  test('tarayıcı Geri/İleri ekranları ve bağlamı doğru sırayla geri getirir', async ({ page }) => {
    const id = +sql(`select min(id) from jobs`);
    await girisYap(page, 'uye');
    await page.evaluate(() => go('is-takibi'));
    await expect(page.locator('#ttl')).toHaveText('İşler');
    await page.evaluate(i => workAc(i), id);
    await expect(page.locator('#wFaz')).toBeVisible();
    await page.evaluate(() => go('kurumlar'));
    await expect(page.locator('#hafQ')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#wFaz')).toBeVisible();
    expect(await page.evaluate(() => ui._work && ui._work.id)).toBe(id);
    await page.goBack();
    await expect(page.locator('#ttl')).toHaveText('İşler');
    await expect(page.locator('#wFaz')).toHaveCount(0);
    await page.goForward();
    await expect(page.locator('#wFaz')).toBeVisible();
  });
});
