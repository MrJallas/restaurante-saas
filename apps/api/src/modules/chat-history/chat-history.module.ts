import { Module } from '@nestjs/common';
import { RedisModule } from '../../infra/redis/redis.module';
import { CustomersModule } from '../customers/customers.module';
import { ChatHistoryController } from './chat-history.controller';
import { ChatHistoryService } from './chat-history.service';

@Module({
  // Round 5 (B-NEW-9): CustomersModule importado pra resolver
  // recognition_token cookie → customerId no controller (ownership
  // check dos endpoints DELETE/list).
  imports: [RedisModule, CustomersModule],
  controllers: [ChatHistoryController],
  providers: [ChatHistoryService],
  exports: [ChatHistoryService],
})
export class ChatHistoryModule {}
