import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { TableSessionService } from '../table-session/table-session.service';
import { validateCpf } from './cpf.util';

export interface CustomerWelcomeResult {
  customerId: string;
  name: string;
  recognitionToken: string;
  isReturning: boolean;
  totalVisits: number;
  lastVisitSummary: Record<string, unknown> | null;
  visitId: string;
  color?: string;
  wasReclaim: boolean;
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly tableSessionService: TableSessionService,
  ) {}

  async welcome(
    name: string,
    cpf: string,
    sessionId: string,
    callerRecognitionToken?: string | null,
  ): Promise<CustomerWelcomeResult> {
    const cleanCpf = cpf.replace(/\D/g, '');

    if (!validateCpf(cleanCpf)) {
      throw new HttpException('CPF invalido. Verifique os numeros digitados.', HttpStatus.BAD_REQUEST);
    }

    const existing = await this.tenantConn.query(
      'SELECT id, name, recognition_token, total_visits FROM customers WHERE cpf = $1',
      [cleanCpf],
    );

    let customerId: string;
    let recognitionToken: string;
    let isReturning = false;
    let totalVisits = 1;
    let resolvedName = name.trim();
    let wasReclaim = false;

    if ((existing as unknown[]).length > 0) {
      const customer = (existing as Record<string, unknown>[])[0];
      customerId = customer.id as string;
      resolvedName = customer.name as string;
      const storedToken = customer.recognition_token as string;
      isReturning = true;

      const tokenMatches =
        callerRecognitionToken != null && callerRecognitionToken === storedToken;

      if (tokenMatches) {
        recognitionToken = storedToken;
      } else {
        recognitionToken = uuidv4();
        wasReclaim = true;

        await this.tenantConn.query(
          'UPDATE customers SET recognition_token = $1, updated_at = now() WHERE id = $2',
          [recognitionToken, customerId],
        );

        this.logger.warn(
          JSON.stringify({
            event: 'recognition_token_rotated',
            cpf_hash: cleanCpf.slice(0, 3) + '***' + cleanCpf.slice(-2),
            customer_id: customerId,
            table_session_id: sessionId,
            reason: callerRecognitionToken == null ? 'no_cookie' : 'token_mismatch',
          }),
        );
      }

      const updatedRows = unwrapRows<{ total_visits: number }>(
        await this.tenantConn.query(
          `UPDATE customers SET total_visits = total_visits + 1, last_visit_at = now(), updated_at = now() WHERE id = $1 RETURNING total_visits`,
          [customerId],
        ),
      );
      totalVisits = updatedRows[0].total_visits;
    } else {
      recognitionToken = uuidv4();
      const result = await this.tenantConn.query(
        `INSERT INTO customers (name, cpf, recognition_token, total_visits, last_visit_at)
         VALUES ($1, $2, $3, 1, now())
         RETURNING id`,
        [name.trim(), cleanCpf, recognitionToken],
      );
      customerId = (result as Record<string, unknown>[])[0].id as string;
    }

    // Idempotent visit: ON CONFLICT returns nothing, so we SELECT after.
    await this.tenantConn.query(
      `INSERT INTO visits (customer_id, table_session_id) VALUES ($1, $2)
       ON CONFLICT (table_session_id, customer_id) DO NOTHING`,
      [customerId, sessionId],
    );
    const visitRow = await this.tenantConn.query(
      `SELECT id FROM visits WHERE customer_id = $1 AND table_session_id = $2`,
      [customerId, sessionId],
    );
    const visitId = (visitRow as Record<string, unknown>[])[0].id as string;

    const participant = await this.tableSessionService.upsertParticipant(
      sessionId,
      customerId,
      visitId,
    );

    // Round 16 (B-NEW-65): grava customerId no payload Redis da sessão
    // pra que WS join:customer customer-side valide ownership corretamente.
    // Antes session.customerId vinha undefined → join sempre rejeitado.
    await this.tableSessionService.attachCustomerToSession(sessionId, customerId);

    // Busca consumption_summary se existir
    let lastVisitSummary: Record<string, unknown> | null = null;
    if (isReturning) {
      const summary = await this.tenantConn.query(
        'SELECT last_items, favorite_items, total_spent_cents FROM customer_consumption_summary WHERE customer_id = $1',
        [customerId],
      );
      if ((summary as unknown[]).length > 0) {
        lastVisitSummary = (summary as Record<string, unknown>[])[0];
      }
    }

    return {
      customerId,
      name: resolvedName,
      recognitionToken,
      isReturning,
      totalVisits,
      lastVisitSummary,
      visitId,
      color: participant.color,
      wasReclaim,
    };
  }

  /**
   * `POST /customers/identify` — CPF-first identification used by late-arrival
   * flow. Creates the customer row if CPF is new; returns the canonical name +
   * recognition token if returning. No session is required here (pre-join).
   */
  async identify(
    cpf: string,
    nameInput?: string,
    _currentSessionId?: string,
  ): Promise<{
    customerId: string;
    isReturning: boolean;
    canonicalName: string;
    customer: { customerId: string; name: string; totalVisits: number };
    recognitionToken: string;
  }> {
    const cleanCpf = cpf.replace(/\D/g, '');
    if (!validateCpf(cleanCpf)) {
      throw new HttpException(
        'CPF invalido. Verifique os numeros digitados.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = (await this.tenantConn.query(
      'SELECT id, name, recognition_token, total_visits FROM customers WHERE cpf = $1',
      [cleanCpf],
    )) as Array<Record<string, unknown>>;

    if (existing.length > 0) {
      const customer = existing[0];
      const customerId = customer.id as string;
      const canonicalName = customer.name as string;
      let recognitionToken = customer.recognition_token as string | null;
      if (!recognitionToken) {
        recognitionToken = uuidv4();
        await this.tenantConn.query(
          'UPDATE customers SET recognition_token = $1, updated_at = now() WHERE id = $2',
          [recognitionToken, customerId],
        );
      }
      return {
        customerId,
        isReturning: true,
        canonicalName,
        customer: {
          customerId,
          name: canonicalName,
          totalVisits: customer.total_visits as number,
        },
        recognitionToken,
      };
    }

    // CPF new → create on the fly. `name` becomes mandatory in this branch.
    const trimmedName = (nameInput ?? '').trim();
    if (!trimmedName) {
      throw new HttpException(
        'Nome obrigatorio para CPF novo.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const recognitionToken = uuidv4();
    const inserted = (await this.tenantConn.query(
      `INSERT INTO customers (name, cpf, recognition_token, total_visits)
       VALUES ($1, $2, $3, 0)
       RETURNING id`,
      [trimmedName, cleanCpf, recognitionToken],
    )) as Array<Record<string, unknown>>;
    const customerId = inserted[0].id as string;
    return {
      customerId,
      isReturning: false,
      canonicalName: trimmedName,
      customer: {
        customerId,
        name: trimmedName,
        totalVisits: 0,
      },
      recognitionToken,
    };
  }

  /**
   * Toggle the persistent VIP flag on a customer (separate from the
   * session-scoped `table_sessions.flags`). Used by manager UI; session-level
   * VIP marking lives on the `vip` module / session-flags endpoint.
   */
  async setVipFlag(customerId: string, isVip: boolean) {
    const updated = unwrapRows<Record<string, unknown>>(
      await this.tenantConn.query(
        `UPDATE customers SET is_vip = $1, updated_at = now()
         WHERE id = $2
         RETURNING id, is_vip`,
        [isVip, customerId],
      ),
    );
    if (!updated.length) {
      throw new HttpException(
        'Cliente nao encontrado.',
        HttpStatus.NOT_FOUND,
      );
    }
    return {
      customerId: updated[0].id as string,
      isVip: updated[0].is_vip as boolean,
    };
  }

  async recognize(
    recognitionToken: string,
    sessionId: string,
  ): Promise<CustomerWelcomeResult> {
    const customers = await this.tenantConn.query(
      'SELECT id, name, cpf, recognition_token, total_visits FROM customers WHERE recognition_token = $1',
      [recognitionToken],
    );

    if (!(customers as unknown[]).length) {
      throw new HttpException('Token de reconhecimento invalido.', HttpStatus.NOT_FOUND);
    }

    const customer = (customers as Record<string, unknown>[])[0];
    const customerId = customer.id as string;

    const updatedRows = unwrapRows<{ total_visits: number }>(
      await this.tenantConn.query(
        `UPDATE customers SET total_visits = total_visits + 1, last_visit_at = now(), updated_at = now() WHERE id = $1 RETURNING total_visits`,
        [customerId],
      ),
    );
    const totalVisits = updatedRows[0].total_visits;

    await this.tenantConn.query(
      `INSERT INTO visits (customer_id, table_session_id) VALUES ($1, $2)
       ON CONFLICT (table_session_id, customer_id) DO NOTHING`,
      [customerId, sessionId],
    );
    const visitRow = await this.tenantConn.query(
      `SELECT id FROM visits WHERE customer_id = $1 AND table_session_id = $2`,
      [customerId, sessionId],
    );
    const visitId = (visitRow as Record<string, unknown>[])[0].id as string;

    const participant = await this.tableSessionService.upsertParticipant(
      sessionId,
      customerId,
      visitId,
    );

    // Busca consumption_summary
    let lastVisitSummary: Record<string, unknown> | null = null;
    const summary = await this.tenantConn.query(
      'SELECT last_items, favorite_items, total_spent_cents FROM customer_consumption_summary WHERE customer_id = $1',
      [customerId],
    );
    if ((summary as unknown[]).length > 0) {
      lastVisitSummary = (summary as Record<string, unknown>[])[0];
    }

    return {
      customerId,
      name: customer.name as string,
      recognitionToken: customer.recognition_token as string,
      isReturning: true,
      totalVisits,
      lastVisitSummary,
      visitId,
      color: participant.color,
      wasReclaim: false,
    };
  }

  /**
   * Lookup-only helper: resolve `recognition_token` cookie → customerId.
   * Round 5 (B-NEW-9): chat-history controllers precisam validar ownership
   * dos endpoints DELETE/list sem trustar `query.customerId`. Retorna null
   * se token não bate em nenhum customer (possivel caso reclaim em outra
   * mesa rotacionou o token); chamador trata 401/403.
   *
   * Diferente de `recognize()`: NÃO cria visit nem upsert participant.
   * Só leitura.
   */
  async resolveByRecognitionToken(
    recognitionToken: string,
  ): Promise<{ customerId: string; name: string } | null> {
    if (!recognitionToken) return null;
    const rows = await this.tenantConn.query(
      'SELECT id, name FROM customers WHERE recognition_token = $1',
      [recognitionToken],
    );
    if (!(rows as unknown[]).length) return null;
    const r = (rows as Record<string, unknown>[])[0];
    return {
      customerId: r.id as string,
      name: r.name as string,
    };
  }
}
