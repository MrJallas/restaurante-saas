import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';

@Module({
  // Round 16 (B-NEW-52): RedisModule pra rate-limit IP-based em /search.
  imports: [TenantModule, RedisModule],
  controllers: [MenuController],
  providers: [MenuService, StaffOrSessionGuard],
  exports: [MenuService],
})
export class MenuModule {}
