/**
 * P1-U (re-scan): antes o `create()` do qr-issues SÓ dava INSERT — o garçom
 * reportava um problema no QR da mesa e o gerente NUNCA era notificado
 * (feature morta ponta-a-ponta, apesar do docstring do AlertsModule listar
 * `qr-issues` como caller). O fix wira o AlertsService: cada QR-issue criado
 * também cria um alerta operacional (kind `qr-issue…`) que, via
 * `AlertsService.create`, dispara o WS `alert.created` que o sino do gerente
 * escuta (`useManagerEvents` → `ScreenManagerNotifications`).
 *
 * Estes testes fixam:
 *  1. `create()` persiste o QR-issue E chama `alerts.create` com o CONTEXTO
 *     (mesa, descrição, garçom) — RED antes do fix (não chamava nada).
 *  2. A falha do alerta NÃO derruba a criação do QR-issue (o INSERT é a
 *     ação primária; alertar é best-effort, igual customer-staff-messages).
 *  3. Sem AlertsService injetado (@Optional), `create()` ainda persiste.
 */

import { QrIssuesService, type QrIssueRow } from './qr-issues.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { AlertsService } from '../alerts/alerts.service';

const ROW: QrIssueRow = {
  id: 'qr-issue-1',
  table_number: 12,
  description: 'QR da mesa não abre o cardápio',
  photo_url: null,
  reported_by_staff_id: 'staff-ana',
  status: 'open',
  created_at: '2026-07-04T12:00:00.000Z',
  resolved_at: null,
  resolved_by_staff_id: null,
};

function fakeDb(rows: QrIssueRow[] = [ROW]) {
  const inserts: unknown[][] = [];
  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('INSERT INTO qr_issues')) {
      inserts.push(params);
      return rows;
    }
    if (s.startsWith('SELECT id, table_number')) return rows;
    throw new Error(`fake qr-issues: SQL não roteado: ${s}`);
  };
  return { inserts, conn: { query } as unknown as TenantConnectionProvider };
}

function fakeAlerts() {
  const created: Array<Record<string, unknown>> = [];
  const create = jest.fn(async (data: Record<string, unknown>) => {
    created.push(data);
    return { id: 'alert-1', ...data } as unknown;
  });
  return { created, alerts: { create } as unknown as AlertsService, createMock: create };
}

describe('QrIssuesService.create (P1-U: dispara alerta pro gerente)', () => {
  it('persiste o QR-issue com o contexto e reporter', async () => {
    const { conn, inserts } = fakeDb();
    const { alerts } = fakeAlerts();
    const svc = new QrIssuesService(conn, alerts);

    const res = await svc.create(
      { table_number: 12, description: 'QR da mesa não abre o cardápio' },
      'staff-ana',
    );

    expect(res).toEqual(ROW);
    // INSERT recebe (table_number, description, photo_url, reporterStaffId)
    expect(inserts[0]).toEqual([12, 'QR da mesa não abre o cardápio', null, 'staff-ana']);
  });

  it('cria um ALERTA com o contexto (mesa, problema, garçom) — RED antes do fix', async () => {
    const { conn } = fakeDb();
    const { alerts, createMock } = fakeAlerts();
    const svc = new QrIssuesService(conn, alerts);

    await svc.create(
      { table_number: 12, description: 'QR da mesa não abre o cardápio' },
      'staff-ana',
    );

    // O alerta É disparado (era a feature morta).
    expect(createMock).toHaveBeenCalledTimes(1);
    const alert = createMock.mock.calls[0][0] as Record<string, unknown>;
    // Severidade válida + kind qr-issue (roteado pro sino do gerente).
    expect(['crítica', 'atenção', 'info']).toContain(alert.sev);
    expect(String(alert.kind)).toContain('qr');
    // Contexto: a mesa aparece no título/sub.
    const text = `${alert.title ?? ''} ${alert.sub ?? ''}`;
    expect(text).toContain('12');
    // Contexto: a descrição do problema chega ao gerente.
    expect(text).toContain('QR da mesa não abre o cardápio');
  });

  it('falha ao criar alerta NÃO derruba a criação do QR-issue (best-effort)', async () => {
    const { conn } = fakeDb();
    const create = jest.fn(async () => {
      throw new Error('alerts DB down');
    });
    const alerts = { create } as unknown as AlertsService;
    const svc = new QrIssuesService(conn, alerts);

    const res = await svc.create({ table_number: 12, description: 'x' }, 'staff-ana');
    expect(res).toEqual(ROW);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('sem AlertsService (@Optional) ainda persiste o QR-issue', async () => {
    const { conn } = fakeDb();
    // Sem passar alerts — construtor @Optional.
    const svc = new QrIssuesService(conn);
    const res = await svc.create({ table_number: 12, description: 'x' }, 'staff-ana');
    expect(res).toEqual(ROW);
  });
});
