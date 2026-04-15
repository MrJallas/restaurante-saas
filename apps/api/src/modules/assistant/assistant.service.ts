import { Injectable, Logger } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { AiServiceClient } from '../../infra/ai/ai-service.client';
import { RedisService } from '../../infra/redis/redis.service';

const BLOCKED_RESPONSE =
  'Desculpe, so posso ajudar com assuntos do restaurante: cardapio, pratos, bebidas, recomendacoes e informacoes sobre o estabelecimento.';

const SUGGESTION_CHIPS = [
  'Qual o prato do dia?',
  'Recomende uma bebida',
  'Quais sobremesas tem?',
  'Opcoes sem glutem',
  'Mais pedidos do restaurante',
];

const FALLBACK_RESPONSE =
  'Desculpe, estou com dificuldade no momento. Posso ajudar em breve.';

const MAX_MESSAGES_PER_SESSION = 50;

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
    schemaName: string,
  ) {
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

    // Step 1: Classify message
    const classification = await this.aiClient.classify(message);

    if (!classification.allowed) {
      // Save blocked message
      await this.saveMessage(tableSessionId, customerId, message, BLOCKED_RESPONSE, {
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
    const tenantContext = await this.buildTenantContext();
    const customerContext = customerId
      ? await this.buildCustomerContext(customerId)
      : undefined;
    const history = await this.getHistory(tableSessionId);

    // Step 3: Call AI
    try {
      const result = await this.aiClient.chat(
        message,
        history,
        tenantContext,
        customerContext,
      );

      // Save message
      await this.saveMessage(tableSessionId, customerId, message, result.response, {
        tokensIn: result.tokens_in,
        tokensOut: result.tokens_out,
        modelUsed: result.model,
        providerUsed: result.provider,
        estimatedCostCents: result.estimated_cost_cents,
        latencyMs: result.latency_ms,
      });

      return {
        response: result.response,
        wasBlocked: false,
        suggestions: SUGGESTION_CHIPS.slice(0, 3),
      };
    } catch (err) {
      this.logger.error(`AI chat error: ${err}`);

      await this.saveMessage(tableSessionId, customerId, message, FALLBACK_RESPONSE, {
        wasBlocked: false,
      });

      return {
        response: FALLBACK_RESPONSE,
        wasBlocked: false,
        suggestions: SUGGESTION_CHIPS,
      };
    }
  }

  async getHistory(tableSessionId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT user_message, assistant_response
       FROM assistant_messages
       WHERE table_session_id = $1 AND was_blocked = false
       ORDER BY created_at DESC
       LIMIT 10`,
      [tableSessionId],
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

  private async buildTenantContext(): Promise<Record<string, unknown>> {
    // Get restaurant settings
    const settingsRows = (await this.tenantConn.query(
      `SELECT restaurant_name FROM settings LIMIT 1`,
    )) as { restaurant_name: string }[];

    const restaurantName = settingsRows[0]?.restaurant_name || 'Restaurante';

    // Get menu categories
    const categories = (await this.tenantConn.query(
      `SELECT name FROM menu_categories WHERE is_active = true ORDER BY sort_order`,
    )) as { name: string }[];

    // Get available menu items (summary)
    const items = (await this.tenantConn.query(
      `SELECT mi.name, mi.short_description, mi.price_cents, mc.name as category_name, mi.tags, mi.allergens
       FROM menu_items mi
       JOIN menu_categories mc ON mc.id = mi.category_id
       WHERE mi.is_available = true
       ORDER BY mc.sort_order, mi.sort_order
       LIMIT 50`,
    )) as { name: string; short_description: string; price_cents: number; category_name: string; tags: string[]; allergens: string[] }[];

    const menuSummary = items
      .map(
        (i) =>
          `- ${i.name} (${i.category_name}) - R$${(i.price_cents / 100).toFixed(2)}${
            i.short_description ? `: ${i.short_description}` : ''
          }${i.allergens.length ? ` [Alergenos: ${i.allergens.join(', ')}]` : ''}`,
      )
      .join('\n');

    return {
      restaurant_name: restaurantName,
      categories: categories.map((c) => c.name).join(', '),
      menu_summary: menuSummary,
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
    },
  ) {
    await this.tenantConn.query(
      `INSERT INTO assistant_messages
       (table_session_id, customer_id, user_message, assistant_response,
        tokens_in, tokens_out, model_used, provider_used,
        estimated_cost_cents, latency_ms, was_blocked, block_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
      ],
    );
  }
}
