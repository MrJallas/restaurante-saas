import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { ScanVerificationController } from './scan-verification.controller';
import { ScanVerificationService } from './scan-verification.service';

@Module({
  imports: [TenantModule],
  controllers: [ScanVerificationController],
  providers: [ScanVerificationService],
  exports: [ScanVerificationService],
})
export class ScanVerificationModule {}
