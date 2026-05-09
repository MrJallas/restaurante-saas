import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { ChatHistoryModule } from '../chat-history/chat-history.module';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  // ChatHistoryModule provê ChatHistoryService.appendTurn pra dual-write
  // Postgres → Mongo (P1 #B-6 round 3 fix). Antes só LgpdService importava.
  // Round 11 (B-NEW-57): CallerResolverModule pro cookie ownership.
  imports: [TenantModule, ChatHistoryModule, CallerResolverModule],
  controllers: [AssistantController],
  providers: [AssistantService],
  exports: [AssistantService],
})
export class AssistantModule {}
