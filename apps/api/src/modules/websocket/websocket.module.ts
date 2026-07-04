import { Module, Global } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { EventsEmitterService } from './events-emitter.service';

@Global()
@Module({
  providers: [EventsGateway, EventsEmitterService],
  exports: [EventsGateway, EventsEmitterService],
})
export class WebsocketModule {}
