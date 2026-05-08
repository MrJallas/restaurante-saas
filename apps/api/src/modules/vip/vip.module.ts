import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { VipController } from './vip.controller';
import { VipService } from './vip.service';

@Module({
  imports: [TenantModule],
  controllers: [VipController],
  providers: [VipService],
  exports: [VipService],
})
export class VipModule {}
