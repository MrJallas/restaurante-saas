import { HttpException, HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MongoService } from '../../infra/mongo/mongo.service';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { EventsGateway } from '../websocket/events.gateway';
import { AlertsService } from '../alerts/alerts.service';
import type {
  StaffMessageHistoryFromRole,
  StaffMessageHistoryRoleLabel,
  StaffMessageHistoryThreadDto,
  StaffMessageHistoryMessageDto,
  StaffMessageHistoryThreadDeleteResponse,
  StaffMessageHistoryDeleteResponse,
  StaffMessageHistoryReadResponse,
  StaffMessageHistoryCustomerSendResponse,
  StaffInboundThreadDto,
} from '@restaurant/shared-types';

/**
 * Customer-facing staff message inbox (NoSQL · 30d TTL). Sibling of
 * `chat-history.service.ts` (AI chat) — separate Mongo collections so the
 * customer UI can offer two distinct surfaces ("Conversas com IA" vs
 * "Mensagens com a equipe") without filtering a single mixed stream.
 *
 * Postgres `assistant_messages` (with `from_role='staff'`) remains the
 * realtime source-of-truth used by the inline `<StaffBubble>` render path
 * (`useTableSocket` handler in /assistente). This service is a parallel
 * write so the messages survive session end and show up in the customer's
 * persistent inbox. Failures here NEVER block the live flow — same
 * best-effort pattern as `ChatHistoryService.appendTurn`.
 */
const THREADS_COLLECTION = 'staff_threads';
const MESSAGES_COLLECTION = 'staff_messages';

/**
 * 30 days · matches `chat-history.service.ts::DEFAULT_TTL_DAYS` and the
 * canonical LGPD copy ("Suas conversas ficam aqui por 30 dias").
 */
const DEFAULT_TTL_DAYS = 30;

interface ThreadDoc {
  threadId: string;
  customerId: string;
  tenantId: string;
  tableSessionId: string;
  startedAt: Date;
  lastMessageAt: Date;
  messageCount: number;
  lastStaffName: string | null;
  lastStaffRole: StaffMessageHistoryRoleLabel | null;
  preview: string;
  expiresAt: Date;
  deletedByUser?: boolean;
  deletedAt?: Date | null;
}

interface MessageDoc {
  messageId: string;
  threadId: string;
  customerId: string;
  tenantId: string;
  fromRole: StaffMessageHistoryFromRole;
  fromName: string | null;
  fromRoleLabel: StaffMessageHistoryRoleLabel | null;
  content: string;
  createdAt: Date;
  readAt?: Date | null;
  expiresAt: Date;
}

export interface AppendInboundInput {
  tenantId: string;
  customerId: string;
  tableSessionId: string;
  staffName: string | null;
  /** Defaults to 'gerente' when not supplied (matches existing manager flow). */
  staffRoleLabel?: StaffMessageHistoryRoleLabel;
  content: string;
}

export interface AppendOutboundInput {
  tenantId: string;
  customerId: string;
  tableSessionId: string;
  content: string;
}

@Injectable()
export class CustomerStaffMessagesService {
  private readonly logger = new Logger(CustomerStaffMessagesService.name);
  /** Latch so we only build TTL indexes once per process. */
  private indexesEnsured = false;

  constructor(
    private readonly mongo: MongoService,
    private readonly tenantConn: TenantConnectionProvider,
    @Optional() private readonly events?: EventsGateway,
    @Optional() private readonly alerts?: AlertsService,
  ) {}

  /**
   * One thread per `(tenantId, customerId, tableSessionId)`. A single visit
   * (even with multiple back-and-forth) shows up as one entry; a return
   * visit gets a fresh tableSessionId → fresh thread. Deterministic key
   * matches the chat-history pattern of grouping by a stable bucket.
   */
  private buildThreadId(tenantId: string, customerId: string, tableSessionId: string): string {
    return `${tenantId}:${customerId}:${tableSessionId}`;
  }

  /**
   * Idempotent index creation. We do this lazily inside the first write
   * instead of `OnModuleInit` so that boots without Mongo don't break
   * application startup (matches the soft-fail philosophy elsewhere).
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
        .collection<ThreadDoc>(THREADS_COLLECTION)
        .createIndex({ customerId: 1, lastMessageAt: -1 });
      await db
        .collection<MessageDoc>(MESSAGES_COLLECTION)
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await db
        .collection<MessageDoc>(MESSAGES_COLLECTION)
        .createIndex({ threadId: 1, createdAt: 1 });
      this.indexesEnsured = true;
    } catch (err) {
      // Index creation race / permission issue — log and continue. The reads
      // still work without the indexes, just slower.
      this.logger.warn(
        `Falha ao garantir indexes em ${THREADS_COLLECTION}/${MESSAGES_COLLECTION}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Persist a staff→customer message. Called from
   * `AssistantService.sendStaffToCustomer` after the Postgres write +
   * WS emit succeed. Soft-failure: Mongo offline ⇒ log + skip. The inline
   * realtime bubble continues to work (driven by Postgres + WS).
   */
  async appendInbound(input: AppendInboundInput): Promise<void> {
    const db = this.mongo.tryDb();
    if (!db) {
      this.logger.warn(
        `Mongo offline · skipping staff inbound persist for customer ${input.customerId}`,
      );
      return;
    }
    await this.ensureIndexes();

    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000);
      const threadId = this.buildThreadId(input.tenantId, input.customerId, input.tableSessionId);
      const preview = input.content.slice(0, 80);
      const staffRoleLabel = input.staffRoleLabel ?? 'gerente';

      await db.collection<ThreadDoc>(THREADS_COLLECTION).updateOne(
        { threadId },
        {
          $setOnInsert: {
            threadId,
            customerId: input.customerId,
            tenantId: input.tenantId,
            tableSessionId: input.tableSessionId,
            startedAt: now,
          },
          $set: {
            lastMessageAt: now,
            lastStaffName: input.staffName,
            lastStaffRole: staffRoleLabel,
            preview,
            expiresAt,
            // Clear soft-delete if the customer had wiped the thread but the
            // staff is reaching out again — same UX as a brand-new thread.
            deletedByUser: false,
            deletedAt: null,
          },
          $inc: { messageCount: 1 },
        },
        { upsert: true },
      );

      const doc: MessageDoc = {
        messageId: randomUUID(),
        threadId,
        customerId: input.customerId,
        tenantId: input.tenantId,
        fromRole: 'staff',
        fromName: input.staffName,
        fromRoleLabel: staffRoleLabel,
        content: input.content,
        createdAt: now,
        readAt: null,
        expiresAt,
      };
      await db.collection<MessageDoc>(MESSAGES_COLLECTION).insertOne(doc);
    } catch (err) {
      this.logger.warn(
        `Falha ao persistir staff message inbound em Mongo: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Persist a customer→staff reply. Distinct path from `appendInbound`
   * because the FE drives it through a REST endpoint (not WS-fanout from
   * the staff side). Emits WS for a future staff inbox.
   */
  async appendOutbound(
    input: AppendOutboundInput,
  ): Promise<StaffMessageHistoryCustomerSendResponse> {
    if (!input.content || !input.content.trim()) {
      throw new HttpException('Mensagem não pode ser vazia.', HttpStatus.BAD_REQUEST);
    }
    if (input.content.length > 2000) {
      throw new HttpException(
        'Mensagem muito longa (máx 2000 caracteres).',
        HttpStatus.BAD_REQUEST,
      );
    }
    const db = this.requireDb();
    await this.ensureIndexes();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000);
    const threadId = this.buildThreadId(input.tenantId, input.customerId, input.tableSessionId);
    const preview = input.content.slice(0, 80);

    await db.collection<ThreadDoc>(THREADS_COLLECTION).updateOne(
      { threadId },
      {
        $setOnInsert: {
          threadId,
          customerId: input.customerId,
          tenantId: input.tenantId,
          tableSessionId: input.tableSessionId,
          startedAt: now,
          // No staff has authored yet — leave the eyebrow fields untouched.
          lastStaffName: null,
          lastStaffRole: null,
        },
        $set: {
          lastMessageAt: now,
          preview,
          expiresAt,
          deletedByUser: false,
          deletedAt: null,
        },
        $inc: { messageCount: 1 },
      },
      { upsert: true },
    );

    const doc: MessageDoc = {
      messageId: randomUUID(),
      threadId,
      customerId: input.customerId,
      tenantId: input.tenantId,
      fromRole: 'customer',
      fromName: null,
      fromRoleLabel: null,
      content: input.content.trim(),
      createdAt: now,
      readAt: null,
      expiresAt,
    };
    await db.collection<MessageDoc>(MESSAGES_COLLECTION).insertOne(doc);

    // Notify staff inbox listeners. Best-effort: failure here doesn't roll
    // back the Mongo write — the message is persisted and the staff can
    // still poll the inbox endpoint.
    //
    // Routing:
    //  - `session:<tableSessionId>` para a UI do próprio customer fechar
    //    a malha (sem isso a Round 18 customer-side bubble não atualiza
    //    em outras abas/devices do mesmo customer).
    //  - `tenant:<slug>` para staff dashboards (round 22 fix). Antes o
    //    evento só ia pra session room → manager nunca recebia em
    //    real-time mesmo a mensagem estando gravada em `staff_messages`.
    if (this.events) {
      const wsPayload = {
        threadId,
        messageId: doc.messageId,
        tableSessionId: input.tableSessionId,
        customerId: input.customerId,
        content: doc.content,
        createdAt: now.toISOString(),
      };
      try {
        this.events.emitToSession(
          input.tableSessionId,
          'staff_messages.customer_replied',
          wsPayload,
        );
      } catch (err) {
        this.logger.warn(`Falha ao emitir WS customer reply (session): ${(err as Error).message}`);
      }
      try {
        // `tenantId` aqui é o schema name (ex: `restaurant_dev`) que casa
        // com o slug usado pelas rooms staff. Ver assistant.service.ts
        // round 21 §E onde a convenção foi firmada.
        this.events.emitToTenant(input.tenantId, 'staff_messages.customer_replied', wsPayload);
      } catch (err) {
        this.logger.warn(`Falha ao emitir WS customer reply (tenant): ${(err as Error).message}`);
      }
    }

    if (this.alerts) {
      try {
        await this.alerts.create({
          sev: 'info',
          kind: 'customer_message_to_manager',
          title: 'Mensagem de cliente para gerente',
          sub: `Mesa ${input.tableSessionId.slice(0, 6)} · ${preview}`,
          actions: [
            {
              label: 'Abrir mensagens',
              route: `/manager/mensagens?slug=${input.tenantId}`,
              kind: 'primary',
            },
          ],
        });
      } catch (err) {
        this.logger.warn(
          `Falha ao criar alerta de mensagem para gerente: ${(err as Error).message}`,
        );
      }
    }

    return {
      messageId: doc.messageId,
      threadId,
      createdAt: now.toISOString(),
    };
  }

  async appendStaffReply(
    threadId: string,
    tenantId: string,
    staffId: string,
    content: string,
  ): Promise<StaffMessageHistoryMessageDto> {
    if (!content || !content.trim()) {
      throw new HttpException('Mensagem não pode ser vazia.', HttpStatus.BAD_REQUEST);
    }
    if (content.length > 2000) {
      throw new HttpException(
        'Mensagem muito longa (máx 2000 caracteres).',
        HttpStatus.BAD_REQUEST,
      );
    }

    const db = this.requireDb();
    await this.ensureIndexes();

    const thread = await db.collection<ThreadDoc>(THREADS_COLLECTION).findOne({ threadId });
    if (!thread || thread.tenantId !== tenantId) {
      throw new HttpException('Conversa não encontrada.', HttpStatus.NOT_FOUND);
    }

    const staffRows = (await this.tenantConn.query(
      `SELECT name, role FROM staff WHERE id = $1 AND is_active = true LIMIT 1`,
      [staffId],
    )) as Array<{ name: string; role: string }>;
    if (!staffRows.length) {
      throw new HttpException('staff não encontrado ou inativo.', HttpStatus.UNAUTHORIZED);
    }

    const roleLabel = this.mapStaffRoleLabel(staffRows[0].role);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000);
    const trimmed = content.trim();

    const doc: MessageDoc = {
      messageId: randomUUID(),
      threadId,
      customerId: thread.customerId,
      tenantId,
      fromRole: 'staff',
      fromName: staffRows[0].name,
      fromRoleLabel: roleLabel,
      content: trimmed,
      createdAt: now,
      readAt: null,
      expiresAt,
    };

    await db.collection<MessageDoc>(MESSAGES_COLLECTION).insertOne(doc);
    await db.collection<ThreadDoc>(THREADS_COLLECTION).updateOne(
      { threadId },
      {
        $set: {
          lastMessageAt: now,
          lastStaffName: staffRows[0].name,
          lastStaffRole: roleLabel,
          preview: trimmed.slice(0, 80),
          expiresAt,
          deletedByUser: false,
          deletedAt: null,
        },
        $inc: { messageCount: 1 },
      },
    );

    const wsPayload = {
      threadId,
      messageId: doc.messageId,
      tableSessionId: thread.tableSessionId,
      customerId: thread.customerId,
      staffId,
      staffName: staffRows[0].name,
      content: trimmed,
      createdAt: now.toISOString(),
    };
    try {
      this.events?.emitToSession(thread.tableSessionId, 'staff_messages.staff_replied', wsPayload);
      this.events?.emitToTenant(tenantId, 'staff_messages.staff_replied', wsPayload);
    } catch (err) {
      this.logger.warn(`Falha ao emitir WS staff reply: ${(err as Error).message}`);
    }

    return {
      messageId: doc.messageId,
      fromRole: doc.fromRole,
      fromName: doc.fromName,
      fromRoleLabel: doc.fromRoleLabel,
      content: doc.content,
      createdAt: doc.createdAt.toISOString(),
      readAt: null,
    };
  }

  async listThreads(customerId: string, tenantId: string): Promise<StaffMessageHistoryThreadDto[]> {
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
      tableSessionId: t.tableSessionId,
      startedAt: t.startedAt.toISOString(),
      lastMessageAt: t.lastMessageAt.toISOString(),
      messageCount: t.messageCount,
      lastStaffName: t.lastStaffName ?? null,
      lastStaffRole: t.lastStaffRole ?? null,
      preview: t.preview ?? '',
      expiresAt: t.expiresAt.toISOString(),
    }));
  }

  /**
   * Staff-side listing of every customer-initiated thread in the tenant.
   *
   * Round 22 fix: o manager precisa ver as mensagens enviadas pelos
   * customers via `send_message_to_manager`. Antes `listThreads()` era
   * só per-customer (ownership-locked) — staff não tinha entrypoint.
   *
   * Retorna threads ordenadas por `lastMessageAt` desc com `unreadCount`
   * (mensagens `fromRole='customer'` ainda sem `readAt`) agregado pro
   * badge da inbox. Soft-deleted threads do customer aparecem aqui —
   * staff continua vendo o histórico mesmo se o cliente apagou no
   * lado dele (mesma política de auditoria que complaints/feedback).
   */
  async listInboundForTenant(tenantId: string): Promise<StaffInboundThreadDto[]> {
    const db = this.requireDb();
    const threads = await db
      .collection<ThreadDoc>(THREADS_COLLECTION)
      .find({ tenantId })
      .sort({ lastMessageAt: -1 })
      .limit(100)
      .toArray();
    if (threads.length === 0) return [];

    const threadIds = threads.map((t) => t.threadId);
    const messageAgg = await db
      .collection<MessageDoc>(MESSAGES_COLLECTION)
      .aggregate<{
        _id: string;
        count: number;
        unreadCount: number;
        last: MessageDoc;
      }>([
        {
          $match: {
            tenantId,
            threadId: { $in: threadIds },
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$threadId',
            count: { $sum: 1 },
            unreadCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$fromRole', 'customer'] },
                      { $eq: [{ $ifNull: ['$readAt', null] }, null] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            last: { $first: '$$ROOT' },
          },
        },
      ])
      .toArray();
    const statsByThread = new Map(messageAgg.map((r) => [r._id, r]));

    return threads
      .map((t) => {
        const stats = statsByThread.get(t.threadId);
        if (!stats) return null;
        return {
          threadId: t.threadId,
          customerId: t.customerId,
          tableSessionId: t.tableSessionId,
          startedAt: t.startedAt.toISOString(),
          lastMessageAt: stats.last.createdAt.toISOString(),
          messageCount: stats.count,
          unreadCount: stats.unreadCount,
          lastStaffName: t.lastStaffName ?? null,
          lastStaffRole: t.lastStaffRole ?? null,
          preview: stats.last.content ?? t.preview ?? '',
          expiresAt: t.expiresAt.toISOString(),
        };
      })
      .filter((t): t is StaffInboundThreadDto => t !== null)
      .sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));
  }

  /**
   * Staff-side message read. No customer ownership check (staff is
   * authoritative). Tenant scoping enforced — staff de outro restaurante
   * com x-staff-key válida não vê threads alheias mesmo se enumerar
   * o threadId.
   */
  async getThreadMessagesForStaff(
    threadId: string,
    tenantId: string,
  ): Promise<StaffMessageHistoryMessageDto[]> {
    const db = this.requireDb();
    const thread = await db.collection<ThreadDoc>(THREADS_COLLECTION).findOne({ threadId });
    if (!thread || thread.tenantId !== tenantId) {
      throw new HttpException('Conversa não encontrada.', HttpStatus.NOT_FOUND);
    }
    const msgs = await db
      .collection<MessageDoc>(MESSAGES_COLLECTION)
      .find({ threadId })
      .sort({ createdAt: 1 })
      .toArray();
    return msgs.map((m) => ({
      messageId: m.messageId,
      fromRole: m.fromRole,
      fromName: m.fromName ?? null,
      fromRoleLabel: m.fromRoleLabel ?? null,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt ? m.readAt.toISOString() : null,
    }));
  }

  /**
   * Mark every unread `customer`-authored message in the thread as read.
   * Inverse direction de `markRead` (que é customer-side). Staff abre
   * a thread → tudo do customer vira lido → `unreadCount` do
   * `listInboundForTenant` zera.
   */
  async markReadByStaff(
    threadId: string,
    tenantId: string,
  ): Promise<StaffMessageHistoryReadResponse> {
    const db = this.requireDb();
    const thread = await db.collection<ThreadDoc>(THREADS_COLLECTION).findOne({ threadId });
    if (!thread || thread.tenantId !== tenantId) {
      throw new HttpException('Conversa não encontrada.', HttpStatus.NOT_FOUND);
    }
    const res = await db.collection<MessageDoc>(MESSAGES_COLLECTION).updateMany(
      {
        threadId,
        fromRole: 'customer',
        $or: [{ readAt: null }, { readAt: { $exists: false } }],
      },
      { $set: { readAt: new Date() } },
    );
    return {
      threadId,
      markedCount: res.modifiedCount ?? 0,
    };
  }

  /**
   * Ownership-checked thread message listing. Same hardening as
   * `chat-history.service.ts::listMessagesForCustomer` — the threadId is
   * deterministic (`tenantId:customerId:tableSessionId`) so we must
   * cross-check `thread.customerId === caller.customerId` to defend
   * against enumeration. 404 (not 403) avoids leaking thread existence.
   */
  async getThreadMessages(
    threadId: string,
    customerId: string,
  ): Promise<StaffMessageHistoryMessageDto[]> {
    const db = this.requireDb();
    const thread = await db.collection<ThreadDoc>(THREADS_COLLECTION).findOne({ threadId });
    if (!thread || thread.customerId !== customerId) {
      throw new HttpException('Conversa não encontrada.', HttpStatus.NOT_FOUND);
    }
    const msgs = await db
      .collection<MessageDoc>(MESSAGES_COLLECTION)
      .find({ threadId })
      .sort({ createdAt: 1 })
      .toArray();
    return msgs.map((m) => ({
      messageId: m.messageId,
      fromRole: m.fromRole,
      fromName: m.fromName ?? null,
      fromRoleLabel: m.fromRoleLabel ?? null,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt ? m.readAt.toISOString() : null,
    }));
  }

  /**
   * Mark every unread `staff`-authored message in the thread as read. The
   * customer never marks their own messages — `fromRole: 'staff'` keeps
   * the inverse `fromRole: 'customer'` rows untouched (those become read
   * receipts for the future staff inbox).
   */
  async markRead(threadId: string, customerId: string): Promise<StaffMessageHistoryReadResponse> {
    const db = this.requireDb();
    const thread = await db.collection<ThreadDoc>(THREADS_COLLECTION).findOne({ threadId });
    if (!thread || thread.customerId !== customerId) {
      throw new HttpException('Conversa não encontrada.', HttpStatus.NOT_FOUND);
    }
    const res = await db
      .collection<MessageDoc>(MESSAGES_COLLECTION)
      .updateMany(
        { threadId, fromRole: 'staff', readAt: { $in: [null, undefined] } },
        { $set: { readAt: new Date() } },
      );
    return {
      threadId,
      markedCount: res.modifiedCount ?? 0,
    };
  }

  /**
   * Soft-deletes a single thread. Mirrors the chat-history flow: thread
   * doc gets `deletedByUser=true` + `deletedAt`; messages are hard-deleted.
   * `deletedByUser` is cleared automatically if a staff member reaches out
   * again in the same thread (the upsert in `appendInbound` resets it).
   */
  async deleteThread(
    threadId: string,
    customerId: string,
  ): Promise<StaffMessageHistoryThreadDeleteResponse> {
    const db = this.requireDb();
    const thread = await db.collection<ThreadDoc>(THREADS_COLLECTION).findOne({ threadId });
    if (!thread || thread.customerId !== customerId) {
      throw new HttpException('Conversa não encontrada.', HttpStatus.NOT_FOUND);
    }
    const messages = await db.collection<MessageDoc>(MESSAGES_COLLECTION).deleteMany({ threadId });
    const now = new Date();
    await db
      .collection<ThreadDoc>(THREADS_COLLECTION)
      .updateOne({ threadId }, { $set: { deletedByUser: true, deletedAt: now } });
    return {
      deletedAt: now.toISOString(),
      messagesDeleted: messages.deletedCount ?? 0,
    };
  }

  /**
   * Bulk delete · LGPD-style erasure alias. Soft-fails when Mongo is offline
   * so the LGPD path can still record the request elsewhere.
   */
  async deleteAll(customerId: string): Promise<StaffMessageHistoryDeleteResponse> {
    const db = this.mongo.tryDb();
    if (!db) {
      this.logger.warn(`Bulk delete staff history for customer ${customerId} — Mongo offline`);
      return { deletedCount: 0, threadsMarked: 0, mongoAvailable: false };
    }
    const messages = await db
      .collection<MessageDoc>(MESSAGES_COLLECTION)
      .deleteMany({ customerId });
    const threadsRes = await db
      .collection<ThreadDoc>(THREADS_COLLECTION)
      .updateMany({ customerId }, { $set: { deletedByUser: true, deletedAt: new Date() } });
    return {
      deletedCount: messages.deletedCount ?? 0,
      threadsMarked: threadsRes.modifiedCount ?? 0,
      mongoAvailable: true,
    };
  }

  private requireDb() {
    const db = this.mongo.tryDb();
    if (!db) {
      throw new HttpException('Serviço de histórico indisponível.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return db;
  }

  private mapStaffRoleLabel(role: string): StaffMessageHistoryRoleLabel {
    switch (role) {
      case 'waiter':
        return 'garçom';
      case 'host':
        return 'host';
      case 'cook':
      case 'bartender':
        return 'cozinha';
      case 'manager':
      case 'cashier':
      default:
        return 'gerente';
    }
  }
}
