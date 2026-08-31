import { expect, test } from '@playwright/test';

/**
 * Beco sem saída pós-rejeição (bug 2026-08-29, iPhone real):
 * bundle reidratado no sessionStorage + participante 'rejected' caía em
 * pageState 'error' SEM nunca consumir as credenciais frescas (hmac/ts) de um
 * re-scan do QR físico na mesma aba — só fechar a aba destravava.
 *
 * Este spec roda 100% mockado (page.route) contra o dev server da worktree:
 * nada aqui toca o Postgres compartilhado nem as mesas QRTEST91/92.
 */

const SLUG = 'restaurant_dev';
const TABLE = 'M7';
const API = 'http://localhost:3001/api';

const REJECTED_CUSTOMER = '33333333-3333-4333-8333-333333333333';

const bundle = {
  sessionId: '22222222-2222-4222-8222-222222222222',
  tableCode: TABLE,
  tableLabel: 'Mesa 7',
  slug: SLUG,
  customerId: REJECTED_CUSTOMER,
  visitId: '44444444-4444-4444-8444-444444444444',
  customerName: 'Bia',
  isReturning: false,
};

function participantsBody(status: 'rejected' | 'approved') {
  return {
    participants: [
      {
        customerId: REJECTED_CUSTOMER,
        name: 'Bia',
        initial: 'B',
        color: '#000',
        status,
        isHost: status === 'approved',
      },
    ],
  };
}

async function seedRehydratedTab(page: import('@playwright/test').Page) {
  await page.addInitScript((seed) => {
    window.sessionStorage.setItem('session:bundle', JSON.stringify(seed));
    window.sessionStorage.setItem('session_token', 'opaque-rehydrated-token');
  }, bundle);
}

test.describe('participante rejeitado · recuperação por re-scan', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    // Fallback para rotas de suporte (events, courtesies, zone-pause...):
    // registrado primeiro = menor precedência no Playwright.
    await page.route(`${API}/${SLUG}/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );
    await page.route(`${API}/${SLUG}/settings/public`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          restaurantName: 'Bistro Dev',
          colorAccent: '#000000',
          fontHero: 'Inter',
          fontBody: 'Inter',
          logoUrl: null,
        }),
      }),
    );
    await page.route(`${API}/${SLUG}/home`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          heroMessage: 'Olá de novo, Bia! Mesa liberada.',
          restaurantName: 'Bistro Dev',
          tableLabel: 'Mesa 7',
          highlights: [],
          isReturning: false,
          lastVisitSummary: null,
        }),
      }),
    );
  });

  test('rejeitado com QR fresco na URL descarta o bundle e re-bootstrapa', async ({ page }) => {
    test.slow(); // primeira compilação do next dev a frio
    await seedRehydratedTab(page);

    let initCalled = false;
    // Antes do re-bootstrap o participante segue rejected; a sessão NOVA
    // criada pelo init o devolve como primeiro participante aprovado.
    await page.route(`${API}/${SLUG}/table/participants`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(participantsBody(initCalled ? 'approved' : 'rejected')),
      }),
    );
    await page.route(`${API}/${SLUG}/session/init`, (route) => {
      initCalled = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessionId: '55555555-5555-4555-8555-555555555555',
          tableCode: TABLE,
          tableLabel: 'Mesa 7',
          token: 'fresh-session-token',
        }),
      });
    });
    await page.route(`${API}/${SLUG}/customer/recognize`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          customerId: REJECTED_CUSTOMER,
          visitId: '66666666-6666-4666-8666-666666666666',
          name: 'Bia',
          recognitionToken: 'recognition-token',
          isReturning: true,
        }),
      }),
    );

    await page.goto(`/${SLUG}/mesa/${TABLE}?hmac=fresh-secret&ts=1756400000`);

    // O beco antigo: "O host da mesa não autorizou..." + reload inútil.
    // Com o fix, o scan fresco re-bootstrapa e chega na home.
    await expect(page.getByText('Olá de novo, Bia! Mesa liberada.')).toBeVisible({
      timeout: 20_000,
    });
    expect(initCalled).toBe(true);
    await expect(page.getByText('O host da mesa não autorizou sua entrada.')).toHaveCount(0);
  });

  test('rejeitado sem QR fresco mantém erro fail-closed com CTA honesto de re-scan', async ({
    page,
  }) => {
    await seedRehydratedTab(page);

    let initCalled = false;
    await page.route(`${API}/${SLUG}/table/participants`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(participantsBody('rejected')),
      }),
    );
    await page.route(`${API}/${SLUG}/session/init`, (route) => {
      initCalled = true;
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    });

    await page.goto(`/${SLUG}/mesa/${TABLE}`);

    await expect(
      page.getByText('O host da mesa não autorizou sua entrada. Tente outra mesa ou peça ao garçom.'),
    ).toBeVisible({ timeout: 20_000 });
    // Rejeição é decisão terminal: sem botão de reload mentiroso, só o
    // caminho real (novo scan físico).
    await expect(page.getByRole('button', { name: 'Tentar novamente' })).toHaveCount(0);
    await expect(page.getByText('Escaneie o QR Code da mesa para tentar de novo.')).toBeVisible();
    expect(initCalled).toBe(false);
  });
});
