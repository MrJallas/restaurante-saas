import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsIn,
  IsUUID,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { Request } from 'express';
import { SessionGuard, SessionData, SessionRequest } from '../../common/guards/session.guard';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { Session } from '../../common/decorators/session.decorator';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { OrdersService } from './orders.service';

class CreateOrderItemDto {
  @IsString()
  @IsNotEmpty()
  menuItemId!: string;

  // Min 1, Max 99. Antes era so @Min(1) — quantity 2147483648 estourava
  // INT4 do Postgres em UPDATE menu_items.total_orders e voltava 500.
  // 99 e folgado pra qualquer ocasiao real (mesa de festa); evita
  // ataques de payload e tambem totais absurdos como R$ 78.999,21.
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  extraIds?: string[];

  /**
   * Who this item belongs to on the shared table. `null`/omitted means the
   * item is shared on the table bill. Required when the parent order is in
   * `individual` billing mode (falls back to the order-level customerId).
   */
  @IsOptional()
  @IsUUID()
  customerId?: string | null;
}

class CreateOrderDto {
  @IsIn(['table', 'individual'])
  billingMode!: 'table' | 'individual';

  @IsOptional()
  @IsString()
  visitId?: string;

  /**
   * Round 17: kept in the DTO for backwards-compat with FE that still
   * sends `session.customerId` in the body (apps/web-customer/src/app/
   * [slug]/assistente/page.tsx:460). The value is **IGNORED** server-side
   * — the controller now derives the order-level customer from the
   * `recognition_token` cookie via `callerResolver.tryGetCustomerId`. See
   * the comment on `createOrder` below for the IDOR this closes.
   */
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  // Cap de 50 itens por pedido. Sem isso o backend aceitava arrays de
  // milhares (P2 do bug-hunter: 5000 line-items virava 413 generico) e
  // inflava memoria / DB. 50 cobre mesa cheia tranquilo.
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  /**
   * Idempotency key opcional. Quando presente, dois POSTs com a mesma
   * chave dentro do TTL retornam o mesmo orderId em vez de criar
   * duplicatas — evita double-tap do botao Confirmar virar pedido em
   * dobro. UI deveria gerar via `crypto.randomUUID()`.
   */
  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;
}

/**
 * Status values the staff side may move an order to. Customer-facing
 * confirm/cancel of a `pending_confirmation` order have dedicated endpoints
 * below — they do NOT go through this DTO.
 */
class UpdateStatusDto {
  @IsString()
  @IsNotEmpty()
  @IsIn([
    'received',
    'in_progress',
    'ready',
    'delivered',
    'cancelled',
    // legacy aliases kept while older clients migrate
    'confirmed',
    'preparing',
  ])
  status!: string;

  @IsOptional()
  @IsString()
  changedBy?: string;
}

@Controller(':slug/orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  /**
   * Round 17 (B-NEW-66): customerId derivado do cookie `recognition_token`
   * em vez de aceitar `dto.customerId` arbitrário. Antes: customer A na
   * mesma mesa de B passava `customerId = B-uuid` em billingMode=individual
   * → todos os items eram atribuídos a B em `order_items.customer_id`. A
   * validação de session_participants em `orders.service.ts:198-217` SÓ
   * confirma "B está na mesa" — não confirma "A é o B". B fica responsável
   * pela conta de A; o split-by-customer no `/pagamento` cobra B; A paga 0.
   * Mesma família dos round-7-9 fixes (assistant, complaints, table-merge):
   * customer-side actions devem derivar caller do cookie.
   *
   * Comportamento: `dto.customerId` é IGNORADO. Se o caller não tem cookie
   * `recognition_token` válido, individual billing falha em
   * `orders.service` (visitId requirement já barra anônimos). Per-item
   * `customerId` continua aceito (UX legítimo de "split por item entre
   * participantes da mesma mesa", policy: trust intra-table, validado em
   * `orders.service.ts:198-217`).
   */
  @Post()
  @UseGuards(SessionGuard)
  async createOrder(
    @Body() dto: CreateOrderDto,
    @Session() session: SessionData,
    @Param('slug') slug: string,
    @Req() req: Request,
  ) {
    const callerCustomerId = await this.callerResolver.tryGetCustomerId(req);
    return this.ordersService.createOrder(
      session.sessionId,
      dto.visitId || null,
      dto.billingMode,
      dto.items,
      dto.notes,
      slug,
      callerCustomerId,
      dto.idempotencyKey,
    );
  }

  /**
   * GET /:slug/orders — dual-mode list endpoint.
   *
   *  - **Customer mode** (cookie `session_token` / header `x-session-token`):
   *    returns orders scoped to the caller's table session, with the same
   *    `billingMode`/`visitId`/`scope` filters as before.
   *  - **Staff mode** (header `x-staff-key`): returns the tenant-wide
   *    active-orders feed used by the cozinha (KDS). No session is required
   *    because the kitchen has no `table_session_id` of its own.
   *
   * The route was previously guarded by `SessionGuard` only, so KDS
   * requests holding a valid `x-staff-key` got a 401 — this was P0 #12 in
   * the consolidated E2E report. `StaffOrSessionGuard` accepts either
   * credential; the branch below picks the right service method based on
   * which one authenticated.
   */
  @Get()
  @UseGuards(StaffOrSessionGuard)
  async getOrders(
    @Req() req: SessionRequest,
    @Query('billingMode') billingMode?: string,
    @Query('visitId') visitId?: string,
    @Query('scope') scope?: string,
  ) {
    if (!req.sessionData) {
      // Staff path — `StaffOrSessionGuard` already verified `x-staff-key`.
      const orders = await this.ordersService.getActiveOrdersForTenant();
      return { orders };
    }

    const orders = await this.ordersService.getOrdersBySession(
      req.sessionData.sessionId,
      billingMode,
      visitId,
      scope,
    );
    return { orders };
  }

  @Get('bill')
  @UseGuards(SessionGuard)
  async getBill(
    @Session() session: SessionData,
    @Query('mode') mode: 'table' | 'individual' = 'table',
    @Query('visitId') visitId?: string,
  ) {
    return this.ordersService.getBill(session.sessionId, mode, visitId);
  }

  /**
   * Round 18 (Onda 4 batch 2): timeline aggregator pra
   * ScreenManagerTimeline (canvas /manager/timeline/[orderId]).
   * Staff-only — manager dashboard view, nao customer-side. Retorna
   * lista cronologica de status transitions com staff name resolvido
   * por join em `order_status_history.changed_by`.
   *
   * Declarado ANTES do `@Get(':orderId')` wildcard pra Nest matcher
   * nao cair em getOrder('timeline').
   */
  @Get(':orderId/timeline')
  @UseGuards(StaffOrSessionGuard)
  async getTimeline(@Param('orderId') orderId: string) {
    return this.ordersService.getOrderTimeline(orderId);
  }

  /**
   * Customer-facing single-order fetch used by `/pedido/enviado` and the
   * kitchen status timeline. Scoped to the caller's session so a customer
   * cannot peek at orders from another table.
   */
  @Get(':orderId')
  @UseGuards(SessionGuard)
  async getOrder(
    @Session() session: SessionData,
    @Param('orderId') orderId: string,
  ) {
    const order = await this.ordersService.getOrderById(
      session.sessionId,
      orderId,
    );
    if (!order) {
      throw new NotFoundException('Pedido nao encontrado.');
    }
    return order;
  }

  /**
   * Promote a `pending_confirmation` order to `received`. Called by the
   * customer's 15s confirmation screen when they tap "Confirmar agora".
   * Idempotent — safe to retry if the network flickers.
   */
  @Patch(':orderId/confirm')
  @UseGuards(SessionGuard)
  async confirmOrder(
    @Param('orderId') orderId: string,
    @Param('slug') slug: string,
    @Session() session: SessionData,
  ) {
    return this.ordersService.confirmOrder(orderId, session.sessionId, slug);
  }

  /**
   * Cancel a `pending_confirmation` order (customer tapped "Editar" during
   * the 15s window). Rejects if the order has already been sent to the
   * kitchen.
   */
  @Patch(':orderId/cancel')
  @UseGuards(SessionGuard)
  async cancelOrder(
    @Param('orderId') orderId: string,
    @Param('slug') slug: string,
    @Session() session: SessionData,
  ) {
    return this.ordersService.cancelOrder(orderId, session.sessionId, slug);
  }

  /**
   * Staff-driven status transitions (kitchen/waiter). Round 7 (B-NEW-24):
   * branch session vs staff — quando session, valida ownership de
   * `table_session_id` E restringe transição apenas pra `cancelled`
   * (customer não tem direito de marcar `delivered`/`ready`/etc).
   * Staff continua livre.
   *
   * Antes (round 3 fix): StaffOrSessionGuard só impedia callers anônimos.
   * Service.updateStatus não validava ownership quando session — customer
   * cancelava/marcava delivered qualquer order do tenant inteiro.
   * `cancelOrder` JÁ FAZIA o check certo; updateStatus replicava o bug
   * de ownership. Agora ambos consistentes.
   */
  @Patch(':orderId/status')
  @UseGuards(StaffOrSessionGuard)
  async updateStatus(
    @Param('orderId') orderId: string,
    @Param('slug') slug: string,
    @Body() dto: UpdateStatusDto,
    @Req() req: SessionRequest & { actorType?: 'staff' | 'session' },
  ) {
    return this.ordersService.updateStatus(
      orderId,
      dto.status,
      dto.changedBy || 'system',
      slug,
      {
        actorType: req.actorType ?? 'staff',
        sessionTableId: req.sessionData?.sessionId ?? null,
      },
    );
  }

  /**
   * Hook for external schedulers (k8s CronJob, Cloud Scheduler, or a
   * sidecar keep-alive). Promotes any `pending_confirmation` order whose
   * 15s window has elapsed to `received`. Safe to call frequently — it
   * only touches expired rows and is idempotent. A lazy sweep also runs
   * on every GET /orders so this is a backstop, not the primary path.
   *
   * Protegido pelo StaffOrSessionGuard pra que atacante externo nao
   * consiga forcar auto-confirmacao em massa eliminando a janela de 15s
   * que o cliente tem pra cancelar (P1 do bug-hunt).
   */
  @Post('_sweep-auto-confirm')
  @UseGuards(StaffOrSessionGuard)
  async sweepAutoConfirm() {
    const ids = await this.ordersService.sweepAutoConfirm();
    return { promoted: ids.length, orderIds: ids };
  }
}
