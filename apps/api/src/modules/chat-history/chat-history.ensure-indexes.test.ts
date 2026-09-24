/**
 * BUG VIVO 2026-07-04 (achado lendo o código pro M4 da timeline): o
 * ensureIndexes do chat-history (FASE 3, "TTL garantido em runtime") era
 * PLACEBO duplo — (a) o corpo chamava a si mesmo na 2ª linha (recursão
 * infinita → RangeError, engolido pelos soft-fails), e (b) NENHUM write o
 * invocava. Resultado: volume Mongo criado antes do mongo-init.js nunca
 * ganha o índice TTL de 30d e o chat vira para-sempre (LGPD).
 *
 * Contrato fixado: appendTurn garante os índices (TTL expiresAt nas duas
 * coleções + {threadId, createdAt}) ANTES do primeiro write, uma única vez
 * (idempotente entre chamadas), sem estourar a stack.
 */

import { ChatHistoryService } from './chat-history.service';
import type { MongoService } from '../../infra/mongo/mongo.service';

type CreateIndex = (key: Record<string, number>) => Promise<string>;

function fakeMongo(
  createIndex: CreateIndex = async () => 'ok',
  existingIndexes: Array<Record<string, unknown>> = [],
) {
  const createIndexCalls: Array<{
    collection: string;
    key: Record<string, number>;
    options: Record<string, unknown>;
  }> = [];
  const collections = new Map<string, unknown>();

  function collection(name: string) {
    if (!collections.has(name)) {
      collections.set(name, {
        collectionName: name,
        createIndex: async (key: Record<string, number>, options: Record<string, unknown>) => {
          createIndexCalls.push({ collection: name, key, options });
          return createIndex(key);
        },
        listIndexes: () => ({ toArray: async () => existingIndexes }),
        findOne: async () => null,
        updateOne: async () => ({ upsertedId: null }),
        insertMany: async () => ({ insertedCount: 2 }),
        countDocuments: async () => 0,
      });
    }
    return collections.get(name);
  }

  const mongo = { tryDb: () => ({ collection }) } as unknown as MongoService;
  return { mongo, createIndexCalls };
}

const TURN = {
  tenantId: 'restaurant_dev',
  customerId: 'cust-1',
  sessionId: 'sess-1',
  userMessage: 'oi',
  assistantResponse: 'olá!',
};

describe('ChatHistoryService — índices TTL garantidos em runtime (LGPD)', () => {
  it('appendTurn cria os índices (TTL nas 2 coleções + threadId/createdAt) antes do 1º write', async () => {
    const { mongo, createIndexCalls } = fakeMongo();
    await new ChatHistoryService(mongo).appendTurn(TURN);

    const ttlTargets = createIndexCalls
      .filter((c) => 'expiresAt' in c.key)
      .map((c) => c.collection)
      .sort();
    expect(ttlTargets).toHaveLength(2); // threads + messages
    expect(createIndexCalls.some((c) => c.key.threadId === 1 && c.key.createdAt === 1)).toBe(true);
  });

  it('usa os nomes canônicos do mongo-init (expiresAt_ttl, threadId_createdAt)', async () => {
    const { mongo, createIndexCalls } = fakeMongo();
    await new ChatHistoryService(mongo).appendTurn(TURN);

    expect(createIndexCalls.map((c) => `${c.collection}.${String(c.options.name)}`).sort()).toEqual(
      [
        'chat_messages.expiresAt_ttl',
        'chat_messages.threadId_createdAt',
        'chat_threads.expiresAt_ttl',
      ],
    );
  });

  it('volume antigo com os nomes padrão (85) → aceita e não repete a cada gravação', async () => {
    const { mongo, createIndexCalls } = fakeMongo(async () => {
      throw Object.assign(new Error('Index already exists with a different name'), { code: 85 });
    }, [
      { name: 'expiresAt_1', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      { name: 'threadId_1_createdAt_1', key: { threadId: 1, createdAt: 1 } },
    ]);
    const svc = new ChatHistoryService(mongo);
    await svc.appendTurn(TURN);
    const after1st = createIndexCalls.length;
    await svc.appendTurn(TURN);
    expect(createIndexCalls.length).toBe(after1st);
  });

  it('Mongo instável no 1º write → a gravação seguinte tenta os índices de novo', async () => {
    let failures = 1;
    const { mongo, createIndexCalls } = fakeMongo(async () => {
      if (failures-- > 0) throw new Error('connection reset');
      return 'ok';
    });
    const svc = new ChatHistoryService(mongo);
    await svc.appendTurn(TURN);
    const after1st = createIndexCalls.length;
    await svc.appendTurn(TURN);
    expect(createIndexCalls.length).toBeGreaterThan(after1st);
  });

  it('idempotente: 2º appendTurn não re-cria índices', async () => {
    const { mongo, createIndexCalls } = fakeMongo();
    const svc = new ChatHistoryService(mongo);
    await svc.appendTurn(TURN);
    const after1st = createIndexCalls.length;
    await svc.appendTurn(TURN);
    expect(createIndexCalls.length).toBe(after1st);
  });
});
