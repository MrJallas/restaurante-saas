import { Injectable, Logger } from '@nestjs/common';
import { aiConfig } from '../../config/ai.config';

/**
 * Chip shape returned by the AI service `/smart-suggestions` pool. Kept
 * loose (`Record`) on the wire so the FE `SmartSuggestionChip` mapping in
 * `web-staff/lib/api/manager.ts` stays the single source of truth for the
 * UI shape. We only guarantee `suggestions` + `poolExpiresAt` here.
 */
export interface SmartSuggestionsResult {
  suggestions: Array<Record<string, unknown>>;
  poolExpiresAt: string;
  situacao?: string | null;
}

export interface SmartSuggestionsQuery {
  tenantId: string;
  surface?: string;
  customerId?: string | null;
  sessionId?: string | null;
  situacao?: string | null;
  limit?: number;
}

// Same short window as continuation — the pool lookup is a cheap Redis read
// on the AI side, so a 1.5s ceiling keeps the manager sheet responsive and
// falls back honestly when the Python service is slow or down.
const AI_TIMEOUT_MS = 1500;

/**
 * Server-side proxy to the Python AI service `/smart-suggestions` endpoint.
 *
 * WHY THIS EXISTS (P1 fix 2026-07-05): the manager `MContactClientSheet`
 * used to `fetch()` the AI service DIRECTLY from the browser, without the
 * `x-ai-service-key` header (that secret can't live in the JS bundle) — so
 * the AI service rejected every call with 401 and the sheet silently fell
 * back to a static chip set FOREVER. Real suggestions never showed.
 *
 * Now the FE hits `/:slug/smart-suggestions` through the same-origin staff
 * proxy (which injects `x-staff-key` + the session token), the request lands
 * on this staff-guarded controller, and the key is injected here, server-side,
 * exactly like `continuation.service.ts` and `home.service.ts`.
 */
@Injectable()
export class SmartSuggestionsService {
  private readonly logger = new Logger(SmartSuggestionsService.name);

  async getSuggestions(query: SmartSuggestionsQuery): Promise<SmartSuggestionsResult | null> {
    const body = {
      tenantId: query.tenantId,
      customerId: query.customerId ?? null,
      sessionId: query.sessionId ?? null,
      surface: query.surface ?? 'home',
      situacao: query.situacao ?? null,
      limit: query.limit ?? 4,
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.AI_SERVICE_API_KEY) {
      headers['x-ai-service-key'] = process.env.AI_SERVICE_API_KEY;
    }

    try {
      const res = await fetch(`${aiConfig.serviceUrl}/smart-suggestions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`AI service /smart-suggestions returned ${res.status}`);
        return null;
      }
      const payload = (await res.json()) as SmartSuggestionsResult;
      return {
        suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
        poolExpiresAt:
          typeof payload.poolExpiresAt === 'string'
            ? payload.poolExpiresAt
            : new Date(Date.now() + 60_000).toISOString(),
        situacao: payload.situacao ?? null,
      };
    } catch (err) {
      // Null → controller returns an honest 200 with an empty pool; the FE
      // renders its own static fallback. We do NOT fabricate chips here.
      this.logger.warn(
        `AI service /smart-suggestions failed (${(err as Error).name}): ${(err as Error).message}`,
      );
      return null;
    }
  }
}
