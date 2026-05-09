import { Injectable, Logger } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { AiServiceClient, type AiToolCall } from '../../infra/ai/ai-service.client';
import { RedisService } from '../../infra/redis/redis.service';

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

/**
 * Normalise the AI service's tool_calls into the flat shape FE consumers
 * expect (`{ name, arguments, result, silent, router, routerTarget,
 * actionPayload }`). Upstream returns the raw OpenAI shape with the tool
 * name nested under `function.name` — flattening here keeps the chat page
 * (`AssistantToolCall`) and the chat-history rehydrate path consistent.
 *
 * Returns `null` when the AI service returned no tools (so the FE's
 * `res.toolCalls && res.toolCalls.length > 0` guard short-circuits cleanly).
 */
function normalizeToolCalls(
  raw: AiToolCall[] | undefined,
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
      actionPayload: result?.actionPayload,
    };
  });
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
): LinkedItem[] {
  const haystack = normalizeForMatch(responseText);
  if (!haystack) return [];

  const seen = new Set<string>();
  const found: LinkedItem[] = [];

  for (const item of menuItems) {
    const needle = normalizeForMatch(item.name);
    if (needle.length < 4) continue; // too generic to trust a substring hit
    const pos = haystack.indexOf(needle);
    if (pos === -1) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    found.push({
      id: item.id,
      name: item.name,
      priceCents: item.price_cents,
      imageUrl: item.image_url,
      categoryName: item.category_name,
      position: pos,
    });
  }

  found.sort((a, b) => a.position - b.position);
  return found.slice(0, 4); // cap to avoid overwhelming the UI
}

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly aiClient: AiServiceClient,
    private readonly redis: RedisService,
  ) {}

  async sendMessage(
    tableSessionId: string,
    customerId: string | null,
    message: string,
    // Tenant connection is resolved via `TenantConnectionProvider` and the
    // request middleware that sets `search_path`; the explicit schema arg
    // is kept on the public signature so the controller and any future
    // direct callers don't have to change. Marked unused to satisfy lint.
    _schemaName: string,
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
    const recentHistory = await this.getHistory(tableSessionId, safeCustomerId);
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
      ? await this.buildCustomerContext(safeCustomerId)
      : undefined;
    const history = recentHistory;

    // Step 3: Call AI
    try {
      const result = await this.aiClient.chat(
        message,
        history,
        tenantContext,
        customerContext,
      );

      // Save message — including the tool_calls audit trail when the LLM
      // invoked any tool. Migration 029 added the JSONB column; without
      // persisting it the FE's `ToolCallIndicator` over the chat history
      // never lit up because chat-history reads NULL for every row.
      await this.saveMessage(tableSessionId, safeCustomerId, message, result.response, {
        tokensIn: result.tokens_in,
        tokensOut: result.tokens_out,
        modelUsed: result.model,
        providerUsed: result.provider,
        estimatedCostCents: result.estimated_cost_cents,
        latencyMs: result.latency_ms,
        toolCalls: result.tool_calls ?? null,
      });

      const linkedItems = extractLinkedItems(result.response, menuItems);

      return {
        response: result.response,
        wasBlocked: false,
        suggestions: SUGGESTION_CHIPS.slice(0, 3),
        linkedItems,
        toolCalls: normalizeToolCalls(result.tool_calls),
      };
    } catch (err) {
      this.logger.error(`AI chat error: ${err}`);

      await this.saveMessage(tableSessionId, safeCustomerId, message, FALLBACK_RESPONSE, {
        wasBlocked: false,
      });

      return {
        response: FALLBACK_RESPONSE,
        wasBlocked: false,
        suggestions: SUGGESTION_CHIPS,
        linkedItems: [],
      };
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
  ) {
    const rows = (await this.tenantConn.query(
      `SELECT user_message, assistant_response, tool_calls
       FROM assistant_messages
       WHERE table_session_id = $1
         AND was_blocked = false
         AND (
           ($2::uuid IS NOT NULL AND customer_id = $2)
           OR ($2::uuid IS NULL AND customer_id IS NULL)
         )
       ORDER BY created_at DESC
       LIMIT 10`,
      [tableSessionId, customerId],
    )) as {
      user_message: string;
      assistant_response: string | null;
      tool_calls: AiToolCall[] | null;
    }[];

    return rows.reverse().flatMap((row) => {
      const msgs: {
        role: 'user' | 'assistant';
        content: string;
        toolCalls?: AiToolCall[] | null;
      }[] = [{ role: 'user', content: row.user_message }];
      if (row.assistant_response) {
        msgs.push({
          role: 'assistant',
          content: row.assistant_response,
          toolCalls: row.tool_calls ?? null,
        });
      }
      return msgs;
    });
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
          `- ${i.name} (${i.category_name}) - R$${(i.price_cents / 100).toFixed(2)}${
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
  ): Promise<Record<string, unknown>> {
    const customers = (await this.tenantConn.query(
      `SELECT name FROM customers WHERE id = $1`,
      [customerId],
    )) as { name: string }[];

    const summaryRows = (await this.tenantConn.query(
      `SELECT last_items, favorite_items FROM customer_consumption_summary WHERE customer_id = $1`,
      [customerId],
    )) as { last_items: unknown[]; favorite_items: unknown[] }[];

    return {
      name: customers[0]?.name || '',
      last_items: summaryRows[0]?.last_items || [],
      favorite_items: summaryRows[0]?.favorite_items || [],
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
    },
  ) {
    // Pass null when no tools were called — the JSONB column is nullable,
    // and a NULL keeps the partial GIN index (`WHERE tool_calls IS NOT
    // NULL`, migration 029) tight.
    const toolCallsJson =
      meta.toolCalls && meta.toolCalls.length > 0
        ? JSON.stringify(meta.toolCalls)
        : null;
    await this.tenantConn.query(
      `INSERT INTO assistant_messages
       (table_session_id, customer_id, user_message, assistant_response,
        tokens_in, tokens_out, model_used, provider_used,
        estimated_cost_cents, latency_ms, was_blocked, block_reason,
        tool_calls)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
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
      ],
    );
  }
}
