import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { MongoService } from '../../infra/mongo/mongo.service';

const THREADS_COLLECTION = 'chat_threads';
const MESSAGES_COLLECTION = 'chat_messages';

interface ThreadDoc {
  threadId: string;
  customerId: string;
  tenantId: string;
  startedAt: Date;
  lastMessageAt: Date;
  messageCount: number;
  expiresAt: Date;
  preview?: string;
  deletedByUser?: boolean;
  deletedAt?: Date | null;
}

interface MessageDoc {
  messageId: string;
  threadId: string;
  customerId: string;
  role: string;
  content: string;
  toolCalls?: unknown[];
  suggestionChips?: string[];
  linkedItems?: unknown[];
  createdAt: Date;
  expiresAt: Date;
}

@Injectable()
export class ChatHistoryService {
  private readonly logger = new Logger(ChatHistoryService.name);

  constructor(private readonly mongo: MongoService) {}

  async listThreads(customerId: string, tenantId: string) {
    const db = this.requireDb();
    const threads = await db
      .collection<ThreadDoc>(THREADS_COLLECTION)
      .find({
        customerId,
        tenantId,
        deletedByUser: { $ne: true },
      })
      .sort({ lastMessageAt: -1 })
      .limit(100)
      .toArray();
    return threads.map((t) => ({
      threadId: t.threadId,
      startedAt: t.startedAt.toISOString(),
      lastMessageAt: t.lastMessageAt.toISOString(),
      messageCount: t.messageCount,
      preview: t.preview ?? '',
      expiresAt: t.expiresAt.toISOString(),
    }));
  }

  async listMessages(threadId: string) {
    const db = this.requireDb();
    const msgs = await db
      .collection<MessageDoc>(MESSAGES_COLLECTION)
      .find({ threadId })
      .sort({ createdAt: 1 })
      .toArray();
    return msgs.map((m) => ({
      messageId: m.messageId,
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls ?? null,
      suggestionChips: m.suggestionChips ?? null,
      linkedItems: m.linkedItems ?? null,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  /**
   * Single thread delete · cascades messages. Soft-marks the thread doc with
   * `deletedByUser=true` for audit trail and removes message docs.
   */
  async deleteThread(threadId: string, customerId: string) {
    const db = this.requireDb();
    const thread = await db
      .collection<ThreadDoc>(THREADS_COLLECTION)
      .findOne({ threadId });
    if (!thread || thread.customerId !== customerId) {
      throw new HttpException('Thread nao encontrada.', HttpStatus.NOT_FOUND);
    }
    const messages = await db
      .collection<MessageDoc>(MESSAGES_COLLECTION)
      .deleteMany({ threadId });
    await db
      .collection<ThreadDoc>(THREADS_COLLECTION)
      .updateOne(
        { threadId },
        { $set: { deletedByUser: true, deletedAt: new Date() } },
      );
    return {
      deletedAt: new Date().toISOString(),
      messagesDeleted: messages.deletedCount ?? 0,
    };
  }

  /**
   * Bulk delete · alias used by LGPD erasure path. Removes all message docs
   * for the customer and soft-marks every thread.
   */
  async deleteAllForCustomer(customerId: string) {
    const db = this.mongo.tryDb();
    if (!db) {
      // Mongo offline — for the LGPD path we still want to record the request;
      // surface a soft-failure that the caller can interpret.
      this.logger.warn(
        `LGPD erasure for customer ${customerId} — Mongo offline, no chat data deleted`,
      );
      return { deletedCount: 0, mongoAvailable: false };
    }
    const messages = await db
      .collection<MessageDoc>(MESSAGES_COLLECTION)
      .deleteMany({ customerId });
    const threadsRes = await db
      .collection<ThreadDoc>(THREADS_COLLECTION)
      .updateMany(
        { customerId },
        { $set: { deletedByUser: true, deletedAt: new Date() } },
      );
    return {
      deletedCount: messages.deletedCount ?? 0,
      threadsMarked: threadsRes.modifiedCount ?? 0,
      mongoAvailable: true,
    };
  }

  private requireDb() {
    const db = this.mongo.tryDb();
    if (!db) {
      throw new HttpException(
        'Servico de historico indisponivel.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return db;
  }
}
