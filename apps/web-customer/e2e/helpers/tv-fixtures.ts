import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';

/**
 * Fixtures determinísticas das suites TV (tv-kds + tv-coverage).
 *
 * Os specs referenciam UUIDs fixos (ex.: `0d324208…` table_session,
 * `aaaaaaa1…001` order, `8ebe30e2…` menu_item) e assinam o `session/init`
 * com um secret HMAC hard-coded por mesa. Esses dados nunca foram
 * versionados como seed — foram escritos contra um snapshot local do
 * autor. Este helper recria tudo de forma IDEMPOTENTE no `beforeAll`,
 * sincronizando o `tables.qr_hmac_secret` com o secret que os specs
 * assinam, de modo que as suites passem em QUALQUER DB de dev.
 *
 * Tudo via `docker exec psql` (mesmo compromisso dos specs: o repo não
 * expõe um proxy SQL e adicionar `pg` só pros testes aumentaria o
 * footprint). Em CI sem docker exec, as funções viram no-op tolerante.
 */

const API_BASE_URL = (process.env.E2E_API_BASE_URL ?? 'http://localhost:3001/api').replace(
  /\/$/,
  '',
);
const SLUG = 'restaurant_dev';

/** Secret HMAC que os specs assinam para a mesa M01 (espelhado no DB). */
export const TV_M01_SECRET = '38889aad-20d1-4778-b4ab-df35774c0398';
/** Secret HMAC que os specs assinam para a mesa M02 (espelhado no DB). */
export const TV_M02_SECRET = '2f00b359-6d69-408a-a50e-84ffbe44ea45';
/** table_session ativa em M01 com UUID fixo usado pelos inserts dos specs. */
export const TV_SESSION_ID = '0d324208-01ce-4d5e-b95e-1acba080304c';
/** Pedido âncora (P1-A / P0-2 / P0-1 fazem UPDATE+PATCH nele). */
export const TV_ANCHOR_ORDER_ID = 'aaaaaaa1-0000-0000-0000-000000000001';
/** menu_item de cozinha (não-bebida) reusado por vários inserts. */
export const TV_MENU_ITEM_ID = '8ebe30e2-0d64-4bc8-96df-c6fcacc7fe34';
/** Customer "Maria Silva" do seed (P1-G sobrescreve/restaura o name). */
export const TV_MARIA_CPF = '52998224725';

function psqlExec(sql: string): string {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'restaurant-postgres',
      'psql',
      '-U',
      'postgres',
      '-p',
      '5434',
      '-d',
      'restaurant_saas',
      '-tA',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input: `SET search_path = ${SLUG};\n${sql}`, encoding: 'utf8' },
  ).trim();
}

/**
 * Token de acesso diário do QR físico. Mesma derivação do backend
 * (`QrCodeService.generateDailyAccessToken`) e do helper canônico
 * `physical-qr.ts#makeDailyAccessToken`:
 *   accessToken = `${YYYY-MM-DD}.` + HMAC_SHA256(secret, `qr-access:${code}:${day}`)
 * Válido apenas para o dia UTC corrente. Sem ele, o `session/init`
 * responde 401 "Token do QR Code ausente" desde o hardening do QR
 * físico (2026-06-09/10).
 */
export function dailyAccessToken(tableCode: string, secret: string, date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  const signature = createHmac('sha256', secret)
    .update(`qr-access:${tableCode}:${day}`)
    .digest('hex');
  return `${day}.${signature}`;
}

/**
 * Sessão de mesa como o cliente real recebe do `session/init`.
 *
 * - `sessionId`: UUID de `table_sessions.id` — só serve pra SQL/asserts.
 * - `token`: bearer opaco `HMAC(SESSION_TOKEN_SECRET, sessionId)` que vai no
 *   `x-session-token` (A07). Mandar o `sessionId` no header responde 401
 *   AUTH_INVALID — os specs de TV foram escritos quando os dois eram iguais.
 */
export interface TvSession {
  sessionId: string;
  token: string;
}

/**
 * Faz `POST /:slug/session/init` para uma mesa de teste (M01/M02) com
 * HMAC + accessToken válidos e devolve `sessionId` + `token`. Requer que
 * `ensureTvFixtures()` já tenha rodado (sincroniza o secret no DB).
 */
export async function initTvSession(
  tableCode: 'M01' | 'M02',
  secret: string = tableCode === 'M01' ? TV_M01_SECRET : TV_M02_SECRET,
): Promise<TvSession> {
  const ts = Date.now();
  const hmacSignature = createHmac('sha256', secret).update(`${tableCode}:${ts}`).digest('hex');
  const res = await fetch(`${API_BASE_URL}/${SLUG}/session/init`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tableCode,
      hmacSignature,
      timestamp: String(ts),
      accessToken: dailyAccessToken(tableCode, secret),
    }),
  });
  if (res.status !== 201) {
    throw new Error(`session/init (${tableCode}) falhou: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { sessionId?: string; token?: string };
  if (!body.sessionId || !body.token) {
    throw new Error(`session/init (${tableCode}) sem sessionId/token: ${JSON.stringify(body)}`);
  }
  return { sessionId: body.sessionId, token: body.token };
}

/**
 * Invalida o cache-aside do `_kds` (`cache:kds:<slug>:<station>`, TTL 3s).
 * Os specs inserem pedidos direto via SQL, sem passar pelo write-side que
 * mantém a TV em dia; sem isto a leitura seguinte pode vir do snapshot que o
 * teste anterior acabou de popular e o pedido novo "não aparece".
 */
export function clearKdsCache(): void {
  redisDelPattern(`cache:kds:${SLUG}:*`);
}

function redisDelPattern(pattern: string): void {
  try {
    execFileSync(
      'docker',
      [
        'exec',
        'restaurant-redis',
        'redis-cli',
        '--no-raw',
        'EVAL',
        "local keys = redis.call('keys', ARGV[1]); for i=1,#keys do redis.call('del', keys[i]) end; return #keys",
        '0',
        pattern,
      ],
      { stdio: 'pipe' },
    );
  } catch {
    /* Em CI sem docker exec, vira no-op. */
  }
}

/**
 * Limpa locks que envenenam runs back-to-back:
 *  - `throttle:*` — janela do rate-limit do `_kds` / welcome.
 *  - `customers:welcome:*` — lock anti-flood do welcome; um 403/erro
 *    conta como tentativa e trava ~15min, gerando 429 espúrio em
 *    P1-G/P1-1/SURPRESA na rodada seguinte.
 */
export function clearWelcomeAndThrottleLocks(): void {
  for (const pattern of ['customers:welcome:*', 'throttle:*']) {
    redisDelPattern(pattern);
  }
}

/**
 * Teardown FK-safe de customers de teste por predicado de CPF/nome.
 * `scan_verification_requests.customer_id` é NOT NULL sem ON DELETE CASCADE
 * (migration 049) e essas rows são criadas pelo welcome (upsertParticipant →
 * ensureForParticipant em participantes pendentes). Por isso PRECISAM sair
 * ANTES de `customers` — senão o `DELETE FROM customers` estoura 23503 e, com
 * o try/catch no-op dos cleanups, vaza customer + scan rows no DB
 * compartilhado a cada run (achado da auditoria de pendências).
 *
 * `cpfWhere` é uma cláusula booleana sobre `customers` — ex.:
 * `"cpf IN ('5...','5...')"` ou `"name LIKE 'QA-R5-Flood%'"`.
 */
export function purgeTvTestCustomers(cpfWhere: string): void {
  const sel = `SELECT id FROM customers WHERE ${cpfWhere}`;
  psqlExec(`
    DELETE FROM scan_verification_requests WHERE customer_id IN (${sel});
    DELETE FROM feedbacks WHERE customer_id IN (${sel})
       OR visit_id IN (SELECT id FROM visits WHERE customer_id IN (${sel}));
    DELETE FROM order_ratings WHERE customer_id IN (${sel});
    DELETE FROM session_participants WHERE customer_id IN (${sel});
    UPDATE table_sessions SET host_customer_id = NULL WHERE host_customer_id IN (${sel});
    DELETE FROM visits WHERE customer_id IN (${sel});
    DELETE FROM customers WHERE ${cpfWhere};
  `);
}

/**
 * Volta o pedido âncora pra `received` no PEDIDO e nos ITENS. O preparo
 * anda por `order_items` (advanceStationItems só move item em `received` →
 * `in_progress` → `ready`); resetar só `orders.status` deixaria os itens
 * adiantados de uma rodada anterior e o teste não seria determinístico.
 */
export function resetTvAnchorOrder(): void {
  psqlExec(`
    UPDATE orders SET status = 'received', updated_at = now() WHERE id = '${TV_ANCHOR_ORDER_ID}';
    UPDATE order_items SET status = 'received', prep_started_at = NULL
     WHERE order_id = '${TV_ANCHOR_ORDER_ID}';
  `);
  clearKdsCache();
}

/**
 * Cria/garante (idempotente) os fixtures de UUID fixo que tv-kds e
 * tv-coverage assumem pré-existentes. Seguro pra rodar em qualquer DB
 * de dev com a seed demo padrão (categorias "Pratos Principais"/"Bebidas").
 */
export function ensureTvFixtures(): void {
  psqlExec(`
    -- 1. Sincroniza o secret HMAC das mesas de teste com o valor que os
    --    specs assinam (o comentário dos specs já previa "sincronizado
    --    pela suite test infra"). Per-table, validado pelo session/init.
    UPDATE tables SET qr_hmac_secret = '${TV_M01_SECRET}', is_active = true, updated_at = now()
      WHERE code = 'M01';
    UPDATE tables SET qr_hmac_secret = '${TV_M02_SECRET}', is_active = true, updated_at = now()
      WHERE code = 'M02';

    -- 2. table_session ativa com UUID fixo, ancorada na mesa M01.
    INSERT INTO table_sessions (id, table_id, status, created_at, updated_at)
    SELECT '${TV_SESSION_ID}', t.id, 'active', now(), now()
      FROM tables t WHERE t.code = 'M01'
    ON CONFLICT (id) DO UPDATE
      SET status = 'active', table_id = EXCLUDED.table_id, closed_at = NULL, updated_at = now();

    -- 3. menu_item de cozinha (categoria não-bebida → roteia pro kitchen).
    INSERT INTO menu_items (id, category_id, name, price_cents, kind, is_available)
    SELECT '${TV_MENU_ITEM_ID}', c.id, 'Picanha (QA Fixture)', 7900, 'food', true
      FROM menu_categories c
     WHERE c.name !~* 'bebida'
     ORDER BY c.sort_order
     LIMIT 1
    ON CONFLICT (id) DO UPDATE
      SET category_id = EXCLUDED.category_id, kind = 'food', is_available = true, updated_at = now();

    -- 4. Pedido âncora na sessão fixa (P1-A/P0-2 resetam status e dão PATCH).
    INSERT INTO orders (id, table_session_id, billing_mode, status, notes, total_cents, created_by, created_at, updated_at)
    VALUES ('${TV_ANCHOR_ORDER_ID}', '${TV_SESSION_ID}', 'table', 'received', 'tv-fixture-anchor', 7900, 'qa', now(), now())
    ON CONFLICT (id) DO UPDATE
      SET table_session_id = EXCLUDED.table_session_id, status = 'received', updated_at = now();

    -- 5. Item do pedido âncora (idempotente).
    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, subtotal_cents)
    SELECT '${TV_ANCHOR_ORDER_ID}', '${TV_MENU_ITEM_ID}', 1, 7900, 7900
     WHERE NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = '${TV_ANCHOR_ORDER_ID}');

    -- 6. Customer "Maria Silva" (P1-G usa o CPF do seed; restaura o name).
    INSERT INTO customers (name, cpf) VALUES ('Maria Silva', '${TV_MARIA_CPF}')
    ON CONFLICT (cpf) DO UPDATE SET name = 'Maria Silva', updated_at = now();
  `);
}
