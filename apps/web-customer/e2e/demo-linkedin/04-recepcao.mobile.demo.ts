import { test } from '@playwright/test';
import { beat, settle, smoothScroll, softClick } from './cine';
import { loginStaff } from './staff';

/**
 * Demo — recepção / host (mobile). Controla a porta: mapa de mesas, fila de
 * espera, reservas e aprovação de quem escaneou o QR físico.
 */
test('recepcao: mesas, fila e reservas', async ({ page }) => {
  test.setTimeout(180_000);

  await loginStaff(page, 'host');
  await beat(page, 2800);

  await smoothScroll(page, 500);
  await beat(page, 1400);

  for (const aba of [/mesas/i, /fila|espera|waitlist/i, /reservas?/i]) {
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
