import { Module } from '@nestjs/common';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { TenantModule } from '../tenant/tenant.module';
import { ManagerAccountController } from './manager-account.controller';
import { ManagerAccountService } from './manager-account.service';

@Module({
  imports: [TenantModule, CallerResolverModule],
  controllers: [ManagerAccountController],
  providers: [ManagerAccountService],
})
export class ManagerAccountModule {}
