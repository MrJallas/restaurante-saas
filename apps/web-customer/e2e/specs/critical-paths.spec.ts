import { test, expect, type Page } from '@playwright/test';
import { buildMesaUrl } from '../helpers/qr';
import { newSession, openDrawer, TEST_CPF, TEST_NAME, welcomeAs } from '../helpers/session';

async function openReasonPicker(page: Page) {
  await page.getByRole('button', { name: 'Chamar garçom' }).click();

  const waitingHeading = page.getByRole('heading', { name: /Aguardando garçom/i });
  const alreadyWaiting = await waitingHeading
    .waitFor({ state: 'visible', timeout: 1500 })
    .then(() => true)
    .catch(() => false);

  if (alreadyWaiting) {
    const cancelButton = page.getByRole('button', { name: /Cancelar chamado/i });
    if (await cancelButton.isEnabled()) {
      await cancelButton.click();
    }
    await expect(page.getByRole('button', { name: /Chamar de novo/i })).toBeEnabled();
    await page.getByRole('button', { name: /Chamar de novo/i }).click();
  }

  await expect(page.getByRole('heading', { name: /Por que você precisa do garçom/i })).toBeVisible({
    timeout: 5000,
  });
}

async function closeSheet(page: Page) {
  await page.getByRole('button', { name: 'Fechar' }).click({
    position: { x: 12, y: 12 },
  });
}

/**
 * Suite critical-path. Cada teste cobre um fluxo onde o usuario relatou
 * regressoes durante teste no iPhone real. Quando um deles vermelha, o
 * bug correspondente nao pode entrar em main sem fix.
 */

test.describe('Critical paths', () => {
  let ipCounter = 40;

  test.beforeEach(async ({ context }) => {
    // Cada teste comeca limpo — sem reuso de cookies entre specs. Usa-se
    // contexto efemero pra cada test no Playwright por padrao mas
    // sanitizamos pra garantir que tests com nome igual nao herdem state.
    await context.clearCookies();
    // /customer/welcome tem rate-limit por IP. Em uma suite local, varios
    // usuarios validos saem do mesmo localhost e viram falso positivo.
    ipCounter += 1;
    await context.setExtraHTTPHeaders({
      'x-forwarded-for': `127.77.0.${ipCounter}`,
    });
  });

  test('fresh user: QR -> welcome modal -> home com botoes', async ({ page }) => {
    await page.goto(buildMesaUrl(), { waitUntil: 'networkidle' });
    // Next dev compila a rota no primeiro hit — pode levar 10-20s no warm-up.
    // Como a recognition usa cookie+CPF, em DB compartilhado (CPF 12345678909
    // pode existir de runs anteriores) o splash pode pular pra home direto.
    // Aceitamos qualquer um dos dois estados — welcome OU home final.
    const welcomeHeading = page.getByRole('heading', {
      name: /(Pra começar, quem é você|Bem-vindo ao)/i,
    });
    const welcomeOrHome = welcomeHeading.or(page.getByRole('button', { name: 'Chamar garçom' }));
    await expect(welcomeOrHome.first()).toBeVisible({ timeout: 30_000 });

    if (await welcomeHeading.isVisible()) {
      await welcomeAs(page, TEST_NAME, TEST_CPF);
    }
    await expect(page.getByRole('button', { name: 'Chamar garçom' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver cardápio' })).toBeVisible();
  });

  test('returning user: 2a visita com cookies pula o welcome', async ({ page }) => {
    // 1a visita estabelece o recognitionToken via cookie + sessionStorage.
    await newSession(page);

    // 2a visita: mesma URL, mesma session, modal nao deve aparecer.
    await page.goto(buildMesaUrl());
    await expect(
      page.getByRole('heading', { name: /(Pra começar, quem é você|Bem-vindo ao)/i }),
    ).toBeHidden({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Chamar garçom' })).toBeVisible();
  });

  test('drawer abre e mostra itens de navegacao', async ({ page }) => {
    await newSession(page);
    await openDrawer(page);
    await expect(page.getByRole('link', { name: /Cardápio/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Meu pedido/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Assistente IA/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Pedir atendimento/ })).toBeVisible();
  });

  test('drawer mostra CTA "Voltar ao assistente" quando nao esta no /assistente', async ({
    page,
  }) => {
    await newSession(page);
    await openDrawer(page);
    await expect(page.getByRole('link', { name: /Voltar ao assistente/i })).toBeVisible();
  });

  test('chamar garcom: escolhe motivo e mostra acompanhamento', async ({ page }) => {
    await newSession(page);
    await openReasonPicker(page);
    await page.getByRole('button', { name: /Outro motivo/i }).click();
    await page.getByTestId('call-waiter-confirm').click();
    await expect(page.getByRole('heading', { name: /Aguardando garçom/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: /Cancelar chamado/i })).toBeVisible();
    await page.getByRole('button', { name: /Cancelar chamado/i }).click();
    await expect(page.getByRole('button', { name: /Chamar de novo/i })).toBeEnabled();
    await closeSheet(page);
  });

  test('cancelar chamado fecha sem trava de splash', async ({ page }) => {
    await newSession(page);
    await openReasonPicker(page);
    await page.getByRole('button', { name: /Outro motivo/i }).click();
    await page.getByTestId('call-waiter-confirm').click();
    await expect(page.getByRole('heading', { name: /Aguardando garçom/i })).toBeVisible();
    await page.getByRole('button', { name: /Cancelar chamado/i }).click();
    await expect(page.getByRole('button', { name: /Chamar de novo/i })).toBeEnabled();
    await closeSheet(page);
    await expect(page.getByText(/Preparando sua experi/i)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Chamar garçom' })).toBeVisible();
  });

  test('hard reload em /cardapio: drawer ainda funciona (sessao rehydrata)', async ({ page }) => {
    await newSession(page);
    await page.getByRole('button', { name: 'Ver cardápio' }).click();
    await expect(page).toHaveURL(/\/cardapio/);
    await page.reload();
    // Pos-reload o sessionId vem do sessionStorage bundle. Drawer so renderiza
    // se sessionId existe — entao se passar, prova que rehydrate funciona.
    await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeVisible({
      timeout: 10_000,
    });
    await openDrawer(page);
  });

  test('fechar acompanhamento volta para home', async ({ page }) => {
    await newSession(page);
    await openReasonPicker(page);
    await page.getByRole('button', { name: /Outro motivo/i }).click();
    await page.getByTestId('call-waiter-confirm').click();
    await expect(page.getByRole('heading', { name: /Aguardando garçom/i })).toBeVisible();
    await closeSheet(page);
    await expect(page.getByRole('button', { name: 'Chamar garçom' })).toBeVisible();
  });

  test('assistente: saudacao "ola" recebe resposta amigavel, nao bloqueio', async ({ page }) => {
    await newSession(page);
    await openDrawer(page);
    await page.getByRole('link', { name: /Assistente IA/ }).click();
    await expect(page).toHaveURL(/\/assistente/, { timeout: 5000 });
    await page.getByPlaceholder(/(Digite aqui|Pergunte alguma coisa)/i).fill('olá');
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    // Espera a resposta da IA aparecer (loading dots somem)
    await expect(page.locator('.animate-bounce-dot').first()).toBeHidden({ timeout: 15_000 });
    // NAO deve mostrar mensagem de bloqueio
    await expect(page.getByText(/só posso ajudar com assuntos do restaurante/i)).toBeHidden({
      timeout: 3000,
    });
  });
});
