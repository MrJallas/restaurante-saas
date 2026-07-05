import { Injectable } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

export type SalonTableStatus = 'you' | 'occupied' | 'free' | 'distant';

export interface SalonTableDto {
  num: number;
  tableCode: string;
  tableLabel: string;
  status: SalonTableStatus;
  host?: string;
  party?: number;
}

interface SalonTableRow {
  table_id: string;
  table_code: string;
  table_label: string;
  sort_order: number;
  table_number: number | null;
  active_session_id: string | null;
  host_name: string | null;
  party: number | null;
}

@Injectable()
export class SalonService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async listAdjacentTables(input: {
    currentTableId: string;
    currentSessionId: string;
    radius?: number;
  }): Promise<{ tables: SalonTableDto[] }> {
    const radius = Number.isFinite(input.radius)
      ? Math.max(1, Math.min(10, Math.floor(input.radius as number)))
      : 2;

    const rows = (await this.tenantConn.query(
      `SELECT
         t.id AS table_id,
         t.code AS table_code,
         t.label AS table_label,
         t.sort_order,
         CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT) AS table_number,
         active_ts.id AS active_session_id,
         host.name AS host_name,
         COALESCE(party.cnt, 0)::int AS party
       FROM tables t
       LEFT JOIN LATERAL (
         SELECT ts.id, ts.host_customer_id, ts.created_at
           FROM table_sessions ts
          WHERE ts.table_id = t.id
            AND ts.status = 'active'
          ORDER BY ts.created_at DESC
          LIMIT 1
       ) active_ts ON TRUE
       LEFT JOIN customers host ON host.id = active_ts.host_customer_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS cnt
           FROM session_participants sp
          WHERE sp.table_session_id = active_ts.id
            AND sp.status = 'approved'
            AND sp.left_at IS NULL
       ) party ON TRUE
       WHERE t.is_active = TRUE
       ORDER BY t.sort_order ASC, table_number ASC NULLS LAST, t.code ASC`,
    )) as SalonTableRow[];

    const currentIndex = rows.findIndex((row) => row.table_id === input.currentTableId);
    const current = currentIndex >= 0 ? rows[currentIndex] : null;
    const currentNumber =
      current?.table_number ?? this.parseTableNumber(current?.table_code, current?.table_label);

    return {
      tables: rows.map((row, index) => {
        const tableNumber =
          row.table_number ?? this.parseTableNumber(row.table_code, row.table_label) ?? index + 1;
        const distance =
          currentNumber !== null
            ? Math.abs(tableNumber - currentNumber)
            : currentIndex >= 0
              ? Math.abs(index - currentIndex)
              : 0;
        const isCurrent =
          row.table_id === input.currentTableId || row.active_session_id === input.currentSessionId;
        const status: SalonTableStatus = isCurrent
          ? 'you'
          : row.active_session_id
            ? distance <= radius
              ? 'occupied'
              : 'distant'
            : 'free';

        return {
          num: tableNumber,
          tableCode: row.table_code,
          tableLabel: row.table_label,
          status,
          // A07: NÃO expor active_session_id (= x-session-token do cliente) — o
          // /salon/tables/adjacent é guardado por SessionGuard (cliente), então
          // vazar o token de mesas vizinhas = qualquer cliente forja a sessão de
          // outra mesa (hijack customer→customer). O 'isCurrent'/'you' já é
          // resolvido server-side via input.currentSessionId; o cliente não
          // precisa do token de ninguém.
          ...(row.host_name ? { host: row.host_name } : {}),
          ...(row.active_session_id ? { party: Number(row.party ?? 0) } : {}),
        };
      }),
    };
  }

  private parseTableNumber(...values: Array<string | null | undefined>): number | null {
    for (const value of values) {
      const match = value?.match(/\d+/);
      if (!match) continue;
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }
}
