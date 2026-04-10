import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [TenantModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
