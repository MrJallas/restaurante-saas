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
import { PaymentsModule } from './modules/payments/payments.module';
import { FeedbacksModule } from './modules/feedbacks/feedbacks.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { StaffModule } from './modules/staff/staff.module';
import { MongoModule } from './infra/mongo/mongo.module';
import { LateArrivalModule } from './modules/late-arrival/late-arrival.module';
import { TableMergeModule } from './modules/table-merge/table-merge.module';
import { LgpdModule } from './modules/lgpd/lgpd.module';
import { ComplaintsModule } from './modules/complaints/complaints.module';
import { OrderRatingsModule } from './modules/order-ratings/order-ratings.module';
import { StaffMessagesModule } from './modules/staff-messages/staff-messages.module';
import { ZonePauseModule } from './modules/zone-pause/zone-pause.module';
import { VipModule } from './modules/vip/vip.module';
import { ChatHistoryModule } from './modules/chat-history/chat-history.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { QrIssuesModule } from './modules/qr-issues/qr-issues.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(databaseConfig),
    RedisModule,
    MongoModule,
    AiModule,
    WebsocketModule,
    TenantModule,
    TableSessionModule,
    CustomersModule,
    HomeModule,
    SettingsModule,
    MenuModule,
    // OrdersModule depends on OrderRatingsModule via forwardRef. Both are
    // listed here; Nest figures out the resolution order.
    OrderRatingsModule,
    OrdersModule,
    WaiterCallsModule,
    DeliveriesModule,
    AssistantModule,
    PaymentsModule,
    FeedbacksModule,
    PromotionsModule,
    DashboardModule,
    StaffModule,
    // Phase 2 modules:
    LateArrivalModule,
    TableMergeModule,
    ChatHistoryModule,
    LgpdModule,
    ComplaintsModule,
    StaffMessagesModule,
    ZonePauseModule,
    VipModule,
    JobsModule,
    QrIssuesModule,
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
