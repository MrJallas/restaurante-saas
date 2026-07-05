/**
 * P1 IDOR (write-path) — POST /:slug/complaints (ComplaintsService.create).
 *
 * O endpoint público roda sob SessionGuard e passa
 * tableSessionId = session.sessionId. Antes o INSERT gravava input.orderId /
 * input.visitId VERBATIM do body sem checar que pertenciam à sessão do caller —
 * um atacante fornecia o UUID de um pedido/visita de OUTRA mesa e a reclamação
 * era anexada àquele pedido, poluindo a linkagem complaint→order/visit que o
 * manager vê.
 *
 * Espelha o guard de feedbacks.service (visits.table_session_id ===
 * tableSessionId → 403 senão) e courtesies (Forbidden se table_session_id !==
 * sessionId).
 *
 * Cobre também o caminho interno createFromRating (chamado pelo
 * order-ratings), que NÃO passa tableSessionId — deve permanecer isento do
 * guard e continuar inserindo o pedido cru (o order-ratings já validou o
 * pedido antes de chamar). Se este teste quebrar, a assinatura/comportamento
 * de createFromRating regrediu.
 */

import { ForbiddenException } from '@nestjs/common';
import { ComplaintsService } from './complaints.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

const CALLER_SESSION = 'sess-caller';
const OTHER_SESSION = 'sess-other';

interface FakeDb {
  /** orderId → table_session_id que o possui. */
  orders: Map<string, string>;
  /** visitId → table_session_id que a possui. */
  visits: Map<string, string>;
  calls: Array<{ sql: string; params: unknown[] }>;
  inserted: Array<Record<string, unknown>>;
  conn: TenantConnectionProvider;
}

function fakeDb(seed?: {
  orders?: Array<[string, string]>;
  visits?: Array<[string, string]>;
}): FakeDb {
  const orders = new Map<string, string>(seed?.orders ?? []);
  const visits = new Map<string, string>(seed?.visits ?? []);
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const inserted: Array<Record<string, unknown>> = [];

  const query = async (sql: string, params: unknown[] = []): Promise<unknown> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    calls.push({ sql: s, params });

    // Guard: ownership do orderId fornecido no body.
    if (s.startsWith('SELECT id FROM orders WHERE id = $1 AND table_session_id = $2')) {
      const [orderId, sessionId] = params as [string, string];
      return orders.get(orderId) === sessionId ? [{ id: orderId }] : [];
    }

    // Guard: ownership do visitId fornecido no body.
    if (s.startsWith('SELECT id FROM visits WHERE id = $1 AND table_session_id = $2')) {
      const [visitId, sessionId] = params as [string, string];
      return visits.get(visitId) === sessionId ? [{ id: visitId }] : [];
    }

    // Resolução server-side de visitId via participantes (só quando ausente).
    if (s.startsWith('SELECT visit_id FROM session_participants')) {
      return [];
    }

    if (s.startsWith('INSERT INTO complaints')) {
      const [
        customerId,
        visitId,
        orderId,
        orderRatingId,
        rating,
        problemType,
        text,
        attachedImageUrl,
      ] = params as unknown[];
      const row: Record<string, unknown> = {
        id: `complaint-${inserted.length + 1}`,
        customer_id: customerId,
        visit_id: visitId,
        order_id: orderId,
        order_rating_id: orderRatingId,
        rating,
        problem_type: problemType,
        text,
        attached_image_url: attachedImageUrl,
        status: 'pending_review',
        submitted_at: '2026-07-04T00:00:00.000Z',
      };
      inserted.push(row);
      return [row];
    }

    // getEnrichedRow / getEnrichedRowForSession — devolvem a row inserida.
    if (s.startsWith('SELECT c.*,')) {
      const id = params[0] as string;
      const row = inserted.find((r) => r.id === id);
      return row ? [{ ...row, table_session_id: null, table_number: null, customer_name: null }] : [];
    }

    throw new Error(`fake complaints: SQL não roteado: ${s}`);
  };

  return {
    orders,
    visits,
    calls,
    inserted,
    conn: { query } as unknown as TenantConnectionProvider,
  };
}

function makeService(db: FakeDb) {
  // EventsGateway é @Optional() — passamos undefined pra não emitir sockets.
  return new ComplaintsService(db.conn, undefined);
}

describe('ComplaintsService.create — P1 IDOR write-path', () => {
  it('REJEITA (403) orderId de OUTRA sessão', async () => {
    const db = fakeDb({ orders: [['order-victim', OTHER_SESSION]] });
    const svc = makeService(db);

    await expect(
      svc.create({
        customerId: 'cust-attacker',
        orderId: 'order-victim',
        text: 'reclamação forjada',
        tableSessionId: CALLER_SESSION,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Nenhuma row deve ter sido inserida.
    expect(db.inserted).toHaveLength(0);
  });

  it('REJEITA (403) visitId de OUTRA sessão', async () => {
    const db = fakeDb({ visits: [['visit-victim', OTHER_SESSION]] });
    const svc = makeService(db);

    await expect(
      svc.create({
        customerId: 'cust-attacker',
        visitId: 'visit-victim',
        text: 'reclamação forjada',
        tableSessionId: CALLER_SESSION,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(db.inserted).toHaveLength(0);
  });

  it('ACEITA orderId da PRÓPRIA sessão', async () => {
    const db = fakeDb({ orders: [['order-mine', CALLER_SESSION]] });
    const svc = makeService(db);

    const result = await svc.create({
      customerId: 'cust-me',
      orderId: 'order-mine',
      text: 'demora no prato',
      tableSessionId: CALLER_SESSION,
    });

    expect(result.id).toBe('complaint-1');
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0].order_id).toBe('order-mine');
  });

  it('ACEITA visitId da PRÓPRIA sessão', async () => {
    const db = fakeDb({ visits: [['visit-mine', CALLER_SESSION]] });
    const svc = makeService(db);

    const result = await svc.create({
      customerId: 'cust-me',
      visitId: 'visit-mine',
      text: 'item faltando',
      tableSessionId: CALLER_SESSION,
    });

    expect(result.id).toBe('complaint-1');
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0].visit_id).toBe('visit-mine');
  });

  it('ACEITA quando orderId/visitId AUSENTES (resolvidos server-side)', async () => {
    const db = fakeDb();
    const svc = makeService(db);

    const result = await svc.create({
      customerId: 'cust-me',
      text: 'reclamação sem pedido específico',
      tableSessionId: CALLER_SESSION,
    });

    expect(result.id).toBe('complaint-1');
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0].order_id).toBeNull();
    // Sem session_participants, o guard não roda pra order/visit ausentes.
    const guardCalls = db.calls.filter(
      (c) => c.sql.startsWith('SELECT id FROM orders') || c.sql.startsWith('SELECT id FROM visits'),
    );
    expect(guardCalls).toHaveLength(0);
  });
});

describe('ComplaintsService.createFromRating — caminho interno (order-ratings)', () => {
  it('NÃO regride: insere o pedido cru sem passar por guard de sessão', async () => {
    // createFromRating NÃO passa tableSessionId → guard IDOR não roda.
    // Aqui o orderId NEM existe no fake de orders — se o guard rodasse,
    // devolveria 403. A inserção precisa acontecer normalmente.
    const db = fakeDb();
    const svc = makeService(db);

    const result = await svc.createFromRating({
      customerId: 'cust-me',
      orderId: 'order-from-rating',
      orderRatingId: 'rating-1',
      rating: 2,
      comment: 'prato frio',
      problemType: 'comida-fria',
    });

    expect(result.id).toBe('complaint-1');
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0].order_id).toBe('order-from-rating');
    expect(db.inserted[0].rating).toBe(2);

    // Prova de que o guard NÃO foi acionado no caminho interno.
    const guardCalls = db.calls.filter(
      (c) => c.sql.startsWith('SELECT id FROM orders') || c.sql.startsWith('SELECT id FROM visits'),
    );
    expect(guardCalls).toHaveLength(0);
  });
});
