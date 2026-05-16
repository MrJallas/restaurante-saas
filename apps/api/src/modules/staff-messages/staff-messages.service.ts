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
      let participantStaffIds: string[] = [];
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
        participantStaffIds = [
          input.senderStaffId,
          ...(input.recipientStaffId ? [input.recipientStaffId] : []),
        ];
      } else {
        // Round 14 (P1-NEW-2): se o caller fornece um threadId, exigimos
        // que ele seja participante da thread. Antes era IDOR aberto:
        // threadId vaza no `staff_message.received` broadcast pra
        // `tenant:${slug}` e qualquer staff captava + injetava mensagem
        // em thread privada de managers (audit log spoof + impersonation).
        const memberRows = (await tx.query(
          `SELECT 1 FROM staff_message_thread_participants
            WHERE thread_id = $1 AND staff_id = $2 AND left_at IS NULL
            LIMIT 1`,
          [threadId, input.senderStaffId],
        )) as unknown[];
        if (!memberRows.length) {
          throw new HttpException(
            'Thread não encontrada ou acesso negado.',
            HttpStatus.NOT_FOUND,
          );
        }
        const participantRows = (await tx.query(
          `SELECT staff_id
             FROM staff_message_thread_participants
            WHERE thread_id = $1 AND left_at IS NULL`,
          [threadId],
        )) as Array<{ staff_id: string }>;
        participantStaffIds = participantRows.map((r) => r.staff_id);
      }

      const otherParticipantIds = participantStaffIds.filter(
        (id) => id !== input.senderStaffId,
      );
      const recipientStaffId =
        input.recipientStaffId ??
        (otherParticipantIds.length === 1 ? otherParticipantIds[0] : null);

      const msgRows = (await tx.query(
        `INSERT INTO staff_messages
           (thread_id, sender_staff_id, recipient_staff_id, body)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          threadId,
          input.senderStaffId,
          recipientStaffId,
          input.body,
        ],
      )) as Array<Record<string, unknown>>;

      await tx.query(
        `UPDATE staff_message_threads SET last_message_at = now(), updated_at = now()
         WHERE id = $1`,
        [threadId],
      );

      const enrichedRows = (await tx.query(
        `SELECT m.*, s.name AS sender_name
           FROM staff_messages m
           JOIN staff s ON s.id = m.sender_staff_id
          WHERE m.id = $1`,
        [msgRows[0].id],
      )) as Array<Record<string, unknown>>;

      return {
        message: this.mapMessageRow(enrichedRows[0] ?? msgRows[0], threadId),
        participantStaffIds,
      };
    });

    if (slug && this.events) {
      const message = result.message;
      this.events.emitStaffThreadMessageReceived(
        slug,
        result.participantStaffIds,
        {
          message: {
            id: message.id,
            threadId: message.threadId,
            fromRole: 'staff',
            staffId: message.senderStaffId,
            staffName: message.staffName,
            kind: 'direct_reply',
            content: message.body,
            metadata: {},
            createdAt: message.sentAt,
            readAt: message.readAt,
          },
        },
      );
    }

    return result.message;
  }

  async listThreadsForStaff(staffId: string) {
    await this.ensureShiftThreadsForStaff(staffId);

    const rows = (await this.tenantConn.query(
      `SELECT t.id, t.subject, t.is_broadcast, t.kind, t.shift_id, t.work_date,
              t.last_message_at, t.created_at,
              other_participant.name AS other_participant_name,
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
         LEFT JOIN LATERAL (
           SELECT s.name
             FROM staff_message_thread_participants p2
             JOIN staff s ON s.id = p2.staff_id
            WHERE p2.thread_id = t.id
              AND p2.staff_id <> $1
              AND p2.left_at IS NULL
            ORDER BY s.name ASC
            LIMIT 1
         ) other_participant ON true
        WHERE t.closed_at IS NULL
        ORDER BY t.last_message_at DESC LIMIT 100`,
      [staffId],
    )) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapThreadRow(r));
  }

  /**
   * Round 13 (B-NEW-64): adicionado callerStaffId + JOIN com
   * staff_message_thread_participants. Antes qualquer staff com
   * `x-staff-key` válida lia DMs entre managers/colegas em qualquer
   * threadId vazado (ex.: threadId aparece em `staff_message.received`
   * broadcast pra `tenant:${slug}`). Pattern alinhado com
   * chat-history.service.ts (B-NEW-9 / B-NEW-16 customer-side).
   */
  async listMessagesInThread(threadId: string, callerStaffId: string) {
    const memberRows = (await this.tenantConn.query(
      `SELECT 1 FROM staff_message_thread_participants
        WHERE thread_id = $1 AND staff_id = $2 AND left_at IS NULL
        LIMIT 1`,
      [threadId, callerStaffId],
    )) as unknown[];
    if (!memberRows.length) {
      throw new HttpException(
        'Thread não encontrada ou acesso negado.',
        HttpStatus.NOT_FOUND,
      );
    }

    const threadRows = (await this.tenantConn.query(
      `SELECT t.id, t.subject, t.is_broadcast, t.kind, t.shift_id, t.work_date,
              t.last_message_at, t.created_at,
              other_participant.name AS other_participant_name,
              (SELECT body FROM staff_messages
                WHERE thread_id = t.id AND deleted_at IS NULL
                ORDER BY sent_at DESC LIMIT 1) AS last_body,
              (SELECT count(*)::int FROM staff_messages
                WHERE thread_id = t.id AND read_at IS NULL
                  AND recipient_staff_id = $2
                  AND deleted_at IS NULL) AS unread_count
         FROM staff_message_threads t
         LEFT JOIN LATERAL (
           SELECT s.name
             FROM staff_message_thread_participants p2
             JOIN staff s ON s.id = p2.staff_id
            WHERE p2.thread_id = t.id
              AND p2.staff_id <> $2
              AND p2.left_at IS NULL
            ORDER BY s.name ASC
            LIMIT 1
         ) other_participant ON true
        WHERE t.id = $1
        LIMIT 1`,
      [threadId, callerStaffId],
    )) as Array<Record<string, unknown>>;

    const rows = (await this.tenantConn.query(
      `SELECT m.*, s.name AS sender_name
         FROM staff_messages m
         JOIN staff s ON s.id = m.sender_staff_id
        WHERE m.thread_id = $1 AND m.deleted_at IS NULL
        ORDER BY m.sent_at ASC LIMIT 500`,
      [threadId],
    )) as Array<Record<string, unknown>>;
    return {
      thread: this.mapThreadRow(threadRows[0]),
      messages: rows.map((r) => this.mapMessageRow(r, threadId)),
    };
  }

  async markRead(messageId: string, by: { staffId: string }, slug: string) {
    // Round 14 (P2-NEW-1): broadcasts (recipient_staff_id IS NULL) só
    // podem ser marcados como lidos por participants reais da thread.
    // O check via SELECT EXISTS na subquery limita o UPDATE; antes,
    // qualquer staff com x-staff-key marcava qualquer broadcast como
    // lido (read receipt fake). Mantido o WHERE original pra DMs onde
    // recipient_staff_id é o caller.
    const updated = unwrapRows<Record<string, unknown>>(
      await this.tenantConn.query(
        `UPDATE staff_messages
           SET read_at = now()
         WHERE id = $1
           AND (
             recipient_staff_id = $2
             OR (
               recipient_staff_id IS NULL
               AND EXISTS (
                 SELECT 1 FROM staff_message_thread_participants p
                  WHERE p.thread_id = staff_messages.thread_id
                    AND p.staff_id = $2
                    AND p.left_at IS NULL
               )
             )
           )
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
      this.events.emitStaffMessageRead(slug, {
        messageId: result.messageId,
        threadId: updated[0].thread_id as string,
        readAt: result.readAt,
        by: by.staffId,
      });
    }

    return result;
  }

  private async ensureShiftThreadsForStaff(staffId: string): Promise<void> {
    await this.tenantConn.query(
      `UPDATE staff_message_threads t
          SET closed_at = now(), updated_at = now()
         FROM staff_shifts sh
        WHERE t.kind = 'shift_group'
          AND t.shift_id = sh.id
          AND t.closed_at IS NULL
          AND (
            t.work_date < current_date
            OR (
              t.work_date = current_date
              AND sh.time_end > sh.time_start
              AND localtime >= sh.time_end
            )
          )`,
      [],
    );

    const shifts = (await this.tenantConn.query(
      `SELECT DISTINCT sh.id AS shift_id,
              sh.label,
              sh.time_start::text AS time_start,
              sh.time_end::text AS time_end,
              a.work_date::text AS work_date
         FROM staff_shift_assignments a
         JOIN staff_shifts sh ON sh.id = a.shift_id
        WHERE a.staff_id = $1
          AND a.work_date = current_date
          AND a.removed_at IS NULL
          AND (
            (sh.time_start < sh.time_end AND localtime >= sh.time_start AND localtime < sh.time_end)
            OR (sh.time_start > sh.time_end AND (localtime >= sh.time_start OR localtime < sh.time_end))
            OR (sh.time_start = sh.time_end)
          )`,
      [staffId],
    )) as Array<{
      shift_id: string;
      label: string;
      work_date: string;
      time_start: string;
      time_end: string;
    }>;

    for (const shift of shifts) {
      const members = (await this.tenantConn.query(
        `SELECT a.staff_id, s.name
           FROM staff_shift_assignments a
           JOIN staff s ON s.id = a.staff_id
          WHERE a.shift_id = $1
            AND a.work_date = $2::date
            AND a.removed_at IS NULL
            AND s.is_active = true
          ORDER BY s.name ASC`,
        [shift.shift_id, shift.work_date],
      )) as Array<{ staff_id: string; name: string }>;
      if (!members.length) continue;

      const subject = `Turno ${shift.label} · ${shift.work_date}`;
      const rows = (await this.tenantConn.query(
        `INSERT INTO staff_message_threads
           (subject, is_broadcast, created_by_staff_id, kind, shift_id, work_date)
         VALUES ($1, true, $2, 'shift_group', $3, $4::date)
         ON CONFLICT (kind, shift_id, work_date)
           WHERE kind = 'shift_group'
         DO UPDATE SET updated_at = now()
         RETURNING id`,
        [subject, members[0].staff_id, shift.shift_id, shift.work_date],
      )) as Array<{ id: string }>;
      const threadId = rows[0]?.id;
      if (!threadId) continue;

      await this.tenantConn.query(
        `INSERT INTO staff_message_thread_participants (thread_id, staff_id)
         SELECT $1, x.staff_id::uuid
           FROM unnest($2::uuid[]) AS x(staff_id)
         ON CONFLICT (thread_id, staff_id)
         DO UPDATE SET left_at = NULL`,
        [threadId, members.map((m) => m.staff_id)],
      );

      const messageCount = (await this.tenantConn.query(
        `SELECT count(*)::int AS count
           FROM staff_messages
          WHERE thread_id = $1 AND deleted_at IS NULL`,
        [threadId],
      )) as Array<{ count: number }>;
      if ((messageCount[0]?.count ?? 0) === 0) {
        await this.tenantConn.query(
          `INSERT INTO staff_messages
             (thread_id, sender_staff_id, recipient_staff_id, body)
           VALUES ($1, $2, NULL, $3)`,
          [
            threadId,
            members[0].staff_id,
            `Grupo do ${subject} iniciado com ${members.length} participantes.`,
          ],
        );
      }
    }
  }

  private mapThreadRow(r: Record<string, unknown>) {
    const kind = (r.kind as string | null) ?? 'direct';
    const isBroadcast = r.is_broadcast as boolean;
    const otherParticipant = (r.other_participant_name as string | null) ?? null;
    const storedSubject = (r.subject as string | null) ?? null;
    return {
      threadId: r.id as string,
      subject: kind === 'direct' && !isBroadcast ? otherParticipant ?? storedSubject : storedSubject,
      isBroadcast,
      kind,
      shiftId: (r.shift_id as string | null) ?? null,
      workDate: (r.work_date as string | null) ?? null,
      lastMessagePreview: (r.last_body as string | null) ?? '',
      lastMessageAt: r.last_message_at as string,
      unreadCount: (r.unread_count as number) ?? 0,
      complaintId: null,
    };
  }

  private mapMessageRow(r: Record<string, unknown>, threadId: string) {
    const sentAt = r.sent_at as string;
    const body = r.body as string;
    const senderStaffId = r.sender_staff_id as string;
    const readAt = (r.read_at as string | null) ?? null;
    return {
      id: r.id as string,
      threadId,
      senderStaffId,
      recipientStaffId: (r.recipient_staff_id as string | null) ?? null,
      body,
      sentAt,
      fromRole: 'staff',
      staffId: senderStaffId,
      staffName: (r.sender_name as string | null) ?? null,
      kind: 'direct_reply',
      content: body,
      metadata: {},
      createdAt: sentAt,
      readAt,
    };
  }
}
