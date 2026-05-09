import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { TableMergeController } from './table-merge.controller';
import { StaffTableMergeController } from './staff-table-merge.controller';
import { TableMergeService } from './table-merge.service';

@Module({
  // Round 8 (B-NEW-27): CallerResolverModule pra resolver caller customerId.
  imports: [TenantModule, RedisModule, CallerResolverModule],
  // StaffTableMergeController expõe POST /:slug/staff/table-merges/force
  // pra override de manager (V16 spec). Customer-side stays separate.
  controllers: [TableMergeController, StaffTableMergeController],
  // Round 7 (B-NEW-22): ManagerOnlyGuard registrado pro DI lookup.
  providers: [TableMergeService, ManagerOnlyGuard],
  exports: [TableMergeService],
})
export class TableMergeModule {}
