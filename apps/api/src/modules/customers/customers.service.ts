import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
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

    if ((existing as unknown[]).length > 0) {
      const customer = (existing as Record<string, unknown>[])[0];
      customerId = customer.id as string;
      const storedToken = customer.recognition_token as string;
      isReturning = true;
      totalVisits = (customer.total_visits as number) + 1;

      const tokenMatches =
        callerRecognitionToken != null && callerRecognitionToken === storedToken;

      if (!tokenMatches) {
        this.logger.warn(
          `CPF takeover attempt blocked: CPF ${cleanCpf.slice(0, 3)}*** without valid recognition_token`,
        );
        throw new HttpException(
          JSON.stringify({
            status: 'recognition_required',
            message: 'CPF ja registrado. Use seu token de reconhecimento ou peca ao garcom para confirmar.',
          }),
          HttpStatus.CONFLICT,
        );
      }

      recognitionToken = storedToken;

      // Only bump visit counter, never overwrite name
      await this.tenantConn.query(
        `UPDATE customers SET total_visits = $1, last_visit_at = now(), updated_at = now() WHERE id = $2`,
        [totalVisits, customerId],
      );
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
      name: name.trim(),
      recognitionToken,
      isReturning,
      totalVisits,
      lastVisitSummary,
      visitId,
      color: participant.color,
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
    const totalVisits = (customer.total_visits as number) + 1;

    // Incrementa visits
    await this.tenantConn.query(
      `UPDATE customers SET total_visits = $1, last_visit_at = now(), updated_at = now() WHERE id = $2`,
      [totalVisits, customerId],
    );

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
    };
  }
}
