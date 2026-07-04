import { Module } from '@nestjs/common';
import { TimelineStoreService } from './timeline-store.service';
import { TimelineTapService } from './timeline-tap.service';

/**
 * M4 (timeline) — módulo do event-store de sessão.
 *
 * NÃO é @Global de propósito (menor superfície): o único consumidor do tap é
 * o EventsEmitterService, então quem importa é só o WebsocketModule. Tornar
 * isto @Global exporia o tap ao app inteiro sem necessidade — e o caminho
 * certo pra novos eventos entrarem na timeline é ganhar um emit* no emitter
 * (que já é a malha global), não injetar o tap avulso.
 *
 * MongoService chega via MongoModule @Global (mesmo padrão do chat-history).
 * O store fica privado — só o tap escreve; leitura (API da timeline) é fatia
 * futura.
 */
@Module({
  providers: [TimelineStoreService, TimelineTapService],
  exports: [TimelineTapService],
})
export class SessionTimelineModule {}
