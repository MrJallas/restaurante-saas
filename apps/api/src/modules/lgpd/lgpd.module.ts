import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { ChatHistoryModule } from '../chat-history/chat-history.module';
import { CustomersModule } from '../customers/customers.module';
import { LgpdController } from './lgpd.controller';
import { LgpdService } from './lgpd.service';

@Module({
  // Round 7 (B-NEW-23): CustomersModule pra resolver recognition_token
  // cookie → customerId no controller (ownership do erasure).
  imports: [TenantModule, RedisModule, ChatHistoryModule, CustomersModule],
  controllers: [LgpdController],
  providers: [LgpdService],
  exports: [LgpdService],
})
export class LgpdModule {}
