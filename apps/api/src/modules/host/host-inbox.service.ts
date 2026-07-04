import { Injectable } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import type { HostInboxItemDto, HostInboxKind } from '@restaurant/shared-types';

/**
 * Inbox passivo do host — extraído do host.service (decomposição do god
 * service). Read-only: agrega 5 fontes em HostInboxItemDto[] (sort desc
 * por `at` + slice(limit)):
 *  1. alerts kind='host_assist_table' (pedidos de recepção em aberto)
 *  2. late_arrival_requests consumidos (approved/rejected/expired)
 *  3. table_merge_requests consumidos
 *  4. complaints
 *  5. zone_pauses (started/ended)
 *
 * ATENÇÃO (string mágica compartilhada): o kind 'host_assist_table'
 * consultado aqui é criado por `HostService.requestAssist()` — que
 * PERMANECEU no host.service. Se renomear o kind lá, renomeie a query
 * aqui; os dois lados têm comentário espelhado apontando um pro outro.
 *
 * O HostService mantém delegate de 1 linha pra preservar a facade usada
 * pelo host.controller.
 */
@Injectable()
export class HostInboxService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async listInbox(limit = 30): Promise<HostInboxItemDto[]> {
    const items: HostInboxItemDto[] = [];

    // Pedidos de recepção em aberto ("Mesa X pediu a recepção") — alerts
    // kind=host_assist_table criados por requestAssist(). Entram no inbox
    // enquanto não resolvidos/dispensados e dentro do TTL (30min). O WS
    // `host.assist_requested` cobre o realtime; o inbox cobre reload e
    // quem abriu a tela depois do evento.
    const assistAlerts = (await this.tenantConn.query(
      `SELECT id, title, sub, created_at
         FROM alerts
        WHERE kind = 'host_assist_table'
          AND dismissed_at IS NULL
          AND resolved_at IS NULL
          AND (ttl_at IS NULL OR ttl_at > now())
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit],
    )) as Array<{
      id: string;
      title: string;
      sub: string | null;
      created_at: string;
    }>;
    for (const row of assistAlerts) {
      items.push({
        id: `host_assist:${row.id}`,
        kind: 'host_assist' as HostInboxKind,
        refId: row.id,
        title: row.title,
        subtitle: row.sub ?? undefined,
        at: row.created_at,
        context: { alertId: row.id },
      });
    }

    // Late-arrival consumed (approved / rejected — nao mais pending).
    const lateArrival = (await this.tenantConn.query(
      `SELECT lar.id, lar.status, lar.decided_at, lar.requested_at,
              lar.table_session_id, lar.customer_id,
              c.name as customer_name,
              t.code as table_code
         FROM late_arrival_requests lar
         LEFT JOIN customers c ON c.id = lar.customer_id
         LEFT JOIN table_sessions ts ON ts.id = lar.table_session_id
         LEFT JOIN tables t ON t.id = ts.table_id
        WHERE lar.status IN ('approved', 'rejected', 'expired')
        ORDER BY COALESCE(lar.decided_at, lar.requested_at) DESC
        LIMIT $1`,
      [limit],
    )) as Array<{
      id: string;
      status: string;
      decided_at: string | null;
      requested_at: string;
      table_session_id: string | null;
      customer_id: string | null;
      customer_name: string | null;
      table_code: string | null;
    }>;
    for (const row of lateArrival) {
      items.push({
        id: `late_arrival:${row.id}`,
        kind: 'late_arrival_consumed' as HostInboxKind,
        refId: row.id,
        title: `Late-arrival ${row.status}`,
        subtitle: row.customer_name
          ? `${row.customer_name}${row.table_code ? ` · mesa ${row.table_code}` : ''}`
          : (row.table_code ?? undefined),
        at: row.decided_at ?? row.requested_at,
        context: {
          tableSessionId: row.table_session_id,
          customerName: row.customer_name,
          tableCode: row.table_code,
          status: row.status,
        },
      });
    }

    // Table-merge consumed.
    const mergeRequests = (await this.tenantConn.query(
      `SELECT id, status, decided_at, created_at,
              source_table_session_id, target_table_session_id
         FROM table_merge_requests
        WHERE status IN ('approved', 'rejected', 'expired')
        ORDER BY COALESCE(decided_at, created_at) DESC
        LIMIT $1`,
      [limit],
    )) as Array<{
      id: string;
      status: string;
      decided_at: string | null;
      created_at: string;
      source_table_session_id: string | null;
      target_table_session_id: string | null;
    }>;
    for (const row of mergeRequests) {
      items.push({
        id: `table_merge:${row.id}`,
        kind: 'merge_consumed' as HostInboxKind,
        refId: row.id,
        title: `Junção de mesa ${row.status}`,
        at: row.decided_at ?? row.created_at,
        context: {
          sourceTableSessionId: row.source_table_session_id,
          targetTableSessionId: row.target_table_session_id,
          status: row.status,
        },
      });
    }

    // Complaints (entram no inbox passivo do host pra ele saber o que ta
    // acontecendo no salao, mesmo nao sendo o resolvedor). `submitted_at`
    // eh o equivalente de "criado" no schema da migration 026.
    const complaints = (await this.tenantConn.query(
      `SELECT c.id, c.status, c.submitted_at, c.problem_type,
              cu.name as customer_name
         FROM complaints c
         LEFT JOIN customers cu ON cu.id = c.customer_id
        ORDER BY c.submitted_at DESC
        LIMIT $1`,
      [limit],
    )) as Array<{
      id: string;
      status: string;
      submitted_at: string;
      problem_type: string | null;
      customer_name: string | null;
    }>;
    for (const row of complaints) {
      items.push({
        id: `complaint:${row.id}`,
        kind: 'complaint' as HostInboxKind,
        refId: row.id,
        title: `Reclamação${row.problem_type ? ` · ${row.problem_type}` : ''}`,
        subtitle: row.customer_name ?? undefined,
        at: row.submitted_at,
        context: {
          status: row.status,
        },
      });
    }

    // Zone-pauses recentes.
    const zonePauses = (await this.tenantConn.query(
      `SELECT zp.id, zp.started_at, zp.ended_at, zp.waiter_id, zp.reason,
              s.name as waiter_name
         FROM zone_pauses zp
         LEFT JOIN staff s ON s.id = zp.waiter_id
        ORDER BY zp.started_at DESC
        LIMIT $1`,
      [limit],
    )) as Array<{
      id: string;
      started_at: string;
      ended_at: string | null;
      waiter_id: string;
      waiter_name: string | null;
      reason: string | null;
    }>;
    for (const row of zonePauses) {
      const ended = !!row.ended_at;
      items.push({
        id: `zone_pause:${row.id}:${ended ? 'ended' : 'started'}`,
        kind: (ended ? 'zone_pause_ended' : 'zone_pause_started') as HostInboxKind,
        refId: row.id,
        title: ended ? 'Pausa do garçom encerrada' : 'Pausa do garçom iniciada',
        subtitle: row.waiter_name ?? undefined,
        at: row.ended_at ?? row.started_at,
        context: {
          waiterId: row.waiter_id,
          reason: row.reason,
        },
      });
    }

    // O driver pg devolve timestamptz como OBJETO Date (não string) — o
    // localeCompare antigo explodia com TypeError e o inbox inteiro dava
    // 500 (bug pré-existente exposto na prova viva pós-extração,
    // 2026-07-04). Comparação numérica cobre Date e string ISO.
    const ts = (v: string | Date) => new Date(v).getTime();
    return items.sort((a, b) => ts(b.at) - ts(a.at)).slice(0, limit);
  }
}
