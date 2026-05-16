import { Injectable } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

export type CustomerEventType =
  | 'menu_viewed'
  | 'assistant_opened'
  | 'session_resumed'
  | 'item_viewed';

@Injectable()
export class CustomerEventsService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async create(input: {
    tableSessionId: string;
    customerId?: string | null;
    eventType: CustomerEventType;
    metadata?: Record<string, unknown>;
  }) {
    const rows = (await this.tenantConn.query(
      `INSERT INTO customer_events
         (table_session_id, customer_id, event_type, metadata)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id, event_type, created_at`,
      [
        input.tableSessionId,
        input.customerId ?? null,
        input.eventType,
        JSON.stringify(input.metadata ?? {}),
      ],
    )) as Array<{ id: string; event_type: string; created_at: string }>;

    return {
      id: rows[0].id,
      eventType: rows[0].event_type,
      createdAt: rows[0].created_at,
    };
  }
}
