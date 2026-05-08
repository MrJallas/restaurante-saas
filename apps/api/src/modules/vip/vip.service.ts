import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { EventsGateway } from '../websocket/events.gateway';
import type { SessionFlag } from '@restaurant/shared-types';

const KNOWN_FLAGS = new Set(['vip', 'allergy', 'reincidente']);

/**
 * Session-scoped VIP / allergy / reincidente flagging. Stored as rows in
 * `session_flags` (added by migration 028). The shared-types contract refers
 * to a `text[]` column on `table_sessions` — we adapt the row-based table to
 * the `flags: SessionFlag[]` shape on read.
 */
@Injectable()
export class VipService {
  private readonly logger = new Logger(VipService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    @Optional() private readonly events?: EventsGateway,
  ) {}

  async toggle(
    tableSessionId: string,
    flag: string,
    action: 'add' | 'remove',
    by: { staffId?: string; customerId?: string; reason?: string },
    slug?: string,
  ) {
    if (!KNOWN_FLAGS.has(flag)) {
      throw new HttpException(
        `Flag desconhecida: ${flag}.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (action === 'add') {
      await this.tenantConn.query(
        `INSERT INTO session_flags
           (table_session_id, flag, set_by_staff_id, set_by_customer_id,
            metadata)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (table_session_id, flag) WHERE cleared_at IS NULL DO NOTHING`,
        [
          tableSessionId,
          flag,
          by.staffId ?? null,
          by.customerId ?? null,
          JSON.stringify({ reason: by.reason ?? null }),
        ],
      );
    } else {
      await this.tenantConn.query(
        `UPDATE session_flags
           SET cleared_at = now(),
               cleared_by_staff_id = COALESCE($1, cleared_by_staff_id),
               updated_at = now()
         WHERE table_session_id = $2 AND flag = $3 AND cleared_at IS NULL`,
        [by.staffId ?? null, tableSessionId, flag],
      );
    }

    const result = await this.getActiveFlags(tableSessionId);

    if (slug && this.events) {
      // TODO(payload): tableNumber + staff name require joins with
      // table_sessions / staff. Defaulting to 0 / '' so the contract is
      // satisfied; FE re-fetches via REST when rendering the chip.
      this.events.emitSessionFlagChanged(slug, {
        sessionId: tableSessionId,
        tableNumber: 0,
        flags: result.flags as SessionFlag[],
        by: {
          staffId: by.staffId ?? '',
          name: '',
        },
      });
    }

    return result;
  }

  async getActiveFlags(tableSessionId: string) {
    const rows = (await this.tenantConn.query(
      `SELECT flag, created_at FROM session_flags
        WHERE table_session_id = $1 AND cleared_at IS NULL
        ORDER BY created_at ASC`,
      [tableSessionId],
    )) as Array<{ flag: string; created_at: string }>;
    return {
      tableSessionId,
      flags: rows.map((r) => r.flag),
      updatedAt: new Date().toISOString(),
    };
  }
}
