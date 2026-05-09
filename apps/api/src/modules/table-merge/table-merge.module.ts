import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { TableMergeController } from './table-merge.controller';
import { StaffTableMergeController } from './staff-table-merge.controller';
import { TableMergeService } from './table-merge.service';

@Module({
  imports: [TenantModule, RedisModule],
  // StaffTableMergeController expõe POST /:slug/staff/table-merges/force
  // pra override de manager (V16 spec). Customer-side stays separate.
  controllers: [TableMergeController, StaffTableMergeController],
  providers: [TableMergeService],
  exports: [TableMergeService],
})
export class TableMergeModule {}
