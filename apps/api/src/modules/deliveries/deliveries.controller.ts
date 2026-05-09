import { Controller, Post, Get, Param, UseGuards } from '@nestjs/common';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
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
 */
@Controller(':slug/deliveries')
@UseGuards(StaffOnlyGuard)
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Post('claim/:orderId')
  async claimOrder(
    @Param('orderId') orderId: string,
    @Param('slug') slug: string,
  ) {
    return this.deliveriesService.claimOrder(orderId, slug);
  }

  @Post(':deliveryId/delivered')
  async markDelivered(
    @Param('deliveryId') deliveryId: string,
    @Param('slug') slug: string,
  ) {
    return this.deliveriesService.markDelivered(deliveryId, slug);
  }

  @Get('pending')
  async getPendingDeliveries() {
    return this.deliveriesService.getPendingDeliveries();
  }
}
