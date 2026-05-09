import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { TableSessionModule } from '../table-session/table-session.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  // Round 6 (B-NEW-11): RedisModule importado pra rate-limit do
  // /customer/identify (Redis incr+expire pattern).
  imports: [TenantModule, TableSessionModule, RedisModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
