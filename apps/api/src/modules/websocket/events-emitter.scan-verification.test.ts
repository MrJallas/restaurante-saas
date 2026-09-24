/**
 * Roteamento dos eventos `scan_verification.*` pelas salas por papel.
 *
 * Desde o hardening de 2026-07-17 a room genérica `tenant:<slug>` recebe só
 * manager/owner (auditoria/PII gerencial); host e garçom ficam apenas em
 * `tenant:<slug>:<papel>`. `created` e `escalated` já iam pra essas salas,
 * mas `resolved` continuava só na room genérica — o garçom no fim da escalada
 * (e o host no começo dela) nunca recebia o desfecho e a pendência ficava
 * presa na tela (E2E 9 do physical-qr-heavy).
 */

import { EventsEmitterService } from './events-emitter.service';

const SLUG = 'resto_dev';

interface EmittedRecord {
  rooms: string | string[];
  event: string;
  payload: unknown;
}

function createEmitter() {
  const emitted: EmittedRecord[] = [];
  const to = jest.fn((rooms: string | string[]) => ({
    emit: jest.fn((event: string, payload: unknown) => {
      emitted.push({ rooms, event, payload });
    }),
  }));
  const emitter = new EventsEmitterService();
  emitter.bindServer({ to } as never);
  return { emitter, emitted };
}

function roomsOf(record: EmittedRecord): string[] {
  return Array.isArray(record.rooms) ? record.rooms : [record.rooms];
}

describe('EventsEmitterService · scan_verification routing', () => {
  const payload = {
    requestId: 'req-1',
    tableSessionId: 'ts-1',
    requesterCustomerId: 'cust-1',
    status: 'expired' as const,
    decidedAt: '2026-09-24T12:00:00.000Z',
    decidedByStaffId: null,
    reason: 'auto-timeout',
  };

  it('resolved chega em todas as salas de papel da cascata (host → manager → waiter)', () => {
    const { emitter, emitted } = createEmitter();

    emitter.emitScanVerificationResolved(SLUG, payload);

    const staffEmit = emitted.find((e) => roomsOf(e).includes(`tenant:${SLUG}`));
    expect(staffEmit).toBeDefined();
    expect(staffEmit!.event).toBe('scan_verification.resolved');
    expect(roomsOf(staffEmit!)).toEqual(
      expect.arrayContaining([
        `tenant:${SLUG}`,
        `tenant:${SLUG}:host`,
        `tenant:${SLUG}:manager`,
        `tenant:${SLUG}:waiter`,
      ]),
    );
    expect(staffEmit!.payload).toBe(payload);
  });

  it('resolved sai em UMA emissão pras salas de staff (manager está em duas e não recebe 2x)', () => {
    const { emitter, emitted } = createEmitter();

    emitter.emitScanVerificationResolved(SLUG, payload);

    const staffEmits = emitted.filter((e) =>
      roomsOf(e).some((room) => room.startsWith(`tenant:${SLUG}`)),
    );
    expect(staffEmits).toHaveLength(1);
  });

  it('resolved mantém o cliente solicitante e a sala da mesa', () => {
    const { emitter, emitted } = createEmitter();

    emitter.emitScanVerificationResolved(SLUG, payload);

    const allRooms = emitted.flatMap(roomsOf);
    expect(allRooms).toEqual(expect.arrayContaining(['customer:cust-1', 'session:ts-1']));
    expect(emitted.every((e) => e.event === 'scan_verification.resolved')).toBe(true);
  });

  it('resolved não vaza pra salas de papel fora da cascata (cozinha/bar)', () => {
    const { emitter, emitted } = createEmitter();

    emitter.emitScanVerificationResolved(SLUG, payload);

    const allRooms = emitted.flatMap(roomsOf);
    expect(allRooms).not.toContain(`tenant:${SLUG}:kitchen`);
    expect(allRooms).not.toContain(`tenant:${SLUG}:bar`);
  });
});
