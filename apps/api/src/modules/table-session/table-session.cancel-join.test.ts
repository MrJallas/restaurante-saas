/**
 * P1 (re-scan mega-loop): Customer B preso pra sempre na espera de join (System A).
 *
 * No modelo host-approval (session_participants), B que escaneia uma mesa
 * ocupada entra com status='pending'. Se o host IGNORA, B fica em
 * "Aguardando host da mesa" e o único escape do FE ("Cancelar pedido") era um
 * router.back() no-op — o session_participant seguia 'pending' + left_at IS
 * NULL PRA SEMPRE (System A não tem TTL). Ninguém removia a row órfã.
 *
 * FIX: TableSessionService.cancelOwnPendingJoin(tableSessionId, callerCustomerId):
 *   - soft-leave da PRÓPRIA row pending (left_at = now(), status='cancelled'),
 *     via CAS em status='pending' (idempotente — só cancela quem ainda pende);
 *   - emite participant:decision(status='cancelled') pro room da session pra
 *     o host tirar B da lista de pendentes ao vivo.
 *
 * Migration 080: o status gravado é 'cancelled', NÃO 'rejected'. Enquanto os
 * dois cancelamentos compartilhavam o mesmo valor, o re-scan de B reencontrava
 * a row e o acusava de ter sido recusado pelo host — o bug reproduzido em
 * iPhone real. A prova de que a distinção resolve o re-scan vive em
 * `table-session.rejoin-after-cancel.test.ts`.
 *
 * RED→GREEN: cancelOwnPendingJoin sai a row (left_at) + só afeta 'pending' +
 * emite o evento; caller sem row pending é no-op silencioso (não estoura).
 */

import { TableSessionService } from './table-session.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';
import type { QrCodeService } from './qr-code.service';
import type { EventsGateway } from '../websocket/events.gateway';

const SESSION = 'aaaa1111-0000-4000-8000-000000000001';
const CALLER = 'bbbb2222-0000-4000-8000-000000000002';

interface FakePart {
  table_session_id: string;
  customer_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  left_at: string | null;
}

function makeService(seedStatus: FakePart['status'] = 'pending') {
  const part: FakePart = {
    table_session_id: SESSION,
    customer_id: CALLER,
    status: seedStatus,
    left_at: null,
  };

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();

    // UPDATE session_participants SET left_at = now(), status = 'cancelled'
    //   WHERE table_session_id=$1 AND customer_id=$2 AND status='pending' AND left_at IS NULL
    if (s.startsWith('UPDATE session_participants')) {
      const [tableSessionId, customerId] = params as string[];
      // O status gravado sai do PRÓPRIO SQL sob teste, não de uma constante do
      // fake: assim o teste falha se alguém voltar a escrever 'rejected' aqui.
      const setStatus = /SET status = '(\w+)'/.exec(s)?.[1] as FakePart['status'] | undefined;
      const match =
        part.table_session_id === tableSessionId &&
        part.customer_id === customerId &&
        part.status === 'pending' &&
        part.left_at === null;
      if (match && setStatus) {
        part.status = setStatus;
        part.left_at = new Date().toISOString();
        // Shape fiel do driver pg em UPDATE ... RETURNING: [rows, rowCount].
        // O service consome via unwrapRows; um fake que devolve o array cru
        // esconderia a regressão que o cast direto da tupla causa.
        return [[{ customer_id: customerId }], 1] as unknown as unknown[];
      }
      return [[], 0] as unknown as unknown[];
    }

    throw new Error(`fake cancel-join: SQL não roteado: ${s}`);
  };

  const conn = {
    query,
    transaction: async <T>(cb: (tx: { query: typeof query }) => Promise<T>) => cb({ query }),
  } as unknown as TenantConnectionProvider;

  const emitted: Array<{ event: string; payload: { customerId: string; status: string } }> = [];
  const eventsGateway = {
    emitToSession: (_sessionId: string, event: string, payload: unknown) => {
      emitted.push({ event, payload: payload as { customerId: string; status: string } });
    },
  } as unknown as EventsGateway;

  const service = new TableSessionService(
    conn,
    {} as unknown as RedisService,
    {} as unknown as QrCodeService,
    undefined,
    eventsGateway,
    undefined,
  );

  return { service, part, emitted };
}

describe('TableSessionService.cancelOwnPendingJoin — B cancela o próprio join pending (System A)', () => {
  it('soft-leave: a row pending sai (left_at carimbado + status cancelled)', async () => {
    const { service, part } = makeService();
    const res = await service.cancelOwnPendingJoin(SESSION, CALLER);
    expect(part.left_at).not.toBeNull();
    // Migration 080: 'cancelled' ≠ 'rejected'. Gravar 'rejected' aqui é o bug —
    // o re-scan passa a acusar o host de ter recusado quem só desistiu.
    expect(part.status).toBe('cancelled');
    expect(res.cancelled).toBe(true);
  });

  it('emite participant:decision(cancelled) pro host tirar B dos pendentes ao vivo', async () => {
    const { service, emitted } = makeService();
    await service.cancelOwnPendingJoin(SESSION, CALLER);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].event).toBe('participant:decision');
    expect(emitted[0].payload.customerId).toBe(CALLER);
    expect(emitted[0].payload.status).toBe('cancelled');
  });

  it('só afeta pending: caller já approved não é derrubado (no-op, cancelled=false)', async () => {
    const { service, part, emitted } = makeService('approved');
    const res = await service.cancelOwnPendingJoin(SESSION, CALLER);
    expect(part.status).toBe('approved');
    expect(part.left_at).toBeNull();
    expect(res.cancelled).toBe(false);
    // sem row cancelada → não emite decision fantasma
    expect(emitted).toHaveLength(0);
  });
});
