import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { OrdersModule } from '../orders/orders.module';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';

@Module({
  // Round 16 (P3-NEW-1): CallerResolverModule pra resolver staffId
  // (com cross-check em DB via requireActiveStaffId) em claim/markDelivered.
  // OrdersModule: claim/markDelivered delegam pro caminho canônico
  // pending→claimed→delivered do orders.service (emite WS pra sessão).
  imports: [TenantModule, RedisModule, CallerResolverModule, OrdersModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService, StaffOrSessionGuard],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
