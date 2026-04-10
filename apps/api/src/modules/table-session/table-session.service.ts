import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { TenantConnectionProvider } from '../tenant/tenant-connection.provider';
import { RedisService } from '../../infra/redis/redis.service';
import { QrCodeService } from './qr-code.service';

interface SessionData {
  sessionId: string;
  tableId: string;
  tableCode: string;
  tableLabel: string;
  schemaName: string;
}

const SESSION_TTL_SECONDS = 4 * 60 * 60; // 4 hours

@Injectable()
export class TableSessionService {
  private readonly logger = new Logger(TableSessionService.name);

  constructor(
    private readonly tenantConn: TenantConnectionProvider,
    private readonly redis: RedisService,
    private readonly qrCodeService: QrCodeService,
  ) {}

  async initSession(
    tableCode: string,
    hmacSignature: string,
    timestamp: string,
    schemaName: string,
  ): Promise<SessionData> {
    // 1. Busca mesa pelo code
    const tables = await this.tenantConn.query(
      'SELECT id, code, label, qr_hmac_secret, is_active FROM tables WHERE code = $1',
      [tableCode],
    );

    if (!tables || !(tables as unknown[]).length) {
      throw new HttpException('Mesa nao encontrada.', HttpStatus.NOT_FOUND);
    }

    const table = (tables as Record<string, unknown>[])[0];

    if (!table.is_active) {
      throw new HttpException('Mesa inativa.', HttpStatus.FORBIDDEN);
    }

    // 2. Valida HMAC
    const isValid = this.qrCodeService.validateHmac(
      tableCode,
      hmacSignature,
      timestamp,
      table.qr_hmac_secret as string,
    );

    if (!isValid) {
      throw new HttpException('QR Code invalido ou expirado.', HttpStatus.UNAUTHORIZED);
    }

    // 3. Cria table_session no banco
    const sessionToken = uuidv4();
    const result = await this.tenantConn.query(
      `INSERT INTO table_sessions (table_id, session_token, status)
       VALUES ($1, $2, 'active')
       RETURNING id`,
      [table.id, sessionToken],
    );

    const sessionId = (result as Record<string, unknown>[])[0].id as string;

    // 4. Salva no Redis
    const sessionData: SessionData = {
      sessionId,
      tableId: table.id as string,
      tableCode: table.code as string,
      tableLabel: table.label as string,
      schemaName,
    };

    await this.redis.set(
      `session:${sessionToken}`,
      JSON.stringify(sessionData),
      SESSION_TTL_SECONDS,
    );

    // 5. Gera welcome pool: shuffle [0..29], RPUSH
    const indices = Array.from({ length: 30 }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    await this.redis.rpush(
      `welcome_pool:${sessionId}`,
      ...indices.map(String),
    );
    await this.redis.expire(`welcome_pool:${sessionId}`, SESSION_TTL_SECONDS);

    return { ...sessionData, sessionId };
  }

  async getSessionFromToken(sessionToken: string): Promise<SessionData | null> {
    const data = await this.redis.get(`session:${sessionToken}`);
    if (!data) return null;
    return JSON.parse(data) as SessionData;
  }
}
