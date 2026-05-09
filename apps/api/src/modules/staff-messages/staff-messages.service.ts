import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { EventsGateway } from '../websocket/events.gateway';

@Injectable()
export class StaffMessagesService {
  private readonly logger = new Logger(StaffMessagesService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    @Optional() private readonly events?: EventsGateway,
  ) {}

  async send(
    input: {
      senderStaffId: string;
      recipientStaffId?: string | null;
      threadId?: string | null;
      body: string;
      subject?: string;
      isBroadcast?: boolean;
    },
    slug?: string,
  ) {
    const result = await this.tenantConn.transaction(async (tx) => {
      let threadId = input.threadId ?? null;
      if (!threadId) {
        const thRows = (await tx.query(
          `INSERT INTO staff_message_threads
             (subject, is_broadcast, created_by_staff_id)
           VALUES ($1, $2, $3) RETURNING id`,
          [input.subject ?? null, input.isBroadcast ?? false, input.senderStaffId],
        )) as Array<Record<string, unknown>>;
        threadId = thRows[0].id as string;
        await tx.query(
          `INSERT INTO staff_message_thread_participants (thread_id, staff_id)
           VALUES ($1, $2)
           ON CONFLICT (thread_id, staff_id) DO NOTHING`,
          [threadId, input.senderStaffId],
        );
        if (input.recipientStaffId) {
          await tx.query(
            `INSERT INTO staff_message_thread_participants (thread_id, staff_id)
             VALUES ($1, $2)
             ON CONFLICT (thread_id, staff_id) DO NOTHING`,
            [threadId, input.recipientStaffId],
          );
        }
      }

      const msgRows = (await tx.query(
        `INSERT INTO staff_messages
           (thread_id, sender_staff_id, recipient_staff_id, body)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          threadId,
          input.senderStaffId,
          input.recipientStaffId ?? null,
          input.body,
        ],
      )) as Array<Record<string, unknown>>;

      await tx.query(
        `UPDATE staff_message_threads SET last_message_at = now(), updated_at = now()
         WHERE id = $1`,
        [threadId],
      );

      return this.mapMessageRow(msgRows[0], threadId);
    });

    if (slug && this.events) {
      // TODO(payload): customer-facing fields (customerId / tableSessionId
      // / visitId) require a complaint or thread join — staff-to-staff
      // messages don't always have a customer counterpart. We emit on the
      // tenant + recipient-staff rooms; subscribers fetch full thread data
      // via REST when they need to render. The customerId here is the
      // recipient staff id (best available proxy for room routing).
      const recipientId = result.recipientStaffId ?? result.senderStaffId;
      this.events.emitStaffMessageReceived(
        slug,
        recipientId,
        result.recipientStaffId,
        {
          message: {
            id: result.id,
            threadId: result.threadId,
            fromRole: 'staff',
            staffId: result.senderStaffId,
            staffName: null,
            kind: 'direct_reply',
            content: result.body,
            metadata: {},
            createdAt: result.sentAt,
            readAt: result.readAt,
          },
        },
      );
    }

    return result;
  }

  async listThreadsForStaff(staffId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT t.id, t.subject, t.is_broadcast, t.last_message_at, t.created_at,
              (SELECT body FROM staff_messages
                WHERE thread_id = t.id AND deleted_at IS NULL
                ORDER BY sent_at DESC LIMIT 1) AS last_body,
              (SELECT count(*)::int FROM staff_messages
                WHERE thread_id = t.id AND read_at IS NULL
                  AND recipient_staff_id = $1
                  AND deleted_at IS NULL) AS unread_count
         FROM staff_message_threads t
         JOIN staff_message_thread_participants p
           ON p.thread_id = t.id AND p.staff_id = $1 AND p.left_at IS NULL
        WHERE t.closed_at IS NULL
        ORDER BY t.last_message_at DESC LIMIT 100`,
      [staffId],
    )) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      threadId: r.id as string,
      subject: (r.subject as string | null) ?? null,
      isBroadcast: r.is_broadcast as boolean,
      lastMessagePreview: (r.last_body as string | null) ?? '',
      lastMessageAt: r.last_message_at as string,
      unreadCount: (r.unread_count as number) ?? 0,
    }));
  }

  async listMessagesInThread(threadId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT * FROM staff_messages
        WHERE thread_id = $1 AND deleted_at IS NULL
        ORDER BY sent_at ASC LIMIT 500`,
      [threadId],
    )) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapMessageRow(r, threadId));
  }

  async markRead(messageId: string, by: { staffId: string }) {
    const updated = unwrapRows<Record<string, unknown>>(
      await this.tenantConn.query(
        `UPDATE staff_messages
           SET read_at = now()
         WHERE id = $1
           AND (recipient_staff_id = $2 OR recipient_staff_id IS NULL)
           AND read_at IS NULL
         RETURNING id, thread_id, read_at`,
        [messageId, by.staffId],
      ),
    );
    if (!updated.length) {
      throw new HttpException(
        'Mensagem nao encontrada ou ja lida.',
        HttpStatus.NOT_FOUND,
      );
    }
    const result = {
      messageId: updated[0].id as string,
      readAt: updated[0].read_at as string,
    };

    if (this.events) {
      this.events.emitStaffMessageRead({
        messageId: result.messageId,
        threadId: updated[0].thread_id as string,
        readAt: result.readAt,
        by: by.staffId,
      });
    }

    return result;
  }

  private mapMessageRow(r: Record<string, unknown>, threadId: string) {
    return {
      id: r.id as string,
      threadId,
      senderStaffId: r.sender_staff_id as string,
      recipientStaffId: (r.recipient_staff_id as string | null) ?? null,
      body: r.body as string,
      sentAt: r.sent_at as string,
      readAt: (r.read_at as string | null) ?? null,
    };
  }
}
