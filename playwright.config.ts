import { defineConfig, devices } from '@playwright/test';

// E2E běží proti produkčnímu (standalone) sestavení s ukázkovými daty a záložním mapovým stylem –
// v testovacím prostředí nejsou mapové dlaždice ani živá data dostupná.
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  // ostatní testy začínají s vypnutým úvodním průvodcem (vlastní test ho zapíná prázdným úložištěm)
  use: { baseURL: `http://127.0.0.1:${PORT}`, locale: 'cs-CZ', timezoneId: 'Europe/Prague', trace: 'retain-on-failure',
    storageState: { cookies: [], origins: [{ origin: `http://127.0.0.1:${PORT}`, localStorage: [{ name: 'doprava.onboarding.v1', value: 'never' }] }] } },
  webServer: {
    command: 'node scripts/prepare-standalone.mjs && node .next/standalone/server.js',
    url: `http://127.0.0.1:${PORT}/api/status`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { PORT: String(PORT), HOSTNAME: '127.0.0.1', DEMO_DATA: '1', MAP_STYLE_URL: '/map/offline-style.json', ADMIN_TOKEN: 'e2e-admin-token-123' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } } }],
});
