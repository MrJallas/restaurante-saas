import { test, expect } from '@playwright/test';
import { buildMesaUrl } from '../helpers/qr';

/**
 * Suite que cobre os bugs encontrados pelos bug-hunters de iOS:
 *  - personalizacao obrigatoria (sem link "Continuar sem personalizacao")
 *  - mensagem de erro humana quando QR vem sem hmac/ts (sem leak de
 *    "hmacSignature should not be empty,timestamp should not be empty")
 *  - nome de input nao deve ser deformado por capitalizeName a cada
 *    keystroke
 */

test.describe('Welcome — personalizacao obrigatoria', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('modal nao oferece "Continuar sem personalizacao"', async ({ page }) => {
    await page.goto(buildMesaUrl(), { waitUntil: 'networkidle' });
    await expect(
      page.getByRole('heading', { name: /Bem-vindo ao/i }),
    ).toBeVisible({ timeout: 30_000 });

    // O bypass anonimo nao deve mais existir — UX obriga nome+CPF.
    await expect(
      page.getByRole('button', { name: /Continuar sem personaliza/i }),
    ).toHaveCount(0);
    // tambem nao pode estar como link (caso alguem mude tag no futuro).
    await expect(
      page.getByText(/Continuar sem personaliza/i),
    ).toHaveCount(0);
  });

  test('Continuar fica disabled ate nome+CPF validos', async ({ page }) => {
    await page.goto(buildMesaUrl(), { waitUntil: 'networkidle' });
    await expect(
      page.getByRole('heading', { name: /Bem-vindo ao/i }),
    ).toBeVisible({ timeout: 30_000 });

    const continueBtn = page.getByRole('button', { name: /^Continuar$/ });
    await expect(continueBtn).toBeDisabled();

    await page.getByPlaceholder('Seu nome').fill('Q');
    await expect(continueBtn).toBeDisabled();

    await page.getByPlaceholder('Seu nome').fill('QA Tester');
    await expect(continueBtn).toBeDisabled();

    // CPF invalido (digitos verificadores errados) — ainda disabled.
    await page.getByPlaceholder('000.000.000-00').fill('11111111111');
    await expect(continueBtn).toBeDisabled();

    // CPF valido — habilita.
    await page.getByPlaceholder('000.000.000-00').fill('12345678909');
    await expect(continueBtn).toBeEnabled();
  });
});

test.describe('Mesa — erros amigaveis', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('QR sem hmac/ts mostra mensagem humana, nao a string crua do validator', async ({
    page,
  }) => {
    // Navega direto pro mesa sem os params assinados — o init session falha.
    await page.goto('/restaurant_dev/mesa/M01', { waitUntil: 'networkidle' });

    // Aguarda sair do loading e cair na tela de erro.
    await expect(page.getByText(/Escaneie o QR Code novamente/i)).toBeVisible({
      timeout: 30_000,
    });

    // O texto cru do class-validator NAO deve aparecer pro usuario.
    await expect(
      page.getByText(/hmacSignature should not be empty/i),
    ).toHaveCount(0);
    await expect(
      page.getByText(/timestamp should not be empty/i),
    ).toHaveCount(0);
  });
});

test.describe('Welcome — capitalizeName nao deforma input', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('digitar "da silva" preserva o que o usuario escreveu enquanto digita', async ({
    page,
  }) => {
    await page.goto(buildMesaUrl(), { waitUntil: 'networkidle' });
    await expect(
      page.getByRole('heading', { name: /Bem-vindo ao/i }),
    ).toBeVisible({ timeout: 30_000 });

    const nome = page.getByPlaceholder('Seu nome');
    await nome.fill('joao da silva');
    // Enquanto editando, o valor exibido deve ser exatamente o que o
    // usuario escreveu — sem o regex /\b\w/g forcando "Joao Da Silva".
    await expect(nome).toHaveValue('joao da silva');
  });
});
