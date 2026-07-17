import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Db } from 'mongodb';
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

/**
 * Round 22 §B — FIFO cap por customer. Mongo TTL ainda dropa após 30d,
 * mas um cliente muito ativo (1 thread/dia) acumularia ~30 mesmo dentro
 * do TTL; uma vez que entrarmos em uso real isso cresce indefinidamente.
 * O cap dá controle previsível de storage independente do tempo.
 *
 * Aplicado apenas quando uma NOVA thread é criada (upsert resultou em
 * insert) — assim a query de contagem não roda a cada turno dentro de
 * uma conversa já existente.
 */
const FIFO_MAX_THREADS_PER_CUSTOMER = 80;

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
  tenantId: string;
  role: string;
  content: string;
  toolCalls?: unknown[];
  suggestionChips?: string[];
  linkedItems?: unknown[];
  createdAt: Date;
  expiresAt: Date;
}

function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLegacyDayBucketThread(thread: ThreadDoc, tenantId: string, customerId: string): boolean {
  const prefix = `${tenantId}:${customerId}:`;
  if (!thread.threadId.startsWith(prefix)) return false;
  const suffix = thread.threadId.slice(prefix.length);
  return /^\d{4}-\d{2}-\d{2}$/.test(suffix);
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
   * @param ctx.continueThreadId opcional — usado só quando o cliente veio
   *   do menu de conversas arquivadas e decidiu continuar aquele thread.
   * @param ctx.conversationId opcional — id gerado no FE por abertura do
   *   assistente; entrada normal em `/assistente` vira thread nova.
   */
  private indexesEnsured = false;

  /**
   * FASE 3 (auditoria): o TTL de 30d dependia SÓ do mongo-init.js (roda no
   * PRIMEIRO boot do volume) — volume criado antes do script nunca ganhava
   * o índice e o chat virava para-sempre. Idempotente e lazy no primeiro
   * write, soft-fail como o resto do serviço.
   */
  private async ensureIndexes(): Promise<void> {
    if (this.indexesEnsured) return;
    const db = this.mongo.tryDb();
    if (!db) return;
    try {
      await db
        .collection<ThreadDoc>(THREADS_COLLECTION)
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await db
        .collection<MessageDoc>(MESSAGES_COLLECTION)
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await db
        .collection<MessageDoc>(MESSAGES_COLLECTION)
        .createIndex({ threadId: 1, createdAt: 1 });
      this.indexesEnsured = true;
    } catch (err) {
      this.logger?.warn?.(`Falha ao garantir TTL index do chat: ${(err as Error).message}`);
    }
  }

  async appendTurn(ctx: {
    tenantId: string;
    customerId: string;
    sessionId: string;
    conversationId?: string | null;
    continueThreadId?: string | null;
    userMessage: string;
    assistantResponse: string;
    toolCalls?: unknown[] | null;
    suggestionChips?: string[] | null;
    linkedItems?: unknown[] | null;
  }): Promise<void> {
    const db = this.mongo.tryDb();
    if (!db) {
      // Não bloqueia o flow do customer — apenas log warn.
      this.logger.warn(`Mongo offline · skipping chat persist for customer ${ctx.customerId}`);
      return;
    }

    // Bug 2026-07-04: o ensureIndexes existia mas (a) recursava em si mesmo
    // e (b) NINGUÉM o chamava — o índice TTL de 30d (LGPD) nunca nascia em
    // volume criado antes do mongo-init.js. Garantido aqui, no write.
    await this.ensureIndexes();

    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000);
      let threadId: string | null = null;

      const requestedThreadId = ctx.continueThreadId?.trim();
      if (requestedThreadId) {
        const existingThread = await db.collection<ThreadDoc>(THREADS_COLLECTION).findOne({
          threadId: requestedThreadId,
          customerId: ctx.customerId,
          tenantId: ctx.tenantId,
          deletedByUser: { $ne: true },
        });
        if (existingThread) {
          threadId = requestedThreadId;
        } else {
          this.logger.warn(`Ignoring invalid continueThreadId for customer ${ctx.customerId}`);
        }
      }

      if (!threadId) {
        // Normal assistant opens use the per-visit conversation id from the
        // FE. Legacy callers without conversationId now fall back to the
        // session id, not a day bucket, so multiple conversations on the
        // same date do not collapse into one historical thread.
        const bucket = ctx.conversationId?.trim() || ctx.sessionId?.trim() || randomUUID();
        threadId = `${ctx.tenantId}:${ctx.customerId}:${bucket}`;
      }

      // Upsert thread — incrementa messageCount em 2 (user + assistant).
      const previewSource = ctx.userMessage.slice(0, 80);
      const upsertResult = await db.collection<ThreadDoc>(THREADS_COLLECTION).updateOne(
        { threadId, tenantId: ctx.tenantId, customerId: ctx.customerId },
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

      // Round 22 §B · FIFO 80 cleanup quando uma nova thread foi criada.
      // Só corre quando uma thread nova nasceu (upsert virou insert), pra
      // não fazer count em todo turno. Erros aqui são best-effort — log e
      // continua (não falhar o append por causa do cleanup).
      if (upsertResult.upsertedId) {
        this.pruneOldestThreads(db, ctx.tenantId, ctx.customerId).catch((err) => {
          this.logger.warn(
            `FIFO 80 prune falhou pra customer ${ctx.customerId}: ${(err as Error).message}`,
          );
        });
      }

      // Append user + assistant docs in 1 ordered insertMany.
      const docs: MessageDoc[] = [
        {
          messageId: randomUUID(),
          threadId,
          customerId: ctx.customerId,
          tenantId: ctx.tenantId,
          role: 'user',
          content: ctx.userMessage,
          createdAt: now,
          expiresAt,
        },
        {
          messageId: randomUUID(),
          threadId,
          customerId: ctx.customerId,
          tenantId: ctx.tenantId,
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
      this.logger.warn(`Falha ao persistir chat turn em Mongo: ${(err as Error).message}`);
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

    const modernDays = new Set(
      threads
        .filter((t) => !isLegacyDayBucketThread(t, tenantId, customerId))
        .map((t) => dayKey(t.lastMessageAt)),
    );
    const visibleThreads = threads.filter((t) => {
      if (!isLegacyDayBucketThread(t, tenantId, customerId)) return true;
      return !modernDays.has(dayKey(t.lastMessageAt));
    });

    return visibleThreads.map((t) => ({
      threadId: t.threadId,
      startedAt: t.startedAt.toISOString(),
      lastMessageAt: t.lastMessageAt.toISOString(),
      messageCount: t.messageCount,
      preview: t.preview ?? '',
      expiresAt: t.expiresAt.toISOString(),
    }));
  }

  async listMessages(threadId: string, customerId: string, tenantId: string) {
    const db = this.requireDb();
    const msgs = await db
      .collection<MessageDoc>(MESSAGES_COLLECTION)
      .find({
        threadId,
        customerId,
        // MessageDoc legado não tinha tenantId; o threadId já foi validado
        // contra um ThreadDoc `{tenantId, customerId}` antes desta leitura.
        $or: [{ tenantId }, { tenantId: { $exists: false } }],
      })
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
  async listMessagesForCustomer(threadId: string, customerId: string, tenantId: string) {
    const db = this.requireDb();
    const thread = await db
      .collection<ThreadDoc>(THREADS_COLLECTION)
      .findOne({ threadId, customerId, tenantId });
    if (!thread) {
      throw new HttpException('Conversa não encontrada.', HttpStatus.NOT_FOUND);
    }
    return this.listMessages(threadId, customerId, tenantId);
  }

  /**
   * Single thread delete · cascades messages. Soft-marks the thread doc with
   * `deletedByUser=true` for audit trail and removes message docs.
   */
  async deleteThread(threadId: string, customerId: string, tenantId: string) {
    const db = this.requireDb();
    const thread = await db
      .collection<ThreadDoc>(THREADS_COLLECTION)
      .findOne({ threadId, customerId, tenantId });
    if (!thread) {
      throw new HttpException('Conversa não encontrada.', HttpStatus.NOT_FOUND);
    }
    const messages = await db.collection<MessageDoc>(MESSAGES_COLLECTION).deleteMany({
      threadId,
      customerId,
      $or: [{ tenantId }, { tenantId: { $exists: false } }],
    });
    await db
      .collection<ThreadDoc>(THREADS_COLLECTION)
      .updateOne(
        { threadId, customerId, tenantId },
        { $set: { deletedByUser: true, deletedAt: new Date() } },
      );
    return {
      deletedAt: new Date().toISOString(),
      messagesDeleted: messages.deletedCount ?? 0,
    };
  }

  /**
   * Bulk delete usado pelo fluxo LGPD. Faz hard-delete e confirma por leitura
   * residual antes de permitir que a request seja marcada fulfilled.
   *
   * Mensagens novas têm tenantId explícito. Para docs legados sem tenantId,
   * aceitamos somente o prefixo determinístico `tenant:customer:` do threadId;
   * isso apaga o legado correto sem alcançar outro tenant com o mesmo UUID.
   */
  async deleteAllForCustomer(customerId: string, tenantId: string) {
    const db = this.mongo.tryDb();
    if (!db) {
      // Mongo offline — for the LGPD path we still want to record the request;
      // surface a soft-failure that the caller can interpret.
      this.logger.warn(
        `LGPD erasure for customer ${customerId} — Mongo offline, no chat data deleted`,
      );
      return {
        deletedCount: 0,
        threadsDeleted: 0,
        messagesRemaining: null,
        threadsRemaining: null,
        mongoAvailable: false,
        confirmed: false,
      };
    }
    const legacyPrefix = new RegExp(`^${escapeRegExp(tenantId)}:${escapeRegExp(customerId)}:`);
    const messageFilter = {
      customerId,
      $or: [{ tenantId }, { threadId: { $regex: legacyPrefix } }],
    };
    const threadFilter = { tenantId, customerId };
    const messages = await db.collection<MessageDoc>(MESSAGES_COLLECTION).deleteMany(messageFilter);
    const threadsRes = await db.collection<ThreadDoc>(THREADS_COLLECTION).deleteMany(threadFilter);
    const [messagesRemaining, threadsRemaining] = await Promise.all([
      db.collection<MessageDoc>(MESSAGES_COLLECTION).countDocuments(messageFilter),
      db.collection<ThreadDoc>(THREADS_COLLECTION).countDocuments(threadFilter),
    ]);
    return {
      deletedCount: messages.deletedCount ?? 0,
      threadsDeleted: threadsRes.deletedCount ?? 0,
      messagesRemaining,
      threadsRemaining,
      mongoAvailable: true,
      confirmed: messagesRemaining === 0 && threadsRemaining === 0,
    };
  }

  /**
   * Round 22 §B · FIFO 80 helper. Conta threads ativas do customer e dropa
   * (hard delete + cascade nas mensagens) o mais antigo (sort startedAt ASC)
   * quando excede o cap. Soft-mark NÃO é usado aqui — esse fluxo é storage
   * cap, e threads soft-marked ainda contariam pro cap. Diff é claro vs.
   * `deleteThread` (user-initiated, soft-mark pra audit) e LGPD erasure.
   *
   * "Ativas" = `deletedByUser !== true`. Threads que o customer já dropou
   * via UI não atrapalham o FIFO — não conta nelas.
   *
   * Best-effort: erros aqui são caught pelo caller (appendTurn) e logados,
   * não interrompem a persistência do turno.
   */
  private async pruneOldestThreads(db: Db, tenantId: string, customerId: string): Promise<void> {
    const filter = { tenantId, customerId, deletedByUser: { $ne: true } };
    const count = await db.collection<ThreadDoc>(THREADS_COLLECTION).countDocuments(filter);
    if (count <= FIFO_MAX_THREADS_PER_CUSTOMER) return;

    const excess = count - FIFO_MAX_THREADS_PER_CUSTOMER;
    const oldest = await db
      .collection<ThreadDoc>(THREADS_COLLECTION)
      .find(filter)
      .sort({ startedAt: 1 })
      .limit(excess)
      .project<{ threadId: string }>({ threadId: 1, _id: 0 })
      .toArray();
    const threadIds = oldest.map((t) => t.threadId);
    if (threadIds.length === 0) return;

    // Cascade nas mensagens primeiro (se threads sair antes, perdemos o
    // link e mensagens ficam órfãs até o TTL de 30d expirar).
    await db.collection<MessageDoc>(MESSAGES_COLLECTION).deleteMany({
      tenantId,
      customerId,
      threadId: { $in: threadIds },
    });
    await db
      .collection<ThreadDoc>(THREADS_COLLECTION)
      .deleteMany({ tenantId, customerId, threadId: { $in: threadIds } });

    this.logger.warn(
      `FIFO 80 · dropped ${threadIds.length} oldest thread(s) for customer ${customerId} (count=${count}, cap=${FIFO_MAX_THREADS_PER_CUSTOMER})`,
    );
  }

  private requireDb() {
    const db = this.mongo.tryDb();
    if (!db) {
      throw new HttpException('Servico de historico indisponivel.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return db;
  }
}
