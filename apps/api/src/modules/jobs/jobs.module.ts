import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TtlTickService } from './ttl-tick.service';
import { RatingPushService } from './rating-push.service';
import { PushService } from './push.service';

/**
 * JobsModule wires the recurring TTL/rating sweeper. WebsocketModule is
 * already @Global so we get `EventsGateway` injected automatically; the
 * DataSource is provided by TypeOrmModule.forRoot in AppModule.
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [TtlTickService, RatingPushService, PushService],
  exports: [PushService],
})
export class JobsModule {}
