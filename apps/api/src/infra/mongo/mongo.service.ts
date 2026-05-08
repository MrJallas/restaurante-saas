import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Db, MongoClient } from 'mongodb';

/**
 * Thin singleton wrapper over the official mongo driver. We keep one client
 * for the entire API process — reconnects are handled by the driver. The
 * connection URI defaults to the docker-compose mongo service; production
 * overrides via `MONGO_URL` env.
 */
@Injectable()
export class MongoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoService.name);
  private client?: MongoClient;
  private database?: Db;

  async onModuleInit() {
    const url = process.env.MONGO_URL ?? 'mongodb://localhost:27017';
    const dbName = process.env.MONGO_DB ?? 'restaurant_chat';
    try {
      this.client = new MongoClient(url, {
        connectTimeoutMS: 5_000,
        serverSelectionTimeoutMS: 5_000,
      });
      await this.client.connect();
      this.database = this.client.db(dbName);
      this.logger.log(`Mongo connected · db=${dbName}`);
    } catch (err) {
      // Don't crash the app if Mongo is offline — chat-history/LGPD endpoints
      // will surface the error per-request. The rest of the API stays up.
      this.logger.warn(
        `Mongo unavailable at boot — chat-history endpoints will 503 until reachable. ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.client?.close().catch(() => undefined);
  }

  /** Throws when called before `onModuleInit` succeeded. */
  db(): Db {
    if (!this.database) {
      throw new Error('Mongo client not initialized.');
    }
    return this.database;
  }

  /** Best-effort access for endpoints that prefer to surface a 503. */
  tryDb(): Db | null {
    return this.database ?? null;
  }
}
