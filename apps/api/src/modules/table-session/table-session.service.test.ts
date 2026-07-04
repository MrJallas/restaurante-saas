/**
 * P1 (re-scan): o reuse de sessão no `initSession` diverge da UNIQUE parcial
 * `table_sessions(table_id) WHERE status='active'` (migration 064).
 *
 * Bug: o SELECT de reuse filtrava `created_at > NOW() - INTERVAL '4 hours'`,
 * mas a constraint não tem bound de tempo e o sweep de inatividade
 * (`sweepStaleSessions`, ttl-tick.service.ts) fecha por ATIVIDADE
 * (GREATEST(created_at, último pedido/chamado/pagamento) < now()-4h), não por
 * idade. Cenário jantar-longo: sessão criada há 5h com um pedido de 1h atrás
 * continua `active` (o sweep não a varre). Próximo scan do QR: o reuse de 4h
 * NÃO acha a sessão → fall-through pro INSERT SEM ON CONFLICT → colide com a
 * UNIQUE parcial (já há uma ativa na mesa) → 23505 → 500.
 *
 * Fix congelado aqui (opção a): o reuse casa EXATAMENTE o escopo da constraint
 * — reusa qualquer sessão ATIVA da mesa, independente da idade. O sweep já
 * cuida de fechar as velhas-de-verdade (sem atividade) por atividade.
 *
 * RED antes do fix: a sessão de 5h não é reusada, o serviço tenta o INSERT e
 * o fakeDb (que modela a UNIQUE parcial) lança 23505 → initSession rejeita.
 */

import { TableSessionService } from './table-session.service';
import type { TenantConnectionProvider, TenantTx } from '../tenant/tenant-connection.provider';
import type { RedisService } from '../../infra/redis/redis.service';
import { QrCodeService } from './qr-code.service';

const TABLE_ID = '11111111-1111-1111-1111-111111111111';
const TABLE_CODE = 'M01';
const SECRET = 'table-secret';

interface FakeSession {
  id: string;
  table_id: string;
  status: 'active' | 'closed';
  created_at: Date;
}

/**
 * fakeDb roteia as queries que `initSession` dispara (busca da mesa +
 * transação de reuse/insert) contra um store em memória de table_sessions.
 *
 * O ponto crítico: o INSERT de uma 2ª sessão ATIVA na mesma mesa lança 23505
 * — exatamente como a UNIQUE parcial `table_sessions(table_id) WHERE
 * status='active'` (migration 064) faria em produção. Assim, se o reuse
 * NÃO casar a sessão ativa existente e cair no INSERT, o teste estoura.
 */
function fakeDb(sessions: FakeSession[]) {
  const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim();
  let insertCount = 0;
  let reuseSelectCount = 0;

  const runQuery = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = norm(sql);

    // busca da mesa pelo code
    if (s.startsWith('SELECT id, code, label, qr_hmac_secret, is_active FROM tables')) {
      return [
        {
          id: TABLE_ID,
          code: TABLE_CODE,
          label: 'Mesa 1',
          qr_hmac_secret: SECRET,
          is_active: true,
        },
      ];
    }

    // lock da mesa dentro da transação
    if (s.startsWith('SELECT id FROM tables WHERE id = $1 FOR UPDATE')) {
      return [{ id: TABLE_ID }];
    }

    // reuse: SELECT da sessão ativa da mesa
    if (s.startsWith('SELECT id FROM table_sessions')) {
      reuseSelectCount += 1;
      const tableId = params[0] as string;
      // Simula fielmente o filtro real de status='active' SEM impor o bound
      // de 4h por conta própria — o SQL sob teste decide se filtra por idade.
      // Se o SQL contém o bound de 4h, o serviço quer sessões recentes; nós
      // aplicamos o mesmo filtro pra reproduzir o miss real.
      const hasAgeBound = /INTERVAL '4 hours'/i.test(s);
      const cutoff = Date.now() - 4 * 60 * 60 * 1000;
      const matched = sessions
        .filter((x) => x.table_id === tableId && x.status === 'active')
        .filter((x) => (hasAgeBound ? x.created_at.getTime() > cutoff : true))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      return matched.length ? [{ id: matched[0].id }] : [];
    }

    // fall-through: INSERT de nova sessão. Modela a UNIQUE parcial.
    if (s.startsWith('INSERT INTO table_sessions')) {
      insertCount += 1;
      const tableId = params[0] as string;
      const activeExists = sessions.some((x) => x.table_id === tableId && x.status === 'active');
      if (activeExists) {
        const err = new Error(
          'duplicate key value violates unique constraint "table_sessions_one_active_per_table"',
        ) as Error & { code: string };
        err.code = '23505';
        throw err;
      }
      const created: FakeSession = {
        id: `new-${insertCount}`,
        table_id: tableId,
        status: 'active',
        created_at: new Date(),
      };
      sessions.push(created);
      return [{ id: created.id }];
    }

    throw new Error(`fake table-session: SQL não roteado: ${s}`);
  };

  const conn = {
    query: (sql: string, params?: unknown[]) => runQuery(sql, params),
    transaction: async <T>(work: (tx: TenantTx) => Promise<T>): Promise<T> => {
      const tx: TenantTx = { query: (sql, params) => runQuery(sql, params) };
      return work(tx);
    },
    getTenantSlug: () => 'acme',
  } as unknown as TenantConnectionProvider;

  return {
    conn,
    getInsertCount: () => insertCount,
    getReuseSelectCount: () => reuseSelectCount,
  };
}

function fakeRedis() {
  return {
    set: jest.fn(async () => undefined),
    get: jest.fn(async () => null),
    rpush: jest.fn(async () => undefined),
    expire: jest.fn(async () => undefined),
  } as unknown as RedisService;
}

function makeService(conn: TenantConnectionProvider, redis: RedisService) {
  const qr = new QrCodeService();
  return { service: new TableSessionService(conn, redis, qr), qr };
}

describe('TableSessionService.initSession — reuse casa a UNIQUE parcial (P1 re-scan)', () => {
  it('jantar-longo: sessão ATIVA de 5h é reusada, sem INSERT duplicado (não estoura 23505)', async () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const sessions: FakeSession[] = [
      {
        id: 'long-dinner-session',
        table_id: TABLE_ID,
        status: 'active',
        created_at: fiveHoursAgo,
      },
    ];
    const db = fakeDb(sessions);
    const redis = fakeRedis();
    const { service, qr } = makeService(db.conn, redis);

    // QR válido: HMAC fresco + daily access token do dia.
    const ts = `${Date.now()}`;
    const hmac = qr.generateHmac(TABLE_CODE, SECRET, ts);
    const accessToken = qr.generateDailyAccessToken(TABLE_CODE, SECRET);

    const result = await service.initSession(TABLE_CODE, hmac, ts, 'acme', accessToken);

    // Reusa a sessão existente — não cria uma nova.
    expect(result.sessionId).toBe('long-dinner-session');
    // Prova de que NÃO caiu no fall-through do INSERT (que colidiria 23505).
    expect(db.getInsertCount()).toBe(0);
  });

  it('mesa livre: sem sessão ativa, cria UMA nova sessão (caminho feliz preservado)', async () => {
    const sessions: FakeSession[] = [];
    const db = fakeDb(sessions);
    const redis = fakeRedis();
    const { service, qr } = makeService(db.conn, redis);

    const ts = `${Date.now()}`;
    const hmac = qr.generateHmac(TABLE_CODE, SECRET, ts);
    const accessToken = qr.generateDailyAccessToken(TABLE_CODE, SECRET);

    const result = await service.initSession(TABLE_CODE, hmac, ts, 'acme', accessToken);

    expect(result.sessionId).toBe('new-1');
    expect(db.getInsertCount()).toBe(1);
  });
});
