'use client';

import Image from 'next/image';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { apiPost, apiGet } from '../../../lib/api';
import { clearDeliveredContinuationHint } from '../../../lib/continuationHints';
import { recordCustomerEvent } from '../../../lib/customerEvents';
import { listMessages } from '../../../lib/api/chat-history';
import { listCustomerCourtesies, respondCustomerCourtesy } from '../../../lib/api/courtesies';
import type { ChatMessageDto, CourtesyStatus, CustomerCourtesyDto } from '@restaurant/shared-types';
import { getSessionToken } from '../../../lib/storage';
import { useSession } from '../../../hooks/useSession';
import { useNav } from '../../../hooks/useNav';
import { useTableMerge } from '../../../hooks/useTableMerge';
import { useTableSocket } from '../../../hooks/useTableSocket';
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
import { createLgpdRequest } from '../../../lib/api/feedback';

interface LinkedItem {
  id: string;
  name: string;
  priceCents: number;
  imageUrl: string | null;
  categoryName?: string;
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
const DEFAULT_SUGGESTIONS: ChipCanon[] = [
  {
    id: 'default-leve',
    label: 'Sugestão leve',
    action: 'send' as const,
    payload: 'me indica algo leve',
  },
  {
    id: 'default-sobremesa',
    label: 'Sobremesa combina?',
    action: 'send' as const,
    payload: 'que sobremesa combina?',
  },
  {
    id: 'default-camarao',
    label: 'Pratos com camarão',
    action: 'send' as const,
    payload: 'tem prato com camarão?',
  },
  {
    id: 'default-pagar',
    label: 'Como pagar?',
    action: 'send' as const,
    payload: 'como pago a conta?',
  },
];

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
    return `/${slug}/orders/${encodeURIComponent(ratingMatch[1])}/rating`;
  }
  if (raw === 'avaliar' || raw === '/avaliar') {
    return `/${slug}/pagamento/feedback`;
  }
  return raw.startsWith('/') ? raw : `/${slug}/${raw}`;
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

function positiveInt(value: unknown, fallback = 1): number {
  const n = numberValue(value);
  if (n === null) return fallback;
  return Math.max(1, Math.min(20, Math.floor(n)));
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

function mergeUniqueChatMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const next = [...current];
  for (const msg of incoming) {
    const duplicate = next.some((existing) => {
      if (existing.id === msg.id) return true;
      return isDuplicateStaffMessage(existing, msg);
    });
    if (!duplicate) next.push(msg);
  }
  return next;
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
const TEXT_ONLY_TOOLS = new Set<string>([
  'ask_about_restaurant',
  'search_dish',
  'check_allergens',
  'compare_dishes',
]);

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
  if (name === 'request_table_merge' || name === 'late_arrival') return 'session';
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
  const itemId = searchParams.get('itemId') ?? '';
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
    if (prefill) {
      return [{ id: 'prefill-user', role: 'user', content: prefill }];
    }
    return [];
  }, [prefill]);

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(!!prefill);
  // `/assistente` sem `threadId` sempre abre uma conversa ativa nova por
  // visita. Histórico salvo no Mongo só volta ao chat ativo pelo menu de
  // conversas, quando o usuário escolhe continuar aquele thread.
  const [chatStarted, setChatStarted] = useState<boolean>(!!prefill || !!threadIdParam);
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
  // Round 3 Cat 4 (V20 chat): última tool dispatched neste turno — usa
  // pra renderizar a eyebrow `··· USANDO ADD_TO_ORDER ···` antes do
  // bubble do assistente.
  const [lastToolName, setLastToolName] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);
  if (!conversationIdRef.current) {
    conversationIdRef.current = newAssistantConversationId();
  }

  useEffect(() => {
    if (!slug || !session.sessionId) return;
    recordCustomerEvent(slug, 'assistant_opened', {
      source: threadIdParam ? 'thread' : prefill ? 'prefill' : 'landing',
    });
  }, [slug, session.sessionId, threadIdParam, prefill]);

  useEffect(() => {
    const refresh = () => setContinuationRefreshKey((key) => key + 1);
    window.addEventListener('customer:continuation-refresh', refresh);
    return () => window.removeEventListener('customer:continuation-refresh', refresh);
  }, []);

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
  // from archived Mongo `/chat-history` threads. It keeps staff bubbles visible
  // after a hard reload of the active `/assistente` page.
  useEffect(() => {
    if (!slug || threadIdParam || prefill || !session.sessionId || !session.customerId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<AssistantInlineHistoryResponse>(`/${slug}/assistant/history`);
        if (cancelled) return;
        const hydrated = mapInlineHistoryToChat(res.messages ?? []);
        if (hydrated.length === 0) return;
        setMessages((prev) => mergeUniqueChatMessages(prev, hydrated));
        setChatStarted(true);
      } catch {
        /* ignore — realtime WS path still works, archived history remains separate */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, threadIdParam, prefill, session.sessionId, session.customerId]);

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
   * room `session:<tableSessionId>` quando um manager envia via
   * MContactClientSheet (POST /assistant/staff-to-customer). Payload
   * shape vem direto de `assistant.service.ts::sendStaffToCustomer`:
   *   { id, tableSessionId, message, fromStaffId, fromStaffName, createdAt }
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
  useTableSocket(session.sessionId, (event, data) => {
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
  });

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
  // Tables to render in the overlay — empty default for now. C5 will wire
  // `/salon/tables/adjacent?from={ourTable}` once the BE endpoint lands.
  const salonTables = useMemo<SalonTable[]>(() => [], []);

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
   *    pick, re-emits enriched call to BE
   *  - `lgpd_data_request`, `show_lgpd_notice` → handled inline above via
   *    `toolHint`/chips (canonical text comes from `lgpd_messages.py`)
   *
   * Tools stubbed (logged + generic OK bubble — no crash):
   *  - `view_menu`, `search_dish`, `check_allergens`, `compare_dishes`,
   *    `view_order`, `split_bill`, `pay_individual`, `pay_full`,
   *    `open_payment_screen`, `delete_chat`, `delete_all_chats`,
   *    `view_courtesy`, `ask_about_restaurant`
   *
   * The stubs exist so an unexpected tool name doesn't break the chat — F4
   * fixes the contract; C5/C6 will fill the UX for each tool individually.
   */
  const dispatchToolCall = async (call: AssistantToolCall): Promise<void> => {
    const name = call.name;
    // Round C (chat UX polish) — para tools text-only (ask_about_restaurant,
    // search_dish, etc.), a aiMsg principal já carregou o texto da resposta.
    // Não precisamos do stub bubble "OK" nem de side-effect; early-return
    // mantém o transcript limpo (só o bubble texto + eyebrow `··· USANDO X ···`
    // que vem do `eyebrowTool` em sendMessage, sem stub duplicado).
    if (TEXT_ONLY_TOOLS.has(name)) return;
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

    if (name === 'request_table_merge') {
      const enriched = await tableMerge.handleToolCall({
        name: call.name,
        arguments: call.arguments,
      });
      // null → not handled (shouldn't happen given the if above)
      // sync envelope → already had targetTable; nothing to re-dispatch
      // Promise → resolved by overlay tap
      if (!enriched) return;
      const final = await Promise.resolve(enriched);
      if (final.arguments?.targetTable) {
        // Re-emit the call to the BE so the merge request actually persists.
        try {
          await apiPost(`/${slug}/assistant/tool-result`, {
            name: 'request_table_merge',
            arguments: final.arguments,
            customerId: session.customerId || undefined,
          });
        } catch (err) {
          console.warn('[chat] table-merge re-emit failed:', err);
        }
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
      const item = await resolveToolMenuItem(call);
      if (!item) {
        appendToolFeedback(
          'Não consegui localizar esse item no cardápio para atualizar seu pedido.',
        );
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
      clearDraftOrder();
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

    // 2) Tools whose UX isn't fully designed yet — render a generic "OK"
    //    bubble so the chat doesn't crash, log a warning so devs see the
    //    gap. Per F4 brief.
    const stubbedTools = new Set<string>([
      'search_dish',
      'check_allergens',
      'compare_dishes',
      'delete_chat',
      'delete_all_chats',
      'ask_about_restaurant',
    ]);
    if (stubbedTools.has(name)) {
      console.warn('[chat] tool not implemented in client:', name);
      setMessages((prev) => [
        ...prev,
        {
          id: `tool-stub-${Date.now()}`,
          role: 'ai',
          content: 'OK',
          toolCall: { name, category: 'info' },
        },
      ]);
      return;
    }

    // 3) Tools handled by other flows (lgpd handled via toolHint above; rest
    //    of the canonical set is text-only and arrives as `res.response`).
    //    Log unknown-but-not-stubbed names for visibility.
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

  const sendMessage = async (text: string, options?: { skipUserBubble?: boolean }) => {
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

    setLoading(true);

    try {
      const res = await apiPost<SendResponse>(`/${slug}/assistant/message`, {
        message: trimmed,
        customerId: session.customerId || undefined,
        itemId: itemId || undefined,
        conversationId: activeThreadId ? undefined : (conversationIdRef.current ?? undefined),
        continueThreadId: activeThreadId ?? undefined,
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
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: res.wasBlocked ? 'blocked' : 'ai',
        content: res.response,
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
    if (!prefill || autoSentRef.current) return;
    autoSentRef.current = true;
    // Bubble do usuario ja foi renderizada via initialMessages; aqui so
    // disparamos a chamada da IA. Sem timeout: queremos o typing indicator
    // aparecer no mesmo frame que o usuario chega na tela.
    sendMessageRef.current(prefill, { skipUserBubble: true });
  }, [prefill]);

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
   * LGPD chip handlers · per `chat-history-lgpd.md`.
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
                kicker="Assistente"
                animate={false}
                message={
                  landingGreeting ||
                  `Olá${session.customerName ? `, ${session.customerName.split(' ')[0]}` : ''}! Posso ajudar com sugestões, ingredientes, pedido e pagamento.`
                }
              />
            </div>
          )}
          {messages.map((msg) => {
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
                      Assistente · agora
                    </span>
                    <ToolCallIndicator name={msg.toolCall.name} category={msg.toolCall.category} />
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
          when no `targetTable` is provided. Tap on a table resolves the
          pending tool-call promise (see `useTableMerge`). */}
      <CommandPicker
        open={pendingOrderAdd !== null}
        priceCents={pendingOrderTotalCents}
        onClose={closePendingOrderAdd}
        onConfirm={confirmPendingOrderAdd}
      />

      <OverlaySalonMap
        open={tableMerge.overlayOpen}
        tables={salonTables}
        onSelectTable={(t) => tableMerge.selectTable(t.num)}
        onClose={tableMerge.cancelOverlay}
        title="Com qual mesa você quer juntar?"
        ctaLabel="Pedir pra juntar"
      />
    </AppShell>
  );
}
