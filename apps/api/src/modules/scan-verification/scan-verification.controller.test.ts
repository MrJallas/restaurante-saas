/**
 * P1-D (gate #34) — o ator que APROVA/REJEITA a verificação de scan físico
 * (libera sessão/mesa) tem que derivar do token de sessão VERIFICADO
 * (`req.staffAuth`, carimbado pelo StaffOnlyGuard), NÃO do header cru
 * `x-staff-id` (client-controlled, spoofável).
 *
 * Antes: o controller lia um helper local `requireStaffId(req)` que olhava
 * só o header — um staff com x-staff-key + x-staff-id de OUTRO aprovava scan
 * como ele. É o OPOSTO do resto do app pós-gate #34. Agora o controller passa
 * pelo CallerResolverService (mesmo padrão do complaints `resolve`), que
 * prefere `req.staffAuth` e cai no header só no fluxo key/TV legado.
 *
 * O staffId com que o service é chamado É a atribuição da ação (audit +
 * resolvedByStaffId gravados no service.respond) — por isso o teste crava
 * o argumento passado ao service, não o DTO de retorno.
 */

import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { ScanVerificationController } from './scan-verification.controller';
import type { ScanVerificationService } from './scan-verification.service';
import { CallerResolverService } from '../../common/services/caller-resolver.service';
import type { CustomersService } from '../../modules/customers/customers.service';
import type { TenantConnectionProvider } from '../../modules/tenant/tenant-connection.provider';
import type { StaffSessionPayload } from '../../common/auth/staff-session-token';
import type { ScanVerificationRequestDto } from '@restaurant/shared-types';

const TOKEN_STAFF_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const HEADER_STAFF_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const SLUG = 'restaurant_dev';
const SCAN_ID = 'cccccccc-0000-4000-8000-00000000000c';

function staffAuth(staffId = TOKEN_STAFF_A): StaffSessionPayload {
  return { staffId, role: 'waiter', slug: SLUG, exp: Date.now() + 60_000 };
}

function reqWith(
  headers: Record<string, string | string[] | undefined>,
  auth?: StaffSessionPayload,
): Request {
  return { headers, ...(auth ? { staffAuth: auth } : {}) } as unknown as Request;
}

function makeController(activeRows: unknown[] = [{ ok: 1 }]) {
  const dto = { id: SCAN_ID } as ScanVerificationRequestDto;
  const approve = jest.fn(async () => dto);
  const reject = jest.fn(async () => dto);
  const service = { approve, reject } as unknown as ScanVerificationService;

  const query = jest.fn(async () => activeRows);
  const resolver = new CallerResolverService(
    {} as CustomersService,
    { query } as unknown as TenantConnectionProvider,
  );

  const controller = new ScanVerificationController(service, resolver);
  return { controller, approve, reject, query };
}

describe('ScanVerificationController — ator do approve/reject vem do token (gate #34, P1-D)', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('com req.staffAuth (token verificado do staff A) + x-staff-id spoofado (staff B)', () => {
    it('approve → atribui a ação ao staff A (token), ignorando o header B (+ warn)', async () => {
      const { controller, approve } = makeController();
      const req = reqWith({ 'x-staff-id': HEADER_STAFF_B }, staffAuth(TOKEN_STAFF_A));

      await controller.approve(SLUG, SCAN_ID, req);

      expect(approve).toHaveBeenCalledWith(SCAN_ID, TOKEN_STAFF_A, SLUG);
      expect(approve).not.toHaveBeenCalledWith(SCAN_ID, HEADER_STAFF_B, SLUG);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('reject → atribui a ação ao staff A (token), ignorando o header B (+ warn)', async () => {
      const { controller, reject } = makeController();
      const req = reqWith({ 'x-staff-id': HEADER_STAFF_B }, staffAuth(TOKEN_STAFF_A));

      await controller.reject(SLUG, SCAN_ID, { reason: 'foto do QR' }, req);

      expect(reject).toHaveBeenCalledWith(SCAN_ID, TOKEN_STAFF_A, 'foto do QR', SLUG);
      expect(reject).not.toHaveBeenCalledWith(SCAN_ID, HEADER_STAFF_B, 'foto do QR', SLUG);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('sem req.staffAuth (fluxo key/TV legado) → header como fallback (comportamento atual)', () => {
    it('approve → usa o x-staff-id validado por shape + cross-check is_active', async () => {
      const { controller, approve, query } = makeController([{ ok: 1 }]);
      const req = reqWith({ 'x-staff-id': HEADER_STAFF_B });

      await controller.approve(SLUG, SCAN_ID, req);

      expect(approve).toHaveBeenCalledWith(SCAN_ID, HEADER_STAFF_B, SLUG);
      expect(query).toHaveBeenCalledWith(expect.stringContaining('is_active'), [HEADER_STAFF_B]);
    });

    it('approve → staff INATIVO no DB (is_active=false) → 401, ação não executa', async () => {
      const { controller, approve } = makeController([]);
      const req = reqWith({ 'x-staff-id': HEADER_STAFF_B });

      await expect(controller.approve(SLUG, SCAN_ID, req)).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
      });
      expect(approve).not.toHaveBeenCalled();
    });

    it('approve → header ausente e sem token → 401', async () => {
      const { controller, approve } = makeController();
      const req = reqWith({});

      await expect(controller.approve(SLUG, SCAN_ID, req)).rejects.toBeInstanceOf(HttpException);
      expect(approve).not.toHaveBeenCalled();
    });
  });
});
