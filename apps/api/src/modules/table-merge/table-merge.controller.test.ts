/**
 * A07 (customer→customer): os endpoints de mutação do cliente
 * (POST /table-merge-requests, /:id/approve, /:id/reject — todos SessionGuard)
 * devolviam `sourceTableSessionId`/`targetTableSessionId` no body = os
 * `x-session-token` das DUAS mesas. Um cliente lia o token da mesa vizinha e
 * forjava a sessão dela. O controller agora tira os tokens na fronteira HTTP do
 * cliente (o mapRow interno os mantém pros WS emits, que já dispararam antes).
 */
import { TableMergeController } from './table-merge.controller';
import type { TableMergeService } from './table-merge.service';
import type { CallerResolverService } from '../../common/services/caller-resolver.service';
import type { SessionData } from '../../common/guards/session.guard';

const MY_TOKEN = 'sess-my-secret-token';
const OTHER_TOKEN = 'sess-OTHER-table-secret-token';

// dto no formato do mapRow, COM os tokens (o que o service devolve internamente).
function dtoWithTokens() {
  return {
    id: 'merge-1',
    sourceTableSessionId: MY_TOKEN,
    targetTableSessionId: OTHER_TOKEN,
    requestingCustomerId: 'cust-1',
    targetCustomerId: null,
    status: 'pending',
    originTableNumber: 5,
    targetTableNumber: 9,
    targetHostName: 'Bruno',
    ttlExpiresAt: '2026-07-05T12:00:00Z',
    createdAt: '2026-07-05T11:00:00Z',
  };
}

function makeController(): TableMergeController {
  const service = {
    createCustomerRequest: async () => dtoWithTokens(),
    approve: async () => dtoWithTokens(),
    reject: async () => dtoWithTokens(),
  } as unknown as TableMergeService;
  const callerResolver = {
    requireCustomerId: async () => 'cust-1',
  } as unknown as CallerResolverService;
  return new TableMergeController(service, callerResolver);
}

const session = { sessionId: MY_TOKEN } as SessionData;
const req = {} as never;

function assertNoTokens(res: unknown) {
  const json = JSON.stringify(res);
  expect(json).not.toContain(MY_TOKEN);
  expect(json).not.toContain(OTHER_TOKEN);
  const r = res as Record<string, unknown>;
  expect(r.sourceTableSessionId).toBeUndefined();
  expect(r.targetTableSessionId).toBeUndefined();
  // campos não-credenciais sobrevivem (o FE usa status/números pra prosa)
  expect(r.status).toBe('pending');
  expect(r.targetTableNumber).toBe(9);
}

describe('TableMergeController — não vaza token de sessão no payload do cliente (A07)', () => {
  it('create não devolve os tokens das mesas', async () => {
    const res = await makeController().create('slug', {}, session, req);
    assertNoTokens(res);
  });

  it('approve não devolve os tokens das mesas', async () => {
    const res = await makeController().approve('slug', 'merge-1', {}, req);
    assertNoTokens(res);
  });

  it('reject não devolve os tokens das mesas', async () => {
    const res = await makeController().reject('slug', 'merge-1', {}, req);
    assertNoTokens(res);
  });
});
