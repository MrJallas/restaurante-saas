import { Module, forwardRef } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { OrdersController } from './orders.controller';
import { KitchenController } from './kitchen.controller';
import { OrdersService } from './orders.service';
import { ConsumptionSummaryService } from './consumption-summary.service';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { RedisThrottleGuard } from '../../common/guards/redis-throttle.guard';
import { OrderRatingsModule } from '../order-ratings/order-ratings.module';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  // forwardRef pra evitar ciclo se algum dia o order-ratings precisar do
  // OrdersService. Hoje o ciclo nao existe, mas o forwardRef e barato.
  // Round 17 (B-NEW-66): CallerResolverModule pra resolver customerId do
  // cookie em createOrder (closing IDOR via dto.customerId arbitrário).
  imports: [
    TenantModule,
    RedisModule,
    CallerResolverModule,
    BillingModule,
    forwardRef(() => OrderRatingsModule),
  ],
  controllers: [OrdersController, KitchenController],
  providers: [
    OrdersService,
    ConsumptionSummaryService,
    StaffOrSessionGuard,
    ManagerOnlyGuard,
    RedisThrottleGuard,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
