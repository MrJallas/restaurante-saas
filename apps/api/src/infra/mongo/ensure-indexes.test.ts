import type { Collection, Document } from 'mongodb';
import { ensureIndexes, type EnsuredIndex } from './ensure-indexes';

/**
 * Volume antigo guarda os índices com o nome padrão do MongoDB (`expiresAt_1`);
 * o `createIndex` com o nome canônico responde 85 sem criar nada. Mesmo índice
 * com outro nome está garantido; índice com outra definição não está.
 */

const TTL: EnsuredIndex = { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 };
const BY_THREAD: EnsuredIndex = { key: { threadId: 1, createdAt: 1 }, name: 'threadId_createdAt' };

function mongoError(code: number): Error {
  return Object.assign(new Error(`code ${code}`), { code });
}

function fakeCollection(existing: Document[], createIndex: (key: Document) => Promise<string>) {
  const calls: Document[] = [];
  const collection = {
    collectionName: 'chat_messages',
    createIndex: async (key: Document) => {
      calls.push(key);
      return createIndex(key);
    },
    listIndexes: () => ({ toArray: async () => existing }),
  } as unknown as Collection<Document>;
  return { collection, calls };
}

describe('ensureIndexes', () => {
  it('nome canônico criado ou já presente → sem divergência', async () => {
    const { collection, calls } = fakeCollection([], async () => 'ok');
    await expect(ensureIndexes(collection, [TTL, BY_THREAD])).resolves.toEqual([]);
    expect(calls).toHaveLength(2);
  });

  it('volume antigo: mesmo índice com o nome padrão (85) → garantido, sem divergência', async () => {
    const { collection } = fakeCollection(
      [
        { name: '_id_', key: { _id: 1 } },
        { name: 'expiresAt_1', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
        { name: 'threadId_1_createdAt_1', key: { threadId: 1, createdAt: 1 } },
      ],
      async () => {
        throw mongoError(85);
      },
    );
    await expect(ensureIndexes(collection, [TTL, BY_THREAD])).resolves.toEqual([]);
  });

  it('mesma chave SEM o TTL → divergência reportada, e o índice seguinte ainda é tentado', async () => {
    const { collection, calls } = fakeCollection(
      [{ name: 'expiresAt_1', key: { expiresAt: 1 } }],
      async (key) => {
        if ('expiresAt' in key) throw mongoError(85);
        return 'ok';
      },
    );
    await expect(ensureIndexes(collection, [TTL, BY_THREAD])).resolves.toEqual([
      'chat_messages.expiresAt_ttl',
    ]);
    expect(calls).toHaveLength(2);
  });

  it('único esperado mas existente não-único → divergência', async () => {
    const unique: EnsuredIndex = { key: { a: 1, b: 1 }, name: 'a_b_unique', unique: true };
    const { collection } = fakeCollection([{ name: 'a_1_b_1', key: { a: 1, b: 1 } }], async () => {
      throw mongoError(85);
    });
    await expect(ensureIndexes(collection, [unique])).resolves.toEqual([
      'chat_messages.a_b_unique',
    ]);
  });

  it('nome canônico com outra chave (86) → divergência', async () => {
    const { collection } = fakeCollection(
      [{ name: 'threadId_createdAt', key: { threadId: 1 } }],
      async () => {
        throw mongoError(86);
      },
    );
    await expect(ensureIndexes(collection, [BY_THREAD])).resolves.toEqual([
      'chat_messages.threadId_createdAt',
    ]);
  });

  it('ordem da chave importa: {createdAt, threadId} não é {threadId, createdAt}', async () => {
    const { collection } = fakeCollection(
      [{ name: 'createdAt_1_threadId_1', key: { createdAt: 1, threadId: 1 } }],
      async () => {
        throw mongoError(85);
      },
    );
    await expect(ensureIndexes(collection, [BY_THREAD])).resolves.toEqual([
      'chat_messages.threadId_createdAt',
    ]);
  });

  it('falha que não é de definição (rede) → lança para o chamador tentar de novo', async () => {
    const { collection } = fakeCollection([], async () => {
      throw new Error('connection reset');
    });
    await expect(ensureIndexes(collection, [TTL])).rejects.toThrow('connection reset');
  });
});
