import { Module } from '@nestjs/common';
import { ManagerAccountController } from './manager-account.controller';
import { ManagerAccountService } from './manager-account.service';

@Module({
  controllers: [ManagerAccountController],
  providers: [ManagerAccountService],
})
export class ManagerAccountModule {}
