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
      chips,
    };
  });
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
    @Optional() private readonly events?: EventsGateway,
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

      const normalizedTools = normalizeToolCalls(result.tool_calls);
      // K-1 fix: prefer chips canônicos das tools sobre SUGGESTION_CHIPS estático.
      // Quando nenhuma tool emitiu chips (ex: turno 100% texto), caímos
      // pro trio default — assim o cliente nunca vê uma row de chips vazia.
      const toolChips = aggregateChipsFromTools(normalizedTools);
      const fallbackChips: string[] = SUGGESTION_CHIPS.slice(0, 3);
      // Persistir os chips canônicos em `assistant_messages.contextual_chips`
      // (jsonb, migration 030). Se a tool não retornou nada, persistimos
      // null pra que o GIN index parcial fique enxuto.
      await this.saveMessage(tableSessionId, safeCustomerId, message, result.response, {
        tokensIn: result.tokens_in,
        tokensOut: result.tokens_out,
        modelUsed: result.model,
        providerUsed: result.provider,
        estimatedCostCents: result.estimated_cost_cents,
        latencyMs: result.latency_ms,
        toolCalls: result.tool_calls ?? null,
        contextualChips: toolChips,
      });

      const linkedItems = extractLinkedItems(result.response, menuItems);

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
          userMessage: message,
          assistantResponse: result.response,
          toolCalls: result.tool_calls ?? null,
          suggestionChips: toolChips
            ? (toolChips as Array<Record<string, unknown>>)
                .map((c) => (typeof c.label === 'string' ? c.label : ''))
                .filter((s) => s.length > 0)
            : null,
          linkedItems,
        });
      }

      return {
        response: result.response,
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
