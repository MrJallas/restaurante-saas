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

function fakeMongo() {
  const createIndexCalls: Array<{ collection: string; key: Record<string, number> }> = [];
  const collections = new Map<string, unknown>();

  function collection(name: string) {
    if (!collections.has(name)) {
      collections.set(name, {
        createIndex: async (key: Record<string, number>) => {
          createIndexCalls.push({ collection: name, key });
          return 'ok';
        },
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

  it('idempotente: 2º appendTurn não re-cria índices', async () => {
    const { mongo, createIndexCalls } = fakeMongo();
    const svc = new ChatHistoryService(mongo);
    await svc.appendTurn(TURN);
    const after1st = createIndexCalls.length;
    await svc.appendTurn(TURN);
    expect(createIndexCalls.length).toBe(after1st);
  });
});
