import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { ScanVerificationController } from './scan-verification.controller';
import { ScanVerificationService } from './scan-verification.service';
import { HostOrManagerGuard } from '../../common/guards/host-only.guard';

@Module({
  imports: [TenantModule, CallerResolverModule],
  controllers: [ScanVerificationController],
  providers: [ScanVerificationService, HostOrManagerGuard],
  exports: [ScanVerificationService],
})
export class ScanVerificationModule {}
