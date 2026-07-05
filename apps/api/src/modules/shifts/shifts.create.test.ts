/**
 * BUG (framework re-scan · ScreenManagerShiftEditor "+ Novo turno"): o botão
 * "+ Novo turno" abria o AddSheet (adicionar FUNCIONÁRIO a um turno existente),
 * nunca criava uma DEFINIÇÃO de turno nova. E o backend não tinha endpoint pra
 * criar turno — só `POST /shifts/assignments` (staff↔turno). A migration 043 já
 * previa "+ Novo turno criar definicoes adicionais (ex: encerramento 23-02)",
 * mas a rota nunca existiu.
 *
 * FIX: `ShiftsService.createShift(...)` insere uma row em `staff_shifts` e a
 * devolve no MESMO shape de `listForDate` (com `members: []`), pronta pro
 * ScreenManagerShiftEditor renderizar. O `sort_order` default = MAX+1 pra o
 * turno novo aparecer no fim da lista.
 *
 * Fake DB ciente do SQL: modela `staff_shifts` como um array em memória e
 * resolve as queries de MAX(sort_order) e INSERT ... RETURNING de forma que o
 * teste FALHA se o método não existir (RED) e PASSA quando ele insere de
 * verdade (GREEN) — não é mock cego do retorno.
 */

import { BadRequestException } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

interface ShiftRow {
  id: string;
  label: string;
  range_label: string;
  time_start: string;
  time_end: string;
  sort_order: number;
}

function fakeShiftsDb(seed: ShiftRow[] = []) {
  const shifts: ShiftRow[] = [...seed];
  let seq = 1000;

  const query = async (sql: string, params: unknown[] = []): Promise<unknown> => {
    const s = sql.replace(/\s+/g, ' ').trim();

    // MAX(sort_order) pra posicionar o turno novo no fim.
    if (s.includes('MAX(sort_order)') && s.includes('FROM staff_shifts')) {
      const max = shifts.reduce((m, sh) => Math.max(m, sh.sort_order), 0);
      return [{ max_sort: max }];
    }

    // INSERT INTO staff_shifts (...) RETURNING <cols>
    if (s.startsWith('INSERT INTO staff_shifts')) {
      const [label, rangeLabel, timeStart, timeEnd, sortOrder] = params as [
        string,
        string,
        string,
        string,
        number,
      ];
      const row: ShiftRow = {
        id: `shift-${seq++}`,
        label,
        range_label: rangeLabel,
        time_start: timeStart,
        time_end: timeEnd,
        sort_order: Number(sortOrder),
      };
      shifts.push(row);
      // pg INSERT ... RETURNING → flat rows[]
      return [row];
    }

    throw new Error(`fakeShiftsDb: SQL não roteado: ${s}`);
  };

  return {
    provider: {
      query,
      getTenantSlug: () => 'restaurant_dev',
    } as unknown as TenantConnectionProvider,
    shifts,
  };
}

function makeService(provider: TenantConnectionProvider): ShiftsService {
  // As deps de staffMessages/alerts/mongo não são tocadas por createShift.
  return new ShiftsService(provider, {} as never, {} as never, {} as never);
}

describe('ShiftsService.createShift — "+ Novo turno" cria uma DEFINIÇÃO de turno', () => {
  it('insere um turno novo e devolve no shape de listForDate (members: [])', async () => {
    const { provider, shifts } = fakeShiftsDb([
      {
        id: 'a',
        label: 'MANHÃ',
        range_label: '06H – 12H',
        time_start: '06:00:00',
        time_end: '12:00:00',
        sort_order: 1,
      },
      {
        id: 'b',
        label: 'TARDE',
        range_label: '12H – 17H',
        time_start: '12:00:00',
        time_end: '17:00:00',
        sort_order: 2,
      },
    ]);
    const svc = makeService(provider);

    const created = await svc.createShift({
      label: 'Encerramento',
      timeStart: '23:00',
      timeEnd: '02:00',
    });

    // Persistiu de verdade no "banco".
    expect(shifts).toHaveLength(3);
    // Shape pronto pro screen (mesmo de listForDate).
    expect(created.label).toBe('ENCERRAMENTO');
    expect(created.range_label).toBe('23H – 02H');
    expect(created.time_start).toBe('23:00');
    expect(created.time_end).toBe('02:00');
    expect(created.members).toEqual([]);
    // Vai pro fim da lista (MAX(sort_order) + 1).
    expect(created.sort_order).toBe(3);
    expect(typeof created.id).toBe('string');
  });

  it('rejeita label vazio', async () => {
    const { provider } = fakeShiftsDb();
    const svc = makeService(provider);
    await expect(
      svc.createShift({ label: '   ', timeStart: '10:00', timeEnd: '14:00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejeita horário fora do formato HH:MM', async () => {
    const { provider } = fakeShiftsDb();
    const svc = makeService(provider);
    await expect(
      svc.createShift({ label: 'Turno', timeStart: '25:99', timeEnd: '14:00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
