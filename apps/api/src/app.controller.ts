import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { recordPgQuery } from './common/performance/request-timing';
import { RedisService } from './infra/redis/redis.service';

@Controller()
export class AppController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'api', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready() {
    const checks: Record<string, 'ok' | 'fail'> = {};

    try {
      const startedAt = process.hrtime.bigint();
      try {
        await this.dataSource.query('SELECT 1');
      } finally {
        recordPgQuery(startedAt);
      }
      checks.database = 'ok';
    } catch {
      checks.database = 'fail';
    }

    checks.redis = (await this.redis.ping()) ? 'ok' : 'fail';

    const allOk = Object.values(checks).every((s) => s === 'ok');
    return {
      status: allOk ? 'ready' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
