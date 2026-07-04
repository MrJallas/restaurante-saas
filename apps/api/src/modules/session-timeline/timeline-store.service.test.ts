/**
 * M4 (timeline) — contrato do event-store Mongo `session_timeline`.
 *
 * O que este arquivo fixa:
 *  1. ensureIndexes REAL (lição do commit 8c7f222: ensureIndexes que ninguém
 *     chama é placebo): o 1º record() cria os índices ANTES do write —
 *     único { id: 1 } (idempotência por id determinístico), consulta por
 *     sessão { tenantId, sessionId, at } e feed reverso { tenantId, at: -1 }.
 *  2. Idempotência do ensureIndexes entre writes (cria uma vez só) e retry
 *     quando o createIndex falhou (flag só liga com sucesso).
 *  3. Upsert por id com $setOnInsert — retry/duplo-emit NÃO duplica nem
 *     sobrescreve o doc original.
 *  4. FAIL-OPEN TOTAL: Mongo off (tryDb null) ou erro de write → warn e
 *     retorna; NUNCA propaga (o tap roda no caminho do pedido).
 */

import { TimelineStoreService } from './timeline-store.service';
import type { MongoService } from '../../infra/mongo/mongo.service';
import type { TimelineEntry } from '@restaurant/shared-types';

interface RecordedOp {
  op: 'createIndex' | 'updateOne';
  collection: string;
  args: unknown[];
}

function fakeMongo(overrides?: {
  createIndex?: (...args: unknown[]) => Promise<unknown>;
  updateOne?: (...args: unknown[]) => Promise<unknown>;
}) {
  const ops: RecordedOp[] = [];

  function collection(name: string) {
    return {
      createIndex: async (...args: unknown[]) => {
        ops.push({ op: 'createIndex', collection: name, args });
        if (overrides?.createIndex) return overrides.createIndex(...args);
        return 'ok';
      },
      updateOne: async (...args: unknown[]) => {
        ops.push({ op: 'updateOne', collection: name, args });
        if (overrides?.updateOne) return overrides.updateOne(...args);
        return { upsertedId: 'fake', matchedCount: 0 };
      },
    };
  }

  const mongo = { tryDb: () => ({ collection }) } as unknown as MongoService;
  return { mongo, ops };
}

const ENTRY: TimelineEntry = {
  id: 'pay:pay-1',
  kind: 'payment.confirmed',
  at: '2026-07-04T12:03:00.000Z',
  sessionId: 'ts-11',
  actor: { type: 'customer', id: null, name: null },
  refs: { paymentId: 'pay-1' },
  payload: { amountCents: 12345, method: 'pix' },
};

const TENANT = 'resto_dev';

describe('TimelineStoreService — event-store session_timeline (M4)', () => {
  it('1º record cria os 3 índices (unique id + tenant/session/at + tenant/at desc) ANTES do write, na coleção session_timeline', async () => {
    const { mongo, ops } = fakeMongo();
    await new TimelineStoreService(mongo).record(ENTRY, TENANT);

    const indexOps = ops.filter((o) => o.op === 'createIndex');
    const writeOps = ops.filter((o) => o.op === 'updateOne');
    expect(indexOps).toHaveLength(3);
    expect(writeOps).toHaveLength(1);
    expect(ops.every((o) => o.collection === 'session_timeline')).toBe(true);
    // Índices ANTES do write (senão o 1º doc entra sem garantia de unicidade).
    expect(ops.findIndex((o) => o.op === 'updateOne')).toBeGreaterThan(
      ops.map((o) => o.op).lastIndexOf('createIndex'),
    );

    const keys = indexOps.map((o) => o.args[0]);
    expect(keys).toContainEqual({ id: 1 });
    expect(keys).toContainEqual({ tenantId: 1, sessionId: 1, at: 1 });
    expect(keys).toContainEqual({ tenantId: 1, at: -1 });
    // { id: 1 } é ÚNICO — é ele que faz retry/duplo-emit colapsar num doc só.
    const idIndex = indexOps.find((o) => JSON.stringify(o.args[0]) === JSON.stringify({ id: 1 }));
    expect(idIndex?.args[1]).toMatchObject({ unique: true });
  });

  it('idempotente: 2º record NÃO re-cria índices', async () => {
    const { mongo, ops } = fakeMongo();
    const store = new TimelineStoreService(mongo);
    await store.record(ENTRY, TENANT);
    const after1st = ops.filter((o) => o.op === 'createIndex').length;
    await store.record({ ...ENTRY, id: 'pay:pay-2' }, TENANT);
    expect(ops.filter((o) => o.op === 'createIndex')).toHaveLength(after1st);
    expect(ops.filter((o) => o.op === 'updateOne')).toHaveLength(2);
  });

  it('createIndex falhou → write ainda acontece (fail-open) e o PRÓXIMO record tenta os índices de novo', async () => {
    let failIndexes = true;
    const { mongo, ops } = fakeMongo({
      createIndex: async () => {
        if (failIndexes) throw new Error('index build lock');
        return 'ok';
      },
    });
    const store = new TimelineStoreService(mongo);

    await expect(store.record(ENTRY, TENANT)).resolves.toBeUndefined();
    expect(ops.filter((o) => o.op === 'updateOne')).toHaveLength(1);
    const afterFailure = ops.filter((o) => o.op === 'createIndex').length;

    failIndexes = false;
    await store.record({ ...ENTRY, id: 'pay:pay-2' }, TENANT);
    // Flag só liga com sucesso — a falha anterior não vira "garantido".
    expect(ops.filter((o) => o.op === 'createIndex').length).toBeGreaterThan(afterFailure);
  });

  it('grava via updateOne({ id }, { $setOnInsert: entry+tenantId }, { upsert: true }) — sem $set (doc original vence no duplo-emit)', async () => {
    const { mongo, ops } = fakeMongo();
    await new TimelineStoreService(mongo).record(ENTRY, TENANT);

    const write = ops.find((o) => o.op === 'updateOne');
    expect(write?.args[0]).toEqual({ id: ENTRY.id });
    expect(write?.args[1]).toEqual({ $setOnInsert: { ...ENTRY, tenantId: TENANT } });
    expect(write?.args[2]).toEqual({ upsert: true });
  });

  it('fail-open: Mongo off (tryDb null) → retorna sem explodir e sem tocar coleção', async () => {
    const mongo = { tryDb: () => null } as unknown as MongoService;
    await expect(new TimelineStoreService(mongo).record(ENTRY, TENANT)).resolves.toBeUndefined();
  });

  it('fail-open: updateOne rejeita → record resolve sem propagar (tap roda no caminho do pedido)', async () => {
    const { mongo } = fakeMongo({
      updateOne: async () => {
        throw new Error('E11000 duplicate key');
      },
    });
    await expect(new TimelineStoreService(mongo).record(ENTRY, TENANT)).resolves.toBeUndefined();
  });
});
