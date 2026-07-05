/**
 * CHARACTERIZATION (extração HostWaitlistService): congela o comportamento
 * da waitlist do host ANTES de mover os métodos pra fora do host.service.
 * Fixa: listWaitlist filtra status='waiting' ordenado por added_at ASC e
 * mapeia wait_minutes/phone/cpf; addToWaitlist ecoa campos e nasce
 * 'waiting'; removeFromWaitlist seta a coluna de timestamp da transição e
 * estoura NotFoundException com mensagem exata quando já resolvida.
 *
 * O teste roda contra o HostService (facade pública usada pelo
 * host.controller) — pós-extração os delegates continuam cobrindo o
 * serviço novo por transitividade, sem editar este arquivo.
 */

import { NotFoundException } from '@nestjs/common';
import { HostService } from './host.service';
import { HostInboxService } from './host-inbox.service';
import { HostWaitlistService } from './host-waitlist.service';
import { HostReservationsService } from './host-reservations.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

const ENTRY = 'ccccccc1-0000-4000-8000-000000000001';

interface FakeWaitlistRow {
  id: string;
  name: string;
  party: number;
  phone: string | null;
  cpf: string | null;
  note: string | null;
  status: string;
  added_at: string;
  seated_at: string | null;
  left_at: string | null;
}

function fakeDb(opts: { waiting?: FakeWaitlistRow[]; updateAffects?: number } = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []): Promise<unknown> => {
    const s = sql.replace(/\s+/g, ' ').trim();
    calls.push({ sql: s, params });
    if (s.startsWith('SELECT id, name, party, phone, cpf, note, status')) {
      return opts.waiting ?? [];
    }
    if (s.startsWith('INSERT INTO waitlist_entries')) {
      // INSERT no pg volta shape flat (Row[]) — eco dos params na row.
      return [
        {
          id: ENTRY,
          name: params[0],
          party: params[1],
          phone: params[2],
          cpf: params[3],
          note: params[4],
          status: 'waiting',
          added_at: new Date().toISOString(),
          seated_at: null,
          left_at: null,
        },
      ];
    }
    if (s.startsWith('UPDATE waitlist_entries')) {
      // UPDATE … RETURNING no pg volta tupla [rows, affected].
      const affects = opts.updateAffects ?? 1;
      return [affects ? [{ id: params[0] }] : [], affects];
    }
    throw new Error(`fake waitlist: SQL não roteado: ${s}`);
  };
  return { calls, conn: { query } as unknown as TenantConnectionProvider };
}

const noopRedis = { del: async () => undefined } as unknown as import(
  '../../infra/redis/redis.service'
).RedisService;

function makeService(conn: TenantConnectionProvider) {
  return new HostService(
    conn,
    new HostWaitlistService(conn),
    new HostInboxService(conn),
    new HostReservationsService(conn),
    noopRedis,
  );
}

describe('Host waitlist — characterization', () => {
  it('listWaitlist filtra waiting, ordena por added_at ASC e mapeia o DTO', async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000 - 1_000).toISOString();
    const justNow = new Date().toISOString();
    const { calls, conn } = fakeDb({
      waiting: [
        {
          id: 'w1',
          name: 'Ana',
          party: 4,
          phone: '11999990000',
          cpf: '39053344705',
          note: 'perto da janela',
          status: 'waiting',
          added_at: fiveMinAgo,
          seated_at: null,
          left_at: null,
        },
        {
          id: 'w2',
          name: 'Bruno',
          party: 2,
          phone: null,
          cpf: null,
          note: null,
          status: 'waiting',
          added_at: justNow,
          seated_at: null,
          left_at: null,
        },
      ],
    });
    const list = await makeService(conn).listWaitlist();

    const select = calls.find((c) => c.sql.startsWith('SELECT id, name, party'))!;
    expect(select.sql).toContain("WHERE status = 'waiting'");
    expect(select.sql).toContain('ORDER BY added_at ASC');
    expect(select.sql).toContain('FROM waitlist_entries');

    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({
      id: 'w1',
      name: 'Ana',
      party: 4,
      phone: '11999990000',
      cpf: '39053344705',
      added_at: fiveMinAgo,
      wait_minutes: 5,
      note: 'perto da janela',
      status: 'waiting',
    });
    // phone/cpf null no banco viram undefined no DTO (chaves presentes).
    expect(list[1].phone).toBeUndefined();
    expect(list[1].cpf).toBeUndefined();
    expect(list[1].note).toBeNull();
    expect(list[1].wait_minutes).toBe(0);
  });

  it('addToWaitlist ecoa os campos e devolve DTO waiting', async () => {
    const { calls, conn } = fakeDb();
    const dto = await makeService(conn).addToWaitlist({
      name: 'Carla',
      party: 3,
      phone: '11888887777',
      cpf: '52998224725',
      note: 'aniversário',
    });

    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO waitlist_entries'))!;
    expect(insert.params).toEqual(['Carla', 3, '11888887777', '52998224725', 'aniversário']);

    expect(dto.id).toBe(ENTRY);
    expect(dto.status).toBe('waiting');
    expect(dto.name).toBe('Carla');
    expect(dto.party).toBe(3);
    expect(dto.phone).toBe('11888887777');
    expect(dto.cpf).toBe('52998224725');
    expect(dto.note).toBe('aniversário');
    expect(dto.wait_minutes).toBe(0);
  });

  it('addToWaitlist sem opcionais insere null e devolve phone/cpf undefined', async () => {
    const { calls, conn } = fakeDb();
    const dto = await makeService(conn).addToWaitlist({ name: 'Duda', party: 2 });

    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO waitlist_entries'))!;
    expect(insert.params).toEqual(['Duda', 2, null, null, null]);
    expect(dto.phone).toBeUndefined();
    expect(dto.cpf).toBeUndefined();
    expect(dto.note).toBeNull();
    expect(dto.status).toBe('waiting');
  });

  it("removeFromWaitlist transition='seated' seta status + seated_at", async () => {
    const { calls, conn } = fakeDb({ updateAffects: 1 });
    const res = await makeService(conn).removeFromWaitlist(ENTRY, 'seated');
    expect(res).toEqual({ ok: true });

    const update = calls.find((c) => c.sql.startsWith('UPDATE waitlist_entries'))!;
    expect(update.sql).toContain('SET status = $2');
    expect(update.sql).toContain('seated_at = now()');
    expect(update.sql).toContain("WHERE id = $1 AND status = 'waiting'");
    expect(update.params).toEqual([ENTRY, 'seated']);
  });

  it("removeFromWaitlist transition='left' seta left_at", async () => {
    const { calls, conn } = fakeDb({ updateAffects: 1 });
    await makeService(conn).removeFromWaitlist(ENTRY, 'left');

    const update = calls.find((c) => c.sql.startsWith('UPDATE waitlist_entries'))!;
    expect(update.sql).toContain('left_at = now()');
    expect(update.params).toEqual([ENTRY, 'left']);
  });

  it('removeFromWaitlist de id já resolvido estoura NotFoundException com a mensagem exata', async () => {
    const { conn } = fakeDb({ updateAffects: 0 });
    const promise = makeService(conn).removeFromWaitlist(ENTRY, 'seated');
    await expect(promise).rejects.toBeInstanceOf(NotFoundException);
    await expect(promise).rejects.toThrow('Entrada da fila nao encontrada ou ja resolvida.');
  });
});
