// S20 — yayımlanan adreslerin hangi backend'e bağlandığını SALT OKUNUR doğrular (giriş yapmaz, yazmaz).
//   node canli/ortam_dogrula.mjs
import { chromium } from '@playwright/test';
const BEKLENEN = [
  ['https://ozgurplt96.github.io/medyapark/admin.html', 'ziofsihzhixxrakbboks'],
  ['https://ozgurplt96.github.io/medyapark/', 'ziofsihzhixxrakbboks'],
  ['https://ozgurplt96.github.io/medyapark/tuyap/', 'ziofsihzhixxrakbboks'],
  ['https://ozgurplt96.github.io/medyapark-demo/admin.html', 'mdeqpoiweggdjhvmgddw'],
  ['https://ozgurplt96.github.io/medyapark-demo/', 'mdeqpoiweggdjhvmgddw'],
];
const b = await chromium.launch({ channel: 'chrome' });
let kalan = 0;
for (const [adres, ref] of BEKLENEN) {
  const page = await (await b.newContext()).newPage();
  const hedef = new Set(), yazma = [];
  page.on('request', q => { const m = q.url().match(/^https:\/\/([a-z0-9]+)\.supabase\.co\//); if (m) { hedef.add(m[1]); if (!['GET', 'HEAD', 'OPTIONS'].includes(q.method())) yazma.push(q.method() + ' ' + q.url().slice(0, 90)); } });
  await page.goto(adres); await page.waitForLoadState('networkidle').catch(() => {});
  const url = await page.evaluate(() => typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : null);
  const ok = url === `https://${ref}.supabase.co` && [...hedef].every(h => h === ref) && yazma.length === 0;
  if (!ok) kalan++;
  console.log(`${ok ? '✓' : '✗'} ${adres} → ${url} · istek giden proje: ${[...hedef].join(',') || '—'} · yazma isteği: ${yazma.length}`);
  await page.close();
}
await b.close();
process.exit(kalan ? 1 : 0);
