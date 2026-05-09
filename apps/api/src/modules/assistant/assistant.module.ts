import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { ChatHistoryModule } from '../chat-history/chat-history.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  // ChatHistoryModule provê ChatHistoryService.appendTurn pra dual-write
  // Postgres → Mongo (P1 #B-6 round 3 fix). Antes só LgpdService importava.
  imports: [TenantModule, ChatHistoryModule],
  controllers: [AssistantController],
  providers: [AssistantService],
  exports: [AssistantService],
})
export class AssistantModule {}
