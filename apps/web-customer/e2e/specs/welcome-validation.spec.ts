import { test, expect } from '@playwright/test';
import { buildMesaUrl, liberateQrTestTable } from '../helpers/qr';

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
    await page.goto('/restaurant_dev/mesa/QRTEST91', { waitUntil: 'networkidle' });

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

test.describe('Mesa — troca silenciosa de mesa', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('escanear QR de QRTEST92 com sessao ativa de QRTEST91 invalida e re-inicia', async ({ page }) => {
    // Inicia sessao em QRTEST91.
    await liberateQrTestTable({ tableCode: 'QRTEST91' });
    await page.goto(buildMesaUrl({ tableCode: 'QRTEST91' }), {
      waitUntil: 'networkidle',
    });
    // Welcome ou home — aceita os dois (DB pode ter customer recognition).
    const welcomeOrHome = page
      .getByRole('heading', { name: /Bem-vindo ao/i })
      .or(page.getByRole('button', { name: /Chamar gar.om/ }));
    await expect(welcomeOrHome.first()).toBeVisible({ timeout: 30_000 });

    // Tira a "tableLabel" da URL/DOM como referencia. Cada QR de teste tem
    // label diferente ("QR Teste 91" vs "QR Teste 92"). Vai aparecer no topbar quando
    // chegar na home.
    if (await page.getByRole('heading', { name: /Bem-vindo ao/i }).isVisible()) {
      await page.getByPlaceholder('Seu nome').fill('QA Caleb');
      await page.getByPlaceholder('000.000.000-00').fill('12345678909');
      await page.getByRole('button', { name: /^Continuar$/ }).click();
      await expect(page.getByRole('button', { name: /Chamar gar.om/ })).toBeVisible({
        timeout: 10_000,
      });
    }

    // Agora navega pra QRTEST92 — sem o fix, sessao seguia em QRTEST91 e pedidos
    // iam pra mesa errada. Com o fix, a guarda detecta tableCode diferente,
    // limpa session e re-inicia (pode mostrar welcome ou ir direto pra
    // home com recognition).
    await liberateQrTestTable({ tableCode: 'QRTEST92' });
    await page.goto(buildMesaUrl({ tableCode: 'QRTEST92' }), {
      waitUntil: 'networkidle',
    });

    // Entra ou no welcome ou na home — qualquer um significa que o init
    // rodou com tableCode novo (QRTEST92). Antes: pulava direto e mantinha QRTEST91.
    await expect(welcomeOrHome.first()).toBeVisible({ timeout: 30_000 });

    // Verifica se a URL atual realmente carrega QRTEST92 (nao foi redirect).
    expect(page.url()).toContain('/mesa/QRTEST92');
  });
});

test.describe('Assistente — falsos positivos de pedido', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('"tudo bem" depois de prato sugerido NAO dispara pedido fake', async ({
    page,
  }) => {
    await liberateQrTestTable();
    await page.goto(buildMesaUrl(), { waitUntil: 'networkidle' });
    const welcome = page.getByRole('heading', { name: /Bem-vindo ao/i });
    if (await welcome.isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.getByPlaceholder('Seu nome').fill('Caleb QA');
      await page.getByPlaceholder('000.000.000-00').fill('12345678909');
      await page.getByRole('button', { name: /^Continuar$/ }).click();
    }
    await expect(page.getByRole('button', { name: /Chamar gar.om/ })).toBeVisible({
      timeout: 10_000,
    });

    // Vai pro assistente direto via URL.
    await page.goto('/restaurant_dev/assistente', {
      waitUntil: 'networkidle',
    });
    const input = page.getByPlaceholder('Digite aqui');
    await expect(input).toBeVisible({ timeout: 10_000 });

    // Pergunta que provavelmente retorna linkedItems do menu.
    await input.fill('qual o prato do dia');
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    // Espera a IA responder (loading dots somem).
    await expect(page.locator('.animate-bounce-dot').first()).toBeHidden({
      timeout: 30_000,
    });

    // Agora envia uma saudacao — NAO deve disparar pedido nem navegar
    // pra /pagamento.
    await input.fill('tudo bem');
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect(page.locator('.animate-bounce-dot').first()).toBeHidden({
      timeout: 15_000,
    });

    // URL nao mudou pra pagamento/pix.
    expect(page.url()).not.toContain('/pagamento');
    expect(page.url()).not.toContain('/pedido/confirmando');
    expect(page.url()).toContain('/assistente');
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
