import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { SmartSuggestionsController } from './smart-suggestions.controller';
import { SmartSuggestionsService } from './smart-suggestions.service';

/**
 * P1 fix (2026-07-05) — wires `POST /:slug/smart-suggestions` so the manager
 * `MContactClientSheet` can fetch real AI-service chips through the
 * authenticated staff path instead of hitting the AI service directly from
 * the browser (which 401'd for lack of `x-ai-service-key` and fell back to a
 * static set forever).
 *
 * The AI-service call happens server-side in `SmartSuggestionsService`
 * (`x-ai-service-key` injected from env), same pattern as
 * `home.service.ts` / `continuation.service.ts`. `StaffOnlyGuard` needs
 * `RedisService`, which comes from the `@Global()` `RedisModule`.
 */
@Module({
  imports: [TenantModule],
  controllers: [SmartSuggestionsController],
  providers: [SmartSuggestionsService, StaffOnlyGuard],
})
export class SmartSuggestionsModule {}
