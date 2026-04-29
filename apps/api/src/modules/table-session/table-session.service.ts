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

/**
 * Stable 6-tone palette for multi-person attribution on a shared table.
 * Order matches `session_participants.color_index`; assignment is per
 * session, so the first person to scan the QR is 0 and stays 0 even if
 * others leave and rejoin. Hex values align with the monochromatic brand
 * tokens in apps/web-customer/src/app/globals.css.
 */
export const PARTICIPANT_COLORS = [
  '#0a0a0a', // ink
  '#2f7d4f', // success
  '#c43a3a', // danger
  '#b07a1f', // ocre
  '#3f6ca7', // muted blue
  '#7a3ea8', // muted purple
] as const;

export interface TableParticipantRow {
  customerId: string;
  name: string;
  initial: string;
  color: string;
}

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

    // 3. Reusa sessao ativa da mesa quando existe (dentro do TTL). Sem
    // isso, cada scan do mesmo QR criava uma nova table_session, fazendo
    // (a) replay do mesmo (hmac+ts) gerar table_sessions infinitas (DoS
    // de linhas), (b) usuarios na MESMA mesa fisica entrarem em sessoes
    // diferentes — nunca veriam o pedido um do outro. Comanda compartilhada
    // exige sessao por mesa, nao por scan. Multi-user e diferenciado via
    // `session_participants` (visit_id + customer_id).
    const activeRows = (await this.tenantConn.query(
      `SELECT id FROM table_sessions
       WHERE table_id = $1
         AND status = 'active'
         AND created_at > NOW() - INTERVAL '4 hours'
       ORDER BY created_at DESC
       LIMIT 1`,
      [table.id],
    )) as { id: string }[];

    let sessionId: string;
    let isNewSession: boolean;

    if (activeRows.length > 0) {
      sessionId = activeRows[0].id;
      isNewSession = false;
    } else {
      const sessionToken = uuidv4();
      const result = (await this.tenantConn.query(
        `INSERT INTO table_sessions (table_id, session_token, status)
         VALUES ($1, $2, 'active')
         RETURNING id`,
        [table.id, sessionToken],
      )) as { id: string }[];
      sessionId = result[0].id;
      isNewSession = true;
    }

    // 4. Salva (ou refresca) no Redis usando o sessionId (DB id) — mesmo
    // valor que vai pro cookie e pro header x-session-token. SET com TTL
    // re-emite a chave em cada scan; uma sessao com trafego ativo nunca
    // expira em 4h.
    const sessionData: SessionData = {
      sessionId,
      tableId: table.id as string,
      tableCode: table.code as string,
      tableLabel: table.label as string,
      schemaName,
    };

    await this.redis.set(
      `session:${sessionId}`,
      JSON.stringify(sessionData),
      SESSION_TTL_SECONDS,
    );

    // 5. Welcome pool e por sessao — so gera no primeiro scan. Em scans
    // subsequentes mantemos o pool original pra que indices ja consumidos
    // (LPOP) nao se repitam quando outro usuario chega.
    if (isNewSession) {
      const indices = Array.from({ length: 30 }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      await this.redis.rpush(
        `welcome_pool:${sessionId}`,
        ...indices.map(String),
      );
    }
    // Sempre refresca TTL do pool — sessao reusada pode estar com TTL
    // baixo se o ultimo scan foi 3h59 atras.
    await this.redis.expire(`welcome_pool:${sessionId}`, SESSION_TTL_SECONDS);

    return { ...sessionData, sessionId };
  }

  async getSessionFromToken(sessionToken: string): Promise<SessionData | null> {
    const data = await this.redis.get(`session:${sessionToken}`);
    if (!data) return null;
    return JSON.parse(data) as SessionData;
  }

  /**
   * Register a customer as present at the table. Idempotent — re-entry by
   * the same customer resets `left_at` and keeps their original color so
   * avatars stay stable across reconnects. Returns the participant's color
   * so the caller can pass it straight back to the client.
   */
  async upsertParticipant(
    tableSessionId: string,
    customerId: string,
    visitId?: string | null,
  ): Promise<TableParticipantRow> {
    // Lock the current participants row so concurrent scans don't collide
    // on the same color_index.
    const existing = (await this.tenantConn.query(
      `SELECT color_index FROM session_participants
       WHERE table_session_id = $1 AND customer_id = $2`,
      [tableSessionId, customerId],
    )) as { color_index: number }[];

    let colorIndex: number;

    if (existing.length > 0) {
      colorIndex = existing[0].color_index;
      await this.tenantConn.query(
        `UPDATE session_participants
         SET visit_id = COALESCE($3, visit_id), left_at = NULL
         WHERE table_session_id = $1 AND customer_id = $2`,
        [tableSessionId, customerId, visitId ?? null],
      );
    } else {
      const counted = (await this.tenantConn.query(
        `SELECT COUNT(*)::int AS n FROM session_participants
         WHERE table_session_id = $1`,
        [tableSessionId],
      )) as { n: number }[];
      colorIndex = counted[0].n % PARTICIPANT_COLORS.length;

      await this.tenantConn.query(
        `INSERT INTO session_participants
           (table_session_id, customer_id, visit_id, color_index)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (table_session_id, customer_id) DO NOTHING`,
        [tableSessionId, customerId, visitId ?? null, colorIndex],
      );
    }

    const customers = (await this.tenantConn.query(
      `SELECT name FROM customers WHERE id = $1`,
      [customerId],
    )) as { name: string }[];
    const name = customers[0]?.name ?? '';

    return {
      customerId,
      name,
      initial: (name.trim().charAt(0) || '?').toUpperCase(),
      color: PARTICIPANT_COLORS[colorIndex],
    };
  }

  /**
   * Serve the avatar strip (SM3, SP1) with one row per active participant.
   * Filters out anyone who has left the table. Order is insertion order so
   * colors are visually stable.
   */
  async getParticipants(tableSessionId: string): Promise<TableParticipantRow[]> {
    const rows = (await this.tenantConn.query(
      `SELECT sp.customer_id, sp.color_index, c.name
       FROM session_participants sp
       JOIN customers c ON c.id = sp.customer_id
       WHERE sp.table_session_id = $1 AND sp.left_at IS NULL
       ORDER BY sp.joined_at ASC`,
      [tableSessionId],
    )) as { customer_id: string; color_index: number; name: string }[];

    return rows.map((r) => ({
      customerId: r.customer_id,
      name: r.name,
      initial: (r.name.trim().charAt(0) || '?').toUpperCase(),
      color:
        PARTICIPANT_COLORS[r.color_index % PARTICIPANT_COLORS.length] ??
        PARTICIPANT_COLORS[0],
    }));
  }
}
