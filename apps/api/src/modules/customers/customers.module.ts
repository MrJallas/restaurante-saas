import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { TableSessionModule } from '../table-session/table-session.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  // Round 6 (B-NEW-11): RedisModule importado pra rate-limit do
  // /customer/identify (Redis incr+expire pattern).
  imports: [TenantModule, TableSessionModule, RedisModule],
  controllers: [CustomersController],
  // Round 10 (B-NEW-48): ManagerOnlyGuard registrado pro DI lookup
  // (precisa TenantConnectionProvider). Rotas markVip/unmarkVip exigem
  // role manager, não apenas staff-key.
  providers: [CustomersService, ManagerOnlyGuard],
  exports: [CustomersService],
})
export class CustomersModule {}
