import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { SessionTimelineController } from './session-timeline.controller';
import { SessionTimelineQueryService } from './session-timeline-query.service';
import { TimelineStoreService } from './timeline-store.service';
import { TimelineTapService } from './timeline-tap.service';

/**
 * M4/M6 (timeline) — módulo do event-store de sessão: escrita (tap) +
 * leitura (endpoints staff-side).
 *
 * NÃO é @Global de propósito (menor superfície): o único consumidor do tap é
 * o EventsEmitterService, então quem importa é só o WebsocketModule. Tornar
 * isto @Global exporia o tap ao app inteiro sem necessidade — e o caminho
 * certo pra novos eventos entrarem na timeline é ganhar um emit* no emitter
 * (que já é a malha global), não injetar o tap avulso.
 *
 * MongoService chega via MongoModule @Global (mesmo padrão do chat-history).
 * O store fica privado — só o tap escreve. A leitura (M6) é o
 * SessionTimelineQueryService: Mongo direto pra entries + Postgres via
 * TenantConnectionProvider (por isso o import do TenantModule; o provider é
 * REQUEST-scoped e borbulha o scope pro controller — mesmo arranjo do host).
 * StaffOnlyGuard resolve via RedisModule @Global, sem registro aqui.
 */
@Module({
  imports: [TenantModule],
  controllers: [SessionTimelineController],
  providers: [TimelineStoreService, TimelineTapService, SessionTimelineQueryService],
  exports: [TimelineTapService],
})
export class SessionTimelineModule {}
