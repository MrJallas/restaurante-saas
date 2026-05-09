import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { ComplaintsController } from './complaints.controller';
import { ComplaintsService } from './complaints.service';

@Module({
  // Round 8 (B-NEW-27): CallerResolverModule pra resolver cookie → customerId.
  imports: [TenantModule, RedisModule, CallerResolverModule],
  controllers: [ComplaintsController],
  // Round 7 (B-NEW-22): ManagerOnlyGuard registrado como provider pra
  // que Nest possa injetar TenantConnectionProvider (DI deps do guard).
  providers: [ComplaintsService, ManagerOnlyGuard],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}
