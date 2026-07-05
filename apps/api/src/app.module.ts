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
import { SecurityAuditModule } from './modules/security-audit/security-audit.module';
import { LateArrivalModule } from './modules/late-arrival/late-arrival.module';
import { ScanVerificationModule } from './modules/scan-verification/scan-verification.module';
import { QrResolverModule } from './modules/qr-resolver/qr-resolver.module';
import { TableMergeModule } from './modules/table-merge/table-merge.module';
import { LgpdModule } from './modules/lgpd/lgpd.module';
import { ComplaintsModule } from './modules/complaints/complaints.module';
import { OrderRatingsModule } from './modules/order-ratings/order-ratings.module';
import { StaffMessagesModule } from './modules/staff-messages/staff-messages.module';
import { ZonePauseModule } from './modules/zone-pause/zone-pause.module';
import { VipModule } from './modules/vip/vip.module';
import { ChatHistoryModule } from './modules/chat-history/chat-history.module';
import { CustomerStaffMessagesModule } from './modules/customer-staff-messages/customer-staff-messages.module';
import { CustomerEventsModule } from './modules/customer-events/customer-events.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { QrIssuesModule } from './modules/qr-issues/qr-issues.module';
import { HostModule } from './modules/host/host.module';
import { CourtesiesModule } from './modules/courtesies/courtesies.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { ContinuationModule } from './modules/continuation/continuation.module';
import { SmartSuggestionsModule } from './modules/smart-suggestions/smart-suggestions.module';
import { StaffAuthModule } from './modules/staff-auth/staff-auth.module';
import { ManagerAccountModule } from './modules/manager-account/manager-account.module';
import { SalonModule } from './modules/salon/salon.module';
import { SessionTimelineModule } from './modules/session-timeline/session-timeline.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(databaseConfig),
    RedisModule,
    MongoModule,
    SecurityAuditModule,
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
    StaffAuthModule,
    // Phase 2 modules:
    LateArrivalModule,
    ScanVerificationModule,
    QrResolverModule,
    TableMergeModule,
    ChatHistoryModule,
    CustomerStaffMessagesModule,
    CustomerEventsModule,
    LgpdModule,
    ComplaintsModule,
    StaffMessagesModule,
    ZonePauseModule,
    VipModule,
    JobsModule,
    QrIssuesModule,
    HostModule,
    CourtesiesModule,
    ShiftsModule,
    AlertsModule,
    ContinuationModule,
    SmartSuggestionsModule,
    ManagerAccountModule,
    SalonModule,
    // M6 (timeline): já entra no graph via WebsocketModule (tap), mas o
    // import explícito registra que o módulo agora expõe rotas HTTP
    // (:slug/sessions/:id/timeline e :slug/tables/:n/sessions).
    SessionTimelineModule,
  ],
  controllers: [AppController],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude({ path: 'qr/:token', method: RequestMethod.ALL })
      .forRoutes({ path: ':slug/*', method: RequestMethod.ALL });
  }
}
