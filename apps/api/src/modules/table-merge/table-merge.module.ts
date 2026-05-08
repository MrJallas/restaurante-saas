import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { TableMergeController } from './table-merge.controller';
import { TableMergeService } from './table-merge.service';

@Module({
  imports: [TenantModule, RedisModule],
  controllers: [TableMergeController],
  providers: [TableMergeService],
  exports: [TableMergeService],
})
export class TableMergeModule {}
