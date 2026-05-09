import { Controller, Post, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import { DeliveriesService } from './deliveries.service';

/**
 * Endpoints de entrega — exclusivos de staff (waiter/cozinha).
 *
 * Round 7 (B-NEW-21): trocado StaffOrSessionGuard → StaffOnlyGuard.
 * Antes (round 3) era TOTALMENTE publico, depois "fixed" pra
 * StaffOrSessionGuard mas o "Or Session" path aceitava customer com
 * mesa ativa — customer claimava todos pedidos prontos do tenant
 * (DoS de entregas: garçom real veria 0 disponíveis), marcava
 * delivered (cliente real fica sem comida + sem prova). Migration
 * 038 (round 5) UNIQUE em order_deliveries impede claim-twice mas
 * NÃO impede claim-first-by-customer.
 *
 * Round 16 (P3-NEW-1): claimOrder + markDelivered passam staffId real
 * do header `x-staff-id` (via requireActiveStaffId, com cross-check em
 * DB) pro service em vez de hardcoded 'garcom'. Audit trail agora
 * grava `order_deliveries.claimed_by` UUID + `order_status_history.changed_by`
 * UUID em vez de string genérica.
 */
@Controller(':slug/deliveries')
@UseGuards(StaffOnlyGuard)
export class DeliveriesController {
  constructor(
    private readonly deliveriesService: DeliveriesService,
    private readonly callerResolver: CallerResolverService,
  ) {}

  @Post('claim/:orderId')
  async claimOrder(
    @Param('orderId') orderId: string,
    @Param('slug') slug: string,
    @Req() req: Request,
  ) {
    const staffId = await this.callerResolver.requireActiveStaffId(req);
    return this.deliveriesService.claimOrder(orderId, slug, staffId);
  }

  @Post(':deliveryId/delivered')
  async markDelivered(
    @Param('deliveryId') deliveryId: string,
    @Param('slug') slug: string,
    @Req() req: Request,
  ) {
    const staffId = await this.callerResolver.requireActiveStaffId(req);
    return this.deliveriesService.markDelivered(deliveryId, slug, staffId);
  }

  @Get('pending')
  async getPendingDeliveries() {
    return this.deliveriesService.getPendingDeliveries();
  }
}
