import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { ChatHistoryModule } from '../chat-history/chat-history.module';
import { CustomerStaffMessagesModule } from '../customer-staff-messages/customer-staff-messages.module';
import { LgpdModule } from '../lgpd/lgpd.module';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  // ChatHistoryModule provê ChatHistoryService.appendTurn pra dual-write
  // Postgres → Mongo (P1 #B-6 round 3 fix). Antes só LgpdService importava.
  // Round 11 (B-NEW-57): CallerResolverModule pro cookie ownership.
  // CustomerStaffMessagesModule expõe o service que faz persistência
  // paralela em Mongo da inbox "Mensagens com a equipe" — best-effort,
  // não bloqueia o realtime path (Postgres + WS).
  imports: [
    TenantModule,
    ChatHistoryModule,
    CustomerStaffMessagesModule,
    LgpdModule,
    CallerResolverModule,
  ],
  controllers: [AssistantController],
  providers: [AssistantService],
  exports: [AssistantService],
})
export class AssistantModule {}
