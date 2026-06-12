import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import type { TenantRequest } from '../tenant/tenant.middleware';
import {
  ContinuationResponse,
  ContinuationService,
} from './continuation.service';

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
  constructor(private readonly service: ContinuationService) {}

  @Post()
  @UseGuards(StaffOrSessionGuard)
  async getContinuation(
    @Body() dto: ContinuationDto,
    @Req() req: TenantRequest,
  ): Promise<ContinuationResponse> {
    const headerHint = Array.isArray(req.headers['x-continuation-kind-hint'])
      ? req.headers['x-continuation-kind-hint'][0]
      : req.headers['x-continuation-kind-hint'];
    const draftCount = Number(req.headers['x-draft-order-count'] ?? 0);
    return this.service.getContinuation(
      dto.tableSessionId,
      dto.customerId ?? null,
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
