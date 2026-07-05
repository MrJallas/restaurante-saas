import { HttpException } from '@nestjs/common';
import { StaffAuthService } from './staff-auth.service';
import type { RedisService } from '../../infra/redis/redis.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { hashPin, verifyPin, legacySha256Hash, isLegacyPinHash } from '../staff/staff-pin.util';
import { verifyStaffSessionToken } from '../../common/auth/staff-session-token';

/**
 * OWASP A02 (2026-07-05) — backfill lazy SHA-256 → bcrypt no login/changePin.
 *
 * RED→GREEN: um pin_hash SHA-256 legado que BATE no login é re-hasheado pra
 * bcrypt (o UPDATE dispara com o hash novo + guard NOT LIKE '$2%'); o login
 * subsequente verifica pelo bcrypt; changePin grava bcrypt; PIN errado falha
 * nos dois formatos e NÃO migra nada. Lockout/must_change_pin/revogação não
 * regridem (cobertos nos outros arquivos).
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
}

const STAFF_ID = 'c9d2e1f0-2222-4222-8222-000000000001';
const CPF = '39053344705';
const PIN = '4321';
const SLUG = 'acme-pin-mig';

interface Row {
  id: string;
  name: string;
  role: string;
  pin_hash: string;
  must_change_pin?: boolean;
  cpf?: string | null;
  phone?: string | null;
  email?: string | null;
}

/**
 * TenantConn fake com uma "linha viva": UPDATE staff…pin_hash MUTA o pin_hash
 * da linha (respeitando o guard NOT LIKE '$2%'), então dá pra observar a
 * migração de estado entre um login e o próximo — não só a chamada.
 */
function makeService(initialRow: Row) {
  const row: Row = { ...initialRow };
  const updates: { sql: string; params: unknown[] }[] = [];

  const tenantConn = {
    getTenantSlug: () => SLUG,
    query: async (sql: string, params: unknown[] = []) => {
      if (/^\s*UPDATE staff/i.test(sql)) {
        updates.push({ sql, params });
        // Emula o guard NOT LIKE '$2%': só migra hash ainda legado.
        const guardsAgainstBcrypt = /NOT LIKE '\$2%'/i.test(sql);
        const matchesId = params[1] === row.id;
        if (matchesId && (!guardsAgainstBcrypt || isLegacyPinHash(row.pin_hash))) {
          row.pin_hash = params[0] as string;
          if (/must_change_pin\s*=\s*false/i.test(sql)) row.must_change_pin = false;
          return [[{ id: row.id, name: row.name, role: row.role }], 1];
        }
        return [[], 0];
      }
      if (/FROM staff/i.test(sql) && /WHERE cpf/i.test(sql)) {
        return params[0] === row.cpf ? [{ ...row }] : [];
      }
      if (/FROM staff/i.test(sql) && /WHERE id/i.test(sql)) {
        return params[0] === row.id ? [{ ...row }] : [];
      }
      return [];
    },
  } as unknown as TenantConnectionProvider;

  const redis = new FakeRedis();
  const service = new StaffAuthService(tenantConn, redis as unknown as RedisService);
  return { service, redis, updates, row: () => row };
}

function legacyRow(overrides: Partial<Row> = {}): Row {
  return {
    id: STAFF_ID,
    name: 'Marina',
    role: 'waiter',
    pin_hash: legacySha256Hash(PIN), // <-- hash LEGADO no banco
    must_change_pin: false,
    cpf: CPF,
    phone: null,
    email: null,
    ...overrides,
  };
}

describe('StaffAuthService — backfill lazy de PIN (SHA-256 → bcrypt)', () => {
  it('login com hash SHA-256 legado que BATE re-hasheia pra bcrypt (UPDATE dispara)', async () => {
    const { service, updates, row } = makeService(legacyRow());
    expect(isLegacyPinHash(row().pin_hash)).toBe(true);

    const result = await service.login({ cpf: CPF, pin: PIN }, '10.0.0.1');
    expect(result.staff.id).toBe(STAFF_ID);

    // Disparou UM UPDATE de backfill com um hash bcrypt do MESMO PIN.
    const backfill = updates.find((u) => /pin_hash/i.test(u.sql));
    expect(backfill).toBeDefined();
    expect(backfill!.params[0]).toMatch(/^\$2[aby]\$/);
    expect(verifyPin(PIN, backfill!.params[0] as string)).toBe(true);

    // Estado migrado: a linha agora carrega bcrypt.
    expect(isLegacyPinHash(row().pin_hash)).toBe(false);
    expect(verifyPin(PIN, row().pin_hash)).toBe(true);
  });

  it('login subsequente verifica pelo hash bcrypt já migrado (sem novo UPDATE)', async () => {
    const { service, updates } = makeService(legacyRow());

    await service.login({ cpf: CPF, pin: PIN }, '10.0.0.1'); // migra
    const updatesAfterFirst = updates.length;

    const second = await service.login({ cpf: CPF, pin: PIN }, '10.0.0.1'); // já bcrypt
    expect(second.staff.id).toBe(STAFF_ID);
    // Nenhum UPDATE de pin_hash novo (o hash já não é legado).
    expect(updates.length).toBe(updatesAfterFirst);
  });

  it('PIN errado sobre hash legado FALHA e NÃO migra nada', async () => {
    const { service, updates } = makeService(legacyRow());

    await expect(service.login({ cpf: CPF, pin: '0000' }, '10.0.0.1')).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(updates.filter((u) => /pin_hash/i.test(u.sql))).toHaveLength(0);
  });

  it('changePin sobre hash legado: currentPin legado bate e grava o novo como bcrypt', async () => {
    const { service, row } = makeService(legacyRow());

    // Login primeiro (isso já migra o hash), então re-seta pra legado pra
    // exercitar o caminho de changePin com currentPin ainda legado.
    const login = await service.login({ cpf: CPF, pin: PIN }, '10.0.0.1');
    row().pin_hash = legacySha256Hash(PIN); // força o cenário legado de novo

    const changed = await service.changePin({
      token: login.staffToken,
      currentPin: PIN,
      newPin: '998877',
    });
    expect(changed.code).toBe('PIN_CHANGED');

    // O hash gravado é bcrypt e verifica o PIN NOVO (não o antigo).
    expect(isLegacyPinHash(row().pin_hash)).toBe(false);
    expect(verifyPin('998877', row().pin_hash)).toBe(true);
    expect(verifyPin(PIN, row().pin_hash)).toBe(false);
  });

  it('managerResetPin grava bcrypt (o tempPin verifica pelo hash gravado)', async () => {
    const { service, updates } = makeService(legacyRow({ id: STAFF_ID }));

    const result = await service.managerResetPin(STAFF_ID);
    expect(result.code).toBe('PIN_RESET_TEMP');

    const upd = updates.find(
      (u) => /pin_hash/i.test(u.sql) && /must_change_pin\s*=\s*true/i.test(u.sql),
    );
    expect(upd).toBeDefined();
    expect(upd!.params[0]).toMatch(/^\$2[aby]\$/);
    expect(verifyPin(result.tempPin, upd!.params[0] as string)).toBe(true);
  });

  it('login com hash JÁ bcrypt continua funcionando (sem regressão) e não re-migra', async () => {
    const { service, redis, updates } = makeService(legacyRow({ pin_hash: hashPin(PIN) }));

    const result = await service.login({ cpf: CPF, pin: PIN }, '10.0.0.1');
    expect(result.staff.id).toBe(STAFF_ID);
    // Hash já é bcrypt → nenhum UPDATE de backfill.
    expect(updates.filter((u) => /pin_hash/i.test(u.sql))).toHaveLength(0);

    // Sessão real emitida e verificável no MESMO redis.
    const payload = await verifyStaffSessionToken(
      redis as unknown as RedisService,
      result.staffToken,
      SLUG,
    );
    expect(payload).not.toBeNull();
    expect(payload!.staffId).toBe(STAFF_ID);
  });
});
