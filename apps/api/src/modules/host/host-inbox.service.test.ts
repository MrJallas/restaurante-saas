/**
 * CHARACTERIZATION (extração HostInboxService): congela o comportamento do
 * listInbox do host ANTES de mover o método pra fora do host.service.
 * Fixa as 5 fontes agregadas e como cada row vira HostInboxItemDto:
 *  - alerts kind='host_assist_table'  → kind 'host_assist'  (id `host_assist:<id>`)
 *  - late_arrival_requests consumidos → 'late_arrival_consumed' (`late_arrival:<id>`)
 *  - table_merge_requests consumidos  → 'merge_consumed'    (`table_merge:<id>`)
 *  - complaints                       → 'complaint'         (`complaint:<id>`)
 *  - zone_pauses                      → 'zone_pause_started|ended' (`zone_pause:<id>:<estado>`)
 * E o agregado final: sort desc por `at` (localeCompare) + slice(limit),
 * com `limit` repassado como $1 pra cada query de fonte.
 *
 * O teste roda contra o HostService (facade pública usada pelo
 * host.controller) — pós-extração o delegate continua cobrindo o serviço
 * novo por transitividade, sem editar as asserções deste arquivo.
 */

import { HostService } from './host.service';
import { HostInboxService } from './host-inbox.service';
import { HostWaitlistService } from './host-waitlist.service';
import { HostReservationsService } from './host-reservations.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

interface AssistAlertRow {
  id: string;
  title: string;
  sub: string | null;
  created_at: string;
}

interface LateArrivalRow {
  id: string;
  status: string;
  decided_at: string | null;
  requested_at: string;
  table_session_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  table_code: string | null;
}

interface MergeRow {
  id: string;
  status: string;
  decided_at: string | null;
  created_at: string;
  source_table_session_id: string | null;
  target_table_session_id: string | null;
}

interface ComplaintRow {
  id: string;
  status: string;
  submitted_at: string;
  problem_type: string | null;
  customer_name: string | null;
}

interface ZonePauseRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  waiter_id: string;
  waiter_name: string | null;
  reason: string | null;
}

interface FakeSources {
  assistAlerts?: AssistAlertRow[];
  lateArrival?: LateArrivalRow[];
  mergeRequests?: MergeRow[];
  complaints?: ComplaintRow[];
  zonePauses?: ZonePauseRow[];
}

function fakeDb(sources: FakeSources = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []): Promise<unknown> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    calls.push({ sql: s, params });
    if (s.startsWith('SELECT id, title, sub, created_at FROM alerts')) {
      return sources.assistAlerts ?? [];
    }
    if (s.startsWith('SELECT lar.id,')) {
      return sources.lateArrival ?? [];
    }
    if (s.startsWith('SELECT id, status, decided_at, created_at,')) {
      return sources.mergeRequests ?? [];
    }
    if (s.startsWith('SELECT c.id,')) {
      return sources.complaints ?? [];
    }
    if (s.startsWith('SELECT zp.id,')) {
      return sources.zonePauses ?? [];
    }
    throw new Error(`fake inbox: SQL não roteado: ${s}`);
  };
  return { calls, conn: { query } as unknown as TenantConnectionProvider };
}

function makeService(conn: TenantConnectionProvider) {
  return new HostService(
    conn,
    new HostWaitlistService(conn),
    new HostInboxService(conn),
    new HostReservationsService(conn),
  );
}

describe('Host inbox — characterization', () => {
  it('BUG VIVO 2026-07-04: pg devolve timestamptz como Date — o sort não pode assumir string', async () => {
    // O driver real entrega created_at/started_at como OBJETO Date (mesma
    // família do gotcha SUM()→string): `b.at.localeCompare` explodia com
    // TypeError e o GET /host/inbox devolvia 500 com dados reais. O fake
    // aqui imita o driver de verdade (Dates, não strings ISO).
    const { conn } = fakeDb({
      assistAlerts: [
        {
          id: 'al-1',
          title: 'Mesa 4 pediu ajuda',
          sub: null,
          created_at: new Date('2026-07-04T15:00:00Z') as unknown as string,
        },
      ],
      complaints: [
        {
          id: 'c-1',
          status: 'open',
          submitted_at: new Date('2026-07-04T16:00:00Z') as unknown as string,
          problem_type: null,
          customer_name: null,
        },
      ],
    });
    const inbox = await makeService(conn).listInbox();
    expect(inbox).toHaveLength(2);
    // desc por timestamp: a reclamação (16h) vem antes do assist (15h)
    expect(inbox[0].id).toBe('complaint:c-1');
    expect(inbox[1].id).toBe('host_assist:al-1');
  });

  it('agrega uma entrada de cada uma das 5 fontes no shape do DTO, ordenado desc por at', async () => {
    const { conn } = fakeDb({
      assistAlerts: [
        {
          id: 'a1',
          title: 'Mesa 12 pediu a recepção',
          sub: 'Cliente pediu ajuda da recepção pelo assistente.',
          created_at: '2026-07-04T12:05:00.000Z',
        },
      ],
      lateArrival: [
        {
          id: 'la1',
          status: 'approved',
          decided_at: '2026-07-04T12:04:00.000Z',
          requested_at: '2026-07-04T11:50:00.000Z',
          table_session_id: 'ts-1',
          customer_id: 'cust-1',
          customer_name: 'Ana',
          table_code: 'M12',
        },
      ],
      mergeRequests: [
        {
          id: 'mg1',
          status: 'rejected',
          decided_at: '2026-07-04T12:03:00.000Z',
          created_at: '2026-07-04T11:40:00.000Z',
          source_table_session_id: 'ts-src',
          target_table_session_id: 'ts-tgt',
        },
      ],
      complaints: [
        {
          id: 'cp1',
          status: 'open',
          submitted_at: '2026-07-04T12:02:00.000Z',
          problem_type: 'comida fria',
          customer_name: 'Bruno',
        },
      ],
      zonePauses: [
        {
          id: 'zp1',
          started_at: '2026-07-04T12:01:00.000Z',
          ended_at: null,
          waiter_id: 'w-1',
          waiter_name: 'Carla',
          reason: 'intervalo',
        },
      ],
    });

    const items = await makeService(conn).listInbox();

    expect(items).toEqual([
      {
        id: 'host_assist:a1',
        kind: 'host_assist',
        refId: 'a1',
        title: 'Mesa 12 pediu a recepção',
        subtitle: 'Cliente pediu ajuda da recepção pelo assistente.',
        at: '2026-07-04T12:05:00.000Z',
        context: { alertId: 'a1' },
      },
      {
        id: 'late_arrival:la1',
        kind: 'late_arrival_consumed',
        refId: 'la1',
        title: 'Late-arrival approved',
        subtitle: 'Ana · mesa M12',
        at: '2026-07-04T12:04:00.000Z',
        context: {
          tableSessionId: 'ts-1',
          customerName: 'Ana',
          tableCode: 'M12',
          status: 'approved',
        },
      },
      {
        id: 'table_merge:mg1',
        kind: 'merge_consumed',
        refId: 'mg1',
        title: 'Junção de mesa rejected',
        at: '2026-07-04T12:03:00.000Z',
        context: {
          sourceTableSessionId: 'ts-src',
          targetTableSessionId: 'ts-tgt',
          status: 'rejected',
        },
      },
      {
        id: 'complaint:cp1',
        kind: 'complaint',
        refId: 'cp1',
        title: 'Reclamação · comida fria',
        subtitle: 'Bruno',
        at: '2026-07-04T12:02:00.000Z',
        context: { status: 'open' },
      },
      {
        id: 'zone_pause:zp1:started',
        kind: 'zone_pause_started',
        refId: 'zp1',
        title: 'Pausa do garçom iniciada',
        subtitle: 'Carla',
        at: '2026-07-04T12:01:00.000Z',
        context: { waiterId: 'w-1', reason: 'intervalo' },
      },
    ]);
  });

  it('variantes: zone_pause encerrada, ats com fallback e campos opcionais ausentes', async () => {
    const { conn } = fakeDb({
      // sub null → subtitle undefined (chave ausente no toEqual).
      assistAlerts: [
        {
          id: 'a2',
          title: 'Mesa 3 pediu a recepção',
          sub: null,
          created_at: '2026-07-04T09:00:00.000Z',
        },
      ],
      // decided_at null → at cai pro requested_at; sem customer → subtitle
      // vira só o table_code.
      lateArrival: [
        {
          id: 'la2',
          status: 'expired',
          decided_at: null,
          requested_at: '2026-07-04T09:01:00.000Z',
          table_session_id: null,
          customer_id: null,
          customer_name: null,
          table_code: 'M7',
        },
      ],
      // decided_at null → at cai pro created_at.
      mergeRequests: [
        {
          id: 'mg2',
          status: 'expired',
          decided_at: null,
          created_at: '2026-07-04T09:02:00.000Z',
          source_table_session_id: null,
          target_table_session_id: null,
        },
      ],
      // problem_type null → título seco 'Reclamação'; sem customer_name.
      complaints: [
        {
          id: 'cp2',
          status: 'resolved',
          submitted_at: '2026-07-04T09:03:00.000Z',
          problem_type: null,
          customer_name: null,
        },
      ],
      // ended_at preenchido → kind zone_pause_ended, id sufixo ':ended' e
      // at = ended_at (não started_at).
      zonePauses: [
        {
          id: 'zp2',
          started_at: '2026-07-04T08:30:00.000Z',
          ended_at: '2026-07-04T09:04:00.000Z',
          waiter_id: 'w-2',
          waiter_name: null,
          reason: null,
        },
      ],
    });

    const items = await makeService(conn).listInbox();

    expect(items).toEqual([
      {
        id: 'zone_pause:zp2:ended',
        kind: 'zone_pause_ended',
        refId: 'zp2',
        title: 'Pausa do garçom encerrada',
        subtitle: undefined,
        at: '2026-07-04T09:04:00.000Z',
        context: { waiterId: 'w-2', reason: null },
      },
      {
        id: 'complaint:cp2',
        kind: 'complaint',
        refId: 'cp2',
        title: 'Reclamação',
        subtitle: undefined,
        at: '2026-07-04T09:03:00.000Z',
        context: { status: 'resolved' },
      },
      {
        id: 'table_merge:mg2',
        kind: 'merge_consumed',
        refId: 'mg2',
        title: 'Junção de mesa expired',
        at: '2026-07-04T09:02:00.000Z',
        context: {
          sourceTableSessionId: null,
          targetTableSessionId: null,
          status: 'expired',
        },
      },
      {
        id: 'late_arrival:la2',
        kind: 'late_arrival_consumed',
        refId: 'la2',
        title: 'Late-arrival expired',
        subtitle: 'M7',
        at: '2026-07-04T09:01:00.000Z',
        context: {
          tableSessionId: null,
          customerName: null,
          tableCode: 'M7',
          status: 'expired',
        },
      },
      {
        id: 'host_assist:a2',
        kind: 'host_assist',
        refId: 'a2',
        title: 'Mesa 3 pediu a recepção',
        subtitle: undefined,
        at: '2026-07-04T09:00:00.000Z',
        context: { alertId: 'a2' },
      },
    ]);
  });

  it('fontes vazias → inbox vazio; limit default 30 repassado como $1 e filtros de cada query', async () => {
    const { calls, conn } = fakeDb();
    const items = await makeService(conn).listInbox();

    expect(items).toEqual([]);
    expect(calls).toHaveLength(5);
    for (const call of calls) {
      expect(call.params).toEqual([30]);
      expect(call.sql).toContain('LIMIT $1');
    }

    const assist = calls.find((c) => c.sql.includes('FROM alerts'))!;
    expect(assist.sql).toContain("WHERE kind = 'host_assist_table'");
    expect(assist.sql).toContain('AND dismissed_at IS NULL');
    expect(assist.sql).toContain('AND resolved_at IS NULL');
    expect(assist.sql).toContain('AND (ttl_at IS NULL OR ttl_at > now())');
    expect(assist.sql).toContain('ORDER BY created_at DESC');

    const late = calls.find((c) => c.sql.includes('FROM late_arrival_requests'))!;
    expect(late.sql).toContain("WHERE lar.status IN ('approved', 'rejected', 'expired')");
    expect(late.sql).toContain('ORDER BY COALESCE(lar.decided_at, lar.requested_at) DESC');

    const merge = calls.find((c) => c.sql.includes('FROM table_merge_requests'))!;
    expect(merge.sql).toContain("WHERE status IN ('approved', 'rejected', 'expired')");
    expect(merge.sql).toContain('ORDER BY COALESCE(decided_at, created_at) DESC');

    const complaints = calls.find((c) => c.sql.includes('FROM complaints'))!;
    expect(complaints.sql).toContain('ORDER BY c.submitted_at DESC');

    const pauses = calls.find((c) => c.sql.includes('FROM zone_pauses'))!;
    expect(pauses.sql).toContain('ORDER BY zp.started_at DESC');
  });

  it('limit customizado corta o agregado (desc por at) e vai como $1 pras fontes', async () => {
    const { calls, conn } = fakeDb({
      assistAlerts: [
        {
          id: 'a3',
          title: 'Mesa 5 pediu a recepção',
          sub: null,
          created_at: '2026-07-04T10:00:00.000Z',
        },
      ],
      complaints: [
        {
          id: 'cp3',
          status: 'open',
          submitted_at: '2026-07-04T10:02:00.000Z',
          problem_type: null,
          customer_name: null,
        },
      ],
      zonePauses: [
        {
          id: 'zp3',
          started_at: '2026-07-04T10:01:00.000Z',
          ended_at: null,
          waiter_id: 'w-3',
          waiter_name: null,
          reason: null,
        },
      ],
    });

    const items = await makeService(conn).listInbox(2);

    // 3 itens agregados, mas só os 2 mais recentes sobrevivem ao slice.
    expect(items.map((i) => i.id)).toEqual(['complaint:cp3', 'zone_pause:zp3:started']);
    for (const call of calls) {
      expect(call.params).toEqual([2]);
    }
  });
});
