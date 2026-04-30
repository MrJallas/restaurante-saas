import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { TableSessionController } from './table-session.controller';
import { TableController } from './table.controller';
import { TableSessionService } from './table-session.service';
import { QrCodeService } from './qr-code.service';

@Module({
  imports: [TenantModule, WebsocketModule],
  controllers: [TableSessionController, TableController],
  providers: [TableSessionService, QrCodeService],
  exports: [TableSessionService, QrCodeService],
})
export class TableSessionModule {}
