import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { StaffMessagesController } from './staff-messages.controller';
import { StaffMessagesService } from './staff-messages.service';

@Module({
  imports: [TenantModule],
  controllers: [StaffMessagesController],
  providers: [StaffMessagesService],
  exports: [StaffMessagesService],
})
export class StaffMessagesModule {}
