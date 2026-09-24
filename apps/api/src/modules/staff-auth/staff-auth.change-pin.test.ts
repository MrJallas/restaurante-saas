import { HttpException, HttpStatus } from '@nestjs/common';
import { StaffAuthService } from './staff-auth.service';
import type { AttemptBucket, RedisService } from '../../infra/redis/redis.service';
import {
  clearAttemptsInMemory,
  networkHop,
  reserveAttemptInMemory,
} from '../../infra/redis/attempts-in-memory.testing';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { hashPin, verifyPin } from '../staff/staff-pin.util';
import {
  issueStaffSessionToken,
  verifyStaffSessionToken,
} from '../../common/auth/staff-session-token';

/**
 * Pacote TROCAR-PIN (decisões Caleb 2026-07-04) — POST /:slug/staff-auth/change-pin.
 *
 * Cobre: auth por x-staff-token (401 sem token válido) · currentPin errado é
 * tentativa (401 + throttle 5/15min por staffId → 429) · newPin validado ·
 * sucesso troca o pin_hash, LIMPA must_change_pin, revoga as OUTRAS sessões
 * e devolve token NOVO (a sessão atual não morre junto).
 */

class FakeRedis {
  store = new Map<string, string>();
  counters = new Map<string, number>();
  sets = new Map<string, Set<string>>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
    this.counters.delete(key);
    this.sets.delete(key);
  }
  async incr(key: string): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }
  async sadd(key: string, ...members: string[]): Promise<number> {
    let set = this.sets.get(key);
    if (!set) {
      set = new Set<string>();
      this.sets.set(key, set);
    }
    for (const member of members) set.add(member);
    return members.length;
  }
  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }
  async expire(): Promise<void> {
    /* TTL irrelevante em memória */
  }
  async reserveAttempt(...buckets: AttemptBucket[]): Promise<AttemptBucket | null> {
    await networkHop();
    return reserveAttemptInMemory(this, buckets);
  }
  async clearAttempts(...buckets: AttemptBucket[]): Promise<void> {
    clearAttemptsInMemory(this, buckets);
  }
}

const STAFF_ID = 'a3f1c2d4-0000-4000-8000-000000000001';
const CURRENT_PIN = '4321';
const THROTTLE_LOCK_KEY = `staff-auth:change-pin:acme:${STAFF_ID}:lock`;

interface FakeStaffRow {
  id: string;
  name: string;
  role: string;
  pin_hash: string;
  must_change_pin?: boolean;
  cpf?: string | null;
  phone?: string | null;
  email?: string | null;
}

function makeService(redis: FakeRedis, staffRow: FakeStaffRow | null) {
  const updates: { sql: string; params: unknown[] }[] = [];
  // Cada leitura do staff pelo id é uma conferência do currentPin que aconteceu.
  let pinChecks = 0;
  const tenantConn = {
    getTenantSlug: () => 'acme',
    query: async (sql: string, params: unknown[] = []) => {
      if (/^\s*UPDATE staff/i.test(sql)) {
        updates.push({ sql, params });
        if (staffRow && params[1] === staffRow.id) {
          // pg driver mutation tuple: [rows, affectedCount]
          return [[{ id: staffRow.id, name: staffRow.name, role: staffRow.role }], 1];
        }
        return [[], 0];
      }
      if (/FROM staff/i.test(sql) && /WHERE id/i.test(sql)) {
        pinChecks += 1;
        return staffRow && params[0] === staffRow.id ? [staffRow] : [];
      }
      if (/FROM staff/i.test(sql) && /WHERE cpf/i.test(sql)) {
        return staffRow && params[0] === staffRow.cpf ? [staffRow] : [];
      }
      return [];
    },
  } as unknown as TenantConnectionProvider;
  const service = new StaffAuthService(tenantConn, redis as unknown as RedisService);
  return { service, updates, pinChecks: () => pinChecks };
}

function staffRow(overrides: Partial<FakeStaffRow> = {}): FakeStaffRow {
  return {
    id: STAFF_ID,
    name: 'Marina',
    role: 'waiter',
    pin_hash: hashPin(CURRENT_PIN),
    must_change_pin: false,
    cpf: '39053344705',
    phone: null,
    email: null,
    ...overrides,
  };
}

async function issueFor(redis: FakeRedis, staffId = STAFF_ID, role = 'waiter') {
  return issueStaffSessionToken(redis as unknown as RedisService, {
    staffId,
    role,
    slug: 'acme',
  });
}

async function expectHttpError(
  promise: Promise<unknown>,
  status: HttpStatus,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error(`esperava HttpException ${status}/${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(status);
    expect((err as HttpException).getResponse()).toMatchObject({ code });
  }
}

describe('StaffAuthService.changePin', () => {
  it('401 AUTH_MISSING sem token de sessão válido', async () => {
    const redis = new FakeRedis();
    const { service } = makeService(redis, staffRow());

    await expectHttpError(
      service.changePin({ token: undefined, currentPin: CURRENT_PIN, newPin: '9876' }),
      HttpStatus.UNAUTHORIZED,
      'AUTH_MISSING',
    );
    await expectHttpError(
      service.changePin({
        token: 'token-forjado-invalido',
        currentPin: CURRENT_PIN,
        newPin: '9876',
      }),
      HttpStatus.UNAUTHORIZED,
      'AUTH_MISSING',
    );
  });

  it('400 INVALID_PIN quando o newPin não é 4-6 dígitos (sem consumir tentativa)', async () => {
    const redis = new FakeRedis();
    const { service, updates } = makeService(redis, staffRow());
    const session = await issueFor(redis);

    for (const newPin of ['123', '1234567', 'abcd', '']) {
      await expectHttpError(
        service.changePin({ token: session.token, currentPin: CURRENT_PIN, newPin }),
        HttpStatus.BAD_REQUEST,
        'INVALID_PIN',
      );
    }
    expect(updates).toHaveLength(0);
    expect(redis.counters.size).toBe(0);
  });

  it('currentPin errado → 401 e conta como tentativa; 5 falhas travam (429)', async () => {
    const redis = new FakeRedis();
    const { service, updates } = makeService(redis, staffRow());
    const session = await issueFor(redis);

    for (let i = 0; i < 5; i++) {
      await expectHttpError(
        service.changePin({ token: session.token, currentPin: '0000', newPin: '9876' }),
        HttpStatus.UNAUTHORIZED,
        'CURRENT_PIN_INVALID',
      );
    }
    expect(redis.store.has(THROTTLE_LOCK_KEY)).toBe(true);

    // Com o lock armado, até o PIN CERTO leva 429 — mesma disciplina do login.
    await expectHttpError(
      service.changePin({ token: session.token, currentPin: CURRENT_PIN, newPin: '9876' }),
      HttpStatus.TOO_MANY_REQUESTS,
      'AUTH_THROTTLED',
    );
    expect(updates).toHaveLength(0);
  });

  it('rajada paralela de currentPin errado: só 5 chegam à conferência do PIN', async () => {
    const redis = new FakeRedis();
    const { service, updates, pinChecks } = makeService(redis, staffRow());
    const session = await issueFor(redis);

    const statuses = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        service
          .changePin({ token: session.token, currentPin: String(1000 + i), newPin: '9876' })
          .catch((err: HttpException) => err.getStatus()),
      ),
    );

    expect(pinChecks()).toBe(5);
    expect(statuses.filter((s) => s === HttpStatus.UNAUTHORIZED)).toHaveLength(5);
    expect(statuses.filter((s) => s === HttpStatus.TOO_MANY_REQUESTS)).toHaveLength(7);
    expect(updates).toHaveLength(0);
  });

  it('sucesso: troca o hash, limpa must_change_pin, revoga as outras sessões e devolve token novo', async () => {
    const redis = new FakeRedis();
    const row = staffRow({ must_change_pin: true });
    const { service, updates } = makeService(redis, row);

    const mySession = await issueFor(redis);
    const otherDevice = await issueFor(redis);

    // Uma falha antes (contador vivo) — sucesso deve zerar o throttle.
    await expectHttpError(
      service.changePin({ token: mySession.token, currentPin: '0000', newPin: '9876' }),
      HttpStatus.UNAUTHORIZED,
      'CURRENT_PIN_INVALID',
    );

    const result = await service.changePin({
      token: mySession.token,
      currentPin: CURRENT_PIN,
      newPin: '987654',
    });

    // UPDATE com o hash do PIN novo + must_change_pin = false. bcrypt é
    // não-determinístico (sal por-usuário), então verifica-se que o hash
    // gravado VALIDA o PIN novo — não igualdade byte-a-byte.
    expect(updates).toHaveLength(1);
    expect(updates[0].sql).toMatch(/must_change_pin\s*=\s*false/i);
    expect(updates[0].params[0]).toMatch(/^\$2[aby]\$/);
    expect(verifyPin('987654', updates[0].params[0] as string)).toBe(true);
    expect(updates[0].params[1]).toBe(STAFF_ID);

    // Token NOVO no body (o proxy vira cookie) — e ele verifica.
    expect(typeof result.staffToken).toBe('string');
    expect(result.staffToken).not.toBe(mySession.token);
    expect(result.code).toBe('PIN_CHANGED');
    expect(
      await verifyStaffSessionToken(redis as unknown as RedisService, result.staffToken, 'acme'),
    ).not.toBeNull();

    // As sessões antigas (inclusive a corrente e a do outro device) morreram.
    expect(
      await verifyStaffSessionToken(redis as unknown as RedisService, mySession.token, 'acme'),
    ).toBeNull();
    expect(
      await verifyStaffSessionToken(redis as unknown as RedisService, otherDevice.token, 'acme'),
    ).toBeNull();

    // Throttle zerado pós-sucesso.
    expect(redis.counters.size).toBe(0);
    expect(redis.store.has(THROTTLE_LOCK_KEY)).toBe(false);
  });

  it('401 CURRENT_PIN_INVALID quando o staff do token não existe mais (dummy hash, timing-safe)', async () => {
    const redis = new FakeRedis();
    const { service, updates } = makeService(redis, null);
    const session = await issueFor(redis);

    await expectHttpError(
      service.changePin({ token: session.token, currentPin: CURRENT_PIN, newPin: '9876' }),
      HttpStatus.UNAUTHORIZED,
      'CURRENT_PIN_INVALID',
    );
    expect(updates).toHaveLength(0);
  });
});

describe('StaffAuthService.login — must_change_pin', () => {
  it('login com must_change_pin=true devolve a flag + nextPath /trocar-pin', async () => {
    const redis = new FakeRedis();
    const { service } = makeService(redis, staffRow({ must_change_pin: true }));

    const result = await service.login({ cpf: '39053344705', pin: CURRENT_PIN }, '10.0.0.1');

    expect(result.mustChangePin).toBe(true);
    expect(result.nextPath).toBe('/trocar-pin');
  });

  it('login com must_change_pin=true emite token RESTRITO (payload carrega mustChangePin) — enforcement server-side', async () => {
    const redis = new FakeRedis();
    const { service } = makeService(redis, staffRow({ must_change_pin: true }));

    const result = await service.login({ cpf: '39053344705', pin: CURRENT_PIN }, '10.0.0.1');

    // O token verifica (é uma sessão real) MAS carrega a flag pros guards
    // recusarem toda rota privilegiada até a troca — não é bypass do FE.
    const payload = await verifyStaffSessionToken(
      redis as unknown as RedisService,
      result.staffToken,
      'acme',
    );
    expect(payload).not.toBeNull();
    expect(payload!.mustChangePin).toBe(true);
  });

  it('login normal NÃO embarca a flag no token (token limpo)', async () => {
    const redis = new FakeRedis();
    const { service } = makeService(redis, staffRow({ must_change_pin: false }));

    const result = await service.login({ cpf: '39053344705', pin: CURRENT_PIN }, '10.0.0.1');

    const payload = await verifyStaffSessionToken(
      redis as unknown as RedisService,
      result.staffToken,
      'acme',
    );
    expect(payload).not.toBeNull();
    expect(payload!.mustChangePin).toBeUndefined();
  });

  it('changePin ACEITA o token restrito e emite um token NOVO SEM a flag (a restrição some sozinha)', async () => {
    const redis = new FakeRedis();
    const { service } = makeService(redis, staffRow({ must_change_pin: true }));

    // Login forçado: token com a flag.
    const login = await service.login({ cpf: '39053344705', pin: CURRENT_PIN }, '10.0.0.1');
    const restricted = await verifyStaffSessionToken(
      redis as unknown as RedisService,
      login.staffToken,
      'acme',
    );
    expect(restricted!.mustChangePin).toBe(true);

    // A troca de PIN aceita o token restrito (é a única rota que deve) e
    // devolve um token novo — verificado e SEM a flag.
    const changed = await service.changePin({
      token: login.staffToken,
      currentPin: CURRENT_PIN,
      newPin: '998877',
    });
    const fresh = await verifyStaffSessionToken(
      redis as unknown as RedisService,
      changed.staffToken,
      'acme',
    );
    expect(fresh).not.toBeNull();
    expect(fresh!.mustChangePin).toBeUndefined();
  });

  it('login normal segue com mustChangePin=false e nextPath do role', async () => {
    const redis = new FakeRedis();
    const { service } = makeService(redis, staffRow({ must_change_pin: false }));

    const result = await service.login({ cpf: '39053344705', pin: CURRENT_PIN }, '10.0.0.1');

    expect(result.mustChangePin).toBe(false);
    expect(result.nextPath).toBe('/waiter');
  });

  it('login de bartender abre o KDS individual /bar', async () => {
    const redis = new FakeRedis();
    const { service } = makeService(redis, staffRow({ role: 'bartender', must_change_pin: false }));

    const result = await service.login({ cpf: '39053344705', pin: CURRENT_PIN }, '10.0.0.1');

    expect(result.nextPath).toBe('/bar');
  });

  it('login de cashier abre a superfície segura /cashier', async () => {
    const redis = new FakeRedis();
    const { service } = makeService(redis, staffRow({ role: 'cashier', must_change_pin: false }));

    const result = await service.login({ cpf: '39053344705', pin: CURRENT_PIN }, '10.0.0.1');

    expect(result.nextPath).toBe('/cashier');
  });
});
