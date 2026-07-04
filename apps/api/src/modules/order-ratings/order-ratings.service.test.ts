/**
 * P0 da auditoria 2026-07-03: o `delivered` cria a row do prompt
 * (rating NULL) e a resposta real do cliente batia no
 * `ON CONFLICT (order_id) DO NOTHING` — nota + comentário descartados e
 * o auto-complaint (nota ≤2) nunca disparava no fluxo padrão.
 *
 * O fake do TenantConnectionProvider modela a SEMÂNTICA do Postgres para
 * a tabela order_ratings (UNIQUE(order_id), DO NOTHING, DO UPDATE com
 * guard `WHERE ... submitted_at IS NULL`): o comportamento do teste
 * depende do SQL que o service envia, como no banco real — não de qual
 * método foi chamado. Prova E2E contra o Postgres real fica na validação
 * iOS da fatia (psql before/after).
 */

import { OrderRatingsService } from './order-ratings.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { ComplaintsService } from '../complaints/complaints.service';

const ORDER = 'aaaaaaa1-0000-4000-8000-000000000001';
const CUSTOMER = 'bbbbbbb1-0000-4000-8000-000000000001';
const VISIT = 'ccccccc1-0000-4000-8000-000000000001';
const NOW = '2026-07-03T12:00:00.000Z';

interface RatingRow {
  id: string;
  order_id: string;
  customer_id: string | null;
  visit_id: string | null;
  rating: number | null;
  comment: string | null;
  prompted_at: string | null;
  submitted_at: string | null;
}

/** Mini-modelo em memória da order_ratings com semântica de upsert do PG. */
function fakeOrderRatingsDb() {
  const rows = new Map<string, RatingRow>();
  let seq = 0;

  const resolveValue = (expr: string, params: unknown[]): unknown => {
    if (expr === 'now()') return NOW;
    const param = expr.match(/^\$(\d+)$/);
    if (param) return params[parseInt(param[1], 10) - 1] ?? null;
    throw new Error(`fake order_ratings: expressão de VALUES não modelada: ${expr}`);
  };

  /** Split por vírgula fora de parênteses (now(), COALESCE(a, b)…). */
  const splitTopLevel = (list: string): string[] => {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of list) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  };

  const applySet = (existing: RatingRow, setClause: string, incoming: Record<string, unknown>) => {
    for (const assignment of splitTopLevel(setClause)) {
      const [col, rhs] = assignment.split('=').map((p) => p.trim());
      if (rhs === 'now()') {
        (existing as unknown as Record<string, unknown>)[col] = NOW;
      } else if (rhs === `EXCLUDED.${col}`) {
        (existing as unknown as Record<string, unknown>)[col] = incoming[col] ?? null;
      } else if (rhs === `COALESCE(order_ratings.${col}, EXCLUDED.${col})`) {
        const current = (existing as unknown as Record<string, unknown>)[col];
        (existing as unknown as Record<string, unknown>)[col] = current ?? incoming[col] ?? null;
      } else {
        throw new Error(`fake order_ratings: SET não modelado: ${assignment}`);
      }
    }
  };

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('INSERT INTO order_ratings')) {
      const shape = s.match(/INSERT INTO order_ratings \(([^)]+)\) VALUES \((.+?)\) ON CONFLICT/);
      if (!shape) throw new Error(`fake order_ratings: INSERT não parseável: ${s}`);
      const cols = shape[1].split(',').map((c) => c.trim());
      const vals = splitTopLevel(shape[2]).map((v) => resolveValue(v, params));
      const incoming: Record<string, unknown> = {};
      cols.forEach((c, i) => (incoming[c] = vals[i]));

      const returning = /RETURNING \*/.test(s);
      const existing = rows.get(incoming.order_id as string);
      if (!existing) {
        const row: RatingRow = {
          id: `rating-${++seq}`,
          order_id: incoming.order_id as string,
          customer_id: (incoming.customer_id as string | undefined) ?? null,
          visit_id: (incoming.visit_id as string | undefined) ?? null,
          rating: (incoming.rating as number | undefined) ?? null,
          comment: (incoming.comment as string | undefined) ?? null,
          prompted_at: (incoming.prompted_at as string | undefined) ?? null,
          submitted_at: (incoming.submitted_at as string | undefined) ?? null,
        };
        rows.set(row.order_id, row);
        return returning ? [{ ...row }] : [];
      }

      // Conflito na UNIQUE(order_id):
      if (/ON CONFLICT \(order_id\) DO NOTHING/.test(s)) return [];
      const doUpdate = s.match(
        /ON CONFLICT \(order_id\) DO UPDATE SET (.+?)(?: WHERE (.+?))?(?: RETURNING \*)?$/,
      );
      if (doUpdate) {
        const guard = doUpdate[2];
        if (guard) {
          if (!/submitted_at IS NULL/.test(guard)) {
            throw new Error(`fake order_ratings: guard não modelado: ${guard}`);
          }
          if (existing.submitted_at !== null) return [];
        }
        applySet(existing, doUpdate[1], incoming);
        return returning ? [{ ...existing }] : [];
      }
      throw new Error(`fake order_ratings: conflito sem ON CONFLICT modelado: ${s}`);
    }

    if (s.startsWith('SELECT * FROM order_ratings WHERE order_id')) {
      const row = rows.get(params[0] as string);
      return row ? [{ ...row }] : [];
    }

    throw new Error(`fake order_ratings: SQL não roteado: ${s}`);
  };

  return {
    rows,
    conn: { query } as unknown as TenantConnectionProvider,
  };
}

function fakeComplaints() {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    svc: {
      createFromRating: async (input: Record<string, unknown>) => {
        calls.push(input);
        return { id: 'complaint-1' };
      },
    } as unknown as ComplaintsService,
  };
}

function makeService() {
  const db = fakeOrderRatingsDb();
  const complaints = fakeComplaints();
  const service = new OrderRatingsService(db.conn, complaints.svc);
  return { service, db, complaints };
}

describe('OrderRatingsService — fluxo prompt (delivered) → resposta real do cliente', () => {
  it('persiste nota e comentário quando o prompt já criou a row', async () => {
    const { service, db } = makeService();
    await service.schedulePromptForDelivered({
      orderId: ORDER,
      customerId: CUSTOMER,
      visitId: VISIT,
    });

    const result = await service.submit({
      orderId: ORDER,
      customerId: CUSTOMER,
      visitId: VISIT,
      rating: 5,
      comment: 'Tudo excelente',
    });

    expect(result.alreadyRated).toBe(false);
    expect(result.rating).toBe(5);
    expect(result.comment).toBe('Tudo excelente');
    const stored = db.rows.get(ORDER)!;
    expect(stored.rating).toBe(5);
    expect(stored.comment).toBe('Tudo excelente');
    expect(stored.submitted_at).not.toBeNull();
  });

  it('nota ≤2 com comentário dispara o auto-complaint no fluxo do prompt', async () => {
    const { service, complaints } = makeService();
    await service.schedulePromptForDelivered({ orderId: ORDER, customerId: CUSTOMER });

    const result = await service.submit({
      orderId: ORDER,
      customerId: CUSTOMER,
      rating: 1,
      comment: 'Veio frio e atrasado',
    });

    expect(complaints.calls).toHaveLength(1);
    expect(complaints.calls[0].orderId).toBe(ORDER);
    expect(result.complaintId).toBe('complaint-1');
    expect(result.redirectTo).toBe('/complaint/complaint-1');
  });

  it('segunda avaliação do mesmo pedido continua bloqueada (idempotência)', async () => {
    const { service, complaints, db } = makeService();
    await service.schedulePromptForDelivered({ orderId: ORDER, customerId: CUSTOMER });
    await service.submit({ orderId: ORDER, customerId: CUSTOMER, rating: 5, comment: 'Ótimo' });

    const second = await service.submit({
      orderId: ORDER,
      customerId: CUSTOMER,
      rating: 1,
      comment: 'mudei de ideia',
    });

    expect(second.alreadyRated).toBe(true);
    expect(second.rating).toBe(5); // devolve a avaliação original, não a re-tentativa
    expect(db.rows.get(ORDER)!.rating).toBe(5);
    expect(complaints.calls).toHaveLength(0); // re-tentativa não abre complaint
  });

  it('submit direto sem prompt prévio segue funcionando (característico)', async () => {
    const { service } = makeService();
    const result = await service.submit({
      orderId: ORDER,
      customerId: CUSTOMER,
      rating: 4,
      comment: undefined,
    });
    expect(result.alreadyRated).toBe(false);
    expect(result.rating).toBe(4);
  });

  it('preenche customer_id que o prompt deixou NULL, sem sobrescrever o existente', async () => {
    const { service, db } = makeService();
    await service.schedulePromptForDelivered({ orderId: ORDER, customerId: null });

    await service.submit({ orderId: ORDER, customerId: CUSTOMER, rating: 3 });

    expect(db.rows.get(ORDER)!.customer_id).toBe(CUSTOMER);
  });
});
