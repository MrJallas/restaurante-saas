import { Module } from '@nestjs/common';
import { TenantConnectionProvider } from './tenant-connection.provider';

@Module({
  providers: [TenantConnectionProvider],
  exports: [TenantConnectionProvider],
})
export class TenantModule {}
