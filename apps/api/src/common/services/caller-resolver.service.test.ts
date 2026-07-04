/**
 * Gate #34 (decisão Caleb, opção A) — a identidade que AGE deriva do token
 * de sessão verificado, carimbado pelos guards em `req.staffAuth`.
 *
 * Antes: requireStaffId/requireActiveStaffId liam SÓ o header
 * `x-staff-id` (client-controlled) — staff autenticado podia passar o
 * UUID de OUTRO staff e agir/auditar como ele em rotas com só
 * StaffOnlyGuard. Agora:
 *   - com `req.staffAuth` (token verificado) → o staffId vem do TOKEN,
 *     ignorando o header; header divergente vira warn (spoof ou bug).
 *   - sem `req.staffAuth` (fluxo key/TV legado) → fallback pro header,
 *     comportamento ATUAL preservado (shape UUID + cross-check DB no
 *     requireActiveStaffId).
 */

import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { CallerResolverService } from './caller-resolver.service';
import type { CustomersService } from '../../modules/customers/customers.service';
import type { TenantConnectionProvider } from '../../modules/tenant/tenant-connection.provider';
import type { StaffSessionPayload } from '../auth/staff-session-token';

const TOKEN_STAFF_ID = 'aaaaaaaa-0000-4000-8000-00000000000a';
const OTHER_STAFF_ID = 'bbbbbbbb-0000-4000-8000-00000000000b';
const SLUG = 'restaurant_dev';

function staffAuth(staffId = TOKEN_STAFF_ID): StaffSessionPayload {
  return { staffId, role: 'waiter', slug: SLUG, exp: Date.now() + 60_000 };
}

function makeService(activeRows: unknown[] = [{ ok: 1 }]) {
  const query = jest.fn(async () => activeRows);
  const service = new CallerResolverService(
    {} as CustomersService,
    { query } as unknown as TenantConnectionProvider,
  );
  return { service, query };
}

function reqWith(
  headers: Record<string, string | string[] | undefined>,
  auth?: StaffSessionPayload,
): Request {
  return { headers, ...(auth ? { staffAuth: auth } : {}) } as unknown as Request;
}

function statusOf(fn: () => unknown): number {
  try {
    fn();
  } catch (err) {
    if (err instanceof HttpException) return err.getStatus();
    throw err;
  }
  throw new Error('esperava HttpException');
}

describe('CallerResolverService — identidade staff do token (gate #34)', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('requireStaffId com req.staffAuth (token verificado)', () => {
    it('retorna o staffId DO TOKEN mesmo com x-staff-id DIFERENTE no header (+ warn)', () => {
      const { service } = makeService();
      const req = reqWith({ 'x-staff-id': OTHER_STAFF_ID }, staffAuth());

      expect(service.requireStaffId(req)).toBe(TOKEN_STAFF_ID);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('header igual ao token → retorna o staffId sem warn', () => {
      const { service } = makeService();
      const req = reqWith({ 'x-staff-id': TOKEN_STAFF_ID }, staffAuth());

      expect(service.requireStaffId(req)).toBe(TOKEN_STAFF_ID);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('header AUSENTE com staffAuth presente → retorna o staffId do token (sem 401)', () => {
      const { service } = makeService();
      const req = reqWith({}, staffAuth());

      expect(service.requireStaffId(req)).toBe(TOKEN_STAFF_ID);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('requireStaffId sem staffAuth (fluxo key/TV legado — comportamento atual)', () => {
    it('header UUID válido → retorna o header', () => {
      const { service } = makeService();
      expect(service.requireStaffId(reqWith({ 'x-staff-id': OTHER_STAFF_ID }))).toBe(
        OTHER_STAFF_ID,
      );
    });

    it('header ausente → 401', () => {
      const { service } = makeService();
      expect(statusOf(() => service.requireStaffId(reqWith({})))).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('header com shape inválido → 401', () => {
      const { service } = makeService();
      expect(statusOf(() => service.requireStaffId(reqWith({ 'x-staff-id': 'not-a-uuid' })))).toBe(
        HttpStatus.UNAUTHORIZED,
      );
    });
  });

  describe('requireActiveStaffId — cross-check DB de is_active continua', () => {
    it('staffAuth + staff ATIVO no DB → resolve com o staffId do token (query com o id do token)', async () => {
      const { service, query } = makeService([{ ok: 1 }]);
      const req = reqWith({ 'x-staff-id': OTHER_STAFF_ID }, staffAuth());

      await expect(service.requireActiveStaffId(req)).resolves.toBe(TOKEN_STAFF_ID);
      expect(query).toHaveBeenCalledWith(expect.stringContaining('is_active'), [TOKEN_STAFF_ID]);
    });

    it('staffAuth + staff INATIVO no DB → 401 (token de 12h não sobrevive a demissão)', async () => {
      const { service, query } = makeService([]);
      const req = reqWith({}, staffAuth());

      await expect(service.requireActiveStaffId(req)).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
      });
      // O 401 tem que vir do cross-check DB (is_active), não de header ausente.
      expect(query).toHaveBeenCalledWith(expect.stringContaining('is_active'), [TOKEN_STAFF_ID]);
    });
  });

  describe('tryGetStaffId — mesma regra via requireStaffId', () => {
    it('com staffAuth → staffId do token, ignorando header lixo', () => {
      const { service } = makeService();
      expect(service.tryGetStaffId(reqWith({ 'x-staff-id': 'garbage' }, staffAuth()))).toBe(
        TOKEN_STAFF_ID,
      );
    });

    it('sem staffAuth e sem header → null (comportamento atual)', () => {
      const { service } = makeService();
      expect(service.tryGetStaffId(reqWith({}))).toBeNull();
    });
  });
});
