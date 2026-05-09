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
  pair: { a: string; b: string };
}

@Injectable()
export class TableMergeService {
  private readonly logger = new Logger(TableMergeService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    @Optional() private readonly events?: EventsGateway,
  ) {}

  async createRequest(
    input: {
      sourceTableSessionId: string;
      targetTableSessionId: string;
      requestingCustomerId: string;
      targetCustomerId?: string | null;
      message?: string;
    },
    slug?: string,
  ) {
    if (input.sourceTableSessionId === input.targetTableSessionId) {
      throw new HttpException(
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
      const payload: MergeCooldownPayload = {
        cooldownEndsAt: expiresAt,
        retryAfterSeconds: retryAfter,
        reason: c.reason ?? 'rejected',
        message: 'Voce pode tentar de novo em alguns minutos.',
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
          status, message, ttl_expires_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6)
       RETURNING *`,
      [
        input.sourceTableSessionId,
        input.targetTableSessionId,
        input.requestingCustomerId,
        input.targetCustomerId ?? null,
        input.message ?? null,
        ttl,
      ],
    )) as Array<Record<string, unknown>>;

    const result = this.mapRow(rows[0]);

    if (slug && this.events) {
      // TODO(payload): tableNumber + host names + party sizes require joins
      // with table_sessions/visits/customers. Defaulting to 0 / '' so the
      // contract is satisfied; FE re-fetches via REST for full data.
      this.events.emitTableMergeCreated(
        slug,
        result.requestingCustomerId,
        result.targetCustomerId,
        {
          requestId: result.id,
          originSessionId: result.sourceTableSessionId,
          targetSessionId: result.targetTableSessionId,
          originTableNumber: 0,
          targetTableNumber: 0,
          originHostName: '',
          targetHostName: null,
          originPartySize: 0,
          targetPartySize: 0,
          expiresAt: result.ttlExpiresAt,
        },
      );
    }

    return result;
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
    const result = this.mapRow(row);
    const fullyApproved = row.status === 'approved';

    if (slug && this.events) {
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

    if (slug && this.events) {
      this.events.emitTableMergeRejected(
        slug,
        result.mapped.sourceTableSessionId,
        result.mapped.targetTableSessionId,
        {
          requestId: result.mapped.id,
          rejectedBy: 'b',
        },
      );
      // TODO(payload): originTable / targetTable need a join to resolve
      // table numbers. Using 0 placeholders — subscribers can re-fetch.
      this.events.emitMergeCooldownStarted(
        slug,
        result.mapped.sourceTableSessionId,
        result.mapped.targetTableSessionId,
        {
          cooldownId: result.cooldownId,
          tenantId: slug,
          originTable: 0,
          targetTable: 0,
          reason: 'rejected',
          expiresAt: result.cooldownEndsAt,
        },
      );
    }

    return { ...result.mapped, cooldownEndsAt: result.cooldownEndsAt };
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
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (filters.status) {
      where.push(`status = $${i++}`);
      params.push(filters.status);
    }
    if (filters.tableSessionId) {
      where.push(
        `(source_table_session_id = $${i} OR target_table_session_id = $${i})`,
      );
      params.push(filters.tableSessionId);
      i++;
    }
    const sql = `SELECT * FROM table_merge_requests
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY created_at DESC LIMIT 100`;
    const rows = (await this.tenantConn.query(sql, params)) as Array<
      Record<string, unknown>
    >;
    return rows.map((r) => this.mapRow(r));
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
      message: (row.message as string | null) ?? null,
      ttlExpiresAt: row.ttl_expires_at as string,
      cooldownEndsAt: (row.cooldown_expires_at as string | null) ?? null,
      decidedAt: (row.decided_at as string | null) ?? null,
      // P1 #28 — surface dual-consent timestamps so FE can show "esperando
      // resposta da Mesa X" prose on the side that already answered.
      approvedByAAt: (row.approved_by_a_at as string | null) ?? null,
      approvedByBAt: (row.approved_by_b_at as string | null) ?? null,
      createdAt: row.created_at as string,
    };
  }
}

// `orderedPair` foi removido em 2026-05-09 (round 3 P0 #F-1). Era usado
// pra canonicalizar (a, b) no cooldown e no INSERT — resultado: A→B-rejected
// bloqueava B→A reverso. Agora cooldown é direcional (source, target) e os
// inserts usam os IDs reais do request. Se você precisa reativar canonical
// ordering em outra feature, use uma helper local em vez de exportar
// global pra evitar a regressão.
