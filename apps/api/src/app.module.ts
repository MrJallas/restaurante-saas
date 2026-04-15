import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { databaseConfig } from './config/database.config';
import { RedisModule } from './infra/redis/redis.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { TenantMiddleware } from './modules/tenant/tenant.middleware';
import { TableSessionModule } from './modules/table-session/table-session.module';
import { CustomersModule } from './modules/customers/customers.module';
import { HomeModule } from './modules/home/home.module';
import { SettingsModule } from './modules/settings/settings.module';
import { MenuModule } from './modules/menu/menu.module';
import { OrdersModule } from './modules/orders/orders.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { WaiterCallsModule } from './modules/waiter-calls/waiter-calls.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { AiModule } from './infra/ai/ai.module';
import { AssistantModule } from './modules/assistant/assistant.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(databaseConfig),
    RedisModule,
    AiModule,
    WebsocketModule,
    TenantModule,
    TableSessionModule,
    CustomersModule,
    HomeModule,
    SettingsModule,
    MenuModule,
    OrdersModule,
    WaiterCallsModule,
    DeliveriesModule,
    AssistantModule,
  ],
  controllers: [AppController],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes({ path: ':slug/*', method: RequestMethod.ALL });
  }
}
