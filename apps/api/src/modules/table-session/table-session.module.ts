import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { ScanVerificationModule } from '../scan-verification/scan-verification.module';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { TableSessionController } from './table-session.controller';
import { TableController } from './table.controller';
import { TableSessionService } from './table-session.service';
import { QrCodeService } from './qr-code.service';

@Module({
  // Round 12 (B-NEW-62): CallerResolverModule pra resolver hostCustomerId
  // do cookie em vez de aceitar via body em decideJoinRequest.
  imports: [TenantModule, WebsocketModule, CallerResolverModule, ScanVerificationModule],
  controllers: [TableSessionController, TableController],
  providers: [TableSessionService, QrCodeService],
  exports: [TableSessionService, QrCodeService],
})
export class TableSessionModule {}
