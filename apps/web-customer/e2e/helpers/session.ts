import { Page, expect } from '@playwright/test';
import { buildMesaUrl, TableCode } from './qr';

/**
 * CPF de teste valido (dois digitos verificadores ok). Mantemos um numero
 * unico pra que customer recognition funcione: cada teste com mesmo CPF =
 * mesma `customers.id` no DB. Se quiser fresh user em algum cenario,
 * mude pra outro CPF valido.
 */
export const TEST_CPF = '12345678909';
export const TEST_NAME = 'Caleb Teste';

export interface NewSessionOpts {
  slug?: string;
  tableCode?: TableCode;
  /** Se true, sempre passa pelo welcome (assume sem cookies). */
  expectWelcome?: boolean;
  name?: string;
  cpf?: string;
}

/**
 * Vai pra mesa via QR assinado e completa o welcome se aparecer. Idempotente:
 * se a sessao ja tem cookie de recognition, pula o modal automaticamente.
 *
 * Retorna assim que a home estiver visivel (botao "Chamar garçom" presente).
 */
export async function newSession(
  page: Page,
  opts: NewSessionOpts = {},
): Promise<void> {
  const slug = opts.slug ?? 'restaurant_dev';
  const tableCode = opts.tableCode ?? 'M01';
  const name = opts.name ?? TEST_NAME;
  const cpf = opts.cpf ?? TEST_CPF;

  await page.goto(buildMesaUrl({ slug, tableCode }));

  const welcomeHeading = page.getByRole('heading', { name: /Bem-vindo ao/i });
  const welcomeVisible = await welcomeHeading
    .isVisible({ timeout: 3000 })
    .catch(() => false);

  if (opts.expectWelcome) {
    await expect(welcomeHeading).toBeVisible({ timeout: 5000 });
  }

  if (welcomeVisible) {
    await welcomeAs(page, name, cpf);
  }

  await expect(
    page.getByRole('button', { name: 'Chamar garçom' }),
  ).toBeVisible({ timeout: 10_000 });
}

/**
 * Preenche o WelcomeModal e espera ele fechar. Assume que o modal ja
 * esta visivel (ou seja: chame `newSession` em vez disso pra logica
 * geral).
 */
export async function welcomeAs(
  page: Page,
  name = TEST_NAME,
  cpf = TEST_CPF,
): Promise<void> {
  // Selectors por placeholder sao mais estaveis que `nth(N)` — em iPhone
  // 14 emul, `nth(1)` as vezes falhava num re-render mid-fill. Placeholders
  // sao unicos no modal (`Seu nome`, `000.000.000-00`).
  await page.getByPlaceholder('Seu nome').fill(name);
  await page.getByPlaceholder('000.000.000-00').fill(cpf);
  await page.getByRole('button', { name: /Continuar|Processando/ }).click();
  await expect(
    page.getByRole('heading', { name: /Bem-vindo ao/i }),
  ).toBeHidden({ timeout: 10_000 });
}

/**
 * Abre o drawer (hamburger) e espera renderizar. Retorna depois que ao
 * menos um item de navegacao esta visivel — sinal de que o drawer
 * passou pelo gate de `sessionId`.
 */
export async function openDrawer(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(page.getByRole('link', { name: /Cardápio/ })).toBeVisible({
    timeout: 5000,
  });
}

/**
 * Fecha o drawer (botao X). Retorna quando o overlay desaparece.
 */
export async function closeDrawer(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Fechar menu' }).click();
  await expect(
    page.getByRole('link', { name: /Cardápio/ }),
  ).toBeHidden({ timeout: 3000 });
}
