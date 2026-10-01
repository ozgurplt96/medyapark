// Sprint 13 regresyon paketi — yalnız atılabilir test yığınına (scripts/test-env.ps1) karşı.
// Çalıştırma: .\scripts\test-regression.ps1   (ya da tests/ içinde: npx playwright test)
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './lib/kurulum.mjs',
  /* Tek paylaşılan test DB'si: testler sırayla koşar, veri çakışması olmaz. */
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    channel: 'chrome',
    baseURL: process.env.MP_HEDEF === 'prova' ? 'http://localhost:5530' : 'http://localhost:5520',
    viewport: { width: 1440, height: 900 },
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
  },
});
