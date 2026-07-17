import { Module } from '@nestjs/common';
import { RedisModule } from '../../infra/redis/redis.module';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { ChatHistoryController } from './chat-history.controller';
import { ChatHistoryService } from './chat-history.service';

@Module({
  // Histórico é PII: CallerResolver centraliza recognition_token e mantém o
  // controller fail-closed sem fallback na identidade compartilhada da mesa.
  imports: [RedisModule, CallerResolverModule],
  controllers: [ChatHistoryController],
  providers: [ChatHistoryService],
  exports: [ChatHistoryService],
})
export class ChatHistoryModule {}
