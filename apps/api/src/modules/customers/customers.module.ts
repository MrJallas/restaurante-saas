import { Module, forwardRef } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { TableSessionModule } from '../table-session/table-session.module';
import { RedisModule } from '../../infra/redis/redis.module';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { CallerResolverModule } from '../../common/services/caller-resolver.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

/**
 * Round 18 (P0 runtime fix): `forwardRef(() => TableSessionModule)`
 * complementa o forwardRef em `CallerResolverModule.imports` pra quebrar
 * o ciclo `CustomersModule -> TableSessionModule -> CallerResolverModule
 * -> CustomersModule`. NestJS exige forwardRef em ambos os lados de uma
 * dependencia circular de modulo (docs/circular-dependency).
 *
 * P1-C (IDOR fix): `forwardRef(() => CallerResolverModule)` — o
 * CustomersController agora injeta CallerResolverService pra resolver o
 * customerId do CALLER pelo cookie recognition_token em /last-visit (em vez
 * do session.customerId compartilhado). CallerResolverModule já faz
 * `forwardRef(() => CustomersModule)`; NestJS exige forwardRef nos dois
 * lados do ciclo direto CustomersModule <-> CallerResolverModule.
 */
@Module({
  // Round 6 (B-NEW-11): RedisModule importado pra rate-limit do
  // /customer/identify (Redis incr+expire pattern).
  imports: [
    TenantModule,
    forwardRef(() => TableSessionModule),
    RedisModule,
    forwardRef(() => CallerResolverModule),
  ],
  controllers: [CustomersController],
  // Round 10 (B-NEW-48): ManagerOnlyGuard registrado pro DI lookup
  // (precisa TenantConnectionProvider). Rotas markVip/unmarkVip exigem
  // role manager, não apenas staff-key.
  providers: [CustomersService, ManagerOnlyGuard],
  exports: [CustomersService],
})
export class CustomersModule {}
