import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { ZonePauseController } from './zone-pause.controller';
import { ZonePauseService } from './zone-pause.service';

@Module({
  imports: [TenantModule],
  controllers: [ZonePauseController],
  providers: [ZonePauseService],
  exports: [ZonePauseService],
})
export class ZonePauseModule {}
