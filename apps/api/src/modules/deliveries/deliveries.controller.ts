import { Controller, Post, Get, Param } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';

@Controller(':slug/deliveries')
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
