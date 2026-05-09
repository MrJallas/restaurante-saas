import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { CustomersModule } from '../customers/customers.module';
import { LateArrivalController } from './late-arrival.controller';
import { LateArrivalService } from './late-arrival.service';

@Module({
  // Round 6 (B-NEW-12): CustomersModule importado pra resolver
  // recognition_token cookie → customerId no host check.
  imports: [TenantModule, RedisModule, CustomersModule],
  controllers: [LateArrivalController],
  providers: [LateArrivalService],
  exports: [LateArrivalService],
})
export class LateArrivalModule {}
