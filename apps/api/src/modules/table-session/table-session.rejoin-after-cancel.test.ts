/**
 * "Eu cancelei" ≠ "o host me rejeitou" (migration 080).
 *
 * BUG (reproduzido em iPhone real): `cancelOwnPendingJoin` gravava
 * `status='rejected', left_at=now()` — o MESMO estado da recusa do host. No
 * re-scan do QR da mesma table_session, o `upsertParticipant` reencontrava a
 * row (a query dele não tinha o `AND left_at IS NULL` que as duas irmãs têm),
 * preservava o 'rejected' e a ressuscitava com `left_at = NULL`. O cliente
 * ficava barrado com "O host da mesa não autorizou sua entrada" sem host nenhum
 * ter recusado.
 *
 * DECISÃO DO DONO (opção B): separar os dois estados.
 *   - quem CANCELOU volta a pedir entrada normalmente (nova row 'pending', host
 *     recebe o pedido de novo);
 *   - quem o HOST RECUSOU continua barrado enquanto a table_session viver.
 *
 * O fake modela session_participants de verdade: honra o `left_at IS NULL` que
 * o SQL sob teste escrever (se o filtro sumir, a row morta volta a aparecer e o
 * teste quebra), aplica a UNIQUE parcial `session_participants_active_unique` no
 * INSERT e devolve a tupla `[rows, rowCount]` do driver pg nos UPDATE ...
 * RETURNING, que é o shape que `unwrapRows` existe para desembrulhar.
 */

import { TableSessionService, PARTICIPANT_COLORS } from './table-session.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';
import type { QrCodeService } from './qr-code.service';
import type { EventsGateway } from '../websocket/events.gateway';

const SESSION = 'aaaa1111-0000-4000-8000-000000000001';
const HOST = 'cccc3333-0000-4000-8000-000000000003';
const JOINER = 'bbbb2222-0000-4000-8000-000000000002';
const TABLE = 'dddd4444-0000-4000-8000-000000000004';

interface FakePart {
  table_session_id: string;
  customer_id: string;
  color_index: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  visit_id: string | null;
  joined_at: number;
  left_at: string | null;
}

interface Emitted {
  event: string;
  payload: { customerId: string; status?: string };
}

function makeHarness(seed: FakePart[]) {
  const parts: FakePart[] = seed.map((p) => ({ ...p }));
  const session = { id: SESSION, host_customer_id: HOST as string | null, table_id: TABLE };
  let clock = 100;

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('SELECT host_customer_id, table_id FROM table_sessions')) {
      return [{ host_customer_id: session.host_customer_id, table_id: session.table_id }];
    }
    if (s.startsWith('SELECT id FROM table_sessions')) {
      return [{ id: SESSION }];
    }
    if (s.startsWith('SELECT host_customer_id FROM table_sessions')) {
      return [{ host_customer_id: session.host_customer_id }];
    }

    if (s.startsWith('SELECT color_index, status FROM session_participants')) {
      const [sid, cid] = params as string[];
      // O filtro sai do SQL sob teste, não do fake: remover o `left_at IS NULL`
      // da query volta a expor a row morta e reintroduz o bug aqui.
      const onlyActive = /left_at IS NULL/.test(s);
      const found = parts.filter(
        (p) =>
          p.table_session_id === sid &&
          p.customer_id === cid &&
          (onlyActive ? p.left_at === null : true),
      );
      return found.map((p) => ({ color_index: p.color_index, status: p.status }));
    }

    if (
      s.startsWith('SELECT color_index FROM session_participants') &&
      /status = 'rejected'/.test(s)
    ) {
      const [sid, cid] = params as string[];
      const found = parts
        .filter(
          (p) => p.table_session_id === sid && p.customer_id === cid && p.status === 'rejected',
        )
        .sort((a, b) => b.joined_at - a.joined_at);
      return found.length ? [{ color_index: found[0].color_index }] : [];
    }

    if (s.startsWith('SELECT sp.customer_id, sp.color_index, sp.status')) {
      const [sid] = params as string[];
      return parts
        .filter((p) => p.table_session_id === sid && p.left_at === null)
        .sort((a, b) => a.joined_at - b.joined_at)
        .map((p) => ({
          customer_id: p.customer_id,
          color_index: p.color_index,
          status: p.status,
          joined_at: new Date(p.joined_at).toISOString(),
          name: p.customer_id === HOST ? 'Ana' : 'Bruno',
          host_customer_id: session.host_customer_id,
        }));
    }

    // Nenhuma liberação de QR aberta — o joiner nunca é auto-aprovado.
    if (s.startsWith('UPDATE table_qr_releases')) {
      return [[], 0] as unknown as unknown[];
    }

    if (s.startsWith('INSERT INTO session_participants')) {
      const [sid, cid, visitId, status] = params as [string, string, string | null, string];
      // UNIQUE parcial `session_participants_active_unique`: só uma row ativa
      // por (session, customer). O SQL real usa ON CONFLICT ... DO NOTHING.
      if (parts.some((p) => p.table_session_id === sid && p.customer_id === cid && !p.left_at)) {
        return [];
      }
      const inserted: FakePart = {
        table_session_id: sid,
        customer_id: cid,
        color_index:
          parts.filter((p) => p.table_session_id === sid).length % PARTICIPANT_COLORS.length,
        status: status as FakePart['status'],
        visit_id: visitId,
        joined_at: (clock += 1),
        left_at: null,
      };
      parts.push(inserted);
      return [{ color_index: inserted.color_index, status: inserted.status }];
    }

    if (s.startsWith('UPDATE session_participants')) {
      const [sid, cid] = params as string[];
      const onlyActive = /left_at IS NULL/.test(s);
      const casPending = /status = 'pending'/.test(s);
      const setStatus =
        /SET status = '(\w+)'/.exec(s)?.[1] ??
        (/SET status = \$3/.test(s) ? (params[2] as string) : null);
      const matched = parts.filter(
        (p) =>
          p.table_session_id === sid &&
          p.customer_id === cid &&
          (onlyActive ? p.left_at === null : true) &&
          (casPending ? p.status === 'pending' : true),
      );
      for (const p of matched) {
        if (setStatus) p.status = setStatus as FakePart['status'];
        if (/left_at = now\(\)/.test(s)) p.left_at = new Date(clock).toISOString();
        if (/visit_id = COALESCE\(\$3, visit_id\)/.test(s)) {
          p.visit_id = (params[2] as string | null) ?? p.visit_id;
        }
      }
      // Shape fiel do driver pg para UPDATE ... RETURNING.
      return [matched.map((p) => ({ customer_id: p.customer_id })), matched.length] as unknown[];
    }

    if (s.startsWith('UPDATE table_sessions')) {
      if (session.host_customer_id === null) session.host_customer_id = params[1] as string;
      return [[], 1] as unknown as unknown[];
    }

    if (s.startsWith('SELECT name FROM customers')) {
      return [{ name: (params[0] as string) === HOST ? 'Ana' : 'Bruno' }];
    }

    throw new Error(`fake rejoin: SQL não roteado: ${s}`);
  };

  const conn = {
    query,
    transaction: async <T>(cb: (tx: { query: typeof query }) => Promise<T>) => cb({ query }),
    getTenantSlug: () => 'acme',
  } as unknown as TenantConnectionProvider;

  const emitted: Emitted[] = [];
  const eventsGateway = {
    emitToSession: (_sessionId: string, event: string, payload: unknown) => {
      emitted.push({ event, payload: payload as Emitted['payload'] });
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

  return { service, parts, emitted };
}

function pending(customerId: string, joinedAt: number): FakePart {
  return {
    table_session_id: SESSION,
    customer_id: customerId,
    color_index: 1,
    status: 'pending',
    visit_id: null,
    joined_at: joinedAt,
    left_at: null,
  };
}

function approvedHost(): FakePart {
  return {
    table_session_id: SESSION,
    customer_id: HOST,
    color_index: 0,
    status: 'approved',
    visit_id: null,
    joined_at: 1,
    left_at: null,
  };
}

describe('re-scan depois de cancelar vs. depois da recusa do host (migration 080)', () => {
  it('quem CANCELOU volta a pedir entrada: novo scan cria pedido pending e avisa o host', async () => {
    const h = makeHarness([approvedHost(), pending(JOINER, 2)]);

    const cancelled = await h.service.cancelOwnPendingJoin(SESSION, JOINER);
    expect(cancelled.cancelled).toBe(true);
    expect(h.parts.find((p) => p.customer_id === JOINER)?.status).toBe('cancelled');

    h.emitted.length = 0;
    const rejoined = await h.service.upsertParticipant(SESSION, JOINER, null);

    // Volta pra fila, não pro beco: 'pending', e NÃO 'rejected'.
    expect(rejoined.status).toBe('pending');
    // Row nova, não a morta ressuscitada — a cancelada segue com left_at.
    const rows = h.parts.filter((p) => p.customer_id === JOINER);
    expect(rows).toHaveLength(2);
    expect(rows.filter((p) => p.left_at === null)).toHaveLength(1);
    expect(rows.find((p) => p.left_at !== null)?.status).toBe('cancelled');
    // O host precisa ver o pedido de novo — senão o cliente espera pra sempre.
    expect(h.emitted.filter((e) => e.event === 'participant:join_request')).toHaveLength(1);
  });

  it('quem o HOST RECUSOU continua barrado no re-scan (sem pedido novo, sem incomodar o host)', async () => {
    const h = makeHarness([approvedHost(), pending(JOINER, 2)]);

    await h.service.decideJoinRequest(SESSION, HOST, JOINER, 'reject');
    expect(h.parts.find((p) => p.customer_id === JOINER)?.status).toBe('rejected');

    h.emitted.length = 0;
    const rescan = await h.service.upsertParticipant(SESSION, JOINER, null);

    expect(rescan.status).toBe('rejected');
    // Nenhuma row nova: a recusa é escopada à table_session e vale até ela fechar.
    expect(h.parts.filter((p) => p.customer_id === JOINER)).toHaveLength(1);
    // E o host não recebe pedido nenhum — a recusa existe pra cortar a insistência.
    expect(h.emitted.filter((e) => e.event === 'participant:join_request')).toHaveLength(0);
  });

  it('recusa do host sobrevive mesmo quando a row recusada já saiu do roster', async () => {
    // Modela tanto as rows 'rejected' + left_at HISTÓRICAS (gravadas pelo bug,
    // que a migration 080 deliberadamente não reclassifica) quanto qualquer
    // fluxo futuro que faça soft-leave de um recusado.
    const h = makeHarness([
      approvedHost(),
      {
        table_session_id: SESSION,
        customer_id: JOINER,
        color_index: 1,
        status: 'rejected',
        visit_id: null,
        joined_at: 2,
        left_at: new Date(50).toISOString(),
      },
    ]);

    const rescan = await h.service.upsertParticipant(SESSION, JOINER, null);

    expect(rescan.status).toBe('rejected');
    expect(h.parts.filter((p) => p.customer_id === JOINER)).toHaveLength(1);
  });

  it('a query de reuse ignora qualquer row com left_at preenchido, mesmo approved', async () => {
    // Prova direta do `AND left_at IS NULL` que faltava. Se o SELECT voltar a
    // enxergar a row morta, o status 'approved' dela é preservado e o cliente
    // entra na mesa sem passar pelo host — não é só cosmético.
    const h = makeHarness([
      approvedHost(),
      {
        table_session_id: SESSION,
        customer_id: JOINER,
        color_index: 1,
        status: 'approved',
        visit_id: null,
        joined_at: 2,
        left_at: new Date(50).toISOString(),
      },
    ]);

    const rescan = await h.service.upsertParticipant(SESSION, JOINER, null);

    expect(rescan.status).toBe('pending');
    expect(h.parts.filter((p) => p.customer_id === JOINER && p.left_at === null)).toHaveLength(1);
  });

  it('roster e re-scan seguem consistentes: a cancelada some da mesa, a nova aparece pendente', async () => {
    const h = makeHarness([approvedHost(), pending(JOINER, 2)]);

    await h.service.cancelOwnPendingJoin(SESSION, JOINER);
    const duringCancel = await h.service.getParticipants(SESSION);
    expect(duringCancel.map((p) => p.customerId)).toEqual([HOST]);

    await h.service.upsertParticipant(SESSION, JOINER, null);
    const afterRejoin = await h.service.getParticipants(SESSION);
    expect(afterRejoin.map((p) => p.customerId)).toEqual([HOST, JOINER]);
    expect(afterRejoin.find((p) => p.customerId === JOINER)?.status).toBe('pending');
  });

  it('scan repetido de quem está ativo não ressuscita a row cancelada (UNIQUE parcial intacta)', async () => {
    // Sem o `left_at IS NULL` no UPDATE, este segundo scan zeraria o left_at de
    // TODAS as rows do par (session, customer) e deixaria duas ativas — 23505 na
    // `session_participants_active_unique` em produção.
    const h = makeHarness([approvedHost(), pending(JOINER, 2)]);

    await h.service.cancelOwnPendingJoin(SESSION, JOINER);
    await h.service.upsertParticipant(SESSION, JOINER, null);
    const again = await h.service.upsertParticipant(SESSION, JOINER, 'visit-1');

    expect(again.status).toBe('pending');
    const active = h.parts.filter((p) => p.customer_id === JOINER && p.left_at === null);
    expect(active).toHaveLength(1);
    expect(active[0].visit_id).toBe('visit-1');
  });
});
