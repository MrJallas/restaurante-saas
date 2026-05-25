import { Injectable, Logger } from '@nestjs/common';
import { aiConfig } from '../../config/ai.config';

interface ClassifyResponse {
  allowed: boolean;
  reason: string | null;
  confidence: number;
}

/**
 * Tool invocation surfaced by the LLM (OpenAI tool_calls shape, normalised
 * by `services/ai-service` regardless of upstream provider). Each entry
 * carries the dispatch result so apps/api can persist a complete audit
 * trail in `assistant_messages.tool_calls` (migration 029).
 */
export interface AiToolCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
  result?: unknown;
  /** Status set by the AI service after dispatch. */
  status?: 'ok' | 'error';
  error?: string | null;
  /** Free-form pass-through fields (router target, requiresText, etc.). */
  [key: string]: unknown;
}

interface ChatResponse {
  response: string;
  tokens_in: number;
  tokens_out: number;
  model: string;
  provider: string;
  latency_ms: number;
  estimated_cost_cents: number;
  /**
   * Set when the LLM emitted tool_calls and the AI service dispatched them
   * before returning. Empty list (or absent) when the model didn't invoke
   * any tool. apps/api MUST persist this into `assistant_messages.tool_calls`
   * so the FE can render `ToolCallIndicator` over the history.
   */
  tool_calls?: AiToolCall[];
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatContextMeta {
  tenantId?: string;
  customerId?: string | null;
  sessionId?: string;
}

@Injectable()
export class AiServiceClient {
  private readonly logger = new Logger(AiServiceClient.name);
  private readonly baseUrl = aiConfig.serviceUrl;
  private readonly timeout = aiConfig.timeoutMs;

  /**
   * Round 7 (B-NEW-25): header `X-AI-Service-Key` em todas chamadas.
   * ai-service exige autenticação via env `AI_SERVICE_API_KEY` shared.
   * Health endpoint não precisa, mas mandar não quebra.
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const apiKey = process.env.AI_SERVICE_API_KEY;
    if (apiKey) {
      headers['x-ai-service-key'] = apiKey;
    }
    return headers;
  }

  async classify(
    message: string,
    history: ChatMessage[] = [],
  ): Promise<ClassifyResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/classify`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({ message, history }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        this.logger.warn(`Classify failed: ${res.status}`);
        return { allowed: true, reason: null, confidence: 0.5 };
      }

      return (await res.json()) as ClassifyResponse;
    } catch (err) {
      this.logger.error(`Classify error: ${err}`);
      // Fail open — allow message
      return { allowed: true, reason: null, confidence: 0.5 };
    }
  }

  async chat(
    message: string,
    history: ChatMessage[],
    tenantContext: Record<string, unknown>,
    customerContext?: Record<string, unknown>,
    meta: ChatContextMeta = {},
  ): Promise<ChatResponse> {
    const res = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        message,
        history,
        tenant_context: tenantContext,
        customer_context: customerContext,
        tenantId: meta.tenantId,
        customerId: meta.customerId,
        sessionId: meta.sessionId,
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { detail?: string }).detail ||
          'Desculpe, estou com dificuldade no momento. Posso ajudar em breve.',
      );
    }

    return (await res.json()) as ChatResponse;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
