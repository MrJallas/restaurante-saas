import { Module } from '@nestjs/common';
import { RedisModule } from '../../infra/redis/redis.module';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { QrIssuesController } from './qr-issues.controller';

/**
 * P1 #17 — Stub module so the FE-defined `POST /:slug/qr-issues` and
 * `GET /:slug/qr-issues` routes resolve instead of 404'ing. The
 * controller is intentionally light (no service/persistence) — when the
 * real pipeline lands the implementation can be filled in without
 * touching the routing wiring.
 */
@Module({
  imports: [RedisModule],
  controllers: [QrIssuesController],
  providers: [StaffOrSessionGuard],
})
export class QrIssuesModule {}
