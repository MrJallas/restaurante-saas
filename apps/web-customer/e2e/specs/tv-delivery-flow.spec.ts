import { test, expect } from '@playwright/test';
import { STAFF_API_KEY } from '../helpers/staff-key';
import { execSync } from 'node:child_process';
import { newSession } from '../helpers/session';

/**
 * Fluxo ponta a ponta da entrega TV → garçom → cliente (prompt 99 §6).
 *
 * Prova com app + DB reais:
 *  1. cozinha/TV chama garçom quando o pedido está pronto (botão real da TV);
 *  2. banner/notificação in-app chega pro garçom nas telas V20 (/waiter);
 *  3. tela de entrega mostra o local da mesa (zona Varanda) + mapa;
 *  4. garçom marca "Estou levando" e depois "Confirmar entrega";
 *  5. app do cliente só muda pra "Entregue" depois do passo final do garçom.
 *
 * Roda contra o stack docker-compose de pé (api 3001, customer 3003,
 * staff 3002). Serial — compartilha QRTEST91 com as outras suites
 * (não rodar em paralelo com outros specs, ver .ai/MEMORY.md).
 */

const SLUG = 'restaurant_dev';
const API = `http://localhost:3001/api/${SLUG}`;
const STAFF_APP = 'http://localhost:3002';
const STAFF_KEY = STAFF_API_KEY;
const EVIDENCE_DIR = process.env.TV_DELIVERY_EVIDENCE_DIR || '/tmp/tv-delivery-e2e';

function psql(query: string): string {
  // restaurant-postgres não publica porta no host (hardening round 10) —
  // roda via docker exec, mesmo padrão dos demais specs de TV.
  // Escapa também $, ` e \ — dentro de aspas duplas o shell expande esses
  // caracteres e uma query com dollar-quoting ($$) mudaria de significado
  // em silêncio (code-review).
  const escaped = query.replace(/[\\"`$]/g, (ch) => `\\${ch}`);
  const out = execSync(
    `docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas -tA -c "SET search_path = restaurant_dev; ${escaped}"`,
    { encoding: 'utf8' },
  );
  const lines = out.split('\n').filter((l) => l.trim() !== '' && l.trim() !== 'SET');
  return lines[lines.length - 1]?.trim() ?? '';
}

test.beforeAll(() => {
  // Limpa throttle pra _kds/TV não tomar 429 em runs back-to-back.
  try {
    execSync(
      `docker exec restaurant-redis redis-cli --no-raw EVAL "local keys = redis.call('keys', ARGV[1]); for i=1,#keys do redis.call('del', keys[i]) end; return #keys" 0 'throttle:*'`,
      { stdio: 'pipe' },
    );
  } catch {
    // sem docker exec vira no-op
  }
});

test.describe('TV → garçom → entregue → cliente', () => {
  test.setTimeout(240_000);

  test('fluxo de entrega ponta a ponta com zona e mapa', async ({ page, browser }) => {
    // ETA do pedido pela API do cliente (mesma sessão/cookies da page).
    const fetchEta = async (id: string) => {
      const res = await page.request.get(`/api/${SLUG}/orders`);
      expect(res.ok()).toBeTruthy();
      const body = (await res.json()) as {
        orders: Array<{
          id: string;
          eta_minutes_min: number | null;
          eta_minutes_max: number | null;
          queue_ahead: number;
        }>;
      };
      const row = body.orders.find((o) => o.id === id);
      expect(row, 'pedido presente na listagem do cliente').toBeTruthy();
      return row!;
    };
    // ── 1. Cliente abre sessão na QRTEST91 (zona Varanda) ──
    await newSession(page, { tableCode: 'QRTEST91' });

    // ── 2. Cliente cria pedido (item de cozinha, não-bebida) e confirma ──
    const menuItemId = psql(
      `SELECT mi.id FROM menu_items mi JOIN menu_categories mc ON mc.id = mi.category_id WHERE LOWER(TRIM(mc.name)) <> 'bebidas' ORDER BY mi.name LIMIT 1`,
    );
    expect(menuItemId, 'menu_items precisa ter item de cozinha no seed').toMatch(/[0-9a-f-]{36}/);

    const createRes = await page.request.post(`/api/${SLUG}/orders`, {
      data: { billingMode: 'table', items: [{ menuItemId, quantity: 2 }] },
    });
    expect(createRes.status(), 'POST /orders (sessão do cliente)').toBe(201);
    const created = (await createRes.json()) as { id: string };
    const orderId = created.id;
    const shortId = orderId.slice(0, 8);

    const confirmRes = await page.request.fetch(`/api/${SLUG}/orders/${orderId}/confirm`, {
      method: 'PATCH',
    });
    expect(confirmRes.ok(), 'PATCH /confirm do cliente').toBeTruthy();

    // ETA dinâmica no estágio inicial: recebido = preparo cheio (>=10 min),
    // mais fila se houver pedidos à frente na ordenação canônica.
    const etaReceived = await fetchEta(orderId);
    expect(etaReceived.eta_minutes_min, 'ETA min em received').toBeGreaterThanOrEqual(10);
    expect(etaReceived.queue_ahead).toBeGreaterThanOrEqual(0);

    // Higiene: o pedido do teste vira o ÚNICO ativo (TV determinística) e
    // entregas pendentes antigas saem do feed do garçom.
    psql(
      `UPDATE order_deliveries SET status='cancelled' WHERE status IN ('pending','claimed') AND order_id != '${orderId}'`,
    );
    psql(
      `UPDATE orders SET status='delivered', updated_at=now() WHERE status IN ('open','received','confirmed','preparing','in_progress','ready','in_transit') AND id != '${orderId}'`,
    );

    // ── 3. Cozinha avança: received → in_progress → ready (staff real) ──
    for (const status of ['in_progress', 'ready']) {
      const r = await fetch(`${API}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'x-staff-key': STAFF_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ status, changedBy: 'e2e-kitchen' }),
      });
      expect(r.status, `PATCH status → ${status}`).toBe(200);
    }

    // Checkpoint A — cliente vê "Pronto para servir" (ainda não entregue).
    await page.goto(`/${SLUG}/pedido`);
    await expect(page.getByText(/Pronto para servir ·/)).toBeVisible({ timeout: 15_000 });
    expect(psql(`SELECT status FROM orders WHERE id='${orderId}'`)).toBe('ready');

    // ETA dinâmica: pronto = só o handoff do garçom (range curto, sem
    // componente de fila). O hardcoded "22–28 minutos" morreu.
    const etaReady = await fetchEta(orderId);
    expect(etaReady.eta_minutes_min, 'ETA min em ready').toBeGreaterThanOrEqual(1);
    expect(etaReady.eta_minutes_max, 'ETA max em ready').toBeLessThanOrEqual(5);

    // ── 4. TV da cozinha chama o garçom (botão real) ──
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const tv = await tvContext.newPage();
    await tv.goto(`${STAFF_APP}/cozinha/tv`);
    const card = tv.locator(`div:has-text("#${shortId}")`).last();
    await expect(card, 'card do pedido na TV').toBeVisible({ timeout: 30_000 });
    const callBtn = tv.getByRole('button', { name: 'Chamar garçom' });
    await expect(callBtn).toBeVisible({ timeout: 10_000 });
    await callBtn.click();

    // Backend real: order_deliveries ganha row pending com zona no feed.
    await expect(async () => {
      const st = psql(
        `SELECT status FROM order_deliveries WHERE order_id='${orderId}' AND status != 'cancelled' ORDER BY created_at DESC LIMIT 1`,
      );
      expect(st).toBe('pending');
    }).toPass({ timeout: 15_000 });

    const feedRes = await fetch(`${API}/deliveries/pending`, {
      headers: { 'x-staff-key': STAFF_KEY },
    });
    expect(feedRes.status).toBe(200);
    const feed = (await feedRes.json()) as Array<{
      order_id: string;
      zone_name: string | null;
      table_label: string;
      delivery_status: string;
    }>;
    const feedRow = feed.find((d) => d.order_id === orderId);
    expect(feedRow, 'entrega no feed /deliveries/pending').toBeTruthy();
    expect(feedRow?.zone_name).toBe('Varanda');
    await tv.screenshot({ path: `${EVIDENCE_DIR}/00-tv-pos-chamar-garcom.png` });

    // ── 5. Garçom (alvo do handoff) recebe banner in-app nas telas V20 ──
    // O alvo vem do resolveTargetWaiter (turno ativo + round-robin); o
    // spec entra no app como ESSE garçom — é ele que deve ser notificado.
    const waiterId = psql(
      `SELECT target_waiter_id FROM order_deliveries WHERE order_id='${orderId}' AND status != 'cancelled'`,
    );
    expect(waiterId, 'resolveTargetWaiter persistiu um garçom-alvo').toMatch(/[0-9a-f-]{36}/);
    const waiterIsActiveWaiter = psql(
      `SELECT count(*) FROM staff WHERE id='${waiterId}' AND role='waiter' AND is_active=true`,
    );
    expect(waiterIsActiveWaiter, 'alvo é garçom ativo').toBe('1');

    const waiterContext = await browser.newContext();
    await waiterContext.addInitScript(
      ([id]) => {
        window.localStorage.setItem('staffId', id);
        window.localStorage.setItem('staffRole', 'waiter');
      },
      [waiterId],
    );
    const waiter = await waiterContext.newPage();
    await waiter.goto(`${STAFF_APP}/waiter?tenant=${SLUG}`);

    const banner = waiter.getByTestId('waiter-delivery-alerts');
    await expect(banner, 'banner de entrega no app do garçom').toBeVisible({ timeout: 25_000 });
    await expect(banner).toContainText('QR Teste 91');
    await expect(banner).toContainText('Varanda');
    await waiter.screenshot({ path: `${EVIDENCE_DIR}/01-waiter-banner.png` });

    // ── 6. Tela de entrega: local da mesa (zona) + mapa + "Estou levando" ──
    await banner.getByTestId('delivery-alert-open').click();
    await expect(waiter).toHaveURL(new RegExp(`/waiter/entrega/${orderId}`));
    await expect(waiter.getByTestId('delivery-zone-label')).toContainText('Varanda', {
      timeout: 15_000,
    });
    await expect(waiter.getByTestId('delivery-map')).toBeVisible();
    await expect(waiter.getByTestId('delivery-map-target')).toBeVisible();
    await waiter.screenshot({ path: `${EVIDENCE_DIR}/02-waiter-entrega-mapa.png` });

    await waiter.getByTestId('delivery-pickup').getByRole('button').click();
    await expect(
      waiter.getByTestId('delivery-confirm-delivered'),
      'estágio Confirmar entrega após Estou levando',
    ).toBeVisible({ timeout: 15_000 });
    expect(psql(`SELECT status FROM orders WHERE id='${orderId}'`)).toBe('in_transit');

    // Checkpoint B — cliente vê "A caminho da mesa"; NÃO está entregue.
    await page.reload();
    await expect(page.getByText(/A caminho da mesa ·/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Entregue ·/)).toHaveCount(0);

    // ETA encolhe conforme o processo resolve: received > ready > in_transit.
    const etaTransit = await fetchEta(orderId);
    expect(etaTransit.eta_minutes_max, 'ETA max em in_transit').toBeLessThanOrEqual(3);
    expect(
      etaReceived.eta_minutes_max! > etaReady.eta_minutes_max! &&
        etaReady.eta_minutes_max! > etaTransit.eta_minutes_max!,
      `ETA monotônica: ${etaReceived.eta_minutes_max} > ${etaReady.eta_minutes_max} > ${etaTransit.eta_minutes_max}`,
    ).toBe(true);

    // ── 7. Garçom confirma "Entregue" — só agora o pedido termina ──
    await waiter.getByTestId('delivery-confirm-delivered').getByRole('button').click();
    await expect(async () => {
      expect(psql(`SELECT status FROM orders WHERE id='${orderId}'`)).toBe('delivered');
    }).toPass({ timeout: 15_000 });
    expect(
      psql(
        `SELECT status FROM order_deliveries WHERE order_id='${orderId}' AND status != 'cancelled'`,
      ),
    ).toBe('delivered');

    // Checkpoint C — app do cliente atualiza pra Entregue. Primeiro sem
    // reload (WS order:status → sala da sessão); fallback reload prova a
    // persistência mesmo se o socket cair no ambiente de teste.
    let viaWs = true;
    try {
      await expect(page.getByText(/Entregue ·/)).toBeVisible({ timeout: 25_000 });
    } catch {
      viaWs = false;
      await page.reload();
      await expect(page.getByText(/Entregue ·/)).toBeVisible({ timeout: 15_000 });
    }
    console.log(`[tv-delivery-flow] cliente atualizou via WS sem reload: ${viaWs}`);
    await page.screenshot({ path: `${EVIDENCE_DIR}/03-cliente-entregue.png` });

    await tvContext.close();
    await waiterContext.close();
  });
});
