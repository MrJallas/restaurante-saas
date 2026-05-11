import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { ContinuationController } from './continuation.controller';
import { ContinuationService } from './continuation.service';

/**
 * Round 18 — wires `POST /:slug/continuation` so the customer-facing
 * `/assistente` landing can fetch the V20 contextual greeting. Depends
 * on TenantModule for the per-request `TenantConnectionProvider` used
 * to derive the kind from DB state. The AI service client is invoked
 * directly via `fetch` (same pattern as `home.service.ts`) so we don't
 * have to extend `AiServiceClient` for a single proxy call.
 */
@Module({
  imports: [TenantModule],
  controllers: [ContinuationController],
  providers: [ContinuationService],
})
export class ContinuationModule {}
