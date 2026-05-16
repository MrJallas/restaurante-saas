import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { CustomerEventsController } from './customer-events.controller';
import { CustomerEventsService } from './customer-events.service';

@Module({
  imports: [TenantModule, CallerResolverModule],
  controllers: [CustomerEventsController],
  providers: [CustomerEventsService],
  exports: [CustomerEventsService],
})
export class CustomerEventsModule {}
