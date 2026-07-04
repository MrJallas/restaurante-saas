// === Session timeline (fatia M1 — contrato) ===
// Entrada canônica da timeline de sessão (decisão Caleb 2026-07-04:
// event-store Mongo; M1 é contrato + mappers, agnóstico ao store). Cada
// entry nasce de uma row SQL (mappers puros em
// apps/api/src/modules/session-timeline/) ou, no futuro (M2+), de um WS
// event dobrado no store. O `id` é derivado da fonte — reprocessar a mesma
// row SEMPRE produz o mesmo id (idempotência no upsert do store).

export type TimelineActorType = 'staff' | 'customer' | 'system';

/**
 * Quem praticou o ATO. Colunas legacy (`changed_by`, `closed_by`,
 * `created_by`) são VARCHAR misturando UUID de staff, 'system', 'customer'
 * e labels compostos ('scan_verification:rejected', 'system:ttl-4h') — o
 * mapper traduz pra este shape e preserva o label cru em `payload.reason`
 * quando não há UUID. `name` só vem preenchido quando o caller já resolveu
 * o nome (join feito FORA do mapper puro).
 */
export interface TimelineActor {
  type: TimelineActorType;
  id: string | null;
  name: string | null;
}

/**
 * Enum FECHADO do 1º corte (famílias mapeadas). A ORDEM do array é
 * canônica: é a prioridade de desempate do sort quando dois entries têm o
 * mesmo `at` (causalidade: sessão abre antes de tudo, pagamento/fechamento
 * por último).
 */
// O ARRAY de kinds (valor de runtime) vive em
// apps/api/src/modules/session-timeline/timeline-kinds.ts — este package é
// consumido como SOURCE (.ts) pelo ts-node CJS do container e import de
// VALOR daqui quebra o boot (loadESMFromCJS; achado 2026-07-04 no deploy do
// M4 — imports só-de-types são elididos no emit, por isso o resto da api
// sempre funcionou). Aqui fica só o TYPE; o array do api tem guard de
// completude por tipo (divergência = erro de compilação).
export type TimelineKind =
  | 'session.opened'
  | 'participant.joined'
  | 'participant.approved'
  | 'late_arrival.requested'
  | 'late_arrival.approved'
  | 'late_arrival.rejected'
  | 'merge.requested'
  | 'merge.approved'
  | 'merge.rejected'
  | 'waiter.called'
  | 'waiter.acknowledged'
  | 'order.created'
  | 'order.status_changed'
  | 'delivery.called'
  | 'delivery.claimed'
  | 'delivery.delivered'
  | 'courtesy.created'
  | 'complaint.received'
  | 'complaint.resolved'
  | 'session.flag_changed'
  | 'payment.confirmed'
  | 'session.closed';

/** Ponteiros pros agregados de origem (todos opcionais — depende do kind). */
export interface TimelineRefs {
  orderId?: string;
  paymentId?: string;
  callId?: string;
  requestId?: string;
  deliveryId?: string;
}

export interface TimelineEntry {
  /**
   * "<fonte>:<pk>" — estável/idempotente (ex.: "osh:8f3a…", "pay:…",
   * "wcall:…"). Fontes multi-fase sufixam a fase: "odel:<pk>:claimed".
   */
  id: string;
  kind: TimelineKind;
  /** ISO timestamp do ATO (não do insert, quando a fonte distingue). */
  at: string;
  /** tableSessionId dono da timeline. */
  sessionId: string;
  actor: TimelineActor;
  refs: TimelineRefs;
  /**
   * Dados específicos do kind (fromStatus/toStatus, totalCents,
   * otherTableNumber…). `reason` carrega o label legacy cru quando o actor
   * não era um UUID.
   */
  payload: Record<string, unknown>;
}

// === Leitura da timeline (fatia M6 — endpoints staff-side) ===
// SÓ TYPES aqui (regra 045133a: o api importa este package como source .ts e
// import de VALOR quebra o boot ts-node CJS).

/** Sumário Postgres da sessão dona da timeline (cabeçalho da resposta). */
export interface TimelineSessionSummary {
  sessionId: string;
  /** Número canônico da mesa (dígitos do `tables.code`); null se o code não tem dígito. */
  tableNumber: number | null;
  /** `customers.name` do host — null quando a sessão não tem host registrado. */
  hostName: string | null;
  status: string;
  createdAt: string;
  closedAt: string | null;
}

/** Nó da árvore de merge (uma table_session alcançada por merges aprovados). */
export interface MergeTreeNode {
  sessionId: string;
  tableNumber: number | null;
  hostName: string | null;
  createdAt: string;
}

/** Aresta = uma table_merge_request APROVADA (from = sessão de origem). */
export interface MergeTreeEdge {
  requestId: string;
  from: string;
  to: string;
  approvedAt: string | null;
}

/**
 * Componente conexo de merges aprovados alcançável a partir de `root`
 * (expansão bidirecional source↔target, depth máx 10, guard de ciclo).
 * `null` na resposta quando a sessão não participa de merge aprovado.
 */
export interface SessionMergeTree {
  root: string;
  nodes: MergeTreeNode[];
  edges: MergeTreeEdge[];
}

/** GET /:slug/sessions/:sessionId/timeline */
export interface SessionTimelineResponse {
  session: TimelineSessionSummary;
  /**
   * Página de entries em ordem cronológica ASC (comparator M1: at →
   * prioridade causal do kind → id). Paginação backward: sem `before` vêm
   * os `limit` mais recentes; próxima página = `before` com o `at` da
   * primeira entry da página atual.
   */
  entries: TimelineEntry[];
  mergeTree: SessionMergeTree | null;
}

/** Item de GET /:slug/tables/:tableNumber/sessions ("mesa de [hostName]"). */
export interface TableSessionHistoryItem {
  sessionId: string;
  hostName: string | null;
  createdAt: string;
  closedAt: string | null;
  /**
   * Quem fechou, legível: nome do staff quando `closed_by` era UUID de
   * staff; senão o label legacy cru ('system:ttl-4h', 'customer'…); null
   * enquanto a sessão está aberta.
   */
  closedByLabel: string | null;
  totalOrders: number;
  /** Soma de payments confirmados ('confirmed' + legado 'paid'). */
  totalPaidCents: number;
}

/** GET /:slug/tables/:tableNumber/sessions */
export interface TableSessionsHistoryResponse {
  sessions: TableSessionHistoryItem[];
}
