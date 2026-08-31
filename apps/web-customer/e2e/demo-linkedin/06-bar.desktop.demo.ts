import { test } from '@playwright/test';
import { beat, settle, smoothScroll } from './cine';
import { loginStaff, STAFF_URL } from './staff';

/**
 * Demo — bar (desktop). Mesma ideia do KDS da cozinha, mas a estação do bar
 * enxerga só os itens de bebida. O estágio vem de `order_items`, não do
 * status agregado do pedido — é o que permite as duas estações andarem em
 * ritmos diferentes no mesmo pedido.
 */
test('bar: estacao de bebidas', async ({ page }) => {
  test.setTimeout(180_000);

  // O bar é individual por staff_token; entramos pelo mesmo login e trocamos
  // de rota (o seed não tem um bartender dedicado).
  await loginStaff(page, 'cook');
  await page.goto(`${STAFF_URL}/bar`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2500);

  await beat(page, 4000);
  await smoothScroll(page, 400);
  await beat(page, 3000);
});
