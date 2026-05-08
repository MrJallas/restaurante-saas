import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { LateArrivalController } from './late-arrival.controller';
import { LateArrivalService } from './late-arrival.service';

@Module({
  imports: [TenantModule, RedisModule],
  controllers: [LateArrivalController],
  providers: [LateArrivalService],
  exports: [LateArrivalService],
})
export class LateArrivalModule {}
