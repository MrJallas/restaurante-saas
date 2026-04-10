import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { TableSessionController } from './table-session.controller';
import { TableSessionService } from './table-session.service';
import { QrCodeService } from './qr-code.service';

@Module({
  imports: [TenantModule],
  controllers: [TableSessionController],
  providers: [TableSessionService, QrCodeService],
  exports: [TableSessionService, QrCodeService],
})
export class TableSessionModule {}
