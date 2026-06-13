import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { recordPgQuery } from '../../common/performance/request-timing';
import { QrCodeService } from '../table-session/qr-code.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';

interface TenantRow {
  slug: string;
  schema_name: string;
}

interface QrTableRow {
  id: string;
  code: string;
  label: string;
  qr_hmac_secret: string;
}

@Injectable()
export class QrResolverService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly qrCodeService: QrCodeService,
    private readonly audit: SecurityAuditService,
  ) {}

  async resolvePublicToken(publicToken: string): Promise<{
    redirectUrl: string;
    tenantSlug: string;
    tableId: string;
    tableCode: string;
  }> {
    const match = await this.findTable(publicToken);
    if (!match) {
      await this.audit.log('qr_scan_events', {
        tenantId: null,
        eventType: 'qr_unknown_token',
        metadata: { tokenPrefix: publicToken.slice(0, 8) },
      });
      throw new NotFoundException('QR nao encontrado.');
    }

    const timestamp = Date.now().toString();
    const hmac = this.qrCodeService.generateHmac(
      match.table.code,
      match.table.qr_hmac_secret,
      timestamp,
    );
    const accessToken = this.qrCodeService.generateDailyAccessToken(
      match.table.code,
      match.table.qr_hmac_secret,
    );

    const baseUrl =
      process.env.CUSTOMER_APP_URL ?? process.env.WEB_CUSTOMER_URL ?? 'http://localhost:3003';
    const url = new URL(`/${match.tenant.slug}/mesa/${match.table.code}`, baseUrl);
    url.searchParams.set('hmac', hmac);
    url.searchParams.set('ts', timestamp);
    url.searchParams.set('accessToken', accessToken);

    await this.audit.log('qr_scan_events', {
      tenantId: match.tenant.slug,
      tableId: match.table.id,
      tableCode: match.table.code,
      eventType: 'qr_resolved',
      metadata: {
        tokenPrefix: publicToken.slice(0, 8),
        tableLabel: match.table.label,
      },
    });

    return {
      redirectUrl: url.toString(),
      tenantSlug: match.tenant.slug,
      tableId: match.table.id,
      tableCode: match.table.code,
    };
  }

  private async findTable(
    publicToken: string,
  ): Promise<{ tenant: TenantRow; table: QrTableRow } | null> {
    const tenants = (await this.pgQuery(
      `SELECT slug, schema_name
         FROM public.restaurants
        WHERE is_active = true
          AND schema_name ~ '^[a-z_][a-z0-9_]{0,62}$'`,
    )) as TenantRow[];

    for (const tenant of tenants) {
      const rows = (await this.pgQuery(
        `SELECT id, code, label, qr_hmac_secret
           FROM "${tenant.schema_name}".tables
          WHERE qr_public_token = $1
            AND is_active = true
          LIMIT 1`,
        [publicToken],
      )) as QrTableRow[];
      if (rows.length) {
        return { tenant, table: rows[0] };
      }
    }

    return null;
  }

  private async pgQuery(sql: string, params?: unknown[]): Promise<unknown[]> {
    const startedAt = process.hrtime.bigint();
    try {
      return await this.dataSource.query(sql, params);
    } finally {
      recordPgQuery(startedAt);
    }
  }
}
