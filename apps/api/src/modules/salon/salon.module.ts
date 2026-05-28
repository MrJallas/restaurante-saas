import { Module } from '@nestjs/common';
import { RedisModule } from '../../infra/redis/redis.module';
import { TenantModule } from '../tenant/tenant.module';
import { SalonController } from './salon.controller';
import { SalonService } from './salon.service';

@Module({
  imports: [TenantModule, RedisModule],
  controllers: [SalonController],
  providers: [SalonService],
})
export class SalonModule {}
