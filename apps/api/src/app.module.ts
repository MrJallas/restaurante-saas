import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { databaseConfig } from './config/database.config';
import { RedisModule } from './infra/redis/redis.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { TenantMiddleware } from './modules/tenant/tenant.middleware';
import { TableSessionModule } from './modules/table-session/table-session.module';
import { CustomersModule } from './modules/customers/customers.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(databaseConfig),
    RedisModule,
    TenantModule,
    TableSessionModule,
    CustomersModule,
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
