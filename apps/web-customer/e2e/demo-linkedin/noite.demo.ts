import { test, devices, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { beat, esconderDevTools, settle, softClick, swipe } from './cine';
import { Relogio, Barreira } from './sincronia';
import { conferirGuarda, cpfNovo, escolherTurno, resetarEstado } from './preparar-noite';

/**
 * "Noite cheia" — quatro personas gravando ao mesmo tempo.
 *
 * O vídeo existe para provar SIMULTANEIDADE: uma ação numa tela aparece em
 * outra, sem ninguém tocar na segunda. As quatro reações cruzadas que o
 * roteiro persegue:
 *
 *   R1  cliente escaneia o QR      → card nasce sozinho na RECEPÇÃO
 *   R2  recepção aprova            → celular do cliente destrava na hora
 *   R3  cliente confirma o pedido  → card entra em NOVOS no KDS, com a
 *                                     observação que ele digitou, legível
 *   R4  mesa ocupa                 → acende no MAPA do gerente
 *
 * Cada persona grava seu próprio vídeo; o grid 2x2 é montado depois. Por isso
 * todos abrem juntos (claquete), respeitam marcas de tempo ABSOLUTAS e fecham
 * no mesmo Promise.all — vídeo do Playwright só é escrito no close, e durações
 * diferentes desalinham o mosaico.
 */

const OUT = process.env.DEMO_NOITE_DIR || '/Users/calebmedeiros/meus_projetos/.demo-videos/noite';
const STAFF = 'http://localhost:3002';
const CLIENTE = 'http://localhost:3003';
const API = 'http://localhost:3001/api';
const PIN = '1234';

const VIEW_MOBILE = { width: 390, height: 844 };
const VIEW_KDS = { width: 1280, height: 800 };

const relogio = new Relogio();
const bHostPronta = new Barreira('recepção aberta e ociosa');
const bAprovado = new Barreira('cliente aprovado pela recepção');
const bPedidoFeito = new Barreira('pedido confirmado pelo cliente');
const bEscaneou = new Barreira('cliente enviou o welcome (scan criado)');

async function logaStaff(page: Page, cpf: string, rota: string) {
  await page.goto(`${STAFF}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* ok */ }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('90000000001').fill(cpf);
  await page.locator('input[type=password]').first().fill(PIN);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(`**${rota}**`, { timeout: 30_000 }).catch(() => {});
  await settle(page, 1200);
}

test('noite cheia: quatro telas ao mesmo tempo', async ({ playwright }) => {
  test.setTimeout(15 * 60_000);

  // ---------------------------------------------------------------- preparo
  console.log('\n▸ preparando o estado da noite');
  resetarEstado();
  const turno = escolherTurno();
  const guarda = conferirGuarda('QRTEST91');
  console.log(`  guarda mesa 91: ${guarda.valores} ${guarda.ok ? '✓' : '✗ ENVENENADA'}`);
  if (!guarda.ok) {
    throw new Error(
      `mesa 91 não está limpa (${guarda.valores}). Sessão ativa ou release válida faz o ` +
        `cliente entrar aprovado direto e a tela de espera — o coração do vídeo — não aparece.`,
    );
  }

  const webkit = await playwright.webkit.launch();
  const chromium = await playwright.chromium.launch();

  const ctxCliente = await webkit.newContext({
    ...devices['iPhone 14'],
    geolocation: { latitude: -23.561, longitude: -46.655 },
    permissions: ['geolocation'],
    recordVideo: { dir: path.join(OUT, 'cliente'), size: VIEW_MOBILE },
  });
  const ctxClienteB = await webkit.newContext({
    ...devices['iPhone 14'],
    geolocation: { latitude: -23.561, longitude: -46.655 },
    permissions: ['geolocation'],
  }); // ator de apoio: não grava, só existe para o split ter 2 participantes

  const ctxGerente = await chromium.newContext({
    viewport: VIEW_MOBILE, hasTouch: true, isMobile: false,
    recordVideo: { dir: path.join(OUT, 'gerente'), size: VIEW_MOBILE },
  });
  const ctxRecepcao = await chromium.newContext({
    viewport: VIEW_MOBILE, hasTouch: true, isMobile: false,
    recordVideo: { dir: path.join(OUT, 'recepcao'), size: VIEW_MOBILE },
  });
  const ctxCozinha = await chromium.newContext({
    viewport: VIEW_KDS,
    recordVideo: { dir: path.join(OUT, 'cozinha'), size: VIEW_KDS },
  });

  const todos: BrowserContext[] = [ctxCliente, ctxGerente, ctxRecepcao, ctxCozinha];
  const [pCliente, pClienteB, pGerente, pRecepcao, pCozinha] = await Promise.all([
    ctxCliente.newPage(), ctxClienteB.newPage(), ctxGerente.newPage(),
    ctxRecepcao.newPage(), ctxCozinha.newPage(),
  ]);

  // Tira o badge do Next Dev Tools e o toast "Compiling…" do quadro.
  await Promise.all(
    [pCliente, pClienteB, pGerente, pRecepcao, pCozinha].map((p) => esconderDevTools(p)),
  );

  // Claquete: única marca visual comum. O Playwright não garante que as quatro
  // gravações comecem no mesmo instante — sem um frame de referência não há
  // como alinhar o grid na montagem.
  const claquete = 'data:text/html,<body style="margin:0;background:%23111"></body>';
  await Promise.all([pCliente, pGerente, pRecepcao, pCozinha].map((p) => p.goto(claquete)));
  await beat(pCliente, 800);
  relogio.zerar();
  console.log('▸ t=0 (claquete)\n');

  const nomeA = 'Caleb Medeiros';
  const cpfA = cpfNovo();
  const cpfB = cpfNovo();

  // ------------------------------------------------------------ 1. GERENTE
  const gerente = async () => {
    await relogio.ate(3, 'gerente');
    await logaStaff(pGerente, '90000000001', '/manager');
    await beat(pGerente, 1500);

    // Equipe → estado ANTES (os KPIs vão mudar depois da escala; é o "antes")
    await relogio.ate(22, 'gerente');
    await softClick(pGerente, pGerente.getByRole('button', { name: 'Equipe' }), 'aba Equipe', 12_000);
    await settle(pGerente, 1800);
    await softClick(pGerente, pGerente.getByRole('button', { name: /^Garçons/ }), 'filtro Garçons');
    await beat(pGerente, 1500);

    // Escala do turno
    await relogio.ate(40, 'gerente');
    await pGerente.goto(`${STAFF}/manager/equipe/turnos?slug=restaurant_dev`, { waitUntil: 'domcontentloaded' });
    await settle(pGerente, 2000);

    const cardTurno = pGerente.getByText(new RegExp(turno.label, 'i')).first();
    await cardTurno.scrollIntoViewIfNeeded().catch(() => {});
    await beat(pGerente, 1200);

    for (const nome of ['Ana Garcom', 'Bruno Garcom', 'Carlos Cozinha']) {
      const add = pGerente.getByText('Adicionar funcionário a este turno').first();
      if (!(await softClick(pGerente, add, `abrir escala (${nome})`, 8000))) break;
      await beat(pGerente, 700);
      const candidato = pGerente.getByText(nome, { exact: false }).last();
      await softClick(pGerente, candidato, nome, 6000);
      // "Adicionar" existe uma vez por candidato — escopar para não dar strict mode
      await softClick(pGerente, pGerente.getByRole('button', { name: /^Adicionar$/ }).first(), 'confirmar', 6000);
      await beat(pGerente, 900);
    }

    // Zona (a unidade real de atribuição — não existe mesa→garçom no produto)
    await relogio.ate(95, 'gerente');
    await pGerente.goto(`${STAFF}/manager/equipe?slug=restaurant_dev`, { waitUntil: 'domcontentloaded' });
    await settle(pGerente, 1800);
    for (let i = 0; i < 5; i += 1) await swipe(pGerente, -260, 14, 195, 500);
    await beat(pGerente, 1200);

    for (const [zona, garcom] of [['Salão Principal', 'Ana Garcom'], ['Varanda', 'Bruno Garcom']]) {
      const combo = pGerente.getByRole('combobox', { name: new RegExp(zona, 'i') }).first();
      if (await combo.isVisible().catch(() => false)) {
        await combo.selectOption({ label: garcom }).catch(() => {});
        await beat(pGerente, 700);
        const atribuir = combo.locator('xpath=../..').getByRole('button', { name: /Atribuir/i }).first();
        await softClick(pGerente, atribuir, `atribuir ${garcom} → ${zona}`, 6000);
        // espera o chip REAL (a UI é otimista: entra com id temp- antes do POST resolver)
        await pGerente
          .getByLabel(new RegExp(`Remover ${garcom}`, 'i'))
          .first()
          .waitFor({ state: 'visible', timeout: 8000 })
          .catch(() => console.log(`  ⚠ chip de ${garcom} não confirmou`));
        await beat(pGerente, 900);
      }
    }

    // Mapa — fica parado aqui para a mesa acender ao vivo (R4)
    await relogio.ate(112, 'gerente');
    await pGerente.goto(`${STAFF}/manager/operacoes?slug=restaurant_dev`, { waitUntil: 'domcontentloaded' });
    await settle(pGerente, 1500);
    await softClick(pGerente, pGerente.getByRole('button', { name: /^Mapa$/i }), 'aba Mapa', 8000);
    await beat(pGerente, 2000);

    await bAprovado.espera(90_000);
    await beat(pGerente, 3000);
    await pGerente.reload({ waitUntil: 'domcontentloaded' }); // R4 em quadro
    await settle(pGerente, 2000);
    await softClick(pGerente, pGerente.getByRole('button', { name: /^Mapa$/i }), 'Mapa (pós)', 8000);
    await beat(pGerente, 4000);

    await bPedidoFeito.espera(180_000);
    await relogio.ate(330, 'gerente');
    await pGerente.goto(`${STAFF}/manager?slug=restaurant_dev`, { waitUntil: 'domcontentloaded' });
    await settle(pGerente, 2500);
  };

  // ----------------------------------------------------------- 2. RECEPÇÃO
  const recepcao = async () => {
    await relogio.ate(3, 'recepcao');
    await logaStaff(pRecepcao, '90000000002', '/host');
    await settle(pRecepcao, 2000);
    await beat(pRecepcao, 2500);
    bHostPronta.libera(); // só agora o cliente pode escanear (TTL de 60s)

    // Ociosa: o card tem que nascer sozinho em quadro (R1).
    // Espera o SINAL do cliente antes de cronometrar: sem isso a recepção
    // esgota o timeout antes de o cliente sequer escanear (ele só age em
    // t=120s) e desiste de um card que ainda vai aparecer.
    await bEscaneou.espera(180_000);

    // O título da seção ("VERIFICAR MESA ESCANEADA") é só texto — clicar nele
    // não navega. O alvo é o CARTÃO verde inteiro, que é o elemento clicável
    // com a seta. Filtrar por "VERIFICAR PRESENÇA" (que só existe nele) evita
    // pegar a mesa 91 na lista "Pra liberar".
    const rotulo = pRecepcao.getByText(/VERIFICAR MESA ESCANEADA/i).first();
    await rotulo.waitFor({ state: 'visible', timeout: 45_000 }).catch(() =>
      console.log('  ⚠ card de verificação não apareceu na recepção'),
    );
    await beat(pRecepcao, 2500); // deixa o card respirar em quadro

    const card = pRecepcao
      .locator('a, button, [role=button]')
      .filter({ hasText: /VERIFICAR PRESEN/i })
      .first();
    if (!(await softClick(pRecepcao, card, 'abrir verificação', 10_000))) {
      // fallback: o cartão pode ser um container clicável sem role acessível
      await pRecepcao.getByText(/Mesa 91 ·/).first().click({ timeout: 8000 }).catch(() => {});
      await settle(pRecepcao, 1500);
    }
    await settle(pRecepcao, 1500);
    await beat(pRecepcao, 2500); // o contador regressivo é o suspense — mostra

    const aprovar = pRecepcao.getByRole('button', { name: /Aprovar entrada/i }).first();
    if (await softClick(pRecepcao, aprovar, 'Aprovar entrada', 10_000)) {
      bAprovado.libera();
    } else {
      console.log('  ⚠ não consegui aprovar — liberando barreira para não travar o take');
      bAprovado.libera();
    }
    await settle(pRecepcao, 2000);
    await beat(pRecepcao, 3000); // contadores mudam: 14 livres → 13, 0 em uso → 1

    await bPedidoFeito.espera(180_000);
    await relogio.ate(330, 'recepcao');
    await pRecepcao.goto(`${STAFF}/host`, { waitUntil: 'domcontentloaded' });
    await settle(pRecepcao, 2000);
  };

  // ------------------------------------------------------------ 3. COZINHA
  const cozinha = async () => {
    await relogio.ate(3, 'cozinha');
    await logaStaff(pCozinha, '90000000004', '/cozinha');
    await settle(pCozinha, 2000);
    await beat(pCozinha, 3000); // frame do "antes": quatro colunas vazias

    // Fica parada: o card tem que ENTRAR em quadro sozinho (R3)
    await bPedidoFeito.espera(300_000);
    const novo = pCozinha.getByRole('button', { name: /Preparar/i }).first();
    await novo.waitFor({ state: 'visible', timeout: 60_000 }).catch(() =>
      console.log('  ⚠ card não entrou no KDS'),
    );
    await beat(pCozinha, 4000); // deixa ler a observação do cliente no card

    await softClick(pCozinha, novo, 'Preparar', 10_000);
    await beat(pCozinha, 3500);
    await softClick(pCozinha, pCozinha.getByRole('button', { name: /Pronto/i }).first(), 'Pronto!', 10_000);
    await beat(pCozinha, 4000);
  };

  // ------------------------------------------------------------- 4. CLIENTE
  const cliente = async () => {
    await bHostPronta.espera(60_000);
    await relogio.ate(120, 'cliente');

    await pCliente.goto(`${API}/qr/qrtest91-public-token-fixed`, { waitUntil: 'domcontentloaded' });
    await settle(pCliente, 2500);

    // Welcome — a partir do submit nascem 60s de TTL do scan
    const nome = pCliente.getByLabel(/seu nome/i).or(pCliente.locator('input').first());
    if (await nome.isVisible().catch(() => false)) {
      await nome.pressSequentially(nomeA, { delay: 60 });
      await beat(pCliente, 600);
      const cpf = pCliente.getByLabel(/seu cpf/i).or(pCliente.locator('input[inputmode="numeric"]').first());
      await cpf.pressSequentially(cpfA, { delay: 45 });
      await beat(pCliente, 800);
      await softClick(pCliente, pCliente.getByRole('button', { name: /continuar|entrar|começar|→/i }), 'Continuar');
      bEscaneou.libera(); // nasce aqui o TTL de 60s do scan_verification
    }

    // Tela de espera — o coração do vídeo
    await settle(pCliente, 1500);
    await beat(pCliente, 2500);

    await bAprovado.espera(90_000);
    await settle(pCliente, 2500);
    await beat(pCliente, 2500); // já está na home da mesa (transição é seca, sem "aprovado ✓")

    // Cardápio → prato → OBSERVAÇÃO (textarea livre; chips de preferência não
    // renderizam neste seed, então não prometemos "sem cebola" como chip)
    await pCliente.goto(`${CLIENTE}/restaurant_dev/cardapio`, { waitUntil: 'domcontentloaded' });
    await settle(pCliente, 2000);
    await swipe(pCliente, -220, 16, 195, 520);
    await softClick(pCliente, pCliente.getByText(/Picanha na Brasa/i).first(), 'Picanha na Brasa', 10_000);
    await settle(pCliente, 1800);
    await swipe(pCliente, -300, 16, 195, 520);

    const obs = pCliente.getByPlaceholder(/sem cebola|ponto da carne|observ/i).first();
    if (await obs.isVisible().catch(() => false)) {
      await obs.click();
      await obs.pressSequentially('Sem cebola, carne ao ponto e molho à parte', { delay: 45 });
      await beat(pCliente, 1800);
    } else {
      console.log('  ⚠ textarea de observação não encontrada');
    }

    // CAMINHO 1 — comanda da mesa (permite dividir depois)
    await softClick(pCliente, pCliente.getByRole('button', { name: /adicionar|pedir/i }).first(), 'adicionar', 10_000);
    await settle(pCliente, 1500);
    await softClick(pCliente, pCliente.getByText(/Comanda da mesa/i).first(), 'Comanda da mesa', 8000);
    await softClick(pCliente, pCliente.getByRole('button', { name: /Adicionar à comanda da mesa/i }).first(), 'confirmar comanda da mesa', 10_000);
    await beat(pCliente, 1800);

    // CAMINHO 2 — comanda individual (cada um paga o que pediu)
    await pCliente.goto(`${CLIENTE}/restaurant_dev/cardapio`, { waitUntil: 'domcontentloaded' });
    await settle(pCliente, 1500);
    await softClick(pCliente, pCliente.getByText(/Bolinho de Bacalhau/i).first(), 'Bolinho de Bacalhau', 10_000);
    await settle(pCliente, 1500);
    await softClick(pCliente, pCliente.getByRole('button', { name: /adicionar|pedir/i }).first(), 'adicionar', 8000);
    await settle(pCliente, 1200);
    await softClick(pCliente, pCliente.getByText(/^Minha comanda$/i).first(), 'Minha comanda', 8000);
    await softClick(pCliente, pCliente.getByRole('button', { name: /Adicionar à minha comanda/i }).first(), 'confirmar comanda individual', 10_000);
    await beat(pCliente, 1800);

    // Revisão + envio
    await pCliente.goto(`${CLIENTE}/restaurant_dev/pedido/revisar`, { waitUntil: 'domcontentloaded' });
    await settle(pCliente, 2000);
    await swipe(pCliente, -200, 14, 195, 520);
    await beat(pCliente, 1500);

    await softClick(pCliente, pCliente.getByRole('button', { name: /Enviar para cozinha/i }).first(), 'Enviar para cozinha', 10_000);
    await settle(pCliente, 1500);
    await softClick(pCliente, pCliente.getByRole('button', { name: /Confirmar agora/i }).first(), 'Confirmar agora', 12_000);
    await settle(pCliente, 2000);
    bPedidoFeito.libera();
    await beat(pCliente, 3500);

    // Cliente B entra (ator de apoio) para o split ter 2 participantes
    await pClienteB.goto(`${API}/qr/qrtest91-public-token-fixed`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await pClienteB.waitForTimeout(2500);
    const nomeB = pClienteB.getByLabel(/seu nome/i).or(pClienteB.locator('input').first());
    if (await nomeB.isVisible().catch(() => false)) {
      await nomeB.fill('Ana Souza');
      await pClienteB.locator('input[inputmode="numeric"]').first().fill(cpfB).catch(() => {});
      await pClienteB.getByRole('button', { name: /continuar|entrar|→/i }).first().click().catch(() => {});
    }
    // A aprova B pelo banner (quem decide é o cliente-host, não a recepção)
    await beat(pCliente, 3000);
    await softClick(pCliente, pCliente.getByRole('button', { name: /Aprovar|Deixar entrar/i }).first(), 'aprovar cliente B', 15_000);
    await beat(pCliente, 2500);

    // Conta: mostra os dois modos e a trava de short-pay
    await pCliente.goto(`${CLIENTE}/restaurant_dev/pagamento`, { waitUntil: 'domcontentloaded' });
    await settle(pCliente, 2000);
    await beat(pCliente, 2500);
    await softClick(pCliente, pCliente.getByText(/Minha comanda/i).first(), 'toggle minha comanda', 6000);
    await beat(pCliente, 2500);
    await softClick(pCliente, pCliente.getByText(/Conta da mesa/i).first(), 'toggle conta da mesa', 6000);
    await beat(pCliente, 2000);

    await softClick(pCliente, pCliente.getByRole('button', { name: /Dividir conta/i }).first(), 'Dividir conta', 10_000);
    await settle(pCliente, 2000);
    for (const modo of [/^Igual$/i, /Por item/i, /Customizado/i]) {
      await softClick(pCliente, pCliente.getByRole('button', { name: modo }).first(), String(modo), 6000);
      await beat(pCliente, 2200);
    }
    await beat(pCliente, 3000);
  };

  // -------------------------------------------------------------- execução
  await Promise.all([gerente(), recepcao(), cozinha(), cliente()]);

  // Freeze simultâneo antes do close — sem isso um quadrante escurece antes
  await relogio.ate(400, 'freeze');
  await beat(pCliente, 5000);

  console.log(`\n▸ encerrando em t=${relogio.agora().toFixed(1)}s`);
  await Promise.all(todos.map((c) => c.close()));
  await ctxClienteB.close();
  await Promise.all([webkit.close(), chromium.close()]);

  resetarEstado(); // deixa a mesa limpa para a próxima tomada
});
