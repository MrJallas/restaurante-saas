import { test } from '@playwright/test';
import { buildMesaUrl, liberateQrTestTable } from '../helpers/qr';
import { beat, settle, softClick, swipe } from './cine';

/**
 * Demo — o cardápio (mobile). Separado da jornada completa porque é a tela
 * que mais depende das fotos: vale um vídeo só dela, percorrendo as
 * categorias devagar.
 */
test('cardapio: fotos e categorias', async ({ page }) => {
  test.setTimeout(180_000);

  await liberateQrTestTable().catch(() => {});
  await page.goto(buildMesaUrl(), { waitUntil: 'domcontentloaded' });
  await settle(page, 2500);

  // Pula o welcome se aparecer (sessão nova).
  const nome = page.getByLabel(/seu nome/i).or(page.locator('input').first());
  if (await nome.isVisible().catch(() => false)) {
    await nome.fill('Caleb Medeiros');
    const cpf = page.getByLabel(/seu cpf/i).or(page.locator('input[inputmode="numeric"]').first());
    await cpf.fill('12345678909');
    await beat(page, 600);
    await softClick(page, page.getByRole('button', { name: /continuar|entrar|começar|→/i }), 'welcome');
    await settle(page, 2200);
  }

  await beat(page, 1500);

  // Na home o chip se chama só "Cardápio"; vira "Ver cardápio" depois que a
  // conversa começa. Tenta os dois, com espera por habilitar.
  const abriu =
    (await softClick(page, page.getByRole('button', { name: /^cardápio$/i }), 'Cardápio', 20_000)) ||
    (await softClick(page, page.getByRole('button', { name: /ver cardápio/i }), 'Ver cardápio', 20_000));

  if (!abriu) {
    await page.goto(`${page.url().split('/mesa/')[0]}/cardapio`, { waitUntil: 'domcontentloaded' });
  }
  await settle(page, 2500);

  // O cardápio é um bottom-sheet arrastável: primeiro puxa pra cima pra
  // expandir, depois percorre a lista. Scroll programático não funciona aqui
  // (não há container com overflow) — só gesto de toque.
  await swipe(page, -240, 22, 195, 540);
  await beat(page, 1200);

  for (let i = 0; i < 7; i += 1) {
    await swipe(page, -300, 16, 195, 520);
    await beat(page, 850);
  }

  // Volta ao topo e abre um item pra mostrar a foto grande.
  for (let i = 0; i < 4; i += 1) await swipe(page, 340, 12, 195, 220);
  await beat(page, 900);
  await softClick(page, page.getByText(/Picanha Fatiada|Pudim da Casa/i).first(), 'item do cardápio');
  await beat(page, 3200);
});
