import { Injectable, Logger } from '@nestjs/common';
import { aiConfig } from '../../config/ai.config';

interface ClassifyResponse {
  allowed: boolean;
  reason: string | null;
  confidence: number;
}

interface ChatResponse {
  response: string;
  tokens_in: number;
  tokens_out: number;
  model: string;
  provider: string;
  latency_ms: number;
  estimated_cost_cents: number;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

@Injectable()
export class AiServiceClient {
  private readonly logger = new Logger(AiServiceClient.name);
  private readonly baseUrl = aiConfig.serviceUrl;
  private readonly timeout = aiConfig.timeoutMs;

  async classify(
    message: string,
    history: ChatMessage[] = [],
  ): Promise<ClassifyResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
  ): Promise<ChatResponse> {
    const res = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history,
        tenant_context: tenantContext,
        customer_context: customerContext,
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
