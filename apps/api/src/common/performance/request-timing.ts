import { AsyncLocalStorage } from 'node:async_hooks';
import { NextFunction, Request, Response } from 'express';

interface RequestTimingStore {
  query_count: number;
  pg_time_ms: number;
  redis_time_ms: number;
  mongo_time_ms: number;
}

const requestTiming = new AsyncLocalStorage<RequestTimingStore>();

function elapsedMs(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function currentStore(): RequestTimingStore | undefined {
  return requestTiming.getStore();
}

export function recordPgQuery(startedAt: bigint): void {
  const store = currentStore();
  if (!store) return;
  store.query_count += 1;
  store.pg_time_ms += elapsedMs(startedAt);
}

export function recordRedisOperation(startedAt: bigint): void {
  const store = currentStore();
  if (!store) return;
  store.redis_time_ms += elapsedMs(startedAt);
}

export function recordMongoOperation(startedAt: bigint): void {
  const store = currentStore();
  if (!store) return;
  store.mongo_time_ms += elapsedMs(startedAt);
}

export function createRequestTimingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startedAt = process.hrtime.bigint();
    const store: RequestTimingStore = {
      query_count: 0,
      pg_time_ms: 0,
      redis_time_ms: 0,
      mongo_time_ms: 0,
    };

    requestTiming.run(store, () => {
      res.on('finish', () => {
        const routePath = typeof req.route?.path === 'string' ? req.route.path : undefined;
        const route = routePath
          ? `${req.baseUrl ?? ''}${routePath}`
          : req.originalUrl.split('?')[0];

        console.log(
          JSON.stringify({
            type: 'request_timing',
            method: req.method,
            route,
            status: res.statusCode,
            ms: roundMs(elapsedMs(startedAt)),
            query_count: store.query_count,
            pg_time_ms: roundMs(store.pg_time_ms),
            redis_time_ms: roundMs(store.redis_time_ms),
            mongo_time_ms: roundMs(store.mongo_time_ms),
          }),
        );
      });

      next();
    });
  };
}
