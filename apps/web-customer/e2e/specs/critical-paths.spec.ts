import { test, expect } from '@playwright/test';
import { buildMesaUrl } from '../helpers/qr';
import {
  newSession,
  openDrawer,
  TEST_CPF,
  TEST_NAME,
  welcomeAs,
} from '../helpers/session';

/**
 * Suite critical-path. Cada teste cobre um fluxo onde o usuario relatou
 * regressoes durante teste no iPhone real. Quando um deles vermelha, o
 * bug correspondente nao pode entrar em main sem fix.
 */

test.describe('Critical paths', () => {
  test.beforeEach(async ({ context }) => {
    // Cada teste comeca limpo — sem reuso de cookies entre specs. Usa-se
    // contexto efemero pra cada test no Playwright por padrao mas
    // sanitizamos pra garantir que tests com nome igual nao herdem state.
    await context.clearCookies();
  });

  test('fresh user: QR -> welcome modal -> home com botoes', async ({ page }) => {
    await page.goto(buildMesaUrl(), { waitUntil: 'networkidle' });
    // Next dev compila a rota no primeiro hit — pode levar 10-20s no warm-up.
    // Como a recognition usa cookie+CPF, em DB compartilhado (CPF 12345678909
    // pode existir de runs anteriores) o splash pode pular pra home direto.
    // Aceitamos qualquer um dos dois estados — welcome OU home final.
    const welcomeOrHome = page.getByRole('heading', { name: /Bem-vindo ao/i }).or(
      page.getByRole('button', { name: 'Chamar garçom' }),
    );
    await expect(welcomeOrHome.first()).toBeVisible({ timeout: 30_000 });

    if (await page.getByRole('heading', { name: /Bem-vindo ao/i }).isVisible()) {
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
      page.getByRole('heading', { name: /Bem-vindo ao/i }),
    ).toBeHidden({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Chamar garçom' })).toBeVisible();
  });

  test('drawer abre e mostra itens de navegacao', async ({ page }) => {
    await newSession(page);
    await openDrawer(page);
    await expect(page.getByRole('link', { name: /Cardápio/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Meu pedido/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Assistente IA/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Chamar garçom/ })).toBeVisible();
  });

  test('drawer mostra CTA "Voltar ao assistente" quando nao esta no /assistente', async ({ page }) => {
    await newSession(page);
    await openDrawer(page);
    await expect(
      page.getByRole('link', { name: /Voltar ao assistente/i }),
    ).toBeVisible();
  });

  test('chamar garcom: tap em "Chamar agora" navega pra /chamando com Rodrigo', async ({ page }) => {
    await newSession(page);
    await page.getByRole('button', { name: 'Chamar garçom' }).click();
    // Bottom sheet sobe, "Chamar agora" visivel.
    await expect(page.getByRole('button', { name: /Chamar agora/i })).toBeVisible({
      timeout: 5000,
    });
    await page.getByRole('button', { name: /Chamar agora/i }).click();
    await expect(page).toHaveURL(/\/garcom\/chamando/, { timeout: 10_000 });
    await expect(page.getByText(/CHAMADO RECEBIDO/i)).toBeVisible();
  });

  test('cancelar chamado leva pro /assistente sem trava de splash', async ({ page }) => {
    await newSession(page);
    await page.getByRole('button', { name: 'Chamar garçom' }).click();
    await page.getByRole('button', { name: /Chamar agora/i }).click();
    await expect(page).toHaveURL(/\/garcom\/chamando/);
    await page.getByRole('button', { name: /Cancelar chamado/i }).click();
    await expect(page).toHaveURL(/\/assistente/, { timeout: 10_000 });
    await expect(page.getByText(/Preparando sua experi/i)).toBeHidden();
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

  test('topbar tem botao "Voltar" em /chamando que volta pro assistente', async ({ page }) => {
    await newSession(page);
    await page.getByRole('button', { name: 'Chamar garçom' }).click();
    await page.getByRole('button', { name: /Chamar agora/i }).click();
    await expect(page).toHaveURL(/\/garcom\/chamando/);
    // Topbar tem botao com aria-label "Voltar" quando onBack e passado.
    await page.getByRole('button', { name: 'Voltar' }).click();
    await expect(page).toHaveURL(/\/assistente/, { timeout: 10_000 });
  });

  test('assistente: saudacao "ola" recebe resposta amigavel, nao bloqueio', async ({ page }) => {
    await newSession(page);
    await openDrawer(page);
    await page.getByRole('link', { name: /Assistente IA/ }).click();
    await expect(page).toHaveURL(/\/assistente/, { timeout: 5000 });
    await page.getByPlaceholder('Digite aqui').fill('olá');
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    // Espera a resposta da IA aparecer (loading dots somem)
    await expect(page.locator('.animate-bounce-dot').first()).toBeHidden({ timeout: 15_000 });
    // NAO deve mostrar mensagem de bloqueio
    await expect(
      page.getByText(/só posso ajudar com assuntos do restaurante/i),
    ).toBeHidden({ timeout: 3000 });
  });
});
