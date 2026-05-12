'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { apiPost, apiGet } from '../../../lib/api';
import { getSessionToken } from '../../../lib/storage';
import { useSession } from '../../../hooks/useSession';
import { useNav } from '../../../hooks/useNav';
import { useTableMerge } from '../../../hooks/useTableMerge';
import { useTableSocket } from '../../../hooks/useTableSocket';
import { useDraftOrder } from '../../../providers/DraftOrderProvider';
import { AppShell } from '../../../components/layout/AppShell';
import { Bubble } from '../../../components/ui/Bubble';
import { StaffBubble } from '../../../components/ui/StaffBubble';
import { SoftInput } from '../../../components/ui/SoftInput';
import { ToolCallIndicator } from '../../../components/ui/ToolCallIndicator';
import { SuggestionChip } from '../../../components/ui/SuggestionChip';
import { PillButton } from '../../../components/ui/PillButton';
import { HomeHero } from '../../../components/home/HomeHero';
import { useUIState } from '../../../providers/UIStateProvider';
import {
  OverlaySalonMap,
  type SalonTable,
} from '../../../components/ui/OverlaySalonMap';
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
  silent?: boolean;
  router?: boolean;
}

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

// Fallback chips — só aparecem em idle (antes do primeiro turno) ou
// quando a tool dispatched não retornou chips canônicos. Backend devolve
// `chips` quando vier de uma tool com chips populated; aí esses defaults
// somem.
const DEFAULT_SUGGESTIONS: ChipCanon[] = [
  { id: 'default-leve', label: 'Sugestão leve', action: 'send' as const, payload: 'me indica algo leve' },
  { id: 'default-sobremesa', label: 'Sobremesa combina?', action: 'send' as const, payload: 'que sobremesa combina?' },
  { id: 'default-camarao', label: 'Pratos com camarão', action: 'send' as const, payload: 'tem prato com camarão?' },
  { id: 'default-pagar', label: 'Como pagar?', action: 'send' as const, payload: 'como pago a conta?' },
];

/**
 * Coerce o `payload` (que é `unknown` no contrato) pra string com fallback
 * pro label. Backend pode mandar string|null|undefined; o handler precisa
 * de uma string final pra navigate (path) ou send (texto pra digitar).
 */
function chipText(chip: ChipCanon): string {
  if (typeof chip.payload === 'string' && chip.payload.length > 0) return chip.payload;
  return chip.label;
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
function categorizeToolName(name: string): ToolCategory {
  if (name === 'view_menu' || name === 'search_dish' || name === 'check_allergens' || name === 'compare_dishes') return 'menu';
  if (name === 'add_to_order' || name === 'view_order' || name === 'place_order') return 'order';
  if (name === 'call_waiter' || name === 'send_complaint' || name === 'send_message_to_manager') return 'staff';
  if (name === 'request_bill' || name === 'split_bill' || name === 'pay_individual' || name === 'pay_full' || name === 'open_payment_screen') return 'payment';
  if (name === 'lgpd_data_request' || name === 'lgpd_notice') return 'lgpd';
  if (name === 'delete_chat' || name === 'delete_all_chats') return 'destructive';
  if (name === 'request_table_merge' || name === 'late_arrival') return 'session';
  return 'info';
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
  const picked = previousLinkedItems.filter((it) =>
    msg.includes(normalize(it.name)),
  );
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
  const { addItem } = useDraftOrder();
  const router = useRouter();
  const slug = params.slug as string;
  const prefill = searchParams.get('prefill') ?? '';
  const itemId = searchParams.get('itemId') ?? '';

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
  // Round 4 §C-NEW-8 — `/assistente` agora abre numa "landing" tipo Mesa
  // Home (eyebrow ASSISTENTE + greeting da continuation API + chips +
  // input). Bubbles de chat só aparecem quando o customer envia a 1ª
  // mensagem nesta sessão. Voltar pra `/assistente` (ex.: vindo de
  // /cardapio) recomeça em landing — histórico completo fica em
  // `/chat-history`. Com prefill, já entra direto em chat (skip landing).
  const [chatStarted, setChatStarted] = useState<boolean>(!!prefill);
  const [landingGreeting, setLandingGreeting] = useState<string | null>(null);
  // suggestions agora carrega chips canônicos (ChipCanon) em vez de só
  // strings — herdamos do backend `res.chips` quando uma tool dispatched
  // emitiu chips reativos. Fallback é DEFAULT_SUGGESTIONS (idle state).
  const [suggestions, setSuggestions] = useState<ChipCanon[]>(DEFAULT_SUGGESTIONS);
  const [chipBusy, setChipBusy] = useState(false);
  // Round 3 Cat 4 (V20 chat): última tool dispatched neste turno — usa
  // pra renderizar a eyebrow `··· USANDO ADD_TO_ORDER ···` antes do
  // bubble do assistente.
  const [lastToolName, setLastToolName] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef(false);

  // Round 4 §C-NEW-8 — em vez de carregar histórico inteiro como bubbles,
  // /assistente abre num "landing" com greeting da continuation API
  // (mesmo endpoint que a Mesa Home consome). Histórico completo fica em
  // `/chat-history` (rota dedicada). Quando customer envia 1ª mensagem,
  // o greeting vira a 1ª bubble do assistant + vai a user msg + resposta.
  useEffect(() => {
    if (!slug || prefill) return; // prefill: já vai em chat mode
    const load = async () => {
      try {
        const qs = new URLSearchParams({
          tenantId: slug,
          customerId: session.customerId ?? '',
          isReturning: String(session.isReturning ?? false),
          customerName: session.customerName ?? '',
        });
        const res = await apiGet<{
          rendered: string | null;
          chips?: ChipCanon[];
        }>(`/${slug}/continuation?${qs.toString()}`);
        if (res?.rendered) {
          setLandingGreeting(res.rendered);
          if (res.chips && res.chips.length > 0) {
            setSuggestions(res.chips as ChipCanon[]);
          }
        }
      } catch {
        /* ignore — fallback é greeting genérico no render */
      }
    };
    load();
  }, [slug, prefill, session.customerId, session.isReturning, session.customerName]);

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
   * O bubble é apendado on-the-fly (não há fetch de histórico aqui — a
   * página opera ephemeral state, então quem chega depois do staff
   * mandar a msg vai ler o histórico em `/chat-history` separadamente).
   * Dedupe por `id` defende contra reconexão do socket re-emitindo.
   *
   * Trigger de transição landing→chat: se o customer ainda está na
   * landing (`!chatStarted`) e o manager mandar mensagem, faz sentido
   * subir o customer pro chat mode pra ele ver o staff bubble (sem ele
   * o bubble fica escondido atrás do hero/PillButtons).
   */
  useTableSocket(session.sessionId, (event, data) => {
    if (event !== 'assistant.staff_message_received') return;
    const payload = (data ?? {}) as {
      id?: string;
      message?: string;
      fromStaffId?: string;
      fromStaffName?: string | null;
      createdAt?: string;
    };
    if (!payload.id || !payload.message) return;
    const rawName = (payload.fromStaffName ?? '').trim();
    const fullName = rawName.length > 0 ? rawName : 'Gerência';
    const firstName = fullName.split(' ')[0] || 'Gerência';
    const initial = (firstName[0] ?? 'G').toUpperCase();
    setChatStarted(true);
    setMessages((prev) => {
      // Dedupe se reconectarmos e o servidor re-emitir o mesmo payload.
      if (payload.id && prev.some((m) => m.id === `staff-${payload.id}`)) {
        return prev;
      }
      return [
        ...prev,
        {
          id: `staff-${payload.id}`,
          role: 'staff' as const,
          content: payload.message ?? '',
          staffName: firstName,
          staffInitial: initial,
          staffRole: 'Gerente',
          staffCreatedAt: payload.createdAt,
        },
      ];
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
  const dispatchToolCall = async (
    call: AssistantToolCall,
  ): Promise<void> => {
    const name = call.name;
    // 1) Tools the FE owns end-to-end.
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
    if (name === 'view_menu') {
      openMenuOverlay();
      return;
    }

    // 2) Tools whose UX isn't fully designed yet — render a generic "OK"
    //    bubble so the chat doesn't crash, log a warning so devs see the
    //    gap. Per F4 brief.
    const stubbedTools = new Set<string>([
      'search_dish',
      'check_allergens',
      'compare_dishes',
      'view_order',
      'split_bill',
      'pay_individual',
      'pay_full',
      'open_payment_screen',
      'delete_chat',
      'delete_all_chats',
      'view_courtesy',
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
   * Core order placement: adiciona itens ao draft, cria o pedido e leva pro
   * countdown de 15s. Usado tanto pelo botao "Sim, pedir" quanto pelo fluxo
   * por chat ("quero os dois").
   */
  const placeOrderForItems = async (picked: LinkedItem[], sourceMessageId: string) => {
    if (placingOrder || picked.length === 0) return;
    setPlacingOrder(true);

    const mode: 'individual' | 'table' = session.customerId ? 'individual' : 'table';
    picked.forEach((it) => {
      addItem({
        menuItemId: it.id,
        name: it.name,
        priceCents: it.priceCents,
        quantity: 1,
        commandMode: mode,
      });
    });

    try {
      const res = await apiPost<{ id: string }>(`/${slug}/orders`, {
        billingMode: mode,
        visitId: session.visitId || undefined,
        customerId: session.customerId || undefined,
        items: picked.map((it) => ({ menuItemId: it.id, quantity: 1 })),
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === sourceMessageId ? { ...m, orderPlaced: true } : m)),
      );
      push(`/${slug}/pedido/confirmando?orderId=${res.id}`);
    } catch {
      setPlacingOrder(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'ai',
          content: 'Não consegui enviar seu pedido agora. Tente de novo em instantes.',
        },
      ]);
    }
  };

  const sendMessage = async (text: string, options?: { skipUserBubble?: boolean }) => {
    const trimmed = text.trim();
    if (!trimmed) return;

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

    // Se a IA acabou de sugerir pratos e o usuario respondeu com intencao de
    // pedido ("quero os dois", "pode mandar"), pulamos o round-trip pela IA
    // e ja iniciamos o pedido direto — os 15s do /confirmando funcionam como
    // janela de cancelamento.
    const lastAiWithItems = [...messages]
      .reverse()
      .find(
        (m) =>
          m.role === 'ai' &&
          !!m.linkedItems &&
          m.linkedItems.length > 0 &&
          !m.orderPlaced,
      );
    if (lastAiWithItems?.linkedItems) {
      const picked = detectOrderIntent(trimmed, lastAiWithItems.linkedItems);
      if (picked && picked.length > 0) {
        const names = picked
          .map((p, i, arr) =>
            i === 0
              ? p.name
              : i === arr.length - 1
                ? ` e ${p.name}`
                : `, ${p.name}`,
          )
          .join('');
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'ai',
            content: `Perfeito! Já estou pedindo ${names} para você.`,
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
      });

      // V20 canon F04_Chat: ToolCallIndicator + bubble texto + chips
      // ficam INLINE no lado do assistente, junto com a mensagem que os
      // originou. Atachamos a primeira tool dispatchada (se houver) no
      // aiMsg pra que o render mostre o indicador ANTES do bubble texto,
      // dentro do mesmo `<div>` esquerdo. Antes ficava num bloco global
      // no rodapé (`lastToolName`) que quebrava o layout.
      const firstTool = res.toolCalls && res.toolCalls.length > 0 ? res.toolCalls[0] : null;
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: res.wasBlocked ? 'blocked' : 'ai',
        content: res.response,
        linkedItems: res.linkedItems && res.linkedItems.length > 0 ? res.linkedItems : undefined,
        selectedIds: [],
        toolCall: firstTool
          ? { name: firstTool.name, category: categorizeToolName(firstTool.name) }
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
      if (res.toolCalls && res.toolCalls.length > 0) {
        setLastToolName(res.toolCalls[0].name);
      } else {
        setLastToolName(null);
      }

      // Dispatch FE-side tool calls (overlay opens, screen navigations, etc.).
      // Fired AFTER the bubble is in the DOM so the order in the transcript
      // is `bubble → tool effect`. Errors are caught per-call inside dispatch
      // — one failing tool doesn't poison the whole turn.
      if (res.toolCalls && res.toolCalls.length > 0) {
        for (const tc of res.toolCalls) {
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
      const isTimeout =
        err instanceof Error && err.message === 'TIMEOUT';
      const isValidationError =
        err instanceof Error && /400/.test(err.message);
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
    if (placingOrder) return;
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
            content:
              'Não consegui registrar a solicitação agora. Tente de novo em instantes.',
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
      <div className="flex flex-1 flex-col">
        <div className="gpu-layer flex flex-1 flex-col gap-3.5 overflow-auto px-[22px] pb-4 pt-3">
          {/* Round 4 §C-NEW-8: landing view (idle) · 2 PillButtons grandes
              acima do greeting do LLM, alinhado ao layout da Mesa Home.
              Ao 1º send do customer, chatStarted vira true e essa view
              é substituída pelos bubbles de chat (que pre-pendam o
              greeting como 1º AI message). */}
          {!chatStarted && (
            <div
              data-testid="assistente-landing"
              className="flex flex-1 flex-col justify-center gap-7"
            >
              <div className="flex flex-col items-center gap-3">
                <PillButton onClick={openCallWaiterSheet}>
                  Chamar garçom
                </PillButton>
                <PillButton onClick={() => push(`/${slug}/cardapio`)}>
                  Ver cardápio
                </PillButton>
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
                  <ToolCallIndicator
                    name={msg.toolCall.name}
                    category={msg.toolCall.category}
                  />
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
                  <span style={{ textWrap: 'pretty' as never }}>
                    {msg.content}
                  </span>
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
                    <ToolCallIndicator
                      name={msg.toolCall.name}
                      category={msg.toolCall.category}
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
                              <img
                                src={it.imageUrl}
                                alt={it.name}
                                className="h-full w-full object-cover"
                                loading="lazy"
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
                                isSel
                                  ? 'border-ink bg-ink text-white'
                                  : 'border-ink bg-bg text-ink'
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
                        disabled={placingOrder}
                        className="flex-1 rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
                      >
                        {placingOrder ? 'Enviando…' : 'Sim, pedir'}
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
            {suggestions.map((chip) => (
              <SuggestionChip
                key={chip.id}
                chip={chip}
                disabled={loading || chipBusy}
                onTap={async (c) => {
                  if (chipBusy) return;
                  setChipBusy(true);
                  try {
                    const txt = chipText(c as ChipCanon);
                    if (c.action === 'navigate') {
                      const dest = txt.startsWith('/') ? txt : `/${slug}/${txt}`;
                      router.push(dest);
                    } else if (c.action === 'expand') {
                      // 'expand' cai no fallback `send` — sem primitivo
                      // dedicado, o payload do chip vira mensagem direta.
                      await sendMessage(txt);
                    } else {
                      // 'send' default
                      await sendMessage(txt);
                    }
                  } finally {
                    setTimeout(() => setChipBusy(false), 800);
                  }
                }}
              />
            ))}
          </div>
        </div>

        <div className="keyboard-anchor shrink-0 px-[22px] pt-2">
          <SoftInput
            maxLength={2000}
            // Round 3 Cat 4 (V20): placeholder muda contextualmente
            // quando uma tool acabou de rodar — sinaliza que o próximo
            // input vai pra mesa (host/staff) e não mais pra IA conversar.
            placeholder={
              lastToolName === 'send_complaint' ||
              lastToolName === 'send_message_to_manager'
                ? 'Mensagem para a casa'
                : 'Pergunte alguma coisa...'
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
