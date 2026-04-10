import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { validateCpf } from './cpf.util';

export interface CustomerWelcomeResult {
  customerId: string;
  name: string;
  recognitionToken: string;
  isReturning: boolean;
  totalVisits: number;
  lastVisitSummary: Record<string, unknown> | null;
  visitId: string;
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(private readonly tenantConn: TenantConnectionProvider) {}

  async welcome(
    name: string,
    cpf: string,
    sessionId: string,
  ): Promise<CustomerWelcomeResult> {
    const cleanCpf = cpf.replace(/\D/g, '');

    if (!validateCpf(cleanCpf)) {
      throw new HttpException('CPF invalido. Verifique os numeros digitados.', HttpStatus.BAD_REQUEST);
    }

    // Busca customer pelo CPF
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
      recognitionToken = customer.recognition_token as string;
      isReturning = true;
      totalVisits = (customer.total_visits as number) + 1;

      // Atualiza nome se diferente, incrementa visits
      await this.tenantConn.query(
        `UPDATE customers SET name = $1, total_visits = $2, last_visit_at = now(), updated_at = now() WHERE id = $3`,
        [name.trim(), totalVisits, customerId],
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

    // Cria visit
    const visitResult = await this.tenantConn.query(
      `INSERT INTO visits (customer_id, table_session_id) VALUES ($1, $2) RETURNING id`,
      [customerId, sessionId],
    );
    const visitId = (visitResult as Record<string, unknown>[])[0].id as string;

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

    // Cria visit
    const visitResult = await this.tenantConn.query(
      `INSERT INTO visits (customer_id, table_session_id) VALUES ($1, $2) RETURNING id`,
      [customerId, sessionId],
    );
    const visitId = (visitResult as Record<string, unknown>[])[0].id as string;

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
    };
  }
}
