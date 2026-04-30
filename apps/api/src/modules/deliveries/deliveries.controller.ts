import { Controller, Post, Get, Param, UseGuards } from '@nestjs/common';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { DeliveriesService } from './deliveries.service';

/**
 * Endpoints de entrega — exclusivos de staff (waiter/cozinha). Antes
 * eram TOTALMENTE publicos: qualquer um claimava pedidos, marcava
 * delivered, listava pendentes. P0 do bug-hunt round audit.
 */
@Controller(':slug/deliveries')
@UseGuards(StaffOrSessionGuard)
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
