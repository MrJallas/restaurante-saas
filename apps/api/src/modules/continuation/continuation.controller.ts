import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import type { ActorType } from '../../common/guards/staff-or-session.guard';
import type { SessionData } from '../../common/guards/session.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import type { TenantRequest } from '../tenant/tenant.middleware';
import { ContinuationResponse, ContinuationService } from './continuation.service';

class ContinuationDto {
  @IsString()
  @IsUUID()
  tableSessionId!: string;

  // Optional — when omitted the service falls back to the most recent
  // active session_participants row for the table. Validated as UUID to
  // avoid `$1::uuid` casts blowing up on `?customerId=../../etc/passwd`-
  // style payloads (same family as B-NEW-9 in assistant.controller.ts).
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  clientKindHint?: string;

  @IsOptional()
  @IsBoolean()
  hasDraftOrder?: boolean;

  @IsOptional()
  @IsBoolean()
  isReturning?: boolean;

  /**
   * Superfície que pede a continuation. Só `assistente` consome mensagens
   * de evento (1x por evento — prompt 100); a home da mesa não queima o
   * contexto do assistente. Ausente = comportamento de leitura pura.
   */
  @IsOptional()
  @IsIn(['assistente', 'home'])
  surface?: 'assistente' | 'home';
}

/**
 * `POST /:slug/continuation` — proxy to the Python AI service's
 * `/continuation` endpoint that picks a contextual welcome-back / wrap-up
 * template based on what's happened on the table session in the last 30
 * minutes (V20 canon: "Tava bisbilhotando o menu?", "Avisei o garçom",
 * "Pagamento OK", etc.).
 *
 * Authentication piggybacks on `StaffOrSessionGuard` — the customer FE
 * hits with `x-session-token` and the staff/host app can also hit with
 * `x-staff-key`. Tenant slug comes via the `:slug/*` middleware. No
 * additional rate-limit needed: the underlying derive() is read-only and
 * the AI service has a 1.5s timeout + always-on fallback.
 */
@Controller(':slug/continuation')
export class ContinuationController {
  constructor(
    private readonly service: ContinuationService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  @Post()
  @UseGuards(StaffOrSessionGuard)
  async getContinuation(
    @Body() dto: ContinuationDto,
    @Req() req: TenantRequest & { actorType?: ActorType; sessionData?: SessionData },
  ): Promise<ContinuationResponse> {
    const headerHint = Array.isArray(req.headers['x-continuation-kind-hint'])
      ? req.headers['x-continuation-kind-hint'][0]
      : req.headers['x-continuation-kind-hint'];
    const draftCount = Number(req.headers['x-draft-order-count'] ?? 0);

    // P1 IDOR-READ (re-scan de convergência #4): pra um caller de SESSÃO
    // (customer) SOBRESCREVE tableSessionId com o `sessionId` carimbado pelo
    // StaffOrSessionGuard e deriva customerId do cookie via callerResolver —
    // IGNORANDO o body. Antes um cliente com token válido passava
    // `tableSessionId` de OUTRA mesa ativa + customerId da vítima e vazava
    // customer_name + last_order_summary cross-session dentro do tenant. Mesmo
    // padrão de home.controller (B-NEW-63) e late-arrival.controller (B-NEW-58).
    //
    // Caller STAFF (x-staff-key/x-staff-token) mantém o tableSessionId do body:
    // staff PRECISA de acesso cross-mesa legítimo (KDS, garçom, host).
    let tableSessionId = dto.tableSessionId;
    let customerId = dto.customerId ?? null;
    if (req.actorType === 'session') {
      tableSessionId = req.sessionData?.sessionId ?? dto.tableSessionId;
      customerId = await this.callerResolver.tryGetCustomerId(req);
    }

    return this.service.getContinuation(
      tableSessionId,
      customerId,
      req.tenantSchemaName ?? req.tenantSlug ?? 'restaurant_dev',
      {
        clientKindHint: dto.clientKindHint ?? headerHint,
        hasDraftOrder:
          dto.hasDraftOrder === true || (Number.isFinite(draftCount) && draftCount > 0),
        isReturning: dto.isReturning === true,
        surface: dto.surface ?? null,
      },
    );
  }
}
