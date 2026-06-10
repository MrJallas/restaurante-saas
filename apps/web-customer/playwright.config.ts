import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite pro customer app. Roda contra o dev server (3003) — assumimos
 * que docker-compose ja esta de pe quando os testes rodam. Se nao, o
 * `webServer` abaixo pode ser ligado pra subir um Next dev local.
 *
 * Por que WebKit + iPhone 14:
 *   O app real roda 99% em Safari iOS. Chromium passa em coisas que iOS
 *   quebra (sticky position, backdrop-filter, scroll containment). Rodar
 *   contra o engine certo evita "passa em CI mas quebra no iPhone".
 */
export default defineConfig({
  testDir: './e2e/specs',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // serial — DB compartilhado, paralelo gera flakiness
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3003',
    geolocation: { latitude: -23.561, longitude: -46.655 },
    permissions: ['geolocation'],
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'iphone-14',
      use: {
        ...devices['iPhone 14'],
        // devices['iPhone 14'] ja configura: WebKit, viewport 390x844, touch
        // events, isMobile, hover desligado, user agent. Override do baseURL
        // herda do `use` global acima.
      },
    },
  ],
});
