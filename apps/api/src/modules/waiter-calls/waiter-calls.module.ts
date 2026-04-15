import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { WaiterCallsController } from './waiter-calls.controller';
import { WaiterCallsService } from './waiter-calls.service';

@Module({
  imports: [TenantModule],
  controllers: [WaiterCallsController],
  providers: [WaiterCallsService],
  exports: [WaiterCallsService],
})
export class WaiterCallsModule {}
