import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

/**
 * Config exclusivo pras gravações de demo (LinkedIn). NÃO é suíte de teste:
 * não faz assert de produto, só dirige a UI e grava vídeo.
 *
 * Dois formatos, porque as superfícies são de plataformas diferentes:
 *   mobile  → cliente, garçom, gerente, recepção  (iPhone 14, WebKit, retrato)
 *   desktop → cozinha KDS e bar                   (Chromium, 1920x1080)
 *
 * Vídeo sai em .webm; o script de build converte pra .mp4 no formato final.
 */

const OUT = process.env.DEMO_OUT_DIR || path.resolve(__dirname, '../../../../../.demo-videos');

export default defineConfig({
  testDir: __dirname,
  testMatch: /.*\.demo\.ts/,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: path.join(OUT, 'raw'),
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3003',
    geolocation: { latitude: -23.561, longitude: -46.655 },
    permissions: ['geolocation'],
    trace: 'off',
    screenshot: 'off',
    // 'on' porque o vídeo É o entregável — não é evidência de falha.
    // O size TEM que bater com o viewport. O Playwright não faz upscale: se o
    // vídeo for maior que a página, ele desenha a página no canto superior
    // esquerdo e preenche o resto de cinza. O aumento pra 1080p é no ffmpeg.
    video: { mode: 'on', size: { width: 390, height: 844 } },
  },
  projects: [
    {
      // A "noite cheia" cria os 5 contextos na mão (viewports e engines
      // diferentes por persona, cada um com seu recordVideo), então este
      // projeto não define viewport nem grava vídeo no nível do projeto.
      name: 'noite',
      testMatch: /noite\.demo\.ts/,
      use: { video: 'off', trace: 'off' },
    },
    {
      name: 'mobile',
      testMatch: /.*\.mobile\.demo\.ts/,
      use: {
        ...devices['iPhone 14'],
        // O size TEM que bater com o viewport. O Playwright não faz upscale: se o
    // vídeo for maior que a página, ele desenha a página no canto superior
    // esquerdo e preenche o resto de cinza. O aumento pra 1080p é no ffmpeg.
    video: { mode: 'on', size: { width: 390, height: 844 } },
      },
    },
    {
      name: 'desktop',
      testMatch: /.*\.desktop\.demo\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        video: { mode: 'on', size: { width: 1920, height: 1080 } },
      },
    },
  ],
});
