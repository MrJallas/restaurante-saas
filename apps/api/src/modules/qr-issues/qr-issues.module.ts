import { Module } from '@nestjs/common';
import { RedisModule } from '../../infra/redis/redis.module';
import { TenantModule } from '../tenant/tenant.module';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { QrIssuesController } from './qr-issues.controller';
import { QrIssuesService } from './qr-issues.service';

/**
 * Round 18 (Onda 4 batch 1 wiring): persistencia real do qr-issues.
 * Antes era stub (GET [], POST fake id) — agora persiste em `qr_issues`
 * (migration 044) e o GET filtra por `?status=`.
 */
@Module({
  imports: [RedisModule, TenantModule, CallerResolverModule],
  controllers: [QrIssuesController],
  providers: [QrIssuesService, StaffOrSessionGuard],
  exports: [QrIssuesService],
})
export class QrIssuesModule {}
