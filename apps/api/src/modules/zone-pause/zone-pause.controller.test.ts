/**
 * P1 IDOR-READ (re-scan de convergência #6): um caller de SESSÃO (customer)
 * que atinge `GET /:slug/zone-pauses` NÃO pode receber PII de staff. O mapRow
 * completo do service projeta `waiterName` / `startedByName` (NOMES completos),
 * `startedBy` / `endedBy` (UUIDs de staff → vetor de escalação id→role→
 * x-staff-id, mesmo leak que staff.controller já bloqueia) e `reason` (nota
 * interna free-text do manager). O FE customer (useZonePause.ts, interface
 * ActiveZonePause) só consome `{ id, waiterId, endsAt }` — nada disso.
 *
 * Fix simétrico ao continuation.controller (ec01ea1) e staff my-tables
 * (B-NEW-44): branch por `req.actorType` carimbado pelo StaffOrSessionGuard.
 * Session → projeção enxuta (`listPublic`). Staff → mapRow completo (`list`),
 * porque o dashboard PRECISA dos nomes/reason.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ZonePauseController } from './zone-pause.controller';
import { ZonePauseService } from './zone-pause.service';
import { StaffOrSessionGuard } from '../../common/guards/staff-or-session.guard';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import { ManagerOnlyGuard } from '../../common/guards/manager-only.guard';
import { CallerResolverService } from '../../common/services/caller-resolver.service';

const PAUSE_ID = '11111111-1111-4111-8111-111111111111';
const WAITER_ID = '22222222-2222-4222-8222-222222222222';
const STARTED_BY_UUID = '33333333-3333-4333-8333-333333333333';
const ENDED_BY_UUID = '44444444-4444-4444-8444-444444444444';
const ENDS_AT = '2099-01-01T00:00:00.000Z';

/** Shape completo que o mapRow do service devolve pro staff dashboard. */
const FULL_ROW = {
  id: PAUSE_ID,
  waiterId: WAITER_ID,
  waiterName: 'Ana Garçonete',
  kind: 'orders',
  startedAt: '2098-12-31T23:55:00.000Z',
  endsAt: ENDS_AT,
  startedBy: STARTED_BY_UUID,
  startedByName: 'Bruno Gerente',
  endedAt: null,
  endedBy: ENDED_BY_UUID,
  reason: 'garçom no banheiro — nota interna sensível',
  active: true,
};

/** Projeção enxuta que o customer path deve devolver. */
const LEAN_ROW = {
  id: PAUSE_ID,
  waiterId: WAITER_ID,
  endsAt: ENDS_AT,
  active: true,
};

/** Campos de staff que NUNCA podem vazar pro customer. */
const STAFF_PII_FIELDS = [
  'waiterName',
  'startedByName',
  'startedBy',
  'endedBy',
  'reason',
] as const;

describe('GET /:slug/zone-pauses · IDOR-READ (session vs staff projection)', () => {
  const list = jest.fn();
  const listPublic = jest.fn();

  // Guard configurável: cada teste carimba `actorType` no request exatamente
  // como o StaffOrSessionGuard faz em produção (linhas 51-84).
  let stampRequest: (req: Record<string, unknown>) => void;

  async function buildApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      controllers: [ZonePauseController],
      providers: [
        { provide: ZonePauseService, useValue: { list, listPublic } },
        { provide: CallerResolverService, useValue: { requireStaffId: jest.fn() } },
      ],
    })
      .overrideGuard(StaffOrSessionGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => Record<string, unknown> };
        }) => {
          stampRequest(ctx.switchToHttp().getRequest());
          return true;
        },
      })
      .overrideGuard(StaffOnlyGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ManagerOnlyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const built = moduleRef.createNestApplication();
    built.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await built.init();
    return built;
  }

  beforeEach(() => {
    list.mockReset();
    listPublic.mockReset();
    list.mockResolvedValue([FULL_ROW]);
    listPublic.mockResolvedValue([LEAN_ROW]);
  });

  it('session caller: recebe SÓ a projeção enxuta — sem nenhum campo de PII de staff', async () => {
    stampRequest = (req) => {
      req.actorType = 'session';
    };
    const app = await buildApp();
    try {
      const res = await request(app.getHttpServer())
        .get('/restaurant_dev/zone-pauses?active=true')
        .expect(200);

      // Usa o path enxuto, nunca o mapRow completo.
      expect(listPublic).toHaveBeenCalledTimes(1);
      expect(list).not.toHaveBeenCalled();

      expect(Array.isArray(res.body)).toBe(true);
      const row = res.body[0];
      // O FE customer consome exatamente estes campos.
      expect(row.id).toBe(PAUSE_ID);
      expect(row.waiterId).toBe(WAITER_ID);
      expect(row.endsAt).toBe(ENDS_AT);

      // Nenhum campo de staff pode aparecer.
      for (const field of STAFF_PII_FIELDS) {
        expect(row).not.toHaveProperty(field);
      }
    } finally {
      await app.close();
    }
  });

  it('staff caller: recebe o shape completo com nomes/UUIDs/reason (dashboard)', async () => {
    stampRequest = (req) => {
      req.actorType = 'staff';
    };
    const app = await buildApp();
    try {
      const res = await request(app.getHttpServer())
        .get('/restaurant_dev/zone-pauses?active=true')
        .expect(200);

      // Staff usa o mapRow completo, nunca a projeção enxuta.
      expect(list).toHaveBeenCalledTimes(1);
      expect(listPublic).not.toHaveBeenCalled();

      const row = res.body[0];
      expect(row.waiterName).toBe('Ana Garçonete');
      expect(row.startedByName).toBe('Bruno Gerente');
      expect(row.startedBy).toBe(STARTED_BY_UUID);
      expect(row.endedBy).toBe(ENDED_BY_UUID);
      expect(row.reason).toContain('nota interna');
    } finally {
      await app.close();
    }
  });
});
