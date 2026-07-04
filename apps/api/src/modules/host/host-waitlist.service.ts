import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import type { WaitlistEntryDto, WaitlistStatus } from '@restaurant/shared-types';

interface WaitlistRow {
  id: string;
  name: string;
  party: number;
  phone: string | null;
  cpf: string | null;
  note: string | null;
  status: WaitlistStatus;
  added_at: string;
  seated_at: string | null;
  left_at: string | null;
}

/**
 * Waitlist do host — extraída do host.service (decomposição do god
 * service). CRUD básico da fila de espera da recepção: listar quem está
 * 'waiting' (com wait_minutes calculado server-side), adicionar e resolver
 * (seated/left). O HostService mantém delegates de 1 linha pra preservar a
 * facade usada pelo host.controller.
 */
@Injectable()
export class HostWaitlistService {
  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async listWaitlist(): Promise<WaitlistEntryDto[]> {
    const rows = (await this.tenantConn.query(
      `SELECT id, name, party, phone, cpf, note, status,
              added_at, seated_at, left_at
         FROM waitlist_entries
        WHERE status = 'waiting'
        ORDER BY added_at ASC`,
    )) as WaitlistRow[];
    return rows.map((r) => this.mapWaitlistRow(r));
  }

  async addToWaitlist(body: {
    name: string;
    party: number;
    phone?: string;
    cpf?: string;
    note?: string;
  }): Promise<WaitlistEntryDto> {
    const inserted = unwrapRows<WaitlistRow>(
      await this.tenantConn.query(
        `INSERT INTO waitlist_entries (name, party, phone, cpf, note)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, party, phone, cpf, note, status,
                   added_at, seated_at, left_at`,
        [body.name, body.party, body.phone ?? null, body.cpf ?? null, body.note ?? null],
      ),
    )[0];
    return this.mapWaitlistRow(inserted);
  }

  async removeFromWaitlist(id: string, transition: 'seated' | 'left'): Promise<{ ok: true }> {
    const tsCol = transition === 'seated' ? 'seated_at' : 'left_at';
    const updated = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `UPDATE waitlist_entries
            SET status = $2,
                ${tsCol} = now(),
                updated_at = now()
          WHERE id = $1 AND status = 'waiting'
          RETURNING id`,
        [id, transition],
      ),
    );
    if (!updated.length) {
      throw new NotFoundException('Entrada da fila nao encontrada ou ja resolvida.');
    }
    return { ok: true as const };
  }

  private mapWaitlistRow(row: WaitlistRow): WaitlistEntryDto {
    const added = new Date(row.added_at).getTime();
    const waitMin = Math.max(0, Math.floor((Date.now() - added) / 60_000));
    return {
      id: row.id,
      name: row.name,
      party: row.party,
      phone: row.phone ?? undefined,
      cpf: row.cpf ?? undefined,
      added_at: row.added_at,
      wait_minutes: waitMin,
      note: row.note,
      status: row.status,
    };
  }
}
