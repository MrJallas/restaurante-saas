import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

/**
 * Extração do table-merge.service (fase framework): resolução de alvo do
 * merge — sessão por id e alvo por número/label — movida VERBATIM.
 * Comportamento congelado em table-merge.target-resolver.test.ts
 * (characterization ANTES da extração), incluindo a coerção número/label
 * ('7' resolve como número da mesa E como code/label) e as mensagens
 * exatas do userError.
 */

export interface SessionResolution {
  session_id: string;
  table_id: string;
  status: string;
  host_customer_id: string | null;
  table_code: string;
  table_label: string;
  table_number: number | null;
}

export function userError(code: string, message: string, status: HttpStatus) {
  return new HttpException({ message_user: message, code }, status);
}

@Injectable()
export class MergeTargetResolver {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async resolveSessionById(sessionId: string): Promise<SessionResolution | null> {
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

  async resolveTargetSession(input: {
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
            : typeof input.targetTableLabel === 'string' &&
                /^\d+$/.test(input.targetTableLabel.trim())
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
}
