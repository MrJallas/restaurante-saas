import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { AiServiceClient, type AiToolCall } from '../../infra/ai/ai-service.client';
import { RedisService } from '../../infra/redis/redis.service';
import { ChatHistoryService } from '../chat-history/chat-history.service';
import { CustomerStaffMessagesService } from '../customer-staff-messages/customer-staff-messages.service';
import { LgpdService } from '../lgpd/lgpd.service';
import { EventsGateway } from '../websocket/events.gateway';

const BLOCKED_RESPONSE =
  'Desculpe, só posso ajudar com assuntos do restaurante: cardápio, pratos, bebidas, recomendações e informações sobre o estabelecimento.';

const GREETING_RESPONSES = [
  'Olá! Que bom ter você aqui! Posso te ajudar a escolher algo do nosso cardápio?',
  'Oi! Bem-vindo! Quer ver nossas sugestões ou prefere explorar o cardápio?',
  'Olá! Estou aqui pra te ajudar. Quer uma recomendação ou tem algo em mente?',
];

const SUGGESTION_CHIPS = [
  'Qual o prato do dia?',
  'Recomende uma bebida',
  'Quais sobremesas tem?',
  'Opções sem glúten',
  'Mais pedidos do restaurante',
];

const FALLBACK_RESPONSE =
  'Desculpe, estou com dificuldade no momento. Posso ajudar em breve.';

const MAX_MESSAGES_PER_SESSION = 50;

interface MenuItemRow {
  id: string;
  name: string;
  short_description: string | null;
  price_cents: number;
  image_url: string | null;
  category_name: string;
  tags: string[];
  allergens: string[];
}

export interface LinkedItem {
  id: string;
  name: string;
  priceCents: number;
  imageUrl: string | null;
  categoryName: string;
  position: number;
}

type AssistantHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type PendingJoinRequestInput = {
  targetCustomerId: string;
  joinerName?: string;
  requestedAt?: string;
  tableSessionId?: string;
};

type PendingJoinRequestContext = {
  targetCustomerId: string;
  joinerName: string;
  requestedAt: string | null;
};

type AssistantPublicHistoryMessage =
  | {
      id: string;
      role: 'user';
      content: string;
      createdAt: string;
    }
  | {
      id: string;
      role: 'assistant';
      content: string;
      toolCalls?: AiToolCall[] | null;
      createdAt: string;
    }
  | {
      id: string;
      role: 'staff';
      content: string;
      staffId: string | null;
      staffName: string | null;
      staffRole: string | null;
      createdAt: string;
    };

const UUID_TEXT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidText(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_TEXT_PATTERN.test(value);
}

function cleanText(value: string | null | undefined): string | null {
  const text = value?.trim() ?? '';
  return text.length > 0 ? text : null;
}

function toIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

function staffRoleLabel(role: string | null | undefined): string | null {
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
      return cleanText(role) ?? null;
  }
}

/**
 * Normalise the AI service's tool_calls into the flat shape FE consumers
 * expect (`{ name, arguments, result, silent, router, routerTarget,
 * actionPayload, chips }`). Upstream returns the raw OpenAI shape with the
 * tool name nested under `function.name` — flattening here keeps the chat
 * page (`AssistantToolCall`) and the chat-history rehydrate path consistent.
 *
 * Returns empty array when the AI service returned no tools (so the FE's
 * `res.toolCalls && res.toolCalls.length > 0` guard short-circuits cleanly).
 *
 * K-1 fix (round 3): hoist `result.chips` ao top-level. Antes ficava
 * dentro de `tc.result.chips` e o FE só lia `res.suggestions` — chips
 * canônicos das tools nunca apareciam no chat.
 */
function normalizeToolCalls(
  raw: AiToolCall[] | undefined,
  menuItems: MenuItemRow[] = [],
): Array<Record<string, unknown>> {
  if (!raw || raw.length === 0) return [];
  return raw.map((tc) => {
    const fn = (tc as { function?: { name?: string; arguments?: unknown } })
      .function;
    const flatName =
      typeof tc.name === 'string' && tc.name.length > 0
        ? tc.name
        : (fn?.name ?? '');
    const flatArgs = (tc.args ?? fn?.arguments ?? {}) as Record<string, unknown>;
    const result = (tc.result ?? null) as Record<string, unknown> | null;
    const chips = Array.isArray(result?.chips) ? (result!.chips as unknown[]) : [];
    const actionPayload = enrichToolActionPayload(
      flatName,
      flatArgs,
      (result?.actionPayload ?? null) as Record<string, unknown> | null,
      menuItems,
    );
    return {
      ...tc,
      name: flatName,
      arguments: flatArgs,
      result,
      // Hoist the most useful FE-side discriminators to top-level so the FE
      // doesn't have to dig into `tc.result` for the silent/router flags.
      silent:
        result && typeof result.silent === 'boolean' ? result.silent : undefined,
      routerTarget:
        result && typeof result.routerTarget === 'string'
          ? result.routerTarget
          : undefined,
      actionPayload,
      chips,
    };
  });
}

function enrichToolActionPayload(
  toolName: string,
  args: Record<string, unknown>,
  payload: Record<string, unknown> | null,
  menuItems: MenuItemRow[],
): Record<string, unknown> | null {
  if (toolName !== 'add_to_order') return payload;
  const itemId =
    typeof payload?.itemId === 'string'
      ? payload.itemId
      : typeof args.itemId === 'string'
        ? args.itemId
        : typeof args.menuItemId === 'string'
          ? args.menuItemId
          : null;
  if (!itemId) return payload;

  const item = menuItems.find((it) => it.id === itemId);
  if (!item) return payload;

  return {
    ...(payload ?? {}),
    itemId,
    name: item.name,
    priceCents: item.price_cents,
    imageUrl: item.image_url,
    categoryName: item.category_name,
  };
}

/**
 * Aggregate `chips` arrays from each dispatched tool into a single flat
 * list. First non-empty wins (most specific); duplicate ids dropped. When
 * NO tool emitted chips, returns `null` so the caller can fall back to the
 * static SUGGESTION_CHIPS — keeps the chat from rendering empty bottom row.
 */
function aggregateChipsFromTools(
  toolCalls: Array<Record<string, unknown>>,
): unknown[] | null {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const tc of toolCalls) {
    const chips = Array.isArray(tc.chips) ? (tc.chips as Array<Record<string, unknown>>) : [];
    for (const c of chips) {
      const id = typeof c.id === 'string' ? c.id : JSON.stringify(c);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(c);
    }
  }
  return out.length > 0 ? out : null;
}

function chipsForAddToOrder(): Array<Record<string, unknown>> {
  return [
    { id: 'view_order', label: 'Ver pedido', action: 'send', payload: 'ver meu pedido' },
    { id: 'add_more', label: 'Pedir mais', action: 'send', payload: 'quero pedir mais alguma coisa' },
    { id: 'request_check', label: 'Pedir conta', action: 'send', payload: 'quero pagar a conta' },
  ];
}

function isDirectWaterOrder(message: string): boolean {
  const text = normalizeForMatch(message);
  if (!/\bagua\b/.test(text)) return false;
  return /\b(quero|queria|vou querer|me traz|traz|pede|pedir|adiciona|adicionar|coloca|manda|inclui)\b/.test(text);
}

function waterMenuItem(menuItems: MenuItemRow[]): MenuItemRow | null {
  return (
    menuItems.find((item) => {
      const haystack = normalizeForMatch(`${item.name} ${item.category_name} ${(item.tags ?? []).join(' ')}`);
      return /\bagua\b/.test(haystack);
    }) ?? null
  );
}

function rescueDirectWaterOrderTool(
  message: string,
  toolCalls: Array<Record<string, unknown>>,
  menuItems: MenuItemRow[],
): Array<Record<string, unknown>> {
  if (!isDirectWaterOrder(message)) return toolCalls;
  if (toolCalls.some((tc) => tc.name === 'add_to_order')) return toolCalls;

  const item = waterMenuItem(menuItems);
  if (!item) return toolCalls;

  const chips = chipsForAddToOrder();
  const actionPayload = {
    orderUpdated: true,
    cartUpdated: true,
    itemId: item.id,
    quantity: 1,
    name: item.name,
    priceCents: item.price_cents,
    imageUrl: item.image_url,
    categoryName: item.category_name,
  };
  const addToOrderCall = {
    name: 'add_to_order',
    arguments: { itemId: item.id, quantity: 1 },
    result: {
      message: 'Escolha a comanda para adicionar a água ao pedido.',
      chips,
      actionPayload,
    },
    actionPayload,
    chips,
  };

  return [
    ...toolCalls.filter(
      (tc) => !['call_waiter', 'view_menu', 'recommend_dish'].includes(String(tc.name)),
    ),
    addToOrderCall,
  ];
}

function isPaymentIntent(message: string): boolean {
  const text = normalizeForMatch(message);
  if (!text) return false;
  return (
    /\b(quero|queria|vamos|vou)\s+pagar\b/.test(text) ||
    /\b(pagar|pagamento|fechar|finalizar|pedir|trazer|traz|manda)\b.*\b(conta|comanda)\b/.test(text) ||
    /\b(conta|comanda)\b.*\b(pagar|pagamento|fechar|finalizar|pedir|trazer|traz|manda)\b/.test(text)
  );
}

function isViewOrderIntent(message: string): boolean {
  const text = normalizeForMatch(message);
  if (!text) return false;
  return (
    /\b(ver|ve|olhar|mostrar|consultar|acompanhar)\b.*\b(meu|minha|o|a|esse|este)?\s*(pedido|comanda|carrinho)\b/.test(text) ||
    /\b(pedido|comanda|carrinho)\b.*\b(ver|ve|olhar|mostrar|consultar|acompanhar)\b/.test(text) ||
    /\b(quanto tempo|demora|vai demorar|cade|status|andamento|previsao|quando)\b.*\b(pedido|comida|prato|cozinha)\b/.test(text) ||
    /\b(pedido|comida|prato|cozinha)\b.*\b(quanto tempo|demora|vai demorar|cade|status|andamento|previsao|quando)\b/.test(text)
  );
}

function rescueViewOrderTool(
  message: string,
  toolCalls: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  if (!isViewOrderIntent(message)) return toolCalls;
  if (toolCalls.some((tc) => tc.name === 'view_order')) {
    return toolCalls.filter((tc) => !['call_waiter', 'view_menu'].includes(String(tc.name)));
  }
  return [
    ...toolCalls.filter((tc) => !['call_waiter', 'view_menu'].includes(String(tc.name))),
    {
      name: 'view_order',
      arguments: {},
      result: {
        message: 'Claro, vou mostrar seu pedido.',
        chips: [
          { id: 'add_more', label: 'Pedir mais', action: 'send', payload: 'quero pedir mais alguma coisa' },
          { id: 'request_check', label: 'Pedir conta', action: 'send', payload: 'quero pagar a conta' },
        ],
        actionPayload: { tool: 'view_order' },
        routerTarget: 'ScreenCustomerOrder',
      },
      actionPayload: { tool: 'view_order' },
      chips: [
        { id: 'add_more', label: 'Pedir mais', action: 'send', payload: 'quero pedir mais alguma coisa' },
        { id: 'request_check', label: 'Pedir conta', action: 'send', payload: 'quero pagar a conta' },
      ],
      routerTarget: 'ScreenCustomerOrder',
    },
  ];
}

function paymentToolNameForMessage(message: string): string {
  const text = normalizeForMatch(message);
  if (/\b(dividir|rachar|separar)\b.*\b(conta|comanda)\b|\b(conta|comanda)\b.*\b(dividir|rachar|separar)\b/.test(text)) {
    return 'split_bill';
  }
  if (/\b(minha parte|minha comanda|so a minha|individual)\b/.test(text)) {
    return 'pay_individual';
  }
  if (/\b(pagar tudo|conta toda|comanda toda|mesa toda)\b/.test(text)) {
    return 'pay_full';
  }
  return 'open_payment_screen';
}

function paymentToolResult(toolName: string): Record<string, unknown> {
  if (toolName === 'split_bill') {
    return {
      message: 'Te levo pra tela de dividir a conta.',
      chips: [
        { id: 'pay_mine', label: 'Pagar minha parte', action: 'send', payload: 'quero pagar só a minha parte' },
        { id: 'pay_full', label: 'Pagar tudo', action: 'send', payload: 'quero pagar a conta toda' },
      ],
      actionPayload: { tool: 'split_bill' },
      routerTarget: 'ScreenCustomerSplitBill',
    };
  }
  if (toolName === 'pay_individual') {
    return {
      message: 'Abro a tela pra você pagar só a sua parte.',
      chips: [
        { id: 'pay_pix', label: 'Pagar com PIX', action: 'send', payload: 'quero pagar minha parte com pix' },
        { id: 'pay_full', label: 'Pagar tudo', action: 'send', payload: 'quero pagar a conta toda' },
      ],
      actionPayload: { tool: 'pay_individual' },
      routerTarget: 'ScreenCustomerPayIndividual',
    };
  }
  if (toolName === 'pay_full') {
    return {
      message: 'Abro a tela pra você pagar a conta toda da mesa.',
      chips: [
        { id: 'pay_pix', label: 'Pagar com PIX', action: 'send', payload: 'quero pagar com pix' },
        { id: 'split', label: 'Dividir conta', action: 'send', payload: 'quero dividir a conta' },
      ],
      actionPayload: { tool: 'pay_full' },
      routerTarget: 'ScreenCustomerPayFull',
    };
  }
  return {
    message: 'Abro a tela de pagamento pra você.',
    chips: [
      { id: 'pay_full', label: 'Pagar tudo', action: 'send', payload: 'quero pagar a conta toda' },
      { id: 'pay_individual', label: 'Pagar minha parte', action: 'send', payload: 'quero pagar só a minha parte' },
      { id: 'split', label: 'Dividir conta', action: 'send', payload: 'quero dividir a conta' },
    ],
    actionPayload: { tool: 'open_payment_screen' },
    routerTarget: 'ScreenCustomerPayment',
  };
}

function rescuePaymentTool(
  message: string,
  toolCalls: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  if (!isPaymentIntent(message)) return toolCalls;
  const paymentTools = new Set(['open_payment_screen', 'pay_full', 'pay_individual', 'split_bill']);
  if (toolCalls.some((tc) => paymentTools.has(String(tc.name)))) {
    return toolCalls.filter((tc) => !['call_waiter', 'request_check'].includes(String(tc.name)));
  }

  const toolName = paymentToolNameForMessage(message);
  const result = paymentToolResult(toolName);
  const actionPayload = result.actionPayload as Record<string, unknown>;
  const chips = result.chips as Array<Record<string, unknown>>;
  return [
    ...toolCalls.filter((tc) => !['call_waiter', 'request_check', 'view_menu'].includes(String(tc.name))),
    {
      name: toolName,
      arguments: {},
      result,
      actionPayload,
      chips,
      routerTarget: result.routerTarget,
    },
  ];
}

function isGlutenFreeRecommendationIntent(message: string): boolean {
  const text = normalizeForMatch(message);
  return /\bsem gluten\b/.test(text) && /\b(opcoes|opcao|prato|pratos|recomenda|recomendar|indica|indicar|tem|quais|alguma)\b/.test(text);
}

function rescueDietaryRecommendationTool(
  message: string,
  toolCalls: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  if (!isGlutenFreeRecommendationIntent(message)) return toolCalls;
  const withoutGenericMenu = toolCalls.filter(
    (tc) => !['view_menu', 'search_dish', 'check_allergens'].includes(String(tc.name)),
  );
  const idx = withoutGenericMenu.findIndex((tc) => tc.name === 'recommend_dish');
  if (idx >= 0) {
    const next = [...withoutGenericMenu];
    const current = next[idx];
    next[idx] = {
      ...current,
      arguments: {
        ...((current.arguments ?? {}) as Record<string, unknown>),
        dietary: 'gluten_free',
      },
      actionPayload: {
        ...((current.actionPayload ?? {}) as Record<string, unknown>),
        dietary: 'gluten_free',
      },
    };
    return next;
  }
  return [
    ...withoutGenericMenu,
    {
      name: 'recommend_dish',
      arguments: { dietary: 'gluten_free' },
      result: {
        message: 'Vou separar opções sem glúten pra você.',
        chips: [],
        actionPayload: { dietary: 'gluten_free' },
      },
      actionPayload: { dietary: 'gluten_free' },
      chips: [],
    },
  ];
}

function responseWithToolContext(
  response: string,
  toolCalls: Array<Record<string, unknown>>,
): string {
  if (!response.trim()) {
    const failedTool = toolCalls.find((tc) => {
      const result = (tc.result ?? {}) as Record<string, unknown>;
      return result.error && typeof result.error === 'object';
    });
    if (failedTool) {
      return 'Não consegui consultar essa informação agora. Quer tentar de novo ou chamar um garçom?';
    }
  }

  const addToOrder = toolCalls.find((tc) => tc.name === 'add_to_order');
  const payload = addToOrder?.actionPayload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return response;
  }
  const itemName = (payload as Record<string, unknown>).name;
  if (typeof itemName !== 'string' || itemName.trim().length === 0) {
    return response;
  }
  const quantityRaw = (payload as Record<string, unknown>).quantity;
  const quantity = typeof quantityRaw === 'number' && quantityRaw > 0 ? Math.floor(quantityRaw) : 1;
  return `Escolha a comanda para eu adicionar ${quantity}x ${itemName.trim()} ao pedido.`;
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Scan the AI response for dish names from the menu and return the items in
 * order of first mention. Uses accent-insensitive substring matching on the
 * normalized name. Dedupes by item id. Skips ultra-generic names that would
 * false-positive (e.g. a 3-letter item like "sal").
 */
function extractLinkedItems(
  responseText: string,
  menuItems: MenuItemRow[],
  toolCalls: Array<Record<string, unknown>> = [],
): LinkedItem[] {
  const haystack = normalizeForMatch(responseText);

  const seen = new Set<string>();
  const found: LinkedItem[] = [];
  const byId = new Map(menuItems.map((item) => [item.id, item]));

  const pushItem = (item: MenuItemRow, position: number) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    found.push({
      id: item.id,
      name: item.name,
      priceCents: item.price_cents,
      imageUrl: item.image_url,
      categoryName: item.category_name,
      position,
    });
  };

  const candidateIds: string[] = [];
  for (const tc of toolCalls) {
    const args = (tc.arguments ?? {}) as Record<string, unknown>;
    const result = (tc.result ?? {}) as Record<string, unknown>;
    const actionPayload = (tc.actionPayload ??
      result.actionPayload ??
      {}) as Record<string, unknown>;
    for (const val of [
      args.itemId,
      args.item_id,
      args.menuItemId,
      actionPayload.itemId,
      actionPayload.menuItemId,
    ]) {
      if (typeof val === 'string' && val.length > 0) candidateIds.push(val);
    }
  }

  candidateIds.forEach((id, index) => {
    const item = byId.get(id);
    if (item) pushItem(item, -1000 + index);
  });

  if (!haystack) {
    found.sort((a, b) => a.position - b.position);
    return found.slice(0, 4);
  }

  for (const item of menuItems) {
    const needle = normalizeForMatch(item.name);
    if (needle.length < 4) continue; // too generic to trust a substring hit
    const pos = haystack.indexOf(needle);
    if (pos === -1) continue;
    pushItem(item, pos);
  }

  found.sort((a, b) => a.position - b.position);
  return found.slice(0, 4); // cap to avoid overwhelming the UI
}

function inferRecommendationCategory(
  message: string,
  toolCall: Record<string, unknown>,
): string | null {
  const args = (toolCall.arguments ?? {}) as Record<string, unknown>;
  const payload = (toolCall.actionPayload ?? {}) as Record<string, unknown>;
  const raw =
    typeof args.category === 'string'
      ? args.category
      : typeof payload.category === 'string'
        ? payload.category
        : message;
  const text = normalizeForMatch(raw);
  if (!text) return null;
  if (/\b(bebida|bebidas|drink|drinks|vinho|suco|cerveja)\b/.test(text)) return 'bebida';
  if (/\b(sobremesa|sobremesas|doce|doces)\b/.test(text)) return 'sobremesa';
  if (/\b(entrada|entradas|aperitivo|aperitivos)\b/.test(text)) return 'entrada';
  if (/\b(principal|prato|pratos|refeicao|refeicao)\b/.test(text)) return 'principal';
  return null;
}

function inferRecommendationDietary(
  message: string,
  toolCall: Record<string, unknown>,
): 'gluten_free' | null {
  const args = (toolCall.arguments ?? {}) as Record<string, unknown>;
  const payload = (toolCall.actionPayload ?? {}) as Record<string, unknown>;
  const raw =
    typeof args.dietary === 'string'
      ? args.dietary
      : typeof payload.dietary === 'string'
        ? payload.dietary
        : message;
  const text = normalizeForMatch(raw);
  if (/\b(gluten_free|sem gluten|gluten)\b/.test(text)) return 'gluten_free';
  return null;
}

function menuItemMatchesRecommendationCategory(
  item: MenuItemRow,
  category: string | null,
): boolean {
  if (!category) return true;
  const haystack = normalizeForMatch(`${item.category_name} ${item.name} ${(item.tags ?? []).join(' ')}`);
  if (category === 'bebida') return /\b(bebida|bebidas|drink|drinks|vinho|suco|cerveja|agua)\b/.test(haystack);
  if (category === 'sobremesa') return /\b(sobremesa|sobremesas|doce|doces)\b/.test(haystack);
  if (category === 'entrada') return /\b(entrada|entradas|aperitivo|aperitivos)\b/.test(haystack);
  if (category === 'principal') return /\b(principal|principais|prato|pratos|refeicao|refeicoes)\b/.test(haystack);
  return true;
}

function menuItemMatchesDietary(
  item: MenuItemRow,
  dietary: 'gluten_free' | null,
): boolean {
  if (!dietary) return true;
  const allergens = normalizeForMatch((item.allergens ?? []).join(' '));
  if (dietary === 'gluten_free') return !/\bgluten\b/.test(allergens);
  return true;
}

function isDrinkItem(item: MenuItemRow): boolean {
  const haystack = normalizeForMatch(`${item.category_name} ${item.name} ${(item.tags ?? []).join(' ')}`);
  return /\b(bebida|bebidas|drink|drinks|vinho|suco|cerveja|agua|refrigerante|caipirinha)\b/.test(haystack);
}

function formatCents(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recommendationMessageForItems(
  items: MenuItemRow[],
  context: { dietary?: 'gluten_free' | null } = {},
): string {
  const lines = items.map(
    (item) => `- ${item.name} — ${formatCents(item.price_cents)}`,
  );
  if (context.dietary === 'gluten_free') {
    return `Encontrei estas opções sem glúten declarado:\n${lines.join('\n')}`;
  }
  return `Eu iria nessas opções hoje:\n${lines.join('\n')}`;
}

function enrichRecommendationToolCalls(
  message: string,
  response: string,
  toolCalls: Array<Record<string, unknown>>,
  menuItems: MenuItemRow[],
): { response: string; toolCalls: Array<Record<string, unknown>> } {
  const idx = toolCalls.findIndex((tc) => tc.name === 'recommend_dish');
  if (idx === -1 || menuItems.length === 0) {
    return { response, toolCalls };
  }

  const alreadySpecific = extractLinkedItems(response, menuItems, toolCalls).length > 0;
  if (alreadySpecific) {
    return { response, toolCalls };
  }

  const category = inferRecommendationCategory(message, toolCalls[idx]);
  const dietary = inferRecommendationDietary(message, toolCalls[idx]);
  const candidates = menuItems.filter(
    (item) =>
      menuItemMatchesRecommendationCategory(item, category) &&
      menuItemMatchesDietary(item, dietary),
  );
  const preferredCandidates =
    dietary && !category
      ? candidates.filter((item) => !isDrinkItem(item))
      : candidates;
  const pickedSource = preferredCandidates.length >= 3 ? preferredCandidates : candidates;
  const picked = pickedSource.slice(0, 3);
  const items = picked.length > 0 ? picked : menuItems.slice(0, 3);
  if (items.length === 0) {
    return { response, toolCalls };
  }

  const recommendationResponse = recommendationMessageForItems(items, { dietary });
  const chips = items.map((item) => ({
    id: `recommend-${item.id}`,
    label: item.name,
    action: 'send',
    payload: `quero o ${item.name}`,
    primary: false,
  }));
  const nextCalls = [...toolCalls];
  const current = nextCalls[idx];
  const result = ((current.result ?? {}) as Record<string, unknown>) || {};
  const resultPayload = isPlainRecord(result.actionPayload) ? result.actionPayload : {};
  const currentPayload = isPlainRecord(current.actionPayload) ? current.actionPayload : {};
  nextCalls[idx] = {
    ...current,
    result: {
      ...result,
      message: recommendationResponse,
      chips,
      actionPayload: {
        ...resultPayload,
        category,
        dietary,
        count: items.length,
      },
    },
    actionPayload: {
      ...currentPayload,
      category,
      dietary,
      count: items.length,
    },
    chips,
  };

  return { response: recommendationResponse, toolCalls: nextCalls };
}

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly aiClient: AiServiceClient,
    private readonly redis: RedisService,
    // Optional pra que o module fique resiliente a Mongo offline em dev:
    // se ChatHistoryService não conseguir injetar, AssistantService continua
    // funcionando (Postgres é fonte de verdade).
    @Optional() private readonly chatHistory?: ChatHistoryService,
    // Mesmo padrão soft-fail do chatHistory: o realtime path
    // (Postgres + WS) continua funcionando se o Mongo estiver fora.
    // Este serviço grava em paralelo a inbox persistente do customer
    // ("Mensagens com a equipe").
    @Optional()
    private readonly customerStaffMessages?: CustomerStaffMessagesService,
    @Optional() private readonly lgpdService?: LgpdService,
    @Optional() private readonly events?: EventsGateway,
  ) {}

  private async getScopedHistory(
    tableSessionId: string,
    customerId: string | null,
    tenantId: string,
    conversationId?: string | null,
    continueThreadId?: string | null,
  ): Promise<AssistantHistoryMessage[]> {
    const scopedRequested = !!continueThreadId?.trim() || !!conversationId?.trim();
    if (scopedRequested && (!customerId || !this.chatHistory)) {
      return [];
    }

    if (customerId && this.chatHistory) {
      const threadId =
        continueThreadId?.trim() ||
        (conversationId?.trim()
          ? `${tenantId}:${customerId}:${conversationId.trim()}`
          : null);

      if (threadId) {
        try {
          const messages = await this.chatHistory.listMessagesForCustomer(
            threadId,
            customerId,
          );
          return messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .slice(-10)
            .map((m) => ({
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.content,
            }));
        } catch {
          // Conversa nova ainda não tem documento Mongo; isso deve começar
          // com contexto vazio. Não voltamos ao histórico da mesa para não
          // vazar contexto de outro chat ativo/arquivado.
          return [];
        }
      }
    }

    return this.getHistory(tableSessionId, customerId);
  }

  private async resolvePendingJoinRequest(
    tableSessionId: string,
    hostCustomerId: string | null,
    input?: PendingJoinRequestInput | null,
  ): Promise<PendingJoinRequestContext | null> {
    if (!hostCustomerId || !input?.targetCustomerId) return null;
    if (input.tableSessionId && input.tableSessionId !== tableSessionId) return null;

    const rows = (await this.tenantConn.query(
      `SELECT sp.customer_id,
              sp.joined_at,
              c.name,
              ts.host_customer_id
         FROM session_participants sp
         JOIN table_sessions ts ON ts.id = sp.table_session_id
         JOIN customers c ON c.id = sp.customer_id
        WHERE sp.table_session_id = $1
          AND sp.customer_id = $2
          AND sp.status = 'pending'
          AND sp.left_at IS NULL
        LIMIT 1`,
      [tableSessionId, input.targetCustomerId],
    )) as {
      customer_id: string;
      joined_at: string | Date | null;
      name: string | null;
      host_customer_id: string | null;
    }[];

    const row = rows[0];
    if (!row || row.host_customer_id !== hostCustomerId) return null;

    return {
      targetCustomerId: row.customer_id,
      joinerName: cleanText(row.name) ?? cleanText(input.joinerName) ?? 'Cliente',
      requestedAt: row.joined_at ? toIso(row.joined_at) : cleanText(input.requestedAt),
    };
  }

  async sendMessage(
    tableSessionId: string,
    customerId: string | null,
    message: string,
    // Tenant connection is resolved via `TenantConnectionProvider` and the
    // request middleware that sets `search_path`; the explicit schema arg
    // is kept on the public signature so the controller and any future
    // direct callers don't have to change. Marked unused to satisfy lint.
    _schemaName: string,
    conversationId?: string | null,
    continueThreadId?: string | null,
    tenantSlug?: string | null,
    pendingJoinRequest?: PendingJoinRequestInput | null,
  ) {
    // IDOR guard: cliente nao pode passar `customerId` de outro cliente
    // pra extrair contexto de consumo / historico alheio. Validamos que
    // o customerId pertence aos session_participants da sessao atual
    // antes de usar — se nao bater, ignoramos (cai no flow anonimo
    // dentro da propria sessao).
    let safeCustomerId: string | null = null;
    if (customerId) {
      const participants = (await this.tenantConn.query(
        `SELECT 1 FROM session_participants
         WHERE table_session_id = $1 AND customer_id = $2 LIMIT 1`,
        [tableSessionId, customerId],
      )) as unknown[];
      if (participants.length > 0) {
        safeCustomerId = customerId;
      }
    }

    // Rate limit check
    const rateKey = `assistant:rate:${tableSessionId}`;
    const count = await this.redis.incr(rateKey);
    if (count === 1) {
      await this.redis.expire(rateKey, 14400); // 4h TTL
    }
    if (count > MAX_MESSAGES_PER_SESSION) {
      return {
        response: 'Voce atingiu o limite de mensagens para esta sessao.',
        wasBlocked: true,
        blockReason: 'rate_limit',
        suggestions: SUGGESTION_CHIPS,
      };
    }

    // Step 1: Classify message (com historico pra desambiguar follow-ups).
    // Passa customerId pra que o classifier so veja a propria conversa do
    // usuario — sem isso, follow-ups de outro cliente da mesma mesa
    // poluiam o contexto e davam falsos positivos. P1-B do bug-hunt.
    const recentHistory = await this.getScopedHistory(
      tableSessionId,
      safeCustomerId,
      _schemaName,
      conversationId,
      continueThreadId,
    );
    const classification = await this.aiClient.classify(
      message,
      recentHistory.slice(-4),
    );

    if (classification.reason === 'greeting') {
      const greeting =
        GREETING_RESPONSES[Math.floor(Math.random() * GREETING_RESPONSES.length)];
      await this.saveMessage(tableSessionId, safeCustomerId, message, greeting, {
        tokensIn: 0,
        tokensOut: 0,
      });
      if (safeCustomerId && this.chatHistory) {
        await this.chatHistory.appendTurn({
          tenantId: _schemaName,
          customerId: safeCustomerId,
          sessionId: tableSessionId,
          conversationId,
          continueThreadId,
          userMessage: message,
          assistantResponse: greeting,
          suggestionChips: SUGGESTION_CHIPS.slice(0, 3),
          linkedItems: [],
        });
      }
      return {
        response: greeting,
        wasBlocked: false,
        suggestions: SUGGESTION_CHIPS.slice(0, 3),
        linkedItems: [],
      };
    }

    if (!classification.allowed) {
      // Save blocked message
      await this.saveMessage(tableSessionId, safeCustomerId, message, BLOCKED_RESPONSE, {
        wasBlocked: true,
        blockReason: classification.reason || 'classifier',
      });
      if (safeCustomerId && this.chatHistory) {
        await this.chatHistory.appendTurn({
          tenantId: _schemaName,
          customerId: safeCustomerId,
          sessionId: tableSessionId,
          conversationId,
          continueThreadId,
          userMessage: message,
          assistantResponse: BLOCKED_RESPONSE,
          suggestionChips: SUGGESTION_CHIPS,
          linkedItems: [],
        });
      }

      return {
        response: BLOCKED_RESPONSE,
        wasBlocked: true,
        blockReason: classification.reason,
        suggestions: SUGGESTION_CHIPS,
      };
    }

    // Step 2: Build context
    const { context: tenantContext, menuItems } = await this.buildTenantContext();
    const customerContext = safeCustomerId
      ? await this.buildCustomerContext(safeCustomerId, tableSessionId)
      : undefined;
    const pendingJoinContext = await this.resolvePendingJoinRequest(
      tableSessionId,
      safeCustomerId,
      pendingJoinRequest,
    );
    if (customerContext && pendingJoinContext) {
      customerContext.pending_join_request = pendingJoinContext;
    }
    const history = recentHistory;

    // Step 3: Call AI
    try {
      const result = await this.aiClient.chat(
        message,
        history,
        tenantContext,
        customerContext,
        {
          tenantId: tenantSlug || _schemaName,
          customerId: safeCustomerId,
          sessionId: tableSessionId,
        },
      );

      const normalizedToolsRaw = rescueDietaryRecommendationTool(
        message,
        rescueViewOrderTool(
          message,
          rescuePaymentTool(
            message,
            rescueDirectWaterOrderTool(
              message,
              normalizeToolCalls(result.tool_calls, menuItems),
              menuItems,
            ),
          ),
        ),
      );
      const recommendationContext = enrichRecommendationToolCalls(
        message,
        result.response,
        normalizedToolsRaw,
        menuItems,
      );
      const normalizedTools = recommendationContext.toolCalls;
      const assistantResponse = responseWithToolContext(
        recommendationContext.response,
        normalizedTools,
      );
      const persistedToolCalls =
        normalizedTools.length > 0 ? (normalizedTools as AiToolCall[]) : result.tool_calls ?? null;
      // K-1 fix: prefer chips canônicos das tools sobre SUGGESTION_CHIPS estático.
      // Quando nenhuma tool emitiu chips (ex: turno 100% texto), caímos
      // pro trio default — assim o cliente nunca vê uma row de chips vazia.
      const toolChips = aggregateChipsFromTools(normalizedTools);
      const fallbackChips: string[] = SUGGESTION_CHIPS.slice(0, 3);
      // Persistir os chips canônicos em `assistant_messages.contextual_chips`
      // (jsonb, migration 030). Se a tool não retornou nada, persistimos
      // null pra que o GIN index parcial fique enxuto.
      await this.saveMessage(tableSessionId, safeCustomerId, message, assistantResponse, {
        tokensIn: result.tokens_in,
        tokensOut: result.tokens_out,
        modelUsed: result.model,
        providerUsed: result.provider,
        estimatedCostCents: result.estimated_cost_cents,
        latencyMs: result.latency_ms,
        toolCalls: persistedToolCalls,
        contextualChips: toolChips,
      });

      const linkedItems = extractLinkedItems(
        assistantResponse,
        menuItems,
        normalizedTools,
      );

      // Round 22 fix · `send_message_to_manager` server-side handoff.
      //
      // Antes a tool (ai-service `services/tools/send_message_to_manager.py`)
      // tentava `POST /:tenant/staff-messages` direto via `ctx.api_client`
      // — endpoint protegido por `StaffOnlyGuard` que o ai-service não
      // autentica. O catch silencioso retornava `ToolResult(error=…)` ou
      // success enganoso, dependendo do path; manager nunca recebia a
      // mensagem e o customer via "Mensagem enviada" sem nada acontecer.
      //
      // Trocamos por dispatch in-process: o AssistantService já tem
      // tenantId (`_schemaName`) + customerId + tableSessionId resolvidos
      // e o `CustomerStaffMessagesService` faz upsert do thread + grava
      // em `staff_messages` (Mongo) + emite WS pra inbox staff. Mesma
      // soft-fail posture do chat-history dual-write logo abaixo —
      // erro aqui não derruba a resposta da IA pro customer.
      if (safeCustomerId && this.customerStaffMessages) {
        for (const tc of normalizedTools) {
          if (tc.name !== 'send_message_to_manager') continue;
          const args = (tc.arguments ?? {}) as Record<string, unknown>;
          const text = typeof args.text === 'string' ? args.text.trim() : '';
          if (!text) continue;
          try {
            await this.customerStaffMessages.appendOutbound({
              tenantId: _schemaName,
              customerId: safeCustomerId,
              tableSessionId,
              content: text,
            });
          } catch (err) {
            this.logger.warn(
              `Falha ao persistir send_message_to_manager em Mongo: ${(err as Error).message}`,
            );
          }
        }
      }

      await this.persistLgpdToolRequests(
        normalizedTools,
        safeCustomerId,
        _schemaName,
      );

      // P1 #B-6 fix (round 3): dual-write pra Mongo `chat_messages`.
      // Best-effort — Postgres remains source of truth e o appendTurn
      // engole exceptions internamente (Mongo offline → log + skip).
      // Só persiste quando temos customerId — flow anônimo não vai pra
      // chat-history (não tem como linkar a customer).
      if (safeCustomerId && this.chatHistory) {
        // Round 21 §E — tenantId pra Mongo SEMPRE é o schema name (ex:
        // `restaurant_dev`). Antes priorizava `tenantContext.restaurant_name`
        // (ex: "Meu Restaurante") → o doc ficava escrito com tenantId
        // não-slug, mas `listThreads` busca pelo schema do middleware
        // (`@Tenant()` → `tenantSchemaName`) → query nunca batia → tela
        // "Conversas com IA" sempre vazia mesmo com 60+ mensagens
        // persistidas no Mongo. Vídeo round 21 reproduz.
        //
        // O schema name (`_schemaName`) é a fonte canônica do tenant em
        // toda a app (rota slug → middleware → schema postgres → mongo).
        // restaurant_name/tenantId do contexto podem ser pretty-name
        // (display), nunca chave de partição.
        await this.chatHistory.appendTurn({
          tenantId: _schemaName,
          customerId: safeCustomerId,
          sessionId: tableSessionId,
          conversationId,
          continueThreadId,
          userMessage: message,
          assistantResponse,
          toolCalls: persistedToolCalls,
          suggestionChips: toolChips
            ? (toolChips as Array<Record<string, unknown>>)
                .map((c) => (typeof c.label === 'string' ? c.label : ''))
                .filter((s) => s.length > 0)
            : null,
          linkedItems,
        });
      }

      return {
        response: assistantResponse,
        wasBlocked: false,
        // suggestions agora reflete os chips canônicos quando presentes,
        // ou cai no fallback estático. FE consome esse array independente
        // de toolCalls (que também é exposto pra dispatch FE-side).
        suggestions: toolChips
          ? (toolChips as Array<Record<string, unknown>>)
              .map((c) => (typeof c.label === 'string' ? c.label : ''))
              .filter((s) => s.length > 0)
          : fallbackChips,
        chips: toolChips ?? undefined,
        linkedItems,
        toolCalls: normalizedTools,
      };
    } catch (err) {
      this.logger.error(`AI chat error: ${err}`);

      await this.saveMessage(tableSessionId, safeCustomerId, message, FALLBACK_RESPONSE, {
        wasBlocked: false,
      });
      if (safeCustomerId && this.chatHistory) {
        await this.chatHistory.appendTurn({
          tenantId: _schemaName,
          customerId: safeCustomerId,
          sessionId: tableSessionId,
          conversationId,
          continueThreadId,
          userMessage: message,
          assistantResponse: FALLBACK_RESPONSE,
          suggestionChips: SUGGESTION_CHIPS,
          linkedItems: [],
        });
      }

      return {
        response: FALLBACK_RESPONSE,
        wasBlocked: false,
        suggestions: SUGGESTION_CHIPS,
        linkedItems: [],
      };
    }
  }

  private async persistLgpdToolRequests(
    toolCalls: Array<Record<string, unknown>>,
    customerId: string | null,
    tenantId: string,
  ): Promise<void> {
    if (!customerId || !this.lgpdService) return;

    for (const tc of toolCalls) {
      if (tc.name !== 'lgpd_data_request') continue;

      const actionPayload =
        tc.actionPayload &&
        typeof tc.actionPayload === 'object' &&
        !Array.isArray(tc.actionPayload)
          ? (tc.actionPayload as Record<string, unknown>)
          : {};
      const lgpdErasure =
        actionPayload.lgpdErasure &&
        typeof actionPayload.lgpdErasure === 'object' &&
        !Array.isArray(actionPayload.lgpdErasure)
          ? (actionPayload.lgpdErasure as Record<string, unknown>)
          : {};

      if (lgpdErasure.backendDispatched === true) continue;

      const args = (tc.arguments ?? {}) as Record<string, unknown>;
      const requestType =
        typeof lgpdErasure.type === 'string'
          ? lgpdErasure.type
          : typeof args.type === 'string'
            ? args.type
            : 'erasure';
      const kind = requestType === 'erasure' ? 'erasure' : 'export';
      const protocolNumber =
        typeof lgpdErasure.protocolNumber === 'string'
          ? lgpdErasure.protocolNumber
          : undefined;

      try {
        await this.lgpdService.createRequest(
          {
            kind,
            customerId,
            protocolNumber,
            notes: `assistant lgpd_data_request type=${requestType}`,
          },
          tenantId,
        );
      } catch (err) {
        this.logger.warn(
          `Falha ao persistir lgpd_data_request: ${(err as Error).message}`,
        );
      }
    }
  }

  async getHistory(tableSessionId: string, customerId: string | null = null) {
    // Filtro por customer_id quando presente — sem isso o cliente B na
    // mesma mesa do cliente A via TODA a conversa de A no /assistente
    // (LGPD/privacidade, P1-B). Para fluxo anonimo (customerId null),
    // limitamos as linhas tambem-anonimas (`customer_id IS NULL`) pra que
    // dois anonimos na mesma mesa tampouco se vejam.
    const rows = (await this.tenantConn.query(
      `SELECT user_message, assistant_response
       FROM assistant_messages
       WHERE table_session_id = $1
         AND was_blocked = false
         AND COALESCE(from_role, 'customer') <> 'staff'
         AND (
           ($2::uuid IS NOT NULL AND customer_id = $2)
           OR ($2::uuid IS NULL AND customer_id IS NULL)
         )
       ORDER BY created_at DESC
       LIMIT 10`,
      [tableSessionId, customerId],
    )) as { user_message: string; assistant_response: string | null }[];

    // Reverse to get chronological order
    return rows.reverse().flatMap((row) => {
      const msgs: { role: 'user' | 'assistant'; content: string }[] = [
        { role: 'user', content: row.user_message },
      ];
      if (row.assistant_response) {
        msgs.push({ role: 'assistant', content: row.assistant_response });
      }
      return msgs;
    });
  }

  /**
   * Public-shaped history for the GET /assistant/history endpoint. Includes
   * `toolCalls` per assistant message so the FE can drive `ToolCallIndicator`
   * over the rehydrated chat. Differs from `getHistory()` (used internally
   * to feed the LLM context) which keeps the lean `{role, content}` shape
   * the upstream AI service expects.
   *
   * Migration 029 added the JSONB `tool_calls` column; node-postgres returns
   * JSONB as an already-parsed value, so no JSON.parse() is needed here.
   */
  async getHistoryWithToolCalls(
    tableSessionId: string,
    customerId: string | null = null,
  ): Promise<AssistantPublicHistoryMessage[]> {
    const rows = (await this.tenantConn.query(
      `WITH recent AS (
         SELECT
           am.id,
           am.user_message,
           am.assistant_response,
           am.tool_calls,
           am.from_role,
           am.customer_id,
           am.model_used,
           am.created_at,
           s.name AS staff_name,
           s.role AS staff_role
         FROM assistant_messages am
         LEFT JOIN staff s
           ON s.id = CASE
             WHEN am.from_role = 'staff'
              AND am.model_used ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN am.model_used::uuid
             ELSE NULL
           END
          AND s.is_active = true
         WHERE am.table_session_id = $1
           AND am.was_blocked = false
           AND (
             (
               COALESCE(am.from_role, 'customer') <> 'staff'
               AND (
                 ($2::uuid IS NOT NULL AND am.customer_id = $2)
                 OR ($2::uuid IS NULL AND am.customer_id IS NULL)
               )
             )
             OR (
               am.from_role = 'staff'
               AND am.customer_id IS NULL
               AND (
                 $2::uuid IS NULL
                 OR EXISTS (
                   SELECT 1
                   FROM session_participants sp
                   WHERE sp.table_session_id = am.table_session_id
                     AND sp.customer_id = $2
                     AND sp.status = 'approved'
                     AND sp.left_at IS NULL
                 )
               )
             )
           )
         ORDER BY am.created_at DESC
         LIMIT 10
       )
       SELECT *
       FROM recent
       ORDER BY created_at ASC`,
      [tableSessionId, customerId],
    )) as {
      id: string;
      user_message: string;
      assistant_response: string | null;
      tool_calls: AiToolCall[] | null;
      from_role: string | null;
      customer_id: string | null;
      model_used: string | null;
      created_at: string | Date;
      staff_name: string | null;
      staff_role: string | null;
    }[];

    return rows.flatMap((row) => {
      const createdAt = toIso(row.created_at);
      const assistantResponse = cleanText(row.assistant_response);

      if (row.from_role === 'staff') {
        if (!assistantResponse) return [];
        return [
          {
            id: row.id,
            role: 'staff' as const,
            content: assistantResponse,
            staffId: isUuidText(row.model_used) ? row.model_used : null,
            staffName: cleanText(row.staff_name),
            staffRole: staffRoleLabel(row.staff_role),
            createdAt,
          },
        ];
      }

      const msgs: AssistantPublicHistoryMessage[] = [];
      const userMessage = cleanText(row.user_message);
      if (userMessage) {
        msgs.push({
          id: `${row.id}:user`,
          role: 'user',
          content: userMessage,
          createdAt,
        });
      }
      if (assistantResponse) {
        msgs.push({
          id: `${row.id}:assistant`,
          role: 'assistant',
          content: assistantResponse,
          toolCalls: row.tool_calls ?? null,
          createdAt,
        });
      }
      return msgs;
    });
  }

  /**
   * Round 18 (Onda 4 batch 2): manager → cliente direct message.
   *
   * Persiste em `assistant_messages` com `from_role='staff'` e
   * `assistant_response = message` (o customer-side `/assistente`
   * renderiza o bubble do staff lendo essa coluna). `user_message`
   * fica string vazia — schema requere NOT NULL pra essa coluna.
   *
   * `to_staff_id` é nullable + (não usado aqui — esta mensagem é
   * INBOUND pro customer, não outbound pro staff). `from_staff_id`
   * (via `model_used` workaround? não — usamos `to_staff_id` invertido?)
   * Hmm — a coluna `to_staff_id` foi adicionada em 030 pra inbox
   * staff. Pra mensagem do staff PRO customer só precisamos identificar
   * o autor; vamos guardar o staffId em `model_used` (text 100 chars)
   * que sobra pra esse uso, OU criar via mecanismo Postgres usando
   * `provider_used = 'staff'` + `model_used = staffId`. Pragmático
   * sem migration nova.
   *
   * Emite WS `assistant.staff_message_received` no room
   * `session:<tableSessionId>` pra cliente atualizar UI em real-time.
   */
  async sendStaffToCustomer(input: {
    tableSessionId: string;
    message: string;
    fromStaffId: string;
    /**
     * Schema name of the tenant (canonical "tenantId" used for Mongo
     * partitioning). Optional so legacy callers that don't yet thread it
     * through still work — when absent we skip the Mongo persist (the
     * Postgres + WS realtime path remains unchanged).
     */
    tenantId?: string;
  }): Promise<{
    id: string;
    tableSessionId: string;
    message: string;
    fromStaffId: string;
    fromStaffName: string | null;
    createdAt: string;
  }> {
    if (!input.message || !input.message.trim()) {
      throw new BadRequestException('Mensagem nao pode ser vazia.');
    }
    if (input.message.length > 2000) {
      throw new BadRequestException('Mensagem muito longa (max 2000 chars).');
    }

    // Confirma table session existe e está ativa.
    const sessionRows = (await this.tenantConn.query(
      `SELECT id FROM table_sessions WHERE id = $1 AND status = 'active'`,
      [input.tableSessionId],
    )) as Array<{ id: string }>;
    if (!sessionRows.length) {
      throw new NotFoundException('Sessão de mesa não encontrada ou já encerrada.');
    }

    // Confirma staff existe e está ativo. Pega name pra payload do WS.
    const staffRows = (await this.tenantConn.query(
      `SELECT id, name FROM staff WHERE id = $1 AND is_active = true`,
      [input.fromStaffId],
    )) as Array<{ id: string; name: string }>;
    if (!staffRows.length) {
      throw new NotFoundException('Funcionário não encontrado ou inativo.');
    }
    const staffName = staffRows[0].name;

    // Persiste em assistant_messages. Usa `assistant_response` pro corpo
    // (o customer-side render le essa coluna) e `from_role='staff'`
    // (migration 030 check constraint aceita). `provider_used`+`model_used`
    // identificam o autor (workaround sem migration extra).
    const inserted = (await this.tenantConn.query(
      `INSERT INTO assistant_messages
         (table_session_id, user_message, assistant_response,
          from_role, to_role, provider_used, model_used,
          was_blocked, tokens_in, tokens_out)
       VALUES ($1, '', $2, 'staff', 'customer', 'staff', $3, false, 0, 0)
       RETURNING id, created_at`,
      [input.tableSessionId, input.message.trim(), input.fromStaffId],
    )) as Array<{ id: string; created_at: string }>;

    if (!inserted.length) {
      throw new BadRequestException('Falha ao persistir mensagem.');
    }

    const row = inserted[0];
    const payload = {
      id: row.id,
      tableSessionId: input.tableSessionId,
      message: input.message.trim(),
      fromStaffId: input.fromStaffId,
      fromStaffName: staffName,
      createdAt: row.created_at,
    };

    // Emit WS pra session room — customer recebe em real-time.
    if (this.events) {
      this.events.emitToSession(
        input.tableSessionId,
        'assistant.staff_message_received',
        payload,
      );
    }

    // Persistência paralela no Mongo (`staff_threads` + `staff_messages`)
    // pra inbox "Mensagens com a equipe" do cliente. Best-effort: falha
    // aqui não derruba o realtime flow (Postgres + WS já confirmaram a
    // entrega visual). Persistimos UM doc por participant aprovado na
    // mesa — cada cliente tem sua própria thread no histórico, mesmo
    // que a mensagem do staff seja broadcast pro session room.
    if (this.customerStaffMessages && input.tenantId) {
      try {
        const participants = (await this.tenantConn.query(
          `SELECT customer_id FROM session_participants
            WHERE table_session_id = $1
              AND status = 'approved'
              AND left_at IS NULL`,
          [input.tableSessionId],
        )) as Array<{ customer_id: string }>;
        await Promise.all(
          participants.map((p) =>
            this.customerStaffMessages!.appendInbound({
              tenantId: input.tenantId!,
              customerId: p.customer_id,
              tableSessionId: input.tableSessionId,
              staffName,
              // Hoje só manager envia (StaffOnlyGuard + ManagerOnlyGuard).
              // Quando waiter/host/kitchen ganharem a primitiva, expor
              // como parâmetro opcional aqui.
              staffRoleLabel: 'gerente',
              content: input.message.trim(),
            }),
          ),
        );
      } catch (err) {
        // Não bloqueia a resposta — log e segue.
        this.logger.warn(
          `Falha ao persistir staff message em Mongo (best-effort): ${(err as Error).message}`,
        );
      }
    }

    return payload;
  }

  private async buildTenantContext(): Promise<{
    context: Record<string, unknown>;
    menuItems: MenuItemRow[];
  }> {
    // Get restaurant settings
    const settingsRows = (await this.tenantConn.query(
      `SELECT restaurant_name FROM settings LIMIT 1`,
    )) as { restaurant_name: string }[];

    const restaurantName = settingsRows[0]?.restaurant_name || 'Restaurante';

    // Get menu categories
    const categories = (await this.tenantConn.query(
      `SELECT name FROM menu_categories WHERE is_active = true ORDER BY sort_order`,
    )) as { name: string }[];

    // Get available menu items (summary). Includes id + image_url so the
    // caller can resolve dish mentions in the AI response back to real items.
    const items = (await this.tenantConn.query(
      `SELECT mi.id, mi.name, mi.short_description, mi.price_cents,
              mi.image_url, mc.name as category_name, mi.tags, mi.allergens
       FROM menu_items mi
       JOIN menu_categories mc ON mc.id = mi.category_id
       WHERE mi.is_available = true
       ORDER BY mc.sort_order, mi.sort_order
       LIMIT 50`,
    )) as MenuItemRow[];

    const menuSummary = items
      .map(
        (i) =>
          `- ${i.name} [id: ${i.id}] (${i.category_name}) - R$${(i.price_cents / 100).toFixed(2)}${
            i.short_description ? `: ${i.short_description}` : ''
          }${i.allergens?.length ? ` [Alergenos: ${i.allergens.join(', ')}]` : ''}`,
      )
      .join('\n');

    return {
      context: {
        restaurant_name: restaurantName,
        categories: categories.map((c) => c.name).join(', '),
        menu_summary: menuSummary,
      },
      menuItems: items,
    };
  }

  private async buildCustomerContext(
    customerId: string,
    tableSessionId: string,
  ): Promise<Record<string, unknown>> {
    const customers = (await this.tenantConn.query(
      `SELECT name FROM customers WHERE id = $1`,
      [customerId],
    )) as { name: string }[];

    const summaryRows = (await this.tenantConn.query(
      `SELECT last_items, favorite_items FROM customer_consumption_summary WHERE customer_id = $1`,
      [customerId],
    )) as { last_items: unknown[]; favorite_items: unknown[] }[];

    const mergeRows = (await this.tenantConn.query(
      `SELECT mr.status,
              mr.approved_by_a_at,
              mr.approved_by_b_at,
              mr.created_at,
              CAST(NULLIF(regexp_replace(src_t.code, '[^0-9]', '', 'g'), '') AS INT) AS origin_table_number,
              CAST(NULLIF(regexp_replace(tgt_t.code, '[^0-9]', '', 'g'), '') AS INT) AS target_table_number,
              src_c.name AS origin_host_name,
              tgt_c.name AS target_host_name,
              cm.cooldown_expires_at,
              cm.reason AS cooldown_reason,
              CASE
                WHEN cm.cooldown_expires_at IS NULL THEN NULL
                ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (cm.cooldown_expires_at - now()))))::int
              END AS retry_after_seconds
         FROM table_merge_requests mr
    LEFT JOIN table_sessions src_ts ON src_ts.id = mr.source_table_session_id
    LEFT JOIN table_sessions tgt_ts ON tgt_ts.id = mr.target_table_session_id
    LEFT JOIN tables src_t ON src_t.id = src_ts.table_id
    LEFT JOIN tables tgt_t ON tgt_t.id = tgt_ts.table_id
    LEFT JOIN customers src_c ON src_c.id = src_ts.host_customer_id
    LEFT JOIN customers tgt_c ON tgt_c.id = tgt_ts.host_customer_id
    LEFT JOIN table_merge_cooldowns cm
           ON cm.source_table_session_id = mr.source_table_session_id
          AND cm.target_table_session_id = mr.target_table_session_id
          AND cm.cooldown_expires_at > now()
        WHERE (mr.source_table_session_id = $1 OR mr.target_table_session_id = $1)
          AND (mr.requesting_customer_id = $2 OR mr.target_customer_id = $2)
        ORDER BY mr.created_at DESC
        LIMIT 1`,
      [tableSessionId, customerId],
    )) as Array<Record<string, unknown>>;

    return {
      name: customers[0]?.name || '',
      last_items: summaryRows[0]?.last_items || [],
      favorite_items: summaryRows[0]?.favorite_items || [],
      latest_table_merge: mergeRows[0] ?? null,
    };
  }

  private async saveMessage(
    tableSessionId: string,
    customerId: string | null,
    userMessage: string,
    assistantResponse: string,
    meta: {
      tokensIn?: number;
      tokensOut?: number;
      modelUsed?: string;
      providerUsed?: string;
      estimatedCostCents?: number;
      latencyMs?: number;
      wasBlocked?: boolean;
      blockReason?: string;
      /**
       * Normalised tool_calls list returned by the AI service after
       * dispatch. Persisted into `assistant_messages.tool_calls` (JSONB,
       * migration 029) so chat history can drive `ToolCallIndicator`
       * rendering on the FE.
       */
      toolCalls?: AiToolCall[] | null;
      /**
       * Chips canônicos retornados pelas tools dispatched. Persistido
       * em `assistant_messages.contextual_chips` (JSONB, migration 030).
       * Antes a coluna ficava sempre NULL — fix do K-2 round 3.
       */
      contextualChips?: unknown[] | null;
    },
  ) {
    // Pass null when no tools were called — the JSONB column is nullable,
    // and a NULL keeps the partial GIN index (`WHERE tool_calls IS NOT
    // NULL`, migration 029) tight.
    const toolCallsJson =
      meta.toolCalls && meta.toolCalls.length > 0
        ? JSON.stringify(meta.toolCalls)
        : null;
    const contextualChipsJson =
      meta.contextualChips && meta.contextualChips.length > 0
        ? JSON.stringify(meta.contextualChips)
        : null;
    await this.tenantConn.query(
      `INSERT INTO assistant_messages
       (table_session_id, customer_id, user_message, assistant_response,
        tokens_in, tokens_out, model_used, provider_used,
        estimated_cost_cents, latency_ms, was_blocked, block_reason,
        tool_calls, contextual_chips)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               $13::jsonb, $14::jsonb)`,
      [
        tableSessionId,
        customerId,
        userMessage,
        assistantResponse,
        meta.tokensIn || 0,
        meta.tokensOut || 0,
        meta.modelUsed || null,
        meta.providerUsed || null,
        meta.estimatedCostCents || 0,
        meta.latencyMs || 0,
        meta.wasBlocked || false,
        meta.blockReason || null,
        toolCallsJson,
        contextualChipsJson,
      ],
    );
  }
}
