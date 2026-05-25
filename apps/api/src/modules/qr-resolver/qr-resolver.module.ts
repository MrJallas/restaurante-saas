import { Module } from '@nestjs/common';
import { TableSessionModule } from '../table-session/table-session.module';
import { QrResolverController } from './qr-resolver.controller';
import { QrResolverService } from './qr-resolver.service';

@Module({
  imports: [TableSessionModule],
  controllers: [QrResolverController],
  providers: [QrResolverService],
})
export class QrResolverModule {}
