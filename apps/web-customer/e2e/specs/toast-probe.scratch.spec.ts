/**
 * SONDA TEMPORÁRIA (não commitar) — caça ao toast vermelho "1 error" na
 * landing do assistente (prompt 100 §6). Abre a landing num iPhone 14
 * (WebKit) capturando console + pageerror + requests com status >= 400.
 */
import { test } from '@playwright/test';
import { newSession } from '../helpers/session';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

test('probe: console/network errors na landing do assistente', async ({ page }) => {
  const consoleLines: string[] = [];
  const pageErrors: string[] = [];
  const badResponses: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleLines.push(`[console.${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(`[pageerror] ${err.message}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      badResponses.push(`[http ${res.status()}] ${res.request().method()} ${res.url()}`);
    }
  });
  page.on('requestfailed', (req) => {
    badResponses.push(`[requestfailed] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });

  await newSession(page, { tableCode: 'QRTEST91' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.goto('/restaurant_dev/assistente', { waitUntil: 'commit' });
  await page.waitForTimeout(8000);

  // O badge do Next dev overlay ("1 error"/"1 Issue") fica num portal
  // próprio — detecta presença e conteúdo.
  const indicator = await page.evaluate(() => {
    const portal = document.querySelector('nextjs-portal');
    const text = portal?.shadowRoot?.textContent ?? portal?.textContent ?? '';
    return text.slice(0, 300);
  });

  console.log('=== CONSOLE ===');
  consoleLines.forEach((l) => console.log(l));
  console.log('=== PAGEERROR ===');
  pageErrors.forEach((l) => console.log(l));
  console.log('=== HTTP>=400 / FAILED ===');
  badResponses.forEach((l) => console.log(l));
  console.log('=== NEXT PORTAL ===');
  console.log(JSON.stringify(indicator));
});
