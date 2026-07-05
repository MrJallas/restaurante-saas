/**
 * P1 da auditoria 2026-07-03: `ScreenWaiterCallDetail` era PLACEBO — valor
 * (R$ 612,40), itens e mesa hardcoded; o garçom podia levar a maquininha
 * com o valor errado. Nasce o `GET /:slug/waiter-calls/:callId/staff-detail`
 * (StaffOnly) com a mesa REAL e a conta REAL da sessão (mesmo BillingService
 * que o POST /payments cobra — taxa incluída).
 */

import { NotFoundException } from '@nestjs/common';
import { WaiterCallsService } from './waiter-calls.service';
import { BillingService } from '../billing/billing.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { EventsGateway } from '../websocket/events.gateway';

const CALL = 'dddd4444-0000-4000-8000-000000000004';
const SESSION = 'eeee5555-0000-4000-8000-000000000005';

function fakeDb(opts: { call?: boolean; sessionSubtotal?: number; serviceFeePct?: string }) {
  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.includes('SELECT service_fee_pct FROM settings')) {
      return [{ service_fee_pct: opts.serviceFeePct ?? '10.00' }];
    }
    // Feature promoções (2026-07-05): sem promoção ativa → sem desconto.
    if (s.includes('FROM promotions')) return [];
    if (s.includes('FROM waiter_calls wc') && s.includes('JOIN tables')) {
      if (!opts.call) return [];
      return [
        {
          id: params[0],
          status: 'pending',
          reason: 'ask_bill',
          created_at: '2026-07-04T01:00:00Z',
          acknowledged_at: null,
          resolved_at: null,
          cancelled_at: null,
          assigned_waiter_name: null,
          eta_minutes: null,
          table_session_id: SESSION,
          table_label: 'Mesa 12',
          table_code: 'M12',
        },
      ];
    }
    if (s.startsWith('SELECT COALESCE(SUM(total_cents)')) {
      // pg devolve SUM como STRING (NUMERIC) — imitar o driver real.
      return [{ total: String(opts.sessionSubtotal ?? 0) }];
    }
    throw new Error(`fake waiter-calls: SQL não roteado: ${s}`);
  };
  return { query } as unknown as TenantConnectionProvider;
}

function makeService(opts: Parameters<typeof fakeDb>[0]) {
  const conn = fakeDb(opts);
  return new WaiterCallsService(
    conn,
    { emitWaiterCallCreated: () => {} } as unknown as EventsGateway,
    new BillingService(conn),
  );
}

describe('WaiterCallsService.getCallStaffDetail — detalhe real pro garçom', () => {
  it('devolve mesa real + conta real da sessão com taxa (o valor da maquininha)', async () => {
    const service = makeService({ call: true, sessionSubtotal: 55_600 });
    const detail = await service.getCallStaffDetail(CALL);
    expect(detail.tableLabel).toBe('Mesa 12');
    expect(detail.reason).toBe('ask_bill');
    expect(detail.bill.subtotalCents).toBe(55_600);
    expect(detail.bill.serviceFeeCents).toBe(5_560);
    expect(detail.bill.totalCents).toBe(61_160);
  });

  it('chamado inexistente → 404', async () => {
    const service = makeService({ call: false });
    await expect(service.getCallStaffDetail(CALL)).rejects.toThrow(NotFoundException);
  });
});
