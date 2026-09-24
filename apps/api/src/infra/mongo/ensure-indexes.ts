import type { Collection, Document } from 'mongodb';

/**
 * Índice que a API garante sozinha na primeira gravação. O `name` é o canônico,
 * o mesmo de `packages/database/scripts/mongo-init.ts` e do `mongo-init.js` do
 * primeiro boot: com nomes iguais nos três lugares, `createIndex` é no-op.
 */
export interface EnsuredIndex {
  key: Record<string, 1 | -1>;
  name: string;
  unique?: boolean;
  expireAfterSeconds?: number;
}

/** IndexOptionsConflict: mesma chave já existe com outro nome ou outras opções. */
const INDEX_OPTIONS_CONFLICT = 85;
/** IndexKeySpecsConflict: mesmo nome já existe com outra chave. */
const INDEX_KEY_SPECS_CONFLICT = 86;

function sameKey(a: Document, b: Record<string, number>): boolean {
  return JSON.stringify(Object.entries(a)) === JSON.stringify(Object.entries(b));
}

/**
 * Garante cada índice e devolve os que divergem de verdade (`coleção.nome`).
 *
 * Volume antigo guarda o mesmo índice com o nome padrão do MongoDB
 * (`expiresAt_1`): o `createIndex` com o nome canônico responde 85, mas chave,
 * unicidade e TTL são os mesmos, então o índice está garantido e segue. A API
 * não renomeia (seria drop + create em runtime); quem converge o nome é o
 * `npm run mongo:init`.
 *
 * Divergência real (mesma chave sem o TTL, ou o nome canônico com outra chave)
 * não se resolve repetindo o `createIndex` a cada gravação: volta na lista para
 * quem chamou registrar. Falha de conexão continua lançando, para o chamador
 * tentar de novo depois.
 */
export async function ensureIndexes<T extends Document>(
  collection: Collection<T>,
  indexes: EnsuredIndex[],
): Promise<string[]> {
  const conflicts: string[] = [];
  for (const ix of indexes) {
    const { key, ...options } = ix;
    try {
      await collection.createIndex(key, options);
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      if (code !== INDEX_OPTIONS_CONFLICT && code !== INDEX_KEY_SPECS_CONFLICT) throw err;
      const existing = (await collection.listIndexes().toArray()).find((current) =>
        sameKey(current.key as Document, key),
      );
      const equivalent =
        existing !== undefined &&
        Boolean(existing.unique) === Boolean(ix.unique) &&
        existing.expireAfterSeconds === ix.expireAfterSeconds;
      if (!equivalent) conflicts.push(`${collection.collectionName}.${ix.name}`);
    }
  }
  return conflicts;
}
