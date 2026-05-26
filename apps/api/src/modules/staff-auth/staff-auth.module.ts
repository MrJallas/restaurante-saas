import { Module } from '@nestjs/common';
import { RedisModule } from '../../infra/redis/redis.module';
import { TenantModule } from '../tenant/tenant.module';
import { StaffAuthController } from './staff-auth.controller';
import { StaffAuthService } from './staff-auth.service';

@Module({
  imports: [TenantModule, RedisModule],
  controllers: [StaffAuthController],
  providers: [StaffAuthService],
})
export class StaffAuthModule {}
