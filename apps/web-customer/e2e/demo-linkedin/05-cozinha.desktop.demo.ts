import { test } from '@playwright/test';
import { beat, settle, smoothScroll } from './cine';
import { loginStaff } from './staff';

/**
 * Demo — KDS da cozinha (desktop). Único formato landscape junto com o bar:
 * é a tela que fica pendurada na parede da cozinha, não vai pra celular.
 *
 * O board tem quatro colunas de estágio (Novos · Preparando · Prontos · Em
 * trânsito) e recebe pedido por WebSocket, sem refresh.
 */
test('cozinha: KDS por estagio', async ({ page }) => {
  test.setTimeout(180_000);

  await loginStaff(page, 'cook');
  await settle(page, 2500);

  // Respira no board completo — é o frame que mostra o produto inteiro.
  await beat(page, 4000);
  await smoothScroll(page, 400);
  await beat(page, 3000);
});
