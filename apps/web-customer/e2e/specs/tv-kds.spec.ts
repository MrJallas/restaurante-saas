import { test, expect } from '@playwright/test';
import { STAFF_API_KEY } from '../helpers/staff-key';
import { execSync } from 'node:child_process';
import {
  countActiveDrinks,
  isAlertNote,
  deriveStatus,
  getPrimaryActionLabel,
  getQuantityLabel,
  LATE_THRESHOLD_MIN,
  type KdsOrder,
} from '../../../web-staff/src/components/tv/types';
import {
  ensureTvFixtures,
  clearKdsCache,
  clearWelcomeAndThrottleLocks,
  initTvSession,
  resetTvAnchorOrder,
  type TvSession,
} from '../helpers/tv-fixtures';
import { API_BASE_URL, staffByRole, staffFetch, type StaffRow } from '../helpers/physical-qr';

/**
 * Suite de bugs P1+P2 das telas TV (Cozinha + Bar). Cada test cobre um
 * comportamento documentado no .ai/handoffs/2026-04-28-qa-handoff-ios.md. Roda contra o stack
 * docker-compose ja de pe (postgres na 5434, api na 3001, web-staff
 * na 3002).
 *
 * Por que child_process.execSync(psql) em vez de pg client: o repo nao
 * expoe um proxy http pra rodar SQL ad-hoc no DB de dev, e adicionar
 * o `pg` package so pra os tests aumentaria o footprint. psql ja esta
 * no host (homebrew). Compromisso aceitavel pra suite local.
 *
 * Modelo de autenticação atual (2026-09):
 *  - Cliente: `session/init` devolve `sessionId` (UUID, só pra SQL) e `token`
 *    (HMAC do sessionId) — o `x-session-token` é o `token`.
 *  - Pessoa da equipe: `x-staff-token` de login real (CPF+PIN), via
 *    `staffFetch`. A transição de status é autorizada por papel: cook avança
 *    preparo da cozinha, waiter entrega, manager/owner fazem qualquer uma.
 *  - Estação (TV): `x-staff-key` compartilhada, injetada pelo proxy. Não é
 *    pessoa: lê o KDS e só avança preparo (`in_progress`/`ready`) com
 *    `station` explícito; o resto responde 401 AUTH_TOKEN_REQUIRED.
 */

const SLUG = 'restaurant_dev';
const API = `${API_BASE_URL}/${SLUG}`;
const STAFF_KEY = STAFF_API_KEY;

// O /customer/welcome exige um objeto `location` (status granted) — sem ele
// responde 403 "Permita o acesso à localização", mesmo com a geofence
// desligada (lat/lng NULL). Mesmo shape do helper canônico physical-qr.ts.
const WELCOME_LOCATION = {
  status: 'granted',
  latitude: -23.56,
  longitude: -46.64,
  accuracyMeters: 12,
};

/** Sessão real da mesa M01: `token` vai no header, `sessionId` fica pro SQL. */
function m01Session(): Promise<TvSession> {
  return initTvSession('M01');
}

// Setup determinístico da suite:
//  - ensureTvFixtures: cria/garante (idempotente) os UUIDs fixos que os
//    specs assumem pré-existentes e sincroniza o secret HMAC das mesas.
//  - clearWelcomeAndThrottleLocks: limpa throttle:* (senão a janela do
//    P2-I/flood faz P1-D/P1-E/P1-B tomarem 429 espúrio no round seguinte)
//    e customers:welcome:* (um 403 conta como tentativa e trava ~15min).
test.beforeAll(() => {
  ensureTvFixtures();
  clearWelcomeAndThrottleLocks();
});

function psql(query: string): string {
  // -tA: tuples-only + unaligned. Mas SET ainda emite "SET" no stdout
  // antes do resultado da query. Pegamos so a ultima linha nao-vazia.
  const out = execSync(
    `docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas -tA -c "SET search_path = restaurant_dev; ${query}"`,
    { encoding: 'utf8' },
  );
  const lines = out.split('\n').filter((l) => l.trim() !== '' && l.trim() !== 'SET');
  return lines[lines.length - 1]?.trim() ?? '';
}

test.describe('P1-A — race condition em updateStatus', () => {
  const ORDER_ID = 'aaaaaaa1-0000-0000-0000-000000000001';
  // Preparo exige sessão individual: o cook avança a cozinha. O autor
  // gravado no history é o staff do TOKEN — o `changedBy` do body é ignorado.
  let cook: StaffRow;

  test.beforeAll(async () => {
    cook = await staffByRole('cook');
  });

  test.beforeEach(() => {
    // Reset do pedido (e dos itens) pra received e limpa history rows do
    // teste anterior. Importante: NAO apagar todo o history do pedido —
    // apenas as rows que este teste produz (received -> in_progress pelo
    // cook), pra nao corromper o seed inicial.
    resetTvAnchorOrder();
    psql(
      `DELETE FROM order_status_history WHERE order_id='${ORDER_ID}' AND from_status='received' AND to_status='in_progress' AND changed_by='${cook.id}';`,
    );
  });

  test('5 PATCHes concorrentes geram exatamente 1 row em order_status_history', async () => {
    // Dispara 5 transicoes received -> in_progress simultaneas. Sem CAS,
    // todas leem status='received', todas passam pela validacao JS, e
    // todas inserem history.
    const responses = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        staffFetch(`/${SLUG}/orders/${ORDER_ID}/status`, {
          method: 'PATCH',
          staff: cook,
          body: JSON.stringify({ status: 'in_progress', station: 'kitchen' }),
        }),
      ),
    );

    // Asserção primária: history nao pode duplicar. Sem CAS, as 5 calls
    // leem 'received' simultaneamente e todas inserem history.
    const count = Number(
      psql(
        `SELECT count(*) FROM order_status_history WHERE order_id='${ORDER_ID}' AND from_status='received' AND to_status='in_progress' AND changed_by='${cook.id}';`,
      ),
    );
    expect(count, 'order_status_history deve ter exatamente 1 linha').toBe(1);

    const finalStatus = psql(`SELECT status FROM orders WHERE id='${ORDER_ID}';`);
    expect(finalStatus, 'pedido deve estar em in_progress').toBe('in_progress');

    // Idempotencia: depois do fix CAS, quem perde a corrida nao deve
    // estourar 400 ("transicao invalida"); deve retornar o estado atual.
    // Esse assert e o ultimo pra que o erro principal (count duplicado)
    // apareca primeiro no report quando o bug existe.
    for (const r of responses) {
      expect(r.status, 'cada PATCH concorrente deve retornar 200 (idempotente)').toBe(200);
    }
  });
});

test.describe('P2-D — countActiveDrinks ignora orders ready', () => {
  function fakeOrder(status: KdsOrder['status'], qtys: number[]): KdsOrder {
    return {
      id: 'fake',
      status,
      total_cents: 0,
      notes: null,
      visit_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      table_label: 'Mesa X',
      items: qtys.map((q, i) => ({
        id: `it-${i}`,
        menuItemId: 'mi',
        name: 'Caipirinha',
        quantity: q,
        notes: null,
        categoryName: 'Bebidas',
      })),
    };
  }

  test('soma quantities so de orders nao-ready', () => {
    const orders: KdsOrder[] = [
      fakeOrder('received', [2, 1]), // 3
      fakeOrder('in_progress', [4]), // 4
      fakeOrder('ready', [99]), // ignorado
    ];
    expect(countActiveDrinks(orders)).toBe(7);
  });

  test('lista vazia retorna 0', () => {
    expect(countActiveDrinks([])).toBe(0);
  });

  test('todas ready retorna 0', () => {
    expect(countActiveDrinks([fakeOrder('ready', [10, 10])])).toBe(0);
  });
});

test.describe('P2-K — getQuantityLabel pluraliza bebida(s) corretamente no header do bar', () => {
  test('1 bebida (singular), 4 bebidas (plural)', () => {
    expect(getQuantityLabel(1, 'bar')).toMatch(/^1 bebida · há$/);
    expect(getQuantityLabel(4, 'bar')).toMatch(/^4 bebidas · há$/);
    expect(getQuantityLabel(0, 'bar')).toMatch(/^0 bebidas · há$/);
  });

  test('kitchen ignora qty (so "há")', () => {
    expect(getQuantityLabel(1, 'kitchen')).toBe('há');
    expect(getQuantityLabel(99, 'kitchen')).toBe('há');
  });
});

test.describe('P2-C — isAlertNote tambem aplica em order.notes (alerta vermelho a nivel de pedido)', () => {
  // Detector ja e testado em P1-C. Aqui garantimos:
  // 1) o caso uppercase 'ALERGIA NOZES' ativa o detector (input do bug)
  // 2) KdsOrderCard.tsx renderiza o bloco order.notes ramificando por
  //    isAlertNote(order.notes) — guard estrutural pra nao regredir pra
  //    background hardcoded (C.noteBg) que era o estado original.
  test('detector pega ALERGIA NOZES uppercase', () => {
    expect(isAlertNote('ALERGIA NOZES')).toBe(true);
  });

  test('KdsOrderCard.tsx aplica isAlertNote(order.notes) no bloco de obs do pedido', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const file = path.resolve(__dirname, '../../../web-staff/src/components/tv/KdsOrderCard.tsx');
    const src = await fs.readFile(file, 'utf8');
    expect(
      src,
      'componente deve chamar isAlertNote em order.notes pra ramificar bg/border',
    ).toMatch(/isAlertNote\(order\.notes\)/);
  });
});

test.describe('P2-A — getPrimaryActionLabel deriva label do status raw', () => {
  // Antes: a label do botao vinha de `derived` (que mistura received+late
  // como 'atrasado'). Pedido 'received' atrasado mostrava "Marcar pronto"
  // mas a acao real era received -> in_progress. Agora a label vem do
  // status raw, ortogonal ao timing/derived.

  test('received e open mostram "Iniciar preparo" / "Preparar" por estacao', () => {
    expect(getPrimaryActionLabel('received', 'kitchen')).toMatch(/Iniciar preparo/i);
    expect(getPrimaryActionLabel('received', 'bar')).toMatch(/Preparar/i);
    expect(getPrimaryActionLabel('open', 'kitchen')).toMatch(/Iniciar preparo/i);
    expect(getPrimaryActionLabel('open', 'bar')).toMatch(/Preparar/i);
  });

  test('ready mostra "Chamar garçom" (canon V20 — cozinha e bar chamam o garçom)', () => {
    // Decisão Caleb 2026-06-10: a ação final canônica do KDS é "Chamar
    // garçom" (não "Servir agora"/"Entregar"). getPrimaryActionLabel devolve
    // o mesmo label pras duas estações quando o pedido está pronto.
    expect(getPrimaryActionLabel('ready', 'kitchen')).toMatch(/Chamar garçom/i);
    expect(getPrimaryActionLabel('ready', 'bar')).toMatch(/Chamar garçom/i);
  });

  test('in_progress / preparing / confirmed mostram "Marcar pronto"', () => {
    expect(getPrimaryActionLabel('in_progress', 'kitchen')).toMatch(/Marcar pronto/i);
    expect(getPrimaryActionLabel('preparing', 'kitchen')).toMatch(/Marcar pronto/i);
    expect(getPrimaryActionLabel('confirmed', 'kitchen')).toMatch(/Marcar pronto/i);
  });
});

test.describe('P2-B — deriveStatus marca atrasado em elapsed >= 12min (off-by-floor)', () => {
  // elapsedMin vem do clock como Math.floor(deltaMs / 60000), entao um
  // pedido com 12:30 de idade chega aqui como elapsedMin=12. Antes do
  // fix, `> 12` deixava esse caso como 'preparando'/'novo' por mais um
  // minuto inteiro.
  function fakeOrder(status: KdsOrder['status']): KdsOrder {
    return {
      id: 'fake',
      status,
      total_cents: 0,
      notes: null,
      visit_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      table_label: 'Mesa X',
      items: [],
    };
  }

  test('elapsedMin igual ao threshold ja conta como atrasado', () => {
    expect(LATE_THRESHOLD_MIN).toBe(12);

    expect(deriveStatus(fakeOrder('received'), 12)).toBe('atrasado');
    expect(deriveStatus(fakeOrder('in_progress'), 12)).toBe('atrasado');
    // Limite logo abaixo continua sendo 'novo'/'preparando'
    expect(deriveStatus(fakeOrder('received'), 11)).toBe('novo');
    expect(deriveStatus(fakeOrder('in_progress'), 11)).toBe('preparando');
    // Acima do threshold continua atrasado
    expect(deriveStatus(fakeOrder('received'), 30)).toBe('atrasado');
    // Ready ignora threshold
    expect(deriveStatus(fakeOrder('ready'), 99)).toBe('pronto');
  });
});

test.describe('P1-G — welcome de cliente recorrente preserva o nome canônico', () => {
  // Usa CPF dedicado pra nao colidir com o seed (TEST_CPF=12345678909
  // e usado por critical-paths/welcome-validation).
  const CPF = '52998224725'; // Maria Silva no seed

  test.afterEach(() => {
    // Restaura o name original do seed pra nao quebrar outros tests.
    psql(`UPDATE customers SET name = 'Maria Silva' WHERE cpf = '${CPF}';`);
  });

  test('welcome com nome novo NÃO sobrescreve — devolve o nome canônico', async () => {
    // Comportamento desta branch (customers.service.welcome:94 — resolvedName
    // = customer.name): um CPF já conhecido mantém o nome de cadastro. O
    // welcome devolve o nome canônico e NÃO grava o nome digitado de novo —
    // evita overwrite acidental/malicioso da identidade do cliente via
    // re-scan. (A sibling branch atualizava o nome; aqui a decisão é preservar.)
    const before = psql(`SELECT name FROM customers WHERE cpf = '${CPF}';`);
    expect(before).toBe('Maria Silva');

    const { token } = await m01Session();
    const res = await fetch(`${API}/customer/welcome`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-session-token': token },
      body: JSON.stringify({
        name: 'Maria Atualizada Silva',
        cpf: CPF,
        location: WELCOME_LOCATION,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { name: string; isReturning: boolean };
    expect(body.isReturning).toBe(true);
    expect(body.name).toBe('Maria Silva'); // canônico, não o nome digitado

    // DB inalterado
    const after = psql(`SELECT name FROM customers WHERE cpf = '${CPF}';`);
    expect(after).toBe('Maria Silva');
  });

  test('welcome com nome identico nao toca DB (idempotente)', async () => {
    psql(`UPDATE customers SET name = 'Maria Silva' WHERE cpf = '${CPF}';`);
    const { token } = await m01Session();
    const res = await fetch(`${API}/customer/welcome`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-session-token': token },
      body: JSON.stringify({ name: 'Maria Silva', cpf: CPF, location: WELCOME_LOCATION }),
    });
    expect(res.status).toBe(201);
    const after = psql(`SELECT name FROM customers WHERE cpf = '${CPF}';`);
    expect(after).toBe('Maria Silva');
  });
});

test.describe('SURPRESA — confirmOrder/cancelOrder usam CAS atomico (CTE+SELECT)', () => {
  const ORDER_ID = 'cccccccc-cccc-cccc-cccc-000000000001';
  const ITEM_ID = '8ebe30e2-0d64-4bc8-96df-c6fcacc7fe34'; // Picanha

  test.afterEach(() => {
    psql(
      `DELETE FROM order_items WHERE order_id='${ORDER_ID}'; ` +
        `DELETE FROM order_status_history WHERE order_id='${ORDER_ID}'; ` +
        `DELETE FROM orders WHERE id='${ORDER_ID}';`,
    );
  });

  test('5 PATCH /confirm concorrentes geram exatamente 1 row em order_status_history', async () => {
    // O pedido nasce na MESMA sessão que o token autentica (o confirm checa
    // o dono da sessão) — sessionId e token vêm juntos do session/init.
    const { sessionId, token } = await m01Session();

    psql(
      `INSERT INTO orders (id, table_session_id, billing_mode, status, notes, total_cents, created_by, auto_confirm_at, created_at, updated_at) VALUES ('${ORDER_ID}', '${sessionId}', 'table', 'pending_confirmation', 'CAS-confirm-test', 1000, 'qa', now() + interval '15 seconds', now(), now()); ` +
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, subtotal_cents) VALUES ('${ORDER_ID}', '${ITEM_ID}', 1, 1000, 1000); ` +
        `DELETE FROM order_status_history WHERE order_id='${ORDER_ID}';`,
    );

    const calls = Array.from({ length: 5 }).map(() =>
      fetch(`${API}/orders/${ORDER_ID}/confirm`, {
        method: 'PATCH',
        headers: {
          'x-session-token': token,
          'content-type': 'application/json',
        },
        body: '{}',
      }),
    );
    const responses = await Promise.all(calls);

    const count = Number(
      psql(
        `SELECT count(*) FROM order_status_history WHERE order_id='${ORDER_ID}' AND to_status='received';`,
      ),
    );
    expect(count, 'confirmOrder duplicava history quando CAS perdia').toBe(1);

    const finalStatus = psql(`SELECT status FROM orders WHERE id='${ORDER_ID}';`);
    expect(finalStatus).toBe('received');

    for (const r of responses) {
      expect(r.status, 'confirmOrder nao deve dar 500 em concorrencia').toBeLessThan(500);
    }
  });
});

test.describe('P1-E — _kds rejeita customer session token (staff-only)', () => {
  test('GET _kds com session-token de customer (sem staff-key) retorna 401/403', async () => {
    const { token } = await m01Session();
    const res = await fetch(`${API}/orders/_kds?station=kitchen`, {
      headers: { 'x-session-token': token },
    });
    // Aceita 401 ou 403 (StaffOnlyGuard atualmente lanca 403 ForbiddenException;
    // 401 tambem seria correto se trocarem futuramente).
    expect(
      [401, 403].includes(res.status),
      `staff-only endpoint nao pode aceitar session token (got ${res.status})`,
    ).toBe(true);
  });

  test('GET _kds com staff-key continua respondendo 200 (regressao guard)', async () => {
    const res = await fetch(`${API}/orders/_kds?station=kitchen`, {
      headers: { 'x-staff-key': STAFF_KEY },
    });
    expect(res.status).toBe(200);
  });
});

test.describe('P1-D — KDS nao retorna pedidos zumbis (>8h ou sessao fechada)', () => {
  // 'cccccccc' prefix — distingue desse fix dos demais.
  const ORDER_OLD = 'cccccccc-aaaa-aaaa-aaaa-000000000001';
  const ORDER_FRESH = 'cccccccc-aaaa-aaaa-aaaa-000000000002';
  const SESSION_ID = '0d324208-01ce-4d5e-b95e-1acba080304c'; // M01 active
  const ITEM_ID = '8ebe30e2-0d64-4bc8-96df-c6fcacc7fe34'; // Picanha (pratos)

  test.beforeEach(() => {
    // Pedido antigo (12h atras) que NAO deve aparecer no KDS.
    psql(
      `INSERT INTO orders (id, table_session_id, billing_mode, status, notes, total_cents, created_by, created_at, updated_at) VALUES ('${ORDER_OLD}', '${SESSION_ID}', 'table', 'received', 'BUG-D-old', 1000, 'qa', now() - interval '12 hours', now() - interval '12 hours'); ` +
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, subtotal_cents) VALUES ('${ORDER_OLD}', '${ITEM_ID}', 1, 1000, 1000); ` +
        // Pedido fresco (1min atras) na mesma mesa — controle, deve aparecer.
        `INSERT INTO orders (id, table_session_id, billing_mode, status, notes, total_cents, created_by, created_at, updated_at) VALUES ('${ORDER_FRESH}', '${SESSION_ID}', 'table', 'received', 'BUG-D-fresh', 1000, 'qa', now() - interval '1 minute', now() - interval '1 minute'); ` +
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, subtotal_cents) VALUES ('${ORDER_FRESH}', '${ITEM_ID}', 1, 1000, 1000);`,
    );
  });

  test.afterEach(() => {
    psql(
      `DELETE FROM order_items WHERE order_id IN ('${ORDER_OLD}', '${ORDER_FRESH}'); ` +
        `DELETE FROM orders WHERE id IN ('${ORDER_OLD}', '${ORDER_FRESH}');`,
    );
  });

  test('pedido com 12h de idade nao aparece no _kds; pedido fresco aparece', async () => {
    // Pedidos entraram via SQL: derruba o cache-aside de 3s do _kds.
    clearKdsCache();
    const res = await fetch(`${API}/orders/_kds?station=kitchen`, {
      headers: { 'x-staff-key': STAFF_KEY },
    });
    const body = (await res.json()) as { orders: Array<{ id: string }> };
    const ids = body.orders.map((o) => o.id);

    expect(ids, 'pedido de 12h NAO deve estar na fila').not.toContain(ORDER_OLD);
    expect(ids, 'pedido fresco deve estar na fila (controle)').toContain(ORDER_FRESH);
  });
});

test.describe('P1-C — isAlertNote casa palavras com acento (PT-BR)', () => {
  test('alergico, intolerancia, gluten — todos com acento — devem ativar alerta', () => {
    expect(isAlertNote('alérgico'), 'alergico com acento').toBe(true);
    expect(isAlertNote('intolerância à lactose'), 'intolerancia com acento').toBe(true);
    expect(isAlertNote('contém glúten'), 'gluten com acento').toBe(true);
    // ASCII puro continua casando (regressao guard)
    expect(isAlertNote('alergico sem acento'), 'alergico ASCII').toBe(true);
    expect(isAlertNote('lactose'), 'lactose ASCII').toBe(true);
    // Falsos positivos: nota sem keyword nao deve ativar
    expect(isAlertNote('sem cebola'), 'sem cebola nao deve casar').toBe(false);
    expect(isAlertNote(null), 'null safe').toBe(false);
    expect(isAlertNote(''), 'string vazia').toBe(false);
  });
});

test.describe('P1-B — bar × cozinha pelo menu_items.kind, não pelo nome da categoria', () => {
  // O KDS roteia pelo FLAG autoritativo `menu_items.kind` (kds-query.service:
  // bar = kind 'drink', cozinha = o resto). O antigo filtro por
  // LOWER(TRIM(categoria)) = 'bebidas' saiu: mandava drink em categoria com
  // outro nome pra cozinha. A categoria '  BEBIDAS  ' fica como isca: o nome
  // não decide mais nada.
  // UUIDs do seed temporario. Prefixo bbbbbbbb pra deduplicar de outros tests.
  const CAT_ID = 'bbbbbbbb-aaaa-bbbb-cccc-000000000001';
  const ITEM_ID = 'bbbbbbbb-bbbb-bbbb-cccc-000000000001';
  const FOOD_ITEM_ID = 'bbbbbbbb-bbbb-bbbb-cccc-000000000002';
  const ORDER_ID = 'bbbbbbbb-cccc-bbbb-cccc-000000000001';
  const FOOD_ORDER_ID = 'bbbbbbbb-cccc-bbbb-cccc-000000000002';
  const SESSION_ID = '0d324208-01ce-4d5e-b95e-1acba080304c'; // M01

  test.beforeEach(() => {
    psql(
      `INSERT INTO menu_categories (id, name, sort_order) VALUES ('${CAT_ID}', '  BEBIDAS  ', 99); ` +
        `INSERT INTO menu_items (id, category_id, name, price_cents, kind, is_available) VALUES ('${ITEM_ID}', '${CAT_ID}', 'Coca BugB', 500, 'drink', true); ` +
        `INSERT INTO menu_items (id, category_id, name, price_cents, kind, is_available) VALUES ('${FOOD_ITEM_ID}', '${CAT_ID}', 'Porcao BugB', 500, 'food', true); ` +
        `INSERT INTO orders (id, table_session_id, billing_mode, status, notes, total_cents, created_by, created_at, updated_at) VALUES ('${ORDER_ID}', '${SESSION_ID}', 'table', 'received', 'BUG-B', 500, 'qa', now(), now()); ` +
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, subtotal_cents) VALUES ('${ORDER_ID}', '${ITEM_ID}', 1, 500, 500); ` +
        `INSERT INTO orders (id, table_session_id, billing_mode, status, notes, total_cents, created_by, created_at, updated_at) VALUES ('${FOOD_ORDER_ID}', '${SESSION_ID}', 'table', 'received', 'BUG-B-food', 500, 'qa', now(), now()); ` +
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, subtotal_cents) VALUES ('${FOOD_ORDER_ID}', '${FOOD_ITEM_ID}', 1, 500, 500);`,
    );
    // Pedidos entraram via SQL: derruba o cache-aside de 3s do _kds.
    clearKdsCache();
  });

  test.afterEach(() => {
    psql(
      `DELETE FROM order_items WHERE order_id IN ('${ORDER_ID}', '${FOOD_ORDER_ID}'); ` +
        `DELETE FROM orders WHERE id IN ('${ORDER_ID}', '${FOOD_ORDER_ID}'); ` +
        `DELETE FROM menu_items WHERE id IN ('${ITEM_ID}', '${FOOD_ITEM_ID}'); ` +
        `DELETE FROM menu_categories WHERE id='${CAT_ID}';`,
    );
  });

  test('kind=drink vai pro bar e kind=food vai pra cozinha, mesmo na categoria "  BEBIDAS  "', async () => {
    const kitchenRes = await fetch(`${API}/orders/_kds?station=kitchen`, {
      headers: { 'x-staff-key': STAFF_KEY },
    });
    const kitchen = (await kitchenRes.json()) as { orders: Array<{ id: string }> };
    expect(
      kitchen.orders.some((o) => o.id === ORDER_ID),
      'kitchen NAO deve listar pedido de bebida (kind=drink)',
    ).toBe(false);
    expect(
      kitchen.orders.some((o) => o.id === FOOD_ORDER_ID),
      'kitchen deve listar comida mesmo em categoria chamada BEBIDAS',
    ).toBe(true);

    const barRes = await fetch(`${API}/orders/_kds?station=bar`, {
      headers: { 'x-staff-key': STAFF_KEY },
    });
    const bar = (await barRes.json()) as { orders: Array<{ id: string }> };
    expect(
      bar.orders.some((o) => o.id === ORDER_ID),
      'bar deve listar pedido de bebida (kind=drink)',
    ).toBe(true);
    expect(
      bar.orders.some((o) => o.id === FOOD_ORDER_ID),
      'bar NAO deve listar comida so pelo nome da categoria',
    ).toBe(false);
  });
});

test.describe('P2-G — proxy Next.js gateia /cozinha/tv e /bar/tv', () => {
  test('proxy existe e protege as rotas TV', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    // Next 16 renomeou o convention file `middleware.ts` para `proxy.ts`.
    const file = path.resolve(__dirname, '../../../web-staff/src/proxy.ts');
    const src = await fs.readFile(file, 'utf8');
    expect(src, 'proxy deve existir e cobrir /cozinha e /bar').toMatch(
      // [\s\S] em vez da flag /s — tsconfig do workspace targeta < es2018
      // e o tsc --noEmit (validação obrigatória) rejeitava TS1501 aqui.
      /matcher[\s\S]*cozinha[\s\S]*bar|cozinha[\s\S]*bar[\s\S]*matcher/,
    );
    expect(src, 'proxy deve checar cookie tv_pin').toMatch(/tv_pin/);
    expect(src, 'proxy deve redirecionar pra unlock').toMatch(/cozinha\/unlock/);
  });

  test('endpoint /api/tv-unlock existe e tem timing-safe compare', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const file = path.resolve(__dirname, '../../../web-staff/src/app/api/tv-unlock/route.ts');
    const src = await fs.readFile(file, 'utf8');
    expect(src, 'unlock deve usar timingSafeEqual pra evitar side-channel').toMatch(
      /timingSafeEqual/,
    );
    expect(src, 'unlock deve setar cookie httpOnly tv_pin').toMatch(
      /cookies\.set\(\s*['"]tv_pin['"]/,
    );
  });

  test('em dev (sem TV_ACCESS_PIN), GET /cozinha/tv responde 200', async () => {
    const res = await fetch('http://localhost:3002/cozinha/tv', { redirect: 'manual' });
    expect(res.status).toBe(200);
  });
});

test.describe('P2-J — useTableSocket dispara resync no reconnect', () => {
  test('hook tem callback onResync e dispara em reconnects, nao no first connect', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const file = path.resolve(__dirname, '../../src/hooks/useTableSocket.ts');
    const src = await fs.readFile(file, 'utf8');
    expect(src, 'hook deve aceitar onResync? como 3o arg').toMatch(/onResync\??:/);
    expect(src, 'hook deve diferenciar first connect de reconnects').toMatch(/isFirstConnect/);
    expect(src, 'em reconnect deve chamar onResync').toMatch(/onResyncRef\.current\?\.\(\)/);
  });

  test('pedido/page.tsx passa onResync pra reload', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const file = path.resolve(__dirname, '../../src/app/[slug]/pedido/page.tsx');
    const src = await fs.readFile(file, 'utf8');
    // O 3o arg do useTableSocket no pedido/page deve ser () => reload()
    // pra cobrir resync apos reconnect.
    expect(src, 'pedido page deve usar onResync pra refetchar apos reconnect').toMatch(
      /\(\)\s*=>\s*reload\(\),/,
    );
  });
});

test.describe('P2-I — _kds tem rate-limit (RedisThrottleGuard)', () => {
  // Test colocado por ULTIMO no arquivo: flood consome a janela e nao
  // queremos envenenar P1-D/P1-E/etc com 429 espurios em runs back-to-back.
  // beforeAll limpa as keys de throttle no Redis pra garantir janela
  // fresca e teste deterministico.
  test.beforeAll(() => {
    execSync(
      `docker exec restaurant-redis redis-cli --no-raw EVAL "local keys = redis.call('keys', ARGV[1]); for i=1,#keys do redis.call('del', keys[i]) end; return #keys" 0 'throttle:*'`,
      { stdio: 'pipe' },
    );
  });

  test('flood de 250 requests recebe pelo menos um 429 e tambem pelo menos um 200', async () => {
    test.setTimeout(30_000);
    // Limit configurado em 200/60s, janela limpa pelo beforeAll.
    const calls = Array.from({ length: 250 }).map(() =>
      fetch(`${API}/orders/_kds?station=kitchen`, {
        headers: { 'x-staff-key': STAFF_KEY },
      }),
    );
    const statuses = (await Promise.all(calls)).map((r) => r.status);
    const got429 = statuses.filter((s) => s === 429).length;
    const got200 = statuses.filter((s) => s === 200).length;
    expect(got429, 'flood deve gerar pelo menos um 429').toBeGreaterThan(0);
    expect(got200, 'as primeiras calls dentro do limit retornam 200').toBeGreaterThan(0);
  });
});

test.describe('TV-LABEL — TVs nao mostram labels de mock do handoff', () => {
  test('cozinha/tv nao tem texto "1920×1080" nem "KDS NA TV"', async ({ page }) => {
    await page.goto('http://localhost:3002/cozinha/tv');
    const body = await page.textContent('body');
    expect(body).not.toMatch(/1920\s*[×x]\s*1080/i);
    expect(body?.toUpperCase()).not.toContain('KDS NA TV');
  });

  test('bar/tv nao tem texto "1920×1080" nem "Bebidas na TV"', async ({ page }) => {
    await page.goto('http://localhost:3002/bar/tv');
    const body = await page.textContent('body');
    expect(body).not.toMatch(/1920\s*[×x]\s*1080/i);
    expect(body?.toUpperCase()).not.toContain('BEBIDAS NA TV');
  });
});

test.describe('TV-RESP — responsividade sem scroll horizontal', () => {
  const viewports = [
    { w: 1920, h: 1080, label: '1920x1080' },
    { w: 1366, h: 768, label: '1366x768' },
    { w: 1024, h: 768, label: '1024x768' },
  ];

  for (const vp of viewports) {
    test(`cozinha/tv em ${vp.label} nao tem scroll horizontal`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const page = await ctx.newPage();
      await page.goto('http://localhost:3002/cozinha/tv');
      await page.waitForTimeout(1500);
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(
        scrollW,
        `scrollWidth ${scrollW} deve ser <= viewport ${vp.w} + 1`,
      ).toBeLessThanOrEqual(vp.w + 1);
      const header = page.locator('.kds-header');
      await expect(header).toBeVisible();
      await ctx.close();
    });
  }
});

// Contrato atual do proxy do web-staff (ciclo 2, 2026-07-04): sem cookie
// `staff_token` só as 3 rotas de TV (GET _kds, PATCH status, POST
// call-waiter) passam, e mesmo elas só com o gate de TV (tv_pin; no-op em dev
// sem TV_ACCESS_PIN). Qualquer outra rota recebe 401 AUTH_MISSING ANTES de
// chegar na API — o proxy nem injeta a key. Antes era uma allowlist que
// devolvia 404; a proteção (anônimo não alcança rota fora da TV) é a mesma,
// só mudou de forma.
test.describe('P0-1 — proxy sem sessão de staff só abre as rotas de TV', () => {
  const PROXY = 'http://localhost:3002/api/proxy/restaurant_dev';

  test.beforeAll(() => {
    try {
      execSync(
        `docker exec restaurant-redis redis-cli --no-raw EVAL "local keys = redis.call('keys', ARGV[1]); for i=1,#keys do redis.call('del', keys[i]) end; return #keys" 0 'throttle:*'`,
        { stdio: 'pipe' },
      );
    } catch {
      /* no-op */
    }
  });

  async function expectAuthMissing(res: Response) {
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('AUTH_MISSING');
  }

  test('GET /dashboard/overview via proxy sem sessão → 401 AUTH_MISSING', async () => {
    await expectAuthMissing(await fetch(`${PROXY}/dashboard/overview`));
  });

  test('DELETE via proxy sem sessão → 401 AUTH_MISSING', async () => {
    await expectAuthMissing(
      await fetch(`${PROXY}/orders/aaaaaaa1-0000-0000-0000-000000000001`, {
        method: 'DELETE',
      }),
    );
  });

  test('POST fora da TV via proxy sem sessão → 401 AUTH_MISSING', async () => {
    await expectAuthMissing(
      await fetch(`${PROXY}/orders`, {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  test('GET _kds via proxy still works', async () => {
    const res = await fetch(`${PROXY}/orders/_kds?station=kitchen`);
    expect(res.status).toBe(200);
  });

  test('PATCH status via proxy com o contrato da TV (station) avança o preparo', async () => {
    // Mesmo body que o TvKdsBoard manda: estação explícita + passo de preparo.
    resetTvAnchorOrder();
    const res = await fetch(`${PROXY}/orders/aaaaaaa1-0000-0000-0000-000000000001/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress', changedBy: 'kitchen', station: 'kitchen' }),
    });
    expect(res.status, `PATCH status via proxy (TV) deve passar (got ${res.status})`).toBe(200);
  });

  test('PATCH status via proxy sem station → 401 AUTH_TOKEN_REQUIRED (TV não é pessoa)', async () => {
    const res = await fetch(`${PROXY}/orders/aaaaaaa1-0000-0000-0000-000000000001/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'received', changedBy: 'proxy-test' }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('AUTH_TOKEN_REQUIRED');
  });
});

// Contrato atual: a transição de status é autorizada por PAPEL da sessão
// individual (x-staff-token). A key compartilhada representa a estação e só
// avança preparo com `station`; sem isso responde 401 AUTH_TOKEN_REQUIRED.
// Antes "staff-key basta" era o caminho feliz — hoje é exatamente o que a
// API recusa, porque não diz QUEM fez a transição.
test.describe('P0-2 — PATCH /:orderId/status exige sessão individual da equipe', () => {
  const ORDER_ID = 'aaaaaaa1-0000-0000-0000-000000000001';
  let cook: StaffRow;

  function cleanup() {
    resetTvAnchorOrder();
    psql(
      `DELETE FROM order_status_history WHERE order_id='${ORDER_ID}' AND changed_by IN ('${cook.id}','station:kitchen');`,
    );
  }

  test.beforeAll(async () => {
    cook = await staffByRole('cook');
  });

  test.beforeEach(() => cleanup());

  test('PATCH status with session-token (no staff-key) returns 401/403', async () => {
    const { token } = await m01Session();
    const res = await fetch(`${API}/orders/${ORDER_ID}/status`, {
      method: 'PATCH',
      headers: { 'x-session-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress', changedBy: 'cross-table-test' }),
    });
    expect(
      [401, 403].includes(res.status),
      `cliente nao pode avancar preparo (got ${res.status})`,
    ).toBe(true);
  });

  test('PATCH status só com x-staff-key (sem station) → 401 AUTH_TOKEN_REQUIRED', async () => {
    const res = await fetch(`${API}/orders/${ORDER_ID}/status`, {
      method: 'PATCH',
      headers: { 'x-staff-key': STAFF_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress', changedBy: 'p0-test' }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('AUTH_TOKEN_REQUIRED');
  });

  test('PATCH status com sessão individual do cook (cozinha) → 200', async () => {
    const res = await staffFetch<{ orderStatus?: string }>(`/${SLUG}/orders/${ORDER_ID}/status`, {
      method: 'PATCH',
      staff: cook,
      body: JSON.stringify({ status: 'in_progress', station: 'kitchen' }),
    });
    expect(res.status).toBe(200);
    expect(psql(`SELECT status FROM orders WHERE id='${ORDER_ID}';`)).toBe('in_progress');
  });

  test.afterAll(() => cleanup());
});

test.describe('P1-1 — welcome customer race (ON CONFLICT)', () => {
  const TEST_CPF = '24248671352';

  test.beforeAll(() => {
    try {
      execSync(
        `docker exec restaurant-redis redis-cli --no-raw EVAL "local keys = redis.call('keys', ARGV[1]); for i=1,#keys do redis.call('del', keys[i]) end; return #keys" 0 'throttle:*'`,
        { stdio: 'pipe' },
      );
    } catch {
      /* no-op */
    }
  });

  test.afterAll(() => {
    try {
      psql(
        `UPDATE table_sessions SET host_customer_id = NULL WHERE host_customer_id IN (SELECT id FROM customers WHERE cpf = '${TEST_CPF}')`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM scan_verification_requests WHERE customer_id IN (SELECT id FROM customers WHERE cpf = '${TEST_CPF}'); DELETE FROM session_participants WHERE visit_id IN (SELECT id FROM visits WHERE customer_id IN (SELECT id FROM customers WHERE cpf = '${TEST_CPF}')); DELETE FROM visits WHERE customer_id IN (SELECT id FROM customers WHERE cpf = '${TEST_CPF}'); DELETE FROM customers WHERE cpf = '${TEST_CPF}';`,
      );
    } catch {
      /* no-op */
    }
  });

  test('20 parallel POSTs with new CPF: zero 5xx, 1 customer e 1 visita por sessão', async () => {
    test.setTimeout(15_000);
    try {
      psql(
        `UPDATE table_sessions SET host_customer_id = NULL WHERE host_customer_id IN (SELECT id FROM customers WHERE cpf = '${TEST_CPF}')`,
      );
    } catch {
      /* no-op */
    }
    try {
      psql(
        `DELETE FROM scan_verification_requests WHERE customer_id IN (SELECT id FROM customers WHERE cpf = '${TEST_CPF}'); DELETE FROM session_participants WHERE visit_id IN (SELECT id FROM visits WHERE customer_id IN (SELECT id FROM customers WHERE cpf = '${TEST_CPF}')); DELETE FROM visits WHERE customer_id IN (SELECT id FROM customers WHERE cpf = '${TEST_CPF}'); DELETE FROM customers WHERE cpf = '${TEST_CPF}';`,
      );
    } catch {
      /* no-op */
    }
    // O /welcome limita 30 tentativas/15min por IP REAL + sessão da mesa
    // (XFF é ignorado — rotacionar o header não abre bypass). As 20 cabem
    // numa janela limpa; o alvo do teste é o dedup ON CONFLICT (cpf) sob
    // concorrência, não o rate-limit, então zeramos a janela antes.
    clearWelcomeAndThrottleLocks();
    const { token } = await m01Session();
    const calls = Array.from({ length: 20 }).map(() =>
      fetch(`${API}/customer/welcome`, {
        method: 'POST',
        headers: {
          'x-session-token': token,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Race Test', cpf: TEST_CPF, location: WELCOME_LOCATION }),
      }),
    );
    const responses = await Promise.all(calls);
    const statuses = responses.map((r) => r.status);
    const has5xx = statuses.some((s) => s >= 500);
    expect(has5xx, `zero 5xx expected, got: ${statuses.filter((s) => s >= 500)}`).toBe(false);

    // Dedup ON CONFLICT (cpf): 20 cadastros concorrentes → 1 customer só.
    const customerRows = Number(psql(`SELECT count(*) FROM customers WHERE cpf = '${TEST_CPF}';`));
    expect(customerRows, 'ON CONFLICT (cpf) deve deixar 1 customer').toBe(1);

    // Contrato atual (fix do super-count): `visits` é UNIQUE(table_session_id,
    // customer_id) e total_visits é reconciliado por COUNT(visits). Os 20
    // welcomes são na MESMA sessão de mesa → 1 visita. Antes o teste esperava
    // 20, que era exatamente a contagem inflada por reload/re-submit.
    const totalVisits = Number(
      psql(`SELECT total_visits FROM customers WHERE cpf = '${TEST_CPF}';`),
    );
    expect(totalVisits).toBe(1);

    const bodies = await Promise.all(
      responses.filter((r) => r.status === 201).map((r) => r.json()),
    );
    const returningCount = (bodies as { isReturning: boolean }[]).filter(
      (b) => b.isReturning,
    ).length;
    expect(returningCount).toBeGreaterThanOrEqual(19);
  });
});

test.describe('P1-2 — payments confirm/cancel race (CAS)', () => {
  const PAYMENT_ID = 'dddddddd-dddd-dddd-dddd-000000000001';
  // O pagamento precisa nascer na MESMA sessão que o token autentica: o
  // confirm/cancel checa o dono. Antes a sessão vinha de "a mais recente da
  // M01" lida na coleta do arquivo (antes até do ensureTvFixtures).
  let session: TvSession;

  test.beforeEach(async () => {
    session = await m01Session();
    psql(
      `DELETE FROM payments WHERE id = '${PAYMENT_ID}'; ` +
        `INSERT INTO payments (id, table_session_id, amount_cents, status, method, created_at, updated_at) VALUES ('${PAYMENT_ID}', '${session.sessionId}', 5000, 'pending', 'pix', now(), now());`,
    );
  });

  test.afterAll(() => {
    psql(`DELETE FROM payments WHERE id = '${PAYMENT_ID}';`);
  });

  test('5 confirm + 5 cancel parallel: no row with paid_at AND cancelled_at', async () => {
    const { token } = session;
    const confirms = Array.from({ length: 5 }).map(() =>
      fetch(`${API}/payments/${PAYMENT_ID}/confirm`, {
        method: 'POST',
        headers: { 'x-session-token': token, 'content-type': 'application/json' },
        body: JSON.stringify({ pspTransactionId: 'tx-test' }),
      }),
    );
    const cancels = Array.from({ length: 5 }).map(() =>
      fetch(`${API}/payments/${PAYMENT_ID}/cancel`, {
        method: 'PATCH',
        headers: { 'x-session-token': token, 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    await Promise.all([...confirms, ...cancels]);

    const bothSet = Number(
      psql(
        `SELECT count(*) FROM payments WHERE id = '${PAYMENT_ID}' AND paid_at IS NOT NULL AND cancelled_at IS NOT NULL;`,
      ),
    );
    expect(bothSet, 'paid_at AND cancelled_at must not both be set').toBe(0);

    // Contrato atual (A04-PAY-01): o /confirm do CLIENTE não marca pago — só
    // leva a 'awaiting_settlement' (sem paid_at) até webhook de PSP ou staff.
    // 'confirmed' só aparece com a flag de mock PAYMENTS_ALLOW_CLIENT_CONFIRM.
    const status = psql(`SELECT status FROM payments WHERE id = '${PAYMENT_ID}';`);
    expect(
      ['awaiting_settlement', 'confirmed', 'cancelled'].includes(status),
      `final status must be awaiting_settlement, confirmed or cancelled, got ${status}`,
    ).toBe(true);
    if (status === 'awaiting_settlement') {
      const paidAt = psql(`SELECT paid_at FROM payments WHERE id = '${PAYMENT_ID}';`);
      expect(paidAt, 'aguardando compensação não pode ter paid_at').toBe('');
    }
  });
});

test.describe('P1-3 — tv-unlock rate-limit', () => {
  test('30 POSTs with wrong PINs: >= 20 return 429', async () => {
    const calls = Array.from({ length: 30 }).map((_, i) =>
      fetch('http://localhost:3002/api/tv-unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin: `wrong${i}` }),
      }),
    );
    const statuses = (await Promise.all(calls)).map((r) => r.status);
    const got429 = statuses.filter((s) => s === 429).length;
    expect(got429, `expected >= 20 429s, got ${got429}`).toBeGreaterThanOrEqual(20);
  });
});

test.describe('P1-5 — _sweep-auto-confirm requires staff-key', () => {
  test('POST _sweep-auto-confirm with session-token returns 401/403', async () => {
    const { token } = await m01Session();
    const res = await fetch(`${API}/orders/_sweep-auto-confirm`, {
      method: 'POST',
      headers: { 'x-session-token': token },
    });
    expect(
      [401, 403].includes(res.status),
      `sweep must require staff-key (got ${res.status})`,
    ).toBe(true);
  });

  test('POST _sweep-auto-confirm with staff-key returns 200/201', async () => {
    const res = await fetch(`${API}/orders/_sweep-auto-confirm`, {
      method: 'POST',
      headers: { 'x-staff-key': STAFF_KEY },
    });
    expect(res.status).toBeLessThan(300);
  });
});

test.describe('P1-6 — in_progress orders visible in KDS after session close', () => {
  const ORDER_ID = 'eeeeeeee-eeee-eeee-eeee-000000000001';
  const ITEM_ID = '8ebe30e2-0d64-4bc8-96df-c6fcacc7fe34';

  test.afterAll(() => {
    psql(
      `DELETE FROM order_items WHERE order_id = '${ORDER_ID}'; ` +
        `DELETE FROM order_status_history WHERE order_id = '${ORDER_ID}'; ` +
        `DELETE FROM orders WHERE id = '${ORDER_ID}';`,
    );
  });

  test('in_progress order in closed session still appears in _kds', async () => {
    const sessionId = psql(
      `SELECT id FROM table_sessions WHERE table_id = (SELECT id FROM tables WHERE code = 'M01') ORDER BY created_at DESC LIMIT 1;`,
    );
    psql(
      `INSERT INTO orders (id, table_session_id, billing_mode, status, notes, total_cents, created_by, created_at, updated_at) VALUES ('${ORDER_ID}', '${sessionId}', 'table', 'in_progress', 'P1-6-test', 1000, 'qa', now(), now()); ` +
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, subtotal_cents) VALUES ('${ORDER_ID}', '${ITEM_ID}', 1, 1000, 1000);`,
    );

    psql(`UPDATE table_sessions SET status = 'closed' WHERE id = '${sessionId}';`);

    // Pedido entrou via SQL: derruba o cache-aside de 3s do _kds.
    clearKdsCache();
    const res = await fetch(`${API}/orders/_kds?station=kitchen`, {
      headers: { 'x-staff-key': STAFF_KEY },
    });
    const body = (await res.json()) as { orders: Array<{ id: string }> };
    expect(
      body.orders.some((o) => o.id === ORDER_ID),
      'in_progress order should appear even with closed session',
    ).toBe(true);

    psql(`UPDATE table_sessions SET status = 'active' WHERE id = '${sessionId}';`);
  });
});

test.describe('P2-6 — dashboard/staff/promotions require staff-key', () => {
  test('GET /dashboard/overview with session-token returns 401/403', async () => {
    const { token } = await m01Session();
    const res = await fetch(`${API}/dashboard/overview`, {
      headers: { 'x-session-token': token },
    });
    expect(
      [401, 403].includes(res.status),
      `dashboard must require staff-key (got ${res.status})`,
    ).toBe(true);
  });

  // Contrato atual: dashboard é StaffOnly + ManagerOnly. A key compartilhada
  // só abre o primeiro portão; sem identidade de gerente o ManagerOnly
  // responde 401 AUTH_MISSING. Antes "staff-key → 200" era o caminho feliz.
  test('GET /dashboard/overview só com x-staff-key → 401 AUTH_MISSING', async () => {
    const res = await fetch(`${API}/dashboard/overview`, {
      headers: { 'x-staff-key': STAFF_KEY },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('AUTH_MISSING');
  });

  test('GET /dashboard/overview com sessão individual do gerente → 200', async () => {
    const res = await staffFetch(`/${SLUG}/dashboard/overview`, {
      staff: await staffByRole('manager'),
    });
    expect(res.status).toBe(200);
  });
});

test.describe('P1-NEW-1 — deliveries endpoints require staff-key only', () => {
  const ENDPOINTS = [
    { method: 'GET', path: '/deliveries/pending' },
    { method: 'POST', path: '/deliveries/claim/aaaaaaa1-0000-0000-0000-000000000001' },
    { method: 'POST', path: '/deliveries/fake-delivery-id/delivered' },
  ] as const;

  for (const ep of ENDPOINTS) {
    test(`${ep.method} ${ep.path} with session-token returns 401/403`, async () => {
      const { token } = await m01Session();
      const res = await fetch(`${API}${ep.path}`, {
        method: ep.method,
        headers: { 'x-session-token': token, 'content-type': 'application/json' },
      });
      expect(
        [401, 403].includes(res.status),
        `${ep.method} ${ep.path} must reject session-token (got ${res.status})`,
      ).toBe(true);
    });
  }

  test('GET /deliveries/pending with staff-key returns 200', async () => {
    const res = await fetch(`${API}/deliveries/pending`, {
      headers: { 'x-staff-key': STAFF_KEY },
    });
    expect(res.status).toBe(200);
  });
});

test.describe('P1-NEW-2 — idempotencyKey atomic SET NX', () => {
  const createdOrderIds: string[] = [];

  test.afterAll(() => {
    if (createdOrderIds.length) {
      psql(
        `DELETE FROM order_status_history WHERE order_id IN (${createdOrderIds.map((id) => `'${id}'`).join(',')});` +
          `DELETE FROM order_item_extras WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (${createdOrderIds.map((id) => `'${id}'`).join(',')}));` +
          `DELETE FROM order_items WHERE order_id IN (${createdOrderIds.map((id) => `'${id}'`).join(',')});` +
          `DELETE FROM orders WHERE id IN (${createdOrderIds.map((id) => `'${id}'`).join(',')});`,
      );
    }
  });

  test('5 parallel POSTs with same idempotencyKey produce exactly 1 orderId', async () => {
    const crypto = await import('node:crypto');
    const { token } = await m01Session();
    const idempotencyKey = crypto.randomUUID();
    const payload = JSON.stringify({
      billingMode: 'table',
      items: [{ menuItemId: '8ebe30e2-0d64-4bc8-96df-c6fcacc7fe34', quantity: 1 }],
      idempotencyKey,
    });

    const results = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        fetch(`${API}/orders`, {
          method: 'POST',
          headers: { 'x-session-token': token, 'content-type': 'application/json' },
          body: payload,
        }).then(async (r) => ({
          status: r.status,
          body: (await r.json()) as { orderId?: string; idempotent?: boolean },
        })),
      ),
    );

    const succeeded = results.filter((r) => r.status === 201 || r.body.orderId);
    const ids = new Set(succeeded.map((r) => r.body.orderId).filter(Boolean));
    for (const id of ids) createdOrderIds.push(id!);

    expect(ids.size, `expected 1 unique orderId, got ${ids.size}: ${[...ids].join(', ')}`).toBe(1);

    const idempotentCount = succeeded.filter((r) => r.body.idempotent === true).length;
    expect(idempotentCount, 'losers should return idempotent:true').toBeGreaterThanOrEqual(1);
  });
});

test.describe('P2-NEW-1+2 — TV grid columns at various viewports', () => {
  const STAFF = 'http://localhost:3002';

  test('1920px kitchen grid has exactly 4 columns (not 5)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await page.goto(`${STAFF}/cozinha/tv`, { waitUntil: 'networkidle' });
    const cols = await page.evaluate(() => {
      const grid = document.querySelector('.kds-grid') as HTMLElement;
      if (!grid) return -1;
      return getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    });
    expect(cols, '1920px kitchen should be 4 columns').toBe(4);
    await ctx.close();
  });

  test('1920px bar grid has exactly 3 columns', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await page.goto(`${STAFF}/bar/tv`, { waitUntil: 'networkidle' });
    const cols = await page.evaluate(() => {
      const grid = document.querySelector('.kds-grid') as HTMLElement;
      if (!grid) return -1;
      return getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    });
    expect(cols, '1920px bar should be 3 columns').toBe(3);
    await ctx.close();
  });

  test('1366px grid has 2 columns', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    await page.goto(`${STAFF}/cozinha/tv`, { waitUntil: 'networkidle' });
    const cols = await page.evaluate(() => {
      const grid = document.querySelector('.kds-grid') as HTMLElement;
      if (!grid) return -1;
      return getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    });
    expect(cols, '1366px should be 2 columns').toBe(2);
    await ctx.close();
  });

  test('768px grid has 1 column', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    const page = await ctx.newPage();
    await page.goto(`${STAFF}/cozinha/tv`, { waitUntil: 'networkidle' });
    const cols = await page.evaluate(() => {
      const grid = document.querySelector('.kds-grid') as HTMLElement;
      if (!grid) return -1;
      return getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    });
    expect(cols, '768px should be 1 column').toBe(1);
    await ctx.close();
  });
});

test.describe('P2-NEW-3 — header counters condense on small screens', () => {
  const STAFF = 'http://localhost:3002';

  test('1920px shows all 5 counters', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await page.goto(`${STAFF}/cozinha/tv`, { waitUntil: 'networkidle' });
    const count = await page.evaluate(() => {
      const counters = document.querySelector('.kds-counters');
      if (!counters) return 0;
      return counters.querySelectorAll('[style*="text-transform"]').length;
    });
    expect(count, '1920px should show 5 counters').toBe(5);
    await ctx.close();
  });

  test('800px shows only 2 counters (Todos + Atrasados)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
    const page = await ctx.newPage();
    await page.goto(`${STAFF}/cozinha/tv`, { waitUntil: 'networkidle' });
    const visibleCount = await page.evaluate(() => {
      const counters = document.querySelector('.kds-counters');
      if (!counters) return 0;
      const labels = counters.querySelectorAll('[style*="text-transform"]');
      let visible = 0;
      labels.forEach((el) => {
        const wrapper = el.closest('.kds-counter-secondary');
        if (!wrapper || getComputedStyle(wrapper).display !== 'none') visible++;
      });
      return visible;
    });
    expect(visibleCount, '800px should show only 2 counters').toBe(2);
    await ctx.close();
  });
});
