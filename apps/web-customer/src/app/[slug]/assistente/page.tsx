'use client';

import Image from 'next/image';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { apiPost, apiGet, apiPatch, ApiRequestError } from '../../../lib/api';
import { clearDeliveredContinuationHint } from '../../../lib/continuationHints';
import { recordCustomerEvent } from '../../../lib/customerEvents';
import { listMessages, deleteThread, deleteAllThreads } from '../../../lib/api/chat-history';
import { listCustomerCourtesies, respondCustomerCourtesy } from '../../../lib/api/courtesies';
import {
  approveTableMerge,
  createTableMergeRequest,
  rejectTableMerge,
  requestHostAssist,
} from '../../../lib/api/customer-host';
import type {
  ChatMessageDto,
  CourtesyStatus,
  CustomerCourtesyDto,
  MergeCooldownDto,
  WsMergeCooldownStarted,
  WsTableMergeApproved,
  WsTableMergeCreated,
  WsTableMergeRejected,
} from '@restaurant/shared-types';
import { getSessionToken } from '../../../lib/storage';
import { useSession } from '../../../hooks/useSession';
import { useNav } from '../../../hooks/useNav';
import { useTableMerge } from '../../../hooks/useTableMerge';
import {
  isDisambiguationAsk,
  isServerResolvedAssistantTool,
} from '../../../lib/assistant-tool-policy';
import { useTableSocket } from '../../../hooks/useTableSocket';
import { useActiveOrderStatus, type ActiveOrderStatus } from '../../../hooks/useActiveOrderStatus';
import { useDraftOrder } from '../../../providers/DraftOrderProvider';
import { AppShell } from '../../../components/layout/AppShell';
import { Bubble } from '../../../components/ui/Bubble';
import { StaffBubble } from '../../../components/ui/StaffBubble';
import { CourtesyArrival } from '../../../components/ui/CourtesyArrival';
import { SoftInput } from '../../../components/ui/SoftInput';
import { ToolCallIndicator } from '../../../components/ui/ToolCallIndicator';
import { SuggestionChip } from '../../../components/ui/SuggestionChip';
import { PillButton } from '../../../components/ui/PillButton';
import { HomeHero } from '../../../components/home/HomeHero';
import { CommandPicker, type CommandModeChoice } from '../../../components/cardapio/CommandPicker';
import { useUIState } from '../../../providers/UIStateProvider';
import { OverlaySalonMap, type SalonTable } from '../../../components/ui/OverlaySalonMap';
import { TypewriterBubble } from '../../../screens/customer-host-flows/TypewriterBubble';
import { MergeTypewriterBubble } from '../../../screens/customer-host-flows/MergeTypewriterBubble';
import { ScreenCustomerMergeCooldown } from '../../../screens/customer-host-flows/ScreenCustomerMergeCooldown';
import { ScreenCustomerPostMergeApproved } from '../../../screens/customer-host-flows/ScreenCustomerPostMergeApproved';
import { ScreenCustomerPostMergeRejected } from '../../../screens/customer-host-flows/ScreenCustomerPostMergeRejected';
import { createLgpdRequest } from '../../../lib/api/feedback';
import { tenantNavigationDestination } from '../../../lib/customer-navigation';

interface LinkedItem {
  id: string;
  name: string;
  priceCents: number;
  imageUrl: string | null;
  categoryName?: string;
}

interface PendingJoinRequest {
  targetCustomerId: string;
  joinerName: string;
  requestedAt: string;
  tableSessionId: string;
}

interface JoinRequestChatState extends PendingJoinRequest {
  /**
   * `cancelled` = o solicitante desistiu antes do host decidir (migration 080).
   * Sem esse estado o card ficava com os botões vivos e o host "aprovava" um
   * pedido que já não existia — o CAS em status='pending' casava 0 linhas.
   */
  decision?: 'approved' | 'rejected' | 'cancelled';
  busy?: boolean;
  error?: string | null;
}

type TableMergeChatKind = 'incoming' | 'waiting' | 'approved' | 'rejected' | 'cooldown';

interface TableMergeChatState {
  kind: TableMergeChatKind;
  requestId?: string | null;
  originSessionId?: string | null;
  targetSessionId?: string | null;
  originTableNumber?: number | null;
  targetTableNumber?: number | null;
  originHostName?: string | null;
  targetHostName?: string | null;
  originPartySize?: number | null;
  targetPartySize?: number | null;
  expiresAt?: string | null;
  cooldownEndsAt?: string | null;
  retryAfterSeconds?: number | null;
  message?: string | null;
  side?: 'a' | 'b' | 'both' | null;
  rejectedBy?: 'a' | 'b' | 'timeout' | null;
  busy?: 'approving' | 'rejecting' | null;
  error?: string | null;
}

interface ChatMessage {
  id: string;
  /**
   * `'staff'` adicionado round 18 (Onda 4 batch 2) — bubble assinada de
   * manager→customer inbound chega via WS `assistant.staff_message_received`
   * e renderiza como `<StaffBubble>` em vez de `<Bubble>` (V20 canon: border-
   * left 3px ink + avatar + eyebrow "RENATA · GERENTE"). Distinct de `ai`
   * (sem assinatura) e do fluxo complaint que reusa `ManagerBubble` (border
   * mostarda + chip-action inset).
   */
  role: 'user' | 'ai' | 'staff' | 'blocked';
  content: string;
  /** Staff metadata · só populated quando role === 'staff'. */
  staffName?: string;
  /** Inicial uppercase pro avatar circle. Derivado de staffName quando ausente. */
  staffInitial?: string;
  /** Cargo (default "Gerente" se ausente — V20 só envia manager hoje). */
  staffRole?: string;
  /** ISO timestamp do WS payload — formatado em "agora"/"há N min" no render. */
  staffCreatedAt?: string;
  linkedItems?: LinkedItem[];
  /** menuItemIds the user chose from this message's cards */
  selectedIds?: string[];
  /** true once the user confirmed the selection from this bubble */
  orderPlaced?: boolean;
  /**
   * When set, this message is the result of the `show_lgpd_notice` tool
   * (followed by `lgpd_data_request` if the customer accepts). The AI
   * service returns the canonical text (verbatim from
   * `services/ai-service/services/lgpd_messages.py`) plus 2 chips. Per
   * the spec, the FE never paraphrases — it renders what the tool
   * returns. `lgpdConsumed` flips after the user picks a chip so the
   * chips disappear and the bubble persists in the history.
   */
  lgpdNotice?: {
    chipConfirmLabel: string;
    chipDismissLabel: string;
    consumed?: boolean;
  };
  /** When set, this message is the LGPD erasure confirmation (post-action). */
  lgpdProtocol?: {
    protocolNumber: string;
  };
  /** Generic tool-call indicator (silent transient state). */
  toolCall?: {
    name: string;
    category: 'menu' | 'order' | 'session' | 'info' | 'staff' | 'payment' | 'destructive' | 'lgpd';
  };
  /** Customer-side courtesy card, hydrated by REST or WS. */
  courtesy?: CustomerCourtesyDto;
  courtesyBusy?: CourtesyDecision | null;
  courtesyError?: string | null;
  /** Host-side pending participant approval shown as a typewriter bubble. */
  joinRequest?: JoinRequestChatState;
  /** Table-merge final states shown inline in the assistant chat. */
  tableMerge?: TableMergeChatState;
}

interface AssistantToolHint {
  /**
   * Discriminator on the tool the AI service decided to render specially:
   *  - `lgpd_notice` → canonical LGPD bubble + 2 consent chips (from
   *    `lgpd_messages.py`). Trigger for `show_lgpd_notice`.
   *  - `table_merge_pick` → AI ran `request_table_merge` without a target;
   *    FE opens `OverlaySalonMap` so the customer can pick. (Wired through
   *    `useTableMerge` below.)
   */
  type?: 'lgpd_notice' | 'table_merge_pick';
  /** Labels to render on the 2 chips (canonical from `lgpd_messages.py`). */
  chips?: { confirm: string; dismiss: string };
  /**
   * For `table_merge_pick`: tables the LLM thinks are merge-eligible.
   * When undefined the overlay falls back to its default 3×3 salon grid.
   */
  tables?: SalonTable[];
}

interface SalonTablesResponse {
  tables: SalonTable[];
}

interface TableParticipantsResponse {
  participants?: Array<{
    customerId: string;
    name: string;
    status: 'pending' | 'approved' | 'rejected';
    isHost: boolean;
    requestedAt?: string | null;
  }>;
}

interface JoinRequestSocketPayload {
  customerId: string;
  name?: string;
  requestedAt?: string;
  tableSessionId?: string;
}

interface JoinDecisionSocketPayload {
  customerId: string;
  status: 'approved' | 'rejected' | 'cancelled';
  decidedAt?: string;
}

/**
 * Generic tool call envelope · mirror of `services/tools/__init__.py`'s
 * `ToolMeta`. Today the assistant endpoint only emits this for tools the FE
 * needs to react to (table merge, LGPD); the pure-text tools resolve in B3
 * and arrive as `response` text instead. Listed here so the FE can dispatch
 * the 23 canonical tools deterministically (per F2 round).
 */
interface AssistantToolCall {
  name: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  actionPayload?: unknown;
  silent?: boolean;
  router?: boolean;
}

type AssistantInlineHistoryMessage =
  | {
      id?: string;
      role: 'user';
      content: string;
      createdAt?: string;
    }
  | {
      id?: string;
      role: 'assistant';
      content: string;
      toolCalls?: AssistantToolCall[] | null;
      createdAt?: string;
    }
  | {
      id?: string;
      role: 'staff';
      content: string;
      staffId?: string | null;
      staffName?: string | null;
      staffRole?: string | null;
      createdAt?: string;
    };

interface AssistantInlineHistoryResponse {
  messages?: AssistantInlineHistoryMessage[];
}

type CourtesyDecision = Exclude<CourtesyStatus, 'pendente'>;

/**
 * Chip canon retornado pela tool dispatched (round 3 Cat 1 / K-1). Mirror
 * de `@restaurant/shared-types::ContextualChip`. Inline aqui pra evitar
 * import cycle até o shared-types exportar a versão pública.
 *
 * `payload` é `unknown` no shared-types (LLM podia mandar qualquer coisa
 * relevante pra ação); aqui sempre tratamos como string ao consumir
 * (string verb pra send, path string pra navigate, prefill string pra
 * expand). Vazio default quando ausente — handler tolera.
 */
interface ChipCanon {
  id: string;
  label: string;
  action: 'send' | 'navigate' | 'expand';
  payload: unknown;
  primary?: boolean;
}

interface SendResponse {
  response: string;
  wasBlocked: boolean;
  blockReason?: string;
  suggestions?: string[];
  /**
   * Round 3 (Cat 1 / K-1): chips canon das tools dispatchadas. Quando
   * presente substitui o trio estático SUGGESTION_CHIPS. Cada chip tem
   * `action` (send|navigate|expand) que o `<SuggestionChip>` sabe lidar.
   */
  chips?: ChipCanon[];
  linkedItems?: LinkedItem[];
  /** Optional tool hints from B3's AI service — see `AssistantToolHint`. */
  toolHint?: AssistantToolHint;
  /**
   * Optional · raw tool calls the AI service emitted this turn. Most are
   * already resolved (e.g. `view_menu` returns text the FE renders as
   * `response`); a handful — `request_table_merge` without `targetTable`,
   * `open_payment_screen`, `delete_chat`, `delete_all_chats` — need FE-side
   * dispatch. See `dispatchToolCall` below.
   */
  toolCalls?: AssistantToolCall[];
}

interface ContinuationPostResponse {
  kind: string;
  text: string;
  chips?: ChipCanon[];
  meta?: {
    subtitle?: string | null;
    primary_cta?: Record<string, unknown> | null;
  };
}

interface MenuItemToolPayload {
  id: string;
  name: string;
  price_cents?: number;
  priceCents?: number;
  image_url?: string | null;
  imageUrl?: string | null;
  category_name?: string;
  categoryName?: string;
}

interface PendingOrderItem {
  id: string;
  name: string;
  priceCents: number;
  quantity: number;
  note?: string;
}

interface PendingOrderAdd {
  items: PendingOrderItem[];
  sourceMessageId?: string;
  openReviewAfterAdd?: boolean;
}

interface LastVisitRepeatResponse {
  items: Array<{
    menuItemId: string;
    name: string;
    quantity: number;
    note: string | null;
    priceCents: number;
    kind: 'food' | 'drink';
    categoryName: string | null;
  }>;
  unavailableItems: Array<{
    name: string;
    categoryName: string | null;
    substitute: { menuItemId: string; name: string; priceCents: number } | null;
  }>;
}

function stripDiacritics(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function wantsLastVisitItems(text: string): boolean {
  const normalized = stripDiacritics(text);
  return /ultima vez|ultima visita|vez passada|pedido passado|mesma coisa|repetir/.test(normalized);
}

function filterLastVisitItems(
  text: string,
  items: LastVisitRepeatResponse['items'],
): LastVisitRepeatResponse['items'] {
  const normalized = stripDiacritics(text);
  const wantsDrinks = /bebida|bebidas|drink|vinho|cerveja|suco|agua|refrigerante/.test(normalized);
  const wantsStarters = /entrada|entradas|petisco|aperitivo/.test(normalized);
  if (!wantsDrinks && !wantsStarters) return items;
  return items.filter((item) => {
    const category = stripDiacritics(item.categoryName ?? '');
    return (
      (wantsDrinks && item.kind === 'drink') ||
      (wantsStarters && /entrada|petisco|aperitivo/.test(category))
    );
  });
}

// Fallback chips — só aparecem em idle (antes do primeiro turno) ou
// quando a tool dispatched não retornou chips canônicos. Backend devolve
// `chips` quando vier de uma tool com chips populated; aí esses defaults
// somem.
//
// Prompt 100 (chips contextuais): os genéricos desconectados ("Sobremesa
// combina?", "Pratos com camarão") saíram — o fallback agora espelha a
// fala idle da landing ("Posso ajudar com sugestões, ingredientes, pedido
// e pagamento") e todos os payloads resolvem no rule-layer sem LLM.
const DEFAULT_SUGGESTIONS: ChipCanon[] = [
  {
    id: 'default-cardapio',
    label: 'Ver cardápio',
    action: 'send' as const,
    payload: 'quero ver o cardápio',
  },
  {
    id: 'default-indica',
    label: 'Me indica algo',
    action: 'send' as const,
    payload: 'me indica algo',
  },
  {
    id: 'default-garcom',
    label: 'Chamar garçom',
    action: 'send' as const,
    payload: 'chama o garçom',
  },
  {
    id: 'default-conta',
    label: 'Pedir a conta',
    action: 'send' as const,
    payload: 'quero pagar a conta',
  },
];

/**
 * Eyebrow de status do pedido (prompt 100 §1): com pedido ativo, a faixa
 * acima da fala da IA mostra SEMPRE o estado canon (labels/cores da tela
 * Meu pedido) + a ETA dinâmica — `Assistente · ● Em preparo · 5–9 min`.
 * Sem pedido ativo o caller renderiza o conteúdo padrão atual.
 */
function AssistantOrderEyebrow({ active }: { active: ActiveOrderStatus }) {
  return (
    <span data-testid="order-status-eyebrow">
      Assistente ·{' '}
      <span
        aria-hidden
        className={`inline-block h-[6px] w-[6px] rounded-full align-middle ${active.dotClass}`}
      />{' '}
      {active.label}
      {active.etaText ? ` · ${active.etaText}` : ''}
    </span>
  );
}

function tableMergeStateFromPayload(
  payload: Partial<
    WsTableMergeCreated['payload'] &
      WsTableMergeApproved['payload'] &
      WsTableMergeRejected['payload'] &
      WsMergeCooldownStarted['payload'] &
      MergeCooldownDto
  >,
): Omit<TableMergeChatState, 'kind'> {
  return {
    requestId: payload.requestId ?? null,
    originSessionId: payload.originSessionId ?? null,
    targetSessionId: payload.targetSessionId ?? null,
    originTableNumber: payload.originTableNumber ?? payload.originTable ?? null,
    targetTableNumber: payload.targetTableNumber ?? payload.targetTable ?? null,
    originHostName: payload.originHostName ?? null,
    targetHostName: payload.targetHostName ?? null,
    originPartySize: payload.originPartySize ?? null,
    targetPartySize: payload.targetPartySize ?? null,
    expiresAt: payload.expiresAt ?? null,
    cooldownEndsAt: payload.cooldownEndsAt ?? payload.expiresAt ?? null,
    retryAfterSeconds: payload.retryAfterSeconds ?? null,
  };
}

function tableMergeCreatedMessage(payload: WsTableMergeCreated['payload']): ChatMessage {
  return {
    id: `table-merge-created-${payload.requestId}`,
    role: 'ai',
    content: '',
    tableMerge: {
      kind: 'incoming',
      ...tableMergeStateFromPayload(payload),
    },
  };
}

function tableMergeWaitingMessage(
  requestId: string | null | undefined,
  payload: Partial<WsTableMergeApproved['payload']> = {},
): ChatMessage {
  return {
    id: `table-merge-waiting-${requestId || 'latest'}`,
    role: 'ai',
    content: 'Sua confirmação foi registrada. Agora falta a outra mesa responder.',
    tableMerge: {
      kind: 'waiting',
      ...tableMergeStateFromPayload({ ...payload, requestId: requestId ?? undefined }),
    },
  };
}

function tableMergeApprovedMessage(
  requestId?: string | null,
  payload: Partial<WsTableMergeApproved['payload']> = {},
): ChatMessage {
  return {
    id: `table-merge-approved-${requestId || 'latest'}`,
    role: 'ai',
    content: '',
    tableMerge: {
      kind: 'approved',
      ...tableMergeStateFromPayload({ ...payload, requestId: requestId ?? undefined }),
      side: payload.side ?? 'both',
    },
  };
}

function tableMergeRejectedMessage(
  requestId?: string | null,
  payload: Partial<WsTableMergeRejected['payload']> = {},
): ChatMessage {
  return {
    id: `table-merge-rejected-${requestId || 'latest'}`,
    role: 'ai',
    content: '',
    tableMerge: {
      kind: 'rejected',
      ...tableMergeStateFromPayload({ ...payload, requestId: requestId ?? undefined }),
      rejectedBy: payload.rejectedBy ?? null,
    },
  };
}

function tableMergeCooldownMessage(
  payload: Partial<WsMergeCooldownStarted['payload'] & MergeCooldownDto & { requestId: string }>,
): ChatMessage {
  const requestId = payload.requestId ?? payload.cooldownId ?? 'latest';
  return {
    id: `table-merge-cooldown-${requestId}`,
    role: 'ai',
    content: '',
    tableMerge: {
      kind: 'cooldown',
      ...tableMergeStateFromPayload(payload),
      message: payload.message ?? payload.message_user ?? null,
      cooldownEndsAt:
        payload.cooldownEndsAt ??
        payload.expiresAt ??
        new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    },
  };
}

function joinRequestKey(req: Pick<PendingJoinRequest, 'targetCustomerId' | 'requestedAt'>): string {
  return `${req.targetCustomerId}:${req.requestedAt || 'pending'}`;
}

function joinRequestBubbleText(joinerName: string, hostName?: string | null): string {
  const hostFirstName = hostName?.trim().split(' ')[0] || '';
  const opener = hostFirstName ? `Olha, ${hostFirstName}:` : 'Olha:';
  return `${opener} ${joinerName || 'alguém'} quer entrar na mesa. Pode deixar?`;
}

function joinRequestChatMessage(req: PendingJoinRequest, hostName?: string | null): ChatMessage {
  return {
    id: `join-request-${joinRequestKey(req)}`,
    role: 'ai',
    content: joinRequestBubbleText(req.joinerName, hostName),
    joinRequest: { ...req, error: null },
  };
}

function isJoinRequestSocketPayload(value: unknown): value is JoinRequestSocketPayload {
  return isRecord(value) && typeof value.customerId === 'string' && value.customerId.length > 0;
}

function isJoinDecisionSocketPayload(value: unknown): value is JoinDecisionSocketPayload {
  return (
    isRecord(value) &&
    typeof value.customerId === 'string' &&
    (value.status === 'approved' || value.status === 'rejected' || value.status === 'cancelled')
  );
}

function isTableMergeCreatedPayload(value: unknown): value is WsTableMergeCreated['payload'] {
  return (
    isRecord(value) &&
    typeof value.requestId === 'string' &&
    typeof value.originSessionId === 'string' &&
    typeof value.targetSessionId === 'string'
  );
}

function isTableMergeApprovedPayload(value: unknown): value is WsTableMergeApproved['payload'] {
  return (
    isRecord(value) &&
    typeof value.requestId === 'string' &&
    (value.side === 'a' || value.side === 'b' || value.side === 'both')
  );
}

function isTableMergeRejectedPayload(value: unknown): value is WsTableMergeRejected['payload'] {
  return (
    isRecord(value) &&
    typeof value.requestId === 'string' &&
    (value.rejectedBy === 'a' || value.rejectedBy === 'b' || value.rejectedBy === 'timeout')
  );
}

function isMergeCooldownStartedPayload(value: unknown): value is WsMergeCooldownStarted['payload'] {
  return (
    isRecord(value) && typeof value.cooldownId === 'string' && typeof value.expiresAt === 'string'
  );
}

/**
 * Payload OBJETO de um chip de confirmação destrutiva (round 5 P0): o gate
 * server-side (`services/ai-service/services/tools/__init__.py::
 * _destructive_confirm_prompt`) devolve `{ tool, args: { confirm: true, … } }`.
 * Esse chip NÃO pode virar texto pro LLM — o `confirm` só é honrado por um
 * sinal OUT-OF-BAND tocado pelo humano. A deleção dispara direto no endpoint
 * canônico (SessionGuard + cookie recognition_token), NUNCA re-roteando pelo
 * token-stream do modelo (senão: loop infinito, o humano nunca deleta).
 */
interface DestructiveConfirmPayload {
  tool: 'delete_chat' | 'delete_all_chats';
  args: { confirm?: unknown; threadId?: unknown; thread_id?: unknown };
}

function asDestructiveConfirmPayload(payload: unknown): DestructiveConfirmPayload | null {
  if (!isRecord(payload)) return null;
  const tool = payload.tool;
  if (tool !== 'delete_chat' && tool !== 'delete_all_chats') return null;
  const args = isRecord(payload.args) ? payload.args : {};
  const confirmed =
    args.confirm === true ||
    (typeof args.confirm === 'string' &&
      ['true', 'yes', 'sim', '1'].includes(args.confirm.trim().toLowerCase()));
  if (!confirmed) return null;
  return { tool, args } as DestructiveConfirmPayload;
}

/**
 * Coerce o `payload` (que é `unknown` no contrato) pra string com fallback
 * pro label. Backend pode mandar string|null|undefined; o handler precisa
 * de uma string final pra navigate (path) ou send (texto pra digitar).
 */
function chipText(chip: ChipCanon): string {
  const normalized = normalizeChipCopy(chip);
  if (typeof normalized.payload === 'string' && normalized.payload.length > 0)
    return normalized.payload;
  return normalized.label;
}

function chipCopyKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeChipCopy(chip: ChipCanon): ChipCanon {
  const payload = typeof chip.payload === 'string' ? chip.payload : '';
  const copy = chipCopyKey(`${chip.id} ${chip.label} ${payload}`);

  if (
    chip.id === 'complaint-text' ||
    (chip.action === 'expand' &&
      (/\b(contar|conta)\b.*\b(rolou|gerencia|gerente)\b/.test(copy) ||
        /\b(reclamacao|reclamar)\b/.test(copy)))
  ) {
    return {
      ...chip,
      action: 'expand',
      label: 'Registrar reclamação formal',
      payload: 'Descreva o problema para registrar a reclamação...',
    };
  }

  if (
    chip.action === 'expand' &&
    /\b(mensagem|recado|comunicar)\b/.test(copy) &&
    /\b(gerencia|gerente)\b/.test(copy)
  ) {
    return {
      ...chip,
      label: 'Enviar mensagem ao gerente',
      payload: 'Escreva a mensagem que o gerente deve receber...',
    };
  }

  return chip;
}

function chipNavigationDestination(slug: string, payload: string): string {
  const raw = payload.trim();
  const ratingMatch = raw.match(/^avaliar[:/](.+)$/);
  if (ratingMatch?.[1]) {
    return tenantNavigationDestination(
      slug,
      `/${slug}/orders/${encodeURIComponent(ratingMatch[1])}/rating`,
    );
  }
  if (raw === 'avaliar' || raw === '/avaliar') {
    return tenantNavigationDestination(slug, `/${slug}/pagamento/feedback`);
  }
  return tenantNavigationDestination(slug, raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Auditoria 2026-07-03 (gêmeo do fix no ai-service): um "não" SOLTO no
// meio de qualquer frase decidia o merge — "não sei o que pedir" recusava
// a junção. Decisão exige frase INEQUÍVOCA (fullmatch curto); o resto
// segue como mensagem normal com o convite intacto.
const MERGE_REJECT_DIRECT_RE =
  /^(nao[,!\s]+)?(nao|agora nao|melhor nao|recusa(r)?|rejeita(r)?|separad[oa]s?|nao pode( juntar)?|nao junta)[\s!.…]*$/;
const MERGE_APPROVE_DIRECT_RE =
  /^(sim[,!\s]+)?(pode( juntar)?( sim)?|sim|claro|libera(r)?|aceita(r)?|junta(r)?|ok|beleza)[\s!.…]*$/;

function tableMergeDecisionFromText(text: string): 'approve' | 'reject' | null {
  const normalized = stripDiacritics(text).trim();
  if (MERGE_REJECT_DIRECT_RE.test(normalized)) {
    return 'reject';
  }
  if (MERGE_APPROVE_DIRECT_RE.test(normalized)) {
    return 'approve';
  }
  return null;
}

function positiveInt(value: unknown, fallback = 1): number {
  const n = numberValue(value);
  if (n === null) return fallback;
  return Math.max(1, Math.min(20, Math.floor(n)));
}

/**
 * Framework bugfix (add_to_order · 2 bubbles contraditórios): mensagem
 * coerente ÚNICA quando o item mandado pelo LLM não resolve no cardápio.
 * Pura pra ser testável isoladamente.
 */
const ADD_TO_ORDER_FAILURE_MESSAGE =
  'Não consegui localizar esse item no cardápio para atualizar seu pedido.';

function addToOrderCallsIn(toolCalls: AssistantToolCall[]): AssistantToolCall[] {
  // Uma call de desambiguação não é um pedido que falhou — é a tool
  // perguntando qual item o cliente quis. Ver `isDisambiguationAsk`.
  return toolCalls.filter(
    (tc) => tc.name === 'add_to_order' && !isDisambiguationAsk(actionPayload(tc)),
  );
}

function actionPayload(call: AssistantToolCall): Record<string, unknown> {
  if (isRecord(call.actionPayload)) return call.actionPayload;
  if (isRecord(call.result) && isRecord(call.result.actionPayload)) {
    return call.result.actionPayload;
  }
  return {};
}

function formatCurrency(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

// Palavras que, combinadas com itens ja mencionados pela IA, indicam "quero
// pedir". Tem que ter VERBO de pedido — "tudo bem"/"tudo certo" virava falso
// positivo (P0 do bug-hunt: usuario respondia saudacao e o app criava
// pedido fake de R$ 78,90 sem confirmacao). "tudo"/"todos"/"ambos" sozinhos
// nao bastam mais — precisam vir junto com verbo de acao.
const ORDER_INTENT_PATTERNS = [
  /\bquero (os |as |o |a |esse|essa|esses|essas|tudo|todos|todas|ambos|ambas|esses|essas|ele|ela|eles|elas)/,
  /\b(pode|podes|poderia) (pedir|mandar|trazer|pegar)\b/,
  /\b(pede|peca|pede la|pede ai|manda|mandar|traz|traga)\b/,
  /\bvou querer\b/,
  /\bvou levar\b/,
  /\bpede pra mim\b/,
  /\bme (traz|ve|vê|da)\b/,
  /\bpedir (os|as|o|a|esse|essa|todos|tudo|ambos)\b/,
  /\bconfirma(r)? (o |os |a |as )?pedido\b/,
  /\bisso mesmo,? (pode |peca|manda|pede)/,
  /\bpode ser,? (manda|pede|pode pedir)/,
  /\b(os|as) (dois|duas|2),? (manda|pede|pode pedir|por favor)/,
];

// "tudo bem"/"tudo certo"/"tudo otimo" sao saudacoes — NAO pedido. Bloqueia
// match espurio quando o usuario acabou de receber linkedItems e responde
// "tudo bem" pra um cumprimento da IA.
const NON_ORDER_TUDO_PATTERNS =
  /\btudo (bem|certo|joia|otimo|ok|legal|tranquilo|certinho|beleza|firmeza)\b/;

// "todos os/as" especifico = pedido; "todos" sozinho ambiguo, exigimos
// contexto de verbo (coberto em ORDER_INTENT_PATTERNS acima).
const ALL_ITEMS_KEYWORDS =
  /\b(os dois|as duas|os 2|ambos|ambas|os tres|as tres|os 3|todos os|todas as)\b/;

/**
 * Formata um ISO timestamp em label humano ("agora", "há N min", "há N h")
 * pra eyebrow direita de bubbles signed (staff/manager). Mantém short — V20
 * canon tem espaço apertado no header do bubble. Fallback "agora" cobre
 * payloads sem timestamp válido (defesa-em-profundidade — backend sempre
 * manda createdAt mas string parse error não pode quebrar o render).
 */
function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return 'agora';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 'agora';
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'agora';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `há ${diffH} h`;
  return 'há tempo';
}

function staffDisplayName(rawName: string | null | undefined): {
  firstName: string;
  initial: string;
} {
  const fullName = rawName?.trim() || 'Gerência';
  const firstName = fullName.split(' ')[0] || 'Gerência';
  return {
    firstName,
    initial: (firstName[0] ?? 'G').toUpperCase(),
  };
}

function staffRoleDisplay(rawRole: string | null | undefined): string {
  const role = rawRole?.trim();
  switch (role) {
    case 'manager':
      return 'Gerente';
    case 'waiter':
      return 'Garçom';
    case 'cook':
      return 'Cozinha';
    case 'host':
      return 'Recepção';
    case 'bartender':
      return 'Bar';
    case 'cashier':
      return 'Caixa';
    default:
      return role || 'Gerente';
  }
}

function isCustomerCourtesyDto(value: unknown): value is CustomerCourtesyDto {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.tableSessionId === 'string' &&
    typeof value.item === 'string' &&
    typeof value.status === 'string' &&
    ['pendente', 'aceita', 'recusada'].includes(value.status)
  );
}

function courtesyChatMessage(courtesy: CustomerCourtesyDto): ChatMessage {
  return {
    id: `courtesy-${courtesy.id}`,
    role: 'ai',
    content: '',
    courtesy,
  };
}

function isDuplicateStaffMessage(existing: ChatMessage, incoming: ChatMessage): boolean {
  if (existing.role !== 'staff' || incoming.role !== 'staff') return false;
  if (existing.id === incoming.id) return true;
  if (existing.content.trim() !== incoming.content.trim()) return false;
  return !!existing.staffCreatedAt && existing.staffCreatedAt === incoming.staffCreatedAt;
}

function isDuplicateJoinRequestMessage(existing: ChatMessage, incoming: ChatMessage): boolean {
  if (!existing.joinRequest || !incoming.joinRequest) return false;
  if (existing.id === incoming.id) return true;
  if (joinRequestKey(existing.joinRequest) === joinRequestKey(incoming.joinRequest)) return true;
  return (
    existing.joinRequest.targetCustomerId === incoming.joinRequest.targetCustomerId &&
    !existing.joinRequest.decision &&
    !incoming.joinRequest.decision
  );
}

function mergeUniqueChatMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const next = [...current];
  for (const msg of incoming) {
    const duplicate = next.some((existing) => {
      if (existing.id === msg.id) return true;
      if (isDuplicateJoinRequestMessage(existing, msg)) return true;
      return isDuplicateStaffMessage(existing, msg);
    });
    if (!duplicate) next.push(msg);
  }
  return next;
}

function upsertTableMergeChatMessage(current: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  if (!incoming.tableMerge?.requestId) {
    return mergeUniqueChatMessages(current, [incoming]);
  }
  let replaced = false;
  const next = current.map((msg) => {
    if (msg.tableMerge?.requestId !== incoming.tableMerge?.requestId) return msg;
    replaced = true;
    return { ...incoming, id: msg.id };
  });
  return replaced ? next : mergeUniqueChatMessages(current, [incoming]);
}

type ToolCategory =
  | 'menu'
  | 'order'
  | 'session'
  | 'info'
  | 'staff'
  | 'payment'
  | 'destructive'
  | 'lgpd';

/**
 * Mapeia nome da tool dispatched pelo backend pra category visual usada
 * no `ToolCallIndicator` inline. Centralizado aqui pra n\u00e3o duplicar
 * em cada lugar que cria `ChatMessage.toolCall`. Default 'info'.
 */
/**
 * Tools cujo efeito é uma side-effect visível (overlay sobe, route push,
 * sheet abre) sem texto bubble como resposta principal. Para essas, atrasamos
 * a side-effect em 1.5s depois do setMessages para que o `ToolCallIndicator`
 * inline (eyebrow `··· USANDO X ···`) tenha tempo de registrar antes da UI
 * shift — o usuário vê "Assistente está usando view_menu..." antes do
 * overlay subir, prevenindo sensação de "engasgo".
 */
const SILENT_PATH_TOOLS = new Set<string>([
  'view_menu',
  'view_order',
  'call_waiter',
  'request_table_merge',
  'open_payment_screen',
  'pay_individual',
  'pay_full',
  'split_bill',
]);

/**
 * Tools cuja resposta principal é o próprio texto do bubble (perguntas livres,
 * info do restaurante, busca/comparação de pratos). O eyebrow `··· USANDO X ···`
 * AINDA aparece pra elas (decisão V20: user quer ver toda tool dispatchada),
 * mas o `dispatchToolCall` skipa o stub bubble "OK" extra — sem isso, "qual o
 * horário?" criava DOIS bubbles: a resposta certa + "OK" duplicado embaixo.
 */
function categorizeToolName(name: string): ToolCategory {
  if (
    name === 'view_menu' ||
    name === 'search_dish' ||
    name === 'check_allergens' ||
    name === 'compare_dishes'
  )
    return 'menu';
  if (
    name === 'add_to_order' ||
    name === 'view_order' ||
    name === 'confirm_order' ||
    name === 'place_order' ||
    name === 'remove_from_cart' ||
    name === 'change_order' ||
    name === 'cancel_order'
  )
    return 'order';
  if (name === 'call_waiter' || name === 'send_complaint' || name === 'send_message_to_manager')
    return 'staff';
  if (
    name === 'request_bill' ||
    name === 'split_bill' ||
    name === 'pay_individual' ||
    name === 'pay_full' ||
    name === 'open_payment_screen'
  )
    return 'payment';
  if (name === 'lgpd_data_request' || name === 'lgpd_notice') return 'lgpd';
  if (name === 'delete_chat' || name === 'delete_all_chats') return 'destructive';
  if (
    name === 'request_table_merge' ||
    name === 'accept_join_request' ||
    name === 'reject_join_request' ||
    name === 'late_arrival'
  )
    return 'session';
  return 'info';
}

/**
 * Mapeia mensagens persistidas no Mongo (DTO) pro shape interno do chat
 * ativo. Usado somente no fluxo explícito de continuar conversa a partir
 * de `/chat-history/:threadId`; entrada direta em `/assistente` nunca
 * reidrata histórico antigo.
 */
function mapHistoryToChat(msgs: ChatMessageDto[]): ChatMessage[] {
  return msgs.map((m, i) => {
    const id = `history-${m.messageId ?? i}`;
    if (m.role === 'user') {
      return { id, role: 'user', content: m.content };
    }
    if (m.role === 'manager') {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      const rawName =
        typeof meta.staffName === 'string' && meta.staffName.length > 0 ? meta.staffName : 'Renata';
      const firstName = rawName.split(' ')[0] || 'Renata';
      return {
        id,
        role: 'staff',
        content: m.content,
        staffName: firstName,
        staffInitial: (firstName[0] ?? 'R').toUpperCase(),
        staffRole: typeof meta.staffRole === 'string' ? meta.staffRole : 'Gerente',
        staffCreatedAt: m.createdAt,
      };
    }
    const firstTool = Array.isArray(m.toolCalls) && m.toolCalls.length > 0 ? m.toolCalls[0] : null;
    const toolName = firstTool && typeof firstTool.name === 'string' ? firstTool.name : null;
    return {
      id,
      role: 'ai',
      content: m.content,
      toolCall: toolName ? { name: toolName, category: categorizeToolName(toolName) } : undefined,
    };
  });
}

function mapInlineHistoryToChat(msgs: AssistantInlineHistoryMessage[]): ChatMessage[] {
  return msgs.flatMap((m, i): ChatMessage[] => {
    const content = m.content?.trim() ?? '';
    if (!content) return [];

    if (m.role === 'user') {
      return [
        {
          id: `assistant-history-${m.id ?? `user-${m.createdAt ?? i}`}`,
          role: 'user',
          content,
        },
      ];
    }

    if (m.role === 'staff') {
      const staff = staffDisplayName(m.staffName);
      return [
        {
          id: `staff-${m.id ?? `${m.createdAt ?? i}-${content}`}`,
          role: 'staff',
          content,
          staffName: staff.firstName,
          staffInitial: staff.initial,
          staffRole: staffRoleDisplay(m.staffRole),
          staffCreatedAt: m.createdAt,
        },
      ];
    }

    const firstTool = Array.isArray(m.toolCalls) && m.toolCalls.length > 0 ? m.toolCalls[0] : null;
    const toolName = firstTool && typeof firstTool.name === 'string' ? firstTool.name : null;
    return [
      {
        id: `assistant-history-${m.id ?? `assistant-${m.createdAt ?? i}`}`,
        role: 'ai',
        content,
        toolCall: toolName ? { name: toolName, category: categorizeToolName(toolName) } : undefined,
      },
    ];
  });
}

function newAssistantConversationId(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function detectOrderIntent(
  message: string,
  previousLinkedItems: LinkedItem[] | undefined,
): LinkedItem[] | null {
  if (!previousLinkedItems || previousLinkedItems.length === 0) return null;
  const msg = normalize(message);

  // Curto-circuito: saudacao com "tudo bem/certo/etc" nao e pedido.
  // Sem esse guard, "tudo bem" disparava placeOrderForItems(linkedItems
  // do turno anterior), criando pedido fake e navegando pra /pix.
  if (NON_ORDER_TUDO_PATTERNS.test(msg)) return null;

  const hasIntent = ORDER_INTENT_PATTERNS.some((re) => re.test(msg));
  if (!hasIntent) return null;

  // "os dois"/"todos"/"tudo"/"ambos" → todos os itens sugeridos
  if (ALL_ITEMS_KEYWORDS.test(msg)) {
    return previousLinkedItems;
  }

  // Se o usuario mencionou nomes especificos → filtra
  const picked = previousLinkedItems.filter((it) => msg.includes(normalize(it.name)));
  if (picked.length > 0) return picked;

  // "quero pedir" sem especificar e um so item na lista → pega esse
  if (previousLinkedItems.length === 1) return previousLinkedItems;

  // Varios itens, nenhum nome mencionado: interpretamos como "todos"
  return previousLinkedItems;
}

export default function AssistentePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const session = useSession();
  const { push } = useNav();
  const { openCallWaiterSheet, openMenuOverlay } = useUIState();
  const {
    items: draftItems,
    addItem,
    updateItem,
    removeItem,
    clear: clearDraftOrder,
    totalCents,
  } = useDraftOrder();
  const router = useRouter();
  const slug = params.slug as string;
  const prefill = searchParams.get('prefill') ?? '';
  const isExpandPrefill = searchParams.get('mode') === 'expand';
  const shouldAutoSendPrefill = prefill.length > 0 && !isExpandPrefill;
  const itemId = searchParams.get('itemId') ?? '';
  const mergeApprovedParam = searchParams.get('mergeApproved') === '1';
  const mergeRequestIdParam = searchParams.get('mergeRequestId') ?? '';
  // "Tentar de novo/outra mesa" vindo da waiting-approval: abre direto o
  // mapa do salão (mesmo fluxo do tool call sem target) em vez de mandar
  // frase pra IA — que caía no eco de status do merge antigo (vídeos
  // 2026-06-10).
  const mergeRetryParam = searchParams.get('mergeRetry') === '1';
  // Continuação explícita: só o menu de conversas arquivadas passa
  // `threadId`. Entrada normal em `/assistente` fica sempre nova.
  const threadIdParam = searchParams.get('threadId') ?? '';

  useEffect(() => {
    if (!getSessionToken()) {
      router.replace(`/${slug}`);
      return;
    }
    // Round 3 Cat 10 (P1 #B-9): chat tem que ter customerId pra grava
    // tool_calls e contextual_chips linkados ao cliente certo. Sem isso
    // assistant_messages.customer_id ficava NULL e o histórico ficava
    // órfão. Redirect pra welcome modal quando ausente.
    //
    // Round 18 (Onda 4 batch 2): fallback pra sessionStorage evita race
    // de 1 frame onde `session.customerId` ainda é null porque o
    // SessionProvider rehydrata em useEffect filho-primeiro depois do
    // primeiro render do AssistentePage. Sem isso, hard reload em
    // `/assistente` redirecionava pra `/identify` mesmo quando o bundle
    // tinha customerId — o cliente ficava preso num loop. O bundle JÁ é
    // source-of-truth (writeBundle persiste em writeCustomer); só
    // estávamos lendo o estado errado.
    if (!session.customerId) {
      let bundleCustomerId: string | null = null;
      try {
        const raw = window.sessionStorage.getItem('session:bundle');
        if (raw) {
          const parsed = JSON.parse(raw) as { customerId?: string };
          if (parsed?.customerId) bundleCustomerId = parsed.customerId;
        }
      } catch {
        /* ignore — fallback path; useEffect roda de novo quando context update */
      }
      if (!bundleCustomerId) {
        router.replace(`/${slug}/identify?next=assistente`);
      }
    }
  }, [slug, router, session.customerId]);

  // Se chegou via prefill (usuario ja digitou algo na home), arrancamos com o
  // bubble do usuario ja visivel + loading — sem exibir o greeting "Olá" —
  // porque do ponto de vista do cliente ele apenas enviou a pergunta.
  const initialMessages = useMemo<ChatMessage[]>(() => {
    if (shouldAutoSendPrefill) {
      return [{ id: 'prefill-user', role: 'user', content: prefill }];
    }
    return [];
  }, [prefill, shouldAutoSendPrefill]);

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState(isExpandPrefill ? prefill : '');
  const [loading, setLoading] = useState(shouldAutoSendPrefill);
  // `/assistente` sem `threadId` sempre abre uma conversa ativa nova por
  // visita. Histórico salvo no Mongo só volta ao chat ativo pelo menu de
  // conversas, quando o usuário escolhe continuar aquele thread.
  const [chatStarted, setChatStarted] = useState<boolean>(
    shouldAutoSendPrefill || !!threadIdParam || mergeApprovedParam,
  );
  const [historyLoading, setHistoryLoading] = useState<boolean>(!!threadIdParam);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [landingGreeting, setLandingGreeting] = useState<string | null>(null);
  // suggestions agora carrega chips canônicos (ChipCanon) em vez de só
  // strings — herdamos do backend `res.chips` quando uma tool dispatched
  // emitiu chips reativos. Fallback é DEFAULT_SUGGESTIONS (idle state).
  const [suggestions, setSuggestions] = useState<ChipCanon[]>(DEFAULT_SUGGESTIONS);
  const [chipBusy, setChipBusy] = useState(false);
  const [continuationRefreshKey, setContinuationRefreshKey] = useState(0);
  const [expandedInputPlaceholder, setExpandedInputPlaceholder] = useState<string | null>(null);
  const [pendingOrderAdd, setPendingOrderAdd] = useState<PendingOrderAdd | null>(null);
  const [isCurrentHost, setIsCurrentHost] = useState(false);
  // Round 3 Cat 4 (V20 chat): última tool dispatched neste turno — usa
  // pra renderizar a eyebrow `··· USANDO ADD_TO_ORDER ···` antes do
  // bubble do assistente.
  const [lastToolName, setLastToolName] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef(false);
  // Framework bugfix: `add_to_order` com id que dá 404 no FE gerava DOIS
  // bubbles contraditórios ("Adicionei X" do texto otimista + "Não localizei"
  // do dispatch). Quando pré-resolvemos e o item não resolve, marcamos a call
  // aqui pra que `dispatchToolCall` NÃO reemita a mensagem de falha — o bubble
  // principal já foi substituído pela mensagem coerente única.
  const suppressedAddFailuresRef = useRef<Set<AssistantToolCall>>(new Set());
  const conversationIdRef = useRef<string | null>(null);
  if (!conversationIdRef.current) {
    conversationIdRef.current = newAssistantConversationId();
  }
  const activeJoinRequest = useMemo<PendingJoinRequest | null>(() => {
    const active = [...messages]
      .reverse()
      .find((msg) => msg.joinRequest && !msg.joinRequest.decision)?.joinRequest;
    if (!active) return null;
    return {
      targetCustomerId: active.targetCustomerId,
      joinerName: active.joinerName,
      requestedAt: active.requestedAt,
      tableSessionId: active.tableSessionId,
    };
  }, [messages]);
  const activeTableMergeMessage = useMemo<ChatMessage | null>(() => {
    return (
      [...messages]
        .reverse()
        .find(
          (msg) =>
            msg.tableMerge?.kind === 'incoming' && !msg.tableMerge.busy && !msg.tableMerge.error,
        ) ?? null
    );
  }, [messages]);

  // Pedido ativo da sessão pra eyebrow de status (prompt 100 §1). O
  // refresh é disparado pelos eventos `order:created`/`order:status` do
  // socket da page (abaixo) + poll de fallback dentro do hook.
  const { active: activeOrder, refresh: refreshActiveOrder } = useActiveOrderStatus(
    slug,
    session.sessionId,
  );

  useEffect(() => {
    if (!slug || !session.sessionId) return;
    recordCustomerEvent(slug, 'assistant_opened', {
      source: threadIdParam ? 'thread' : prefill ? 'prefill' : 'landing',
    });
  }, [slug, session.sessionId, threadIdParam, prefill]);

  useEffect(() => {
    const self = session.participants.find((p) => p.customerId === session.customerId);
    if (typeof self?.isHost === 'boolean') {
      setIsCurrentHost(self.isHost);
    }
  }, [session.participants, session.customerId]);

  useEffect(() => {
    if (!mergeApprovedParam) return;
    setChatStarted(true);
    setMessages((prev) =>
      upsertTableMergeChatMessage(prev, tableMergeApprovedMessage(mergeRequestIdParam)),
    );
    window.history.replaceState(null, '', `/${slug}/assistente`);
  }, [mergeApprovedParam, mergeRequestIdParam, slug]);

  useEffect(() => {
    const refresh = () => setContinuationRefreshKey((key) => key + 1);
    window.addEventListener('customer:continuation-refresh', refresh);
    return () => window.removeEventListener('customer:continuation-refresh', refresh);
  }, []);

  useEffect(() => {
    if (!isExpandPrefill || !prefill) return;
    setInput(prefill);
  }, [isExpandPrefill, prefill]);

  // A tela ativa não hidrata chat antigo por padrão. O histórico completo
  // fica em `/chat-history`; aqui carregamos só o greeting de continuation
  // para a landing normal antes da primeira mensagem da nova conversa.
  useEffect(() => {
    if (!slug || prefill || threadIdParam || !session.sessionId || chatStarted) return;
    const load = async () => {
      try {
        const res = await apiPost<ContinuationPostResponse>(`/${slug}/continuation`, {
          tableSessionId: session.sessionId,
          customerId: session.customerId ?? undefined,
          hasDraftOrder: draftItems.length > 0,
          isReturning: session.isReturning ?? false,
          // Prompt 100 §2: só a superfície do assistente consome a
          // mensagem de evento (1x por evento) — a home não queima o hint.
          surface: 'assistente',
        });
        if (res?.text) {
          setLandingGreeting(res.text);
          clearDeliveredContinuationHint(res.kind);
          if (res.chips && res.chips.length > 0) {
            setSuggestions(res.chips as ChipCanon[]);
          }
        }
      } catch {
        /* ignore — fallback é greeting genérico no render */
      }
    };
    load();
  }, [
    slug,
    prefill,
    threadIdParam,
    chatStarted,
    session.sessionId,
    session.customerId,
    session.isReturning,
    session.customerName,
    draftItems.length,
    continuationRefreshKey,
  ]);

  // Continuação explícita pelo menu de conversas com IA. Esse é o único
  // caminho que reidrata Mongo no chat ativo; entrar direto no assistente
  // não procura thread antiga nem thread do dia.
  useEffect(() => {
    if (!slug || !threadIdParam) return;
    let cancelled = false;
    setActiveThreadId(null);
    (async () => {
      try {
        const msgs = await listMessages(slug, threadIdParam);
        if (cancelled) return;
        if (msgs.length > 0) {
          setMessages(mapHistoryToChat(msgs));
          setChatStarted(true);
          setActiveThreadId(threadIdParam);
        } else {
          setChatStarted(false);
          setActiveThreadId(null);
        }
      } catch {
        if (!cancelled) {
          setChatStarted(false);
          setActiveThreadId(null);
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, threadIdParam]);

  // Inline assistant history (Postgres `assistant_messages`) is separate
  // from archived Mongo `/chat-history` threads. It keeps STAFF bubbles
  // visible after a hard reload of the active `/assistente` page.
  //
  // SÓ staff: hidratar a conversa de IA inteira aqui fazia toda volta ao
  // assistente reabrir o último turno ("ver meu pedido" + VIEW_ORDER) no
  // lugar da landing com greeting contextual (bug dos vídeos 2026-06-10).
  // A conversa antiga continua acessível em "Conversas com IA"; a regra
  // canon segue a das linhas acima: /assistente sem threadId = conversa
  // nova + landing contextual.
  useEffect(() => {
    if (!slug || threadIdParam || prefill || !session.sessionId || !session.customerId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<AssistantInlineHistoryResponse>(`/${slug}/assistant/history`);
        if (cancelled) return;
        const staffOnly = (res.messages ?? []).filter((m) => m.role === 'staff');
        const hydrated = mapInlineHistoryToChat(staffOnly);
        const automaticMergeMessage = mergeApprovedParam
          ? [tableMergeApprovedMessage(mergeRequestIdParam)]
          : [];
        const nextMessages = [...hydrated, ...automaticMergeMessage];
        if (nextMessages.length === 0) return;
        setMessages((prev) => mergeUniqueChatMessages(prev, nextMessages));
        setChatStarted(true);
      } catch {
        /* ignore — realtime WS path still works, archived history remains separate */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    slug,
    threadIdParam,
    prefill,
    session.sessionId,
    session.customerId,
    mergeApprovedParam,
    mergeRequestIdParam,
  ]);

  useEffect(() => {
    if (!slug || !session.sessionId || !session.customerId) return;
    const currentSessionId = session.sessionId;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<TableParticipantsResponse>(`/${slug}/table/participants`);
        if (cancelled) return;
        const participants = res.participants ?? [];
        const self = participants.find((p) => p.customerId === session.customerId);
        setIsCurrentHost(!!self?.isHost);
        if (!self?.isHost) return;
        const pending = participants
          .filter((p) => p.status === 'pending' && !p.isHost)
          .map((p) =>
            joinRequestChatMessage(
              {
                targetCustomerId: p.customerId,
                joinerName: p.name,
                requestedAt: p.requestedAt ?? `snapshot-${p.customerId}`,
                tableSessionId: currentSessionId,
              },
              session.customerName,
            ),
          );
        if (pending.length === 0) return;
        setChatStarted(true);
        setMessages((prev) => mergeUniqueChatMessages(prev, pending));
      } catch {
        /* realtime socket still covers new requests while the page is open */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, session.sessionId, session.customerId, session.customerName]);

  useEffect(() => {
    if (!slug || !session.sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const courtesies = await listCustomerCourtesies(slug);
        if (cancelled) return;
        const pending = courtesies.filter((c) => c.status === 'pendente');
        if (pending.length === 0) return;
        setChatStarted(true);
        setMessages((prev) => mergeUniqueChatMessages(prev, pending.map(courtesyChatMessage)));
      } catch {
        /* ignore — WS arrival still works while the customer is online */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, session.sessionId]);

  useEffect(() => {
    // Nas primeiras mensagens o "smooth" faz o chat animar de baixo pra cima
    // no primeiro paint — em iPhone real isso sai lag-ado. Acima do threshold
    // o comportamento normal volta.
    messagesEndRef.current?.scrollIntoView({
      behavior: messages.length > 3 ? 'smooth' : 'auto',
    });
  }, [messages, loading]);

  /**
   * Round 18 (Onda 4 batch 2) — WS subscriber pra mensagens inbound do
   * staff (manager). Backend emite `assistant.staff_message_received` no
   * room `customer:<toCustomerId>` (decisão 2026-06-11: resposta do
   * gerente é privada do destinatário; antes era o session room e a mesa
   * toda via) quando um manager envia via MContactClientSheet
   * (POST /assistant/staff-to-customer). Payload shape vem direto de
   * `assistant.service.ts::sendStaffToCustomer`:
   *   { id, tableSessionId, message, fromStaffId, fromStaffName,
   *     toCustomerId, createdAt }
   *
   * O bubble é apendado on-the-fly. O reload agora reidrata via
   * `/assistant/history`, e o merge abaixo deduplica caso historico + socket
   * entreguem o mesmo staff bubble.
   *
   * Trigger de transição landing→chat: se o customer ainda está na
   * landing (`!chatStarted`) e o manager mandar mensagem, faz sentido
   * subir o customer pro chat mode pra ele ver o staff bubble (sem ele
   * o bubble fica escondido atrás do hero/PillButtons).
   */
  useTableSocket(
    session.sessionId,
    (event, data) => {
      if (event === 'order:created' || event === 'order:status') {
        // Eyebrow de status muda ao vivo quando o pedido avança (prompt 100
        // matriz: "Pedido avança (WS) com assistente aberto").
        refreshActiveOrder();
        return;
      }
      if (event === 'table_merge.created' && isTableMergeCreatedPayload(data)) {
        try {
          window.sessionStorage.setItem(
            `table-merge:${data.requestId}`,
            JSON.stringify({
              id: data.requestId,
              status: 'pending',
              originTableNumber: data.originTableNumber,
              targetTableNumber: data.targetTableNumber,
              originHostName: data.originHostName,
              targetHostName: data.targetHostName,
              originPartySize: data.originPartySize,
              targetPartySize: data.targetPartySize,
              approvedByAAt: null,
              approvedByBAt: null,
              expiresAt: data.expiresAt,
              createdAt: new Date().toISOString(),
            }),
          );
        } catch {
          /* sessionStorage is a convenience for the deep-link route */
        }
        if (data.targetSessionId !== session.sessionId) return;
        setChatStarted(true);
        setMessages((prev) => mergeUniqueChatMessages(prev, [tableMergeCreatedMessage(data)]));
        return;
      }
      if (event === 'table_merge.approved') {
        if (!isTableMergeApprovedPayload(data)) return;
        const payload = data;
        if (
          payload.originSessionId &&
          payload.targetSessionId &&
          session.sessionId !== payload.originSessionId &&
          session.sessionId !== payload.targetSessionId
        ) {
          return;
        }
        if (payload.side !== 'both') {
          setMessages((prev) =>
            upsertTableMergeChatMessage(prev, tableMergeWaitingMessage(payload.requestId, payload)),
          );
          return;
        }
        setChatStarted(true);
        setMessages((prev) =>
          upsertTableMergeChatMessage(prev, tableMergeApprovedMessage(payload.requestId, payload)),
        );
        return;
      }
      if (event === 'table_merge.rejected' && isTableMergeRejectedPayload(data)) {
        const payload = data;
        if (
          payload.originSessionId &&
          payload.targetSessionId &&
          session.sessionId !== payload.originSessionId &&
          session.sessionId !== payload.targetSessionId
        ) {
          return;
        }
        // Quem CANCELOU/recusou ativamente não recebe o card "Vocês seguem
        // separados" — ele acabou de tomar essa decisão (vídeos 2026-06-10:
        // cancelar mostrava "a outra mesa preferiu continuar"). Só limpa as
        // bubbles de waiting/incoming daquele request.
        const iDecided =
          (payload.rejectedBy === 'a' && session.sessionId === payload.originSessionId) ||
          (payload.rejectedBy === 'b' && session.sessionId === payload.targetSessionId);
        if (iDecided) {
          setMessages((prev) =>
            prev.filter(
              (msg) =>
                !(
                  msg.tableMerge &&
                  ['incoming', 'waiting'].includes(msg.tableMerge.kind) &&
                  (!payload.requestId || msg.tableMerge.requestId === payload.requestId)
                ),
            ),
          );
          return;
        }
        setChatStarted(true);
        setMessages((prev) =>
          upsertTableMergeChatMessage(prev, tableMergeRejectedMessage(payload.requestId, payload)),
        );
        return;
      }
      if (event === 'merge.cooldown_started' && isMergeCooldownStartedPayload(data)) {
        const payload = data;
        if (payload.originSessionId && session.sessionId !== payload.originSessionId) {
          return;
        }
        setChatStarted(true);
        setMessages((prev) =>
          upsertTableMergeChatMessage(prev, tableMergeCooldownMessage(payload)),
        );
        return;
      }
      if (event === 'courtesy.created' && isCustomerCourtesyDto(data)) {
        setChatStarted(true);
        setMessages((prev) => mergeUniqueChatMessages(prev, [courtesyChatMessage(data)]));
        return;
      }
      if (event === 'courtesy.updated' && isCustomerCourtesyDto(data)) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.courtesy?.id === data.id
              ? { ...msg, courtesy: data, courtesyBusy: null, courtesyError: null }
              : msg,
          ),
        );
        return;
      }
      if (event === 'participant:join_request' && isJoinRequestSocketPayload(data)) {
        if (!isCurrentHost) return;
        if (data.customerId === session.customerId) return;
        const currentSessionId = data.tableSessionId || session.sessionId;
        if (!currentSessionId) return;
        setChatStarted(true);
        setMessages((prev) =>
          mergeUniqueChatMessages(prev, [
            joinRequestChatMessage(
              {
                targetCustomerId: data.customerId,
                joinerName: data.name || 'Cliente',
                requestedAt: data.requestedAt || new Date().toISOString(),
                tableSessionId: currentSessionId,
              },
              session.customerName,
            ),
          ]),
        );
        return;
      }
      if (event === 'participant:decision' && isJoinDecisionSocketPayload(data)) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.joinRequest?.targetCustomerId === data.customerId
              ? {
                  ...msg,
                  joinRequest: {
                    ...msg.joinRequest,
                    decision: data.status,
                    busy: false,
                    error: null,
                  },
                }
              : msg,
          ),
        );
        return;
      }
      if (event !== 'assistant.staff_message_received') return;
      const payload = (data ?? {}) as {
        id?: string;
        message?: string;
        fromStaffId?: string;
        fromStaffName?: string | null;
        createdAt?: string;
      };
      if (!payload.id || !payload.message) return;
      const staff = staffDisplayName(payload.fromStaffName);
      setChatStarted(true);
      setMessages((prev) => {
        return mergeUniqueChatMessages(prev, [
          {
            id: `staff-${payload.id}`,
            role: 'staff' as const,
            content: payload.message ?? '',
            staffName: staff.firstName,
            staffInitial: staff.initial,
            staffRole: 'Gerente',
            staffCreatedAt: payload.createdAt,
          },
        ]);
      });
      // O 3º argumento entra no room `customer:<id>` — desde 2026-06-11 a
      // resposta do gerente chega SÓ pra esse room (privacidade por cliente).
    },
    session.customerId,
  );

  const [placingOrder, setPlacingOrder] = useState(false);
  // Guard against double-tap on the LGPD confirm chip — the action is
  // destructive (deletes all chat history) and idempotent, but we still
  // don't want to fire 2 protocols.
  const lgpdBusyRef = useRef(false);
  // Salon-map overlay bridge for `request_table_merge` without `targetTable`.
  // The hook owns the open/close state + pending-promise plumbing; the chat
  // handler awaits `handleToolCall(call)` and the customer's table tap
  // resolves with the enriched envelope.
  const tableMerge = useTableMerge();
  const [salonTables, setSalonTables] = useState<SalonTable[]>([]);
  const [salonLoading, setSalonLoading] = useState(false);
  const [salonError, setSalonError] = useState<string | null>(null);

  useEffect(() => {
    if (!tableMerge.overlayOpen) return;
    let cancelled = false;
    setSalonLoading(true);
    setSalonError(null);
    apiGet<SalonTablesResponse>(`/${slug}/salon/tables/adjacent?radius=2`)
      .then((res) => {
        if (cancelled) return;
        setSalonTables(res.tables ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[chat] failed to load salon map:', err);
        setSalonTables([]);
        setSalonError('Nao consegui carregar o mapa do salao agora.');
      })
      .finally(() => {
        if (!cancelled) setSalonLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, tableMerge.overlayOpen]);

  const appendToolFeedback = (content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `tool-feedback-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'ai',
        content,
      },
    ]);
  };

  /**
   * Round 5 P0 (A2) — confirmação destrutiva OUT-OF-BAND.
   *
   * O chip "Sim, apagar" carrega payload OBJETO `{ tool, args: { confirm } }`.
   * Ele NÃO pode virar texto pro LLM (`sendMessage(label)`): o modelo não
   * consegue re-emitir `confirm=true` legitimamente (fora do schema), então
   * o gate re-bate → loop infinito e o humano NUNCA deleta. Aqui o toque do
   * humano dispara a deleção DIRETO no endpoint canônico
   * (`DELETE /:slug/chat-history[...]`, SessionGuard + cookie recognition_token)
   * — a MESMA rota que a tool bateria, mas por um caminho confiável e fora do
   * token-stream do modelo. Retorna true quando tratou o chip.
   */
  const handleDestructiveConfirmChip = async (payload: unknown): Promise<boolean> => {
    const confirm = asDestructiveConfirmPayload(payload);
    if (!confirm) return false;

    if (!session.customerId) {
      appendToolFeedback('Pra apagar suas conversas, preciso te identificar primeiro.');
      setSuggestions(DEFAULT_SUGGESTIONS);
      return true;
    }

    try {
      if (confirm.tool === 'delete_all_chats') {
        const res = await deleteAllThreads(slug);
        const count = res?.deletedCount ?? 0;
        appendToolFeedback(
          count > 0
            ? `Apaguei suas ${count} conversa(s). Não tem volta — nem pra você nem pra mim.`
            : 'Apaguei todo o histórico de conversas.',
        );
      } else {
        const threadId =
          typeof confirm.args.threadId === 'string'
            ? confirm.args.threadId
            : typeof confirm.args.thread_id === 'string'
              ? confirm.args.thread_id
              : '';
        if (!threadId) {
          appendToolFeedback('Não consegui identificar qual conversa apagar.');
          setSuggestions(DEFAULT_SUGGESTIONS);
          return true;
        }
        await deleteThread(slug, threadId);
        appendToolFeedback('Conversa apagada. Não tem volta.');
      }
    } catch {
      appendToolFeedback('Não consegui apagar agora. Tente de novo em instantes.');
    }
    // Consome os chips binários de confirmação (o gate já foi resolvido).
    setSuggestions(DEFAULT_SUGGESTIONS);
    return true;
  };

  const showCourtesiesFromTool = async () => {
    try {
      const courtesies = await listCustomerCourtesies(slug);
      if (courtesies.length === 0) {
        appendToolFeedback('Não há cortesia pendente para esta mesa agora.');
        return;
      }
      setChatStarted(true);
      setMessages((prev) =>
        mergeUniqueChatMessages(prev, courtesies.slice(0, 3).map(courtesyChatMessage)),
      );
    } catch {
      appendToolFeedback('Não consegui carregar suas cortesias agora.');
    }
  };

  const patchTableMergeMessage = (messageId: string, patch: Partial<TableMergeChatState>) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId && msg.tableMerge
          ? { ...msg, tableMerge: { ...msg.tableMerge, ...patch } }
          : msg,
      ),
    );
  };

  const decideTableMergeFromChat = async (messageId: string, decision: 'approve' | 'reject') => {
    const msg = messages.find((m) => m.id === messageId);
    const merge = msg?.tableMerge;
    if (!merge?.requestId || merge.busy) return;
    patchTableMergeMessage(messageId, {
      busy: decision === 'approve' ? 'approving' : 'rejecting',
      error: null,
    });
    try {
      if (decision === 'approve') {
        const updated = await approveTableMerge(merge.requestId, { slug });
        patchTableMergeMessage(messageId, {
          busy: null,
          kind: updated.status === 'approved' ? 'approved' : 'waiting',
          originTableNumber: updated.originTableNumber,
          targetTableNumber: updated.targetTableNumber,
          originHostName: updated.originHostName,
          targetHostName: updated.targetHostName,
          originPartySize: updated.originPartySize,
          targetPartySize: updated.targetPartySize,
          expiresAt: updated.expiresAt,
        });
        return;
      }
      const updated = await rejectTableMerge(merge.requestId, {
        slug,
        reason: 'Recusado pelo chat do cliente.',
      });
      patchTableMergeMessage(messageId, {
        busy: null,
        kind: 'rejected',
        originTableNumber: updated.originTableNumber,
        targetTableNumber: updated.targetTableNumber,
        originHostName: updated.originHostName,
        targetHostName: updated.targetHostName,
        originPartySize: updated.originPartySize,
        targetPartySize: updated.targetPartySize,
        cooldownEndsAt: updated.cooldownEndsAt ?? merge.cooldownEndsAt ?? null,
      });
    } catch (err) {
      patchTableMergeMessage(messageId, {
        busy: null,
        error: err instanceof Error ? err.message : 'Não consegui responder agora.',
      });
    }
  };

  const handleCourtesyRespond = async (
    messageId: string,
    courtesyId: string,
    status: CourtesyDecision,
  ) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, courtesyBusy: status, courtesyError: null } : msg,
      ),
    );
    try {
      const updated = await respondCustomerCourtesy(slug, courtesyId, status);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, courtesy: updated, courtesyBusy: null, courtesyError: null }
            : msg,
        ),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Não consegui responder essa cortesia agora.';
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, courtesyBusy: null, courtesyError: message } : msg,
        ),
      );
    }
  };

  const pendingOrderTotalCents = useMemo(
    () =>
      pendingOrderAdd?.items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0) ?? 0,
    [pendingOrderAdd],
  );

  const queueOrderAdd = (
    itemsToAdd: PendingOrderItem[],
    options?: { sourceMessageId?: string; openReviewAfterAdd?: boolean },
  ) => {
    if (itemsToAdd.length === 0 || pendingOrderAdd) return;
    const rememberedMode = session.commandMode;
    if (rememberedMode) {
      itemsToAdd.forEach((item) => {
        addItem({
          menuItemId: item.id,
          name: item.name,
          priceCents: item.priceCents,
          quantity: item.quantity,
          note: item.note,
          commandMode: rememberedMode,
        });
      });
      if (options?.sourceMessageId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === options.sourceMessageId ? { ...m, orderPlaced: true } : m)),
        );
      }
      const label = itemsToAdd.length === 1 ? itemsToAdd[0].name : `${itemsToAdd.length} itens`;
      appendToolFeedback(
        `${label} ${itemsToAdd.length === 1 ? 'foi adicionado' : 'foram adicionados'} à ${
          rememberedMode === 'individual' ? 'sua comanda' : 'comanda da mesa'
        }.`,
      );
      setPlacingOrder(false);
      if (options?.openReviewAfterAdd) {
        push(`/${slug}/pedido/revisar`);
      }
      return;
    }
    setPendingOrderAdd({
      items: itemsToAdd,
      sourceMessageId: options?.sourceMessageId,
      openReviewAfterAdd: options?.openReviewAfterAdd,
    });
  };

  const closePendingOrderAdd = () => {
    setPendingOrderAdd(null);
    setPlacingOrder(false);
  };

  const confirmPendingOrderAdd = (mode: CommandModeChoice) => {
    if (!pendingOrderAdd) return;
    pendingOrderAdd.items.forEach((item) => {
      addItem({
        menuItemId: item.id,
        name: item.name,
        priceCents: item.priceCents,
        quantity: item.quantity,
        note: item.note,
        commandMode: mode,
      });
    });
    if (pendingOrderAdd.sourceMessageId) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingOrderAdd.sourceMessageId ? { ...m, orderPlaced: true } : m,
        ),
      );
    }
    const label =
      pendingOrderAdd.items.length === 1
        ? pendingOrderAdd.items[0].name
        : `${pendingOrderAdd.items.length} itens`;
    appendToolFeedback(
      `${label} ${pendingOrderAdd.items.length === 1 ? 'foi adicionado' : 'foram adicionados'} à ${
        mode === 'individual' ? 'sua comanda' : 'comanda da mesa'
      }.`,
    );
    const shouldOpenReview = pendingOrderAdd.openReviewAfterAdd;
    setPendingOrderAdd(null);
    setPlacingOrder(false);
    if (shouldOpenReview) {
      push(`/${slug}/pedido/revisar`);
    }
  };

  const resolveToolMenuItem = async (
    call: AssistantToolCall,
  ): Promise<{ id: string; name: string; priceCents: number } | null> => {
    const payload = actionPayload(call);
    const args = call.arguments ?? {};
    const itemId =
      stringValue(payload.itemId) ??
      stringValue(args.itemId) ??
      stringValue(args.item_id) ??
      stringValue(args.menuItemId);
    if (!itemId) return null;

    const payloadName = stringValue(payload.name) ?? stringValue(payload.itemName);
    const payloadPrice = numberValue(payload.priceCents) ?? numberValue(payload.price_cents);
    if (payloadName && payloadPrice !== null) {
      return { id: itemId, name: payloadName, priceCents: payloadPrice };
    }

    try {
      const item = await apiGet<MenuItemToolPayload>(`/${slug}/menu/items/${itemId}`);
      const name = item.name;
      const priceCents = numberValue(item.priceCents) ?? numberValue(item.price_cents);
      if (name && priceCents !== null) {
        return { id: item.id, name, priceCents };
      }
    } catch (err) {
      console.warn('[chat] failed to resolve menu item for tool:', itemId, err);
    }
    return null;
  };

  /**
   * Handlers REAIS dos botões do card de junção (rejected/cooldown) — os
   * vídeos de 2026-06-10 mostraram os três quebrados: "Chamar
   * recepcionista" abria o sheet do GARÇOM, "Tentar outra mesa" virava
   * frase pra IA (que ecoava o status expired do merge antigo) e
   * "Continuar aqui" só trocava chips.
   */
  const callHostToTable = async () => {
    try {
      await requestHostAssist(slug, 'Ajuda com junção de mesas');
      appendToolFeedback('Recepção avisada — alguém vem até a mesa pra ajudar com a junção.');
    } catch (error) {
      appendToolFeedback(
        error instanceof ApiRequestError && error.message
          ? error.message
          : 'Não consegui avisar a recepção agora. Tente de novo em instantes.',
      );
    }
  };

  const tryAnotherTableMerge = async () => {
    // Mesmo caminho do tool call do LLM sem target: abre o OverlaySalonMap
    // e, na escolha, cria o request real — nada de mandar frase pra IA.
    const enriched = await tableMerge.handleToolCall({
      name: 'request_table_merge',
      arguments: {},
    });
    if (!enriched) return;
    const resolved = enriched instanceof Promise ? await enriched : enriched;
    if (!resolved.arguments?.targetTable) return; // fechou o mapa sem escolher
    await createTableMergeFromToolCall({
      name: 'request_table_merge',
      arguments: resolved.arguments as AssistantToolCall['arguments'],
    });
  };

  // A tentativa disparada pela URL deve reagir apenas à entrada/reidratação,
  // não à identidade deste handler (que muda junto com o estado do chat).
  // O ref mantém a implementação mais recente sem transformar o efeito em um
  // loop de novas tentativas a cada render.
  const tryAnotherTableMergeRef = useRef(tryAnotherTableMerge);
  tryAnotherTableMergeRef.current = tryAnotherTableMerge;

  const dismissMergeOutcome = () => {
    setMessages((prev) => {
      const next = prev.filter(
        (msg) => !(msg.tableMerge && ['rejected', 'cooldown'].includes(msg.tableMerge.kind)),
      );
      if (next.length === 0) {
        // Sem mais nada na conversa → volta pra landing contextual com
        // greeting fresco da continuation.
        setChatStarted(false);
        setContinuationRefreshKey((key) => key + 1);
      }
      return next;
    });
    setSuggestions(DEFAULT_SUGGESTIONS);
  };

  // Dispara uma vez por entrada com ?mergeRetry=1.
  useEffect(() => {
    if (!mergeRetryParam || !session.sessionId) return;
    window.history.replaceState(null, '', `/${slug}/assistente`);
    void tryAnotherTableMergeRef.current();
  }, [mergeRetryParam, session.sessionId, slug]);

  const createTableMergeFromToolCall = async (call: AssistantToolCall): Promise<void> => {
    const args = call.arguments ?? {};
    const payload = actionPayload(call);
    const targetTableSessionId =
      stringValue(args.targetTableSessionId) ??
      stringValue(args.target_session_id) ??
      stringValue(payload.targetTableSessionId) ??
      stringValue(payload.target_session_id);
    const targetTableNumber =
      numberValue(args.targetTableNumber) ??
      numberValue(args.targetTable) ??
      numberValue(args.target_table) ??
      numberValue(payload.targetTableNumber) ??
      numberValue(payload.targetTable);
    const targetTableLabel =
      stringValue(args.targetTableLabel) ??
      stringValue(args.targetTable) ??
      stringValue(args.target_table) ??
      stringValue(payload.targetTableLabel) ??
      stringValue(payload.targetTable);

    if (!targetTableSessionId && targetTableNumber === null && !targetTableLabel) {
      appendToolFeedback('Escolha uma mesa ocupada no mapa para pedir a junção.');
      return;
    }

    const result = await createTableMergeRequest({
      slug,
      targetTableSessionId: targetTableSessionId ?? undefined,
      targetTableNumber: targetTableNumber ?? undefined,
      targetTableLabel: targetTableLabel ?? undefined,
      message: 'Pedido feito pelo assistente do cliente.',
    });

    if (result.ok) {
      const target =
        result.request.targetTableNumber || targetTableNumber || targetTableLabel || 'escolhida';
      appendToolFeedback(
        `Pedido enviado para juntar com a mesa ${target}. Agora os hosts das duas mesas precisam confirmar.`,
      );
      const params = new URLSearchParams({
        mode: 'merge-origin',
        requestId: result.request.id,
        expiresAt: result.request.expiresAt,
        hostName: result.request.targetHostName ?? `Mesa ${target}`,
        redirect: `/${slug}/assistente?mergeApproved=1&mergeRequestId=${result.request.id}`,
      });
      router.push(`/${slug}/waiting-approval?${params.toString()}`);
      return;
    }

    if (result.error === 'cooldown') {
      setChatStarted(true);
      setMessages((prev) =>
        mergeUniqueChatMessages(prev, [tableMergeCooldownMessage(result.cooldown)]),
      );
      // O card de cooldown já traz os 3 CTAs REAIS (recepção/mapa/dismiss);
      // os chips 'send' antigos duplicavam os botões mandando frases pra IA
      // — era exatamente o caminho quebrado dos vídeos 2026-06-10.
      setSuggestions(DEFAULT_SUGGESTIONS);
      return;
    }

    appendToolFeedback(result.message || 'Não consegui criar o pedido de junção agora.');
  };

  const markJoinRequest = (targetCustomerId: string, patch: Partial<JoinRequestChatState>) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.joinRequest?.targetCustomerId === targetCustomerId
          ? { ...msg, joinRequest: { ...msg.joinRequest, ...patch } }
          : msg,
      ),
    );
  };

  const decideJoinRequestFromTool = async (call: AssistantToolCall): Promise<void> => {
    const payload = actionPayload(call);
    if (payload.action !== 'decide_join_request') return;

    const args = call.arguments ?? {};
    const targetCustomerId =
      stringValue(payload.targetCustomerId) ?? stringValue(args.targetCustomerId);
    const decisionRaw = stringValue(payload.decision) ?? stringValue(args.decision);
    const decision = decisionRaw === 'approve' || decisionRaw === 'reject' ? decisionRaw : null;
    if (!targetCustomerId || !decision) {
      appendToolFeedback('Não encontrei o pedido de entrada pendente para decidir.');
      return;
    }

    markJoinRequest(targetCustomerId, { busy: true, error: null });
    try {
      await apiPost(`/${slug}/table/participants/decide`, {
        targetCustomerId,
        decision,
      });
      markJoinRequest(targetCustomerId, {
        decision: decision === 'approve' ? 'approved' : 'rejected',
        busy: false,
        error: null,
      });
    } catch {
      markJoinRequest(targetCustomerId, {
        busy: false,
        error: 'Não consegui decidir agora. Tente pelo aviso da mesa.',
      });
    }
  };

  const draftSummaryText = () => {
    if (draftItems.length === 0) {
      return 'Seu pedido tá vazio. Quer dar uma olhada no cardápio?';
    }
    const lines = draftItems.map((it) => {
      const lineTotal = it.priceCents * it.quantity;
      return `- ${it.quantity}x ${it.name} — ${formatCurrency(lineTotal)}`;
    });
    return `Seu pedido até agora:\n${lines.join('\n')}\nTotal: ${formatCurrency(totalCents)}`;
  };

  const findDraftLine = (itemOrDraftId: string | null) => {
    if (itemOrDraftId) {
      const exact = draftItems.find(
        (it) => it.draftId === itemOrDraftId || it.menuItemId === itemOrDraftId,
      );
      if (exact) return exact;
    }
    return draftItems.length === 1 ? draftItems[0] : null;
  };

  /**
   * Dispatch a tool call coming back from the AI service. Most canonical
   * tools resolve server-side and just produce text in `res.response`; this
   * function handles the subset that needs FE-side reaction (overlay, route
   * navigation, destructive confirms). Per F2 round naming.
   *
   * Tools handled fully:
   *  - `request_table_merge` (no targetTable) → opens OverlaySalonMap, awaits
   *    pick, then creates the merge request with the current session
   *  - `lgpd_data_request`, `show_lgpd_notice` → handled inline above via
   *    `toolHint`/chips (canonical text comes from `lgpd_messages.py`)
   *
   * Server-resolved tools already return their honest result in
   * `res.response`; the client must not append a second generic bubble.
   */
  const dispatchToolCall = async (call: AssistantToolCall): Promise<void> => {
    const name = call.name;
    // Round C (chat UX polish) — para tools text-only (ask_about_restaurant,
    // search_dish, etc.), a aiMsg principal já carregou o texto da resposta.
    // Não precisamos do stub bubble "OK" nem de side-effect; early-return
    // mantém o transcript limpo (só o bubble texto + eyebrow `··· USANDO X ···`
    // que vem do `eyebrowTool` em sendMessage, sem stub duplicado).
    if (isServerResolvedAssistantTool(name)) return;
    // Round D (chat UX polish) — para tools silent-path (overlay/route sem
    // bubble texto como resposta principal), esperamos 1.5s ANTES de disparar
    // o efeito. O `setMessages` em `sendMessage` já enfileirou o aiMsg com
    // `toolCall`, então o `ToolCallIndicator` (eyebrow `··· USANDO X ···`)
    // renderiza nesta janela e o usuário vê "Assistente está usando view_menu..."
    // antes do overlay subir — previne sensação de "engasgo" (efeito instantâneo
    // dava impressão de IA sem trabalho intermediário).
    if (SILENT_PATH_TOOLS.has(name)) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    // 1) Tools the FE owns end-to-end.
    if (name === 'view_courtesy') {
      await showCourtesiesFromTool();
      return;
    }

    if (name === 'accept_join_request' || name === 'reject_join_request') {
      await decideJoinRequestFromTool(call);
      return;
    }

    if (name === 'request_table_merge') {
      const enriched = await tableMerge.handleToolCall({
        name: call.name,
        arguments: call.arguments,
      });
      // null → not handled (shouldn't happen given the if above)
      // sync envelope -> already had a target; Promise -> resolved by the
      // overlay after the customer confirms a table.
      if (!enriched) return;
      const final = await Promise.resolve(enriched);
      if (
        final.arguments?.targetTable ||
        final.arguments?.targetTableNumber ||
        final.arguments?.targetTableLabel ||
        final.arguments?.targetTableSessionId
      ) {
        await createTableMergeFromToolCall({
          name: 'request_table_merge',
          arguments: final.arguments,
        });
      }
      return;
    }

    // call_waiter → abre CallWaiterSheet (V20 canon F07_CallWaiter). Antes
    // estava caindo no fallback "no FE dispatch" e o LLM só respondia texto
    // ("Chamando um garçom..."), sem a sheet com motivos canon.
    if (name === 'call_waiter') {
      openCallWaiterSheet();
      return;
    }

    // view_menu → abre MenuOverlay (sheet bottom-up sobre o chat). Antes
    // navegava pra rota /cardapio inteira (perde contexto do chat). Canvas
    // V20 §F05 quer overlay sheet — chat fica preservado por baixo, blur
    // leve, sheet ~88dvh com drag-to-dismiss.
    //
    // Round 21 §G: LLM agora pode passar `category` (bebida/sobremesa/
    // entrada/principal) — repassamos como query param ?tab= pro iframe
    // do cardápio, que já entende "bebidas" como filtro de tab.
    if (name === 'view_menu') {
      const category =
        typeof call.arguments?.category === 'string' ? call.arguments.category : null;
      openMenuOverlay(category);
      return;
    }

    // Pagamento é navegação primária. Se o LLM também tiver emitido
    // call_waiter no mesmo turno, o batch dispatcher abaixo remove o chamado.
    if (name === 'open_payment_screen') {
      if (draftItems.length > 0) {
        appendToolFeedback('Antes de pagar, confirme seu pedido para abrir a conta.');
        push(`/${slug}/pedido/revisar`);
        return;
      }
      push(`/${slug}/pagamento`);
      return;
    }

    if (name === 'pay_full') {
      if (draftItems.length > 0) {
        appendToolFeedback('Antes de pagar, confirme seu pedido para abrir a conta.');
        push(`/${slug}/pedido/revisar`);
        return;
      }
      push(`/${slug}/pagamento?mode=table`);
      return;
    }

    if (name === 'pay_individual') {
      if (draftItems.length > 0) {
        appendToolFeedback('Antes de pagar, confirme seu pedido para abrir a conta.');
        push(`/${slug}/pedido/revisar`);
        return;
      }
      push(`/${slug}/pagamento?mode=individual`);
      return;
    }

    if (name === 'split_bill') {
      if (draftItems.length > 0) {
        appendToolFeedback('Antes de dividir a conta, confirme seu pedido.');
        push(`/${slug}/pedido/revisar`);
        return;
      }
      push(`/${slug}/pagamento/dividir`);
      return;
    }

    if (name === 'add_to_order') {
      // Framework bugfix: se o pré-resolvedor de `sendMessage` já detectou que
      // esse item não resolve, o bubble principal JÁ virou a mensagem de falha
      // coerente. Não reemita — senão voltamos ao 2-bubbles contraditórios.
      if (suppressedAddFailuresRef.current.has(call)) {
        suppressedAddFailuresRef.current.delete(call);
        return;
      }
      const item = await resolveToolMenuItem(call);
      if (!item) {
        appendToolFeedback(ADD_TO_ORDER_FAILURE_MESSAGE);
        return;
      }
      const payload = actionPayload(call);
      const args = call.arguments ?? {};
      const quantity = positiveInt(payload.quantity ?? args.quantity ?? args.qty, 1);
      const note =
        stringValue(payload.notes) ??
        stringValue(payload.note) ??
        stringValue(args.notes) ??
        stringValue(args.note) ??
        undefined;
      queueOrderAdd([
        {
          id: item.id,
          name: item.name,
          priceCents: item.priceCents,
          quantity,
          note,
        },
      ]);
      return;
    }

    if (name === 'view_order') {
      if (draftItems.length > 0) {
        appendToolFeedback(draftSummaryText());
        push(`/${slug}/pedido/revisar`);
        return;
      }
      push(`/${slug}/pedido`);
      return;
    }

    if (name === 'remove_from_cart') {
      const payload = actionPayload(call);
      const args = call.arguments ?? {};
      const itemId =
        stringValue(payload.removedItemId) ??
        stringValue(payload.itemId) ??
        stringValue(args.itemId) ??
        stringValue(args.item_id);
      const line = findDraftLine(itemId);
      if (!line) {
        appendToolFeedback('Não encontrei esse item no pedido atual.');
        return;
      }
      removeItem(line.draftId);
      return;
    }

    if (name === 'change_order') {
      const payload = actionPayload(call);
      const args = call.arguments ?? {};
      const changes = isRecord(payload.changes)
        ? payload.changes
        : isRecord(args.changes)
          ? args.changes
          : {};
      const itemId =
        stringValue(payload.itemId) ?? stringValue(args.itemId) ?? stringValue(args.item_id);
      const line = findDraftLine(itemId);
      if (!line) {
        appendToolFeedback('Não encontrei esse item no pedido atual.');
        return;
      }

      const nextQuantity = numberValue(
        changes.quantity ?? changes.qty ?? payload.quantity ?? args.quantity ?? args.qty,
      );
      const nextNote =
        stringValue(changes.notes) ??
        stringValue(changes.note) ??
        stringValue(payload.notes) ??
        stringValue(payload.note) ??
        stringValue(args.notes) ??
        stringValue(args.note);
      const patch: { quantity?: number; note?: string } = {};
      if (nextQuantity !== null) {
        patch.quantity = Math.max(1, Math.min(20, Math.floor(nextQuantity)));
      }
      if (nextNote !== null) {
        patch.note = nextNote;
      }
      if (Object.keys(patch).length > 0) {
        updateItem(line.draftId, patch);
      }
      return;
    }

    if (name === 'cancel_order') {
      // P1-I fix: antes o handler SÓ limpava o rascunho local e ignorava um
      // pedido REAL já enviado à cozinha — a IA respondia "cancelei" mas o
      // pedido seguia vivo no KDS. Agora:
      //  1) se há pedido real e ele ainda é cancelável pelo cliente
      //     (`pending_confirmation`/`open` — a janela de confirmação; a
      //     máquina de estado do backend REJEITA cancelamento de cliente após
      //     o envio à cozinha, ver order-state-machine.ts
      //     CUSTOMER_CANCELLABLE_STATUSES), chamamos o endpoint real e só
      //     confirmamos "cancelei" APÓS o backend confirmar `cancelled`;
      //  2) se há pedido real já na cozinha (received/in_progress/ready/…),
      //     respondemos com honestidade — não dá pra cancelar sozinho aqui;
      //  3) senão, cai no cancelamento de rascunho de sempre.
      const realOrder = activeOrder;
      const CUSTOMER_CANCELLABLE = new Set(['pending_confirmation', 'open']);
      if (realOrder && CUSTOMER_CANCELLABLE.has(realOrder.status)) {
        try {
          const res = await apiPatch<{ orderId: string; status: string }>(
            `/${slug}/orders/${realOrder.orderId}/cancel`,
            {},
          );
          if (res.status === 'cancelled') {
            clearDraftOrder();
            refreshActiveOrder();
            appendToolFeedback('Pronto, cancelei seu pedido.');
          } else {
            // Corrida: alguém já promoveu pra cozinha entre o poll e o PATCH.
            refreshActiveOrder();
            appendToolFeedback(
              'Seu pedido já entrou em preparo e não dá pra cancelar por aqui. Posso chamar um garçom pra te ajudar.',
            );
          }
        } catch {
          refreshActiveOrder();
          appendToolFeedback(
            'Não consegui cancelar agora. Se o pedido já foi pra cozinha, chame um garçom que eu aviso.',
          );
        }
        return;
      }
      if (realOrder) {
        // Pedido real, mas já fora da janela de cancelamento do cliente.
        appendToolFeedback(
          'Seu pedido já entrou em preparo e não dá pra cancelar por aqui. Posso chamar um garçom pra te ajudar.',
        );
        return;
      }
      // Só rascunho (ou nada) — comportamento de sempre.
      if (draftItems.length === 0) {
        appendToolFeedback('Não há pedido ativo pra cancelar agora.');
        return;
      }
      clearDraftOrder();
      appendToolFeedback('Beleza, limpei o pedido que você estava montando.');
      return;
    }

    if (name === 'confirm_order') {
      if (draftItems.length === 0) {
        appendToolFeedback('Seu pedido tá vazio. Quer escolher algo no cardápio?');
        return;
      }
      push(`/${slug}/pedido/revisar`);
      return;
    }

    // Tools handled by other flows (LGPD via toolHint above; the rest
    //    of the canonical set is text-only and arrives as `res.response`).
    //    Log unknown names for visibility without inventing a success bubble.
    console.debug('[chat] tool resolved server-side, no FE dispatch:', name);
  };

  /**
   * Core order placement vindo da IA: antes de adicionar qualquer item,
   * abre a mesma escolha de comanda do cardápio. Só depois do cliente
   * escolher individual/mesa os itens entram no draft.
   */
  const placeOrderForItems = async (picked: LinkedItem[], sourceMessageId: string) => {
    if (placingOrder || pendingOrderAdd || picked.length === 0) return;
    setPlacingOrder(true);
    queueOrderAdd(
      picked.map((it) => ({
        id: it.id,
        name: it.name,
        priceCents: it.priceCents,
        quantity: 1,
      })),
      { sourceMessageId, openReviewAfterAdd: true },
    );
  };

  const sendMessage = async (
    text: string,
    options?: { skipUserBubble?: boolean; flowIntent?: 'join' | 'merge' },
  ) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setExpandedInputPlaceholder(null);

    // Round 4 §C-NEW-8: 1ª mensagem do customer triggera transição
    // landing→chat. O greeting que estava na landing vira o 1º AI bubble,
    // PRECEDENDO o user bubble — assim o usuário tem contexto visual de
    // "o assistant disse X, eu respondi Y".
    if (!chatStarted) {
      setChatStarted(true);
      if (landingGreeting && !options?.skipUserBubble) {
        setMessages([
          {
            id: `greeting-${Date.now()}`,
            role: 'ai',
            content: landingGreeting,
          },
        ]);
      }
    }

    if (!options?.skipUserBubble) {
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
      };
      setMessages((prev) => [...prev, userMsg]);
    }
    setInput('');

    if (wantsLastVisitItems(trimmed)) {
      setLoading(true);
      try {
        const repeat = await apiGet<LastVisitRepeatResponse>(`/${slug}/customer/last-visit`);
        const selected = filterLastVisitItems(trimmed, repeat.items);
        if (selected.length === 0) {
          const substitute = repeat.unavailableItems.find((item) => item.substitute);
          setMessages((prev) => [
            ...prev,
            {
              id: `ai-${Date.now()}`,
              role: 'ai',
              content: substitute
                ? `${substitute.name} não está mais no cardápio. Posso sugerir ${substitute.substitute?.name} no lugar.`
                : 'Não encontrei itens disponíveis da sua última visita para repetir agora.',
            },
          ]);
          setLoading(false);
          return;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'ai',
            content:
              selected.length === 1
                ? `Achei ${selected[0].name} da sua última visita. Vou colocar na revisão.`
                : `Achei ${selected.length} itens da sua última visita. Vou colocar na revisão.`,
          },
        ]);
        queueOrderAdd(
          selected.map((item) => ({
            id: item.menuItemId,
            name: item.name,
            priceCents: item.priceCents,
            quantity: item.quantity,
            note: item.note ?? undefined,
          })),
          { openReviewAfterAdd: true },
        );
        setLoading(false);
        return;
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'ai',
            content: 'Não consegui recuperar sua última visita agora.',
          },
        ]);
        setLoading(false);
        return;
      }
    }

    // Se a IA acabou de sugerir pratos e o usuario respondeu com intencao de
    // pedido ("quero os dois", "pode mandar"), pulamos o round-trip pela IA
    // e ja iniciamos o pedido direto — os 15s do /confirmando funcionam como
    // janela de cancelamento.
    const lastAiWithItems = [...messages]
      .reverse()
      .find(
        (m) => m.role === 'ai' && !!m.linkedItems && m.linkedItems.length > 0 && !m.orderPlaced,
      );
    if (lastAiWithItems?.linkedItems) {
      const picked = detectOrderIntent(trimmed, lastAiWithItems.linkedItems);
      if (picked && picked.length > 0) {
        const names = picked
          .map((p, i, arr) =>
            i === 0 ? p.name : i === arr.length - 1 ? ` e ${p.name}` : `, ${p.name}`,
          )
          .join('');
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'ai',
            content: `Perfeito. Escolha em qual comanda eu coloco ${names}.`,
          },
        ]);
        await placeOrderForItems(picked, lastAiWithItems.id);
        return;
      }
    }

    // P1-J fix (cross-flow join/merge): o card de ENTRADA (join) dispara
    // `sendMessage('Agora não')` / `sendMessage('Pode entrar')` como texto
    // livre. Quando havia TAMBÉM um convite de MERGE incoming ativo, este
    // atalho parseava "agora nao" como REJECT do merge (MERGE_REJECT_DIRECT_RE
    // casa "agora nao") e rejeitava a JUNÇÃO por engano — sem tocar no join.
    // O fix b16966d foi intra-fluxo (fullmatch da frase), mas não resolvia a
    // colisão ENTRE fluxos quando os dois convites coexistem. Agora o dismiss
    // sabe QUAL fluxo está ativo: se o botão veio do card de join
    // (`flowIntent === 'join'`), NÃO tocamos no merge — o texto segue pro
    // servidor com `pendingJoinRequest` e só a entrada é decidida. Só rodamos
    // o atalho client-side de merge quando o intent não é join (texto digitado
    // à mão ou botão do próprio card de merge).
    if (
      options?.flowIntent !== 'join' &&
      activeTableMergeMessage?.tableMerge?.kind === 'incoming'
    ) {
      const decision = tableMergeDecisionFromText(trimmed);
      if (decision) {
        await decideTableMergeFromChat(activeTableMergeMessage.id, decision);
        return;
      }
    }

    setLoading(true);

    try {
      const res = await apiPost<SendResponse>(`/${slug}/assistant/message`, {
        message: trimmed,
        customerId: session.customerId || undefined,
        itemId: itemId || undefined,
        conversationId: activeThreadId ? undefined : (conversationIdRef.current ?? undefined),
        continueThreadId: activeThreadId ?? undefined,
        pendingJoinRequest: activeJoinRequest ?? undefined,
      });

      // V20 canon F04_Chat: ToolCallIndicator + bubble texto + chips
      // ficam INLINE no lado do assistente, junto com a mensagem que os
      // originou. Atachamos a primeira tool dispatchada (se houver) no
      // aiMsg pra que o render mostre o indicador ANTES do bubble texto,
      // dentro do mesmo `<div>` esquerdo. Antes ficava num bloco global
      // no rodapé (`lastToolName`) que quebrava o layout.
      // Pagamento é navegação primária. Se o LLM também tiver emitido
      // call_waiter no mesmo turno, removemos o chamado (open_payment_screen
      // vai pra frente). Sort garante que o handler de pagamento dispara
      // antes de qualquer outro side-effect.
      const displayToolCalls = res.toolCalls?.some((tc) => tc.name === 'open_payment_screen')
        ? res.toolCalls
            .filter((tc) => tc.name !== 'call_waiter')
            .sort((a, b) =>
              a.name === 'open_payment_screen' ? -1 : b.name === 'open_payment_screen' ? 1 : 0,
            )
        : (res.toolCalls ?? []);
      // Round C (chat UX polish) — eyebrow `··· USANDO X ···` aparece pra
      // TODAS as tools dispatchadas (silent-path, card visual ou text-only).
      // Decisão V20: o user quer ver explicitamente o que a IA tá fazendo em
      // qualquer caso — transparência > minimalismo. `dispatchToolCall` ainda
      // skipa o stub bubble "OK" pras text-only tools (a resposta principal já
      // carrega o texto), mas o eyebrow continua marcado pra que o user saiba
      // qual ferramenta foi acionada.
      const firstTool = displayToolCalls.length > 0 ? displayToolCalls[0] : null;
      const eyebrowTool = firstTool;

      // Framework bugfix (add_to_order · 2 bubbles contraditórios):
      // o texto do LLM ("Adicionei X") era renderizado ANTES da validação do
      // id no FE. Quando o id não resolvia, o dispatch depois cuspia um 2º
      // bubble "Não localizei" — resultado: dois bubbles conflitantes e nada
      // adicionado. Pré-resolvemos os ids AGORA: se NENHUM item de add_to_order
      // resolve, substituímos o texto otimista pela mensagem de falha coerente
      // (bubble ÚNICO) e suprimimos a reemissão no dispatch.
      let aiContent = res.response;
      const addCalls = addToOrderCallsIn(displayToolCalls);
      if (addCalls.length > 0) {
        const resolutions = await Promise.all(
          addCalls.map(async (call) => ({ call, item: await resolveToolMenuItem(call) })),
        );
        const unresolved = resolutions.filter((r) => r.item === null);
        // Suprime o feedback de falha do dispatch pras calls que já sabemos que
        // vão falhar — o dispatch fará early-return sem append.
        for (const { call } of unresolved) {
          suppressedAddFailuresRef.current.add(call);
        }
        const noneResolved = unresolved.length === addCalls.length;
        if (noneResolved) {
          // Todos os itens falharam → o texto otimista é mentira. Troca pela
          // mensagem de falha única e coerente.
          aiContent = ADD_TO_ORDER_FAILURE_MESSAGE;
        }
      }

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: res.wasBlocked ? 'blocked' : 'ai',
        content: aiContent,
        linkedItems: res.linkedItems && res.linkedItems.length > 0 ? res.linkedItems : undefined,
        selectedIds: [],
        toolCall: eyebrowTool
          ? { name: eyebrowTool.name, category: categorizeToolName(eyebrowTool.name) }
          : undefined,
        // LGPD notice flow · the AI service signals this via `toolHint`.
        // We do NOT paraphrase the canonical text — it lives in
        // `services/ai-service/services/lgpd_messages.py` and arrives
        // verbatim in `res.response`. The FE only needs to render the
        // 2 chips below it (canonical labels from the same module).
        lgpdNotice:
          res.toolHint?.type === 'lgpd_notice' && res.toolHint.chips
            ? {
                chipConfirmLabel: res.toolHint.chips.confirm,
                chipDismissLabel: res.toolHint.chips.dismiss,
                consumed: false,
              }
            : undefined,
      };
      setMessages((prev) => [...prev, aiMsg]);
      // Round D (chat UX polish): assim que o aiMsg entra no transcript, o
      // typing-dots indicator deixa de fazer sentido — o `ToolCallIndicator`
      // inline já assume o papel de "IA está agindo". Sem isso, durante os
      // 1.5s do delay silent-path teríamos eyebrow + dots simultaneamente.
      setLoading(false);

      // K-1 fix (round 3): chips canon das tools dispatchadas têm
      // prioridade sobre `res.suggestions` (que é o trio estático ou
      // string[] legacy). Ambos os campos coexistem por compat com clients
      // antigos; novos consumimos `res.chips`.
      if (res.chips && res.chips.length > 0) {
        setSuggestions(res.chips);
      } else if (res.suggestions && res.suggestions.length > 0) {
        // Legacy string[] suggestions → embrulhamos como ChipCanon[] de
        // action 'send' pra que SuggestionChip continue funcionando.
        setSuggestions(
          res.suggestions.map((label, i) => ({
            id: `legacy-${i}-${label.slice(0, 12)}`,
            label,
            action: 'send' as const,
            payload: label,
          })),
        );
      }

      // Round 3 Cat 4 (V20 chat): atualiza eyebrow `··· USANDO X ···`
      // baseado na primeira tool dispatched neste turno. Limpamos no
      // próximo turno do user (handler do submit).
      if (displayToolCalls.length > 0) {
        setLastToolName(displayToolCalls[0].name);
      } else {
        setLastToolName(null);
      }

      // Dispatch FE-side tool calls (overlay opens, screen navigations, etc.).
      // Fired AFTER the bubble is in the DOM so the order in the transcript
      // is `bubble → tool effect`. Errors are caught per-call inside dispatch
      // — one failing tool doesn't poison the whole turn.
      if (displayToolCalls.length > 0) {
        for (const tc of displayToolCalls) {
          try {
            await dispatchToolCall(tc);
          } catch (e) {
            console.warn('[chat] tool dispatch failed:', tc.name, e);
          }
        }
      }
    } catch (err) {
      // Distingue erros de validacao (mensagem muito longa, formato
      // invalido) do erro generico de rede pra que o usuario saiba se
      // pode editar e tentar de novo. Backend valida @MaxLength(2000).
      const isTimeout = err instanceof Error && err.message === 'TIMEOUT';
      const isValidationError = err instanceof Error && /400/.test(err.message);
      const isLengthError =
        err instanceof Error && /shorter than|2000 characters/i.test(err.message);
      const content = isTimeout
        ? 'Conexão lenta. Tente novamente.'
        : isLengthError
          ? 'Mensagem muito longa. Por favor, encurte para no máximo 2000 caracteres.'
          : isValidationError
            ? 'Não consegui processar essa mensagem. Tente reformular.'
            : 'Desculpe, estou com dificuldade no momento. Tente novamente.';
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'ai',
        content,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  // Keep the latest `sendMessage` accessible from the prefill effect without
  // putting it in the dep array (it's a new reference on every render, which
  // would cancel the 300ms timeout repeatedly and lose the auto-send).
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  useEffect(() => {
    if (!shouldAutoSendPrefill || autoSentRef.current) return;
    autoSentRef.current = true;
    // Bubble do usuario ja foi renderizada via initialMessages; aqui so
    // disparamos a chamada da IA. Sem timeout: queremos o typing indicator
    // aparecer no mesmo frame que o usuario chega na tela.
    sendMessageRef.current(prefill, { skipUserBubble: true });
  }, [prefill, shouldAutoSendPrefill]);

  const toggleLinkedSelection = (messageId: string, itemId: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || m.orderPlaced) return m;
        const current = m.selectedIds ?? [];
        const next = current.includes(itemId)
          ? current.filter((x) => x !== itemId)
          : [...current, itemId];
        return { ...m, selectedIds: next };
      }),
    );
  };

  const confirmLinkedOrder = async (messageId: string) => {
    if (placingOrder || pendingOrderAdd) return;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || !msg.linkedItems || !msg.selectedIds || msg.selectedIds.length === 0) return;

    const picked = msg.linkedItems.filter((it) => msg.selectedIds!.includes(it.id));
    await placeOrderForItems(picked, messageId);
  };

  /**
   * LGPD chip handlers · per `historico-de-chat-e-lgpd.md`.
   *
   * Confirm  → POST /lgpd-requests (kind=erasure). The BE wipes the customer's
   *            NoSQL chat data synchronously and returns the protocol number.
   *            FE marks the originating bubble's chips as consumed (chips
   *            disappear, bubble persists in history) and appends a
   *            confirmation bubble with the protocol.
   * Dismiss  → marks chips consumed and silently drops the flow. No FE-side
   *            audit beyond the chip-consumed flag — the AI service will
   *            generate the next free-text response.
   */
  const handleLgpdConfirm = async (messageId: string) => {
    if (lgpdBusyRef.current) return;
    lgpdBusyRef.current = true;
    // Mark chips consumed immediately so the user can't double-tap.
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.lgpdNotice
          ? { ...m, lgpdNotice: { ...m.lgpdNotice, consumed: true } }
          : m,
      ),
    );
    // Show the silent tool indicator while the action runs.
    const indicatorId = `lgpd-indicator-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: indicatorId,
        role: 'ai',
        content: '',
        toolCall: { name: 'lgpd_data_request', category: 'lgpd' },
      },
    ]);
    try {
      const res = await createLgpdRequest(slug, {
        kind: 'erasure',
        customerId: session.customerId ?? undefined,
        consentMethod: 'chip',
        consentChipLabel: 'Sim, quero excluir',
      });
      // Replace the indicator with the canonical confirmation bubble. The
      // copy is rendered exactly as the AI service would emit it (canonical
      // text from `services/ai-service/services/lgpd_messages.py`).
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== indicatorId)
          .concat({
            id: `lgpd-protocol-${Date.now()}`,
            role: 'ai',
            content:
              'Suas conversas foram apagadas agora. Protocolo guardado por 90 dias caso você precise de comprovante.',
            lgpdProtocol: { protocolNumber: res.protocolNumber },
          }),
      );
    } catch {
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== indicatorId)
          .concat({
            id: `lgpd-error-${Date.now()}`,
            role: 'ai',
            content: 'Não consegui registrar a solicitação agora. Tente de novo em instantes.',
          }),
      );
    } finally {
      lgpdBusyRef.current = false;
    }
  };

  const handleLgpdDismiss = (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.lgpdNotice
          ? { ...m, lgpdNotice: { ...m.lgpdNotice, consumed: true } }
          : m,
      ),
    );
  };

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={session.tableLabel || ''}
      activeHref={`/${slug}/assistente`}
      noMainPadding
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="gpu-layer flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-[22px] pb-4 pt-3">
          {/* Faixa de status FIXA no modo chat (decisão Caleb 2026-06-12):
              com pedido ativo, o estado + ETA ficam visíveis o tempo todo
              no topo do transcript — independente das bolhas. O
              ToolCallIndicator e a eyebrow por bolha continuam; isto é um
              complemento, não substituto. Mesma tipografia mono 10px do
              canon — só sticky + fundo pra rolagem passar por baixo. */}
          {chatStarted && !historyLoading && activeOrder && (
            <div
              data-testid="order-status-strip"
              className="sticky -top-3 z-10 -mx-[22px] -mt-3 bg-bg px-[22px] pb-2 pt-3"
            >
              <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-mute">
                <AssistantOrderEyebrow active={activeOrder} />
              </span>
            </div>
          )}
          {/* Round 22 §A/§D — loader inline enquanto hidrata o histórico
              persistido. Some logo que listMessages resolve (sucesso ou
              erro). Sem ele teríamos um flash da landing antes do chat
              aparecer (ruim em conexões 4G lentas). */}
          {historyLoading && (
            <div
              data-testid="assistente-history-loading"
              className="flex flex-1 items-center justify-center"
            >
              <div className="text-[13px] text-mute">Carregando conversa…</div>
            </div>
          )}
          {/* Round 4 §C-NEW-8: landing view (idle) · 2 PillButtons grandes
              acima do greeting do LLM, alinhado ao layout da Mesa Home.
              Ao 1º send do customer, chatStarted vira true e essa view
              é substituída pelos bubbles de chat (que pre-pendam o
              greeting como 1º AI message). */}
          {!chatStarted && !historyLoading && (
            <div
              data-testid="assistente-landing"
              className="flex flex-1 flex-col justify-center gap-7"
            >
              <div className="flex flex-col items-center gap-3">
                <PillButton onClick={openCallWaiterSheet}>Chamar garçom</PillButton>
                <PillButton onClick={() => push(`/${slug}/cardapio`)}>Ver cardápio</PillButton>
              </div>
              <HomeHero
                kicker={activeOrder ? <AssistantOrderEyebrow active={activeOrder} /> : 'Assistente'}
                animate={false}
                message={
                  landingGreeting ||
                  `Olá${session.customerName ? `, ${session.customerName.split(' ')[0]}` : ''}! Posso ajudar com sugestões, ingredientes, pedido e pagamento.`
                }
              />
            </div>
          )}
          {messages.map((msg) => {
            if (msg.tableMerge) {
              const merge = msg.tableMerge;
              const origin = merge.originTableNumber ?? undefined;
              const target = merge.targetTableNumber ?? undefined;
              if (merge.kind === 'incoming' || merge.kind === 'waiting') {
                return (
                  <div key={msg.id} className="flex max-w-[92%] flex-col gap-2 self-start">
                    <MergeTypewriterBubble
                      originHostName={merge.originHostName}
                      originTableNumber={origin}
                      targetTableNumber={target}
                      originPartySize={merge.originPartySize ?? 0}
                      targetPartySize={merge.targetPartySize ?? 0}
                      busy={merge.busy ?? null}
                      decided={merge.kind === 'waiting' ? 'waiting' : null}
                      error={merge.error}
                      onApprove={() => decideTableMergeFromChat(msg.id, 'approve')}
                      onReject={() => decideTableMergeFromChat(msg.id, 'reject')}
                      onOpenDetails={() =>
                        push(`/${slug}/host/approve/merge?requestId=${merge.requestId ?? ''}`)
                      }
                    />
                  </div>
                );
              }
              if (merge.kind === 'approved') {
                return (
                  <ScreenCustomerPostMergeApproved
                    key={msg.id}
                    originTableNumber={origin}
                    targetTableNumber={target}
                    onViewOrder={() => push(`/${slug}/pedido`)}
                    onCallWaiter={openCallWaiterSheet}
                    onViewMenu={() => push(`/${slug}/cardapio`)}
                  />
                );
              }
              if (merge.kind === 'rejected') {
                return (
                  <ScreenCustomerPostMergeRejected
                    key={msg.id}
                    originTableNumber={origin}
                    targetTableNumber={target}
                    rejectedBy={merge.rejectedBy ?? null}
                    onCallHost={callHostToTable}
                    onTryAnother={tryAnotherTableMerge}
                    onContinueHere={dismissMergeOutcome}
                  />
                );
              }
              return (
                <ScreenCustomerMergeCooldown
                  key={msg.id}
                  targetTableNumber={target}
                  cooldownEndsAt={
                    merge.cooldownEndsAt ?? new Date(Date.now() + 10 * 60 * 1000).toISOString()
                  }
                  message={merge.message}
                  onCallHost={callHostToTable}
                  onTryAnother={tryAnotherTableMerge}
                  onContinueHere={dismissMergeOutcome}
                />
              );
            }
            if (msg.joinRequest) {
              const decided = msg.joinRequest.decision;
              const busy = !!msg.joinRequest.busy;
              return (
                <div key={msg.id} className="flex max-w-[92%] flex-col gap-2 self-start">
                  <TypewriterBubble
                    text={msg.content}
                    eyebrow="Pedido de entrada · agora"
                    urgent={!decided}
                    testId="assistant-join-request-bubble"
                    skipAnimation={!!decided}
                  >
                    {decided ? (
                      <div className="inline-flex rounded-full border border-border-soft bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink">
                        {decided === 'approved'
                          ? 'Entrada aprovada'
                          : decided === 'cancelled'
                            ? 'Pedido cancelado'
                            : 'Entrada recusada'}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => sendMessage('Pode entrar', { flowIntent: 'join' })}
                          disabled={loading || busy}
                          className="rounded-full bg-ink px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-55"
                        >
                          {busy ? 'Enviando…' : 'Pode entrar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => sendMessage('Agora não', { flowIntent: 'join' })}
                          disabled={loading || busy}
                          className="rounded-full border border-ink/30 bg-bg px-3.5 py-2 text-[13px] font-semibold text-ink disabled:opacity-55"
                        >
                          Agora não
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            push(
                              session.tableLabel
                                ? `/${slug}/mesa/${encodeURIComponent(session.tableLabel)}`
                                : `/${slug}`,
                            )
                          }
                          disabled={busy}
                          className="rounded-full border border-border-soft bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink disabled:opacity-55"
                        >
                          Ver quem está na mesa
                        </button>
                      </div>
                    )}
                  </TypewriterBubble>
                  {msg.joinRequest.error && (
                    <span className="text-[12px] font-medium text-danger">
                      {msg.joinRequest.error}
                    </span>
                  )}
                </div>
              );
            }
            if (msg.courtesy) {
              return (
                <div key={msg.id} className="flex flex-col gap-2">
                  <CourtesyArrival
                    courtesy={msg.courtesy}
                    busyStatus={msg.courtesyBusy}
                    error={msg.courtesyError}
                    onRespond={(id, status) => handleCourtesyRespond(msg.id, id, status)}
                  />
                </div>
              );
            }
            const selected = msg.selectedIds ?? [];
            const hasCards = !!msg.linkedItems && msg.linkedItems.length > 0;
            const showConfirm = hasCards && selected.length > 0 && !msg.orderPlaced;
            // Silent tool-call indicator messages render only the
            // ToolCallIndicator — no bubble, no chips. Used during the
            // ~300ms window when the LGPD `lgpd_data_request` action is in
            // flight (same pattern any silent tool would use).
            if (msg.toolCall && !msg.content) {
              return (
                <div key={msg.id} className="flex flex-col gap-2 self-start">
                  <ToolCallIndicator name={msg.toolCall.name} category={msg.toolCall.category} />
                </div>
              );
            }
            // LGPD protocol receipt · canonical confirmation card with the
            // protocol number visible in mono caps. Bubble wraps the
            // canonical text from `lgpd_messages.py` (rendered verbatim).
            if (msg.lgpdProtocol) {
              return (
                <div
                  key={msg.id}
                  className="flex max-w-[86%] flex-col gap-2 self-start rounded-[14px] border border-border-soft bg-bg px-4 py-3.5 text-[14px] leading-[1.5] text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[1.5px] text-faint">
                    Solicitação registrada · protocolo
                  </span>
                  <span className="font-mono text-[16px] font-bold tracking-[0.5px] text-ink">
                    {msg.lgpdProtocol.protocolNumber}
                  </span>
                  <span style={{ textWrap: 'pretty' as never }}>{msg.content}</span>
                </div>
              );
            }
            // Round 18 (Onda 4 batch 2) · staff→customer signed bubble.
            // `Bubble` só sabe 'user'|'ai'|'blocked' — staff messages têm
            // header próprio (avatar + eyebrow "RENATA · GERENTE" + time).
            if (msg.role === 'staff') {
              return (
                <div key={msg.id} className="flex flex-col gap-2">
                  <StaffBubble
                    initial={msg.staffInitial ?? (msg.staffName?.[0] ?? 'G').toUpperCase()}
                    name={msg.staffName ?? 'Gerência'}
                    roleLabel={msg.staffRole ?? 'Gerente'}
                    relativeTime={formatRelativeTime(msg.staffCreatedAt)}
                  >
                    {msg.content}
                  </StaffBubble>
                </div>
              );
            }
            return (
              <div key={msg.id} className="flex flex-col items-start gap-2">
                {/* V20 canon F04_Chat: eyebrow "ASSISTENTE · agora" +
                    ToolCallIndicator aparecem INLINE antes do bubble texto,
                    todos no lado esquerdo. Só renderiza pra mensagens do
                    assistente (role='ai') que dispatcharam uma tool. */}
                {msg.role === 'ai' && msg.toolCall && (
                  <>
                    <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-mute">
                      {/* Prompt 100 §1: com pedido ativo a faixa acima da
                          fala da IA carrega estado + ETA ao vivo; sem
                          pedido, mantém o canon `Assistente · agora`. */}
                      {activeOrder ? (
                        <AssistantOrderEyebrow active={activeOrder} />
                      ) : (
                        'Assistente · agora'
                      )}
                    </span>
                    <ToolCallIndicator
                      name={msg.toolCall.name}
                      category={msg.toolCall.category}
                      completed
                    />
                  </>
                )}
                <Bubble role={msg.role}>{msg.content}</Bubble>
                {msg.lgpdNotice && !msg.lgpdNotice.consumed && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleLgpdConfirm(msg.id)}
                      className="inline-flex items-center rounded-full border-[1.2px] border-ink bg-ink px-3.5 py-2 text-[13px] font-medium text-white active:opacity-90"
                    >
                      {msg.lgpdNotice.chipConfirmLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLgpdDismiss(msg.id)}
                      className="inline-flex items-center rounded-full border-[1.2px] border-border-soft bg-bg px-3.5 py-2 text-[13px] font-medium text-ink active:bg-surface"
                    >
                      {msg.lgpdNotice.chipDismissLabel}
                    </button>
                  </div>
                )}
                {hasCards && (
                  <div className="-mx-[22px] flex gap-2.5 overflow-x-auto px-[22px] pb-1 [&::-webkit-scrollbar]:hidden">
                    {msg.linkedItems!.map((it) => {
                      const isSel = selected.includes(it.id);
                      return (
                        <div
                          key={it.id}
                          className={`flex w-[148px] shrink-0 flex-col overflow-hidden rounded-[16px] border-[1.3px] bg-bg transition-colors ${
                            isSel ? 'border-ink' : 'border-border-soft'
                          }`}
                        >
                          <div className="relative aspect-[4/3] w-full bg-surface">
                            {it.imageUrl ? (
                              <Image
                                src={it.imageUrl}
                                alt={it.name}
                                fill
                                sizes="148px"
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[22px] text-faint">
                                ◌
                              </div>
                            )}
                          </div>
                          <div className="flex flex-1 flex-col p-2.5">
                            <div className="mb-0.5 line-clamp-2 text-[12px] font-medium leading-[1.25] tracking-[-0.01em]">
                              {it.name}
                            </div>
                            <div className="mb-1.5 text-[11px] tabular-nums text-mute">
                              R$ {(it.priceCents / 100).toFixed(2).replace('.', ',')}
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleLinkedSelection(msg.id, it.id)}
                              disabled={msg.orderPlaced}
                              className={`mt-auto flex items-center justify-center rounded-full border-[1.2px] px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                                isSel ? 'border-ink bg-ink text-white' : 'border-ink bg-bg text-ink'
                              } disabled:opacity-60`}
                            >
                              {isSel ? '✓ Selecionado' : 'Pedir'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {showConfirm && (
                  <div className="max-w-[90%] self-start rounded-[16px] border border-ink/20 bg-surface px-3.5 py-3 text-[13px] leading-[1.4] text-ink">
                    <div className="mb-2 text-pretty">
                      Quer que eu peça{' '}
                      {msg
                        .linkedItems!.filter((it) => selected.includes(it.id))
                        .map((it, i, arr) => (
                          <span key={it.id}>
                            <b>{it.name}</b>
                            {i < arr.length - 2 ? ', ' : i === arr.length - 2 ? ' e ' : ''}
                          </span>
                        ))}
                      ?
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => confirmLinkedOrder(msg.id)}
                        disabled={placingOrder || !!pendingOrderAdd}
                        className="flex-1 rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
                      >
                        {pendingOrderAdd
                          ? 'Escolhendo…'
                          : placingOrder
                            ? 'Enviando…'
                            : 'Sim, pedir'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMessages((prev) =>
                            prev.map((m) => (m.id === msg.id ? { ...m, selectedIds: [] } : m)),
                          )
                        }
                        disabled={placingOrder}
                        className="rounded-full border border-ink/30 bg-bg px-3 py-1.5 text-[12px] text-ink disabled:opacity-60"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex max-w-[86%] self-start items-center gap-1.5 rounded-[18px] rounded-bl-[4px] border border-ink bg-bg px-4 py-3">
              <div className="h-1.5 w-1.5 animate-bounce-dot rounded-full bg-ink" />
              <div
                className="h-1.5 w-1.5 animate-bounce-dot rounded-full bg-ink"
                style={{ animationDelay: '0.15s' }}
              />
              <div
                className="h-1.5 w-1.5 animate-bounce-dot rounded-full bg-ink"
                style={{ animationDelay: '0.3s' }}
              />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* V20 canon: ToolCallIndicator agora vive INLINE dentro de cada
            AssistantTurn (via msg.toolCall) — não mais no rodapé global.
            O state `lastToolName` permanece só pra trocar o placeholder
            do SoftInput contextualmente (send_complaint / send_message
            → "Mensagem para a casa"). */}

        <div className="shrink-0 pt-1.5">
          <div className="-mx-[22px] flex gap-1.5 overflow-x-auto px-[22px] pb-2 [&::-webkit-scrollbar]:hidden">
            {/* Round 3 Cat 1 / Cat 13: usa SuggestionChip em vez do
                <button> plano. Chip canônico (action: send|navigate|expand)
                permite contextual input expand pra send_complaint etc. */}
            {suggestions.map((chip) => {
              const normalizedChip = normalizeChipCopy(chip);
              return (
                <SuggestionChip
                  key={chip.id}
                  chip={normalizedChip}
                  disabled={loading || chipBusy}
                  onTap={async (c) => {
                    if (chipBusy) return;
                    setChipBusy(true);
                    try {
                      // Round 5 P0 (A2): chip de confirmação destrutiva carrega
                      // payload OBJETO `{ tool, args: { confirm } }`. Ele dispara
                      // a deleção OUT-OF-BAND (endpoint canônico) — NUNCA vira
                      // texto pro LLM (senão o gate re-bate → loop infinito e o
                      // humano nunca deleta). Checa ANTES da coerção pra string.
                      if (await handleDestructiveConfirmChip((c as ChipCanon).payload)) {
                        return;
                      }
                      const txt = chipText(c as ChipCanon);
                      if (c.action === 'navigate') {
                        router.push(chipNavigationDestination(slug, txt));
                      } else if (c.action === 'expand') {
                        setExpandedInputPlaceholder(txt);
                        setLastToolName(lastToolName ?? 'send_message_to_manager');
                      } else {
                        // 'send' default
                        await sendMessage(txt);
                      }
                    } finally {
                      setTimeout(() => setChipBusy(false), 800);
                    }
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className="keyboard-anchor shrink-0 px-[22px] pt-2">
          <SoftInput
            maxLength={2000}
            // Round 3 Cat 4 (V20): placeholder muda contextualmente
            // quando uma tool acabou de rodar — sinaliza que o próximo
            // input vai pra mesa (host/staff) e não mais pra IA conversar.
            placeholder={
              expandedInputPlaceholder ??
              (lastToolName === 'send_complaint' || lastToolName === 'send_message_to_manager'
                ? 'Mensagem para a casa'
                : 'Pergunte alguma coisa...')
            }
            value={input}
            onChange={setInput}
            onSubmit={sendMessage}
            disabled={loading}
          />
        </div>
      </div>

      {/* Salon-map overlay · driven by the LLM tool `request_table_merge`
          when no `targetTable` is provided. The CTA resolves the pending
          tool-call promise after the customer confirms a table. */}
      <CommandPicker
        open={pendingOrderAdd !== null}
        priceCents={pendingOrderTotalCents}
        onClose={closePendingOrderAdd}
        onConfirm={confirmPendingOrderAdd}
      />

      <OverlaySalonMap
        open={tableMerge.overlayOpen}
        tables={salonTables}
        loading={salonLoading}
        error={salonError}
        emptyMessage="Nao encontrei mesas proximas para juntar agora."
        onSelectTable={(t) =>
          tableMerge.selectTable({
            num: t.num,
            sessionId: t.sessionId,
            label: t.tableLabel ?? t.tableCode,
          })
        }
        onClose={tableMerge.cancelOverlay}
        title="Com qual mesa você quer juntar?"
        ctaLabel="Pedir pra juntar"
      />
    </AppShell>
  );
}
