import { test } from '@playwright/test';
import { buildMesaUrl, liberateQrTestTable } from '../helpers/qr';
import { beat, settle, smoothScroll, softClick, typeSlow } from './cine';

/**
 * Demo — jornada do cliente (mobile / iPhone 14 / WebKit).
 *
 * Roteiro: chega pela mesa via QR → é recebido pelo assistente → conversa →
 * abre o cardápio → monta o pedido. É o fluxo que o cliente real faz sentado
 * na mesa, no engine que o app roda de verdade (Safari iOS).
 */

const NOME = 'Caleb Medeiros';
const CPF = '12345678909'; // fixture com DV válido, já usado pela suíte E2E

test('cliente: do QR ao pedido', async ({ page }) => {
  test.setTimeout(180_000);

  await liberateQrTestTable().catch(() => {});

  // 1. Chegada pela mesa — o resolver do QR redireciona pra sessão da mesa.
  await page.goto(buildMesaUrl(), { waitUntil: 'domcontentloaded' });
  await settle(page, 2200);

  // 2. Welcome, quando é a primeira vez naquela sessão.
  const welcome = page.getByRole('heading', { name: /(Pra começar, quem é você|Bem-vindo ao)/i });
  const temWelcome = await welcome
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false);

  if (temWelcome) {
    console.log('  · welcome visível — preenchendo');
    await beat(page, 1400);
    const nome = page.getByLabel(/seu nome/i).or(page.locator('input').first());
    await typeSlow(nome, NOME);
    await beat(page, 700);
    const cpf = page.getByLabel(/seu cpf/i).or(page.locator('input[inputmode="numeric"]').first());
    await typeSlow(cpf, CPF, 35);
    await beat(page, 900);
    await softClick(page, page.getByRole('button', { name: /continuar|entrar|começar|→/i }), 'CTA welcome');
    await settle(page, 2000);
  } else {
    console.log('  · sessão já reconhecida — home direto');
  }

  // 3. Home: o assistente cumprimenta com contexto (continuation API).
  await beat(page, 2600);

  // 4. Conversa: pede indicação ao assistente.
  const campo = page
    .getByPlaceholder(/digite aqui/i)
    .or(page.getByRole('textbox').last());

  const temChat = await campo
    .waitFor({ state: 'visible', timeout: 6000 })
    .then(() => true)
    .catch(() => false);

  if (temChat) {
    await typeSlow(campo, 'quero algo pra dividir em dois');
    await beat(page, 800);
    await page.keyboard.press('Enter');

    // Enquanto o serviço de IA responde, a UI desabilita os chips e o input.
    // Esperar o "Ver cardápio" voltar a habilitar é o sinal confiável de que a
    // resposta chegou — melhor que um sleep fixo, e mostra a UI honesta no vídeo.
    await page
      .getByRole('button', { name: /ver cardápio/i })
      .first()
      .waitFor({ state: 'visible', timeout: 45_000 })
      .catch(() => {});
    await page
      .waitForFunction(
        () => {
          const b = Array.from(document.querySelectorAll('button')).find((x) =>
            /ver cardápio/i.test(x.textContent || ''),
          );
          return b ? !(b as HTMLButtonElement).disabled : false;
        },
        undefined,
        { timeout: 45_000 },
      )
      .catch(() => console.log('  · IA demorou além do limite — seguindo'));

    await beat(page, 2600); // deixa a resposta na tela tempo de ser lida
    await smoothScroll(page, 260);
  } else {
    console.log('  · campo de chat não encontrado — seguindo pro cardápio');
  }

  // 5. Cardápio.
  const abriuCardapio =
    (await softClick(page, page.getByRole('button', { name: /ver cardápio/i }), 'Ver cardápio')) ||
    (await softClick(page, page.getByRole('button', { name: /^cardápio$/i }), 'chip Cardápio')) ||
    (await softClick(page, page.getByRole('link', { name: /cardápio/i }), 'link Cardápio'));

  if (abriuCardapio) {
    await settle(page, 1800);
    await smoothScroll(page, 700);
    await smoothScroll(page, 700);
    await beat(page, 1000);

    // 6. Abre um item e adiciona ao pedido.
    const item = page.getByText(/Filé Mignon|Carpaccio|Nhoque|Lasanha/i).first();
    if (await softClick(page, item, 'item do cardápio')) {
      await beat(page, 1800);
      await softClick(
        page,
        page.getByRole('button', { name: /adicionar|pedir|confirmar/i }),
        'adicionar ao pedido',
      );
      await beat(page, 2200);
    }
  }

  // 7. Fecha com um respiro na tela final.
  await beat(page, 2500);
});
