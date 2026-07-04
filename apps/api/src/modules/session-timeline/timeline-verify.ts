/**
 * Fatia M8 da timeline — DIFF PURO da reconciliação SQL↔store.
 *
 * Rede de segurança pré-beta pro tap fire-and-forget do M4 (que pode PERDER
 * evento num outage do Mongo) E pra medir a DIVERGÊNCIA DE ID entre a
 * verdade-SQL (mappers do backfill M5) e o que está gravado no event-store.
 *
 * SEM I/O: o script `apps/api/scripts/verify-timeline.ts` é quem lê o pg e o
 * Mongo; este módulo recebe (entries-verdade-SQL, docs-do-store) e devolve o
 * relatório. Assim o núcleo do veredito é unit-testável e type-checkado pelo
 * tsc do app.
 *
 * ─── Por que existe DIVERGÊNCIA de id ──────────────────────────────────────
 * O tap (M4) deriva o id do PAYLOAD do wire; o backfill (M5) deriva da ROW
 * SQL. Onde o payload carrega o pk natural da row, os dois CONVERGEM (upsertam
 * no mesmo doc). Mas 3 kinds NÃO têm pk no payload do tap e usam um esquema
 * `ws:*` sintético — divergindo do `<fonte>:<pk>` do backfill:
 *
 *   kind                  | tap (M4)                                   | backfill (M5)
 *   ----------------------|--------------------------------------------|----------------
 *   order.status_changed  | ws:order:status:<orderId>:<status>:<at>    | osh:<pk>
 *   delivery.claimed      | ws:order:claimed:<orderId>:<claimedBy>     | odel:<pk>:claimed
 *   session.flag_changed  | ws:session.flag_changed:<sess>:<flags>:<by>| flag:<pk>[:cleared]
 *
 * Para esses kinds o MESMO ato lógico pode existir como DOIS docs no store
 * (um `ws:*` gravado live pelo tap E um `<fonte>:<pk>` gravado por um backfill
 * posterior) — o bug de DUPLICAÇÃO que este verificador conta.
 */

import type { TimelineEntry, TimelineKind } from '@restaurant/shared-types';

/** Doc mínimo lido do store (projeção do Mongo). refs/payload p/ dedup lógico. */
export interface StoreDoc {
  id: string;
  kind: TimelineKind;
  sessionId: string;
  refs?: Record<string, string>;
  payload?: Record<string, unknown>;
}

/** Store-only separado: esperado (tap-only pk-less) vs órfão real. */
export interface StoreOnlyBucket {
  /** ids `ws:*` — tap-only legítimos (kinds sem pk natural no payload). */
  expectedTapOnly: string[];
  /** ids que não são `ws:*` NEM deriváveis do SQL — órfão real, investigar. */
  unexpectedOrphan: string[];
}

/** Contagem por kind de um lado do diff. */
export type CountByKind = Partial<Record<TimelineKind, number>>;

export interface VerifyReport {
  /** Total de ids-verdade computados do SQL. */
  sqlTotal: number;
  /** Total de docs lidos do store. */
  storeTotal: number;
  /** id-SQL ausente no store (perda do tap OU nunca backfillado) — por kind. */
  missing: {
    ids: string[];
    byKind: CountByKind;
  };
  /** id no store não-derivável do SQL, separado por natureza. */
  storeOnly: StoreOnlyBucket & { byKind: CountByKind };
  /**
   * DUPLICAÇÃO LÓGICA: o mesmo ato existe nos DOIS esquemas no store
   * simultaneamente (um `ws:*` do tap E um `<fonte>:<pk>` do backfill).
   * `count` é o nº de atos duplicados; `pairs` lista alguns exemplos.
   */
  dupLogica: {
    count: number;
    byKind: CountByKind;
    /** Exemplos (limitado) — cada par é [idEsquemaSql, idEsquemaWs]. */
    pairs: Array<{ kind: TimelineKind; sqlId: string; wsId: string; key: string }>;
  };
  /** true = qualquer missing, órfão inesperado ou dup lógico. */
  drift: boolean;
}

/** Prefixo do esquema sintético do tap p/ kinds sem pk no payload (M4). */
const TAP_WS_PREFIX = 'ws:';

/**
 * Kinds cujo id-scheme DIVERGE entre tap (`ws:*`) e backfill (`<fonte>:<pk>`).
 * Só esses podem gerar duplicata lógica no store; ver tabela no header.
 */
const DIVERGENT_KINDS: ReadonlySet<TimelineKind> = new Set<TimelineKind>([
  'order.status_changed',
  'delivery.claimed',
  'session.flag_changed',
]);

/** Máximo de pares de exemplo guardados no relatório (contagem é sempre exata). */
const MAX_DUP_PAIRS = 50;

/** Um id `ws:*` é tap-only legítimo (kind sem pk natural no payload). */
export function isTapOnlyId(id: string): boolean {
  return id.startsWith(TAP_WS_PREFIX);
}

/**
 * CHAVE LÓGICA scheme-independente de um ato, pros kinds que divergem — o que
 * torna um `ws:*` (tap) e um `<fonte>:<pk>` (backfill) reconhecíveis como o
 * MESMO evento. Retorna null quando o kind não diverge OU não há campo estável
 * pra ancorar a chave (aí não dá pra afirmar duplicação — não conta).
 *
 *  - order.status_changed → orderId + toStatus (o par que o tap coloca no id
 *    `ws:order:status:<orderId>:<status>:<at>`; o backfill osh tem os dois em
 *    refs.orderId + payload.toStatus).
 *  - delivery.claimed     → orderId (tap `ws:order:claimed:<orderId>:...`;
 *    backfill odel tem refs.orderId — deliveryId não está no id do tap).
 *  - session.flag_changed → sessionId (tap agrega flags num id só e o backfill
 *    é 1 doc por flag; sem pk comum, ancoramos na sessão — conservador: só
 *    acusa dup quando há `ws:*` E `flag:*` da MESMA sessão).
 */
export function logicalKey(doc: {
  kind: TimelineKind;
  sessionId: string;
  refs?: Record<string, string>;
  payload?: Record<string, unknown>;
}): string | null {
  switch (doc.kind) {
    case 'order.status_changed': {
      const orderId = doc.refs?.orderId;
      const toStatus = doc.payload?.toStatus;
      if (!orderId || typeof toStatus !== 'string') return null;
      return `order.status_changed|${orderId}|${toStatus}`;
    }
    case 'delivery.claimed': {
      const orderId = doc.refs?.orderId;
      if (!orderId) return null;
      return `delivery.claimed|${orderId}`;
    }
    case 'session.flag_changed': {
      // Sem pk comum entre os dois esquemas — ancora na sessão (o mais forte
      // que os dois lados compartilham). Conservador: colapsa flags distintos
      // da mesma sessão, então NUNCA superconta duplicação.
      return `session.flag_changed|${doc.sessionId}`;
    }
    default:
      return null;
  }
}

/**
 * DIFF PURO. Recebe a verdade-SQL (entries dos mappers do backfill) e os docs
 * lidos do store; devolve o relatório de reconciliação.
 *
 * @param sqlEntries entries computados dos mappers SQL (a verdade).
 * @param storeDocs  docs projetados do Mongo do tenant.
 */
export function diffTimeline(
  sqlEntries: readonly TimelineEntry[],
  storeDocs: readonly StoreDoc[],
): VerifyReport {
  const sqlById = new Map<string, TimelineEntry>();
  for (const e of sqlEntries) sqlById.set(e.id, e);
  const storeIds = new Set(storeDocs.map((d) => d.id));

  // ── MISSING_IN_STORE: id-SQL que não está no store ──────────────────────
  const missingIds: string[] = [];
  const missingByKind: CountByKind = {};
  for (const [id, entry] of sqlById) {
    if (!storeIds.has(id)) {
      missingIds.push(id);
      missingByKind[entry.kind] = (missingByKind[entry.kind] ?? 0) + 1;
    }
  }

  // ── STORE_ONLY: doc no store não-derivável do SQL ───────────────────────
  const expectedTapOnly: string[] = [];
  const unexpectedOrphan: string[] = [];
  const storeOnlyByKind: CountByKind = {};
  for (const doc of storeDocs) {
    if (sqlById.has(doc.id)) continue; // convergiu com o SQL — íntegro.
    storeOnlyByKind[doc.kind] = (storeOnlyByKind[doc.kind] ?? 0) + 1;
    if (isTapOnlyId(doc.id)) expectedTapOnly.push(doc.id);
    else unexpectedOrphan.push(doc.id);
  }

  // ── DUPLICAÇÃO LÓGICA: o mesmo ato nos DOIS esquemas no store ────────────
  // Indexa os docs do store por chave lógica, separando o lado ws (tap) do
  // lado <fonte>:<pk> (backfill). Quando os DOIS lados têm doc pra mesma
  // chave, é uma duplicata física real no store.
  const wsByKey = new Map<string, string>(); // key → um id ws de exemplo
  const sqlSchemeByKey = new Map<string, string>(); // key → um id <fonte>:pk
  for (const doc of storeDocs) {
    if (!DIVERGENT_KINDS.has(doc.kind)) continue;
    const key = logicalKey(doc);
    if (!key) continue;
    if (isTapOnlyId(doc.id)) {
      if (!wsByKey.has(key)) wsByKey.set(key, doc.id);
    } else {
      if (!sqlSchemeByKey.has(key)) sqlSchemeByKey.set(key, doc.id);
    }
  }

  const dupByKind: CountByKind = {};
  const dupPairs: VerifyReport['dupLogica']['pairs'] = [];
  let dupCount = 0;
  for (const [key, wsId] of wsByKey) {
    const sqlId = sqlSchemeByKey.get(key);
    if (!sqlId) continue; // só o lado ws → não é duplicata, é tap-only legítimo.
    dupCount++;
    const kind = key.split('|', 1)[0] as TimelineKind;
    dupByKind[kind] = (dupByKind[kind] ?? 0) + 1;
    if (dupPairs.length < MAX_DUP_PAIRS) dupPairs.push({ kind, sqlId, wsId, key });
  }

  const drift = missingIds.length > 0 || unexpectedOrphan.length > 0 || dupCount > 0;

  return {
    sqlTotal: sqlById.size,
    storeTotal: storeDocs.length,
    missing: { ids: missingIds, byKind: missingByKind },
    storeOnly: { expectedTapOnly, unexpectedOrphan, byKind: storeOnlyByKind },
    dupLogica: { count: dupCount, byKind: dupByKind, pairs: dupPairs },
    drift,
  };
}
