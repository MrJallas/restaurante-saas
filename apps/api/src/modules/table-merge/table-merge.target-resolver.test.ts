/**
 * CHARACTERIZATION (fase framework, fatia table-merge): congela o
 * comportamento ATUAL da resolução de alvo do merge (resolveSessionById +
 * resolveTargetSession + userError) ANTES da extração pra
 * `merge-target-resolver.ts`. Exercita via `createCustomerRequest` (API
 * pública) — o teste sobrevive à extração sem nenhuma edição.
 *
 * PONTO SENSÍVEL congelado: a coerção número/label do alvo. '7' resolve
 * tanto como NÚMERO da mesa quanto como LABEL/code (ex.: 'M7', 'Mesa 7')
 * — o service computa os DOIS params ($1 int, $2 text) e o SQL casa por
 * qualquer um. O fake NÃO reimplementa o SQL: grava os params exatos que
 * o service computou e devolve linhas canned — o que congela é a coerção
 * TS + o mapeamento de erro das linhas devolvidas.
 */

import { HttpException, HttpStatus } from '@nestjs/common';
import { TableMergeService } from './table-merge.service';
import { MergeTargetResolver } from './merge-target-resolver';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

const SOURCE_SESSION = 'aaaa1111-0000-4000-8000-000000000001';
const TARGET_SESSION = 'bbbb2222-0000-4000-8000-000000000002';
const HOST_A = 'eeee5555-0000-4000-8000-00000000000a';
const HOST_B = 'ffff6666-0000-4000-8000-00000000000b';
const REQ = 'dddd4444-0000-4000-8000-000000000004';

/** SessionResolution da mesa alvo ocupada (M7, host Bruno). */
const OCCUPIED_TARGET = {
  session_id: TARGET_SESSION,
  table_id: 'table-tgt',
  status: 'active',
  host_customer_id: HOST_B,
  table_code: 'M7',
  table_label: 'Mesa 7',
  table_number: 7,
};

function fakeResolverDb() {
  const state = {
    /** resolveSessionById — sessões conhecidas por id. */
    sessionsById: {
      [SOURCE_SESSION]: {
        session_id: SOURCE_SESSION,
        table_id: 'table-src',
        status: 'active',
        host_customer_id: HOST_A,
        table_code: 'M5',
        table_label: 'Mesa 5',
        table_number: 5,
      },
    } as Record<string, Record<string, unknown>>,
    /** resposta canned da query por número/label. */
    lateralRows: [] as Array<Record<string, unknown>>,
    /** params exatos [$1 int, $2 text] que o service computou. */
    lateralParams: null as unknown[] | null,
    lateralCalls: 0,
    insertParams: null as unknown[] | null,
  };

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();

    // resolveSessionById (source e alvo-por-sessão).
    if (s.startsWith('SELECT ts.id AS session_id')) {
      const row = state.sessionsById[params[0] as string];
      return row ? [{ ...row }] : [];
    }

    // requester aprovado na mesa de origem.
    if (s.startsWith('SELECT 1 FROM session_participants')) {
      return [{ ok: 1 }];
    }

    // resolveTargetSession — lookup por número/label (LATERAL).
    if (s.startsWith('SELECT active_ts.id AS session_id')) {
      state.lateralCalls++;
      state.lateralParams = params;
      return state.lateralRows.map((r) => ({ ...r }));
    }

    // createRequest: cooldown check — sem cooldown ativo.
    if (s.startsWith('SELECT id, source_table_session_id')) {
      return [];
    }

    if (s.startsWith('INSERT INTO table_merge_requests')) {
      state.insertParams = params;
      return [{ id: REQ }];
    }

    // expireOverdueRequests (dentro do getById) — nada expira.
    if (s.startsWith("UPDATE table_merge_requests SET status = 'expired'")) {
      return [];
    }

    // getById enriquecido — espelha o que foi inserido.
    if (s.startsWith('SELECT mr.*,')) {
      const ins = state.insertParams ?? [];
      return [
        {
          id: REQ,
          source_table_session_id: ins[0],
          target_table_session_id: ins[1],
          requesting_customer_id: ins[2],
          target_customer_id: ins[3],
          decided_by_customer_id: null,
          status: 'pending',
          message: ins[4] ?? null,
          ttl_expires_at: ins[5],
          approved_by_a_at: ins[6] ? '2026-07-04T00:00:00.000Z' : null,
          approved_by_b_at: null,
          decided_at: null,
          created_at: '2026-07-04T00:00:00.000Z',
          origin_table_number: 5,
          target_table_number: 7,
          origin_host_name: 'Ana',
          target_host_name: 'Bruno',
          origin_party_size: 2,
          target_party_size: 3,
        },
      ];
    }

    throw new Error(`fake resolver: SQL não roteado: ${s}`);
  };

  const conn = {
    query,
    getTenantSlug: () => undefined,
  } as unknown as TenantConnectionProvider;

  return { conn, state };
}

function makeService() {
  const { conn, state } = fakeResolverDb();
  const service = new TableMergeService(conn, new MergeTargetResolver(conn));
  return { service, state };
}

const baseInput = {
  sourceTableSessionId: SOURCE_SESSION,
  requestingCustomerId: HOST_A,
};

async function captureError(promise: Promise<unknown>): Promise<HttpException> {
  const err = await promise.catch((e) => e);
  expect(err).toBeInstanceOf(HttpException);
  return err as HttpException;
}

describe('TableMergeService — characterization da resolução de alvo (número/label/sessão)', () => {
  it('(a) alvo por NÚMERO (7 numérico): query recebe [7, null] e o request nasce com a sessão/host do alvo', async () => {
    const { service, state } = makeService();
    state.lateralRows = [OCCUPIED_TARGET];

    const result = await service.createCustomerRequest({
      ...baseInput,
      targetTableNumber: 7,
    });

    expect(state.lateralParams).toEqual([7, null]);
    // resolved target alimenta o createRequest: sessão alvo + host do alvo
    // como target_customer_id; requester = host da origem → auto-approve A.
    expect(state.insertParams?.[0]).toBe(SOURCE_SESSION);
    expect(state.insertParams?.[1]).toBe(TARGET_SESSION);
    expect(state.insertParams?.[2]).toBe(HOST_A);
    expect(state.insertParams?.[3]).toBe(HOST_B);
    expect(state.insertParams?.[6]).toBe(HOST_A);
    expect(result.targetTableSessionId).toBe(TARGET_SESSION);
    expect(result.targetCustomerId).toBe(HOST_B);
    expect(result.status).toBe('pending');
  });

  it("(b) coerção '7' como LABEL digits-only: vai pelos DOIS caminhos — [7, '7'] (número E code/label)", async () => {
    const { service, state } = makeService();
    state.lateralRows = [OCCUPIED_TARGET];

    await service.createCustomerRequest({
      ...baseInput,
      targetTableLabel: '7',
    });
    expect(state.lateralParams).toEqual([7, '7']);

    // whitespace é trimado no label; Number tolera espaço → mesmo par.
    const trimmed = makeService();
    trimmed.state.lateralRows = [OCCUPIED_TARGET];
    await trimmed.service.createCustomerRequest({
      ...baseInput,
      targetTableLabel: '  7  ',
    });
    expect(trimmed.state.lateralParams).toEqual([7, '7']);
  });

  it("(c) targetTableNumber STRING: '7' vira [7, '7']; '7a' (não-numérica) cai pra label puro [null, '7a']", async () => {
    const { service, state } = makeService();
    state.lateralRows = [OCCUPIED_TARGET];
    await service.createCustomerRequest({
      ...baseInput,
      targetTableNumber: '7',
    });
    expect(state.lateralParams).toEqual([7, '7']);

    const nonNumeric = makeService();
    nonNumeric.state.lateralRows = [OCCUPIED_TARGET];
    await nonNumeric.service.createCustomerRequest({
      ...baseInput,
      targetTableNumber: '7a',
    });
    expect(nonNumeric.state.lateralParams).toEqual([null, '7a']);
  });

  it("(d) label não-numérico ('Mesa 7', 'M7'): número fica null — resolve só por code/label", async () => {
    const { service, state } = makeService();
    state.lateralRows = [OCCUPIED_TARGET];
    await service.createCustomerRequest({
      ...baseInput,
      targetTableLabel: 'Mesa 7',
    });
    expect(state.lateralParams).toEqual([null, 'Mesa 7']);

    const byCode = makeService();
    byCode.state.lateralRows = [OCCUPIED_TARGET];
    await byCode.service.createCustomerRequest({
      ...baseInput,
      targetTableLabel: 'M7',
    });
    expect(byCode.state.lateralParams).toEqual([null, 'M7']);
  });

  it('(e) sem número nem label: 400 TARGET_TABLE_MISSING antes de tocar o banco', async () => {
    const { service, state } = makeService();

    const err = await captureError(service.createCustomerRequest({ ...baseInput }));
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toEqual({
      message_user: 'Escolha uma mesa ocupada para pedir a juncao.',
      code: 'TARGET_TABLE_MISSING',
    });
    expect(state.lateralCalls).toBe(0);
  });

  it('(f) alvo inexistente: 404 TARGET_TABLE_NOT_FOUND com a mensagem exata do userError', async () => {
    const { service, state } = makeService();
    state.lateralRows = [];

    const err = await captureError(
      service.createCustomerRequest({ ...baseInput, targetTableNumber: 99 }),
    );
    expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(err.getResponse()).toEqual({
      message_user: 'Nao encontrei essa mesa no salao.',
      code: 'TARGET_TABLE_NOT_FOUND',
    });
  });

  it('(g) mesa existe mas está LIVRE (sem sessão ativa): 400 TARGET_TABLE_FREE', async () => {
    const { service, state } = makeService();
    state.lateralRows = [
      {
        ...OCCUPIED_TARGET,
        session_id: null,
        status: 'free',
        host_customer_id: null,
      },
    ];

    const err = await captureError(
      service.createCustomerRequest({ ...baseInput, targetTableNumber: 7 }),
    );
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toEqual({
      message_user: 'Essa mesa esta livre. Escolha uma mesa ocupada para pedir a juncao.',
      code: 'TARGET_TABLE_FREE',
    });
  });

  it('(h) PRECEDÊNCIA: targetTableSessionId ganha de número/label — lookup por número nunca roda', async () => {
    const { service, state } = makeService();
    state.sessionsById[TARGET_SESSION] = { ...OCCUPIED_TARGET };

    const result = await service.createCustomerRequest({
      ...baseInput,
      targetTableSessionId: TARGET_SESSION,
      targetTableNumber: 999,
      targetTableLabel: 'Mesa 999',
    });

    expect(state.lateralCalls).toBe(0);
    expect(result.targetTableSessionId).toBe(TARGET_SESSION);
    expect(result.targetCustomerId).toBe(HOST_B);
  });

  it('(i) alvo por sessão: inexistente → 404 TARGET_SESSION_NOT_FOUND; inativa → 409 TARGET_SESSION_INACTIVE', async () => {
    const { service } = makeService();
    const notFound = await captureError(
      service.createCustomerRequest({
        ...baseInput,
        targetTableSessionId: 'cccc0000-0000-4000-8000-0000000000ff',
      }),
    );
    expect(notFound.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(notFound.getResponse()).toEqual({
      message_user: 'Nao encontrei a sessao da mesa escolhida.',
      code: 'TARGET_SESSION_NOT_FOUND',
    });

    const inactive = makeService();
    inactive.state.sessionsById[TARGET_SESSION] = { ...OCCUPIED_TARGET, status: 'closed' };
    const err = await captureError(
      inactive.service.createCustomerRequest({
        ...baseInput,
        targetTableSessionId: TARGET_SESSION,
      }),
    );
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(err.getResponse()).toEqual({
      message_user: 'A mesa escolhida nao esta mais ativa.',
      code: 'TARGET_SESSION_INACTIVE',
    });
  });
});
