// S20 — temiz canlı kurulum: adres → ortam seçimi, yüzeyler, giriş hesabı bağlama,
// Tüyap sayfasının ortam backend'i. Beklenen değerler elle yazılır.
import { test, expect } from '@playwright/test';
import { girisYap, sql, rest, rpc, temizle, dlg, APP, API } from '../lib/ortam.mjs';

test.beforeEach(() => temizle());
test.afterAll(() => temizle());

test.describe('Ortam ayrımı', () => {
  test('adres (host + yol) → ortam: demo ve canlı aynı host’ta ayrı backend seçer; tanımsız adres kapalıdır', async ({ page }) => {
    await girisYap(page, 'uye');
    const r = await page.evaluate(() => ({
      ortam: MP_ORTAM, depo: MP_DEPO, url: SUPABASE_URL,
      t: [
        ['localhost', '/admin', 'http:'], ['127.0.0.1', '/', 'http:'],
        ['ozgurplt96.github.io', '/medyapark-demo/', 'https:'], ['ozgurplt96.github.io', '/medyapark-demo/admin.html', 'https:'],
        ['ozgurplt96.github.io', '/medyapark/', 'https:'], ['ozgurplt96.github.io', '/medyapark/admin.html', 'https:'],
        ['ozgurplt96.github.io', '/medyapark', 'https:'], ['ozgurplt96.github.io', '/medyapark/tuyap/', 'https:'],
        ['OZGURPLT96.github.io', '/Medyapark/', 'https:'],
        ['ozgurplt96.github.io', '/', 'https:'], ['ozgurplt96.github.io', '/medyapark-eski/', 'https:'], ['ozgurplt96.github.io', '/medyaparkx/', 'https:'],
        ['halilsafak.github.io', '/medyapark/', 'https:'], ['medyaparkadana.com', '/', 'https:'], ['www.medyaparkadana.com', '/admin.html', 'https:'],
        ['192.168.1.20', '/admin', 'http:'], ['pc.local', '/', 'http:'], ['', '/C:/x/admin.html', 'file:'], ['localhost', '/admin', 'file:'],
      ].map(([h, y, p]) => mpOrtamSec(h, y, p)),
      ortamlar: MP_ORTAMLAR,
    }));
    expect(r.ortam).toBe('yerel'); expect(r.depo).toBe('mp_'); expect(r.url).toBe(API);
    expect(r.t).toEqual(['yerel', 'yerel', 'demo', 'demo', 'canli', 'canli', 'canli', 'canli', 'canli',
      null, null, null, null, null, null, null, null, null, null]);
    /* Üç ortam üç AYRI backend; devralınan eski proje hiçbirinin hedefi değil. */
    const adres = Object.values(r.ortamlar).map(o => o.url), anahtar = Object.values(r.ortamlar).map(o => o.key);
    expect(new Set(adres).size).toBe(3); expect(new Set(anahtar).size).toBe(3);
    expect(JSON.stringify(r.ortamlar)).not.toContain('wubljodinspijiqzywav');
    expect(r.ortamlar.demo.url).toContain('mdeqpoiweggdjhvmgddw');
    expect(r.ortamlar.canli.url).not.toContain('mdeqpoiweggdjhvmgddw');
  });

  test('Tüyap sayfası uygulamayla aynı ortamın backend’ine bağlanır; devralınan projeye istek gitmez', async ({ page }) => {
    const hedef = new Set();
    page.on('request', q => { const m = q.url().match(/^https?:\/\/([^/]+)\/(?:rest|auth|storage)\/v1\//); if (m) hedef.add(m[1]); });
    await page.goto(`${APP}/tuyap/`);
    await page.waitForLoadState('load');
    await expect.poll(() => [...hedef].length).toBeGreaterThan(0);
    expect([...hedef]).toEqual([new URL(API).host]);
    expect(await page.evaluate(() => typeof supa !== 'undefined' && supa === sb)).toBe(true);
  });
});

test.describe('Yüzeyler: Workspace günlük alan, Yönetim yöneticiye ek', () => {
  test('yönetici Workspace ile açılır; Yönetim’e geçebilir; bölüm doğrudan açılınca menü o yüzeye geçer', async ({ page }) => {
    await girisYap(page, 'admin');
    const durum = () => page.evaluate(() => ({ y: surfaceGet(), b: ui.section, alt: document.querySelector('.brand-sub').textContent,
      sw: [...document.querySelectorAll('#surfaceSw button')].map(x => x.textContent.trim() + (x.classList.contains('on') ? '*' : '')),
      nav: [...document.querySelectorAll('#navScroll .navi')].map(x => x.innerText.trim()) }));
    let d = await durum();
    expect(d.y).toBe('workspace'); expect(d.b).toBe('workspace-home'); expect(d.alt).toBe('Team Workspace');
    expect(d.sw).toEqual(['Workspace*', 'Yönetim']);
    expect(d.nav).toEqual(['Panelim', 'İşler', 'Hafıza', 'Mecralar', 'Raporlar']);
    /* Anahtarla Yönetim'e geçiş. */
    await page.locator('#surfaceSw button', { hasText: 'Yönetim' }).click();
    await page.waitForFunction(() => ui.section === 'dashboard');
    d = await durum();
    expect(d.y).toBe('yonetim'); expect(d.alt).toBe('Yönetim Paneli'); expect(d.sw).toEqual(['Workspace', 'Yönetim*']);
    for (const ad of ['Dashboard', 'Mecralar', 'Ürünler', 'Teklifler', 'Planlama Talepleri', 'Müşteriler', 'Bülten Aboneleri', 'Tedarikçiler',
      'Anasayfa', 'Sayfalar', 'İkonlar', 'Ekip', 'Notlar', 'Ayarlar']) expect(d.nav, ad).toContain(ad);
    /* Ortak bölüm bulunulan yüzeyde kalır; yalnız Workspace'e ait bölüm yüzeyi değiştirir. */
    await page.evaluate(() => go('is-takibi')); expect((await durum()).y).toBe('yonetim');
    await page.evaluate(() => go('workspace-home')); d = await durum();
    expect(d.y).toBe('workspace'); expect(d.sw).toEqual(['Workspace*', 'Yönetim']);
    /* Doğrudan açılan yönetim bölümü: menü Yönetim'e geçer, bölüm menüde işaretlidir. */
    await page.evaluate(() => go('ayarlar'));
    d = await durum();
    expect(d.y).toBe('yonetim'); expect(d.sw).toEqual(['Workspace', 'Yönetim*']);
    expect(await page.locator('#navScroll .navi.on').innerText()).toContain('Ayarlar');
    /* Açık seçim hatırlanır. */
    await page.reload();
    await page.waitForFunction(() => typeof ui !== 'undefined' && ui._me && document.querySelector('#surfaceSw'));
    expect((await durum()).y).toBe('yonetim');
  });

  test('ekip üyesinde yüzey anahtarı yoktur; yönetim bölümüne gidemez', async ({ page }) => {
    await girisYap(page, 'uye');
    expect(await page.locator('#surfaceSw').count()).toBe(0);
    await page.evaluate(() => go('ayarlar'));
    await page.waitForFunction(() => ui.section === 'workspace-home');
    expect(await page.evaluate(() => surfaceGet())).toBe('workspace');
  });
});

test.describe('Giriş hesabı', () => {
  test('yönetici ekip kaydını giriş hesabına bağlar; bağlanan kişi içeri girer; üye bu işlemi yapamaz', async ({ page }) => {
    const id = +sql(`insert into team (name, eposta, app_role, active) values ('S13T Bağlanacak', 'S13-Disari@test.local', 'team_member', true) returning id`);
    const yok = +sql(`insert into team (name, eposta, app_role, active) values ('S13T Hesapsız', 's13-yok@test.local', 'team_member', true) returning id`);
    expect((await rest('disari', 'customers?select=id&limit=1')).veri).toEqual([]);          // bağlanmadan önce içeride değil
    const u = await rpc('uye', 'ekip_hesap_bagla', { p_team_id: id });
    expect(u.durum).toBeGreaterThanOrEqual(400); expect(JSON.stringify(u.veri)).toContain('42501');
    expect(sql(`select coalesce(auth_user_id::text,'') from team where id=${id}`)).toBe('');
    expect((await rpc(null, 'ekip_hesap_bagla', { p_team_id: id })).durum).toBeGreaterThanOrEqual(400);   // anonim

    await girisYap(page, 'admin');
    await page.evaluate(i => { ui._teamOpen = i; return go('ekip'); }, yok);
    await expect(page.locator('#tpHesap')).toContainText('bağlı değil');
    await page.locator('#tpBagla').click();
    await expect(dlg(page)).toContainText('giriş hesabı yok');
    await page.locator('#mpDlgOk').click();
    expect(sql(`select coalesce(auth_user_id::text,'') from team where id=${yok}`)).toBe('');

    await page.evaluate(i => { ui._teamOpen = i; renderSection(); }, id);
    await expect(page.locator('#tpBagla')).toBeVisible();
    await page.locator('#tpBagla').click();
    await expect(page.locator('#tpBagla')).toHaveCount(0);
    await expect(page.locator('#tpHesap')).toContainText('bağlı');
    await expect(page.locator('#tpHesap')).not.toContainText('bağlı değil');
    expect(sql(`select count(*) from team t join auth.users a on a.id=t.auth_user_id where t.id=${id} and a.email='s13-disari@test.local'`)).toBe('1');
    expect((await rest('disari', 'customers?select=id&limit=1')).veri.length).toBe(1);        // artık iç kullanıcı
    /* Aynı hesap ikinci bir ekip kaydına bağlanamaz. */
    sql(`update team set eposta='s13-disari@test.local' where id=${yok}`);
    const r2 = await rpc('admin', 'ekip_hesap_bagla', { p_team_id: yok });
    expect(r2.veri).toMatchObject({ ok: false, neden: 'baska_uyede' });
    /* Ekip listesi: hesabı olmayan aktif üye uyarıyla görünür. */
    await page.evaluate(() => { ui._teamOpen = null; renderSection(); });
    await expect(page.locator('#content .banner')).toContainText('giriş hesabı bağlı değil');
    await expect(page.locator('.tm-card', { hasText: 'S13T Hesapsız' })).toContainText('giriş hesabı yok');
    await expect(page.locator('.tm-card', { hasText: 'S13T Bağlanacak' })).not.toContainText('giriş hesabı yok');
  });

  test('kendi profilinde şifre değiştirilebilir; kısa şifre reddedilir', async ({ page }) => {
    await girisYap(page, 'uye');
    await page.evaluate(() => go('ekip'));
    await expect(page.locator('#tpPw')).toBeVisible();
    await page.fill('#tpPw', 'kisa');
    await page.locator('#tpPwB').click();
    await expect(dlg(page)).toContainText('en az 8 karakter');
  });
});
