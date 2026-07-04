import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Server, Socket } from 'socket.io';
import { timingSafeEqual } from 'crypto';
import { RedisService } from '../../infra/redis/redis.service';
import { safeJsonParse } from '../../common/utils/safe-json';
import { verifyStaffSessionToken } from '../../common/auth/staff-session-token';
import { EventsEmitterService } from './events-emitter.service';
import type {
  WsEscalationCreated,
  WsEscalationAdvanced,
  WsEscalationCompleted,
  WsLateArrivalCreated,
  WsLateArrivalApproved,
  WsLateArrivalRejected,
  WsLateArrivalExpired,
  WsScanVerificationCreated,
  WsScanVerificationEscalated,
  WsScanVerificationResolved,
  WsTableMergeCreated,
  WsTableMergeApproved,
  WsTableMergeRejected,
  WsMergeCooldownStarted,
  WsMergeCooldownExpired,
  WsLgpdRequestFulfilled,
  WsComplaintReceived,
  WsComplaintResponded,
  WsComplaintRead,
  WsComplaintResolved,
  WsStaffMessageReceived,
  WsStaffMessageRead,
  WsCourtesyCreated,
  WsCourtesyUpdated,
  WsPaymentConfirmed,
  WsOrderStatus,
  WsOrderClaimed,
  WsWaiterAcknowledged,
  WsZonePauseStarted,
  WsZonePauseEnded,
  WsSessionFlagChanged,
  WsHostTableLiberated,
  WsHostSwapRequested,
  WsHostSwapStateChanged,
  WsHostVipFlagged,
} from '@restaurant/shared-types';

/**
 * Authenticated socket data. We extend the existing pattern (staff vs session)
 * with optional `customerId` / `staffId` slots used by the new room-routing
 * helpers (`customer:<id>`, `staff:<id>`, `manager:<id>`).
 */
interface AuthedSocket extends Socket {
  data: {
    authType?: 'staff' | 'session';
    sessionId?: string;
    customerId?: string;
    staffId?: string;
    staffRole?: string;
    tenantSlug?: string;
    /**
     * Round 9 (B-NEW-26): tenant slug stamped at handshake from
     * `x-tenant-slug` header. Used by join:tenant and join:session
     * to reject cross-tenant room subscriptions even if the staff
     * key is valid.
     */
    staffTenantSlug?: string;
    /**
     * Promise do handshake async (2026-06-12): o Socket.IO entrega
     * `join:*` assim que a conexão abre, SEM esperar o handleConnection
     * async terminar — os handlers de join precisam `await` isto antes
     * de validar, senão leem `authType`/`customerId` ainda não
     * carimbados (era a causa do `join:customer` rejeitado com
     * connCustomer=none, e deixava `join:session` entrar em room sem
     * auth nenhuma pelo curto-circuito dos checks por tipo).
     */
    authReady?: Promise<void>;
  };
}

@WebSocketGateway({
  cors: {
    // Round 10 (B-NEW-54): CORS_ORIGINS env honrada (igual main.ts:11-14).
    // Antes hardcoded localhost — em prod com domínio real, WS handshake
    // falhava em browsers que verificam Origin. Inconsistência interna
    // entre HTTP (env-driven) e WS (hardcoded) corrigida.
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
      : ['http://localhost:3003', 'http://localhost:3002'],
    credentials: true,
  },
  namespace: '/',
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly redis: RedisService,
    private readonly dataSource: DataSource,
    private readonly emitter: EventsEmitterService,
  ) {}

  /**
   * Lifecycle do Nest (OnGatewayInit): repassa o Server do socket.io pro
   * EventsEmitterService — os emit* extraídos operam na MESMA instância
   * que o @WebSocketServer() popula neste gateway.
   */
  afterInit(server: Server) {
    this.emitter.bindServer(server);
  }

  /**
   * Round 16 (B-NEW-55): extrai IP do handshake. Atrás de proxy/CDN
   * `x-forwarded-for` é a fonte real (mesmo pattern de
   * customers.controller.identifyClientKey).
   */
  private handshakeIp(client: AuthedSocket): string {
    const xff = client.handshake.headers['x-forwarded-for'];
    const xffStr = Array.isArray(xff) ? xff[0] : xff;
    return ((xffStr as string | undefined) ?? client.handshake.address ?? 'unknown')
      .toString()
      .split(',')[0]
      .trim();
  }

  /**
   * Identidade por PARTICIPANTE no handshake customer (decisão Caleb
   * 2026-06-12, evolução 1-b do prompt 100): o token de sessão é
   * COMPARTILHADO pela mesa (token == tableSessionId) e o payload Redis
   * só guarda o customerId do ÚLTIMO welcome/identify — `join:customer`
   * autenticava só esse último e o realtime privado (resposta do
   * gerente) não chegava pros demais. O cookie `recognition_token`
   * (httpOnly, individual por cliente, enviado automaticamente no
   * upgrade do WS — cookies ignoram porta e o site é o mesmo) prova quem
   * É a pessoa naquele device. Quando presente e válido no schema do
   * tenant da sessão, ele DEFINE o customerId da conexão; sem ele, cai
   * no fallback do payload compartilhado (comportamento anterior).
   */
  /** Lê o cookie httpOnly `staff_token` do handshake (ignora porta). */
  private readStaffTokenCookie(client: AuthedSocket): string | null {
    const rawCookie = client.handshake.headers.cookie;
    if (!rawCookie) return null;
    const match = /(?:^|;\s*)staff_token=([^;]+)/.exec(rawCookie);
    return match ? decodeURIComponent(match[1]) : null;
  }

  private async resolveRecognizedCustomer(
    client: AuthedSocket,
    schemaName: string | undefined,
  ): Promise<string | null> {
    try {
      if (!schemaName || !/^[a-z_][a-z0-9_]{0,62}$/.test(schemaName)) return null;
      const rawCookie = client.handshake.headers.cookie;
      if (!rawCookie) return null;
      const match = /(?:^|;\s*)recognition_token=([^;]+)/.exec(rawCookie);
      if (!match) return null;
      const token = decodeURIComponent(match[1]);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
        return null;
      }
      const cacheKey = `recognition_customer:${schemaName}:${token}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) return cached;
      const rows = (await this.dataSource.query(
        `SELECT id FROM "${schemaName}".customers WHERE recognition_token = $1 LIMIT 1`,
        [token],
      )) as Array<{ id: string }>;
      const customerId = rows[0]?.id ?? null;
      if (customerId) {
        await this.redis.set(cacheKey, customerId, 300);
      }
      return customerId;
    } catch {
      // Cookie é um upgrade de identidade — falha aqui nunca derruba o
      // handshake; só cai no fallback do payload compartilhado.
      return null;
    }
  }

  /**
   * Round 15 (P1-NEW-1 round14): valida que `customerId` pertence ao
   * tenant do staff. Antes `join:customer` staff-path entrava na room
   * sem checar — staff de tenant A com customerId de tenant B (UUID
   * vazado em logs/Mongo dump) recebia complaint.responded /
   * lgpd.request_fulfilled / late_arrival.* / staff_message.received
   * com PII alheia. Cache na chave `customer_tenant:<customerId>` (TTL
   * 5min) pra evitar lookup em DB a cada join.
   */
  private async validateCustomerInTenant(
    customerId: string,
    staffTenantSlug: string,
  ): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(customerId)) {
      return false;
    }

    const cached = await this.redis.get(`customer_tenant:${customerId}`);
    if (cached) {
      return cached === staffTenantSlug;
    }

    const restaurantRows = (await this.dataSource.query(
      `SELECT schema_name FROM public.restaurants
        WHERE slug = $1 AND is_active = true`,
      [staffTenantSlug],
    )) as Array<{ schema_name: string }>;
    if (!restaurantRows.length) return false;
    const schemaName = restaurantRows[0].schema_name;
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schemaName)) return false;

    const customerRows = (await this.dataSource.query(
      `SELECT 1 FROM "${schemaName}".customers WHERE id = $1 LIMIT 1`,
      [customerId],
    )) as unknown[];

    if (customerRows.length) {
      await this.redis.set(`customer_tenant:${customerId}`, staffTenantSlug, 300);
      return true;
    }
    return false;
  }

  async handleConnection(client: AuthedSocket) {
    // O trabalho async fica em authenticateConnection; a promise vai pro
    // client.data pra que os handlers de join aguardem o carimbo de
    // identidade antes de validar (ver AuthedSocket.authReady).
    const ready = this.authenticateConnection(client).catch((err) => {
      this.logger.warn(`WS handshake failed: ${(err as Error).message}`);
      try {
        client.disconnect(true);
      } catch {
        /* ignore */
      }
    });
    client.data.authReady = ready;
    await ready;
  }

  private async authenticateConnection(client: AuthedSocket) {
    // Round 16 (B-NEW-55): rate-limit handshake por IP — atacante sem
    // credentials válidas conseguia bater handshake centenas de vezes
    // por segundo (CPU spend em timingSafeEqual + Redis get). 30
    // tentativas por 60s é folgado pra reconnect normal mas mata DoS.
    const ip = this.handshakeIp(client);
    // Auditoria 2026-07-03: (a) chave escopada por tenant+IP — o restaurante
    // inteiro sai pelo mesmo IP (NAT) e um tenant não pode travar outro;
    // (b) incrWithExpiry (Lua atômico) — INCR+EXPIRE separados deixavam a
    // chave SEM TTL quando o EXPIRE falhava = lockout pra sempre;
    // (c) handshake autenticado devolve a cota lá embaixo (refund) — 30+
    // devices reconectando pós-deploy não podem travar a mesa.
    const tenantHint =
      (client.handshake.headers['x-tenant-slug'] as string) ??
      (client.handshake.auth?.tenantSlug as string) ??
      'shared';
    const handshakeKey = `ws:handshake:${tenantHint}:${ip}`;
    const attempts = await this.redis.incrWithExpiry(handshakeKey, 60);
    if (attempts > 30) {
      this.logger.warn(`WS handshake rate-limit hit: ${ip}`);
      client.emit('error', { message: 'Rate limit. Tente novamente em 60s.' });
      client.disconnect(true);
      return;
    }

    // Ciclo 2 (decisão Caleb 2026-07-04): autenticação de staff no WS pelo
    // COOKIE de sessão `staff_token` — o mesmo que o proxy seta no login.
    // Cookies ignoram porta, então o cookie de :3002 chega no handshake do
    // gateway em :3001 (mesmo host), igual o recognition_token do customer.
    // A identidade (staffId/role/slug) vem do PAYLOAD verificado no Redis,
    // nunca de header client-controlled. Sem token válido, cai no fallback
    // da key (legado / TV que injeta server-side).
    const staffCookieToken = this.readStaffTokenCookie(client);
    if (staffCookieToken) {
      const tenantHintForToken =
        (client.handshake.headers['x-tenant-slug'] as string) ??
        (client.handshake.auth?.tenantSlug as string) ??
        tenantHint;
      const payload = await verifyStaffSessionToken(
        this.redis,
        staffCookieToken,
        tenantHintForToken,
      );
      if (payload) {
        client.data.authType = 'staff';
        client.data.staffId = payload.staffId;
        client.data.staffRole = payload.role;
        client.data.staffTenantSlug = payload.slug;
        client.join(`staff:${payload.staffId}`);
        client.join(`tenant:${payload.slug}`);
        this.logger.log(`Staff WS connected via session token: ${client.id}`);
        await this.redis.decr(handshakeKey);
        return;
      }
      // Token presente mas inválido → não faz downgrade pra key.
      this.logger.warn(`Staff WS session token inválido: ${client.id}`);
      client.emit('error', { message: 'Sessão de equipe inválida. Faça login novamente.' });
      client.disconnect(true);
      return;
    }

    const staffKey =
      (client.handshake.headers['x-staff-key'] as string) ??
      (client.handshake.auth?.staffKey as string);
    const sessionToken =
      (client.handshake.headers['x-session-token'] as string) ??
      (client.handshake.auth?.sessionToken as string);

    const expected = process.env.STAFF_API_KEY;
    if (expected && staffKey) {
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(staffKey, 'utf8');
      if (a.length === b.length && timingSafeEqual(a, b)) {
        client.data.authType = 'staff';
        // Round 9 (B-NEW-36): staffId AGORA é OBRIGATÓRIO no handshake
        // staff (era opcional). Atacante que não passou x-staff-id
        // bypassava `client.data.staffId && ...` checks via
        // curto-circuito — agora rejeitamos a conexão direto.
        const staffId =
          (client.handshake.headers['x-staff-id'] as string) ??
          (client.handshake.auth?.staffId as string);
        const staffRole =
          (client.handshake.headers['x-staff-role'] as string) ??
          (client.handshake.auth?.staffRole as string);
        // Round 9 (B-NEW-26): tenantSlug carimbado do handshake header
        // pra cross-check em join:tenant / join:session. Antes a
        // gateway aceitava slug arbitrário do client em join:tenant.
        const tenantSlug =
          (client.handshake.headers['x-tenant-slug'] as string) ??
          (client.handshake.auth?.tenantSlug as string);

        if (!staffId) {
          this.logger.warn(`Staff WS connection without x-staff-id rejected: ${client.id}`);
          client.emit('error', {
            message: 'Staff WS handshake exige x-staff-id pra join:staff/manager rooms.',
          });
          client.disconnect(true);
          return;
        }
        // Round 14 (P1-NEW-1): x-tenant-slug agora é OBRIGATÓRIO no handshake
        // staff (era opcional, stamped só `if (tenantSlug)`). Como STAFF_API_KEY
        // é shared global, staff omitindo o slug curto-circuitava
        // `client.data.staffTenantSlug && ...` em join:tenant/session e
        // entrava em rooms de outros tenants recebendo eventos cross-tenant.
        if (!tenantSlug) {
          this.logger.warn(`Staff WS connection without x-tenant-slug rejected: ${client.id}`);
          client.emit('error', {
            message: 'Staff WS handshake exige x-tenant-slug pra cross-tenant isolation.',
          });
          client.disconnect(true);
          return;
        }
        client.data.staffId = staffId;
        if (staffRole) client.data.staffRole = staffRole;
        client.data.staffTenantSlug = tenantSlug;
        client.join(`staff:${staffId}`);
        client.join(`tenant:${tenantSlug}`);
        this.logger.log(`Staff client connected: ${client.id}`);
        this.logger.log(`Client ${client.id} auto-joined staff room ${staffId}`);
        // Handshake autenticado devolve a cota — só falha consome.
        await this.redis.decr(handshakeKey);
        return;
      }
    }

    if (sessionToken) {
      const data = await this.redis.get(`session:${sessionToken}`);
      if (data) {
        // Round 16 (B-NEW-53): safeJsonParse — payload corrompido cai em
        // null e o handshake é rejeitado com 'Authentication required'.
        const session = safeJsonParse<{
          sessionId: string;
          customerId?: string;
          schemaName?: string;
        }>(data);
        if (session) {
          client.data.authType = 'session';
          client.data.sessionId = session.sessionId;
          // Identidade por PARTICIPANTE (2026-06-12): o cookie
          // recognition_token (individual) vence o customerId do payload
          // compartilhado da mesa (último welcome/identify). É o que
          // permite cada cliente entrar no PRÓPRIO room `customer:<id>`
          // e receber a resposta privada do gerente em realtime.
          const recognizedCustomerId = await this.resolveRecognizedCustomer(
            client,
            session.schemaName,
          );
          if (recognizedCustomerId) {
            client.data.customerId = recognizedCustomerId;
          } else if (session.customerId) {
            client.data.customerId = session.customerId;
          }
          this.logger.log(`Session client connected: ${client.id}`);
          // Handshake autenticado devolve a cota — só falha consome.
          await this.redis.decr(handshakeKey);
          return;
        }
      }
    }

    this.logger.warn(`Unauthenticated WS connection rejected: ${client.id}`);
    client.emit('error', { message: 'Authentication required' });
    client.disconnect(true);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Round 9 (B-NEW-26 + B-NEW-34 + B-NEW-36): WS auth hardening.
   *
   * Staff handshake passa a EXIGIR `x-staff-id` (não apenas
   * `x-staff-key` shared). `client.data.staffTenantSlug` é stamped
   * a partir do handshake header `x-tenant-slug` (não do client
   * via join:tenant body). Antes:
   *  - join:tenant aceitava slug arbitrário → staff de A entrava em
   *    `tenant:B` rooms (B-NEW-26).
   *  - join:session só checava session match pra customer; staff
   *    passava em qualquer sessionId (B-NEW-34).
   *  - join:staff/manager checavam `client.data.staffId &&` que era
   *    falsy quando handshake não passou (B-NEW-36).
   *
   * Agora:
   *  - handshake staff EXIGE `x-staff-id` non-empty E `x-tenant-slug`.
   *  - join:tenant rejeita se data.slug != client.data.staffTenantSlug.
   *  - join:session rejeita staff se sessionId não pertence ao tenant.
   *  - join:staff/manager rejeita se `client.data.staffId` ausente OU
   *    diferente de data.staffId.
   */
  @SubscribeMessage('join:tenant')
  async handleJoinTenant(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { slug: string; role: string },
  ) {
    await client.data.authReady;
    if (client.data.authType !== 'staff') {
      client.emit('error', { message: 'Staff auth required for tenant rooms' });
      return;
    }

    // Round 9 (B-NEW-26): rejeita slug diferente do tenant carimbado
    // no handshake. Atacante não pode entrar em room de outro tenant.
    //
    // Round 14 (P1-NEW-1): handshake agora EXIGE x-tenant-slug, então
    // staffTenantSlug está sempre presente. O check anterior `&& ...`
    // curto-circuitava se faltasse — agora exigimos explicitamente.
    if (!client.data.staffTenantSlug || client.data.staffTenantSlug !== data.slug) {
      client.emit('error', { message: 'Tenant slug mismatch' });
      return;
    }

    const room = `tenant:${data.slug}:${data.role}`;
    client.join(room);
    client.join(`tenant:${data.slug}`);
    client.data.tenantSlug = data.slug;
    this.logger.log(`Client ${client.id} joined room ${room}`);
  }

  @SubscribeMessage('join:session')
  async handleJoinSession(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { sessionId: string },
  ) {
    await client.data.authReady;
    // 2026-06-12: handshake reprovado/ainda sem authType NUNCA entra em
    // room. Antes, os checks por tipo curto-circuitavam com authType
    // undefined e o join:session passava sem auth nenhuma (corrida do
    // handshake async — mesma família do join:customer rejeitado).
    if (!client.data.authType) {
      client.emit('error', { message: 'Authentication required' });
      return;
    }

    // Customer: cross-check próprio sessionId.
    if (client.data.authType === 'session' && client.data.sessionId !== data.sessionId) {
      client.emit('error', { message: 'Session mismatch' });
      return;
    }

    // Round 9 (B-NEW-34): staff path agora valida que a session pertence
    // ao próprio tenant. Antes staff de tenant A entrava em qualquer
    // session:<UUID> de qualquer tenant e recebia order/host events
    // alheios. Lookup por session_token Redis tem o sessionId mas não
    // tenant — usamos cache na chave `session:<sessionId>` que persiste
    // tableSession data com schema/slug.
    if (client.data.authType === 'staff') {
      const sessionData = await this.redis.get(`session:${data.sessionId}`);
      if (!sessionData) {
        client.emit('error', { message: 'Session inválida ou expirada.' });
        return;
      }
      const parsed = safeJsonParse<{ schemaName?: string }>(sessionData);
      if (!parsed) {
        client.emit('error', { message: 'Session payload corrompido.' });
        return;
      }
      // Round 14 (P1-NEW-1): handshake garante staffTenantSlug presente,
      // então o check anterior `&& ...` virou `!staffTenantSlug ||` pra
      // não curto-circuitar caso futura regressão volte a stamping
      // condicional.
      if (!client.data.staffTenantSlug || parsed.schemaName !== client.data.staffTenantSlug) {
        client.emit('error', { message: 'Cross-tenant session join blocked.' });
        return;
      }
    }

    const room = `session:${data.sessionId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined session room ${room}`);
  }

  /**
   * Customer-scoped room for late-arrival, table-merge and complaint events
   * targeted at a single end-user (e.g. "your merge request was approved").
   * Verified: only the authenticated customer can join their own room.
   * Staff sockets can also join any customer room (used by managers viewing
   * a particular guest's timeline).
   */
  @SubscribeMessage('join:customer')
  async handleJoinCustomer(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { customerId: string },
  ) {
    await client.data.authReady;
    if (client.data.authType === 'staff') {
      // Round 15 (P1-NEW-1 round14): staff só entra em customer room
      // se o customer pertence ao tenant carimbado no handshake. Antes
      // staff de tenant A com UUID alheio (vazado em logs / Mongo dump
      // / migração) recebia complaint.responded / lgpd.request_fulfilled
      // / late_arrival.* / staff_message.received com PII de cliente
      // de outro tenant.
      if (!client.data.staffTenantSlug) {
        client.emit('error', { message: 'Tenant slug missing in handshake.' });
        return;
      }
      const ok = await this.validateCustomerInTenant(data.customerId, client.data.staffTenantSlug);
      if (!ok) {
        client.emit('error', {
          message: 'Cross-tenant customer join blocked.',
        });
        return;
      }
      client.join(`customer:${data.customerId}`);
      this.logger.log(`Staff ${client.id} joined customer room ${data.customerId}`);
      return;
    }
    if (client.data.authType !== 'session' || client.data.customerId !== data.customerId) {
      // Logado server-side de propósito: rejeição silenciosa escondeu o
      // bug do realtime privado por dias (prompt 100 rodada 2).
      this.logger.warn(
        `join:customer rejected for ${client.id}: authType=${client.data.authType} ` +
          `connCustomer=${client.data.customerId ?? 'none'} requested=${data.customerId}`,
      );
      client.emit('error', { message: 'Customer mismatch' });
      return;
    }
    client.join(`customer:${data.customerId}`);
    this.logger.log(`Client ${client.id} joined customer room ${data.customerId}`);
  }

  /**
   * Staff-scoped personal inbox room. Only the authenticated staff member
   * matching `staffId` may join (e.g. host receiving late-arrival approvals,
   * manager receiving complaint escalations).
   */
  @SubscribeMessage('join:staff')
  async handleJoinStaff(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { staffId: string },
  ) {
    await client.data.authReady;
    if (client.data.authType !== 'staff') {
      client.emit('error', { message: 'Staff auth required' });
      return;
    }
    // Round 9 (B-NEW-36): exige staffId carimbado no handshake.
    // Antes o check `staffId && ...` curto-circuitava quando handshake
    // não passou x-staff-id, deixando atacante entrar em qualquer
    // staff:<id> room (inbox alheio em real-time).
    if (!client.data.staffId) {
      client.emit('error', { message: 'WS handshake exige x-staff-id pra join:staff.' });
      return;
    }
    if (client.data.staffId !== data.staffId) {
      client.emit('error', { message: 'Staff id mismatch' });
      return;
    }
    client.join(`staff:${data.staffId}`);
    this.logger.log(`Client ${client.id} joined staff room ${data.staffId}`);
  }

  /**
   * Manager-only inbox. Same constraint as `join:staff`, but additionally
   * checks that the staff role allows managerial visibility (defensive — the
   * primary guard happens in REST endpoints; this is just to keep the room
   * fan-out from leaking to unauthenticated peers).
   */
  @SubscribeMessage('join:manager')
  async handleJoinManager(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { managerId: string },
  ) {
    await client.data.authReady;
    if (client.data.authType !== 'staff') {
      client.emit('error', { message: 'Staff auth required' });
      return;
    }
    // Round 9 (B-NEW-36): mesmo fix do join:staff — exige staffId
    // carimbado, rejeita se ausente OU mismatch.
    if (!client.data.staffId) {
      client.emit('error', { message: 'WS handshake exige x-staff-id pra join:manager.' });
      return;
    }
    if (client.data.staffId !== data.managerId) {
      client.emit('error', { message: 'Manager id mismatch' });
      return;
    }
    client.join(`manager:${data.managerId}`);
    this.logger.log(`Client ${client.id} joined manager room ${data.managerId}`);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Facade emit* → EventsEmitterService (extração 2026-07-04).
  //
  // Os corpos moveram VERBATIM pra events-emitter.service.ts (rooms, wire
  // names e payloads congelados por events-emitter.characterization.test.ts).
  // O gateway mantém TODOS os emit* como delegates de 1 linha porque ~17
  // services (waiter-calls, jobs/ttl-tick, orders, host, ...) injetam
  // EventsGateway SEM @Optional — o token DI e a superfície pública ficam
  // idênticos e nenhum consumidor muda. Novos consumidores podem injetar
  // EventsEmitterService direto.
  // ───────────────────────────────────────────────────────────────────────

  emitOrderStatusUpdate(
    slug: string,
    orderId: string,
    status: string,
    tableLabel?: string,
    extra?: Pick<WsOrderStatus['payload'], 'tableSessionId' | 'changedBy' | 'historyId'>,
  ) {
    return this.emitter.emitOrderStatusUpdate(slug, orderId, status, tableLabel, extra);
  }

  emitNewOrder(slug: string, orderData: Record<string, unknown>) {
    return this.emitter.emitNewOrder(slug, orderData);
  }

  emitOrderReady(slug: string, orderId: string, tableLabel: string) {
    return this.emitter.emitOrderReady(slug, orderId, tableLabel);
  }

  emitOrderClaimed(
    slug: string,
    orderId: string,
    claimedBy: string,
    extra?: Pick<WsOrderClaimed['payload'], 'tableSessionId' | 'tableLabel' | 'deliveryId'>,
  ) {
    return this.emitter.emitOrderClaimed(slug, orderId, claimedBy, extra);
  }

  emitOrderHandoffCalled(
    slug: string,
    data: {
      orderId: string;
      deliveryId: string;
      tableLabel: string;
      tableCode: string;
      zoneName?: string | null;
      targetWaiterId: string | null;
      targetWaiterName?: string | null;
      tableSessionId?: string;
      calledBy?: string | null;
    },
  ) {
    return this.emitter.emitOrderHandoffCalled(slug, data);
  }

  emitKitchenReorder(
    slug: string,
    data: { orderIds: string[]; reason?: string | null; requestedBy?: string | null },
  ) {
    return this.emitter.emitKitchenReorder(slug, data);
  }

  emitKitchenPriorityRequest(
    slug: string,
    data: {
      requestId: string;
      orderIds: string[];
      reason?: string | null;
      requestedBy?: string | null;
    },
  ) {
    return this.emitter.emitKitchenPriorityRequest(slug, data);
  }

  emitKitchenPriorityResponse(
    slug: string,
    data: {
      requestId: string;
      orderIds: string[];
      status: 'accepted' | 'next';
      protectedOrderIds?: string[];
      respondedBy?: string | null;
    },
  ) {
    return this.emitter.emitKitchenPriorityResponse(slug, data);
  }

  emitHostAssistRequested(
    slug: string,
    data: {
      tableLabel: string | null;
      tableCode: string | null;
      tableSessionId: string;
      reason?: string | null;
    },
  ) {
    return this.emitter.emitHostAssistRequested(slug, data);
  }

  emitWaiterCall(
    slug: string,
    callData: {
      callId: string;
      tableLabel: string;
      tableCode: string;
      reason?: string;
      tableSessionId?: string;
      customerId?: string | null;
    },
  ) {
    return this.emitter.emitWaiterCall(slug, callData);
  }

  emitWaiterCallAcknowledged(
    slug: string,
    callId: string,
    sessionId: string,
    extra?: Pick<WsWaiterAcknowledged['payload'], 'acknowledgedBy' | 'etaMinutes'>,
  ) {
    return this.emitter.emitWaiterCallAcknowledged(slug, callId, sessionId, extra);
  }

  emitWaiterCallResolved(slug: string, callId: string, sessionId: string) {
    return this.emitter.emitWaiterCallResolved(slug, callId, sessionId);
  }

  emitToSession(sessionId: string, event: string, data: unknown) {
    return this.emitter.emitToSession(sessionId, event, data);
  }

  emitToCustomer(customerId: string, event: string, data: unknown) {
    return this.emitter.emitToCustomer(customerId, event, data);
  }

  emitToTenant(slug: string, event: string, data: unknown) {
    return this.emitter.emitToTenant(slug, event, data);
  }

  emitEscalationCreated(
    slug: string,
    assigneeStaffId: string | null,
    payload: WsEscalationCreated['payload'],
  ) {
    return this.emitter.emitEscalationCreated(slug, assigneeStaffId, payload);
  }

  emitEscalationAdvanced(
    slug: string,
    fromStaffId: string | null,
    toStaffId: string | null,
    payload: WsEscalationAdvanced['payload'],
  ) {
    return this.emitter.emitEscalationAdvanced(slug, fromStaffId, toStaffId, payload);
  }

  emitEscalationCompleted(
    slug: string,
    customerId: string | null,
    payload: WsEscalationCompleted['payload'],
  ) {
    return this.emitter.emitEscalationCompleted(slug, customerId, payload);
  }

  emitLateArrivalCreated(
    slug: string,
    hostCustomerId: string | null,
    payload: WsLateArrivalCreated['payload'],
  ) {
    return this.emitter.emitLateArrivalCreated(slug, hostCustomerId, payload);
  }

  emitLateArrivalApproved(slug: string, payload: WsLateArrivalApproved['payload']) {
    return this.emitter.emitLateArrivalApproved(slug, payload);
  }

  emitLateArrivalRejected(slug: string, payload: WsLateArrivalRejected['payload']) {
    return this.emitter.emitLateArrivalRejected(slug, payload);
  }

  emitLateArrivalExpired(
    slug: string,
    requesterCustomerId: string | null,
    payload: WsLateArrivalExpired['payload'],
  ) {
    return this.emitter.emitLateArrivalExpired(slug, requesterCustomerId, payload);
  }

  emitScanVerificationCreated(slug: string, payload: WsScanVerificationCreated['payload']) {
    return this.emitter.emitScanVerificationCreated(slug, payload);
  }

  emitScanVerificationEscalated(
    slug: string,
    assigneeRole: 'host' | 'manager' | 'waiter',
    payload: WsScanVerificationEscalated['payload'],
  ) {
    return this.emitter.emitScanVerificationEscalated(slug, assigneeRole, payload);
  }

  emitScanVerificationResolved(slug: string, payload: WsScanVerificationResolved['payload']) {
    return this.emitter.emitScanVerificationResolved(slug, payload);
  }

  emitTableMergeCreated(
    slug: string,
    originCustomerId: string,
    targetCustomerId: string | null,
    payload: WsTableMergeCreated['payload'],
  ) {
    return this.emitter.emitTableMergeCreated(slug, originCustomerId, targetCustomerId, payload);
  }

  emitTableMergeApproved(
    slug: string,
    originSessionId: string,
    targetSessionId: string,
    payload: WsTableMergeApproved['payload'],
  ) {
    return this.emitter.emitTableMergeApproved(slug, originSessionId, targetSessionId, payload);
  }

  emitTableMergeRejected(
    slug: string,
    originSessionId: string,
    targetSessionId: string,
    payload: WsTableMergeRejected['payload'],
  ) {
    return this.emitter.emitTableMergeRejected(slug, originSessionId, targetSessionId, payload);
  }

  emitMergeCooldownStarted(
    slug: string,
    originSessionId: string,
    targetSessionId: string,
    payload: WsMergeCooldownStarted['payload'],
  ) {
    return this.emitter.emitMergeCooldownStarted(slug, originSessionId, targetSessionId, payload);
  }

  emitMergeCooldownExpired(slug: string, payload: WsMergeCooldownExpired['payload']) {
    return this.emitter.emitMergeCooldownExpired(slug, payload);
  }

  emitLgpdRequestFulfilled(slug: string, payload: WsLgpdRequestFulfilled['payload']) {
    return this.emitter.emitLgpdRequestFulfilled(slug, payload);
  }

  emitLgpdFulfilled(slug: string, customerId: string, protocolNumber: string, requestId?: string) {
    return this.emitter.emitLgpdFulfilled(slug, customerId, protocolNumber, requestId);
  }

  emitComplaintReceived(
    slug: string,
    assignedManagerId: string | null,
    payload: WsComplaintReceived['payload'],
  ) {
    return this.emitter.emitComplaintReceived(slug, assignedManagerId, payload);
  }

  emitComplaintResponded(
    slug: string,
    customerId: string,
    payload: WsComplaintResponded['payload'],
  ) {
    return this.emitter.emitComplaintResponded(slug, customerId, payload);
  }

  emitComplaintRead(slug: string, managerId: string | null, payload: WsComplaintRead['payload']) {
    return this.emitter.emitComplaintRead(slug, managerId, payload);
  }

  emitComplaintResolved(
    slug: string,
    customerId: string | null,
    payload: WsComplaintResolved['payload'],
  ) {
    return this.emitter.emitComplaintResolved(slug, customerId, payload);
  }

  emitStaffMessageReceived(
    slug: string,
    customerId: string,
    staffId: string | null,
    payload: WsStaffMessageReceived['payload'],
  ) {
    return this.emitter.emitStaffMessageReceived(slug, customerId, staffId, payload);
  }

  emitStaffThreadMessageReceived(
    _slug: string,
    staffIds: string[],
    payload: WsStaffMessageReceived['payload'],
  ) {
    return this.emitter.emitStaffThreadMessageReceived(_slug, staffIds, payload);
  }

  emitStaffMessageRead(slug: string, payload: WsStaffMessageRead['payload']) {
    return this.emitter.emitStaffMessageRead(slug, payload);
  }

  emitCourtesyCreated(slug: string, payload: WsCourtesyCreated['payload']) {
    return this.emitter.emitCourtesyCreated(slug, payload);
  }

  emitCourtesyUpdated(slug: string, payload: WsCourtesyUpdated['payload']) {
    return this.emitter.emitCourtesyUpdated(slug, payload);
  }

  emitPaymentConfirmed(slug: string, payload: WsPaymentConfirmed['payload']) {
    return this.emitter.emitPaymentConfirmed(slug, payload);
  }

  emitZonePauseStarted(slug: string, payload: WsZonePauseStarted['payload']) {
    return this.emitter.emitZonePauseStarted(slug, payload);
  }

  emitZonePauseEnded(slug: string, payload: WsZonePauseEnded['payload']) {
    return this.emitter.emitZonePauseEnded(slug, payload);
  }

  emitSessionFlagChanged(slug: string, payload: WsSessionFlagChanged['payload']) {
    return this.emitter.emitSessionFlagChanged(slug, payload);
  }

  emitHostTableLiberated(slug: string, payload: WsHostTableLiberated['payload']) {
    return this.emitter.emitHostTableLiberated(slug, payload);
  }

  emitHostSwapRequested(slug: string, payload: WsHostSwapRequested['payload']) {
    return this.emitter.emitHostSwapRequested(slug, payload);
  }

  emitHostSwapStateChanged(slug: string, payload: WsHostSwapStateChanged['payload']) {
    return this.emitter.emitHostSwapStateChanged(slug, payload);
  }

  emitHostVipFlagged(slug: string, payload: WsHostVipFlagged['payload']) {
    return this.emitter.emitHostVipFlagged(slug, payload);
  }

  emitAlertCreated(slug: string, alert: Record<string, unknown>) {
    return this.emitter.emitAlertCreated(slug, alert);
  }
}
