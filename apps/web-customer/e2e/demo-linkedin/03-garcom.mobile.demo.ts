import { test } from '@playwright/test';
import { beat, settle, smoothScroll, softClick } from './cine';
import { loginStaff } from './staff';

/**
 * Demo — garçom (mobile). É a tela que fica na mão de quem está andando pelo
 * salão: chamados de mesa e entregas em trânsito.
 */
test('garcom: chamados e entregas', async ({ page }) => {
  test.setTimeout(180_000);

  await loginStaff(page, 'waiter');
  await beat(page, 2800);

  await smoothScroll(page, 500);
  await beat(page, 1400);

  for (const aba of [/chamados?/i, /entregas?/i, /mesas/i, /mensagens/i]) {
    const foi = await softClick(
      page,
      page.getByRole('link', { name: aba }).or(page.getByRole('button', { name: aba })),
      String(aba),
    );
    if (foi) {
      await settle(page, 1800);
      await smoothScroll(page, 400);
      await beat(page, 1400);
    }
  }

  await beat(page, 2000);
});
