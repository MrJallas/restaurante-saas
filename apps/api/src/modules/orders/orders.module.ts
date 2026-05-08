import { Module, forwardRef } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { OrderRatingsModule } from '../order-ratings/order-ratings.module';

@Module({
  // forwardRef pra evitar ciclo se algum dia o order-ratings precisar do
  // OrdersService. Hoje o ciclo nao existe, mas o forwardRef e barato.
  imports: [TenantModule, RedisModule, forwardRef(() => OrderRatingsModule)],
  controllers: [OrdersController],
  providers: [OrdersService, StaffOrSessionGuard],
  exports: [OrdersService],
})
export class OrdersModule {}
