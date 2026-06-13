import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { EventsGateway } from '../websocket/events.gateway';

/** Default merge request TTL: 60s (host has to react). */
const REQUEST_TTL_SECONDS = 60;

/**
 * Cooldown applied after a rejection or timeout to throttle the requester so
 * the target table is not spammed. 10 min keeps things calm without locking
 * the requester out of the whole night.
 */
const COOLDOWN_MINUTES = 10;

interface CooldownRow {
  id: string;
  source_table_session_id: string;
  target_table_session_id: string;
  cooldown_expires_at: string;
  reason: string | null;
}

/**
 * 429-shaped exception body the controller hands back to the client. Matches
 * `MergeCooldownDto` from @restaurant/shared-types.
 */
export interface MergeCooldownPayload {
  cooldownEndsAt: string;
  retryAfterSeconds: number;
  reason: string;
  message: string;
  message_user: string;
  code: string;
  originTable: number;
  targetTable: number;
  originTableNumber: number;
  targetTableNumber: number;
  originSessionId: string;
  targetSessionId: string;
  originHostName: string | null;
  targetHostName: string | null;
  originPartySize: number;
  targetPartySize: number;
  pair: { a: string; b: string };
}

interface SessionResolution {
  session_id: string;
  table_id: string;
  status: string;
  host_customer_id: string | null;
  table_code: string;
  table_label: string;
  table_number: number | null;
}

interface TableMergeLifecycleDetails {
  originSessionId: string;
  targetSessionId: string;
  originTableNumber: number;
  targetTableNumber: number;
  originHostName: string | null;
  targetHostName: string | null;
  originPartySize: number;
  targetPartySize: number;
}

function userError(code: string, message: string, status: HttpStatus) {
  return new HttpException({ message_user: message, code }, status);
}

@Injectable()
export class TableMergeService {
  private readonly logger = new Logger(TableMergeService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    @Optional() private readonly events?: EventsGateway,
  ) {}

  async createCustomerRequest(
    input: {
      sourceTableSessionId: string;
      targetTableSessionId?: string | null;
      targetTableNumber?: number | string | null;
      targetTableLabel?: string | number | null;
      requestingCustomerId: string;
      targetCustomerId?: string | null;
      message?: string;
    },
    slug?: string,
  ) {
    const source = await this.resolveSessionById(input.sourceTableSessionId);
    if (!source || source.status !== 'active') {
      throw userError(
        'SOURCE_SESSION_INVALID',
        'Sua mesa nao esta ativa. Escaneie o QR Code novamente.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const requesterRows = (await this.tenantConn.query(
      `SELECT 1
         FROM session_participants
        WHERE table_session_id = $1
          AND customer_id = $2
          AND status = 'approved'
          AND left_at IS NULL
        LIMIT 1`,
      [source.session_id, input.requestingCustomerId],
    )) as unknown[];
    if (!requesterRows.length) {
      throw userError(
        'REQUESTER_NOT_IN_SOURCE_SESSION',
        'Voce precisa estar confirmado nesta mesa para pedir a juncao.',
        HttpStatus.FORBIDDEN,
      );
    }

    if (!source.host_customer_id) {
      throw userError(
        'SOURCE_HOST_MISSING',
        'Sua mesa ainda nao tem um host confirmado para aprovar a juncao.',
        HttpStatus.CONFLICT,
      );
    }

    const target = await this.resolveTargetSession(input);
    if (source.session_id === target.session_id) {
      throw userError(
        'SAME_TABLE',
        'Nao da pra juntar a mesa com ela mesma.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!target.host_customer_id) {
      throw userError(
        'TARGET_HOST_MISSING',
        'A mesa escolhida ainda nao tem host para aprovar a juncao.',
        HttpStatus.CONFLICT,
      );
    }

    return this.createRequest(
      {
        sourceTableSessionId: source.session_id,
        targetTableSessionId: target.session_id,
        requestingCustomerId: input.requestingCustomerId,
        targetCustomerId: target.host_customer_id,
        sourceApprovedByCustomerId:
          input.requestingCustomerId === source.host_customer_id
            ? input.requestingCustomerId
            : null,
        message: input.message,
      },
      slug,
    );
  }

  async createRequest(
    input: {
      sourceTableSessionId: string;
      targetTableSessionId: string;
      requestingCustomerId: string;
      targetCustomerId?: string | null;
      sourceApprovedByCustomerId?: string | null;
      message?: string;
    },
    slug?: string,
  ) {
    if (input.sourceTableSessionId === input.targetTableSessionId) {
      throw userError(
        'SAME_TABLE',
        'Nao da pra juntar a mesa com ela mesma.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // P0 #F-1 fix (round 3): cooldown UNIDIRECIONAL. Antes `orderedPair`
    // canonicalizava o par e o UNIQUE constraint era em (a, b) — ou seja,
    // A→B-rejected bloqueava B→A-tentativa-reversa. Spec V16 line 261
    // diz explicitamente: "caminho reverso continua aberto". Migration 037
    // reorganizou pra (source, target) directional.
    const cooldown = (await this.tenantConn.query(
      `SELECT id, source_table_session_id, target_table_session_id,
              cooldown_expires_at, reason
       FROM table_merge_cooldowns
       WHERE source_table_session_id = $1
         AND target_table_session_id = $2
         AND cooldown_expires_at > now()
       LIMIT 1`,
      [input.sourceTableSessionId, input.targetTableSessionId],
    )) as CooldownRow[];
    if (cooldown.length) {
      const c = cooldown[0];
      const expiresAt = c.cooldown_expires_at;
      const retryAfter = Math.max(
        0,
        Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000),
      );
      const details = await this.getMergeLifecycleDetails(
        input.sourceTableSessionId,
        input.targetTableSessionId,
      );
      const payload: MergeCooldownPayload = {
        cooldownEndsAt: expiresAt,
        retryAfterSeconds: retryAfter,
        reason: c.reason ?? 'rejected',
        message: this.cooldownMessage(details, retryAfter),
        message_user: this.cooldownMessage(details, retryAfter),
        code: 'MERGE_COOLDOWN_ACTIVE',
        originTable: details.originTableNumber,
        targetTable: details.targetTableNumber,
        originTableNumber: details.originTableNumber,
        targetTableNumber: details.targetTableNumber,
        originSessionId: details.originSessionId,
        targetSessionId: details.targetSessionId,
        originHostName: details.originHostName,
        targetHostName: details.targetHostName,
        originPartySize: details.originPartySize,
        targetPartySize: details.targetPartySize,
        // `pair` mantém a forma { a, b } no payload por compat com FE — mas
        // agora reflete a direção real (a = source, b = target).
        pair: {
          a: input.sourceTableSessionId,
          b: input.targetTableSessionId,
        },
      };
      throw new HttpException(payload, HttpStatus.TOO_MANY_REQUESTS);
    }

    const ttl = new Date(
      Date.now() + REQUEST_TTL_SECONDS * 1000,
    ).toISOString();

    const rows = (await this.tenantConn.query(
      `INSERT INTO table_merge_requests
         (source_table_session_id, target_table_session_id,
          requesting_customer_id, target_customer_id,
          status, message, ttl_expires_at, approved_by_a_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6,
               CASE WHEN $7::uuid IS NOT NULL THEN now() ELSE NULL END)
       RETURNING *`,
      [
        input.sourceTableSessionId,
        input.targetTableSessionId,
        input.requestingCustomerId,
        input.targetCustomerId ?? null,
        input.message ?? null,
        ttl,
        input.sourceApprovedByCustomerId ?? null,
      ],
    )) as Array<Record<string, unknown>>;

    const result = await this.getById(rows[0].id as string);

    if (slug && this.events) {
      this.events.emitTableMergeCreated(
        slug,
        result.requestingCustomerId,
        result.targetCustomerId,
        {
          requestId: result.id,
          originSessionId: result.sourceTableSessionId,
          targetSessionId: result.targetTableSessionId,
          originTableNumber: result.originTableNumber,
          targetTableNumber: result.targetTableNumber,
          originHostName: result.originHostName || null,
          targetHostName: result.targetHostName,
          originPartySize: result.originPartySize,
          targetPartySize: result.targetPartySize,
          expiresAt: result.ttlExpiresAt,
        },
      );
    }

    return result;
  }

  private async resolveSessionById(
    sessionId: string,
  ): Promise<SessionResolution | null> {
    const rows = (await this.tenantConn.query(
      `SELECT
         ts.id AS session_id,
         ts.table_id,
         ts.status,
         ts.host_customer_id,
         t.code AS table_code,
         t.label AS table_label,
         CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT) AS table_number
       FROM table_sessions ts
       JOIN tables t ON t.id = ts.table_id
      WHERE ts.id = $1
      LIMIT 1`,
      [sessionId],
    )) as SessionResolution[];
    return rows[0] ?? null;
  }

  private async getMergeLifecycleDetails(
    originSessionId: string,
    targetSessionId: string,
  ): Promise<TableMergeLifecycleDetails> {
    const rows = (await this.tenantConn.query(
      `SELECT
          CAST(NULLIF(regexp_replace(src_t.code, '[^0-9]', '', 'g'), '') AS INT) AS origin_table_number,
          CAST(NULLIF(regexp_replace(tgt_t.code, '[^0-9]', '', 'g'), '') AS INT) AS target_table_number,
          src_c.name AS origin_host_name,
          tgt_c.name AS target_host_name,
          (SELECT COUNT(*)::int
             FROM session_participants sp
            WHERE sp.table_session_id = $1
              AND sp.status = 'approved'
              AND sp.left_at IS NULL) AS origin_party_size,
          (SELECT COUNT(*)::int
             FROM session_participants sp
            WHERE sp.table_session_id = $2
              AND sp.status = 'approved'
              AND sp.left_at IS NULL) AS target_party_size
         FROM table_sessions src_ts
         JOIN table_sessions tgt_ts ON tgt_ts.id = $2
    LEFT JOIN tables src_t ON src_t.id = src_ts.table_id
    LEFT JOIN tables tgt_t ON tgt_t.id = tgt_ts.table_id
    LEFT JOIN customers src_c ON src_c.id = src_ts.host_customer_id
    LEFT JOIN customers tgt_c ON tgt_c.id = tgt_ts.host_customer_id
        WHERE src_ts.id = $1
        LIMIT 1`,
      [originSessionId, targetSessionId],
    )) as Array<Record<string, unknown>>;
    const row = rows[0] ?? {};
    return {
      originSessionId,
      targetSessionId,
      originTableNumber: Number(row.origin_table_number ?? 0),
      targetTableNumber: Number(row.target_table_number ?? 0),
      originHostName: (row.origin_host_name as string | null) ?? null,
      targetHostName: (row.target_host_name as string | null) ?? null,
      originPartySize: Number(row.origin_party_size ?? 0),
      targetPartySize: Number(row.target_party_size ?? 0),
    };
  }

  private tableMergeLifecyclePayload(details: TableMergeLifecycleDetails) {
    return {
      originSessionId: details.originSessionId,
      targetSessionId: details.targetSessionId,
      originTableNumber: details.originTableNumber,
      targetTableNumber: details.targetTableNumber,
      originHostName: details.originHostName,
      targetHostName: details.targetHostName,
      originPartySize: details.originPartySize,
      targetPartySize: details.targetPartySize,
    };
  }

  private cooldownMessage(
    details: Pick<TableMergeLifecycleDetails, 'targetTableNumber'>,
    retryAfterSeconds: number,
  ): string {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    const target =
      details.targetTableNumber > 0
        ? ` com a mesa ${details.targetTableNumber}`
        : '';
    return `Essa tentativa${target} entrou em pausa. Tente de novo em ${minutes} min.`;
  }

  private async resolveTargetSession(input: {
    targetTableSessionId?: string | null;
    targetTableNumber?: number | string | null;
    targetTableLabel?: string | number | null;
  }): Promise<SessionResolution> {
    if (input.targetTableSessionId) {
      const bySession = await this.resolveSessionById(input.targetTableSessionId);
      if (!bySession) {
        throw userError(
          'TARGET_SESSION_NOT_FOUND',
          'Nao encontrei a sessao da mesa escolhida.',
          HttpStatus.NOT_FOUND,
        );
      }
      if (bySession.status !== 'active') {
        throw userError(
          'TARGET_SESSION_INACTIVE',
          'A mesa escolhida nao esta mais ativa.',
          HttpStatus.CONFLICT,
        );
      }
      return bySession;
    }

    const targetNumber =
      typeof input.targetTableNumber === 'number'
        ? input.targetTableNumber
        : typeof input.targetTableNumber === 'string'
          ? Number(input.targetTableNumber)
          : typeof input.targetTableLabel === 'number'
            ? input.targetTableLabel
            : typeof input.targetTableLabel === 'string' && /^\d+$/.test(input.targetTableLabel.trim())
              ? Number(input.targetTableLabel)
              : null;
    const targetLabel =
      typeof input.targetTableLabel === 'string'
        ? input.targetTableLabel.trim()
        : typeof input.targetTableNumber === 'string'
          ? input.targetTableNumber.trim()
          : null;

    if (
      (!Number.isFinite(targetNumber) || targetNumber === null) &&
      (!targetLabel || targetLabel.length === 0)
    ) {
      throw userError(
        'TARGET_TABLE_MISSING',
        'Escolha uma mesa ocupada para pedir a juncao.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const rows = (await this.tenantConn.query(
      `SELECT
         active_ts.id AS session_id,
         t.id AS table_id,
         COALESCE(active_ts.status, 'free') AS status,
         active_ts.host_customer_id,
         t.code AS table_code,
         t.label AS table_label,
         CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT) AS table_number
       FROM tables t
       LEFT JOIN LATERAL (
         SELECT ts.id, ts.status, ts.host_customer_id, ts.created_at
           FROM table_sessions ts
          WHERE ts.table_id = t.id
            AND ts.status = 'active'
          ORDER BY ts.created_at DESC
          LIMIT 1
       ) active_ts ON TRUE
      WHERE t.is_active = TRUE
        AND (
          ($1::int IS NOT NULL AND CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT) = $1::int)
          OR ($2::text IS NOT NULL AND (lower(t.code) = lower($2::text) OR lower(t.label) = lower($2::text)))
        )
      ORDER BY t.sort_order ASC
      LIMIT 1`,
      [Number.isFinite(targetNumber) ? targetNumber : null, targetLabel],
    )) as SessionResolution[];

    const target = rows[0];
    if (!target) {
      throw userError(
        'TARGET_TABLE_NOT_FOUND',
        'Nao encontrei essa mesa no salao.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!target.session_id || target.status !== 'active') {
      throw userError(
        'TARGET_TABLE_FREE',
        'Essa mesa esta livre. Escolha uma mesa ocupada para pedir a juncao.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return target;
  }

  /**
   * P1 #28 — Dual-consent state machine. A merge is a social decision and
   * only rolls when BOTH hosts approve (per
   * docs/features/customer-host-model.md V16: "Junção só rola se ambos
   * aprovarem · consent duplo"). The previous implementation flipped
   * `status = 'approved'` on the first /respond hit, ignoring the other
   * side — single-consent bug.
   *
   * Behaviour now:
   *  - Caller is identified to side A or side B by joining the session's
   *    `host_customer_id`. Origin = source session, target = target session.
   *  - A `pending` row stamps `approved_by_a_at` / `approved_by_b_at` on the
   *    side the approver belongs to. If only one side is stamped, status
   *    stays `pending` (waiting for counterpart). If both are stamped, the
   *    row transitions to `approved`.
   *  - Idempotent: re-approving from the same side is a no-op (we COALESCE
   *    the timestamp instead of overwriting). Cross-side races are resolved
   *    by the UPDATE … RETURNING contract (the row's final state reflects
   *    the last writer; both writers see `pending` → `approved` exactly
   *    once via the WHERE-guard).
   */
  async approve(id: string, decidedByCustomerId?: string, slug?: string) {
    if (!decidedByCustomerId) {
      throw new HttpException(
        'decidedByCustomerId obrigatorio para identificar o lado da junçao.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Resolve which side this approver belongs to. We trust the session ↔
    // host_customer_id wiring set by `table-session.service.upsertParticipant`.
    const sideRows = (await this.tenantConn.query(
      `SELECT mr.id, mr.source_table_session_id, mr.target_table_session_id,
              src.host_customer_id AS src_host,
              tgt.host_customer_id AS tgt_host
         FROM table_merge_requests mr
         JOIN table_sessions src ON src.id = mr.source_table_session_id
         JOIN table_sessions tgt ON tgt.id = mr.target_table_session_id
        WHERE mr.id = $1`,
      [id],
    )) as Array<{
      src_host: string | null;
      tgt_host: string | null;
    }>;
    if (!sideRows.length) {
      throw new HttpException(
        'Pedido de juncao nao encontrado ou ja decidido.',
        HttpStatus.NOT_FOUND,
      );
    }
    const { src_host, tgt_host } = sideRows[0];
    let side: 'a' | 'b';
    if (src_host && src_host === decidedByCustomerId) {
      side = 'a';
    } else if (tgt_host && tgt_host === decidedByCustomerId) {
      side = 'b';
    } else {
      throw new HttpException(
        'Apenas o host de cada mesa pode aprovar a juncao.',
        HttpStatus.FORBIDDEN,
      );
    }

    // Conditional stamp: COALESCE preserves the existing timestamp if the
    // same side approves twice (no double-counting). Status only flips to
    // 'approved' when BOTH timestamps end up non-NULL after this UPDATE.
    const aStamp = side === 'a' ? 'now()' : 'approved_by_a_at';
    const bStamp = side === 'b' ? 'now()' : 'approved_by_b_at';
    const updated = unwrapRows<Record<string, unknown>>(
      await this.tenantConn.query(
        `UPDATE table_merge_requests
           SET approved_by_a_at = COALESCE(approved_by_a_at, ${aStamp}),
               approved_by_b_at = COALESCE(approved_by_b_at, ${bStamp}),
               decided_by_customer_id = COALESCE(decided_by_customer_id, $1),
               status = CASE
                          WHEN COALESCE(approved_by_a_at, ${aStamp}) IS NOT NULL
                           AND COALESCE(approved_by_b_at, ${bStamp}) IS NOT NULL
                          THEN 'approved'
                          ELSE status
                        END,
               decided_at = CASE
                              WHEN COALESCE(approved_by_a_at, ${aStamp}) IS NOT NULL
                               AND COALESCE(approved_by_b_at, ${bStamp}) IS NOT NULL
                              THEN now()
                              ELSE decided_at
                            END,
               updated_at = now()
         WHERE id = $2 AND status = 'pending'
         RETURNING *`,
        [decidedByCustomerId, id],
      ),
    );
    if (!updated.length) {
      throw new HttpException(
        'Pedido de juncao nao encontrado ou ja decidido.',
        HttpStatus.NOT_FOUND,
      );
    }
    const row = updated[0];
    const result = await this.getById(id);
    const fullyApproved = row.status === 'approved';

    if (slug && this.events) {
      const details = this.tableMergeLifecyclePayload({
        originSessionId: result.sourceTableSessionId,
        targetSessionId: result.targetTableSessionId,
        originTableNumber: result.originTableNumber,
        targetTableNumber: result.targetTableNumber,
        originHostName: result.originHostName || null,
        targetHostName: result.targetHostName,
        originPartySize: result.originPartySize,
        targetPartySize: result.targetPartySize,
      });
      this.events.emitTableMergeApproved(
        slug,
        result.sourceTableSessionId,
        result.targetTableSessionId,
        {
          requestId: result.id,
          // Surface the actual side that just approved so subscribers can
          // distinguish "still waiting on counterpart" from "consummated".
          side: fullyApproved ? 'both' : side,
          status: fullyApproved ? 'approved' : 'pending',
          ...details,
          expiresAt: result.expiresAt,
        },
      );
    }

    return result;
  }

  async reject(
    id: string,
    decidedByCustomerId?: string,
    reason?: string,
    slug?: string,
  ) {
    // Round 14 (P1-NEW-3): host check espelhando approve. Antes
    // qualquer customer (mesmo non-host de uma das mesas) rejeitava o
    // request unilateralmente, instalando cooldown de 10min que
    // bloqueava o host real de retentar. approve já tinha o check;
    // reject ficou esquecido.
    if (!decidedByCustomerId) {
      throw new HttpException(
        'decidedByCustomerId obrigatorio para identificar o host.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const sideRows = (await this.tenantConn.query(
      `SELECT src.host_customer_id AS src_host,
              tgt.host_customer_id AS tgt_host
         FROM table_merge_requests mr
         JOIN table_sessions src ON src.id = mr.source_table_session_id
         JOIN table_sessions tgt ON tgt.id = mr.target_table_session_id
        WHERE mr.id = $1`,
      [id],
    )) as Array<{ src_host: string | null; tgt_host: string | null }>;
    if (!sideRows.length) {
      throw new HttpException(
        'Pedido de juncao nao encontrado ou ja decidido.',
        HttpStatus.NOT_FOUND,
      );
    }
    const { src_host, tgt_host } = sideRows[0];
    let rejectedBy: 'a' | 'b';
    if (src_host && decidedByCustomerId === src_host) {
      rejectedBy = 'a';
    } else if (tgt_host && decidedByCustomerId === tgt_host) {
      rejectedBy = 'b';
    } else {
      throw new HttpException(
        'Apenas o host de cada mesa pode rejeitar a juncao.',
        HttpStatus.FORBIDDEN,
      );
    }

    const result = await this.tenantConn.transaction(async (tx) => {
      const updated = unwrapRows<Record<string, unknown>>(
        await tx.query(
          `UPDATE table_merge_requests
             SET status = 'rejected',
                 decided_at = now(),
                 decided_by_customer_id = COALESCE($1, decided_by_customer_id),
                 message = COALESCE($2, message),
                 updated_at = now()
           WHERE id = $3 AND status = 'pending'
           RETURNING *`,
          [decidedByCustomerId ?? null, reason ?? null, id],
        ),
      );
      if (!updated.length) {
        throw new HttpException(
          'Pedido de juncao nao encontrado ou ja decidido.',
          HttpStatus.NOT_FOUND,
        );
      }

      const row = updated[0];
      // F-1 fix: cooldown direcional. Insert usa (source, target) reais
      // do request — A→B-rejected NÃO bloqueia B→A. Mantemos as colunas
      // legacy `table_session_a_id/b_id` populated com mesmo valor pra
      // forward-compat com queries de monitoring inflight; podem ser
      // dropadas no próximo release após confirmar zero callers.
      const sourceId = row.source_table_session_id as string;
      const targetId = row.target_table_session_id as string;
      const cooldownExpires = new Date(
        Date.now() + COOLDOWN_MINUTES * 60 * 1000,
      ).toISOString();

      const cooldownRows = (await tx.query(
        `INSERT INTO table_merge_cooldowns
           (source_table_session_id, target_table_session_id,
            table_session_a_id, table_session_b_id,
            cooldown_expires_at, last_request_id, reason)
         VALUES ($1, $2, $1, $2, $3, $4, 'rejected')
         ON CONFLICT (source_table_session_id, target_table_session_id) DO UPDATE
           SET cooldown_expires_at = EXCLUDED.cooldown_expires_at,
               last_request_id = EXCLUDED.last_request_id,
               reason = EXCLUDED.reason,
               updated_at = now()
         RETURNING id`,
        [sourceId, targetId, cooldownExpires, id],
      )) as Array<{ id: string }>;

      return {
        mapped: this.mapRow(row),
        cooldownEndsAt: cooldownExpires,
        cooldownId: cooldownRows[0]?.id ?? id,
        pair: { a: sourceId, b: targetId },
      };
    });

    const enriched = await this.getById(id);
    if (slug && this.events) {
      const retryAfterSeconds = Math.max(
        0,
        Math.ceil((new Date(result.cooldownEndsAt).getTime() - Date.now()) / 1000),
      );
      const details = this.tableMergeLifecyclePayload({
        originSessionId: enriched.sourceTableSessionId,
        targetSessionId: enriched.targetTableSessionId,
        originTableNumber: enriched.originTableNumber,
        targetTableNumber: enriched.targetTableNumber,
        originHostName: enriched.originHostName || null,
        targetHostName: enriched.targetHostName,
        originPartySize: enriched.originPartySize,
        targetPartySize: enriched.targetPartySize,
      });
      this.events.emitTableMergeRejected(
        slug,
        enriched.sourceTableSessionId,
        enriched.targetTableSessionId,
        {
          requestId: enriched.id,
          rejectedBy,
          ...details,
          expiresAt: enriched.expiresAt,
        },
      );
      this.events.emitMergeCooldownStarted(
        slug,
        enriched.sourceTableSessionId,
        enriched.targetTableSessionId,
        {
          cooldownId: result.cooldownId,
          tenantId: slug,
          originTable: enriched.originTableNumber,
          targetTable: enriched.targetTableNumber,
          ...details,
          reason: 'rejected',
          expiresAt: result.cooldownEndsAt,
          cooldownEndsAt: result.cooldownEndsAt,
          retryAfterSeconds,
        },
      );
    }

    return { ...enriched, cooldownEndsAt: result.cooldownEndsAt };
  }

  /**
   * P1 #F-3 fix (round 3): staff override.
   *
   * V16 line 784 prevê que staff só pode intervir em merges via override
   * explícito ("staff override é a única forma de staff intervir"). Antes
   * não existia endpoint algum — manager só via ações customer-scoped.
   *
   * Comportamento:
   *   - Bypassa cooldown ativo (manager presencial confirma os 2 hosts).
   *   - Cria request `approved` direto, sem passar por dual-consent.
   *   - Marca `decided_by_customer_id = staffId` (mesmo campo, semântica
   *     "decisor humano"; FE distingue via flag staff_override no
   *     escalation_chains.steps).
   *   - Append em `escalation_chains.steps` jsonb com `{ kind:
   *     'staff_override', staff_id, reason, at }` pra audit.
   */
  async forceMerge(
    input: {
      sourceTableSessionId: string;
      targetTableSessionId: string;
      staffId: string;
      reason: string;
    },
    slug?: string,
  ) {
    if (input.sourceTableSessionId === input.targetTableSessionId) {
      throw new HttpException(
        'Nao da pra juntar a mesa com ela mesma.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!input.reason || !input.reason.trim()) {
      throw new HttpException(
        'reason obrigatório no staff override (audit trail).',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.tenantConn.transaction(async (tx) => {
      // 1. Resolve hosts pra audit (informativo apenas; override não exige
      // que ambos hosts existam — manager pode forçar walkin sem app).
      const sessionRows = (await tx.query(
        `SELECT id, host_customer_id FROM table_sessions
         WHERE id IN ($1, $2)`,
        [input.sourceTableSessionId, input.targetTableSessionId],
      )) as Array<{ id: string; host_customer_id: string | null }>;
      const sourceHost =
        sessionRows.find((r) => r.id === input.sourceTableSessionId)
          ?.host_customer_id ?? null;
      const targetHost =
        sessionRows.find((r) => r.id === input.targetTableSessionId)
          ?.host_customer_id ?? null;

      // 2. Cria escalation_chain pra audit (steps jsonb append).
      const chainStep = {
        kind: 'staff_override',
        staff_id: input.staffId,
        reason: input.reason,
        at: new Date().toISOString(),
      };
      const chainRows = (await tx.query(
        `INSERT INTO escalation_chains (type, context, current_step, status,
                                         steps, resolved_at, resolved_by)
         VALUES ('table_merge', $1::jsonb, 1, 'approved', $2::jsonb,
                 now(), $3)
         RETURNING id`,
        [
          JSON.stringify({
            sourceTableSessionId: input.sourceTableSessionId,
            targetTableSessionId: input.targetTableSessionId,
            override: true,
          }),
          JSON.stringify([chainStep]),
          `staff:${input.staffId}`,
        ],
      )) as Array<{ id: string }>;

      // 3. Cria request `approved` direto. ttl_expires_at no passado pra
      // marcar que não tá esperando timeout — já decidido.
      const ttl = new Date(Date.now() - 1000).toISOString();
      const reqRows = unwrapRows<Record<string, unknown>>(
        await tx.query(
          `INSERT INTO table_merge_requests
             (source_table_session_id, target_table_session_id,
              requesting_customer_id, target_customer_id,
              decided_by_customer_id, status, message, ttl_expires_at,
              decided_at, approved_by_a_at, approved_by_b_at,
              escalation_chain_id)
           VALUES ($1, $2,
                   COALESCE($3, '00000000-0000-0000-0000-000000000000'::uuid),
                   $4, NULL, 'approved', $5, $6, now(), now(), now(), $7)
           RETURNING *`,
          [
            input.sourceTableSessionId,
            input.targetTableSessionId,
            sourceHost,
            targetHost,
            `STAFF OVERRIDE · ${input.reason}`,
            ttl,
            chainRows[0].id,
          ],
        ),
      );

      // 4. Limpar cooldowns ativos entre o par (em qualquer direção) —
      // override deve permitir mesmo em retry agressivo.
      await tx.query(
        `DELETE FROM table_merge_cooldowns
         WHERE (source_table_session_id = $1 AND target_table_session_id = $2)
            OR (source_table_session_id = $2 AND target_table_session_id = $1)
            OR (table_session_a_id IN ($1, $2) AND table_session_b_id IN ($1, $2))`,
        [input.sourceTableSessionId, input.targetTableSessionId],
      );

      return reqRows[0];
    });

    if (slug && this.events) {
      // Emite como `side: 'both'` pra que ambos hosts (e o staff stream)
      // recebam — staff override consuma simultaneamente. O fato de ser
      // override fica audit-trail-only em escalation_chains.steps.kind=staff_override.
      this.events.emitTableMergeApproved(
        slug,
        result.source_table_session_id as string,
        result.target_table_session_id as string,
        {
          requestId: result.id as string,
          side: 'both',
          status: 'approved',
        },
      );
    }

    return this.mapRow(result);
  }

  async list(filters: { status?: string; tableSessionId?: string }) {
    await this.expireOverdueRequests();
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (filters.status) {
      where.push(`mr.status = $${i++}`);
      params.push(filters.status === 'timeout' ? 'expired' : filters.status);
    }
    if (filters.tableSessionId) {
      where.push(
        `(mr.source_table_session_id = $${i} OR mr.target_table_session_id = $${i})`,
      );
      params.push(filters.tableSessionId);
      i++;
    }
    const sql = `SELECT mr.*,
                        CAST(NULLIF(regexp_replace(src_t.code, '[^0-9]', '', 'g'), '') AS INT) AS origin_table_number,
                        CAST(NULLIF(regexp_replace(tgt_t.code, '[^0-9]', '', 'g'), '') AS INT) AS target_table_number,
                        src_c.name AS origin_host_name,
                        tgt_c.name AS target_host_name,
                        (SELECT COUNT(*)::int
                           FROM session_participants sp
                          WHERE sp.table_session_id = mr.source_table_session_id
                            AND sp.status = 'approved'
                            AND sp.left_at IS NULL) AS origin_party_size,
                        (SELECT COUNT(*)::int
                           FROM session_participants sp
                          WHERE sp.table_session_id = mr.target_table_session_id
                            AND sp.status = 'approved'
                            AND sp.left_at IS NULL) AS target_party_size
                   FROM table_merge_requests mr
              LEFT JOIN table_sessions src_ts ON src_ts.id = mr.source_table_session_id
              LEFT JOIN table_sessions tgt_ts ON tgt_ts.id = mr.target_table_session_id
              LEFT JOIN tables src_t ON src_t.id = src_ts.table_id
              LEFT JOIN tables tgt_t ON tgt_t.id = tgt_ts.table_id
              LEFT JOIN customers src_c ON src_c.id = src_ts.host_customer_id
              LEFT JOIN customers tgt_c ON tgt_c.id = tgt_ts.host_customer_id
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY mr.created_at DESC LIMIT 100`;
    const rows = (await this.tenantConn.query(sql, params)) as Array<
      Record<string, unknown>
    >;
    return rows.map((r) => this.mapRow(r));
  }

  async getById(id: string) {
    await this.expireOverdueRequests();
    const rows = (await this.tenantConn.query(
      `SELECT mr.*,
              CAST(NULLIF(regexp_replace(src_t.code, '[^0-9]', '', 'g'), '') AS INT) AS origin_table_number,
              CAST(NULLIF(regexp_replace(tgt_t.code, '[^0-9]', '', 'g'), '') AS INT) AS target_table_number,
              src_c.name AS origin_host_name,
              tgt_c.name AS target_host_name,
              (SELECT COUNT(*)::int
                 FROM session_participants sp
                WHERE sp.table_session_id = mr.source_table_session_id
                  AND sp.status = 'approved'
                  AND sp.left_at IS NULL) AS origin_party_size,
              (SELECT COUNT(*)::int
                 FROM session_participants sp
                WHERE sp.table_session_id = mr.target_table_session_id
                  AND sp.status = 'approved'
                  AND sp.left_at IS NULL) AS target_party_size
         FROM table_merge_requests mr
    LEFT JOIN table_sessions src_ts ON src_ts.id = mr.source_table_session_id
    LEFT JOIN table_sessions tgt_ts ON tgt_ts.id = mr.target_table_session_id
    LEFT JOIN tables src_t ON src_t.id = src_ts.table_id
    LEFT JOIN tables tgt_t ON tgt_t.id = tgt_ts.table_id
    LEFT JOIN customers src_c ON src_c.id = src_ts.host_customer_id
    LEFT JOIN customers tgt_c ON tgt_c.id = tgt_ts.host_customer_id
        WHERE mr.id = $1`,
      [id],
    )) as Array<Record<string, unknown>>;
    if (!rows.length) {
      throw new HttpException(
        'Pedido de juncao nao encontrado.',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.mapRow(rows[0]);
  }

  private mapRow(row: Record<string, unknown>) {
    return {
      id: row.id as string,
      sourceTableSessionId: row.source_table_session_id as string,
      targetTableSessionId: row.target_table_session_id as string,
      requestingCustomerId: row.requesting_customer_id as string,
      targetCustomerId: (row.target_customer_id as string | null) ?? null,
      decidedByCustomerId:
        (row.decided_by_customer_id as string | null) ?? null,
      status: row.status as string,
      originTableNumber: Number(row.origin_table_number ?? 0),
      targetTableNumber: Number(row.target_table_number ?? 0),
      originHostName: (row.origin_host_name as string | null) ?? null,
      targetHostName: (row.target_host_name as string | null) ?? null,
      originPartySize: Number(row.origin_party_size ?? 0),
      targetPartySize: Number(row.target_party_size ?? 0),
      message: (row.message as string | null) ?? null,
      ttlExpiresAt: row.ttl_expires_at as string,
      expiresAt: row.ttl_expires_at as string,
      cooldownEndsAt: (row.cooldown_expires_at as string | null) ?? null,
      decidedAt: (row.decided_at as string | null) ?? null,
      // P1 #28 — surface dual-consent timestamps so FE can show "esperando
      // resposta da Mesa X" prose on the side that already answered.
      approvedByAAt: (row.approved_by_a_at as string | null) ?? null,
      approvedByBAt: (row.approved_by_b_at as string | null) ?? null,
      createdAt: row.created_at as string,
    };
  }

  private async expireOverdueRequests() {
    const expired = (await this.tenantConn.query(
      `UPDATE table_merge_requests
          SET status = 'expired',
              decided_at = now(),
              updated_at = now()
        WHERE status = 'pending'
          AND ttl_expires_at < now()
        RETURNING id`,
    )) as Array<{ id: string }>;

    // Timeout precisa de evento: a waiting-approval e o assistente esperam
    // `table_merge.rejected` com rejectedBy='timeout' (o FE já tratava esse
    // valor que nunca chegava — vídeos 2026-06-10: countdown morria em 0s
    // sem desfecho e o card de "sem resposta" nunca tinha o motivo certo).
    const slug = this.tenantConn.getTenantSlug();
    if (!slug || !this.events || expired.length === 0) return;
    for (const row of expired.slice(0, 10)) {
      try {
        const enriched = await this.getById(row.id);
        const details = this.tableMergeLifecyclePayload({
          originSessionId: enriched.sourceTableSessionId,
          targetSessionId: enriched.targetTableSessionId,
          originTableNumber: enriched.originTableNumber,
          targetTableNumber: enriched.targetTableNumber,
          originHostName: enriched.originHostName || null,
          targetHostName: enriched.targetHostName,
          originPartySize: enriched.originPartySize,
          targetPartySize: enriched.targetPartySize,
        });
        this.events.emitTableMergeRejected(
          slug,
          enriched.sourceTableSessionId,
          enriched.targetTableSessionId,
          {
            requestId: enriched.id,
            rejectedBy: 'timeout',
            ...details,
            expiresAt: enriched.expiresAt,
          },
        );
      } catch {
        // Best-effort: expiração já persistiu; evento é notificação.
      }
    }
  }
}

// `orderedPair` foi removido em 2026-05-09 (round 3 P0 #F-1). Era usado
// pra canonicalizar (a, b) no cooldown e no INSERT — resultado: A→B-rejected
// bloqueava B→A reverso. Agora cooldown é direcional (source, target) e os
// inserts usam os IDs reais do request. Se você precisa reativar canonical
// ordering em outra feature, use uma helper local em vez de exportar
// global pra evitar a regressão.
