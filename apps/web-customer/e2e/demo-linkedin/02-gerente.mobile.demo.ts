import { test } from '@playwright/test';
import { beat, settle, smoothScroll, softClick } from './cine';
import { loginStaff } from './staff';

/**
 * Demo — gerente (mobile). Entra por CPF+PIN e passeia pelas seções da tab
 * bar: Painel (fila de ação ao vivo) → Operação → Equipe → Financeiro.
 */
test('gerente: painel ao vivo e operação', async ({ page }) => {
  test.setTimeout(180_000);

  await loginStaff(page, 'manager');
  await beat(page, 2600); // painel com "AGIR AGORA" e a fila em curso

  await smoothScroll(page, 500);
  await smoothScroll(page, 500);
  await beat(page, 1200);

  for (const aba of [/opera[çc][ãa]o/i, /equipe/i, /financeiro/i]) {
    const foi = await softClick(
      page,
      page.getByRole('link', { name: aba }).or(page.getByRole('button', { name: aba })),
      String(aba),
    );
    if (foi) {
      await settle(page, 2000);
      await smoothScroll(page, 450);
      await beat(page, 1500);
    }
  }

  await beat(page, 2000);
});
