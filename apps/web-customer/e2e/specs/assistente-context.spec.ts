/**
 * Prompt 100 §7 — matriz de contexto do assistente, ponta a ponta:
 *
 *  1. Pedido ativo → eyebrow `Assistente · ● <estado> · <ETA>` na landing,
 *     mensagem de contexto do pedido aparece UMA vez; voltar do cardápio
 *     mostra contexto de navegação com a eyebrow persistindo; status
 *     avança via WS com o assistente aberto; entregue → eyebrow some;
 *     2º pedido re-libera a mensagem (evento novo).
 *  2. Chips/frases diretas resolvem no rule-layer sem LLM com UX idêntica
 *     à de IA (tool indicator + chips coerentes).
 *  3. Resposta do gerente é PRIVADA: só o cliente destinatário recebe a
 *     bubble (realtime + reload); o outro participante da mesa não vê.
 *
 * Serial (DB compartilhado — MEMORY.md): não rodar em paralelo com outros
 * specs.
 */
import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { execSync } from 'node:child_process';
import { newSession } from '../helpers/session';
import {
  activeSessions,
  fillWelcome,
  openCustomerViaQr,
  participantsForSession,
  resetQrTables,
  staffByRole,
  waitFor,
} from '../helpers/physical-qr';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const SLUG = 'restaurant_dev';
const API = `http://localhost:3001/api/${SLUG}`;
const STAFF_KEY = 'dev-staff-api-key-change-in-prod';

let cpfSeed = Math.floor(Date.now() % 100_000);
let ipSeed = Math.floor(Date.now() % 60_000);

function freshCpf(): string {
  cpfSeed += 1;
  const base = String(910000000 + cpfSeed).slice(0, 9);
  const digit = (input: string): number => {
    let sum = 0;
    for (let i = 0; i < input.length; i += 1) {
      sum += Number(input[i]) * (input.length + 1 - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  const d1 = digit(base);
  const d2 = digit(`${base}${d1}`);
  return `${base}${d1}${d2}`;
}

function nextIp(): string {
  ipSeed += 1;
  const normalized = Math.abs(ipSeed) % 65_536;
  return `198.77.${Math.floor(normalized / 256)}.${normalized % 256}`;
}

function psql(query: string): string {
  const escaped = query.replace(/[\\"`$]/g, (ch) => `\\${ch}`);
  const out = execSync(
    `docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas -tA -c "SET search_path = restaurant_dev; ${escaped}"`,
    { encoding: 'utf8' },
  );
  const lines = out.split('\n').filter((l) => l.trim() !== '' && l.trim() !== 'SET');
  return lines[lines.length - 1]?.trim() ?? '';
}

function redisDel(pattern: string): void {
  try {
    execSync(
      `docker exec restaurant-redis redis-cli --no-raw EVAL "local keys = redis.call('keys', ARGV[1]); for i=1,#keys do redis.call('del', keys[i]) end; return #keys" 0 '${pattern}'`,
      { stdio: 'pipe' },
    );
  } catch {
    /* sem docker vira no-op */
  }
}

async function patchStatus(orderId: string, status: string): Promise<void> {
  const r = await fetch(`${API}/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'x-staff-key': STAFF_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ status, changedBy: 'e2e-assistente-context' }),
  });
  expect(r.status, `PATCH status → ${status}`).toBe(200);
}

/** Navega pro assistente capturando o kind da continuation da landing. */
async function gotoAssistenteAndGetKind(page: Page): Promise<string> {
  const responsePromise = page.waitForResponse(
    (res) =>
      res.url().includes(`/${SLUG}/continuation`) && res.request().method() === 'POST',
    { timeout: 20_000 },
  );
  await page.goto(`/${SLUG}/assistente`, { waitUntil: 'commit' });
  const res = await responsePromise;
  const body = (await res.json()) as { kind: string };
  // Deixa a navegação assentar antes do próximo goto (evita corrida
  // "interrupted by another navigation").
  await page.waitForLoadState('load').catch(() => {});
  return body.kind;
}

async function createConfirmedOrder(page: Page): Promise<string> {
  const menuItemId = psql(
    `SELECT mi.id FROM menu_items mi JOIN menu_categories mc ON mc.id = mi.category_id WHERE LOWER(TRIM(mc.name)) <> 'bebidas' ORDER BY mi.name LIMIT 1`,
  );
  expect(menuItemId, 'menu_items precisa ter item de cozinha no seed').toMatch(/[0-9a-f-]{36}/);
  const createRes = await page.request.post(`/api/${SLUG}/orders`, {
    data: { billingMode: 'table', items: [{ menuItemId, quantity: 1 }] },
  });
  expect(createRes.status(), 'POST /orders').toBe(201);
  const { id } = (await createRes.json()) as { id: string };
  const confirmRes = await page.request.fetch(`/api/${SLUG}/orders/${id}/confirm`, {
    method: 'PATCH',
  });
  expect(confirmRes.ok(), 'PATCH /confirm').toBeTruthy();
  return id;
}

test.beforeAll(() => {
  redisDel('throttle:*');
  // Estado limpo da matriz: sem consumo de rodadas anteriores.
  redisDel('continuation_shown:*');
  // Locks de rate-limit de welcome/identify herdados de runs anteriores
  // (TTL 15min) derrubam o newSession — mesma higiene do throttle.
  redisDel('customers:welcome:*');
  redisDel('customers:identify:*');
});

test('matriz de contexto: eyebrow de status + mensagem consumível 1x + WS ao vivo', async ({
  page,
}) => {
  await newSession(page, { tableCode: 'QRTEST91' });

  // Higiene: nenhum pedido ativo herdado de outros specs nesta sessão.
  psql(
    `UPDATE orders SET status='delivered', updated_at=now() WHERE status IN ('pending_confirmation','open','received','confirmed','preparing','in_progress','ready','in_transit')`,
  );

  // ── Sem pedido ativo: eyebrow padrão (sem status) ──
  let kind = await gotoAssistenteAndGetKind(page);
  await expect(page.getByTestId('assistente-landing')).toBeVisible();
  await expect(page.getByTestId('order-status-eyebrow')).toHaveCount(0);

  // ── Fez pedido → 1ª entrada: mensagem do pedido + eyebrow RECEBIDO+ETA ──
  const orderId = await createConfirmedOrder(page);
  kind = await gotoAssistenteAndGetKind(page);
  expect(kind, '1ª entrada após pedido = contexto do pedido').toBe('abriu_pedido');
  const eyebrow = page.getByTestId('order-status-eyebrow').first();
  await expect(eyebrow).toBeVisible({ timeout: 15_000 });
  await expect(eyebrow).toContainText(/Recebido pela cozinha/i);
  await expect(eyebrow).toContainText(/min/i);

  // ── Mesmo pedido → 2ª entrada vindo do CARDÁPIO: contexto de navegação ──
  await page.goto(`/${SLUG}/cardapio`, { waitUntil: 'networkidle' });
  kind = await gotoAssistenteAndGetKind(page);
  expect(['viu_menu', 'viu_cardapio'], '2ª entrada = contexto de cardápio').toContain(kind);
  await expect(page.getByTestId('order-status-eyebrow').first()).toBeVisible({
    timeout: 15_000,
  });

  // ── Pedido avança (WS) com assistente aberto: eyebrow muda ao vivo ──
  await patchStatus(orderId, 'in_progress');
  await expect(page.getByTestId('order-status-eyebrow').first()).toContainText(
    /Em preparo/i,
    { timeout: 15_000 },
  );

  // ── Entregue: eyebrow volta ao normal ──
  // (in_transit só existe via fluxo de entrega do garçom — o PATCH staff
  // genérico aceita ready→delivered direto, suficiente pra matriz.)
  await patchStatus(orderId, 'ready');
  await patchStatus(orderId, 'delivered');
  await expect(page.getByTestId('order-status-eyebrow')).toHaveCount(0, {
    timeout: 15_000,
  });

  // ── Novo pedido (2º): mensagem do pedido aparece de novo (evento novo) ──
  await createConfirmedOrder(page);
  kind = await gotoAssistenteAndGetKind(page);
  expect(kind, 'novo pedido re-libera a mensagem de evento').toBe('abriu_pedido');

  // ── 3ª entrada sem cardápio recente: kind de navegação (não repete) ──
  kind = await gotoAssistenteAndGetKind(page);
  expect(['viu_menu', 'viu_cardapio', 'voltou_sem_acao']).toContain(kind);
});

test('chip/frase direta: rule-layer sem LLM com UX de IA (indicador + chips coerentes)', async ({
  page,
}) => {
  await newSession(page, { tableCode: 'QRTEST91' });
  await page.goto(`/${SLUG}/assistente`, { waitUntil: 'networkidle' });

  const input = page.getByPlaceholder('Pergunte alguma coisa...');
  await expect(input).toBeVisible();

  // "me indica algo" → recommend_dish via regex (zero LLM), com indicador
  // de tool e resposta coerente: o apps/api enriquece com itens REAIS do
  // cardápio (cards "Pedir" + chips com os nomes dos pratos).
  await input.fill('me indica algo');
  await input.press('Enter');
  await expect(page.getByTestId('tool-indicator-recommend_dish')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('button', { name: 'Pedir', exact: true }).first()).toBeVisible({
    timeout: 10_000,
  });

  // Faixa de status FIXA no modo chat (decisão 2026-06-12): com pedido
  // ativo (criado no teste anterior, mesma sessão), o estado + ETA ficam
  // visíveis no topo do transcript junto com o tool indicator.
  await expect(page.getByTestId('order-status-strip')).toBeVisible({ timeout: 10_000 });

  // "quero ver o cardápio" → view_menu via regex; FE abre o MenuOverlay
  // (mesma UX do tool call do LLM).
  await input.fill('quero ver o cardápio');
  await input.press('Enter');
  await expect(page.getByTestId('tool-indicator-view_menu')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('menu-overlay')).toBeVisible({ timeout: 15_000 });
});

test('resposta do gerente é privada: só o destinatário vê (realtime + reload)', async ({
  page,
  browser,
}) => {
  // Mesa 92 zerada — host A entra primeiro (vira customer-host).
  resetQrTables(['QRTEST92']);
  await newSession(page, { tableCode: 'QRTEST92' });

  // Convidado B escaneia a mesma mesa → identify → aguarda aprovação do host.
  const guest = await newGuestSurface(browser);
  try {
    await openCustomerViaQr(guest.page, 'QRTEST92');
    const guestName = 'Convidado Privacidade';
    await fillWelcome(guest.page, guestName, freshCpf());
    await expect(guest.page.getByTestId('waiting-approval')).toBeVisible({
      timeout: 20_000,
    });

    // Host A aprova pelo banner da home.
    await expect(page.getByTestId('host-join-request-banner')).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: new RegExp(`Aprovar ${guestName}`, 'i') }).click();
    await expect(
      guest.page.getByRole('button', { name: /Chamar garçom|Chamar garcom/i }),
    ).toBeVisible({ timeout: 20_000 });

    const session = activeSessions('QRTEST92')[0];
    expect(session?.id).toBeTruthy();
    const participants = await waitFor(
      () => participantsForSession(session.id),
      (rows) => rows.filter((r) => r.status === 'approved').length >= 2,
      15_000,
    );
    const guestRow = participants!.find((r) => r.customer_name === guestName);
    const hostRow = participants!.find((r) => r.customer_name !== guestName);
    expect(guestRow?.customer_id).toBeTruthy();
    expect(hostRow?.customer_id).toBeTruthy();

    // Os dois abrem o assistente (host A + convidado B).
    await page.goto(`/${SLUG}/assistente`, { waitUntil: 'networkidle' });
    await guest.page.goto(`/${SLUG}/assistente`, { waitUntil: 'networkidle' });

    // Gerente manda mensagem PRO HOST (toCustomerId = A). Caso forte de
    // propósito: o host fez welcome PRIMEIRO, então o payload Redis
    // compartilhado da mesa aponta pro convidado — só a identidade por
    // participante (cookie recognition_token no handshake WS, decisão
    // 2026-06-12) entrega o realtime pro host.
    const manager = await staffByRole('manager');
    expect(manager?.id).toBeTruthy();
    const message = `Mensagem privada do gerente ${Date.now()}`;
    const sendRes = await fetch(`${API}/assistant/staff-to-customer`, {
      method: 'POST',
      headers: {
        'x-staff-key': STAFF_KEY,
        'x-staff-id': manager!.id,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        tableSessionId: session.id,
        message,
        fromStaffId: manager!.id,
        toCustomerId: hostRow!.customer_id,
      }),
    });
    expect(sendRes.status, 'POST staff-to-customer').toBe(201);

    // Realtime: SÓ o host vê a bubble; o convidado não recebe nada.
    await expect(page.getByText(message)).toBeVisible({ timeout: 15_000 });
    await guest.page.waitForTimeout(4_000);
    await expect(guest.page.getByText(message)).toHaveCount(0);

    // Reload: histórico continua privado por destinatário.
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByText(message)).toBeVisible({ timeout: 20_000 });
    await guest.page.reload({ waitUntil: 'networkidle' });
    await guest.page.waitForTimeout(4_000);
    await expect(guest.page.getByText(message)).toHaveCount(0);
  } finally {
    await guest.context.close();
  }
});

interface GuestSurface {
  context: BrowserContext;
  page: Page;
}

async function newGuestSurface(browser: Browser): Promise<GuestSurface> {
  const context = await browser.newContext({
    ...devices['iPhone 14'],
    geolocation: { latitude: -23.561, longitude: -46.655 },
    permissions: ['geolocation'],
    // IP sintético: rate-limit dev de welcome é por IP+CPF.
    extraHTTPHeaders: { 'x-forwarded-for': nextIp() },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  return { context, page };
}
