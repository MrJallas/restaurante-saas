import { Injectable, Logger } from '@nestjs/common';
import type {
  TimelineActor,
  TimelineEntry,
  TimelineKind,
  TimelineRefs,
  WsEventName,
} from '@restaurant/shared-types';
import { WIRE_EVENT_TO_TIMELINE_KIND } from './timeline-mappers';
import { TimelineStoreService } from './timeline-store.service';

/**
 * M4 (timeline) — tap dos eventos WS: converte (wireName, payload, slug) →
 * TimelineEntry e grava no event-store. Chamado pelo EventsEmitterService
 * DEPOIS dos emits, fire-and-forget (record é sync/void; o Promise do store
 * é solto com catch interno) — nunca segura nem derruba o caminho do pedido.
 *
 * Regras gerais:
 *  - kind via WIRE_EVENT_TO_TIMELINE_KIND; wire sem kind → no-op.
 *  - sessionId = âncora do payload (tableSessionId | originSessionId |
 *    sessionId conforme família — mesma escolha de dono do M1: merge pertence
 *    à sessão de ORIGEM). Sem âncora → no-op com log debug (entrada sem
 *    âncora não entra; hoje isso cobre complaint.resolved, cujo wire M2 não
 *    carrega sessão, e os merges de staff-override/ttl sem lifecycle details).
 *  - at = timestamp do ATO vindo do payload (occurredAt/decidedAt/confirmedAt/
 *    createdAt/liberatedAt/timestamp — M2/M3 garantem); fallback now().
 *  - actor derivado dos campos server-side do M2 (changedBy, acknowledgedBy,
 *    decidedByCustomerId, calledBy, by, customerId…); ausente →
 *    {type:'system', id:null, name:null}.
 *  - LGPD: o payload da entry SÓ leva campos estruturados (ids/valores/
 *    status/enums). Texto livre do wire (complaint.description,
 *    late_arrival.visitContext, courtesy.notes, table_liberated.reason)
 *    NUNCA é copiado — a entry guarda refs, o texto fica na fonte SQL.
 *
 * REGRAS DE ID (determinísticas DO PAYLOAD; onde o payload carrega o pk da
 * row de origem o id CONVERGE com o mapper SQL do M1, então um backfill
 * futuro upserta no MESMO doc):
 *  - order:status          → ws:order:status:<orderId>:<status>:<at>
 *                            (payload não tem o pk de order_status_history;
 *                            o timestamp do ato distingue repetições legítimas
 *                            da mesma transição — ex.: kitchen reverteu e
 *                            reavançou)
 *  - order:handoff_called  → odel:<deliveryId>:called            (M1)
 *  - order:claimed         → ws:order:claimed:<orderId>:<claimedBy>
 *                            (payload não tem deliveryId; claim é único por
 *                            pedido+staff)
 *  - waiter:call           → wcall:<callId>                      (M1)
 *  - waiter:acknowledged   → wcall:<callId>:acknowledged         (M1)
 *  - late_arrival.created  → la:<requestId>                      (M1)
 *  - late_arrival.approved → la:<requestId>:approved             (M1)
 *  - late_arrival.rejected → la:<requestId>:rejected             (M1)
 *  - table_merge.created   → merge:<requestId>                   (M1)
 *  - table_merge.approved  → merge:<requestId>:approved          (M1;
 *                            status 'pending' — consentimento parcial de um
 *                            lado só — é no-op: o ATO ainda não aconteceu)
 *  - table_merge.rejected  → merge:<requestId>:rejected          (M1)
 *  - complaint.received    → comp:<complaintId>                  (M1)
 *  - complaint.resolved    → comp:<complaintId>:resolved         (M1; hoje
 *                            inalcançável — wire sem âncora de sessão)
 *  - courtesy.created      → court:<id>                          (M1)
 *  - session.flag_changed  → ws:session.flag_changed:<sessionId>:
 *                            <flags ordenadas>:<by.staffId> (wire não carrega
 *                            o pk de session_flags NEM timestamp; limitação
 *                            documentada: re-toggle IDÊNTICO da mesma
 *                            combinação por o mesmo staff colapsa no doc
 *                            original)
 *  - host.table_liberated  → sess:<sessionId>:closed             (M1; sessão
 *                            fecha uma vez)
 *  - payment.confirmed     → pay:<paymentId>                     (M1)
 */
@Injectable()
export class TimelineTapService {
  private readonly logger = new Logger(TimelineTapService.name);

  constructor(private readonly store: TimelineStoreService) {}

  /** Sync + fire-and-forget: o emit NUNCA espera (nem percebe) o store. */
  record(wire: WsEventName, payload: object, slug: string): void {
    const kind = WIRE_EVENT_TO_TIMELINE_KIND[wire];
    if (!kind) return;

    let entry: TimelineEntry | null = null;
    try {
      entry = this.toEntry(wire, kind, payload as Record<string, unknown>);
    } catch (err) {
      // Payload fora do shape esperado não pode derrubar o emit.
      this.logger.warn(`Tap falhou ao mapear ${wire}: ${(err as Error).message}`);
      return;
    }
    if (!entry) return;

    void this.store.record(entry, slug).catch((err: Error) => {
      // O store já é fail-open; catch defensivo pra jamais vazar rejection.
      this.logger.warn(`Tap falhou ao gravar ${wire}: ${err.message}`);
    });
  }

  // ─── Builder por família ──────────────────────────────────────────────

  private toEntry(
    wire: WsEventName,
    kind: TimelineKind,
    p: Record<string, unknown>,
  ): TimelineEntry | null {
    switch (wire) {
      case 'order:status': {
        const sessionId = this.anchor(wire, p.tableSessionId);
        if (!sessionId) return null;
        const at = pickAt(p, 'timestamp');
        const changedBy = p.changedBy as { type?: string; id?: string | null } | undefined;
        return {
          id: `ws:order:status:${str(p.orderId)}:${str(p.status)}:${at}`,
          kind,
          at,
          sessionId,
          actor: changedBy
            ? actorOf(changedBy.type === 'customer' ? 'customer' : 'staff', changedBy.id)
            : SYSTEM_ACTOR,
          refs: compactRefs({ orderId: str(p.orderId) }),
          payload: compact({ toStatus: p.status }),
        };
      }

      case 'order:handoff_called': {
        const sessionId = this.anchor(wire, p.tableSessionId);
        if (!sessionId) return null;
        return {
          id: `odel:${str(p.deliveryId)}:called`,
          kind,
          at: pickAt(p, 'timestamp'),
          sessionId,
          // calledBy null = chamada da estação/TV (sem x-staff-id) → system.
          actor: str(p.calledBy) ? actorOf('staff', str(p.calledBy)) : SYSTEM_ACTOR,
          refs: compactRefs({ orderId: str(p.orderId), deliveryId: str(p.deliveryId) }),
          payload: compact({ targetWaiterId: p.targetWaiterId ?? undefined }),
        };
      }

      case 'order:claimed': {
        const sessionId = this.anchor(wire, p.tableSessionId);
        if (!sessionId) return null;
        return {
          id: `ws:order:claimed:${str(p.orderId)}:${str(p.claimedBy)}`,
          kind,
          at: pickAt(p, 'timestamp'),
          sessionId,
          actor: str(p.claimedBy) ? actorOf('staff', str(p.claimedBy)) : SYSTEM_ACTOR,
          refs: compactRefs({ orderId: str(p.orderId) }),
          payload: {},
        };
      }

      case 'waiter:call': {
        const sessionId = this.anchor(wire, p.tableSessionId);
        if (!sessionId) return null;
        return {
          id: `wcall:${str(p.callId)}`,
          kind,
          at: pickAt(p, 'timestamp'),
          sessionId,
          // Só cliente chama garçom — customerId null é chamada anônima (M1).
          actor: actorOf('customer', str(p.customerId)),
          refs: compactRefs({ callId: str(p.callId) }),
          payload: compact({ reason: p.reason ?? undefined }),
        };
      }

      case 'waiter:acknowledged': {
        const sessionId = this.anchor(wire, p.tableSessionId);
        if (!sessionId) return null;
        const ack = p.acknowledgedBy as { id?: string; name?: string | null } | undefined;
        return {
          id: `wcall:${str(p.callId)}:acknowledged`,
          kind,
          at: pickAt(p, 'timestamp'),
          sessionId,
          actor: ack?.id ? actorOf('staff', ack.id, ack.name) : SYSTEM_ACTOR,
          refs: compactRefs({ callId: str(p.callId) }),
          payload: compact({ etaMinutes: p.etaMinutes ?? undefined }),
        };
      }

      case 'late_arrival.created': {
        const sessionId = this.anchor(wire, p.tableSessionId);
        if (!sessionId) return null;
        return {
          id: `la:${str(p.requestId)}`,
          kind,
          at: pickAt(p, 'occurredAt', 'timestamp'),
          sessionId,
          actor: actorOf('customer', str(p.requesterCustomerId), str(p.requesterName)),
          refs: compactRefs({ requestId: str(p.requestId) }),
          // visitContext é texto livre do cliente — NÃO copia (LGPD).
          payload: {},
        };
      }

      case 'late_arrival.approved':
      case 'late_arrival.rejected': {
        const sessionId = this.anchor(wire, p.tableSessionId);
        if (!sessionId) return null;
        const approved = wire === 'late_arrival.approved';
        return {
          id: `la:${str(p.requestId)}:${approved ? 'approved' : 'rejected'}`,
          kind,
          at: pickAt(p, 'occurredAt', 'timestamp'),
          sessionId,
          // decidedByCustomerId ausente/null = decisão de staff/sistema (o
          // wire M2 não distingue) → system, como o timeout do M1.
          actor: str(p.decidedByCustomerId)
            ? actorOf('customer', str(p.decidedByCustomerId))
            : SYSTEM_ACTOR,
          refs: compactRefs({ requestId: str(p.requestId) }),
          // reason aqui é enum (host_rejected|host_timeout|walkin_no_host).
          payload: compact({ reason: approved ? undefined : (p.reason ?? undefined) }),
        };
      }

      case 'table_merge.created': {
        // Dono da timeline = sessão de ORIGEM (M1); target vai pro payload.
        const sessionId = this.anchor(wire, p.originSessionId);
        if (!sessionId) return null;
        return {
          id: `merge:${str(p.requestId)}`,
          kind,
          at: pickAt(p, 'createdAt', 'timestamp'),
          sessionId,
          // Wire não carrega o id do requester — o host de origem pediu;
          // fica o nome estruturado que o payload já expõe.
          actor: actorOf('customer', null, str(p.originHostName)),
          refs: compactRefs({ requestId: str(p.requestId) }),
          payload: compact({ targetSessionId: p.targetSessionId ?? undefined }),
        };
      }

      case 'table_merge.approved':
      case 'table_merge.rejected': {
        const approved = wire === 'table_merge.approved';
        // Consentimento parcial (side a/b, status pending) NÃO é o ato
        // "merge aprovado" — só a consumação entra na timeline.
        if (approved && p.status !== undefined && p.status !== 'approved') return null;
        const sessionId = this.anchor(wire, p.originSessionId);
        if (!sessionId) return null;
        return {
          id: `merge:${str(p.requestId)}:${approved ? 'approved' : 'rejected'}`,
          kind,
          at: pickAt(p, 'decidedAt', 'timestamp'),
          sessionId,
          // Sem decidedByCustomerId = timeout do TTL ou staff override → system.
          actor: str(p.decidedByCustomerId)
            ? actorOf('customer', str(p.decidedByCustomerId))
            : SYSTEM_ACTOR,
          refs: compactRefs({ requestId: str(p.requestId) }),
          payload: compact({
            targetSessionId: p.targetSessionId ?? undefined,
            rejectedBy: approved ? undefined : (p.rejectedBy ?? undefined),
          }),
        };
      }

      case 'complaint.received': {
        const sessionId = this.anchor(wire, p.tableSessionId);
        if (!sessionId) return null;
        return {
          id: `comp:${str(p.complaintId)}`,
          kind,
          at: pickAt(p, 'createdAt', 'timestamp'),
          sessionId,
          actor: actorOf('customer', str(p.customerId), str(p.customerName)),
          refs: {},
          // description é texto livre do cliente — NÃO copia (LGPD); a
          // entry referencia a reclamação pelo id no próprio `comp:<id>`.
          payload: compact({ rating: p.rating ?? null, problemType: p.problemType }),
        };
      }

      case 'complaint.resolved': {
        // Wire M2 não carrega tableSessionId — no-op até enriquecerem o
        // payload (anchor loga em debug).
        const sessionId = this.anchor(wire, p.tableSessionId);
        if (!sessionId) return null;
        return {
          id: `comp:${str(p.complaintId)}:resolved`,
          kind,
          at: pickAt(p, 'resolvedAt', 'timestamp'),
          sessionId,
          actor: str(p.resolvedBy) ? actorOf('staff', str(p.resolvedBy)) : SYSTEM_ACTOR,
          refs: {},
          payload: {},
        };
      }

      case 'courtesy.created': {
        const sessionId = this.anchor(wire, p.tableSessionId);
        if (!sessionId) return null;
        return {
          id: `court:${str(p.id)}`,
          kind,
          at: pickAt(p, 'createdAt', 'timestamp'),
          sessionId,
          // DTO só expõe managerName (sem staff id) — staff com nome.
          actor: str(p.managerName) ? actorOf('staff', null, str(p.managerName)) : SYSTEM_ACTOR,
          refs: {},
          // notes é texto livre do gerente — NÃO copia (LGPD).
          payload: compact({
            type: p.type,
            item: p.item,
            status: p.status,
            tableNumber: p.tableNumber ?? undefined,
          }),
        };
      }

      case 'session.flag_changed': {
        const sessionId = this.anchor(wire, p.sessionId);
        if (!sessionId) return null;
        const by = p.by as { staffId?: string | null; name?: string | null } | undefined;
        const flags = Array.isArray(p.flags) ? (p.flags as string[]) : [];
        // Wire não tem pk de session_flags nem timestamp — id da combinação
        // (re-toggle idêntico colapsa; ver doc de regras de id acima).
        const flagsKey = [...flags].sort().join(',');
        return {
          id: `ws:session.flag_changed:${sessionId}:${flagsKey}:${str(by?.staffId)}`,
          kind,
          at: pickAt(p),
          sessionId,
          actor: by?.staffId ? actorOf('staff', by.staffId, by.name) : SYSTEM_ACTOR,
          refs: {},
          payload: compact({ flags, tableNumber: p.tableNumber ?? undefined }),
        };
      }

      case 'host.table_liberated': {
        const sessionId = this.anchor(wire, p.sessionId);
        if (!sessionId) return null;
        const by = p.by as { staffId?: string | null; name?: string | null } | undefined;
        return {
          id: `sess:${sessionId}:closed`,
          kind,
          at: pickAt(p, 'liberatedAt', 'timestamp'),
          sessionId,
          // mode auto → by.staffId null → system (paridade com closed_by M1).
          actor: by?.staffId ? actorOf('staff', by.staffId, by.name) : SYSTEM_ACTOR,
          refs: {},
          // reason do manual_force é texto livre — NÃO copia (LGPD).
          payload: compact({ mode: p.mode }),
        };
      }

      case 'payment.confirmed': {
        const sessionId = this.anchor(wire, p.tableSessionId);
        if (!sessionId) return null;
        return {
          id: `pay:${str(p.paymentId)}`,
          kind,
          at: pickAt(p, 'confirmedAt', 'timestamp'),
          sessionId,
          // payments não tem customer_id — vem resolvido server-side quando
          // o caller souber (M3); null = pagamento da mesa (M1 parity).
          actor: actorOf('customer', str(p.customerId)),
          refs: compactRefs({ paymentId: str(p.paymentId) }),
          payload: compact({
            amountCents: p.amountCents,
            method: p.method ?? undefined,
            splitMode: p.splitMode ?? undefined,
            visitId: p.visitId ?? undefined,
          }),
        };
      }

      default:
        // Kind mapeado mas família sem builder — não deve acontecer (a
        // tabela e o switch andam juntos); warn pra pegar drift em dev.
        this.logger.warn(`Wire ${wire} tem kind ${kind} mas nenhum builder no tap`);
        return null;
    }
  }

  /** Âncora de sessão: sem ela a entrada não entra (no-op com log debug). */
  private anchor(wire: WsEventName, value: unknown): string | null {
    const sessionId = str(value);
    if (!sessionId) {
      this.logger.debug(`Evento ${wire} sem âncora de sessão — timeline pulada`);
      return null;
    }
    return sessionId;
  }
}

// ─── Primitivas puras ─────────────────────────────────────────────────────

const SYSTEM_ACTOR: TimelineActor = { type: 'system', id: null, name: null };

function actorOf(
  type: TimelineActor['type'],
  id?: string | null,
  name?: string | null,
): TimelineActor {
  return { type, id: id ?? null, name: name ?? null };
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Timestamp do ATO: primeira chave string presente no payload, fallback
 * now() (os payloads M2/M3 carregam o campo — o fallback cobre
 * session.flag_changed, único wire tapeado sem timestamp).
 */
function pickAt(p: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = str(p[key]);
    if (value) return value;
  }
  return new Date().toISOString();
}

/** Omite chaves undefined — payloads enxutos e deep-equal-áveis (M1). */
function compact(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function compactRefs(refs: Record<string, string | null>): TimelineRefs {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(refs)) {
    if (value) out[key] = value;
  }
  return out as TimelineRefs;
}
