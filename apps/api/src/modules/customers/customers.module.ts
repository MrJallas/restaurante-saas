import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { TableSessionModule } from '../table-session/table-session.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [TenantModule, TableSessionModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
