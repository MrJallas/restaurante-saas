import { Module } from '@nestjs/common';
import { RedisModule } from '../../infra/redis/redis.module';
import { CustomersModule } from '../customers/customers.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { CustomerStaffMessagesController } from './customer-staff-messages.controller';
import { CustomerStaffMessagesService } from './customer-staff-messages.service';

/**
 * Customer-facing staff message inbox (NoSQL · 30d TTL).
 *
 * Mongo is registered globally via `MongoModule` (see `app.module.ts`) so
 * no import is needed here. WebsocketModule provides the optional
 * `EventsGateway` injected into the service for the customer-reply WS
 * fanout. RedisModule + CustomersModule mirror the chat-history module —
 * `CustomersService.resolveByRecognitionToken` powers the ownership check
 * in the controller (cookie → customerId).
 */
@Module({
  imports: [RedisModule, CustomersModule, WebsocketModule],
  controllers: [CustomerStaffMessagesController],
  providers: [CustomerStaffMessagesService],
  exports: [CustomerStaffMessagesService],
})
export class CustomerStaffMessagesModule {}
