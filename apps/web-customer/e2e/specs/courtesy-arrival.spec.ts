import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { newSession, openDrawer } from '../helpers/session';
import { DEFAULT_SLUG, nextCpf, resetQrTables, staffFetch } from '../helpers/physical-qr';

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

const TABLE_CODE = 'QRTEST92';
const TABLE_NUMBER = 92;
const REPORT_DIR = path.resolve(__dirname, '../../../../output/evidencias/courtesy-arrival');
let cpfSeed = Math.floor(Date.now() % 100_000);
let ipSeed = Math.floor(Date.now() % 60_000);

function freshCpf(): string {
  cpfSeed += 1;
  return nextCpf(cpfSeed);
}

function nextBrowserIp(): string {
  ipSeed += 1;
  const normalized = Math.abs(ipSeed) % 65_536;
  return `198.20.${Math.floor(normalized / 256)}.${normalized % 256}`;
}

async function createCourtesy(item: string, notes = 'Teste real via Playwright') {
  const response = await staffFetch<{ id?: string; item?: string }>(`/${DEFAULT_SLUG}/courtesies`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'Sobremesa',
      item,
      tableNumber: TABLE_NUMBER,
      notes,
    }),
  });
  expect(response.status).toBe(201);
  expect(response.body.id).toBeTruthy();
  return response.body;
}

async function openFreshHome(page: import('@playwright/test').Page, name: string) {
  resetQrTables([TABLE_CODE]);
  await page.context().clearCookies();
  await page.context().setExtraHTTPHeaders({
    'x-forwarded-for': nextBrowserIp(),
  });
  await newSession(page, {
    tableCode: TABLE_CODE,
    name,
    cpf: freshCpf(),
    expectWelcome: true,
  });
}

test('home mostra faixa compacta, hero acima e remove ao aceitar', async ({ page }) => {
  await openFreshHome(page, 'Cliente Cortesia Compacta');

  await createCourtesy('Brigadeiro Compacto QA');

  const notice = page.getByTestId('home-courtesy-notice');
  await expect(notice).toBeVisible({ timeout: 10_000 });
  await expect(notice).toContainText('Brigadeiro Compacto QA');
  await expect(page.locator('[data-testid^="courtesy-arrival-"]')).toHaveCount(0);

  const hero = page.getByTestId('home-hero');
  await expect(hero).toBeVisible();
  const heroBox = await hero.boundingBox();
  const noticeBox = await notice.boundingBox();
  expect(heroBox?.y ?? 0).toBeLessThan(noticeBox?.y ?? 0);

  await mkdir(REPORT_DIR, { recursive: true });
  await page.waitForTimeout(1800);
  await page.screenshot({
    path: path.join(REPORT_DIR, 'home-compact-courtesy.png'),
    fullPage: true,
  });

  await page.getByTestId('home-courtesy-accept').click();
  await expect(notice).toBeHidden({ timeout: 10_000 });
});

test('reload com cortesia pendente mantém a faixa compacta', async ({ page }) => {
  await openFreshHome(page, 'Cliente Cortesia Reload');

  await createCourtesy('Pudim Reload QA');
  await expect(page.getByTestId('home-courtesy-notice')).toContainText('Pudim Reload QA', {
    timeout: 10_000,
  });

  await page.reload();
  await expect(page.getByTestId('home-courtesy-notice')).toContainText('Pudim Reload QA', {
    timeout: 10_000,
  });
  await expect(page.locator('[data-testid^="courtesy-arrival-"]')).toHaveCount(0);
});

test('múltiplas cortesias mostram uma faixa e contador discreto', async ({ page }) => {
  await openFreshHome(page, 'Cliente Cortesias Multiplas');

  await createCourtesy('Brownie Contador QA');
  await createCourtesy('Sorvete Contador QA');

  await expect(page.getByTestId('home-courtesy-notice')).toHaveCount(1);
  await expect(page.getByTestId('home-courtesy-notice')).toContainText('Sorvete Contador QA', {
    timeout: 10_000,
  });
  await expect(page.getByTestId('home-courtesy-count')).toHaveText('+1');
});

test('menu abre histórico Mongo de cortesias dos últimos 30 dias', async ({ page }) => {
  await openFreshHome(page, 'Cliente Historico Cortesia');

  await createCourtesy('Quindim Histórico QA', 'Histórico fica no Mongo');
  await expect(page.getByTestId('home-courtesy-notice')).toContainText('Quindim Histórico QA', {
    timeout: 10_000,
  });

  await openDrawer(page);
  await page.getByRole('link', { name: /Cortesias/ }).click();

  await expect(page).toHaveURL(/\/restaurant_dev\/cortesias$/);
  await expect(page.getByRole('heading', { name: 'Cortesias' })).toBeVisible();
  await expect(page.getByText('Histórico dos últimos 30 dias')).toBeVisible();
  await expect(page.getByText('Quindim Histórico QA')).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText('Válida só até o fechamento da conta em que foi enviada.'),
  ).toBeVisible();
});
