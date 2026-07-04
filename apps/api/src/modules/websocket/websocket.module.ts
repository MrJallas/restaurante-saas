import { Module, Global } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { EventsEmitterService } from './events-emitter.service';
import { SessionTimelineModule } from '../session-timeline/session-timeline.module';

@Global()
@Module({
  // M4 (timeline): SessionTimelineModule NÃO é @Global — o tap só existe pro
  // emitter, então importa aqui (menor superfície; ver comentário no módulo).
  imports: [SessionTimelineModule],
  providers: [EventsGateway, EventsEmitterService],
  exports: [EventsGateway, EventsEmitterService],
})
export class WebsocketModule {}
