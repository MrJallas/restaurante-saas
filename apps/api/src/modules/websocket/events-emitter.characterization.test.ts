/**
 * CHARACTERIZATION TEST (protocolo characterization-first do projeto) —
 * congela o comportamento de WIRE dos helpers emit* do EventsGateway
 * ANTES da extração do EventsEmitterService (fix/framework-bugfixes).
 *
 * O que este arquivo fixa (comportamento REAL observado no código, sem
 * julgamento):
 *  - rooms alvo de cada emissão (incluindo fallbacks e null-guards);
 *  - wire name exato de cada evento;
 *  - shape do payload (spreads, campos derivados, timestamps ISO);
 *  - a regressão B-NEW-3: staff_message.read NUNCA usa emit global.
 *
 * REGRA DO PROTOCOLO: este teste roda verde antes E depois da extração
 * SEM SER EDITADO — ele testa o EventsGateway (que vira facade), então o
 * verde pós-refactor é a prova de preservação. Por isso o harness não
 * hardcoda a assinatura do construtor: instancia via `design:paramtypes`
 * (cada dependência vira um stub com o PROTOTYPE real da classe, sem
 * rodar o constructor dela) e simula o lifecycle do Nest — popula
 * `server` (papel do @WebSocketServer()) e chama `afterInit` se o
 * gateway o expuser (papel do adapter pós OnGatewayInit). Assim o teste
 * congela COMPORTAMENTO, não wiring de DI.
 */

import 'reflect-metadata';
import { EventsGateway } from './events.gateway';
import type {
  WsEscalationCreated,
  WsComplaintRead,
  WsLateArrivalExpired,
  WsStaffMessageReceived,
  WsStaffMessageRead,
} from '@restaurant/shared-types';

const SLUG = 'resto_dev';

interface EmittedRecord {
  rooms: string | string[];
  event: string;
  payload: Record<string, unknown>;
}

function instantiateGateway(): EventsGateway {
  const paramTypes =
    (Reflect.getMetadata('design:paramtypes', EventsGateway) as unknown[] | undefined) ?? [];
  const args = paramTypes.map((dep) => {
    const proto =
      typeof dep === 'function' ? (dep as { prototype?: object | null }).prototype : null;
    // Prototype real => métodos reais disponíveis (os emit* nunca tocam
    // redis/dataSource, então stubs "ocos" bastam pra essas deps).
    return proto ? (Object.create(proto) as object) : {};
  });
  const Ctor = EventsGateway as unknown as new (...ctorArgs: unknown[]) => EventsGateway;
  return new Ctor(...args);
}

function createHarness() {
  const emitted: EmittedRecord[] = [];
  const to = jest.fn((rooms: string | string[]) => ({
    emit: jest.fn((event: string, payload: unknown) => {
      emitted.push({ rooms, event, payload: payload as Record<string, unknown> });
    }),
  }));
  // Guard da regressão B-NEW-3: emit global no Server (broadcast pra TODOS
  // os sockets, cross-tenant) precisa ser detectável.
  const globalEmit = jest.fn();
  const fakeServer = { to, emit: globalEmit };

  const gateway = instantiateGateway();
  (gateway as unknown as { server: unknown }).server = fakeServer;
  // Lifecycle do Nest: o adapter chama afterInit(server) depois de popular
  // @WebSocketServer(). O gateway atual não implementa OnGatewayInit — o
  // optional call cobre as duas versões sem editar o teste.
  const afterInit = (gateway as unknown as { afterInit?: (srv: unknown) => void }).afterInit;
  if (typeof afterInit === 'function') {
    afterInit.call(gateway, fakeServer);
  }
  return { gateway, emitted, to, globalEmit };
}

function expectIsoTimestamp(value: unknown): void {
  expect(typeof value).toBe('string');
  expect(new Date(value as string).toISOString()).toBe(value);
}

describe('EventsGateway emit* — characterization de rooms/wire/payload', () => {
  it('a. emitOrderStatusUpdate → order:status pra tenant:<slug>:waiter E tenant:<slug>:kitchen com timestamp ISO', () => {
    const { gateway, emitted } = createHarness();

    gateway.emitOrderStatusUpdate(SLUG, 'order-1', 'preparing', 'Mesa 7');

    expect(emitted).toHaveLength(2);
    expect(emitted.map((e) => e.rooms)).toEqual([
      `tenant:${SLUG}:waiter`,
      `tenant:${SLUG}:kitchen`,
    ]);
    for (const record of emitted) {
      expect(record.event).toBe('order:status');
      expect(record.payload).toMatchObject({
        orderId: 'order-1',
        status: 'preparing',
        tableLabel: 'Mesa 7',
      });
      expectIsoTimestamp(record.payload.timestamp);
    }
  });

  it('b1. emitOrderHandoffCalled COM targetWaiterId → kitchen + staff:<id> (sem fallback waiter)', () => {
    const { gateway, emitted } = createHarness();

    gateway.emitOrderHandoffCalled(SLUG, {
      orderId: 'order-2',
      deliveryId: 'del-2',
      tableLabel: 'Mesa 3',
      tableCode: 'M3',
      zoneName: 'Salão',
      targetWaiterId: 'waiter-77',
      targetWaiterName: 'Rui',
    });

    expect(emitted).toHaveLength(2);
    expect(emitted.map((e) => e.rooms)).toEqual([`tenant:${SLUG}:kitchen`, 'staff:waiter-77']);
    for (const record of emitted) {
      expect(record.event).toBe('order:handoff_called');
      expect(record.payload).toMatchObject({
        orderId: 'order-2',
        deliveryId: 'del-2',
        tableLabel: 'Mesa 3',
        tableCode: 'M3',
        zoneName: 'Salão',
        targetWaiterId: 'waiter-77',
        targetWaiterName: 'Rui',
      });
      expectIsoTimestamp(record.payload.timestamp);
    }
  });

  it('b2. emitOrderHandoffCalled SEM targetWaiterId → fallback tenant:<slug>:waiter (kitchen sempre recebe)', () => {
    const { gateway, emitted } = createHarness();

    gateway.emitOrderHandoffCalled(SLUG, {
      orderId: 'order-3',
      deliveryId: 'del-3',
      tableLabel: 'Mesa 4',
      tableCode: 'M4',
      targetWaiterId: null,
    });

    expect(emitted).toHaveLength(2);
    expect(emitted.map((e) => e.rooms)).toEqual([
      `tenant:${SLUG}:kitchen`,
      `tenant:${SLUG}:waiter`,
    ]);
    expect(emitted.every((e) => e.event === 'order:handoff_called')).toBe(true);
  });

  it('c. emitAlertCreated → SÓ tenant:<slug>:manager, payload passthrough (mesma referência, sem timestamp injetado)', () => {
    const { gateway, emitted } = createHarness();
    const alert = { id: 'alert-1', kind: 'kds_stuck', actions: [{ label: 'Ver' }] };

    gateway.emitAlertCreated(SLUG, alert);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].rooms).toBe(`tenant:${SLUG}:manager`);
    expect(emitted[0].event).toBe('alert.created');
    expect(emitted[0].payload).toBe(alert);
  });

  it('d1. emitEscalationCreated com assigneeStaffId null → só tenant:<slug> (sem staff room)', () => {
    const { gateway, emitted } = createHarness();
    const payload: WsEscalationCreated['payload'] = {
      escalationId: 'esc-1',
      type: 'qr_issue',
      tenantId: 'tenant-1',
      context: {},
      deadline: '2026-07-04T12:00:00.000Z',
    };

    gateway.emitEscalationCreated(SLUG, null, payload);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].rooms).toBe(`tenant:${SLUG}`);
    expect(emitted[0].event).toBe('escalation.created');
    expect(emitted[0].payload).toBe(payload);
  });

  it('d2. emitComplaintRead com managerId null → só tenant:<slug> (sem manager room)', () => {
    const { gateway, emitted } = createHarness();
    const payload: WsComplaintRead['payload'] = {
      complaintId: 'comp-1',
      readAt: '2026-07-04T12:00:00.000Z',
    };

    gateway.emitComplaintRead(SLUG, null, payload);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].rooms).toBe(`tenant:${SLUG}`);
    expect(emitted[0].event).toBe('complaint.read');
    expect(emitted[0].payload).toBe(payload);
  });

  it('d3. emitLateArrivalExpired com requesterCustomerId null → só rooms incondicionais tenant:<slug> + session:<id>', () => {
    const { gateway, emitted } = createHarness();
    const payload: WsLateArrivalExpired['payload'] = {
      requestId: 'late-1',
      tableSessionId: 'ts-9',
    };

    gateway.emitLateArrivalExpired(SLUG, null, payload);

    expect(emitted).toHaveLength(2);
    expect(emitted.map((e) => e.rooms)).toEqual([`tenant:${SLUG}`, 'session:ts-9']);
    expect(emitted.every((e) => e.event === 'late_arrival.expired')).toBe(true);
    expect(emitted.every((e) => e.payload === payload)).toBe(true);
  });

  it('e1. emitLgpdFulfilled sem requestId → fallback requestId=protocolNumber, type erasure, fulfilledAt ISO, rooms tenant + customer', () => {
    const { gateway, emitted } = createHarness();

    gateway.emitLgpdFulfilled(SLUG, 'cust-5', 'LGPD-2026-0042');

    expect(emitted).toHaveLength(2);
    expect(emitted.map((e) => e.rooms)).toEqual([`tenant:${SLUG}`, 'customer:cust-5']);
    for (const record of emitted) {
      expect(record.event).toBe('lgpd.request_fulfilled');
      expect(record.payload).toMatchObject({
        requestId: 'LGPD-2026-0042',
        customerId: 'cust-5',
        type: 'erasure',
        protocolNumber: 'LGPD-2026-0042',
      });
      expectIsoTimestamp(record.payload.fulfilledAt);
    }
  });

  it('e2. emitLgpdFulfilled com requestId explícito → não usa o fallback', () => {
    const { gateway, emitted } = createHarness();

    gateway.emitLgpdFulfilled(SLUG, 'cust-6', 'LGPD-2026-0043', 'req-original');

    expect(emitted).toHaveLength(2);
    expect(emitted.every((e) => e.payload.requestId === 'req-original')).toBe(true);
    expect(emitted.every((e) => e.payload.protocolNumber === 'LGPD-2026-0043')).toBe(true);
  });

  it('f. emitStaffThreadMessageReceived → dedupe+filter de staffIds num ÚNICO .to(roomsArray)', () => {
    const { gateway, emitted, to } = createHarness();
    const payload = {
      message: { id: 'msg-1' },
    } as unknown as WsStaffMessageReceived['payload'];

    gateway.emitStaffThreadMessageReceived(SLUG, ['s1', 's2', 's1', '', 's2'], payload);

    expect(to).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].rooms).toEqual(['staff:s1', 'staff:s2']);
    expect(emitted[0].event).toBe('staff_message.received');
    expect(emitted[0].payload).toBe(payload);
  });

  it('g. emitStaffMessageRead escopado a tenant:<slug> — NUNCA this.server.emit global (B-NEW-3)', () => {
    const { gateway, emitted, globalEmit } = createHarness();
    const payload: WsStaffMessageRead['payload'] = {
      messageId: 'msg-9',
      threadId: 'thread-9',
      readAt: '2026-07-04T12:00:00.000Z',
      by: 'staff-1',
    };

    gateway.emitStaffMessageRead(SLUG, payload);

    expect(globalEmit).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(1);
    expect(emitted[0].rooms).toBe(`tenant:${SLUG}`);
    expect(emitted[0].event).toBe('staff_message.read');
    expect(emitted[0].payload).toBe(payload);
  });
});
