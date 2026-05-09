import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  // Round 12 (B-NEW-63): CallerResolverModule pra derivar customerId do
  // cookie em vez de aceitar via ?customerId=&lt;UUID&gt; query.
  imports: [TenantModule, CallerResolverModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
