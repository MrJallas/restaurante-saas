import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { unwrapRows } from '../tenant/query-utils';
import { EventsGateway } from '../websocket/events.gateway';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import {
  evaluateCustomerGeofence,
  type GeofenceConfig,
} from '../../common/utils/geofence';
import type {
  CustomerLocationCheck,
  CustomerLocationSignal,
  CustomerLocationStatus,
  ScanVerificationRequestDto,
  ScanVerificationStatus,
} from '@restaurant/shared-types';

const DEFAULT_TTL_SECONDS = 60;

interface ScanVerificationRow {
  id: string;
  table_session_id: string;
  table_id: string;
  table_code: string;
  table_number: number | null;
  customer_id: string;
  customer_name: string;
  cpf: string | null;
  status: ScanVerificationStatus;
  location_status: CustomerLocationStatus;
  latitude: string | number | null;
  longitude: string | number | null;
  accuracy_meters: string | number | null;
  distance_meters: string | number | null;
  inside_radius: boolean | null;
  radius_meters: string | number | null;
  escalation_level: number;
  escalation_chain_id: string | null;
  ttl_expires_at: string;
  decided_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

@Injectable()
export class ScanVerificationService {
  private readonly logger = new Logger(ScanVerificationService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly audit: SecurityAuditService,
    @Optional() private readonly events?: EventsGateway,
  ) {}

  async ensureForParticipant(input: {
    tableSessionId: string;
    tableId: string;
    customerId: string;
    visitId?: string | null;
    location?: CustomerLocationSignal | null;
    slug?: string;
  }): Promise<ScanVerificationRequestDto> {
    const existing = await this.findBySessionCustomer(
      input.tableSessionId,
      input.customerId,
    );
    if (existing) return existing;

    const ttlExpiresAt = new Date(
      Date.now() + DEFAULT_TTL_SECONDS * 1000,
    ).toISOString();
    const location = this.normalizeLocation(input.location);
    const locationCheck = await this.evaluateLocation(location);

    let requestId: string;
    try {
      requestId = await this.tenantConn.transaction(async (tx) => {
        const inserted = unwrapRows<{ id: string }>(
          await tx.query(
            `INSERT INTO scan_verification_requests
               (table_session_id, table_id, customer_id, visit_id,
                ttl_expires_at, location_status, latitude, longitude,
                accuracy_meters, distance_meters, inside_radius, radius_meters)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING id`,
            [
              input.tableSessionId,
              input.tableId,
              input.customerId,
              input.visitId ?? null,
              ttlExpiresAt,
              location.status,
              location.latitude ?? null,
              location.longitude ?? null,
              location.accuracyMeters ?? null,
              locationCheck.distanceMeters,
              locationCheck.insideRadius,
              locationCheck.radiusMeters,
            ],
          ),
        );
        const id = inserted[0]?.id;
        if (!id) {
          throw new Error('scan_verification insert returned no id');
        }

        const chains = unwrapRows<{ id: string }>(
          await tx.query(
            `INSERT INTO escalation_chains
               (kind, source_id, level, current_assignee_role,
                ttl_expires_at, steps)
             VALUES ('scan_verification', $1, 0, 'host', $2,
                     '[{"role":"host"},{"role":"manager"},{"role":"waiter"}]'::jsonb)
             RETURNING id`,
            [id, ttlExpiresAt],
          ),
        );
        const chainId = chains[0]?.id;
        if (chainId) {
          await tx.query(
            `UPDATE scan_verification_requests
                SET escalation_chain_id = $2,
                    updated_at = now()
              WHERE id = $1`,
            [id, chainId],
          );
        }
        return id;
      });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        const raced = await this.findBySessionCustomer(
          input.tableSessionId,
          input.customerId,
        );
        if (raced) return raced;
      }
      throw err;
    }

    const dto = await this.getById(requestId);
    await this.logCreated(dto, input.slug);
    if (input.slug && this.events) {
      this.events.emitScanVerificationCreated(input.slug, {
        requestId: dto.id,
        tableSessionId: dto.tableSessionId,
        tableId: dto.tableId,
        tableCode: dto.tableCode,
        tableNumber: dto.tableNumber,
        requesterCustomerId: dto.customerId,
        requesterName: dto.requesterName,
        cpfMasked: dto.cpfMasked,
        locationStatus: dto.locationStatus,
        expiresAt: dto.expiresAt,
      });
      if (dto.escalationChainId) {
        this.events.emitEscalationCreated(input.slug, null, {
          escalationId: dto.escalationChainId,
          type: 'scan_verification',
          tenantId: input.slug,
          context: {
            requestId: dto.id,
            tableNumber: dto.tableNumber,
            requesterName: dto.requesterName,
          },
          deadline: dto.expiresAt,
        });
      }
    }

    return dto;
  }

  async list(filters: {
    status?: ScanVerificationStatus;
  }): Promise<ScanVerificationRequestDto[]> {
    const params: unknown[] = [];
    const where: string[] = [];
    if (filters.status) {
      where.push(`svr.status = $${params.length + 1}`);
      params.push(filters.status);
    }
    const rows = (await this.tenantConn.query(
      `${this.baseSelect()}
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY svr.created_at DESC
       LIMIT 100`,
      params,
    )) as ScanVerificationRow[];
    return rows.map((r) => this.mapRow(r));
  }

  async getById(id: string): Promise<ScanVerificationRequestDto> {
    const rows = (await this.tenantConn.query(
      `${this.baseSelect()} WHERE svr.id = $1 LIMIT 1`,
      [id],
    )) as ScanVerificationRow[];
    if (!rows.length) {
      throw new NotFoundException('Verificacao de scan nao encontrada.');
    }
    return this.mapRow(rows[0]);
  }

  async approve(
    id: string,
    staffId: string,
    slug?: string,
  ): Promise<ScanVerificationRequestDto> {
    return this.respond(id, 'approved', staffId, undefined, slug);
  }

  async reject(
    id: string,
    staffId: string,
    reason?: string,
    slug?: string,
  ): Promise<ScanVerificationRequestDto> {
    return this.respond(id, 'rejected', staffId, reason, slug);
  }

  private async respond(
    id: string,
    status: 'approved' | 'rejected',
    staffId: string,
    reason?: string,
    slug?: string,
  ): Promise<ScanVerificationRequestDto> {
    const updatedId = await this.tenantConn.transaction(async (tx) => {
      const current = unwrapRows<{
        id: string;
        table_session_id: string;
        customer_id: string;
        escalation_chain_id: string | null;
        status: ScanVerificationStatus;
      }>(
        await tx.query(
          `SELECT id, table_session_id, customer_id, escalation_chain_id, status
             FROM scan_verification_requests
            WHERE id = $1
            FOR UPDATE`,
          [id],
        ),
      )[0];
      if (!current) {
        throw new NotFoundException('Verificacao de scan nao encontrada.');
      }
      if (current.status !== 'pending') {
        throw new ConflictException(
          `Verificacao ja decidida (status=${current.status}).`,
        );
      }

      await tx.query(
        `UPDATE scan_verification_requests
            SET status = $2::scan_verification_status,
                approved_by_staff_id = CASE WHEN $2::text = 'approved' THEN $3::uuid ELSE approved_by_staff_id END,
                rejected_by_staff_id = CASE WHEN $2::text = 'rejected' THEN $3::uuid ELSE rejected_by_staff_id END,
                rejection_reason = CASE WHEN $2::text = 'rejected' THEN COALESCE($4, rejection_reason) ELSE rejection_reason END,
                decided_at = now(),
                updated_at = now()
          WHERE id = $1`,
        [id, status, staffId, reason ?? null],
      );

      if (status === 'approved') {
        await tx.query(
          `UPDATE session_participants
              SET status = 'approved',
                  approved_at = now(),
                  left_at = NULL
            WHERE table_session_id = $1
              AND customer_id = $2
              AND left_at IS NULL`,
          [current.table_session_id, current.customer_id],
        );
        await tx.query(
          `UPDATE table_sessions
              SET host_customer_id = COALESCE(host_customer_id, $2),
                  updated_at = now()
            WHERE id = $1`,
          [current.table_session_id, current.customer_id],
        );
      } else {
        await tx.query(
          `UPDATE session_participants
              SET status = 'rejected',
                  rejected_at = now()
            WHERE table_session_id = $1
              AND customer_id = $2
              AND left_at IS NULL`,
          [current.table_session_id, current.customer_id],
        );
        await tx.query(
          `UPDATE table_sessions
              SET status = 'closed',
                  closed_at = COALESCE(closed_at, now()),
                  closed_by = 'scan_verification:rejected',
                  updated_at = now()
            WHERE id = $1
              AND status = 'active'
              AND host_customer_id IS NULL`,
          [current.table_session_id],
        );
      }

      if (current.escalation_chain_id) {
        await tx.query(
          `UPDATE escalation_chains
              SET completed_at = now(),
                  resolution_notes = $2,
                  updated_at = now()
            WHERE id = $1`,
          [
            current.escalation_chain_id,
            status === 'approved'
              ? `approved_by_staff:${staffId}`
              : `rejected_by_staff:${staffId}`,
          ],
        );
      }
      return current.id;
    });

    const dto = await this.getById(updatedId);
    await this.logResolved(dto, staffId, slug);
    if (slug && this.events) {
      this.events.emitScanVerificationResolved(slug, {
        requestId: dto.id,
        tableSessionId: dto.tableSessionId,
        requesterCustomerId: dto.customerId,
        status: dto.status,
        decidedAt: dto.decidedAt ?? new Date().toISOString(),
        decidedByStaffId: staffId,
        reason: dto.rejectionReason ?? null,
      });
      this.events.emitToSession(dto.tableSessionId, 'participant:decision', {
        customerId: dto.customerId,
        status: dto.status === 'approved' ? 'approved' : 'rejected',
        decidedAt: dto.decidedAt ?? new Date().toISOString(),
      });
      if (dto.status === 'approved') {
        this.events.emitEscalationCompleted(slug, dto.customerId, {
          escalationId: dto.escalationChainId ?? dto.id,
          outcome: 'approved',
          resolvedBy: `staff:${staffId}`,
        });
      } else {
        this.events.emitEscalationCompleted(slug, dto.customerId, {
          escalationId: dto.escalationChainId ?? dto.id,
          outcome: 'rejected',
          resolvedBy: `staff:${staffId}`,
        });
      }
    }

    return dto;
  }

  private async findBySessionCustomer(
    tableSessionId: string,
    customerId: string,
  ): Promise<ScanVerificationRequestDto | null> {
    const rows = (await this.tenantConn.query(
      `${this.baseSelect()}
       WHERE svr.table_session_id = $1
         AND svr.customer_id = $2
       ORDER BY svr.created_at DESC
       LIMIT 1`,
      [tableSessionId, customerId],
    )) as ScanVerificationRow[];
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  private baseSelect(): string {
    return `SELECT svr.id,
                  svr.table_session_id,
                  svr.table_id,
                  t.code AS table_code,
                  CAST(NULLIF(regexp_replace(t.code, '[^0-9]', '', 'g'), '') AS INT) AS table_number,
                  svr.customer_id,
                  c.name AS customer_name,
                  c.cpf,
                  svr.status,
                  svr.location_status,
                  svr.latitude,
                  svr.longitude,
                  svr.accuracy_meters,
                  svr.distance_meters,
                  svr.inside_radius,
                  svr.radius_meters,
                  svr.escalation_level,
                  svr.escalation_chain_id,
                  svr.ttl_expires_at,
                  svr.decided_at,
                  svr.rejection_reason,
                  svr.created_at
             FROM scan_verification_requests svr
             JOIN tables t ON t.id = svr.table_id
             JOIN customers c ON c.id = svr.customer_id`;
  }

  private mapRow(row: ScanVerificationRow): ScanVerificationRequestDto {
    const location: CustomerLocationSignal = {
      status: row.location_status,
      latitude: this.toNumber(row.latitude),
      longitude: this.toNumber(row.longitude),
      accuracyMeters: this.toNumber(row.accuracy_meters),
      capturedAt: row.created_at,
    };
    const distanceMeters = this.toNumber(row.distance_meters);
    const insideRadius = row.inside_radius;
    const radiusMeters = this.toNumber(row.radius_meters);
    return {
      id: row.id,
      tableSessionId: row.table_session_id,
      tableId: row.table_id,
      tableCode: row.table_code,
      tableNumber: Number(row.table_number ?? 0),
      customerId: row.customer_id,
      requesterName: row.customer_name,
      cpfMasked: this.maskCpf(row.cpf),
      status: row.status,
      locationStatus: row.location_status,
      location,
      distanceMeters,
      insideRadius,
      radiusMeters,
      escalationLevel: row.escalation_level,
      escalationChainId: row.escalation_chain_id,
      expiresAt: row.ttl_expires_at,
      ttlExpiresAt: row.ttl_expires_at,
      decidedAt: row.decided_at,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at,
      locationDistanceMeters: distanceMeters,
      locationRadiusMeters: radiusMeters ?? 3,
      locationWithinRestaurant: insideRadius,
    };
  }

  private async evaluateLocation(
    location: CustomerLocationSignal,
  ): Promise<CustomerLocationCheck> {
    try {
      return evaluateCustomerGeofence(location, await this.readGeofenceConfig());
    } catch {
      return {
        status: location.status,
        distanceMeters: null,
        insideRadius: false,
        radiusMeters: null,
      };
    }
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
        radiusMeters:
          envRadius ?? this.finiteNumber(row?.geofence_radius_meters) ?? 3,
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

  private normalizeLocation(
    location?: CustomerLocationSignal | null,
  ): CustomerLocationSignal {
    if (!location) return { status: 'unknown' };
    const allowed = new Set<CustomerLocationStatus>([
      'unknown',
      'prompt',
      'granted',
      'denied',
      'unavailable',
      'unsupported',
    ]);
    const status = allowed.has(location.status) ? location.status : 'unknown';
    return {
      status,
      latitude: this.finiteOrNull(location.latitude),
      longitude: this.finiteOrNull(location.longitude),
      accuracyMeters: this.finiteOrNull(location.accuracyMeters),
      capturedAt: location.capturedAt ?? new Date().toISOString(),
    };
  }

  private finiteOrNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private finiteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  private toNumber(value: string | number | null): number | null {
    if (value == null) return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private maskCpf(cpf: string | null): string | null {
    if (!cpf) return null;
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11) return null;
    return `***.***.***-${clean.slice(-2)}`;
  }

  private async logCreated(
    dto: ScanVerificationRequestDto,
    slug?: string,
  ): Promise<void> {
    const base = {
      tenantId: slug ?? this.tenantConn.getTenantSlug() ?? null,
      tableId: dto.tableId,
      tableCode: dto.tableCode,
      tableSessionId: dto.tableSessionId,
      customerId: dto.customerId,
      eventType: 'scan_verification_created',
      metadata: {
        requestId: dto.id,
        tableNumber: dto.tableNumber,
        locationStatus: dto.locationStatus,
        escalationLevel: dto.escalationLevel,
      },
    };
    await Promise.all([
      this.audit.log('scan_verification_events', base),
      this.audit.logAudit(base),
    ]).catch((err) =>
      this.logger.warn(`scan verification log failed: ${(err as Error).message}`),
    );
  }

  private async logResolved(
    dto: ScanVerificationRequestDto,
    staffId: string,
    slug?: string,
  ): Promise<void> {
    const base = {
      tenantId: slug ?? this.tenantConn.getTenantSlug() ?? null,
      tableId: dto.tableId,
      tableCode: dto.tableCode,
      tableSessionId: dto.tableSessionId,
      customerId: dto.customerId,
      staffId,
      eventType:
        dto.status === 'approved'
          ? 'scan_verification_approved'
          : 'scan_verification_rejected',
      metadata: {
        requestId: dto.id,
        tableNumber: dto.tableNumber,
        reason: dto.rejectionReason ?? null,
      },
    };
    await Promise.all([
      this.audit.log('scan_verification_events', base),
      this.audit.logAudit(base),
    ]).catch((err) =>
      this.logger.warn(`scan verification log failed: ${(err as Error).message}`),
    );
  }
}
