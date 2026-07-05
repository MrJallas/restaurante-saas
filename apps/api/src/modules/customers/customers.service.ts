import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { TableSessionService } from '../table-session/table-session.service';
import { validateCpf } from './cpf.util';
import {
  assertInsideCustomerGeofence,
  evaluateCustomerGeofence,
  type GeofenceConfig,
} from '../../common/utils/geofence';
import type { CustomerLocationCheck, CustomerLocationSignal } from '@restaurant/shared-types';

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
  locationCheck: CustomerLocationCheck;
}

export interface LastVisitRepeatItem {
  menuItemId: string;
  name: string;
  quantity: number;
  note: string | null;
  priceCents: number;
  kind: 'food' | 'drink';
  categoryName: string | null;
}

export interface LastVisitRepeatResponse {
  orderId: string | null;
  items: LastVisitRepeatItem[];
  unavailableItems: Array<{
    menuItemId: string;
    name: string;
    categoryName: string | null;
    substitute: {
      menuItemId: string;
      name: string;
      priceCents: number;
    } | null;
  }>;
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
    location?: CustomerLocationSignal | null,
  ): Promise<CustomerWelcomeResult> {
    const cleanCpf = cpf.replace(/\D/g, '');

    if (!validateCpf(cleanCpf)) {
      throw new HttpException(
        'CPF invalido. Verifique os numeros digitados.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const locationCheck = await this.validateCustomerLocation(location);

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
    // Returning branch (CPF já existe) DEFERE o incremento de total_visits pra
    // depois do INSERT idempotente em `visits`, gateando-o na visita ser NOVA
    // (P1 super-count). O counter existente da row é o baseline até sabermos se
    // esta sessão é uma visita nova ou um reload.
    let returningExistingVisits: number | null = null;

    if ((existing as unknown[]).length > 0) {
      const customer = (existing as Record<string, unknown>[])[0];
      customerId = customer.id as string;
      resolvedName = customer.name as string;
      const storedToken = customer.recognition_token as string;
      isReturning = true;
      returningExistingVisits = customer.total_visits as number;
      totalVisits = returningExistingVisits;

      const tokenMatches = callerRecognitionToken != null && callerRecognitionToken === storedToken;

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
    } else {
      const newRecognitionToken = uuidv4();
      // ON CONFLICT (cpf): sob welcomes concorrentes do MESMO CPF novo, todos
      // passam pelo SELECT acima sem encontrar o customer e caem aqui. Sem o
      // ON CONFLICT, os inserts perdedores colidem na unique de cpf e estouram
      // 500 (P1-1 — welcome customer race). O DO UPDATE incrementa total_visits
      // no perdedor: o contador converge (1 insert + N-1 updates) e ninguém
      // recebe 5xx. total_visits == 1 ⇒ ganhou a corrida (novo); > 1 ⇒ perdeu
      // (returning, com nome/token canônicos da linha já existente).
      const upserted = unwrapRows<{
        id: string;
        name: string;
        recognition_token: string;
        total_visits: number;
      }>(
        await this.tenantConn.query(
          `INSERT INTO customers (name, cpf, recognition_token, total_visits, last_visit_at)
           VALUES ($1, $2, $3, 1, now())
           ON CONFLICT (cpf) DO UPDATE
             SET total_visits = customers.total_visits + 1,
                 last_visit_at = now(),
                 updated_at = now()
           RETURNING id, name, recognition_token, total_visits`,
          [name.trim(), cleanCpf, newRecognitionToken],
        ),
      );
      const row = upserted[0];
      customerId = row.id;
      totalVisits = row.total_visits;
      recognitionToken = row.recognition_token;
      if (totalVisits > 1) {
        isReturning = true;
        resolvedName = row.name;
      }
    }

    // P1 super-count: INSERT idempotente PRIMEIRO. `RETURNING id` só volta linha
    // num insert real; ON CONFLICT DO NOTHING (reload/re-submit na mesma sessão)
    // volta vazio. Esse sinal gateia o incremento de total_visits abaixo.
    const insertedVisit = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `INSERT INTO visits (customer_id, table_session_id) VALUES ($1, $2)
         ON CONFLICT (table_session_id, customer_id) DO NOTHING
         RETURNING id`,
        [customerId, sessionId],
      ),
    );
    const isNewVisit = insertedVisit.length > 0;

    let visitId: string;
    if (isNewVisit) {
      visitId = insertedVisit[0].id;
    } else {
      const visitRow = await this.tenantConn.query(
        `SELECT id FROM visits WHERE customer_id = $1 AND table_session_id = $2`,
        [customerId, sessionId],
      );
      visitId = (visitRow as Record<string, unknown>[])[0].id as string;
    }

    // Incremento gated do contador denormalizado, SÓ pro returning-branch (CPF
    // já existia). O new-CPF branch acima já cravou total_visits via o upsert
    // ON CONFLICT (cpf) — customer recém-criado sempre tem visita nova nesta
    // sessão, sem risco de reload duplo. `last_visit_at` é carimbado nos dois
    // casos (visto por último ≠ contagem).
    if (returningExistingVisits !== null) {
      if (isNewVisit) {
        const updatedRows = unwrapRows<{ total_visits: number }>(
          await this.tenantConn.query(
            `UPDATE customers SET total_visits = total_visits + 1, last_visit_at = now(), updated_at = now() WHERE id = $1 RETURNING total_visits`,
            [customerId],
          ),
        );
        totalVisits = updatedRows[0].total_visits;
      } else {
        // Reload da mesma sessão: reusa a contagem existente, só atualiza o
        // "visto por último". Não infla o contador.
        await this.tenantConn.query(
          `UPDATE customers SET last_visit_at = now(), updated_at = now() WHERE id = $1`,
          [customerId],
        );
        totalVisits = returningExistingVisits;
      }
    }

    const participant = await this.tableSessionService.upsertParticipant(
      sessionId,
      customerId,
      visitId,
      {
        location: location ?? null,
        slug: this.tenantConn.getTenantSlug(),
      },
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
      locationCheck,
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
      throw new HttpException('Nome obrigatorio para CPF novo.', HttpStatus.BAD_REQUEST);
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
      throw new HttpException('Cliente nao encontrado.', HttpStatus.NOT_FOUND);
    }
    return {
      customerId: updated[0].id as string,
      isVip: updated[0].is_vip as boolean,
    };
  }

  async recognize(
    recognitionToken: string,
    sessionId: string,
    location?: CustomerLocationSignal | null,
  ): Promise<CustomerWelcomeResult> {
    const locationCheck = await this.validateCustomerLocation(location);

    const customers = await this.tenantConn.query(
      'SELECT id, name, cpf, recognition_token, total_visits FROM customers WHERE recognition_token = $1',
      [recognitionToken],
    );

    if (!(customers as unknown[]).length) {
      throw new HttpException('Token de reconhecimento invalido.', HttpStatus.NOT_FOUND);
    }

    const customer = (customers as Record<string, unknown>[])[0];
    const customerId = customer.id as string;

    // P1 super-count: o INSERT idempotente em `visits` roda PRIMEIRO e diz se a
    // visita é NOVA pra esta sessão (RETURNING id só volta linha em insert real;
    // ON CONFLICT DO NOTHING → vazio no reload). O contador denormalizado
    // total_visits só incrementa nessa condição, ficando alinhado com a
    // fonte-da-verdade UNIQUE (visits). `last_visit_at` é "visto por último" e
    // continua sendo carimbado a cada call. Sem isso, cada reload da página da
    // mesa somava +1 em total_visits enquanto `visits` mantinha 1 row.
    const insertedVisit = unwrapRows<{ id: string }>(
      await this.tenantConn.query(
        `INSERT INTO visits (customer_id, table_session_id) VALUES ($1, $2)
         ON CONFLICT (table_session_id, customer_id) DO NOTHING
         RETURNING id`,
        [customerId, sessionId],
      ),
    );
    const isNewVisit = insertedVisit.length > 0;

    let visitId: string;
    if (isNewVisit) {
      visitId = insertedVisit[0].id;
    } else {
      const visitRow = await this.tenantConn.query(
        `SELECT id FROM visits WHERE customer_id = $1 AND table_session_id = $2`,
        [customerId, sessionId],
      );
      visitId = (visitRow as Record<string, unknown>[])[0].id as string;
    }

    let totalVisits: number;
    if (isNewVisit) {
      const updatedRows = unwrapRows<{ total_visits: number }>(
        await this.tenantConn.query(
          `UPDATE customers SET total_visits = total_visits + 1, last_visit_at = now(), updated_at = now() WHERE id = $1 RETURNING total_visits`,
          [customerId],
        ),
      );
      totalVisits = updatedRows[0].total_visits;
    } else {
      // Reload da mesma sessão: reusa a contagem existente, só atualiza o
      // "visto por último". Não infla o contador.
      await this.tenantConn.query(
        `UPDATE customers SET last_visit_at = now(), updated_at = now() WHERE id = $1`,
        [customerId],
      );
      totalVisits = customer.total_visits as number;
    }

    const participant = await this.tableSessionService.upsertParticipant(
      sessionId,
      customerId,
      visitId,
      {
        location: location ?? null,
        slug: this.tenantConn.getTenantSlug(),
      },
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
      locationCheck,
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

  async getLastVisitItems(
    customerId: string,
    currentSessionId: string,
  ): Promise<LastVisitRepeatResponse> {
    const orderRows = (await this.tenantConn.query(
      `SELECT o.id
         FROM orders o
         JOIN visits v ON v.id = o.visit_id
        WHERE v.customer_id = $1
          AND v.table_session_id <> $2
          AND o.status NOT IN ('cancelled', 'canceled')
          AND EXISTS (
            SELECT 1 FROM order_items oi WHERE oi.order_id = o.id
          )
        ORDER BY o.created_at DESC
        LIMIT 1`,
      [customerId, currentSessionId],
    )) as Array<{ id: string }>;
    const orderId = orderRows[0]?.id ?? null;
    if (!orderId) {
      return { orderId: null, items: [], unavailableItems: [] };
    }

    const rows = (await this.tenantConn.query(
      `SELECT oi.menu_item_id,
              oi.quantity,
              oi.notes,
              oi.unit_price_cents,
              mi.name,
              mi.is_available,
              COALESCE(mi.kind, 'food') AS kind,
              mc.name AS category_name,
              sub.id AS substitute_id,
              sub.name AS substitute_name,
              sub.price_cents AS substitute_price_cents
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
    LEFT JOIN menu_categories mc ON mc.id = mi.category_id
    LEFT JOIN LATERAL (
          SELECT smi.id, smi.name, smi.price_cents
            FROM menu_items smi
           WHERE smi.category_id = mi.category_id
             AND smi.is_available = true
             AND smi.id <> mi.id
           ORDER BY smi.total_orders DESC NULLS LAST, smi.name ASC
           LIMIT 1
        ) sub ON true
        WHERE oi.order_id = $1
        ORDER BY oi.created_at ASC`,
      [orderId],
    )) as Array<{
      menu_item_id: string;
      quantity: number;
      notes: string | null;
      unit_price_cents: number;
      name: string;
      is_available: boolean;
      kind: 'food' | 'drink' | string | null;
      category_name: string | null;
      substitute_id: string | null;
      substitute_name: string | null;
      substitute_price_cents: number | null;
    }>;

    return {
      orderId,
      items: rows
        .filter((row) => row.is_available)
        .map((row) => ({
          menuItemId: row.menu_item_id,
          name: row.name,
          quantity: row.quantity,
          note: row.notes,
          priceCents: row.unit_price_cents,
          kind: row.kind === 'drink' ? 'drink' : 'food',
          categoryName: row.category_name,
        })),
      unavailableItems: rows
        .filter((row) => !row.is_available)
        .map((row) => ({
          menuItemId: row.menu_item_id,
          name: row.name,
          categoryName: row.category_name,
          substitute:
            row.substitute_id && row.substitute_name && row.substitute_price_cents
              ? {
                  menuItemId: row.substitute_id,
                  name: row.substitute_name,
                  priceCents: row.substitute_price_cents,
                }
              : null,
        })),
    };
  }

  private async validateCustomerLocation(
    location?: CustomerLocationSignal | null,
  ): Promise<CustomerLocationCheck> {
    const config = await this.readGeofenceConfig();
    const check = evaluateCustomerGeofence(location, config);
    assertInsideCustomerGeofence(check);
    return check;
  }

  private async readGeofenceConfig(): Promise<GeofenceConfig> {
    const envLat = this.finiteEnvNumber('CUSTOMER_GEOFENCE_LATITUDE');
    const envLon =
      this.finiteEnvNumber('CUSTOMER_GEOFENCE_LONGITUDE') ??
      this.finiteEnvNumber('CUSTOMER_GEOFENCE_LON');
    const envRadius = this.finiteEnvNumber('CUSTOMER_GEOFENCE_RADIUS_METERS');

    try {
      const rows = (await this.tenantConn.query(
        `SELECT geofence_latitude, geofence_longitude, geofence_radius_meters
           FROM settings
          LIMIT 1`,
      )) as Array<{
        geofence_latitude: number | string | null;
        geofence_longitude: number | string | null;
        geofence_radius_meters: number | string | null;
      }>;
      const row = rows[0];
      return {
        latitude: envLat ?? this.finiteNumber(row?.geofence_latitude),
        longitude: envLon ?? this.finiteNumber(row?.geofence_longitude),
        radiusMeters: envRadius ?? this.finiteNumber(row?.geofence_radius_meters) ?? 3,
      };
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code !== '42703') throw err;
      return {
        latitude: envLat,
        longitude: envLon,
        radiusMeters: envRadius ?? 3,
      };
    }
  }

  private finiteEnvNumber(name: string): number | null {
    return this.finiteNumber(process.env[name]);
  }

  private finiteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }
}
