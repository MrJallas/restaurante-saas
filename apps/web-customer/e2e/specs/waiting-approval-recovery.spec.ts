import { expect, test } from '@playwright/test';

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const STATUS_URL = `**/api/restaurant_dev/late-arrival-requests/${REQUEST_ID}/status`;

function requestBody(status: 'pending' | 'approved' | 'rejected' | 'expired') {
  return {
    id: REQUEST_ID,
    tableSessionId: '22222222-2222-4222-8222-222222222222',
    tableNumber: 7,
    requestingCustomerId: '33333333-3333-4333-8333-333333333333',
    requesterName: 'Bia',
    status,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    respondedAt: status === 'pending' ? null : new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

test.describe('waiting-approval · recuperação autoritativa', () => {
  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.addInitScript(() => window.sessionStorage.clear());
  });

  test('deep-link frio consulta REST, ignora prazo inventado da URL e reage à decisão', async ({
    page,
  }) => {
    let status: 'pending' | 'approved' = 'pending';
    await page.route(STATUS_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(requestBody(status)),
      }),
    );

    await page.goto(
      `/restaurant_dev/waiting-approval?mode=late-arrival&requestId=${REQUEST_ID}&expiresAt=2000-01-01T00%3A00%3A00.000Z`,
    );

    await expect(page.getByRole('heading', { name: 'Esperando aprovação' })).toBeVisible();
    await expect(page.getByText(/Aguardando host da mesa · [1-9][0-9]? s/)).toBeVisible();

    status = 'approved';
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('heading', { name: 'Aprovado!' })).toBeVisible();
  });

  test('sem sessão/ownership mostra recuperação acionável em vez de waiting falso', async ({
    page,
  }) => {
    await page.route(STATUS_URL, (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Pedido de entrada nao encontrado.', statusCode: 404 }),
      }),
    );

    await page.goto(`/restaurant_dev/waiting-approval?mode=late-arrival&requestId=${REQUEST_ID}`);

    await expect(page.getByRole('heading', { name: 'Não consegui confirmar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Esperando aprovação' })).toHaveCount(0);
  });
});
