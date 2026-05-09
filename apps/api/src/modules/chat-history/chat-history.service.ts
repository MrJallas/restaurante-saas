import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MongoService } from '../../infra/mongo/mongo.service';

const THREADS_COLLECTION = 'chat_threads';
const MESSAGES_COLLECTION = 'chat_messages';

/**
 * Default TTL for chat docs · 30 days. Per docs/features/chat-history-lgpd.md
 * (lines 4, 38, 228, 290, 299, 314) o canon LGPD é 30d — antes estava 90d
 * (round 5 B-NEW-15 fix). Discrepância violava transparência ANPD: UI
 * promete "30 dias" mas guardava 90. Customer pode erase earlier via tool;
 * caso contrário Mongo TTL index dropa o doc após 30d.
 */
const DEFAULT_TTL_DAYS = 30;

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

  /**
   * Append a (user_message, assistant_response) pair from `assistant.service`
   * to Mongo. Soft-failure: if Mongo is offline, log + skip — Postgres
   * remains the source of truth. P1 #B-6 fix (round 3): antes ninguém
   * chamava esse método e a collection ficava em 0 docs apesar do flow
   * rodar.
   *
   * @param ctx.threadId opcional — quando ausente, criamos uma nova thread
   *   pelo par (tenantId, customerId, day-bucket). Customer com 5 idas no
   *   mesmo dia compartilha thread; nova visita amanhã abre thread nova.
   */
  async appendTurn(ctx: {
    tenantId: string;
    customerId: string;
    sessionId: string;
    userMessage: string;
    assistantResponse: string;
    toolCalls?: unknown[] | null;
    suggestionChips?: string[] | null;
    linkedItems?: unknown[] | null;
  }): Promise<void> {
    const db = this.mongo.tryDb();
    if (!db) {
      // Não bloqueia o flow do customer — apenas log warn.
      this.logger.warn(
        `Mongo offline · skipping chat persist for customer ${ctx.customerId}`,
      );
      return;
    }

    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000);
      // Day bucket: AAAA-MM-DD UTC. Cada visita cria thread nova quando
      // muda o dia, mantendo turnos da mesma visita agrupados.
      const dayBucket = now.toISOString().slice(0, 10);
      const threadId = `${ctx.tenantId}:${ctx.customerId}:${dayBucket}`;

      // Upsert thread — incrementa messageCount em 2 (user + assistant).
      const previewSource = ctx.userMessage.slice(0, 80);
      await db.collection<ThreadDoc>(THREADS_COLLECTION).updateOne(
        { threadId },
        {
          $setOnInsert: {
            threadId,
            customerId: ctx.customerId,
            tenantId: ctx.tenantId,
            startedAt: now,
            expiresAt,
          },
          $set: { lastMessageAt: now, preview: previewSource },
          $inc: { messageCount: 2 },
        },
        { upsert: true },
      );

      // Append user + assistant docs in 1 ordered insertMany.
      const docs: MessageDoc[] = [
        {
          messageId: randomUUID(),
          threadId,
          customerId: ctx.customerId,
          role: 'user',
          content: ctx.userMessage,
          createdAt: now,
          expiresAt,
        },
        {
          messageId: randomUUID(),
          threadId,
          customerId: ctx.customerId,
          role: 'assistant',
          content: ctx.assistantResponse,
          toolCalls: ctx.toolCalls ?? undefined,
          suggestionChips: ctx.suggestionChips ?? undefined,
          linkedItems: ctx.linkedItems ?? undefined,
          // 1ms shift so FE sort by createdAt mantém user antes de assistant
          // mesmo quando os 2 doc Date acabam idênticos no clock granularity.
          createdAt: new Date(now.getTime() + 1),
          expiresAt,
        },
      ];
      await db.collection<MessageDoc>(MESSAGES_COLLECTION).insertMany(docs);
    } catch (err) {
      // Persist é best-effort — não derruba o turn do customer.
      this.logger.warn(
        `Falha ao persistir chat turn em Mongo: ${(err as Error).message}`,
      );
    }
  }

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
   * Round 5 (B-NEW-16): ownership-checked variant. Antes
   * `listMessages(threadId)` retornava mensagens de qualquer thread
   * conhecendo só o id (que é determinístico `tenantId:customerId:date`).
   * Agora valida que `thread.customerId === customerId`. 404 sem vazar
   * existência (não distingue "thread não existe" de "thread não é sua").
   */
  async listMessagesForCustomer(threadId: string, customerId: string) {
    const db = this.requireDb();
    const thread = await db
      .collection<ThreadDoc>(THREADS_COLLECTION)
      .findOne({ threadId });
    if (!thread || thread.customerId !== customerId) {
      throw new HttpException('Thread nao encontrada.', HttpStatus.NOT_FOUND);
    }
    return this.listMessages(threadId);
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
