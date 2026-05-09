import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { StaffMessagesController } from './staff-messages.controller';
import { StaffMessagesService } from './staff-messages.service';

@Module({
  // Round 10 (B-NEW-49): CallerResolverModule pra resolver staffId.
  imports: [TenantModule, CallerResolverModule],
  controllers: [StaffMessagesController],
  providers: [StaffMessagesService],
  exports: [StaffMessagesService],
})
export class StaffMessagesModule {}
